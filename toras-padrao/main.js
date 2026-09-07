const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
require('dotenv').config();
const crypto = require('crypto');
const { machineIdSync } = require('node-machine-id');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { autoUpdater } = require("electron-updater");
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const _s = [84, 79, 82, 65, 83, 50, 48, 50, 54]; // TORAS2026
const MEU_SEGREDO = process.env.APP_SECRET || String.fromCharCode(..._s);

function criptografar(texto) {
    const key = crypto.createHash('sha256').update(MEU_SEGREDO).digest();
    const iv = crypto.createHash('md5').update(MEU_SEGREDO).digest();
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let crypted = cipher.update(texto, 'utf8', 'hex');
    crypted += cipher.final('hex');
    return crypted;
}

function descriptografar(texto) {
    try {
        const key = crypto.createHash('sha256').update(MEU_SEGREDO).digest();
        const iv = crypto.createHash('md5').update(MEU_SEGREDO).digest();
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let dec = decipher.update(texto, 'hex', 'utf8');
        dec += decipher.final('utf8');
        return dec;
    } catch (e) {
        // FALLBACK: Tenta descriptografar usando o método antigo depreciado
        try {
            const decipher = crypto.createDecipher('aes-256-cbc', MEU_SEGREDO);
            let dec = decipher.update(texto, 'hex', 'utf8');
            dec += decipher.final('utf8');
            return dec;
        } catch (errFallback) {
            return null;
        }
    }
}

function parseRomaneioParaOrdenacao(valor) {
    if (!valor) return null;
    let s = valor.toString().trim().toUpperCase();

    // Tenta casar (ROM-)?(número)/(ano)
    const match = s.match(/^(?:ROM-)?(\d+)\/(\d{4})$/i);
    if (match) {
        const numSeq = parseInt(match[1], 10);
        const ano = parseInt(match[2], 10);
        return ano * 100000 + numSeq;
    }

    // Tenta casar apenas um número sequencial (ex: "5" ou "05"), assumindo o ano atual
    const matchSimples = s.match(/^(?:ROM-)?(\d+)$/i);
    if (matchSimples) {
        const numSeq = parseInt(matchSimples[1], 10);
        const ano = new Date().getFullYear();
        return ano * 100000 + numSeq;
    }

    return null;
}

// --- CONFIGURAÇÃO NUVEM ---
const supabaseUrl = process.env.SUPABASE_URL || 'https://hmuxkqtgyyglafqlqggv.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'sb_publishable_G--VZElf06QOrBbxIFKvhA_GE1eOJwI';
const supabase = createClient(supabaseUrl, supabaseKey, {
    realtime: {
        transport: ws,
    },
});

// --- SEGURANÇA E ATIVAÇÃO ---
let sistemaAtivado = false;
let machineId = '';

let motivoBloqueio = 'unactivated'; // Pode ser 'unactivated', 'expired', 'fraud' ou 'ok'

async function verificarLicencaLocal() {
    const appData = app.getPath('userData');
    const pastaBase = path.join(appData, 'estoque-toras');
    const arquivoLicenca = path.join(pastaBase, 'license.dat');

    if (fs.existsSync(arquivoLicenca)) {
        try {
            const conteudoCriptografado = fs.readFileSync(arquivoLicenca, 'utf-8');
            let conteudoJson = descriptografar(conteudoCriptografado);

            // MIGRACAO: Se falhou a descriptografia, tenta ler como Base64 (formato antigo)
            if (!conteudoJson) {
                try {
                    const decBase64 = Buffer.from(conteudoCriptografado, 'base64').toString();
                    if (decBase64.includes('"mid":')) {
                        conteudoJson = decBase64;
                        console.log("♻️ Formato de licença legado detectado. Migrando para novo padrão...");
                    }
                } catch (e) { }
            }

            if (!conteudoJson) {
                sistemaAtivado = false;
                motivoBloqueio = 'unactivated';
                return false;
            }

            const licenca = JSON.parse(conteudoJson);
            machineId = machineIdSync();

            // 1. Verifica ID da Máquina
            if (licenca.mid !== machineId) {
                console.error("Máquina não autorizada.");
                sistemaAtivado = false;
                motivoBloqueio = 'unactivated';
                return false;
            }

            const agora = new Date();
            const exp = new Date(licenca.exp);
            const lastSeen = licenca.last_seen ? new Date(licenca.last_seen) : null;

            // 2. Verifica Expiração
            if (agora > exp) {
                console.error(`Licença expirada em: ${licenca.exp}`);
                sistemaAtivado = false;
                motivoBloqueio = 'expired';
                return false;
            }

            // 3. ANTI-FRAUDE OFFLINE: Verifica se o relógio foi retrocedido comparando com o arquivo
            if (lastSeen && agora < lastSeen) {
                console.error("🚨 FRAUDE DETECTADA: Relógio retrocedido (visto no arquivo)!");
                sistemaAtivado = false;
                motivoBloqueio = 'fraud';
                return false;
            }

            // 4. ANTI-FRAUDE DB: Verifica também contra o último log do banco
            const ultimoLog = db.prepare("SELECT data_hora FROM logs ORDER BY data_hora DESC LIMIT 1").get();
            if (ultimoLog) {
                const dataUltimoLog = new Date(ultimoLog.data_hora);
                if (agora < dataUltimoLog) {
                    console.error("🚨 FRAUDE DETECTADA: Relógio retrocedido (visto no banco)!");
                    sistemaAtivado = false;
                    motivoBloqueio = 'fraud';
                    return false;
                }
            }

            // Se passou em tudo, ATUALIZA o 'last_seen' no arquivo para a próxima vez
            licenca.last_seen = agora.toISOString();
            fs.writeFileSync(arquivoLicenca, criptografar(JSON.stringify(licenca)));

            sistemaAtivado = true;
            motivoBloqueio = 'ok';
            return true;

        } catch (err) {
            console.error("Erro ao ler licença:", err);
            sistemaAtivado = false;
            motivoBloqueio = 'unactivated';
            return false;
        }
    }
    sistemaAtivado = false;
    motivoBloqueio = 'unactivated';
    return false;
}

// Wrapper para proteger IPC Handlers
function protectedHandle(channel, callback) {
    ipcMain.handle(channel, async (event, ...args) => {
        if (!sistemaAtivado) {
            console.warn(`Tentativa de acesso ao canal protegido '${channel}' sem ativação.`);
            return { success: false, error: "Sistema não ativado. Por favor, insira a chave de licença." };
        }
        return callback(event, ...args);
    });
}

let mainWindow;
let splash;

// --- CONFIGURAÇÃO DO BANCO DE DADOS ---
const dbPath = path.join(app.getPath('userData'), 'toracontroll.db');
const db = new Database(dbPath);

// Desativa chaves estrangeiras temporariamente para rodar as migrações com segurança
db.pragma('foreign_keys = OFF');

function columnExists(table, column) {
    try {
        const info = db.prepare(`PRAGMA table_info(${table})`).all();
        return info.some(col => col.name === column);
    } catch (e) {
        return false;
    }
}

// Arquivo de configuração de backup
const configPath = path.join(app.getPath('userData'), 'backup-config.json');

function carregarConfigBackup() {
    try {
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf8');

            return JSON.parse(data);
        }
    } catch (e) {
        console.error("❌ Erro ao carregar backup-config.json:", e.message);
    }
    return { ativo: false, horarios: [], pasta: '' };
}

function salvarConfigBackup(config) {
    try {
        const pastaConfig = path.dirname(configPath);
        if (!fs.existsSync(pastaConfig)) {
            fs.mkdirSync(pastaConfig, { recursive: true });
        }
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log("✅ Configuração de backup salva com sucesso em:", configPath);
        return true;
    } catch (err) {
        console.error("❌ Erro ao salvar backup-config.json:", err.message);
        return false;
    }
}

// --- ESTRUTURA DO BANCO (Garantindo Schema completo) ---
db.exec(`
    CREATE TABLE IF NOT EXISTS especies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        cientifico TEXT
    );

    CREATE TABLE IF NOT EXISTS lotes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero TEXT UNIQUE NOT NULL, -- Número do Lote [cite: 2026-01-17]
        descricao TEXT,
        data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
        sync_status TEXT DEFAULT 'pending',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS fornecedores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS motoristas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        cpf TEXT,
        cnh TEXT,
        placa_veiculo TEXT,
        telefone TEXT,
        comissao REAL DEFAULT 0,
        salario REAL DEFAULT 0,
        data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
        usuario TEXT,
        acao TEXT,
        descricao TEXT
    );

    CREATE TABLE IF NOT EXISTS usuarios (
        email TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL,
        password_salt TEXT,
        last_login DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS romaneios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero TEXT UNIQUE NOT NULL,   -- Número do Romaneio
        data TEXT NOT NULL,            -- YYYY-MM-DD
        fornecedor TEXT,
        motorista TEXT,
        observacoes TEXT,
        fornecedor_id INTEGER,
        motorista_id INTEGER,
        frete_valor REAL DEFAULT 0,
        frete_total REAL DEFAULT 0,
        data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
        sync_status TEXT DEFAULT 'pending',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id),
        FOREIGN KEY (motorista_id) REFERENCES motoristas(id)
    );

    CREATE TABLE IF NOT EXISTS toras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE,          -- Número da Tora [cite: 2026-01-17]
        especie_id INTEGER,
        lote_id INTEGER,
        romaneio_id INTEGER,
        rodo INTEGER,                -- Circunferência em cm
        comprimento REAL,            -- Metros
        desconto_1 INTEGER DEFAULT 0, -- Oco Medida 1
        desconto_2 INTEGER DEFAULT 0, -- Oco Medida 2
        total_desconto REAL,         -- Volume do oco (m3)
        volume REAL,                 -- Volume Líquido Final (m3)
        volume_bruto REAL DEFAULT 0,
        rodo_bruto INTEGER DEFAULT 0,
        comprimento_bruto REAL DEFAULT 0,
        status TEXT DEFAULT 'pátio',
        data_entrada DATETIME DEFAULT CURRENT_TIMESTAMP,
        data_saida TEXT,
        sync_status TEXT DEFAULT 'pending',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (especie_id) REFERENCES especies(id),
        FOREIGN KEY (lote_id) REFERENCES lotes(id),
        FOREIGN KEY (romaneio_id) REFERENCES romaneios(id)
    );

    CREATE TABLE IF NOT EXISTS motorista_fechamentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        motorista_id INTEGER NOT NULL,
        data_fechamento TEXT NOT NULL,
        periodo_inicio TEXT NOT NULL,
        periodo_fim TEXT NOT NULL,
        romaneio_inicio TEXT,
        romaneio_fim TEXT,
        valor_salario REAL NOT NULL,
        valor_comissao REAL NOT NULL,
        valor_vales REAL NOT NULL,
        valor_liquido REAL NOT NULL,
        observacoes TEXT,
        data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
        sync_status TEXT DEFAULT 'pending',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (motorista_id) REFERENCES motoristas(id)
    );

    CREATE TABLE IF NOT EXISTS motorista_vales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        motorista_id INTEGER NOT NULL,
        valor REAL NOT NULL,
        data TEXT NOT NULL,
        descricao TEXT,
        status TEXT DEFAULT 'aberto',
        fechamento_id INTEGER,
        data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
        sync_status TEXT DEFAULT 'pending',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (motorista_id) REFERENCES motoristas(id),
        FOREIGN KEY (fechamento_id) REFERENCES motorista_fechamentos(id)
    );

    CREATE INDEX IF NOT EXISTS idx_toras_codigo ON toras(codigo);
    CREATE INDEX IF NOT EXISTS idx_toras_lote ON toras(lote_id);
    CREATE INDEX IF NOT EXISTS idx_logs_data ON logs(data_hora);
    CREATE INDEX IF NOT EXISTS idx_toras_especie ON toras(especie_id);
    CREATE INDEX IF NOT EXISTS idx_motorista_vales_motorista ON motorista_vales(motorista_id);
    CREATE INDEX IF NOT EXISTS idx_motorista_fechamentos_motorista ON motorista_fechamentos(motorista_id);
`);

// Migrações para adaptar o banco anterior ao novo modelo de cubagem
try { db.exec("ALTER TABLE toras ADD COLUMN rodo INTEGER;"); } catch (e) { }
try { db.exec("ALTER TABLE toras ADD COLUMN desconto_1 INTEGER DEFAULT 0;"); } catch (e) { }
try { db.exec("ALTER TABLE toras ADD COLUMN desconto_2 INTEGER DEFAULT 0;"); } catch (e) { }
try { db.exec("ALTER TABLE toras ADD COLUMN total_desconto REAL DEFAULT 0;"); } catch (e) { }
try { db.exec("ALTER TABLE toras ADD COLUMN status TEXT DEFAULT 'pátio';"); } catch (e) { }
try { db.exec("ALTER TABLE toras ADD COLUMN data_saida TEXT;"); } catch (e) { }
try { db.exec("ALTER TABLE toras ADD COLUMN volume_bruto REAL DEFAULT 0;"); } catch (e) { }
try { db.exec("ALTER TABLE toras ADD COLUMN rodo_bruto INTEGER DEFAULT 0;"); } catch (e) { }
try { db.exec("ALTER TABLE toras ADD COLUMN comprimento_bruto REAL DEFAULT 0;"); } catch (e) { }

// Criação de índices para colunas de toras recém-adicionadas
try { db.exec("CREATE INDEX IF NOT EXISTS idx_toras_status ON toras(status);"); } catch (e) { }
// Migração: vinculação de toras a romaneios
if (!columnExists('toras', 'romaneio_id')) {
    try {
        db.exec("ALTER TABLE toras ADD COLUMN romaneio_id INTEGER REFERENCES romaneios(id);");
    } catch (e) {
        console.error("Erro ao adicionar romaneio_id com FOREIGN KEY:", e.message);
        try {
            db.exec("ALTER TABLE toras ADD COLUMN romaneio_id INTEGER;");
            console.log("Fallback aplicado: coluna romaneio_id criada sem FK constraint.");
        } catch (err2) {
            console.error("Erro crítico ao criar romaneio_id:", err2.message);
        }
    }
}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_toras_romaneio ON toras(romaneio_id);"); } catch (e) { }
try { db.exec("ALTER TABLE romaneios ADD COLUMN fornecedor_id INTEGER REFERENCES fornecedores(id);"); } catch (e) { }
try { db.exec("ALTER TABLE romaneios ADD COLUMN motorista_id INTEGER REFERENCES motoristas(id);"); } catch (e) { }
try { db.exec("ALTER TABLE romaneios ADD COLUMN frete_valor REAL DEFAULT 0;"); } catch (e) { }
try { db.exec("ALTER TABLE romaneios ADD COLUMN frete_total REAL DEFAULT 0;"); } catch (e) { }

// Criação de índices para colunas de romaneios recém-adicionadas
try { db.exec("CREATE INDEX IF NOT EXISTS idx_romaneios_fornecedor ON romaneios(fornecedor_id);"); } catch (e) { }
try { db.exec("CREATE INDEX IF NOT EXISTS idx_romaneios_motorista ON romaneios(motorista_id);"); } catch (e) { }

// Migrações para suporte a Sincronização em Nuvem (Cloud Sync)
try { db.exec("ALTER TABLE toras ADD COLUMN sync_status TEXT DEFAULT 'pending';"); } catch (e) { }
try { db.exec("ALTER TABLE toras ADD COLUMN updated_at DATETIME;"); } catch (e) { }
try { db.exec("UPDATE toras SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;"); } catch (e) { }
try { db.exec("ALTER TABLE lotes ADD COLUMN sync_status TEXT DEFAULT 'pending';"); } catch (e) { }
try { db.exec("ALTER TABLE lotes ADD COLUMN updated_at DATETIME;"); } catch (e) { }
try { db.exec("UPDATE lotes SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;"); } catch (e) { }
try { db.exec("ALTER TABLE romaneios ADD COLUMN sync_status TEXT DEFAULT 'pending';"); } catch (e) { }
try { db.exec("ALTER TABLE romaneios ADD COLUMN updated_at DATETIME;"); } catch (e) { }
try { db.exec("UPDATE romaneios SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;"); } catch (e) { }

// Migrações para senha com criptografia forte (PBKDF2)
try { db.exec("ALTER TABLE usuarios ADD COLUMN password_salt TEXT;"); } catch (e) { }

// Reativa chaves estrangeiras após a conclusão de todas as migrações
db.pragma('foreign_keys = ON');

// --- JANELA PRINCIPAL COM TRAVAS DE PRODUÇÃO ---
const packageInfo = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 800,
        title: `${packageInfo.productName || "MT - PRO Estoque de Toras"} - v${packageInfo.version || "1.0.0"}`,
        show: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            devTools: false
        }
    });

    mainWindow.maximize();
    mainWindow.setMenu(null); // Layout limpo conforme solicitado [cite: 2026-01-16]
    mainWindow.loadFile('index.html');
    setupAutoUpdater(mainWindow);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Opcional: Impedir que o site mude o título (alguns HTMLs sobrescrevem o título)
    mainWindow.on('page-title-updated', (evt) => {
        evt.preventDefault();
    });
    // 2. Bloqueio completo de atalhos de desenvolvedor (F5, Ctrl+R, F12, Ctrl+Shift+I)
    mainWindow.webContents.on('before-input-event', (event, input) => {
        const isControlOrCommand = input.control || input.meta;
        const key = input.key.toLowerCase();

        if (input.type === 'keyDown') {
            // Bloqueia recarregamento (F5 / Ctrl+R)
            if (key === 'f5' || (isControlOrCommand && key === 'r')) {
                event.preventDefault();
            }
            // Bloqueia abertura de DevTools (F12 / Ctrl+Shift+I)
            if (key === 'f12' || (isControlOrCommand && input.shift && key === 'i')) {
                event.preventDefault();
            }
        }
    });

    if (app.isPackaged) {
        mainWindow.webContents.on('devtools-opened', () => mainWindow.webContents.closeDevTools());
    }
}

// Configuração de logs para o Updater (útil para debug se algo falhar)
autoUpdater.logger = require("electron-log");
autoUpdater.logger.transports.file.level = "info";

function setupAutoUpdater(window) {
    // Verifica se há atualizações assim que o app inicia
    autoUpdater.checkForUpdatesAndNotify();

    // Evento disparado quando uma atualização é encontrada
    autoUpdater.on('update-available', () => {
        window.webContents.send('status-atualizacao', 'Nova versão encontrada. Baixando...');
    });

    // Evento disparado quando o download termina
    autoUpdater.on('update-downloaded', (info) => {
        dialog.showMessageBox({
            type: 'info',
            title: 'Atualização Pronta',
            message: `A versão ${info.version} foi baixada. Deseja reiniciar para atualizar agora?`,
            buttons: ['Sim, reiniciar', 'Depois']
        }).then((result) => {
            if (result.response === 0) {
                autoUpdater.quitAndInstall();
            }
        });
    });

    // Tratar erros (importante para não travar o app se o GitHub estiver fora)
    autoUpdater.on('error', (err) => {
        console.error("Erro no Updater: ", err);
    });
}

// --- LÓGICA DE BACKUP AGENDADO ---
let ultimoBackupExecutado = ''; // Evita duplicar no mesmo minuto

function verificarBackupAgendado() {
    setInterval(() => {
        const config = carregarConfigBackup();
        if (!config.ativo || !config.pasta || !config.horarios || config.horarios.length === 0) return;

        const agora = new Date();
        const horaMinuto = agora.getHours().toString().padStart(2, '0') + ':' +
            agora.getMinutes().toString().padStart(2, '0');

        // Se a hora atual está na lista e ainda não rodamos este minuto
        if (config.horarios.includes(horaMinuto) && ultimoBackupExecutado !== horaMinuto) {
            executarBackupAutomatico(config.pasta, horaMinuto);
            ultimoBackupExecutado = horaMinuto;
        }
    }, 30000); // Verifica a cada 30 segundos para maior precisão
}

async function executarBackupAutomatico(pastaDestino, hora) {
    try {
        if (!fs.existsSync(pastaDestino)) {
            console.error("Pasta de backup não encontrada:", pastaDestino);
            return;
        }

        const data = new Date().toISOString().split('T')[0];
        const nomeArquivo = `backup_toras_${data}_${hora.replace(':', '-')}.db`;
        const caminhoFinal = path.join(pastaDestino, nomeArquivo);

        // Backup a quente usando better-sqlite3 (não trava o banco)
        await db.backup(caminhoFinal);

        registrarLog('Sistema', 'BACKUP AUTO', `Cópia de segurança gerada automaticamente em: ${nomeArquivo}`);
        console.log(`Backup automático realizado: ${caminhoFinal}`);
    } catch (err) {
        console.error("Erro no backup automático:", err);
        registrarLog('Sistema', 'ERRO BACKUP', `Falha no backup automático: ${err.message}`);
    }
}

// --- LÓGICA DE SINCRONIZAÇÃO EM SEGUNDO PLANO (CLOUD SYNC ENGINE) ---
async function sincronizarDadosPendentes() {
    try {
        const session = await supabase.auth.getSession();
        if (!session || !session.data || !session.data.session) {
            return;
        }

        // 1. Sincroniza Lotes
        const lotesPendentes = db.prepare("SELECT * FROM lotes WHERE sync_status = 'pending' LIMIT 50").all();
        if (lotesPendentes.length > 0) {
            console.log(`📡 [SYNC] Sincronizando ${lotesPendentes.length} lotes com a Nuvem...`);
            const payload = lotesPendentes.map(l => ({
                id: l.id,
                numero: l.numero,
                descricao: l.descricao,
                data_criacao: l.data_criacao
            }));
            const { error } = await supabase.from('lotes').upsert(payload);
            if (!error) {
                const stmt = db.prepare("UPDATE lotes SET sync_status = 'synced' WHERE id = ?");
                lotesPendentes.forEach(l => stmt.run(l.id));
            } else {
                throw new Error("Erro Lotes: " + error.message);
            }
        }

        // 2. Sincroniza Romaneios
        const romaneiosPendentes = db.prepare("SELECT * FROM romaneios WHERE sync_status = 'pending' LIMIT 50").all();
        if (romaneiosPendentes.length > 0) {
            console.log(`📡 [SYNC] Sincronizando ${romaneiosPendentes.length} romaneios com a Nuvem...`);
            const payload = romaneiosPendentes.map(r => ({
                id: r.id,
                numero: r.numero,
                data: r.data,
                fornecedor: r.fornecedor,
                motorista: r.motorista,
                observacoes: r.observacoes,
                data_criacao: r.data_criacao,
                fornecedor_id: r.fornecedor_id,
                motorista_id: r.motorista_id,
                frete_valor: r.frete_valor,
                frete_total: r.frete_total
            }));
            const { error } = await supabase.from('romaneios').upsert(payload);
            if (!error) {
                const stmt = db.prepare("UPDATE romaneios SET sync_status = 'synced' WHERE id = ?");
                romaneiosPendentes.forEach(r => stmt.run(r.id));
            } else {
                throw new Error("Erro Romaneios: " + error.message);
            }
        }

        // 3. Sincroniza Toras
        const torasPendentes = db.prepare("SELECT * FROM toras WHERE sync_status = 'pending' LIMIT 100").all();
        if (torasPendentes.length > 0) {
            console.log(`📡 [SYNC] Sincronizando ${torasPendentes.length} toras com a Nuvem...`);
            const payload = torasPendentes.map(t => ({
                id: t.id,
                codigo: t.codigo,
                especie_id: t.especie_id,
                lote_id: t.lote_id,
                rodo: t.rodo,
                comprimento: t.comprimento,
                desconto_1: t.desconto_1,
                desconto_2: t.desconto_2,
                total_desconto: t.total_desconto,
                volume: t.volume,
                status: t.status,
                data_entrada: t.data_entrada,
                data_saida: t.data_saida,
                volume_bruto: t.volume_bruto,
                rodo_bruto: t.rodo_bruto,
                comprimento_bruto: t.comprimento_bruto,
                romaneio_id: t.romaneio_id
            }));
            const { error } = await supabase.from('toras').upsert(payload);
            if (!error) {
                const stmt = db.prepare("UPDATE toras SET sync_status = 'synced' WHERE id = ?");
                torasPendentes.forEach(t => stmt.run(t.id));
            } else {
                throw new Error("Erro Toras: " + error.message);
            }
        }
    } catch (err) {
        console.warn("⚠️ [SYNC] Falha ao sincronizar dados com a Nuvem:", err.message);
    }
}

function iniciarSincronizacaoNuvem() {
    // Sincroniza imediatamente após a inicialização e a cada 5 minutos
    setTimeout(sincronizarDadosPendentes, 5000);
    setInterval(sincronizarDadosPendentes, 300000);
}

app.whenReady().then(async () => {
    machineId = machineIdSync();
    console.log("=========================================");
    console.log("🚀 SISTEMA INICIADO");
    console.log("💻 MACHINE ID DESTE PC:", machineId);
    console.log("=========================================");

    await verificarLicencaLocal();
    createWindow();
    verificarBackupAgendado();
    iniciarSincronizacaoNuvem();
});

// --- HELPERS DE SISTEMA ---
function obterDataLocal() {
    const agora = new Date();
    const offset = agora.getTimezoneOffset() * 60000;
    return (new Date(agora - offset)).toISOString().slice(0, 19).replace('T', ' ');
}

// Auxiliar para gerar hash de senha legado (segurança offline)
function hashPasswordLegacy(password) {
    return crypto.createHash('sha256').update(password + MEU_SEGREDO).digest('hex');
}

// Novo auxiliar PBKDF2 com salt dinâmico (criptografia forte)
function hashPasswordPbkdf2(password, salt) {
    const derivedKey = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512');
    return derivedKey.toString('hex');
}


function registrarLog(usuario, acao, descricao) {
    try {
        const stmt = db.prepare(`INSERT INTO logs (usuario, acao, descricao, data_hora) VALUES (?, ?, ?, ?)`);
        stmt.run(usuario, acao, descricao, obterDataLocal());
    } catch (err) { console.error("Erro ao registrar log:", err); }
}

// --- HANDLERS: ESPÉCIES (Somente Leitura e Sincronização) ---
protectedHandle('listar-especies', async () => {
    return db.prepare("SELECT * FROM especies ORDER BY nome").all();
});

// Alias para compatibilidade com versões anteriores/outros renderers
protectedHandle('get-especies', async () => {
    return db.prepare("SELECT * FROM especies ORDER BY nome").all();
});

// NOVO: Sincronização de Espécies (Bulk Upsert da Nuvem)
protectedHandle('sync-especies-local', async (event, especies) => {
    try {
        const insert = db.prepare(`
            INSERT INTO especies (id, nome, cientifico) 
            VALUES (@id, @nome, @cientifico)
            ON CONFLICT(id) DO UPDATE SET 
                nome = excluded.nome, 
                cientifico = excluded.cientifico
        `);

        const transaction = db.transaction((list) => {
            for (const esp of list) {
                insert.run({
                    id: esp.id,
                    nome: esp.nome,
                    cientifico: esp.cientifico || null
                });
            }
        });

        transaction(especies);
        registrarLog('Sistema', 'SYNC', `Sincronizadas ${especies.length} espécies da Nuvem.`);
        return { success: true };
    } catch (err) {
        console.error("Erro na sincronização:", err);
        return { success: false, error: err.message };
    }
});

// --- HANDLERS: LOTES ---
protectedHandle('get-lotes', async () => db.prepare("SELECT * FROM lotes ORDER BY numero").all());
protectedHandle('listar-lotes', async () => {
    return db.prepare(`
        SELECT l.*, COUNT(t.id) as total_toras, IFNULL(SUM(t.volume), 0) as volume_total
        FROM lotes l LEFT JOIN toras t ON l.id = t.lote_id AND t.status = 'pátio'
        GROUP BY l.id ORDER BY l.numero DESC
    `).all();
});
protectedHandle('salvar-lote', async (e, d) => {
    const res = db.prepare('INSERT INTO lotes (numero, descricao, sync_status, updated_at) VALUES (?, ?, \'pending\', CURRENT_TIMESTAMP)').run(d.numero, d.descricao);
    registrarLog('Operador', 'Cadastro', `Lote Nome: ${d.numero} criado.`);
    return { success: true, id: res.lastInsertRowid };
});
protectedHandle('editar-lote', async (e, data) => {
    try {
        const res = db.prepare('UPDATE lotes SET numero = ?, descricao = ?, sync_status = \'pending\', updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(data.numero, data.descricao, data.id);
        // LOG ADICIONADO
        registrarLog('Operador', 'Edição', `Lote Nome: ${data.numero} atualizado.`);
        return { success: true, changes: res.changes };
    } catch (error) {
        console.error("Erro ao editar lote:", error);
        return { success: false, error: error.message };
    }
});

protectedHandle('excluir-lote', async (e, id) => {
    const check = db.prepare('SELECT COUNT(*) as count FROM toras WHERE lote_id = ?').get(id);
    if (check.count > 0) {
        throw new Error(`Não é possível excluir: o lote contém ${check.count} toras cadastradas.`);
    }
    const lote = db.prepare('SELECT numero FROM lotes WHERE id = ?').get(id);
    const res = db.prepare('DELETE FROM lotes WHERE id = ?').run(id);
    // LOG ADICIONADO
    registrarLog('Operador', 'Exclusão Lote', `Lote Número ${lote ? lote.numero : id} removido.`);
    return { success: true };
});

// --- HANDLERS: FORNECEDORES ---
protectedHandle('listar-fornecedores', async () => {
    try {
        return db.prepare("SELECT * FROM fornecedores ORDER BY nome ASC").all();
    } catch (err) {
        console.error("Erro ao listar fornecedores:", err);
        return [];
    }
});

protectedHandle('salvar-fornecedor', async (event, data) => {
    try {
        if (data.id) {
            db.prepare("UPDATE fornecedores SET nome = ? WHERE id = ?").run(data.nome, data.id);
            registrarLog('Operador', 'Edição Fornecedor', `Fornecedor ID ${data.id}: ${data.nome} atualizado.`);
            return { success: true, id: data.id };
        } else {
            const res = db.prepare("INSERT INTO fornecedores (nome) VALUES (?)").run(data.nome);
            registrarLog('Operador', 'Cadastro Fornecedor', `Fornecedor ${data.nome} cadastrado.`);
            return { success: true, id: res.lastInsertRowid };
        }
    } catch (err) {
        console.error("Erro ao salvar fornecedor:", err);
        return { success: false, error: err.message };
    }
});

protectedHandle('excluir-fornecedor', async (event, id) => {
    try {
        const check = db.prepare('SELECT COUNT(*) as count FROM romaneios WHERE fornecedor_id = ?').get(id);
        if (check.count > 0) {
            return { success: false, error: `Não é possível excluir: o fornecedor está vinculado a ${check.count} romaneios.` };
        }
        const forn = db.prepare('SELECT nome FROM fornecedores WHERE id = ?').get(id);
        db.prepare('DELETE FROM fornecedores WHERE id = ?').run(id);
        registrarLog('Operador', 'Exclusão Fornecedor', `Fornecedor ${forn ? forn.nome : id} removido.`);
        return { success: true };
    } catch (err) {
        console.error("Erro ao excluir fornecedor:", err);
        return { success: false, error: err.message };
    }
});

// --- HANDLERS: MOTORISTAS ---
protectedHandle('listar-motoristas', async () => {
    try {
        return db.prepare("SELECT * FROM motoristas ORDER BY nome ASC").all();
    } catch (err) {
        console.error("Erro ao listar motoristas:", err);
        return [];
    }
});

protectedHandle('salvar-motorista', async (event, data) => {
    try {
        if (data.id) {
            db.prepare(`
                UPDATE motoristas SET 
                    nome = ?, 
                    cpf = ?, 
                    cnh = ?, 
                    placa_veiculo = ?, 
                    telefone = ?, 
                    comissao = ?, 
                    salario = ? 
                WHERE id = ?
            `).run(
                data.nome,
                data.cpf || null,
                data.cnh || null,
                data.placa_veiculo || null,
                data.telefone || null,
                data.comissao || 0,
                data.salario || 0,
                data.id
            );
            registrarLog('Operador', 'Edição Motorista', `Motorista ID ${data.id}: ${data.nome} atualizado.`);
            return { success: true, id: data.id };
        } else {
            const res = db.prepare(`
                INSERT INTO motoristas (nome, cpf, cnh, placa_veiculo, telefone, comissao, salario) 
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                data.nome,
                data.cpf || null,
                data.cnh || null,
                data.placa_veiculo || null,
                data.telefone || null,
                data.comissao || 0,
                data.salario || 0
            );
            registrarLog('Operador', 'Cadastro Motorista', `Motorista ${data.nome} cadastrado.`);
            return { success: true, id: res.lastInsertRowid };
        }
    } catch (err) {
        console.error("Erro ao salvar motorista:", err);
        return { success: false, error: err.message };
    }
});

protectedHandle('excluir-motorista', async (event, id) => {
    try {
        const check = db.prepare('SELECT COUNT(*) as count FROM romaneios WHERE motorista_id = ?').get(id);
        if (check.count > 0) {
            return { success: false, error: `Não é possível excluir: o motorista está vinculado a ${check.count} romaneios.` };
        }
        const mot = db.prepare('SELECT nome FROM motoristas WHERE id = ?').get(id);
        db.prepare('DELETE FROM motoristas WHERE id = ?').run(id);
        registrarLog('Operador', 'Exclusão Motorista', `Motorista ${mot ? mot.nome : id} removido.`);
        return { success: true };
    } catch (err) {
        console.error("Erro ao excluir motorista:", err);
        return { success: false, error: err.message };
    }
});

// --- HANDLERS: TORAS E ESTOQUE (MODULO NÚMERO) ---
protectedHandle('salvar-tora', async (event, tora) => {
    try {
        const stmt = db.prepare(`
            INSERT INTO toras (
                codigo, 
                especie_id, 
                lote_id, 
                romaneio_id,
                rodo, 
                desconto_1, 
                desconto_2, 
                total_desconto, 
                comprimento, 
                volume, 
                volume_bruto,
                rodo_bruto,
                comprimento_bruto,
                status,
                sync_status,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pátio', 'pending', CURRENT_TIMESTAMP)
        `);

        const result = stmt.run(
            tora.codigo,
            tora.especie_id,
            tora.lote_id,
            tora.romaneio_id || null,
            tora.rodo,
            tora.desconto_1,
            tora.desconto_2,
            tora.total_desconto,
            tora.comprimento,
            tora.volume,
            tora.volume_bruto || 0,
            tora.rodo_bruto || 0,
            tora.comprimento_bruto || 0
        );

        // Registro de Log padronizado [cite: 2026-01-20]
        const logRomaneio = tora.romaneio_id ? ` (Romaneio ID: ${tora.romaneio_id})` : '';
        registrarLog('Sistema', 'Entrada', `O Número ${tora.codigo} adicionado ao estoque${logRomaneio}.`);

        return { success: true, id: result.lastInsertRowid };
    } catch (err) {
        console.error("Erro no Banco de Dados:", err);
        if (err.message.includes('UNIQUE constraint failed')) {
            throw new Error('Este Número de tora já existe no sistema.');
        }
        throw err;
    }
});

protectedHandle('excluir-tora', async (event, id) => {
    try {
        // Busca o código antes de deletar para usar no log
        const tora = db.prepare('SELECT codigo, status FROM toras WHERE id = ?').get(id);

        if (!tora) throw new Error("Tora não encontrada.");

        if (tora.status === 'serrada') {
            throw new Error(`A Tora Número ${tora.codigo} já foi baixada (serrada) e não pode ser excluída.`);
        }

        db.prepare('DELETE FROM toras WHERE id = ?').run(id);

        // LOG PADRONIZADO
        registrarLog(
            'Operador',
            'exclusao',
            `Excluiu a Tora Número ${tora.codigo} do sistema.`
        );

        return { success: true };
    } catch (err) {
        throw err;
    }
});

protectedHandle('editar-tora', async (event, tora) => {
    try {
        const stmt = db.prepare(`
            UPDATE toras SET 
                codigo = ?, 
                especie_id = ?, 
                lote_id = ?, 
                romaneio_id = ?,
                rodo = ?, 
                desconto_1 = ?, 
                desconto_2 = ?, 
                total_desconto = ?, 
                comprimento = ?, 
                volume = ?,
                volume_bruto = ?,
                rodo_bruto = ?,
                comprimento_bruto = ?,
                sync_status = 'pending',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);

        stmt.run(
            tora.codigo,
            tora.especie_id,
            tora.lote_id,
            tora.romaneio_id || null,
            tora.rodo,
            tora.desconto_1,
            tora.desconto_2,
            tora.total_desconto,
            tora.comprimento,
            tora.volume,
            tora.volume_bruto || 0,
            tora.rodo_bruto || 0,
            tora.comprimento_bruto || 0,
            tora.id
        );

        // Registro de Log da Edição
        registrarLog(
            'Operador',
            'Edição',
            `Tora número ${tora.codigo} atualizada. Novo volume: ${tora.volume} m³`
        );

        return { success: true };
    } catch (err) {
        registrarLog('Sistema', 'Erro Edição', `Falha ao editar tora ${tora.codigo}: ${err.message}`);
        throw err; // Isso fará o Swal exibir o erro correto na tela
    }
});

protectedHandle('get-totais-estoque', async (event, filtros) => {
    try {
        let sql = `SELECT COUNT(*) as total_qtd, SUM(volume) as total_vol FROM toras WHERE 1=1`;
        const params = [];

        // Filtro de Status Inteligente
        if (filtros.status && filtros.status !== 'todos') {
            // Se o filtro contém 'p' (pátio, p├ítio, etc)
            if (filtros.status.toLowerCase().includes('p')) {
                sql += " AND (status LIKE 'p%tio' OR status = 'pátio' OR status = 'patio')";
            }
            // Se o filtro for serrada
            else if (filtros.status.toLowerCase().includes('ser')) {
                sql += " AND (status LIKE 'ser%' OR status = 'serrada')";
            }
            // Para outros casos futuros
            else {
                sql += " AND status = ?";
                params.push(filtros.status);
            }
        }

        // Filtro de Lote
        if (filtros.loteId && filtros.loteId !== 'todos') {
            sql += " AND lote_id = ?"; // ou t.lote_id dependendo do seu JOIN
            params.push(filtros.loteId);
        }

        // Filtro de Espécie
        if (filtros.especieId && filtros.especieId !== 'todos' && filtros.especieId !== 'todas') {
            sql += " AND especie_id = ?";
            params.push(filtros.especieId);
        }

        // Filtro de Número [cite: 2026-01-17]
        if (filtros.codigo) {
            sql += " AND (codigo = ? OR CAST(codigo AS INTEGER) = CAST(? AS INTEGER))";
            params.push(filtros.codigo, filtros.codigo);
        }

        const result = db.prepare(sql).get(...params);

        return {
            total_qtd: result.total_qtd || 0,
            total_vol: result.total_vol || 0
        };
    } catch (err) {
        console.error("Erro ao somar serradas:", err);
        return { total_qtd: 0, total_vol: 0 };
    }
});

protectedHandle('get-estoque-detalhado', async (event, filtros) => {
    try {
        // 1. Base da Query com Joins para trazer nomes de Espécie e Lote
        let sql = `
            SELECT 
                t.*, 
                e.nome as especie_nome, 
                l.numero as lote_numero 
            FROM toras t
            LEFT JOIN especies e ON t.especie_id = e.id 
            LEFT JOIN lotes l ON t.lote_id = l.id
            WHERE 1=1
        `;
        const params = [];

        // 2. Filtro de Status
        if (filtros.status && filtros.status !== 'todos') {
            sql += " AND t.status = ?";
            params.push(filtros.status);
        }

        // 3. Filtro por Lote
        if (filtros.loteId && filtros.loteId !== 'todos') {
            sql += " AND lote_id = ?"; // ou t.lote_id dependendo do seu JOIN
            params.push(filtros.loteId);
        }

        // Filtro por Espécie
        if (filtros.especieId && filtros.especieId !== 'todos' && filtros.especieId !== 'todas') {
            sql += " AND t.especie_id = ?";
            params.push(filtros.especieId);
        }

        // 4. CORREÇÃO: Filtro por Número [cite: 2026-01-17]
        // Mudamos de LIKE para "=" para evitar que '150' traga '1500'
        if (filtros.codigo) {
            sql += " AND (t.codigo = ? OR CAST(t.codigo AS INTEGER) = CAST(? AS INTEGER))";
            params.push(filtros.codigo);
            params.push(filtros.codigo);
        }

        // 5. Ordenação (Mais recentes primeiro)
        sql += " ORDER BY t.id DESC";

        // 6. Paginação (Limite de 50 por vez para manter o layout leve)
        sql += " LIMIT ? OFFSET ?";
        params.push(filtros.limite || 50);
        params.push(filtros.pular || 0);

        const rows = db.prepare(sql).all(...params);
        return rows;
    } catch (err) {
        console.error("Erro no get-estoque-detalhado:", err);
        return [];
    }
});

protectedHandle('buscar-tora-por-codigo', async (event, codigo) => {
    try {
        // Usamos CAST para garantir que a comparação ignore zeros à esquerda
        // Ex: '001' vira 1 e coincide com a coluna se ela for numérica.
        // Se a coluna for TEXTO, usamos o código puro.
        const query = `
            SELECT t.*, e.nome as especie_nome, l.numero as lote_numero 
            FROM toras t
            LEFT JOIN especies e ON t.especie_id = e.id 
            LEFT JOIN lotes l ON t.lote_id = l.id
            WHERE (t.codigo = ? OR CAST(t.codigo AS INTEGER) = CAST(? AS INTEGER))
            LIMIT 1
        `;

        // Passamos o código duas vezes para os dois '?' da query
        return db.prepare(query).get(codigo, codigo);
    } catch (err) {
        console.error("Erro ao buscar tora para baixa:", err);
        throw err;
    }
});

// Busca qualquer tora pelo número (independente do status, para consulta ou edição)
protectedHandle('buscar-tora-por-numero', async (event, numero) => {
    try {
        const termo = String(numero).trim();

        // 1. Tentativa: Busca exata, mas usando TRIM para remover espaços invisíveis no banco
        // 2. Tentativa: Busca convertendo ambos para número (resolve 003 vs 3)
        // 3. Tentativa: Busca usando LIKE (caso o código tenha prefixos)
        const sql = `
            SELECT t.*, e.nome as especie_nome, l.numero 
            FROM toras t
            LEFT JOIN especies e ON t.especie_id = e.id
            LEFT JOIN lotes l ON t.lote_id = l.id
            WHERE TRIM(t.codigo) = ? 
               OR CAST(t.codigo AS INTEGER) = CAST(? AS INTEGER)
               OR t.codigo LIKE ?
            LIMIT 1
        `;

        // Executa a busca tentando as três formas
        const tora = db.prepare(sql).get(termo, termo, `%${termo}%`);

        if (tora) {
            console.log("Tora encontrada:", tora.codigo); // Log no terminal do VS Code
            return { success: true, data: tora };
        } else {
            console.log("Nenhuma tora encontrada com o termo:", termo);
            return { success: false, error: "Não localizado." };
        }
    } catch (error) {
        console.error("Erro crítico no SQL:", error);
        return { success: false, error: error.message };
    }
});

protectedHandle('estornar-baixa-tora', async (event, idTora, numeroTora) => {
    try {
        const stmt = db.prepare(`
            UPDATE toras 
            SET status = 'pátio', data_saida = NULL, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `);

        const resultado = stmt.run(idTora);

        if (resultado.changes > 0) {
            // Registrar no Log o estorno
            registrarLog('Estorno', 'ESTORNO', `Estorno de baixa realizado. Tora ${numeroTora} retornou ao pátio.`);
            return { success: true };
        }
        return { success: false, error: 'Registro não encontrado.' };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

protectedHandle('listar-toras-recentes', async () => {
    try {
        const query = `
            SELECT t.*, e.nome as especie_nome, l.numero as lote_numero 
            FROM toras t
            LEFT JOIN especies e ON t.especie_id = e.id
            LEFT JOIN lotes l ON t.lote_id = l.id
            ORDER BY t.id DESC LIMIT 10
        `;
        const dados = db.prepare(query).all();

        return dados;
    } catch (err) {
        registrarLog('Sistema', 'Erro SQL', `Falha ao listar toras: ${err.message}`);
        throw err;
    }
});
protectedHandle('reverter-status-tora', async (event, id, codigo) => {
    try {
        const transacao = db.transaction(() => {
            // 1. Atualiza o status do Número no estoque
            const stmt = db.prepare(`
                UPDATE toras 
                SET status = 'pátio', data_saida = NULL, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            `);
            const info = stmt.run(id);

            if (info.changes === 0) throw new Error("Registro não encontrado.");

            // 2. Registra o Log usando sua nova função padronizada
            // Aqui você pode passar o usuário logado se tiver essa variável
            registrarLog('Sistema', 'ESTORNO', `O Número ${codigo} retornou ao pátio via estorno.`);

            return true;
        });

        return { success: transacao() };

    } catch (error) {
        console.error("Erro no estorno:", error);
        return { success: false, error: error.message };
    }
});


protectedHandle('processar-baixa-lote', async (event, { ids, dataSaida }) => {
    try {
        // Define a data no formato do banco (YYYY-MM-DD) para persistência
        const dataParaBanco = dataSaida || new Date().toISOString().split('T')[0];

        // FORMATAÇÃO PARA O PADRÃO BRASILEIRO (DD/MM/YYYY) para o Log
        const dataFormatada = dataParaBanco.split('-').reverse().join('/');

        // 1. Busca os números das toras para o log [cite: 2026-01-17]
        const placeholders = ids.map(() => '?').join(',');
        const torasSelecionadas = db.prepare(`SELECT codigo FROM toras WHERE id IN (${placeholders})`).all(ids);
        const listaNumeros = torasSelecionadas.map(t => t.codigo).join(', ');

        // 2. Executa a atualização no banco de dados
        const update = db.prepare("UPDATE toras SET status = 'serrada', data_saida = ?, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status != 'serrada'");
        const executarTransacao = db.transaction((idsList, dt) => {
            for (const id of idsList) {
                update.run(dt, id);
            }
        });
        executarTransacao(ids, dataParaBanco);

        // 3. Registra o Log com data em formato PT-BR e terminologia correta [cite: 2026-01-20]
        const mensagemLog = `Baixa de ${ids.length} toras em ${dataFormatada}. Números: [${listaNumeros}]`;
        registrarLog('Operador', 'Baixa', mensagemLog);

        return { success: true };
    } catch (err) {
        console.error("Erro ao processar baixa:", err);
        throw err;
    }
});

// --- HANDLERS: ROMANEIOS DE ENTRADA ---

protectedHandle('get-proximo-numero-romaneio', async () => {
    try {
        const ano = new Date().getFullYear();
        // Busca todos os números do ano atual para calcular o próximo
        const existentes = db.prepare(
            `SELECT numero FROM romaneios WHERE numero LIKE ?`
        ).all(`ROM-%/${ano}`);

        // Extrai os números sequenciais e acha o maior
        let maxSeq = 0;
        existentes.forEach(r => {
            const match = r.numero.match(/^ROM-(\d+)\//);
            if (match) {
                const seq = parseInt(match[1], 10);
                if (seq > maxSeq) maxSeq = seq;
            }
        });

        const proximo = (maxSeq + 1).toString().padStart(3, '0');
        return { success: true, numero: `ROM-${proximo}/${ano}` };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

protectedHandle('listar-romaneios', async () => {

    try {
        return db.prepare(`
            SELECT r.*,
                f.nome as fornecedor_nome,
                m.nome as motorista_nome,
                COUNT(t.id) as total_toras,
                IFNULL(SUM(t.volume), 0) as volume_total_liquido,
                IFNULL(SUM(t.volume_bruto), 0) as volume_total_bruto
            FROM romaneios r
            LEFT JOIN toras t ON t.romaneio_id = r.id
            LEFT JOIN fornecedores f ON r.fornecedor_id = f.id
            LEFT JOIN motoristas m ON r.motorista_id = m.id
            GROUP BY r.id
            ORDER BY r.data DESC, r.id DESC
        `).all();
    } catch (err) {
        console.error('Erro ao listar romaneios:', err);
        return [];
    }
});

protectedHandle('salvar-romaneio', async (event, dados) => {
    const execute = db.transaction((dados) => {
        const res = db.prepare(
            'INSERT INTO romaneios (numero, data, fornecedor, motorista, observacoes, fornecedor_id, motorista_id, frete_valor, frete_total, sync_status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, \'pending\', CURRENT_TIMESTAMP)'
        ).run(dados.numero, dados.data, dados.fornecedor || null, dados.motorista || null, dados.observacoes || null, dados.fornecedor_id || null, dados.motorista_id || null, dados.frete_valor || 0, dados.frete_total || 0);
        const romaneioId = res.lastInsertRowid;

        if (dados.toras && Array.isArray(dados.toras)) {
            const stmtTora = db.prepare(`
                INSERT INTO toras (
                    codigo, especie_id, lote_id, romaneio_id, rodo,
                    desconto_1, desconto_2, total_desconto, comprimento, volume,
                    volume_bruto, rodo_bruto, comprimento_bruto, status,
                    sync_status, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pátio', 'pending', CURRENT_TIMESTAMP)
            `);

            for (const tora of dados.toras) {
                const exists = db.prepare('SELECT COUNT(*) as count FROM toras WHERE codigo = ?').get(tora.codigo);
                if (exists.count > 0) {
                    throw new Error(`O Número de tora ${tora.codigo} já está cadastrado no sistema.`);
                }

                stmtTora.run(
                    tora.codigo,
                    tora.especie_id,
                    tora.lote_id,
                    romaneioId,
                    tora.rodo,
                    tora.desconto_1,
                    tora.desconto_2,
                    tora.total_desconto,
                    tora.comprimento,
                    tora.volume,
                    tora.volume_bruto || 0,
                    tora.rodo_bruto || 0,
                    tora.comprimento_bruto || 0
                );

                registrarLog('Sistema', 'Entrada', `O Número ${tora.codigo} adicionado ao estoque (via Romaneio ${dados.numero}).`);
            }
        }

        registrarLog('Operador', 'ROMANEIO', `Romaneio ${dados.numero} criado com ${dados.toras ? dados.toras.length : 0} toras. Data: ${dados.data}.`);
        return { success: true, id: romaneioId };
    });

    try {
        return execute(dados);
    } catch (err) {
        console.error('Erro ao salvar romaneio:', err);
        if (err.message.includes('UNIQUE constraint failed')) {
            if (err.message.includes('romaneios.numero')) {
                return { success: false, error: 'Já existe um romaneio com este número.' };
            }
            if (err.message.includes('toras.codigo')) {
                return { success: false, error: 'Um dos números de tora inseridos já está cadastrado no sistema.' };
            }
            return { success: false, error: 'Já existe um registro com este número no sistema.' };
        }
        return { success: false, error: err.message };
    }
});

protectedHandle('editar-romaneio', async (event, dados) => {
    const execute = db.transaction((dados) => {
        const res = db.prepare(
            'UPDATE romaneios SET numero = ?, data = ?, fornecedor = ?, motorista = ?, observacoes = ?, fornecedor_id = ?, motorista_id = ?, frete_valor = ?, frete_total = ?, sync_status = \'pending\', updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).run(dados.numero, dados.data, dados.fornecedor || null, dados.motorista || null, dados.observacoes || null, dados.fornecedor_id || null, dados.motorista_id || null, dados.frete_valor || 0, dados.frete_total || 0, dados.id);

        const romaneioId = dados.id;

        if (dados.torasDeletadas && Array.isArray(dados.torasDeletadas)) {
            const stmtDelete = db.prepare('DELETE FROM toras WHERE id = ?');
            for (const toraDel of dados.torasDeletadas) {
                const t = db.prepare('SELECT codigo, status FROM toras WHERE id = ?').get(toraDel.id);
                if (t) {
                    if (t.status === 'serrada') {
                        throw new Error(`A Tora Número ${t.codigo} já foi serrada e não pode ser removida.`);
                    }
                    stmtDelete.run(toraDel.id);
                    registrarLog('Operador', 'exclusao', `Removeu a Tora Número ${t.codigo} do romaneio ${dados.numero}.`);
                }
            }
        }

        if (dados.toras && Array.isArray(dados.toras)) {
            const stmtInsert = db.prepare(`
                INSERT INTO toras (
                    codigo, especie_id, lote_id, romaneio_id, rodo,
                    desconto_1, desconto_2, total_desconto, comprimento, volume,
                    volume_bruto, rodo_bruto, comprimento_bruto, status,
                    sync_status, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pátio', 'pending', CURRENT_TIMESTAMP)
            `);

            const stmtUpdate = db.prepare(`
                UPDATE toras SET
                    codigo = ?, especie_id = ?, lote_id = ?, romaneio_id = ?, rodo = ?,
                    desconto_1 = ?, desconto_2 = ?, total_desconto = ?, comprimento = ?, volume = ?,
                    volume_bruto = ?, rodo_bruto = ?, comprimento_bruto = ?,
                    sync_status = 'pending', updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `);

            for (const tora of dados.toras) {
                if (tora.id) {
                    stmtUpdate.run(
                        tora.codigo,
                        tora.especie_id,
                        tora.lote_id,
                        romaneioId,
                        tora.rodo,
                        tora.desconto_1,
                        tora.desconto_2,
                        tora.total_desconto,
                        tora.comprimento,
                        tora.volume,
                        tora.volume_bruto || 0,
                        tora.rodo_bruto || 0,
                        tora.comprimento_bruto || 0,
                        tora.id
                    );
                } else {
                    const exists = db.prepare('SELECT COUNT(*) as count FROM toras WHERE codigo = ?').get(tora.codigo);
                    if (exists.count > 0) {
                        throw new Error(`O Número de tora ${tora.codigo} já está cadastrado no sistema.`);
                    }

                    stmtInsert.run(
                        tora.codigo,
                        tora.especie_id,
                        tora.lote_id,
                        romaneioId,
                        tora.rodo,
                        tora.desconto_1,
                        tora.desconto_2,
                        tora.total_desconto,
                        tora.comprimento,
                        tora.volume,
                        tora.volume_bruto || 0,
                        tora.rodo_bruto || 0,
                        tora.comprimento_bruto || 0
                    );

                    registrarLog('Sistema', 'Entrada', `O Número ${tora.codigo} adicionado ao estoque (via Romaneio ${dados.numero}).`);
                }
            }
        }

        registrarLog('Operador', 'ROMANEIO', `Romaneio ${dados.numero} editado e toras sincronizadas.`);
        return { success: true, changes: res.changes };
    });

    try {
        return execute(dados);
    } catch (err) {
        console.error('Erro ao editar romaneio:', err);
        if (err.message.includes('UNIQUE constraint failed')) {
            if (err.message.includes('romaneios.numero')) {
                return { success: false, error: 'Já existe um romaneio com este número.' };
            }
            if (err.message.includes('toras.codigo')) {
                return { success: false, error: 'Um dos números de tora inseridos já está cadastrado no sistema.' };
            }
            return { success: false, error: 'Já existe um registro com este número no sistema.' };
        }
        return { success: false, error: err.message };
    }
});

protectedHandle('excluir-romaneio', async (event, id) => {
    try {
        const check = db.prepare('SELECT COUNT(*) as count FROM toras WHERE romaneio_id = ?').get(id);
        if (check.count > 0) {
            return { success: false, error: `Não é possível excluir: o romaneio contém ${check.count} toras vinculadas.` };
        }
        const rom = db.prepare('SELECT numero FROM romaneios WHERE id = ?').get(id);
        db.prepare('DELETE FROM romaneios WHERE id = ?').run(id);
        registrarLog('Operador', 'ROMANEIO', `Romaneio ${rom ? rom.numero : id} excluído.`);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

protectedHandle('get-romaneio-detalhado', async (event, romaneioId) => {
    try {
        const queryRom = `
            SELECT r.*, 
                   f.nome as fornecedor_nome, 
                   m.nome as motorista_nome
            FROM romaneios r
            LEFT JOIN fornecedores f ON r.fornecedor_id = f.id
            LEFT JOIN motoristas m ON r.motorista_id = m.id
            WHERE r.id = ?
        `;
        const romaneio = db.prepare(queryRom).get(romaneioId);
        if (!romaneio) return { success: false, error: 'Romaneio não encontrado.' };

        const toras = db.prepare(`
            SELECT t.*, e.nome as especie_nome, l.numero as lote_numero
            FROM toras t
            LEFT JOIN especies e ON t.especie_id = e.id
            LEFT JOIN lotes l ON t.lote_id = l.id
            WHERE t.romaneio_id = ?
            ORDER BY CAST(t.codigo AS INTEGER) ASC
        `).all(romaneioId);

        return { success: true, romaneio, toras };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

protectedHandle('get-romaneios-select', async () => {
    try {
        return db.prepare('SELECT id, numero, data FROM romaneios ORDER BY data DESC, id DESC').all();
    } catch (err) {
        return [];
    }
});

// --- HANDLERS: RELATÓRIOS E LOGS ---
protectedHandle('buscar-dados-relatorio', async (event, filtros) => {
    let sql = `
        SELECT t.*, e.nome as especie_nome, l.numero as lote_numero 
        FROM toras t 
        LEFT JOIN especies e ON t.especie_id = e.id 
        LEFT JOIN lotes l ON t.lote_id = l.id 
        WHERE 1=1`;

    const params = [];

    // --- CORREÇÃO DOS FILTROS BASEADOS NO SEU SELECT ---

    if (filtros.tipo === 'estoque') {
        // Inventário Atual: Somente toras que AINDA estão no pátio
        sql += " AND t.status = 'pátio'";
    }
    else if (filtros.tipo === 'baixas') {
        // Somente toras que JÁ foram serradas/saíram
        sql += " AND t.status = 'serrada'";
    }
    else if (filtros.tipo === 'entradas') {
        // Mostra tudo o que entrou, independente de ainda estar lá ou não
        // (Geralmente filtramos apenas por data de entrada aqui)
    }
    // Se for 'geral', ele não adiciona filtro de status e mostra todo o histórico

    // --- FILTROS DE DATA ---
    // Só aplicamos data se houver valores e se NÃO for o inventário total (opcional)
    if (filtros.dataInicio && filtros.dataFim) {
        // Se for baixas, olha data de saída. Se for entradas ou geral, olha data de entrada.
        const campoData = filtros.tipo === 'baixas' ? 't.data_saida' : 't.data_entrada';
        sql += ` AND ${campoData} BETWEEN ? AND ?`;
        params.push(filtros.dataInicio, filtros.dataFim);
    }

    // --- FILTROS DE IDENTIFICAÇÃO ---
    if (filtros.especieId && filtros.especieId !== 'todas') {
        sql += " AND t.especie_id = ?";
        params.push(filtros.especieId);
    }

    if (filtros.loteId && filtros.loteId !== 'todos') {
        sql += " AND t.lote_id = ?";
        params.push(filtros.loteId);
    }

    sql += " ORDER BY t.data_entrada DESC";

    try {
        return db.prepare(sql).all(...params);
    } catch (err) {
        console.error("Erro SQL:", err);
        throw err;
    }
});

protectedHandle('get-resumo-gerencial', async (event, filtros) => {
    // Mesma lógica de filtros que você já usa
    let sql = `
        SELECT t.volume, t.status, e.nome as especie_nome, l.numero as lote_numero 
        FROM toras t 
        LEFT JOIN especies e ON t.especie_id = e.id 
        LEFT JOIN lotes l ON t.lote_id = l.id 
        WHERE 1=1`;

    const params = [];

    // --- REUTILIZANDO SUA LÓGICA DE FILTROS ---
    if (filtros.tipo === 'estoque') sql += " AND t.status = 'pátio'";
    else if (filtros.tipo === 'baixas') sql += " AND t.status = 'serrada'";

    if (filtros.dataInicio && filtros.dataFim) {
        const campoData = filtros.tipo === 'baixas' ? 't.data_saida' : 't.data_entrada';
        sql += ` AND ${campoData} BETWEEN ? AND ?`;
        params.push(filtros.dataInicio, filtros.dataFim);
    }

    if (filtros.especieId && filtros.especieId !== 'todas') {
        sql += " AND t.especie_id = ?";
        params.push(filtros.especieId);
    }

    if (filtros.loteId && filtros.loteId !== 'todos') {
        sql += " AND t.lote_id = ?";
        params.push(filtros.loteId);
    }

    try {
        const dados = db.prepare(sql).all(...params);

        // Processa os dados para o formato que sua função renderizarTabelaRelatorio espera
        let volTotalGeral = 0;
        const resumoEspecies = {};
        const resumoLotes = {};

        dados.forEach(t => {
            const vol = Number(t.volume);
            volTotalGeral += vol;
            const esp = t.especie_nome || 'Indefinida';
            const lote = t.lote_numero || 'Sem Lote';

            if (!resumoEspecies[esp]) resumoEspecies[esp] = { pQtd: 0, pVol: 0, sQtd: 0, sVol: 0 };
            if (!resumoLotes[lote]) resumoLotes[lote] = { pQtd: 0, pVol: 0, sQtd: 0, sVol: 0 };

            if (t.status === 'serrada') {
                resumoEspecies[esp].sQtd++; resumoEspecies[esp].sVol += vol;
                resumoLotes[lote].sQtd++; resumoLotes[lote].sVol += vol;
            } else {
                resumoEspecies[esp].pQtd++; resumoEspecies[esp].pVol += vol;
                resumoLotes[lote].pQtd++; resumoLotes[lote].pVol += vol;
            }
        });

        return {
            volTotalGeral,
            qtdTotalGeral: dados.length,
            resumoEspecies,
            resumoLotes
        };
    } catch (err) {
        console.error("Erro no Resumo:", err);
        throw err;
    }
});

protectedHandle('buscar-dados-relatorio-paginado', async (event, filtros) => {
    let sql = `
        SELECT t.*, e.nome as especie_nome, l.numero as lote_numero 
        FROM toras t 
        LEFT JOIN especies e ON t.especie_id = e.id 
        LEFT JOIN lotes l ON t.lote_id = l.id 
        WHERE 1=1`;

    const params = [];

    // (Repetir aqui exatamente os mesmos filtros aplicados acima)
    if (filtros.tipo === 'estoque') sql += " AND t.status = 'pátio'";
    else if (filtros.tipo === 'baixas') sql += " AND t.status = 'serrada'";

    if (filtros.dataInicio && filtros.dataFim) {
        const campoData = filtros.tipo === 'baixas' ? 't.data_saida' : 't.data_entrada';
        sql += ` AND ${campoData} BETWEEN ? AND ?`;
        params.push(filtros.dataInicio, filtros.dataFim);
    }

    if (filtros.especieId && filtros.especieId !== 'todas') {
        sql += " AND t.especie_id = ?";
        params.push(filtros.especieId);
    }

    if (filtros.loteId && filtros.loteId !== 'todos') {
        sql += " AND t.lote_id = ?";
        params.push(filtros.loteId);
    }

    sql += " ORDER BY t.data_entrada DESC";

    // PAGINAÇÃO
    sql += " LIMIT ? OFFSET ?";
    params.push(filtros.limite || 50, filtros.pular || 0);

    try {
        return db.prepare(sql).all(...params);
    } catch (err) {
        console.error("Erro na Tabela Paginada:", err);
        throw err;
    }
});

protectedHandle('relatorio-entradas-fornecedor', async (event, filtros) => {
    try {
        let sql = `
            SELECT r.id, r.numero, r.data, r.frete_total,
                   f.nome as fornecedor_nome,
                   COUNT(t.id) as total_toras,
                   IFNULL(SUM(t.volume), 0) as vol_liquido,
                   IFNULL(SUM(t.volume_bruto), 0) as vol_bruto
            FROM romaneios r
            LEFT JOIN fornecedores f ON r.fornecedor_id = f.id
            LEFT JOIN toras t ON t.romaneio_id = r.id
            WHERE 1=1
        `;
        const params = [];
        if (filtros.fornecedorId && filtros.fornecedorId !== 'todos') {
            sql += " AND r.fornecedor_id = ?";
            params.push(filtros.fornecedorId);
        }
        if (filtros.dataInicio && filtros.dataFim) {
            sql += " AND r.data BETWEEN ? AND ?";
            params.push(filtros.dataInicio, filtros.dataFim);
        }
        if (filtros.romaneioInicio) {
            const valInicio = parseRomaneioParaOrdenacao(filtros.romaneioInicio);
            if (valInicio !== null) {
                sql += " AND (CAST(SUBSTR(r.numero, -4) AS INTEGER) * 100000 + CAST(SUBSTR(REPLACE(r.numero, 'ROM-', ''), 1, INSTR(REPLACE(r.numero, 'ROM-', ''), '/') - 1) AS INTEGER)) >= ?";
                params.push(valInicio);
            }
        }
        if (filtros.romaneioFim) {
            const valFim = parseRomaneioParaOrdenacao(filtros.romaneioFim);
            if (valFim !== null) {
                sql += " AND (CAST(SUBSTR(r.numero, -4) AS INTEGER) * 100000 + CAST(SUBSTR(REPLACE(r.numero, 'ROM-', ''), 1, INSTR(REPLACE(r.numero, 'ROM-', ''), '/') - 1) AS INTEGER)) <= ?";
                params.push(valFim);
            }
        }
        sql += " GROUP BY r.id ORDER BY r.data DESC, r.id DESC";
        return db.prepare(sql).all(...params);
    } catch (err) {
        console.error("Erro relatorio-entradas-fornecedor:", err);
        return [];
    }
});

protectedHandle('relatorio-cargas-motorista', async (event, filtros) => {
    try {
        let sql = `
            SELECT r.id, r.numero, r.data, r.frete_total, r.frete_valor,
                   m.nome as motorista_nome, IFNULL(m.comissao, 0) as comissao,
                   COUNT(t.id) as total_toras,
                   IFNULL(SUM(t.volume_bruto), 0) as vol_bruto
            FROM romaneios r
            LEFT JOIN motoristas m ON r.motorista_id = m.id
            LEFT JOIN toras t ON t.romaneio_id = r.id
            WHERE 1=1
        `;
        const params = [];
        if (filtros.motoristaId && filtros.motoristaId !== 'todos') {
            sql += " AND r.motorista_id = ?";
            params.push(filtros.motoristaId);
        }
        if (filtros.dataInicio && filtros.dataFim) {
            sql += " AND r.data BETWEEN ? AND ?";
            params.push(filtros.dataInicio, filtros.dataFim);
        }
        if (filtros.romaneioInicio) {
            const valInicio = parseRomaneioParaOrdenacao(filtros.romaneioInicio);
            if (valInicio !== null) {
                sql += " AND (CAST(SUBSTR(r.numero, -4) AS INTEGER) * 100000 + CAST(SUBSTR(REPLACE(r.numero, 'ROM-', ''), 1, INSTR(REPLACE(r.numero, 'ROM-', ''), '/') - 1) AS INTEGER)) >= ?";
                params.push(valInicio);
            }
        }
        if (filtros.romaneioFim) {
            const valFim = parseRomaneioParaOrdenacao(filtros.romaneioFim);
            if (valFim !== null) {
                sql += " AND (CAST(SUBSTR(r.numero, -4) AS INTEGER) * 100000 + CAST(SUBSTR(REPLACE(r.numero, 'ROM-', ''), 1, INSTR(REPLACE(r.numero, 'ROM-', ''), '/') - 1) AS INTEGER)) <= ?";
                params.push(valFim);
            }
        }
        sql += " GROUP BY r.id ORDER BY r.data DESC, r.id DESC";
        return db.prepare(sql).all(...params);
    } catch (err) {
        console.error("Erro relatorio-cargas-motorista:", err);
        return [];
    }
});


protectedHandle('listar-logs', async (event, filtros = {}) => {
    try {
        const { acao, dataInicio, dataFim, limiteInicial } = filtros;
        let sql = "SELECT * FROM logs WHERE 1=1";
        let params = [];

        if (acao && acao !== 'todos') {
            // Transformamos tudo para minúsculo no banco e no filtro para comparar
            if (acao === 'EDICAO') {
                // Busca radical 'edi' para ignorar o 'ção' ou 'cao'
                sql += " AND LOWER(acao) LIKE LOWER('%edi%')";
            }
            else if (acao === 'EXCLUSAO') {
                // Busca radical 'exclu' para ignorar 'são' ou 'sao'
                sql += " AND LOWER(acao) LIKE LOWER('%exclu%')";
            } else if (acao === 'LOTE') {
                // Busca radical 'exclu' para ignorar 'são' ou 'sao'
                sql += " AND LOWER(acao) LIKE LOWER('%cadastro%')";
            }
            else {
                sql += " AND LOWER(acao) LIKE LOWER(?)";
                params.push(`%${acao}%`);
            }
        }

        if (dataInicio) {
            sql += " AND date(data_hora) >= date(?)";
            params.push(dataInicio);
        }
        if (dataFim) {
            sql += " AND date(data_hora) <= date(?)";
            params.push(dataFim);
        }

        sql += " ORDER BY data_hora DESC LIMIT ?";
        params.push(limiteInicial || 500);

        const logs = db.prepare(sql).all(...params);
        return { success: true, data: logs };
    } catch (error) {
        return { success: false, error: error.message };
    }
});
// --- DASHBOARD (FUSÃO DE TODAS AS ESTATÍSTICAS) ---
protectedHandle('get-dashboard-data', () => {
    try {
        const estoque = db.prepare(`SELECT COUNT(*) as totalPecas, SUM(volume) as totalVolume FROM toras WHERE status = 'pátio'`).get();
        const dataHoje = new Date().toLocaleDateString('en-CA');
        const logsH = db.prepare(`SELECT COUNT(*) as qtd FROM logs WHERE data_hora LIKE ?`).get(`${dataHoje}%`);
        const ultimas = db.prepare(`SELECT t.codigo, e.nome as especie, t.volume, t.data_entrada, t.status FROM toras t 
                                    LEFT JOIN especies e ON t.especie_id = e.id ORDER BY t.id DESC LIMIT 10`).all();
        const lotes = db.prepare(`SELECT l.numero as lote, COUNT(t.id) as totalToras, SUM(t.volume) as volumeTotal FROM toras t
                                  JOIN lotes l ON t.lote_id = l.id WHERE t.status = 'pátio' GROUP BY l.numero ORDER BY volumeTotal DESC LIMIT 4`).all();
        const ranking = db.prepare(`SELECT e.nome as especie, SUM(t.volume) as volumeTotal FROM toras t JOIN especies e ON t.especie_id = e.id
                                     WHERE t.status = 'pátio' GROUP BY e.id ORDER BY volumeTotal DESC LIMIT 5`).all();

        // Histórico de movimentação dos últimos 6 meses (Entradas e Saídas)
        const historicoEntradas = db.prepare(`
            SELECT strftime('%Y-%m', data_entrada) as mes, SUM(volume) as vol 
            FROM toras 
            WHERE data_entrada >= date('now', '-6 month')
            GROUP BY mes 
            ORDER BY mes ASC
        `).all();

        const historicoSaidas = db.prepare(`
            SELECT strftime('%Y-%m', data_saida) as mes, SUM(volume) as vol 
            FROM toras 
            WHERE status = 'serrada' AND data_saida >= date('now', '-6 month')
            GROUP BY mes 
            ORDER BY mes ASC
        `).all();

        const meses = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const mesFormatado = d.toISOString().substring(0, 7); // "YYYY-MM"
            meses.push(mesFormatado);
        }

        const historicoMovimentacao = meses.map(m => {
            const ent = historicoEntradas.find(e => e.mes === m);
            const sai = historicoSaidas.find(s => s.mes === m);

            const partes = m.split('-');
            const dataObjeto = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, 1);
            const labelMes = dataObjeto.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');

            return {
                mes: m,
                label: labelMes.charAt(0).toUpperCase() + labelMes.slice(1),
                entradas: ent ? (ent.vol || 0) : 0,
                saidas: sai ? (sai.vol || 0) : 0
            };
        });

        return {
            totalPecas: estoque.totalPecas || 0,
            totalVolume: estoque.totalVolume || 0,
            logsHoje: logsH.qtd || 0,
            ultimasToras: ultimas,
            resumoLotes: lotes,
            rankingEspecies: ranking,
            logsRecentes: db.prepare(`SELECT data_hora, descricao FROM logs ORDER BY id DESC LIMIT 3`).all(),
            historicoMovimentacao
        };
    } catch (err) { return null; }
});

// --- UTILITÁRIOS E SEGURANÇA ---
ipcMain.handle('get-machine-id', () => machineIdSync());
ipcMain.handle('check-activation-status', () => {
    return {
        ativado: sistemaAtivado,
        motivo: motivoBloqueio
    };
});


ipcMain.handle('sincronizar-assinatura-forced', async () => {
    console.log("🔄 [SYNC] Iniciando verificação forçada...");
    try {
        // Pega o último usuário logado diretamente do banco local (mais rápido e seguro que getSession)
        const ultimoUsuario = db.prepare("SELECT email FROM usuarios ORDER BY last_login DESC LIMIT 1").get();

        if (!ultimoUsuario) {
            console.error("❌ [SYNC] Nenhum usuário encontrado no banco local.");
            return { success: false, error: "Nenhum usuário logado anteriormente neste PC." };
        }

        const email = ultimoUsuario.email;
        console.log(`📡 [SYNC] Consultando Nuvem para: ${email}...`);

        // Timeout manual de 10 segundos para não travar o app
        const { data: assinatura, error } = await supabase
            .from('assinaturas')
            .select('valid_until, status')
            .eq('email', email)
            .single();

        if (error) {
            console.error("❌ [SYNC] Erro Nuvem:", error.message);
            return { success: false, error: "Erro no servidor: " + error.message };
        }

        if (assinatura && (assinatura.status === 'ativo' || assinatura.status === 'pago')) {
            const expiraEm = new Date(assinatura.valid_until);
            const agora = new Date();

            if (agora <= expiraEm) {
                console.log("✅ [SYNC] Assinatura válida! Atualizando licença local...");
                const appData = app.getPath('userData');
                const arquivoLicenca = path.join(appData, 'estoque-toras', 'license.dat');

                const novaLicenca = { mid: machineIdSync(), exp: assinatura.valid_until, last_seen: agora.toISOString() };
                fs.writeFileSync(arquivoLicenca, criptografar(JSON.stringify(novaLicenca)));

                sistemaAtivado = true;
                motivoBloqueio = 'ok';
                return { success: true };
            } else {
                console.warn("⚠️ [SYNC] Assinatura ainda consta como vencida no servidor.");
                return { success: false, error: "Sua assinatura ainda consta como vencida." };
            }
        }

        console.warn("⚠️ [SYNC] Nenhuma assinatura ativa encontrada.");
        return { success: false, error: "Assinatura não encontrada ou inativa." };

    } catch (err) {
        console.error("💥 [SYNC] Erro Crítico:", err);
        return { success: false, error: "Falha de conexão. Verifique sua internet." };
    }
});
ipcMain.handle('licenca-exists', async (event, pasta, arquivo) => {
    const fullPath = path.join(pasta, arquivo);
    return fs.existsSync(fullPath);
});

ipcMain.handle('licenca-mkdir', async (event, pasta) => {
    if (!fs.existsSync(pasta)) {
        fs.mkdirSync(pasta, { recursive: true });
    }
    return { success: true };
});

ipcMain.handle('licenca-write', async (event, arquivo, conteudo) => {
    fs.writeFileSync(arquivo, conteudo);
    return { success: true };
});

ipcMain.handle('licenca-read', async (event, arquivo) => {
    if (fs.existsSync(arquivo)) {
        return fs.readFileSync(arquivo, 'utf8');
    }
    return null;
});

ipcMain.handle('get-appdata-path', () => {
    return process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + '/.local/share');
});

protectedHandle('gerar-pdf-logs', async (event, html) => {
    let winPDF = new BrowserWindow({ show: false });
    await winPDF.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdfData = await winPDF.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
    const filePath = path.join(app.getPath('documents'), `Relatorio_${Date.now()}.pdf`);
    fs.writeFileSync(filePath, pdfData);
    shell.showItemInFolder(filePath);
    winPDF.close();
    return { success: true };
});

protectedHandle('exportar-backup', async () => {
    // 1. Gera o nome com data/hora local para o Número [cite: 2026-01-17] e registros
    const dataFormatada = obterDataLocal().replace(/[: ]/g, '-');
    const nomeSugerido = `tora-control-backup-${dataFormatada}.db`;

    const { filePath } = await dialog.showSaveDialog({
        title: 'Exportar Backup Otimizado',
        defaultPath: nomeSugerido,
        filters: [{ name: 'SQLite Database', extensions: ['db'] }]
    });

    if (filePath) {
        try {
            // Se o arquivo já existir, o SQLite não deixa usar o VACUUM INTO, então deletamos se houver
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

            // 2. O COMANDO MÁGICO: Cria o backup e otimiza o banco simultaneamente
            // Usamos caminhos absolutos para garantir que o SQLite encontre o local
            db.prepare(`VACUUM INTO '${filePath}'`).run();

            registrarLog('Sistema', 'BACKUP', `Backup otimizado gerado com sucesso: ${nomeSugerido}`);

            return { success: true };
        } catch (err) {
            console.error("Erro no backup avançado:", err);
            // Se o VACUUM falhar (em versões muito antigas do SQLite), voltamos para o método antigo
            try {
                fs.copyFileSync(dbPath, filePath);
                return { success: true };
            } catch (copyErr) {
                return { success: false, error: copyErr.message };
            }
        }
    }
    return { success: false };
});

protectedHandle('limpar-banco-dados', async () => {
    db.transaction(() => {
        db.prepare('DELETE FROM toras').run();
        db.prepare('DELETE FROM lotes').run();
        db.prepare('DELETE FROM especies').run();
        db.prepare("DELETE FROM logs").run();
    })();
    return { success: true };
});

protectedHandle('get-sync-status', async () => {
    try {
        const torasCount = db.prepare("SELECT COUNT(*) as count FROM toras WHERE sync_status = 'pending'").get().count;
        const lotesCount = db.prepare("SELECT COUNT(*) as count FROM lotes WHERE sync_status = 'pending'").get().count;
        const romaneiosCount = db.prepare("SELECT COUNT(*) as count FROM romaneios WHERE sync_status = 'pending'").get().count;

        return {
            success: true,
            pending: torasCount + lotesCount + romaneiosCount,
            toras: torasCount,
            lotes: lotesCount,
            romaneios: romaneiosCount
        };
    } catch (e) {
        return { success: false, pending: 0, error: e.message };
    }
});

protectedHandle('sincronizar-nuvem-manual', async () => {
    try {
        await sincronizarDadosPendentes();
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// --- NOVOS HANDLERS: CONFIGURAÇÕES E BACKUP AGENDADO ---
protectedHandle('get-backup-config', async () => carregarConfigBackup());

protectedHandle('set-backup-config', async (e, config) => {
    const ok = salvarConfigBackup(config);
    return { success: ok };
});

protectedHandle('selecionar-pasta-backup', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Selecione a pasta para o Backup (Google Drive)'
    });
    if (result.canceled) return null;
    return result.filePaths[0];
});

// --- NOVO HANDLER DE ATIVAÇÃO SEGURA ---
ipcMain.handle('ativar-sistema', async (event, chaveDigitada) => {
    try {
        const idHardware = machineIdSync();
        const chaveEsperada = Buffer.from(idHardware + MEU_SEGREDO).toString('base64');

        if (chaveDigitada === chaveEsperada) {
            const appData = app.getPath('userData');
            const pastaLicenca = path.join(appData, 'estoque-toras');
            const arquivoLicenca = path.join(pastaLicenca, 'license.dat');

            if (!fs.existsSync(pastaLicenca)) {
                fs.mkdirSync(pastaLicenca, { recursive: true });
            }

            // Define validade inicial de 30 dias para novas ativações
            const expiraEm = new Date();
            expiraEm.setDate(expiraEm.getDate() + 30);

            const novaLicenca = {
                mid: idHardware,
                exp: expiraEm.toISOString(),
                last_seen: new Date().toISOString()
            };

            fs.writeFileSync(arquivoLicenca, criptografar(JSON.stringify(novaLicenca)));

            sistemaAtivado = true;
            return { success: true, validade: expiraEm.toLocaleDateString() };
        } else {
            return { success: false, error: "Chave de licença inválida para este computador." };
        }
    } catch (err) {
        console.error("Erro na ativação:", err);
        return { success: false, error: "Erro interno ao processar ativação: " + err.message };
    }
});

// --- HANDLERS NUVEM ---
protectedHandle('supabase-login', async (event, { email, password }) => {
    try {
        // 1. Tenta Autenticação Online via Nuvem
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (!error) {
            // SUCESSO ONLINE: Atualiza o cache de credenciais local
            const salt = crypto.randomBytes(16).toString('hex');
            const hash = hashPasswordPbkdf2(password, salt);
            db.prepare(`INSERT OR REPLACE INTO usuarios (email, password_hash, password_salt, last_login) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`).run(email, hash, salt);

            // --- SINCRONIZAÇÃO DE ASSINATURA (OPCIONAL/SAAS) ---
            try {
                const { data: assinatura } = await supabase
                    .from('assinaturas')
                    .select('valid_until, status')
                    .eq('email', email)
                    .single();

                if (assinatura && assinatura.status === 'ativo') {
                    const appData = app.getPath('userData');
                    const arquivoLicenca = path.join(appData, 'estoque-toras', 'license.dat');

                    const novaLicenca = {
                        mid: machineIdSync(),
                        exp: assinatura.valid_until,
                        last_seen: new Date().toISOString()
                    };

                    fs.writeFileSync(arquivoLicenca, criptografar(JSON.stringify(novaLicenca)));

                    // Verifica se a data baixada já está vencida e trava NA HORA
                    const agora = new Date();
                    const dataVencimento = new Date(assinatura.valid_until);

                    if (agora > dataVencimento) {
                        console.error(`❌ Assinatura VENCIDA detectada para ${email}. Bloqueando sistema.`);
                        sistemaAtivado = false;
                    } else {
                        console.log(`✅ Assinatura renovada online para: ${email}. Válida até: ${assinatura.valid_until}`);
                        sistemaAtivado = true;
                    }
                }
            } catch (errSessao) {
                console.warn("⚠️ Não foi possível sincronizar assinatura, mas o login continuou.");
            }

            registrarLog(email, 'LOGIN ONLINE', 'Autenticado via Nuvem. Cache local atualizado.');
            return { success: true, user: data.user };
        }

        // 2. TRATAMENTO DE FALHA: Se for erro de conexão, tenta modo offline
        const errorMsg = (error.message || "").toLowerCase();
        const isNetworkError = errorMsg.includes('fetch') ||
            errorMsg.includes('network') ||
            errorMsg.includes('load failed') ||
            error.status === 0 || error.status === null;

        if (isNetworkError) {
            const userLocal = db.prepare(`SELECT * FROM usuarios WHERE email = ?`).get(email);

            if (userLocal) {
                let match = false;

                // MIGRACAO / COMPATIBILIDADE: Se não possuir salt, usa hash legado e atualiza
                if (!userLocal.password_salt) {
                    const hashDigitadoLegacy = hashPasswordLegacy(password);
                    if (hashDigitadoLegacy === userLocal.password_hash) {
                        match = true;
                        // Atualiza no banco local para o novo padrão PBKDF2 com salt dinâmico
                        const novoSalt = crypto.randomBytes(16).toString('hex');
                        const novoHash = hashPasswordPbkdf2(password, novoSalt);
                        db.prepare(`UPDATE usuarios SET password_hash = ?, password_salt = ? WHERE email = ?`).run(novoHash, novoSalt, email);
                    }
                } else {
                    const hashDigitado = hashPasswordPbkdf2(password, userLocal.password_salt);
                    if (hashDigitado === userLocal.password_hash) {
                        match = true;
                    }
                }

                if (match) {
                    registrarLog(email, 'LOGIN OFFLINE', 'Autenticado via cache local (sem internet).');
                    return {
                        success: true,
                        user: { email: userLocal.email, id: 'offline-mode' },
                        offline: true
                    };
                } else {
                    return { success: false, error: "Senha incorreta para o modo offline." };
                }
            } else {
                return { success: false, error: "Sem conexão. Este usuário nunca logou nesta máquina para permitir acesso offline." };
            }
        }

        // Se não for erro de rede, é erro de credenciais na Nuvem
        return { success: false, error: "Credenciais inválidas ou erro no servidor: " + error.message };

    } catch (err) {
        console.error("Erro crítico no login:", err);
        return { success: false, error: "Erro interno no sistema de login." };
    }
});

protectedHandle('supabase-fetch-especies', async () => {
    try {
        const { data, error } = await supabase.from('especies').select('*');
        if (error) throw error;
        return { success: true, data };
    } catch (err) {
        console.error("❌ Erro ao buscar espécies na Nuvem:", err.message);
        return { success: false, error: err.message };
    }
});

protectedHandle('supabase-logout', async () => {
    await supabase.auth.signOut();
    return { success: true };
});

protectedHandle('supabase-get-session', async () => {
    const { data } = await supabase.auth.getSession();
    return data.session;
});

// --- NOVOS HANDLERS: CONTROLE FINANCEIRO DE MOTORISTAS (VALES E FECHAMENTO) ---

protectedHandle('salvar-vale-motorista', async (event, vale) => {
    try {
        if (vale.id) {
            db.prepare(`
                UPDATE motorista_vales SET
                    motorista_id = ?, valor = ?, data = ?, descricao = ?, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(vale.motorista_id, vale.valor, vale.data, vale.descricao || null, vale.id);
            registrarLog('Operador', 'Edição Vale', `Vale ID ${vale.id} editado.`);
            return { success: true };
        } else {
            const res = db.prepare(`
                INSERT INTO motorista_vales (motorista_id, valor, data, descricao, status, sync_status, updated_at)
                VALUES (?, ?, ?, ?, 'aberto', 'pending', CURRENT_TIMESTAMP)
            `).run(vale.motorista_id, vale.valor, vale.data, vale.descricao || null);
            registrarLog('Operador', 'Cadastro Vale', `Vale no valor de R$ ${vale.valor} lançado.`);
            return { success: true, id: res.lastInsertRowid };
        }
    } catch (err) {
        console.error("Erro ao salvar vale:", err);
        return { success: false, error: err.message };
    }
});

protectedHandle('excluir-vale-motorista', async (event, id) => {
    try {
        const vale = db.prepare("SELECT status FROM motorista_vales WHERE id = ?").get(id);
        if (vale && vale.status === 'pago') {
            return { success: false, error: "Não é possível excluir um vale que já foi descontado em um fechamento." };
        }
        db.prepare("DELETE FROM motorista_vales WHERE id = ?").run(id);
        registrarLog('Operador', 'Exclusão Vale', `Vale ID ${id} excluído.`);
        return { success: true };
    } catch (err) {
        console.error("Erro ao excluir vale:", err);
        return { success: false, error: err.message };
    }
});

protectedHandle('listar-vales-motorista', async (event, filtros = {}) => {
    try {
        let sql = `
            SELECT v.*, m.nome as motorista_nome
            FROM motorista_vales v
            JOIN motoristas m ON v.motorista_id = m.id
            WHERE 1=1
        `;
        const params = [];
        if (filtros.motoristaId && filtros.motoristaId !== 'todos') {
            sql += " AND v.motorista_id = ?";
            params.push(filtros.motoristaId);
        }
        if (filtros.status && filtros.status !== 'todos') {
            sql += " AND v.status = ?";
            params.push(filtros.status);
        }
        sql += " ORDER BY v.data DESC, v.id DESC";
        return db.prepare(sql).all(...params);
    } catch (err) {
        console.error("Erro ao listar vales:", err);
        return [];
    }
});

protectedHandle('calcular-previa-fechamento', async (event, filtros) => {
    try {
        const { motoristaId, dataInicio, dataFim, romaneioInicio, romaneioFim } = filtros;
        const motorista = db.prepare("SELECT nome, salario, comissao FROM motoristas WHERE id = ?").get(motoristaId);
        if (!motorista) return { success: false, error: "Motorista não encontrado." };

        // 1. Busca Cargas e calcula comissões
        let sqlCargas = `
            SELECT r.id, r.numero, r.data, r.frete_total,
                   (r.frete_total * (IFNULL(m.comissao, 0) / 100.0)) as valor_comissao,
                   COUNT(t.id) as total_toras,
                   IFNULL(SUM(t.volume_bruto), 0) as vol_bruto
            FROM romaneios r
            LEFT JOIN motoristas m ON r.motorista_id = m.id
            LEFT JOIN toras t ON t.romaneio_id = r.id
            WHERE r.motorista_id = ?
        `;
        const paramsCargas = [motoristaId];
        if (dataInicio && dataFim) {
            sqlCargas += " AND r.data BETWEEN ? AND ?";
            paramsCargas.push(dataInicio, dataFim);
        } else if (romaneioInicio && romaneioFim) {
            sqlCargas += " AND (CAST(SUBSTR(REPLACE(r.numero, 'ROM-', ''), 1, INSTR(REPLACE(r.numero, 'ROM-', ''), '/') - 1) AS INTEGER)) BETWEEN CAST(? AS INTEGER) AND CAST(? AS INTEGER)";
            paramsCargas.push(romaneioInicio, romaneioFim);
        }
        sqlCargas += " GROUP BY r.id ORDER BY r.data ASC, r.id ASC";

        const cargas = db.prepare(sqlCargas).all(...paramsCargas);
        const totalComissao = cargas.reduce((sum, c) => sum + (c.valor_comissao || 0), 0);

        // 2. Busca Vales (Adiantamentos) em aberto para o motorista
        const vales = db.prepare(`
            SELECT id, valor, data, descricao 
            FROM motorista_vales 
            WHERE motorista_id = ? AND status = 'aberto'
            ORDER BY data ASC
        `).all(motoristaId);

        const totalVales = vales.reduce((sum, v) => sum + v.valor, 0);

        return {
            success: true,
            motorista: {
                nome: motorista.nome,
                salario: motorista.salario || 0,
                comissao_pct: motorista.comissao || 0
            },
            cargas,
            totalComissao,
            vales,
            totalVales,
            totalLiquido: (motorista.salario || 0) + totalComissao - totalVales
        };
    } catch (err) {
        console.error("Erro ao calcular prévia de fechamento:", err);
        return { success: false, error: err.message };
    }
});

protectedHandle('salvar-fechamento-motorista', async (event, dados) => {
    const execute = db.transaction((dados) => {
        // 1. Salva o registro do Fechamento
        const res = db.prepare(`
            INSERT INTO motorista_fechamentos (
                motorista_id, data_fechamento, periodo_inicio, periodo_fim,
                romaneio_inicio, romaneio_fim, valor_salario, valor_comissao,
                valor_vales, valor_liquido, observacoes, sync_status, updated_at
            ) VALUES (?, CURRENT_DATE, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
        `).run(
            dados.motorista_id,
            dados.periodo_inicio,
            dados.periodo_fim,
            dados.romaneio_inicio || null,
            dados.romaneio_fim || null,
            dados.valor_salario,
            dados.valor_comissao,
            dados.valor_vales,
            dados.valor_liquido,
            dados.observacoes || null
        );

        const fechamentoId = res.lastInsertRowid;

        // 2. Vincula os vales selecionados a este fechamento e muda para 'pago'
        if (dados.valesIds && Array.isArray(dados.valesIds) && dados.valesIds.length > 0) {
            const stmtVale = db.prepare(`
                UPDATE motorista_vales 
                SET status = 'pago', fechamento_id = ?, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND status = 'aberto'
            `);
            for (const valeId of dados.valesIds) {
                stmtVale.run(fechamentoId, valeId);
            }
        }

        registrarLog('Operador', 'Fechamento Motorista', `Fechamento ID ${fechamentoId} para o Motorista ID ${dados.motorista_id} consolidado.`);
        return { success: true, id: fechamentoId };
    });

    try {
        return execute(dados);
    } catch (err) {
        console.error("Erro ao salvar fechamento:", err);
        return { success: false, error: err.message };
    }
});

protectedHandle('listar-fechamentos-motorista', async (event, filtros = {}) => {
    try {
        let sql = `
            SELECT f.*, m.nome as motorista_nome
            FROM motorista_fechamentos f
            JOIN motoristas m ON f.motorista_id = m.id
            WHERE 1=1
        `;
        const params = [];
        if (filtros.motoristaId && filtros.motoristaId !== 'todos') {
            sql += " AND f.motorista_id = ?";
            params.push(filtros.motoristaId);
        }
        sql += " ORDER BY f.data_fechamento DESC, f.id DESC";
        return db.prepare(sql).all(...params);
    } catch (err) {
        console.error("Erro ao listar fechamentos:", err);
        return [];
    }
});

protectedHandle('excluir-fechamento-motorista', async (event, id) => {
    const execute = db.transaction((id) => {
        // 1. Libera os vales vinculados a este fechamento de volta para 'aberto'
        db.prepare(`
            UPDATE motorista_vales 
            SET status = 'aberto', fechamento_id = NULL, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP
            WHERE fechamento_id = ?
        `).run(id);

        // 2. Deleta o fechamento
        db.prepare("DELETE FROM motorista_fechamentos WHERE id = ?").run(id);

        registrarLog('Operador', 'Estorno Fechamento', `Fechamento ID ${id} estornado. Vales voltaram para aberto.`);
        return { success: true };
    });

    try {
        return execute(id);
    } catch (err) {
        console.error("Erro ao excluir fechamento:", err);
        return { success: false, error: err.message };
    }
});

protectedHandle('get-fechamento-detalhado', async (event, id) => {
    try {
        const fechamento = db.prepare(`
            SELECT f.*, m.nome as motorista_nome, m.placa_veiculo, m.comissao as motorista_comissao_pct
            FROM motorista_fechamentos f
            JOIN motoristas m ON f.motorista_id = m.id
            WHERE f.id = ?
        `).get(id);

        if (!fechamento) return { success: false, error: "Fechamento não encontrado." };

        // 1. Busca os romaneios daquele motorista no período
        let sqlCargas = `
            SELECT r.id, r.numero, r.data, r.frete_total,
                   (r.frete_total * (IFNULL(m.comissao, 0) / 100.0)) as valor_comissao,
                   COUNT(t.id) as total_toras,
                   IFNULL(SUM(t.volume_bruto), 0) as vol_bruto
            FROM romaneios r
            LEFT JOIN motoristas m ON r.motorista_id = m.id
            LEFT JOIN toras t ON t.romaneio_id = r.id
            WHERE r.motorista_id = ?
        `;
        const paramsCargas = [fechamento.motorista_id];

        if (fechamento.romaneio_inicio && fechamento.romaneio_fim) {
            sqlCargas += " AND CAST(r.numero AS INTEGER) BETWEEN CAST(? AS INTEGER) AND CAST(? AS INTEGER)";
            paramsCargas.push(fechamento.romaneio_inicio, fechamento.romaneio_fim);
        } else {
            sqlCargas += " AND r.data BETWEEN ? AND ?";
            paramsCargas.push(fechamento.periodo_inicio, fechamento.periodo_fim);
        }
        sqlCargas += " GROUP BY r.id ORDER BY r.data ASC, r.id ASC";

        const cargas = db.prepare(sqlCargas).all(...paramsCargas);

        // 2. Busca os vales descontados neste fechamento
        const vales = db.prepare(`
            SELECT id, valor, data, descricao 
            FROM motorista_vales 
            WHERE fechamento_id = ?
            ORDER BY data ASC
        `).all(id);

        return { success: true, fechamento, cargas, vales };
    } catch (err) {
        console.error("Erro ao detalhar fechamento:", err);
        return { success: false, error: err.message };
    }
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });