const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
try { require('dotenv').config(); } catch (e) {}
const { machineIdSync } = require('node-machine-id');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');
const Database = require('better-sqlite3');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hmuxkqtgyyglafqlqggv.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_G--VZElf06QOrBbxIFKvhA_GE1eOJwI';

// --- SEGURANÇA E ATIVAÇÃO RSA ---
let sistemaAtivado = false;
let motivoBloqueio = 'unactivated';

const _s = [84, 79, 82, 65, 83, 50, 48, 50, 54]; // TORAS2026
const MEU_SEGREDO = process.env.APP_SECRET || String.fromCharCode(..._s);

const CHAVE_PUBLICA_RSA = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvLEnwpiuSuFwZHGf4p1T
6S2HG7RD/e4LL1TlfjxwGoFrJHc+Mkj7v/Z9D0SD/P5glN65m+0NSloKVIGplXGO
O2njHUEBoL1OKzqHiazdwE8o6V+/kMzt1cPHNJOgg7puLgAw5nOjrwH28lqcezmW
S4h9Hfe0e2jlMcg4a2wFzdiLNVpnKk+YaPStm2fZdpol+dTi79xCVdcvBJzSlDM5
LKntIrdtump3z5jrzLsZaal3Ok7VONHCmywpOOfa38vBwkKjvwC0AfDjdkgA2Zgt
DjOGJjVa6W/XuSXU+neGE1yKAL4/2EA/PR5iy+zdRrsef+YSdUEzBuCeFw0Dy8+H
9QIDAQAB
-----END PUBLIC KEY-----`;

function getHardwareId() {
    let systemUuid = '';
    if (process.platform === 'win32') {
        try {
            const output = execSync('reg query "HKLM\\Software\\Microsoft\\Cryptography" /v MachineGuid', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
            const match = output.match(/MachineGuid\s+REG_SZ\s+([a-fA-F0-9-]+)/i);
            if (match && match[1]) {
                systemUuid = match[1].trim();
            }
        } catch (e) {}

        if (!systemUuid) {
            try {
                systemUuid = execSync('powershell -Command "(Get-CimInstance Win32_ComputerSystemProduct).UUID"', { stdio: ['ignore', 'pipe', 'ignore'] })
                    .toString()
                    .trim();
            } catch (e) {}
        }

        if (!systemUuid) {
            try {
                systemUuid = execSync('wmic csproduct get uuid', { stdio: ['ignore', 'pipe', 'ignore'] })
                    .toString()
                    .replace('UUID', '')
                    .trim();
            } catch (e) {}
        }
    }

    const invalidUuids = [
        'ffffffff-ffff-ffff-ffff-ffffffffffff',
        '00000000-0000-0000-0000-000000000000'
    ];

    if (!systemUuid || invalidUuids.includes(systemUuid.toLowerCase())) {
        try {
            const interfaces = os.networkInterfaces();
            const macs = [];
            for (const name of Object.keys(interfaces)) {
                for (const net of interfaces[name]) {
                    if (net.mac && net.mac !== '00:00:00:00:00:00') {
                        macs.push(net.mac);
                    }
                }
            }
            macs.sort();
            systemUuid = macs.join('-') || os.hostname();
        } catch (e) {
            systemUuid = os.hostname();
        }
    }

    return crypto.createHash('sha256').update(systemUuid).digest('hex');
}

function obterChaveAES() {
    const hwId = getHardwareId();
    const key = crypto.createHash('sha256').update(MEU_SEGREDO + hwId).digest();
    const iv = crypto.createHash('md5').update(MEU_SEGREDO + hwId).digest();
    return { key, iv };
}

function criptografar(texto) {
    const { key, iv } = obterChaveAES();
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let crypted = cipher.update(texto, 'utf8', 'hex');
    crypted += cipher.final('hex');
    return crypted;
}

function descriptografar(texto) {
    try {
        const { key, iv } = obterChaveAES();
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let dec = decipher.update(texto, 'hex', 'utf8');
        dec += decipher.final('utf8');
        return dec;
    } catch (e) {
        return null;
    }
}

function verificarLicencaLocal() {
    const appData = app.getPath('userData');
    const pastaBase = path.join(appData, 'toracontrol-geometrica');
    const arquivoLicenca = path.join(pastaBase, 'license.dat');

    if (fs.existsSync(arquivoLicenca)) {
        try {
            const conteudoCriptografado = fs.readFileSync(arquivoLicenca, 'utf-8');
            const conteudoJson = descriptografar(conteudoCriptografado);

            if (!conteudoJson) {
                sistemaAtivado = false;
                motivoBloqueio = 'unactivated';
                return false;
            }

            const licencaLocal = JSON.parse(conteudoJson);
            if (!licencaLocal || !licencaLocal.token || !licencaLocal.last_seen) {
                sistemaAtivado = false;
                motivoBloqueio = 'unactivated';
                return false;
            }

            let licencaPacote;
            try {
                const jsonString = Buffer.from(licencaLocal.token, 'base64').toString('utf8');
                licencaPacote = JSON.parse(jsonString);
            } catch (e) {
                sistemaAtivado = false;
                motivoBloqueio = 'unactivated';
                return false;
            }

            if (!licencaPacote || !licencaPacote.data || !licencaPacote.signature) {
                sistemaAtivado = false;
                motivoBloqueio = 'unactivated';
                return false;
            }

            const { data, signature } = licencaPacote;
            const dadosString = JSON.stringify(data);
            const verifier = crypto.createVerify('SHA256');
            verifier.update(dadosString);
            const assinaturaValida = verifier.verify(CHAVE_PUBLICA_RSA, signature, 'base64');

            if (!assinaturaValida) {
                console.error("🚨 CRÍTICO: Assinatura digital da licença local é inválida!");
                sistemaAtivado = false;
                motivoBloqueio = 'unactivated';
                return false;
            }

            const machineId = getHardwareId();
            if (data.mid !== machineId) {
                console.error("Máquina não autorizada para esta licença.");
                sistemaAtivado = false;
                motivoBloqueio = 'unactivated';
                return false;
            }

            const agora = new Date();
            const exp = new Date(data.exp);
            const lastSeen = new Date(licencaLocal.last_seen);

            if (agora > exp) {
                sistemaAtivado = false;
                motivoBloqueio = 'expired';
                return false;
            }

            if (agora < lastSeen) {
                console.error("🚨 DETECÇÃO DE FRAUDE: Relógio do computador retrocedido!");
                sistemaAtivado = false;
                motivoBloqueio = 'fraud';
                return false;
            }

            if (db) {
                try {
                    const row = db.prepare("SELECT data_entrada as data FROM toras ORDER BY data_entrada DESC LIMIT 1").get();
                    if (row && row.data) {
                        const dataUltimaEntrada = new Date(row.data.split(' ')[0] + "T12:00:00");
                        const hojeSemHora = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
                        const entradaSemHora = new Date(dataUltimaEntrada.getFullYear(), dataUltimaEntrada.getMonth(), dataUltimaEntrada.getDate());
                        if (hojeSemHora < entradaSemHora) {
                            console.error("🚨 DETECÇÃO DE FRAUDE: Relógio é anterior ao último registro do banco!");
                            sistemaAtivado = false;
                            motivoBloqueio = 'fraud';
                            return false;
                        }
                    }
                } catch (e) {}
            }

            licencaLocal.last_seen = agora.toISOString();
            fs.writeFileSync(arquivoLicenca, criptografar(JSON.stringify(licencaLocal)));

            sistemaAtivado = true;
            motivoBloqueio = 'ok';
            return true;
        } catch (err) {
            console.error("Erro ao verificar licença:", err.message);
            sistemaAtivado = false;
            motivoBloqueio = 'unactivated';
            return false;
        }
    }

    sistemaAtivado = false;
    motivoBloqueio = 'unactivated';
    return false;
}

let mainWindow;
let splash;

// --- CONFIGURAÇÃO DO BANCO DE DADOS ---
const dbPath = path.join(app.getPath('userData'), 'toracontroll.db');
const db = new Database(dbPath);
db.pragma('foreign_keys = OFF');

function columnExists(table, column) {
    try {
        const info = db.prepare(`PRAGMA table_info(${table})`).all();
        return info.some(col => col.name === column);
    } catch (e) {
        return false;
    }
}

// Configuração de backup automático
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
        return true;
    } catch (err) {
        console.error("❌ Erro ao salvar backup-config.json:", err.message);
        return false;
    }
}

// --- ESTRUTURA DO BANCO DE DADOS (GEOMÉTRICO COMPLETO) ---
db.exec(`
    CREATE TABLE IF NOT EXISTS configuracoes_sistema (
        chave TEXT PRIMARY KEY,
        valor TEXT
    );

    CREATE TABLE IF NOT EXISTS licenca_local (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        machine_id TEXT NOT NULL,
        status_licenca TEXT NOT NULL,
        data_validade TEXT,
        senha_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        ultimo_login TEXT
    );

    CREATE TABLE IF NOT EXISTS especies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        cientifico TEXT
    );

    CREATE TABLE IF NOT EXISTS lotes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero TEXT UNIQUE NOT NULL,
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

    CREATE TABLE IF NOT EXISTS romaneios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero TEXT UNIQUE NOT NULL,
        data TEXT NOT NULL,
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
        codigo TEXT UNIQUE,
        especie_id INTEGER,
        lote_id INTEGER,
        romaneio_id INTEGER,
        m1 REAL,
        m2 REAL,
        comprimento REAL,
        volume REAL,
        m1_bruto REAL DEFAULT 0,
        m2_bruto REAL DEFAULT 0,
        comprimento_bruto REAL DEFAULT 0,
        volume_bruto REAL DEFAULT 0,
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
    CREATE INDEX IF NOT EXISTS idx_toras_especie ON toras(especie_id);
    CREATE INDEX IF NOT EXISTS idx_toras_romaneio ON toras(romaneio_id);
    CREATE INDEX IF NOT EXISTS idx_toras_status ON toras(status);
    CREATE INDEX IF NOT EXISTS idx_logs_data ON logs(data_hora);
    CREATE INDEX IF NOT EXISTS idx_motorista_vales_motorista ON motorista_vales(motorista_id);
    CREATE INDEX IF NOT EXISTS idx_motorista_fechamentos_motorista ON motorista_fechamentos(motorista_id);
`);

// Migrações e compatibilidade de colunas
try { db.exec("ALTER TABLE toras ADD COLUMN m1_bruto REAL DEFAULT 0;"); } catch (e) { }
try { db.exec("ALTER TABLE toras ADD COLUMN m2_bruto REAL DEFAULT 0;"); } catch (e) { }
try { db.exec("ALTER TABLE toras ADD COLUMN comprimento_bruto REAL DEFAULT 0;"); } catch (e) { }
try { db.exec("ALTER TABLE toras ADD COLUMN volume_bruto REAL DEFAULT 0;"); } catch (e) { }
try { db.exec("ALTER TABLE toras ADD COLUMN romaneio_id INTEGER;"); } catch (e) { }
try { db.exec("ALTER TABLE toras ADD COLUMN status TEXT DEFAULT 'pátio';"); } catch (e) { }
try { db.exec("ALTER TABLE toras ADD COLUMN data_saida TEXT;"); } catch (e) { }
try { db.exec("ALTER TABLE toras ADD COLUMN sync_status TEXT DEFAULT 'pending';"); } catch (e) { }
try { db.exec("ALTER TABLE toras ADD COLUMN updated_at DATETIME;"); } catch (e) { }
try { db.exec("ALTER TABLE romaneios ADD COLUMN fornecedor_id INTEGER REFERENCES fornecedores(id);"); } catch (e) { }
try { db.exec("ALTER TABLE romaneios ADD COLUMN motorista_id INTEGER REFERENCES motoristas(id);"); } catch (e) { }
try { db.exec("ALTER TABLE romaneios ADD COLUMN frete_valor REAL DEFAULT 0;"); } catch (e) { }
try { db.exec("ALTER TABLE romaneios ADD COLUMN frete_total REAL DEFAULT 0;"); } catch (e) { }

db.pragma('foreign_keys = ON');

function parseRomaneioParaOrdenacao(valor) {
    if (!valor) return null;
    let s = valor.toString().trim().toUpperCase();
    const match = s.match(/^(?:ROM-)?(\d+)\/(\d{4})$/i);
    if (match) {
        const numSeq = parseInt(match[1], 10);
        const ano = parseInt(match[2], 10);
        return ano * 100000 + numSeq;
    }
    const matchSimples = s.match(/^(?:ROM-)?(\d+)$/i);
    if (matchSimples) {
        const numSeq = parseInt(matchSimples[1], 10);
        const ano = new Date().getFullYear();
        return ano * 100000 + numSeq;
    }
    return null;
}

// --- ROTINA DE BACKUP AUTOMÁTICO AGENDADO ---
let ultimoBackupExecutado = '';

function verificarBackupAgendado() {
    setInterval(() => {
        const config = carregarConfigBackup();
        if (!config.ativo || !config.pasta || !config.horarios || config.horarios.length === 0) return;

        const agora = new Date();
        const horaMinuto = agora.getHours().toString().padStart(2, '0') + ':' +
            agora.getMinutes().toString().padStart(2, '0');

        if (config.horarios.includes(horaMinuto) && ultimoBackupExecutado !== horaMinuto) {
            executarBackupAutomatico(config.pasta, horaMinuto);
            ultimoBackupExecutado = horaMinuto;
        }
    }, 30000);
}

async function executarBackupAutomatico(pastaDestino, hora) {
    try {
        if (!fs.existsSync(pastaDestino)) {
            console.error("Pasta de backup não encontrada:", pastaDestino);
            return;
        }

        const data = new Date().toISOString().split('T')[0];
        const nomeArquivo = `backup_geometrica_${data}_${hora.replace(':', '-')}.db`;
        const caminhoFinal = path.join(pastaDestino, nomeArquivo);

        await db.backup(caminhoFinal);
        registrarLog('Sistema', 'BACKUP AUTO', `Cópia de segurança gerada automaticamente em: ${nomeArquivo}`);
        console.log(`Backup automático realizado: ${caminhoFinal}`);
    } catch (err) {
        console.error("Erro no backup automático:", err);
        registrarLog('Sistema', 'ERRO BACKUP', `Falha no backup automático: ${err.message}`);
    }
}

// --- CRIAÇÃO DA JANELA PRINCIPAL ---
function createWindow() {
    splash = new BrowserWindow({
        width: 450,
        height: 350,
        transparent: true,
        frame: false,
        alwaysOnTop: true
    });
    splash.loadFile('splash.html');
    splash.center();

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        show: false,
        icon: path.join(__dirname, 'icon.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            devTools: !app.isPackaged
        }
    });

    Menu.setApplicationMenu(null);
    mainWindow.loadFile('index.html');

    mainWindow.webContents.on('before-input-event', (event, input) => {
        const isControlOrCommand = input.control || input.meta;
        if (input.key === 'F5' || (isControlOrCommand && input.key.toLowerCase() === 'r')) {
            event.preventDefault();
        }
        if (app.isPackaged) {
            if ((isControlOrCommand && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12') {
                event.preventDefault();
            }
        }
    });

    mainWindow.webContents.on('context-menu', (e) => {
        e.preventDefault();
    });

    mainWindow.once('ready-to-show', () => {
        setTimeout(() => {
            splash.close();
            mainWindow.show();
            mainWindow.maximize();
        }, 1200);
    });

    if (app.isPackaged) {
        mainWindow.webContents.on('devtools-opened', () => mainWindow.webContents.closeDevTools());
    }
}

async function sincronizarEspeciesSupabase() {
    try {
        const url = `${SUPABASE_URL}/rest/v1/especies?select=*&order=nome.asc`;
        const response = await fetch(url, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        if (!response.ok) {
            throw new Error(`Erro HTTP ${response.status}: ${response.statusText}`);
        }
        const especiesNuvem = await response.json();
        if (!Array.isArray(especiesNuvem)) {
            throw new Error('Formato inválido retornado pelo Supabase.');
        }

        const insertStmt = db.prepare(`
            INSERT INTO especies (id, nome, cientifico)
            VALUES (@id, @nome, @cientifico)
            ON CONFLICT(id) DO UPDATE SET
                nome = excluded.nome,
                cientifico = excluded.cientifico
        `);

        const transacao = db.transaction((lista) => {
            for (const item of lista) {
                insertStmt.run({
                    id: item.id,
                    nome: item.nome || item.nome_popular || 'Sem Nome',
                    cientifico: item.cientifico || item.nome_cientifico || null
                });
            }
        });

        transacao(especiesNuvem);
        const agora = obterDataLocal();
        db.prepare(`
            INSERT INTO configuracoes_sistema (chave, valor)
            VALUES ('last_sync_especies', ?)
            ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor
        `).run(agora);

        registrarLog('Sistema', 'SYNC', `Sincronizadas ${especiesNuvem.length} espécies do Supabase.`);
        return {
            success: true,
            count: especiesNuvem.length,
            lastSync: agora,
            data: especiesNuvem
        };
    } catch (err) {
        console.warn("⚠️ Falha ao sincronizar espécies com Supabase:", err.message);
        return {
            success: false,
            error: err.message
        };
    }
}

app.whenReady().then(() => {
    createWindow();
    verificarBackupAgendado();

    // Sincronização automática no primeiro acesso / inicialização
    setTimeout(async () => {
        try {
            const countEspecies = db.prepare('SELECT COUNT(*) as count FROM especies').get();
            const lastSync = db.prepare("SELECT valor FROM configuracoes_sistema WHERE chave = 'last_sync_especies'").get();
            if (!lastSync || countEspecies.count === 0) {
                console.log("🌐 Primeiro acesso/sem sincronização de espécies. Iniciando sincronização automática com Supabase...");
                await sincronizarEspeciesSupabase();
            } else {
                sincronizarEspeciesSupabase().catch(() => {});
            }
        } catch (e) {
            console.error("Erro no auto-sync de espécies:", e);
        }
    }, 2500);
});

// --- HELPERS DE SISTEMA ---
function obterDataLocal() {
    const agora = new Date();
    const offset = agora.getTimezoneOffset() * 60000;
    return (new Date(agora - offset)).toISOString().slice(0, 19).replace('T', ' ');
}

function registrarLog(usuario, acao, descricao) {
    try {
        const stmt = db.prepare(`INSERT INTO logs (usuario, acao, descricao, data_hora) VALUES (?, ?, ?, ?)`);
        stmt.run(usuario || 'Operador', acao, descricao, obterDataLocal());
    } catch (err) { console.error("Erro ao registrar log:", err); }
}

// --- HANDLERS: ESPÉCIES (SINCRONIZAÇÃO NUVEM SUPABASE + CACHE LOCAL) ---
ipcMain.handle('get-especies', async () => db.prepare("SELECT * FROM especies ORDER BY nome ASC").all());
ipcMain.handle('listar-especies', async () => db.prepare('SELECT * FROM especies ORDER BY nome ASC').all());
ipcMain.handle('sync-especies-supabase', async () => sincronizarEspeciesSupabase());
ipcMain.handle('get-info-sync-especies', async () => {
    try {
        const total = db.prepare('SELECT COUNT(*) as count FROM especies').get();
        const lastSyncRow = db.prepare("SELECT valor FROM configuracoes_sistema WHERE chave = 'last_sync_especies'").get();
        return {
            total: total ? total.count : 0,
            lastSync: lastSyncRow ? lastSyncRow.valor : null
        };
    } catch (err) {
        return { total: 0, lastSync: null };
    }
});
ipcMain.handle('salvar-especie', async (e, d) => {
    const res = db.prepare('INSERT INTO especies (nome, cientifico) VALUES (?, ?)').run(d.nome, d.cientifico || null);
    registrarLog('Operador', 'Cadastro Espécie', `Espécie criada: ${d.nome}`);
    return { success: true, id: res.lastInsertRowid };
});
ipcMain.handle('editar-especie', async (e, d) => {
    db.prepare('UPDATE especies SET nome = ?, cientifico = ? WHERE id = ?').run(d.nome, d.cientifico || null, d.id);
    registrarLog('Operador', 'Edição Espécie', `Espécie ID ${d.id} atualizada.`);
    return { success: true };
});
ipcMain.handle('excluir-especie', async (e, id) => {
    const check = db.prepare('SELECT COUNT(*) as count FROM toras WHERE especie_id = ?').get(id);
    if (check.count > 0) return { success: false, error: `Não é possível excluir: existem ${check.count} toras desta espécie.` };
    db.prepare('DELETE FROM especies WHERE id = ?').run(id);
    registrarLog('Operador', 'Exclusão Espécie', `Espécie ID ${id} excluída.`);
    return { success: true };
});

// --- HANDLERS: LOTES ---
ipcMain.handle('get-lotes', async () => db.prepare("SELECT * FROM lotes ORDER BY numero ASC").all());
ipcMain.handle('listar-lotes', async () => {
    return db.prepare(`
        SELECT l.*, COUNT(t.id) as total_toras, IFNULL(SUM(t.volume), 0) as volume_total
        FROM lotes l LEFT JOIN toras t ON l.id = t.lote_id AND t.status = 'pátio'
        GROUP BY l.id ORDER BY l.numero DESC
    `).all();
});
ipcMain.handle('salvar-lote', async (e, d) => {
    const res = db.prepare('INSERT INTO lotes (numero, descricao) VALUES (?, ?)').run(d.numero, d.descricao || null);
    registrarLog('Operador', 'Cadastro Lote', `Lote Nome: ${d.numero} criado.`);
    return { success: true, id: res.lastInsertRowid };
});
ipcMain.handle('editar-lote', async (e, data) => {
    try {
        const res = db.prepare('UPDATE lotes SET numero = ?, descricao = ? WHERE id = ?').run(data.numero, data.descricao || null, data.id);
        registrarLog('Operador', 'Edição Lote', `Lote Nome: ${data.numero} atualizado.`);
        return { success: true, changes: res.changes };
    } catch (error) {
        return { success: false, error: error.message };
    }
});
ipcMain.handle('excluir-lote', async (e, id) => {
    const check = db.prepare('SELECT COUNT(*) as count FROM toras WHERE lote_id = ?').get(id);
    if (check.count > 0) {
        throw new Error(`Não é possível excluir: o lote contém ${check.count} toras cadastradas.`);
    }
    const lote = db.prepare('SELECT numero FROM lotes WHERE id = ?').get(id);
    db.prepare('DELETE FROM lotes WHERE id = ?').run(id);
    registrarLog('Operador', 'Exclusão Lote', `Lote Número ${lote ? lote.numero : id} removido.`);
    return { success: true };
});

// --- HANDLERS: FORNECEDORES ---
ipcMain.handle('listar-fornecedores', async () => {
    try {
        return db.prepare("SELECT * FROM fornecedores ORDER BY nome ASC").all();
    } catch (err) {
        console.error("Erro ao listar fornecedores:", err);
        return [];
    }
});
ipcMain.handle('salvar-fornecedor', async (event, data) => {
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
        return { success: false, error: err.message };
    }
});
ipcMain.handle('excluir-fornecedor', async (event, id) => {
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
        return { success: false, error: err.message };
    }
});

// --- HANDLERS: MOTORISTAS ---
ipcMain.handle('listar-motoristas', async () => {
    try {
        return db.prepare("SELECT * FROM motoristas ORDER BY nome ASC").all();
    } catch (err) {
        return [];
    }
});
ipcMain.handle('salvar-motorista', async (event, data) => {
    try {
        if (data.id) {
            db.prepare(`
                UPDATE motoristas SET 
                    nome = ?, cpf = ?, cnh = ?, placa_veiculo = ?, telefone = ?, comissao = ?, salario = ? 
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
        return { success: false, error: err.message };
    }
});
ipcMain.handle('excluir-motorista', async (event, id) => {
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
        return { success: false, error: err.message };
    }
});

// --- HANDLERS: TORAS (CUBAGEM GEOMÉTRICA) ---
ipcMain.handle('salvar-tora', async (event, tora) => {
    try {
        const res = db.prepare(`
            INSERT INTO toras (
                codigo, especie_id, lote_id, romaneio_id, m1, m2, comprimento, volume,
                m1_bruto, m2_bruto, comprimento_bruto, volume_bruto, status, data_entrada
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pátio', ?)
        `).run(
            tora.codigo,
            tora.especie_id || tora.especieId,
            tora.lote_id || tora.loteId,
            tora.romaneio_id || tora.romaneioId || null,
            tora.m1 || 0,
            tora.m2 || 0,
            tora.comprimento || tora.comp || 0,
            tora.volume || 0,
            tora.m1_bruto || tora.m1Bruto || tora.m1 || 0,
            tora.m2_bruto || tora.m2Bruto || tora.m2 || 0,
            tora.comprimento_bruto || tora.compBruto || tora.comprimento || tora.comp || 0,
            tora.volume_bruto || tora.volumeBruto || tora.volume || 0,
            obterDataLocal()
        );

        registrarLog('Operador', 'Entrada', `Cadastrou Tora Número ${tora.codigo}`);
        return { success: true, id: res.lastInsertRowid };
    } catch (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
            throw new Error(`O Número "${tora.codigo}" já está cadastrado.`);
        }
        throw err;
    }
});

ipcMain.handle('editar-tora', async (e, d) => {
    const toraAtual = db.prepare('SELECT status FROM toras WHERE id = ?').get(d.id);
    if (toraAtual?.status === 'serrada') throw new Error("Toras baixadas não podem ser editadas.");

    db.prepare(`
        UPDATE toras SET 
            codigo = ?, especie_id = ?, lote_id = ?, romaneio_id = ?,
            m1 = ?, m2 = ?, comprimento = ?, volume = ?,
            m1_bruto = ?, m2_bruto = ?, comprimento_bruto = ?, volume_bruto = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        d.codigo,
        d.especie_id || d.especieId,
        d.lote_id || d.loteId,
        d.romaneio_id || d.romaneioId || null,
        d.m1 || 0,
        d.m2 || 0,
        d.comprimento || d.comp || 0,
        d.volume || 0,
        d.m1_bruto || d.m1Bruto || d.m1 || 0,
        d.m2_bruto || d.m2Bruto || d.m2 || 0,
        d.comprimento_bruto || d.compBruto || d.comprimento || d.comp || 0,
        d.volume_bruto || d.volumeBruto || d.volume || 0,
        d.id
    );

    registrarLog('Operador', 'Edição', `Editou Tora Número ${d.codigo}`);
    return { success: true };
});

ipcMain.handle('excluir-tora', async (event, id) => {
    const tora = db.prepare('SELECT codigo, status FROM toras WHERE id = ?').get(id);
    if (!tora) throw new Error("Tora não encontrada.");
    if (tora.status === 'serrada') {
        throw new Error(`A Tora Número ${tora.codigo} já foi baixada (serrada) e não pode ser excluída.`);
    }

    db.prepare('DELETE FROM toras WHERE id = ?').run(id);
    registrarLog('Operador', 'Exclusão', `Excluiu a Tora Número ${tora.codigo} do sistema.`);
    return { success: true };
});

ipcMain.handle('get-totais-estoque', async (event, filtros = {}) => {
    try {
        let sql = `SELECT COUNT(*) as total_qtd, SUM(volume) as total_vol FROM toras WHERE 1=1`;
        const params = [];

        if (filtros.status && filtros.status !== 'todos') {
            if (filtros.status.toLowerCase().includes('p')) {
                sql += " AND (status LIKE 'p%tio' OR status = 'pátio' OR status = 'patio')";
            } else if (filtros.status.toLowerCase().includes('ser')) {
                sql += " AND (status LIKE 'ser%' OR status = 'serrada')";
            } else {
                sql += " AND status = ?";
                params.push(filtros.status);
            }
        }
        if (filtros.loteId && filtros.loteId !== 'todos') {
            sql += " AND lote_id = ?";
            params.push(filtros.loteId);
        }
        if (filtros.especieId && filtros.especieId !== 'todos' && filtros.especieId !== 'todas') {
            sql += " AND especie_id = ?";
            params.push(filtros.especieId);
        }
        if (filtros.codigo) {
            sql += " AND (codigo = ? OR CAST(codigo AS INTEGER) = CAST(? AS INTEGER) OR codigo LIKE ?)";
            params.push(filtros.codigo, filtros.codigo, `%${filtros.codigo}%`);
        }

        const result = db.prepare(sql).get(...params);
        return {
            total_qtd: result.total_qtd || 0,
            total_vol: result.total_vol || 0
        };
    } catch (err) {
        return { total_qtd: 0, total_vol: 0 };
    }
});

ipcMain.handle('get-estoque-detalhado', async (event, filtros = {}) => {
    let whereClause = " WHERE 1=1";
    const params = [];

    if (filtros.status && filtros.status !== 'todos') {
        whereClause += " AND t.status = ?";
        params.push(filtros.status);
    }
    if (filtros.loteId && filtros.loteId !== 'todos') {
        whereClause += " AND t.lote_id = ?";
        params.push(filtros.loteId);
    }
    if (filtros.especieId && filtros.especieId !== 'todos' && filtros.especieId !== 'todas') {
        whereClause += " AND t.especie_id = ?";
        params.push(filtros.especieId);
    }
    if (filtros.codigo) {
        whereClause += " AND (t.codigo = ? OR CAST(t.codigo AS INTEGER) = CAST(? AS INTEGER) OR t.codigo LIKE ?)";
        params.push(filtros.codigo, filtros.codigo, `%${filtros.codigo}%`);
    }

    const sqlTotais = `SELECT COUNT(*) as totalQtd, SUM(t.volume) as totalVol FROM toras t ${whereClause}`;
    const totais = db.prepare(sqlTotais).get(...params);

    const sqlLista = `
        SELECT t.*, e.nome as especie_nome, l.numero as lote_numero 
        FROM toras t 
        LEFT JOIN especies e ON t.especie_id = e.id 
        LEFT JOIN lotes l ON t.lote_id = l.id 
        ${whereClause} 
        ORDER BY t.id DESC 
        LIMIT ? OFFSET ?`;

    const limite = filtros.limite || 50;
    const offset = filtros.offset !== undefined ? filtros.offset : (filtros.pular || 0);
    const toras = db.prepare(sqlLista).all(...params, limite, offset);

    return {
        toras: toras,
        totalGeral: totais.totalQtd || 0,
        volumeGeral: totais.totalVol || 0
    };
});

ipcMain.handle('buscar-tora-por-codigo', async (event, codigo) => {
    const query = `
        SELECT t.*, e.nome as especie_nome, l.numero as lote_numero 
        FROM toras t
        LEFT JOIN especies e ON t.especie_id = e.id 
        LEFT JOIN lotes l ON t.lote_id = l.id
        WHERE (t.codigo = ? OR CAST(t.codigo AS INTEGER) = CAST(? AS INTEGER))
          AND t.status = 'pátio'
        LIMIT 1
    `;
    return db.prepare(query).get(codigo, codigo);
});

ipcMain.handle('buscar-tora-por-numero', (event, numero) => {
    const termo = String(numero).trim();
    const sql = `
        SELECT t.*, e.nome as especie_nome, l.numero as lote_nome 
        FROM toras t
        LEFT JOIN especies e ON t.especie_id = e.id 
        LEFT JOIN lotes l ON t.lote_id = l.id
        WHERE TRIM(t.codigo) = ? 
           OR CAST(t.codigo AS INTEGER) = CAST(? AS INTEGER)
           OR t.codigo LIKE ?
        LIMIT 1
    `;
    const tora = db.prepare(sql).get(termo, termo, `%${termo}%`);
    if (tora) return { success: true, data: tora };
    return { success: false, error: "Não localizado." };
});

ipcMain.handle('listar-toras-recentes', async () => {
    return db.prepare(`
        SELECT t.*, e.nome as especie_nome, l.numero as lote_numero 
        FROM toras t 
        LEFT JOIN especies e ON t.especie_id = e.id 
        LEFT JOIN lotes l ON t.lote_id = l.id
        ORDER BY t.id DESC LIMIT 15
    `).all();
});

ipcMain.handle('processar-baixa-lote', async (event, { ids, dataSaida }) => {
    try {
        const dataParaBanco = dataSaida || new Date().toISOString().split('T')[0];
        const dataFormatada = dataParaBanco.split('-').reverse().join('/');

        const placeholders = ids.map(() => '?').join(',');
        const torasSelecionadas = db.prepare(`SELECT codigo FROM toras WHERE id IN (${placeholders})`).all(ids);
        const listaNumeros = torasSelecionadas.map(t => t.codigo).join(', ');

        const update = db.prepare("UPDATE toras SET status = 'serrada', data_saida = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
        const executarTransacao = db.transaction((idsList, dt) => {
            for (const id of idsList) {
                update.run(dt, id);
            }
        });
        executarTransacao(ids, dataParaBanco);

        const mensagemLog = `Baixa de ${ids.length} toras em ${dataFormatada}. Números: [${listaNumeros}]`;
        registrarLog('Operador', 'Baixa', mensagemLog);

        return { success: true };
    } catch (err) {
        console.error("Erro ao processar baixa:", err);
        throw err;
    }
});

ipcMain.handle('estornar-baixa-tora', async (event, idTora, numeroTora) => {
    try {
        const stmt = db.prepare(`UPDATE toras SET status = 'pátio', data_saida = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
        const resultado = stmt.run(idTora);
        if (resultado.changes > 0) {
            registrarLog('Operador', 'ESTORNO', `Estorno de baixa realizado. Tora ${numeroTora} retornou ao pátio.`);
            return { success: true };
        }
        return { success: false, error: 'Registro não encontrado.' };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('reverter-status-tora', async (event, id, codigo) => {
    try {
        const transacao = db.transaction(() => {
            const stmt = db.prepare(`UPDATE toras SET status = 'pátio', data_saida = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
            const info = stmt.run(id);
            if (info.changes === 0) throw new Error("Registro não encontrado.");
            registrarLog('Operador', 'ESTORNO', `O Número ${codigo} retornou ao pátio via estorno.`);
            return true;
        });
        return { success: transacao() };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// --- HANDLERS: ROMANEIOS DE ENTRADA ---
ipcMain.handle('get-proximo-numero-romaneio', async () => {
    try {
        const ano = new Date().getFullYear();
        const existentes = db.prepare(`SELECT numero FROM romaneios WHERE numero LIKE ?`).all(`ROM-%/${ano}`);

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

ipcMain.handle('listar-romaneios', async () => {
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
        return [];
    }
});

ipcMain.handle('salvar-romaneio', async (event, dados) => {
    const execute = db.transaction((dados) => {
        const res = db.prepare(`
            INSERT INTO romaneios (
                numero, data, fornecedor, motorista, observacoes, fornecedor_id, motorista_id, frete_valor, frete_total, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(
            dados.numero,
            dados.data,
            dados.fornecedor || null,
            dados.motorista || null,
            dados.observacoes || null,
            dados.fornecedor_id || null,
            dados.motorista_id || null,
            dados.frete_valor || 0,
            dados.frete_total || 0
        );

        const romaneioId = res.lastInsertRowid;

        if (dados.toras && Array.isArray(dados.toras)) {
            const stmtTora = db.prepare(`
                INSERT INTO toras (
                    codigo, especie_id, lote_id, romaneio_id, m1, m2, comprimento, volume,
                    m1_bruto, m2_bruto, comprimento_bruto, volume_bruto, status, data_entrada
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pátio', ?)
            `);

            for (const tora of dados.toras) {
                const exists = db.prepare('SELECT COUNT(*) as count FROM toras WHERE codigo = ?').get(tora.codigo);
                if (exists.count > 0) {
                    throw new Error(`O Número de tora ${tora.codigo} já está cadastrado no sistema.`);
                }

                stmtTora.run(
                    tora.codigo,
                    tora.especie_id || tora.especieId,
                    tora.lote_id || tora.loteId,
                    romaneioId,
                    tora.m1 || 0,
                    tora.m2 || 0,
                    tora.comprimento || tora.comp || 0,
                    tora.volume || 0,
                    tora.m1_bruto || tora.m1Bruto || tora.m1 || 0,
                    tora.m2_bruto || tora.m2Bruto || tora.m2 || 0,
                    tora.comprimento_bruto || tora.compBruto || tora.comprimento || tora.comp || 0,
                    tora.volume_bruto || tora.volumeBruto || tora.volume || 0,
                    obterDataLocal()
                );
            }
        }

        registrarLog('Operador', 'ROMANEIO', `Romaneio ${dados.numero} criado com ${dados.toras ? dados.toras.length : 0} toras.`);
        return { success: true, id: romaneioId };
    });

    try {
        return execute(dados);
    } catch (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
            if (err.message.includes('romaneios.numero')) return { success: false, error: 'Já existe um romaneio com este número.' };
            if (err.message.includes('toras.codigo')) return { success: false, error: 'Um dos números de tora inseridos já está cadastrado no sistema.' };
        }
        return { success: false, error: err.message };
    }
});

ipcMain.handle('editar-romaneio', async (event, dados) => {
    const execute = db.transaction((dados) => {
        const res = db.prepare(`
            UPDATE romaneios SET 
                numero = ?, data = ?, fornecedor = ?, motorista = ?, observacoes = ?, 
                fornecedor_id = ?, motorista_id = ?, frete_valor = ?, frete_total = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `).run(
            dados.numero,
            dados.data,
            dados.fornecedor || null,
            dados.motorista || null,
            dados.observacoes || null,
            dados.fornecedor_id || null,
            dados.motorista_id || null,
            dados.frete_valor || 0,
            dados.frete_total || 0,
            dados.id
        );

        const romaneioId = dados.id;

        if (dados.torasDeletadas && Array.isArray(dados.torasDeletadas)) {
            const stmtDelete = db.prepare('DELETE FROM toras WHERE id = ?');
            for (const toraDel of dados.torasDeletadas) {
                const t = db.prepare('SELECT codigo, status FROM toras WHERE id = ?').get(toraDel.id);
                if (t) {
                    if (t.status === 'serrada') throw new Error(`A Tora Número ${t.codigo} já foi serrada e não pode ser removida.`);
                    stmtDelete.run(toraDel.id);
                }
            }
        }

        if (dados.toras && Array.isArray(dados.toras)) {
            const stmtInsert = db.prepare(`
                INSERT INTO toras (
                    codigo, especie_id, lote_id, romaneio_id, m1, m2, comprimento, volume,
                    m1_bruto, m2_bruto, comprimento_bruto, volume_bruto, status, data_entrada
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pátio', ?)
            `);

            const stmtUpdate = db.prepare(`
                UPDATE toras SET
                    codigo = ?, especie_id = ?, lote_id = ?, romaneio_id = ?,
                    m1 = ?, m2 = ?, comprimento = ?, volume = ?,
                    m1_bruto = ?, m2_bruto = ?, comprimento_bruto = ?, volume_bruto = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `);

            for (const tora of dados.toras) {
                if (tora.id) {
                    stmtUpdate.run(
                        tora.codigo,
                        tora.especie_id || tora.especieId,
                        tora.lote_id || tora.loteId,
                        romaneioId,
                        tora.m1 || 0,
                        tora.m2 || 0,
                        tora.comprimento || tora.comp || 0,
                        tora.volume || 0,
                        tora.m1_bruto || tora.m1Bruto || tora.m1 || 0,
                        tora.m2_bruto || tora.m2Bruto || tora.m2 || 0,
                        tora.comprimento_bruto || tora.compBruto || tora.comprimento || tora.comp || 0,
                        tora.volume_bruto || tora.volumeBruto || tora.volume || 0,
                        tora.id
                    );
                } else {
                    const exists = db.prepare('SELECT COUNT(*) as count FROM toras WHERE codigo = ?').get(tora.codigo);
                    if (exists.count > 0) throw new Error(`O Número de tora ${tora.codigo} já está cadastrado no sistema.`);

                    stmtInsert.run(
                        tora.codigo,
                        tora.especie_id || tora.especieId,
                        tora.lote_id || tora.loteId,
                        romaneioId,
                        tora.m1 || 0,
                        tora.m2 || 0,
                        tora.comprimento || tora.comp || 0,
                        tora.volume || 0,
                        tora.m1_bruto || tora.m1Bruto || tora.m1 || 0,
                        tora.m2_bruto || tora.m2Bruto || tora.m2 || 0,
                        tora.comprimento_bruto || tora.compBruto || tora.comprimento || tora.comp || 0,
                        tora.volume_bruto || tora.volumeBruto || tora.volume || 0,
                        obterDataLocal()
                    );
                }
            }
        }

        registrarLog('Operador', 'ROMANEIO', `Romaneio ${dados.numero} atualizado.`);
        return { success: true, changes: res.changes };
    });

    try {
        return execute(dados);
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('excluir-romaneio', async (event, id) => {
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

ipcMain.handle('get-romaneio-detalhado', async (event, romaneioId) => {
    try {
        const queryRom = `
            SELECT r.*, f.nome as fornecedor_nome, m.nome as motorista_nome
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

ipcMain.handle('get-romaneios-select', async () => {
    try {
        return db.prepare('SELECT id, numero, data FROM romaneios ORDER BY data DESC, id DESC').all();
    } catch (err) {
        return [];
    }
});

// --- HANDLERS: FINANCEIRO DE MOTORISTAS (FECHAMENTOS E VALES) ---
ipcMain.handle('salvar-vale-motorista', async (event, vale) => {
    try {
        if (vale.id) {
            db.prepare(`
                UPDATE motorista_vales SET
                    motorista_id = ?, valor = ?, data = ?, descricao = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(vale.motorista_id, vale.valor, vale.data, vale.descricao || null, vale.id);
            registrarLog('Operador', 'Edição Vale', `Vale ID ${vale.id} editado.`);
            return { success: true };
        } else {
            const res = db.prepare(`
                INSERT INTO motorista_vales (motorista_id, valor, data, descricao, status, updated_at)
                VALUES (?, ?, ?, ?, 'aberto', CURRENT_TIMESTAMP)
            `).run(vale.motorista_id, vale.valor, vale.data, vale.descricao || null);
            registrarLog('Operador', 'Cadastro Vale', `Vale no valor de R$ ${vale.valor} lançado.`);
            return { success: true, id: res.lastInsertRowid };
        }
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('excluir-vale-motorista', async (event, id) => {
    try {
        const vale = db.prepare("SELECT status FROM motorista_vales WHERE id = ?").get(id);
        if (vale && vale.status === 'pago') {
            return { success: false, error: "Não é possível excluir um vale que já foi descontado em um fechamento." };
        }
        db.prepare("DELETE FROM motorista_vales WHERE id = ?").run(id);
        registrarLog('Operador', 'Exclusão Vale', `Vale ID ${id} excluído.`);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('listar-vales-motorista', async (event, filtros = {}) => {
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
        return [];
    }
});

ipcMain.handle('calcular-previa-fechamento', async (event, filtros) => {
    try {
        const { motoristaId, dataInicio, dataFim, romaneioInicio, romaneioFim } = filtros;
        const motorista = db.prepare("SELECT nome, salario, comissao FROM motoristas WHERE id = ?").get(motoristaId);
        if (!motorista) return { success: false, error: "Motorista não encontrado." };

        let sqlCargas = `
            SELECT r.id, r.numero, r.data, r.frete_total, r.frete_valor,
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
            const valInicio = parseRomaneioParaOrdenacao(romaneioInicio);
            const valFim = parseRomaneioParaOrdenacao(romaneioFim);
            if (valInicio !== null && valFim !== null) {
                sqlCargas += " AND (CAST(SUBSTR(r.numero, -4) AS INTEGER) * 100000 + CAST(SUBSTR(REPLACE(r.numero, 'ROM-', ''), 1, INSTR(REPLACE(r.numero, 'ROM-', ''), '/') - 1) AS INTEGER)) BETWEEN ? AND ?";
                paramsCargas.push(valInicio, valFim);
            }
        }
        sqlCargas += " GROUP BY r.id ORDER BY r.data ASC, r.id ASC";

        const cargas = db.prepare(sqlCargas).all(...paramsCargas);
        const totalComissao = cargas.reduce((sum, c) => sum + (c.valor_comissao || 0), 0);

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
        return { success: false, error: err.message };
    }
});

ipcMain.handle('salvar-fechamento-motorista', async (event, dados) => {
    const execute = db.transaction((dados) => {
        const res = db.prepare(`
            INSERT INTO motorista_fechamentos (
                motorista_id, data_fechamento, periodo_inicio, periodo_fim,
                romaneio_inicio, romaneio_fim, valor_salario, valor_comissao,
                valor_vales, valor_liquido, observacoes, updated_at
            ) VALUES (?, CURRENT_DATE, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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

        if (dados.valesIds && Array.isArray(dados.valesIds) && dados.valesIds.length > 0) {
            const stmtVale = db.prepare(`
                UPDATE motorista_vales 
                SET status = 'pago', fechamento_id = ?, updated_at = CURRENT_TIMESTAMP
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
        return { success: false, error: err.message };
    }
});

ipcMain.handle('listar-fechamentos-motorista', async (event, filtros = {}) => {
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
        return [];
    }
});

ipcMain.handle('excluir-fechamento-motorista', async (event, id) => {
    const execute = db.transaction((id) => {
        db.prepare(`
            UPDATE motorista_vales 
            SET status = 'aberto', fechamento_id = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE fechamento_id = ?
        `).run(id);

        db.prepare("DELETE FROM motorista_fechamentos WHERE id = ?").run(id);
        registrarLog('Operador', 'Estorno Fechamento', `Fechamento ID ${id} estornado.`);
        return { success: true };
    });

    try {
        return execute(id);
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('get-fechamento-detalhado', async (event, id) => {
    try {
        const fechamento = db.prepare(`
            SELECT f.*, m.nome as motorista_nome, m.placa_veiculo, m.comissao as motorista_comissao_pct
            FROM motorista_fechamentos f
            JOIN motoristas m ON f.motorista_id = m.id
            WHERE f.id = ?
        `).get(id);

        if (!fechamento) return { success: false, error: "Fechamento não encontrado." };

        let sqlCargas = `
            SELECT r.id, r.numero, r.data, r.frete_total, r.frete_valor,
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
            const valInicio = parseRomaneioParaOrdenacao(fechamento.romaneio_inicio);
            const valFim = parseRomaneioParaOrdenacao(fechamento.romaneio_fim);
            if (valInicio !== null && valFim !== null) {
                sqlCargas += " AND (CAST(SUBSTR(r.numero, -4) AS INTEGER) * 100000 + CAST(SUBSTR(REPLACE(r.numero, 'ROM-', ''), 1, INSTR(REPLACE(r.numero, 'ROM-', ''), '/') - 1) AS INTEGER)) BETWEEN ? AND ?";
                paramsCargas.push(valInicio, valFim);
            }
        } else {
            sqlCargas += " AND r.data BETWEEN ? AND ?";
            paramsCargas.push(fechamento.periodo_inicio, fechamento.periodo_fim);
        }
        sqlCargas += " GROUP BY r.id ORDER BY r.data ASC, r.id ASC";

        const cargas = db.prepare(sqlCargas).all(...paramsCargas);

        const vales = db.prepare(`
            SELECT id, valor, data, descricao 
            FROM motorista_vales 
            WHERE fechamento_id = ?
            ORDER BY data ASC
        `).all(id);

        return { success: true, fechamento, cargas, vales };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// --- HANDLERS: RELATÓRIOS ---
ipcMain.handle('buscar-dados-relatorio', async (e, f) => {
    let sql = `SELECT t.*, e.nome as especie_nome, l.numero as lote_numero FROM toras t
               LEFT JOIN especies e ON t.especie_id = e.id 
               LEFT JOIN lotes l ON t.lote_id = l.id WHERE 1=1`;
    const params = [];
    if (f.tipo === 'baixas') sql += " AND t.status = 'serrada'";
    else if (f.tipo === 'entradas' || f.tipo === 'estoque') sql += " AND t.status = 'pátio'";

    if (f.dataInicio && f.dataFim) {
        sql += (f.tipo === 'baixas') ? " AND date(t.data_saida) BETWEEN ? AND ?" : " AND date(t.data_entrada) BETWEEN ? AND ?";
        params.push(f.dataInicio, f.dataFim);
    }
    if (f.especieId && f.especieId !== 'todas') { sql += " AND t.especie_id = ?"; params.push(f.especieId); }
    if (f.loteId && f.loteId !== 'todos') { sql += " AND t.lote_id = ?"; params.push(f.loteId); }
    return db.prepare(sql + " ORDER BY t.data_entrada DESC").all(...params);
});

ipcMain.handle('get-resumo-gerencial', async (event, filtros) => {
    let sql = `
        SELECT t.volume, t.status, e.nome as especie_nome, l.numero as lote_numero 
        FROM toras t 
        LEFT JOIN especies e ON t.especie_id = e.id 
        LEFT JOIN lotes l ON t.lote_id = l.id 
        WHERE 1=1`;
    const params = [];

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

    const dados = db.prepare(sql).all(...params);
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
});

ipcMain.handle('buscar-dados-relatorio-paginado', async (event, filtros) => {
    let sql = `
        SELECT t.*, e.nome as especie_nome, l.numero as lote_numero 
        FROM toras t 
        LEFT JOIN especies e ON t.especie_id = e.id 
        LEFT JOIN lotes l ON t.lote_id = l.id 
        WHERE 1=1`;
    const params = [];

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

    sql += " ORDER BY t.data_entrada DESC LIMIT ? OFFSET ?";
    params.push(filtros.limite || 50, filtros.pular || 0);

    return db.prepare(sql).all(...params);
});

ipcMain.handle('relatorio-entradas-fornecedor', async (event, filtros) => {
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
        return [];
    }
});

ipcMain.handle('relatorio-cargas-motorista', async (event, filtros) => {
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
        return [];
    }
});

// --- HANDLERS: LOGS ---
ipcMain.handle('listar-logs', async (event, filtros = {}) => {
    const { acao, dataInicio, dataFim, limiteInicial } = filtros;
    let sql = "SELECT * FROM logs WHERE 1=1";
    let params = [];
    if (acao && acao !== 'todos') {
        sql += " AND LOWER(acao) LIKE LOWER(?)";
        params.push(`%${acao}%`);
    }
    if (dataInicio) { sql += " AND date(data_hora) >= date(?)"; params.push(dataInicio); }
    if (dataFim) { sql += " AND date(data_hora) <= date(?)"; params.push(dataFim); }
    sql += " ORDER BY data_hora DESC LIMIT " + (limiteInicial || 500);
    const logs = db.prepare(sql).all(...params);
    return { success: true, data: logs };
});

ipcMain.handle('gerar-pdf-logs', async (event, html) => {
    let winPDF = new BrowserWindow({ show: false });
    await winPDF.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdfData = await winPDF.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
    const filePath = path.join(app.getPath('documents'), `Relatorio_${Date.now()}.pdf`);
    fs.writeFileSync(filePath, pdfData);
    shell.showItemInFolder(filePath);
    winPDF.close();
    return { success: true };
});

// --- DASHBOARD (ESTATÍSTICAS & HISTÓRICO DE MOVIMENTAÇÃO PARA SVG) ---
ipcMain.handle('get-dashboard-data', () => {
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
            const mesFormatado = d.toISOString().substring(0, 7);
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

// --- BACKUP E CONFIGURAÇÕES ---
ipcMain.handle('get-backup-config', async () => carregarConfigBackup());

ipcMain.handle('set-backup-config', async (e, config) => {
    const ok = salvarConfigBackup(config);
    return { success: ok };
});

ipcMain.handle('selecionar-pasta-backup', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Selecione a pasta para o Backup Automático'
    });
    if (result.canceled) return null;
    return result.filePaths[0];
});

ipcMain.handle('exportar-backup', async () => {
    try {
        const dataHoje = new Date().toISOString().split('T')[0];
        const nomeSugerido = `Backup_Toras_Geometrica_${dataHoje}.db`;

        const { filePath, canceled } = await dialog.showSaveDialog({
            title: 'Exportar Backup do Estoque',
            defaultPath: nomeSugerido,
            filters: [{ name: 'SQLite Database', extensions: ['db'] }]
        });

        if (canceled || !filePath) return { success: false, message: 'Operação cancelada.' };

        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        db.prepare(`VACUUM INTO '${filePath}'`).run();

        registrarLog('Operador', 'BACKUP', `Backup exportado com sucesso para: ${filePath}`);
        return { success: true, message: 'Backup realizado com sucesso!', path: filePath };
    } catch (error) {
        return { success: false, message: 'Falha ao gerar backup: ' + error.message };
    }
});

ipcMain.handle('importar-backup', async () => {
    try {
        const { filePaths, canceled } = await dialog.showOpenDialog({
            title: 'Selecionar Backup para Restaurar',
            filters: [{ name: 'SQLite Database', extensions: ['db'] }],
            properties: ['openFile']
        });

        if (canceled || filePaths.length === 0) return { success: false, message: 'Operação cancelada.' };

        const backupPath = filePaths[0];
        let tempDb;
        try {
            tempDb = new Database(backupPath, { readonly: true });
            const checkTable = tempDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='toras'").get();
            if (!checkTable) {
                tempDb.close();
                return { success: false, message: 'Arquivo inválido: Tabela de toras não encontrada.' };
            }
            tempDb.close();
        } catch (err) {
            if (tempDb) tempDb.close();
            return { success: false, message: 'O arquivo selecionado não é um banco de dados válido.' };
        }

        const backupSeguranca = dbPath + '.old';
        try {
            if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, backupSeguranca);
            fs.copyFileSync(backupPath, dbPath);
            if (fs.existsSync(backupSeguranca)) fs.unlinkSync(backupSeguranca);

            return { success: true, message: 'Dados restaurados com sucesso! O sistema será reiniciado.' };
        } catch (copyError) {
            if (fs.existsSync(backupSeguranca)) fs.copyFileSync(backupSeguranca, dbPath);
            return { success: false, message: 'Erro ao copiar banco: ' + copyError.message };
        }
    } catch (error) {
        return { success: false, message: 'Erro crítico: ' + error.message };
    }
});

ipcMain.handle('limpar-banco-dados', async () => {
    db.transaction(() => {
        db.prepare('DELETE FROM toras').run();
        db.prepare('DELETE FROM romaneios').run();
        db.prepare('DELETE FROM motorista_vales').run();
        db.prepare('DELETE FROM motorista_fechamentos').run();
        db.prepare('DELETE FROM motoristas').run();
        db.prepare('DELETE FROM fornecedores').run();
        db.prepare('DELETE FROM lotes').run();
        db.prepare('DELETE FROM especies').run();
        db.prepare("DELETE FROM logs").run();
    })();
    return { success: true };
});

ipcMain.handle('get-machine-id', () => {
    try {
        return getHardwareId();
    } catch (e) {
        return machineIdSync();
    }
});

ipcMain.handle('get-hardware-id', () => {
    try {
        return getHardwareId();
    } catch (e) {
        return crypto.createHash('sha256').update(os.hostname() || 'fallback').digest('hex');
    }
});

ipcMain.handle('check-activation-status', () => {
    verificarLicencaLocal();
    return {
        ativado: sistemaAtivado,
        motivo: motivoBloqueio
    };
});

ipcMain.handle('ativar-sistema', async (event, chaveDigitada) => {
    try {
        if (!chaveDigitada || !chaveDigitada.trim()) {
            return { success: false, error: 'Chave de ativação não informada.' };
        }

        const idHardware = getHardwareId();
        let licencaPacote;
        try {
            const jsonString = Buffer.from(chaveDigitada.trim(), 'base64').toString('utf8');
            licencaPacote = JSON.parse(jsonString);
        } catch (e) {
            return { success: false, error: 'Chave de licença em formato inválido ou corrompida.' };
        }

        if (!licencaPacote || !licencaPacote.data || !licencaPacote.signature) {
            return { success: false, error: 'Chave de licença incompleta ou corrompida.' };
        }

        const { data, signature } = licencaPacote;

        if (data.mid !== idHardware) {
            return { success: false, error: 'Esta chave de licença não pertence a este computador.' };
        }

        const dadosString = JSON.stringify(data);
        const verifier = crypto.createVerify('SHA256');
        verifier.update(dadosString);
        const assinaturaValida = verifier.verify(CHAVE_PUBLICA_RSA, signature, 'base64');

        if (!assinaturaValida) {
            return { success: false, error: 'Assinatura digital inválida. Chave de ativação falsificada!' };
        }

        const agora = new Date();
        const expiraEm = new Date(data.exp);
        if (agora > expiraEm) {
            return { success: false, error: 'A chave de licença fornecida já está expirada.' };
        }

        const appData = app.getPath('userData');
        const pastaLicenca = path.join(appData, 'toracontrol-geometrica');
        const arquivoLicenca = path.join(pastaLicenca, 'license.dat');

        if (!fs.existsSync(pastaLicenca)) {
            fs.mkdirSync(pastaLicenca, { recursive: true });
        }

        const novaLicenca = {
            token: chaveDigitada.trim(),
            last_seen: agora.toISOString()
        };

        fs.writeFileSync(arquivoLicenca, criptografar(JSON.stringify(novaLicenca)));

        sistemaAtivado = true;
        motivoBloqueio = 'ok';
        return { success: true, validade: expiraEm.toLocaleDateString('pt-BR') };
    } catch (err) {
        console.error("Erro na ativação do sistema:", err.message);
        return { success: false, error: 'Erro ao processar ativação: ' + err.message };
    }
});

ipcMain.handle('auth-save-local-license', async (event, dados) => {
    try {
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO licenca_local 
            (id, email, machine_id, status_licenca, data_validade, senha_hash, salt, ultimo_login) 
            VALUES (@id, @email, @machine_id, @status_licenca, @data_validade, @senha_hash, @salt, @ultimo_login)
        `);
        stmt.run({
            id: dados.id,
            email: dados.email.toLowerCase().trim(),
            machine_id: dados.machine_id,
            status_licenca: dados.status_licenca,
            data_validade: dados.data_validade || null,
            senha_hash: dados.senha_hash,
            salt: dados.salt,
            ultimo_login: new Date().toISOString()
        });
        return { success: true };
    } catch (err) {
        console.error("Erro ao salvar licença local:", err.message);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('auth-login-offline', async (event, email) => {
    try {
        const row = db.prepare(`SELECT * FROM licenca_local WHERE LOWER(email) = ?`).get(email.toLowerCase().trim());
        if (!row) {
            return { success: false, error: 'Usuário não encontrado localmente. O primeiro acesso precisa ser feito online.' };
        }
        return { success: true, user: row };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('auth-update-offline-login', async (event, id) => {
    try {
        db.prepare(`UPDATE licenca_local SET ultimo_login = ? WHERE id = ?`).run(new Date().toISOString(), id);
        return { success: true };
    } catch (e) {
        return { success: false };
    }
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

