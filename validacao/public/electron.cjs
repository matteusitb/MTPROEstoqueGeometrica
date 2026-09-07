const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { autoUpdater } = require('electron-updater');

let db;
let SQLInstance = null;
let mainWindow;

// --- SEGURANÇA E ATIVAÇÃO ---
let sistemaAtivado = false;
let motivoBloqueio = 'unactivated';

const _s = [77, 65, 68, 69, 73, 82, 65, 50, 48, 50, 54]; // MADEIRA2026
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

async function verificarLicencaLocal() {
  const appData = app.getPath('userData');
  const pastaBase = path.join(appData, 'romaneio-madeira');
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
        console.error("Estrutura do arquivo de licença local inválida.");
        sistemaAtivado = false;
        motivoBloqueio = 'unactivated';
        return false;
      }

      // 1. Decodificar o token RSA original e validar sua assinatura digital RSA
      let licencaPacote;
      try {
        const jsonString = Buffer.from(licencaLocal.token, 'base64').toString('utf8');
        licencaPacote = JSON.parse(jsonString);
      } catch (e) {
        console.error("Erro ao decodificar token RSA salvo localmente.");
        sistemaAtivado = false;
        motivoBloqueio = 'unactivated';
        return false;
      }

      if (!licencaPacote || !licencaPacote.data || !licencaPacote.signature) {
        console.error("Token de licença salvo localmente está incompleto ou corrompido.");
        sistemaAtivado = false;
        motivoBloqueio = 'unactivated';
        return false;
      }

      const { data, signature } = licencaPacote;
      
      // Valida assinatura RSA
      const dadosString = JSON.stringify(data);
      const verifier = crypto.createVerify('SHA256');
      verifier.update(dadosString);
      const assinaturaValida = verifier.verify(CHAVE_PUBLICA_RSA, signature, 'base64');

      if (!assinaturaValida) {
        console.error("🚨 CRÍTICO: Assinatura digital da licença local é inválida! Adulteração detectada.");
        sistemaAtivado = false;
        motivoBloqueio = 'unactivated';
        return false;
      }

      // 2. Valida o Hardware ID
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

      // 3. Verifica Expiração
      if (agora > exp) {
        console.error(`Licença expirou em: ${data.exp}`);
        sistemaAtivado = false;
        motivoBloqueio = 'expired';
        return false;
      }

      // 4. ANTI-FRAUDE: Relógio Retrocedido (comparando com last_seen da licença)
      if (agora < lastSeen) {
        console.error("🚨 DETECÇÃO DE FRAUDE: Relógio do computador retrocedido!");
        sistemaAtivado = false;
        motivoBloqueio = 'fraud';
        return false;
      }

      // 5. ANTI-FRAUDE: Relógio Retrocedido (comparando com a maior data de romaneio salva no banco)
      if (db) {
        try {
          const stmt = db.prepare("SELECT data FROM romaneios ORDER BY data DESC LIMIT 1");
          let result = [];
          while (stmt.step()) {
            result.push(stmt.getAsObject());
          }
          stmt.free();
          
          if (result.length > 0 && result[0].data) {
            const dataUltimoRomaneio = new Date(result[0].data + "T12:00:00");
            const hojeSemHora = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
            const romaneioSemHora = new Date(dataUltimoRomaneio.getFullYear(), dataUltimoRomaneio.getMonth(), dataUltimoRomaneio.getDate());
            
            if (hojeSemHora < romaneioSemHora) {
              console.error("🚨 DETECÇÃO DE FRAUDE: O relógio do computador é anterior à data do último romaneio salvo no banco de dados!");
              sistemaAtivado = false;
              motivoBloqueio = 'fraud';
              return false;
            }
          }
        } catch (e) {
          // Ignora
        }
      }

      // Atualiza last_seen localmente
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

function protectedHandle(channel, callback) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!sistemaAtivado) {
      console.warn(`Tentativa de acesso ao canal protegido '${channel}' sem ativação ativa.`);
      return { success: false, error: 'Sistema bloqueado. Por favor, ative a licença de uso do sistema.' };
    }
    return callback(event, ...args);
  });
}

function applyMigrations(targetDb) {
  // Garantir a tabela de licença local para suporte a login offline
  try {
    targetDb.run(`
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
    `);
  } catch (e) {
    console.error('Erro ao criar tabela licenca_local:', e.message);
  }

  // Executar migrações seguras no banco já existente
  try {
    targetDb.run(`ALTER TABLE especies ADD COLUMN cientifico TEXT`);
  } catch (e) {
    // Coluna já existe, ignora
  }

  try {
    targetDb.run(`ALTER TABLE romaneio_pacotes ADD COLUMN especie_id INTEGER`);
  } catch (e) {
    // Coluna já existe, ignora
  }

  try {
    targetDb.run(`ALTER TABLE romaneios ADD COLUMN tipo_romaneio TEXT DEFAULT 'padrao'`);
  } catch (e) {
    // Coluna já existe, ignora
  }
}

async function initDB() {
  if (!SQLInstance) {
    SQLInstance = await initSqlJs();
  }
  const dbPath = path.join(app.getPath('userData'), 'romaneios.sqlite');
  
  if (fs.existsSync(dbPath)) {
    const filebuffer = fs.readFileSync(dbPath);
    db = new SQLInstance.Database(filebuffer);
  } else {
    db = new SQLInstance.Database();
    // Initialize schema
    db.run(`
      CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS especies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        cientifico TEXT
      );
      CREATE TABLE IF NOT EXISTS romaneios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data TEXT NOT NULL,
        cliente_id INTEGER,
        especie_id INTEGER,
        total_m3 REAL,
        total_ml REAL,
        status TEXT
      );
      CREATE TABLE IF NOT EXISTS romaneio_pacotes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        romaneio_id INTEGER,
        numero_pacote INTEGER,
        total_m3 REAL,
        total_ml REAL,
        especie_id INTEGER
      );
      CREATE TABLE IF NOT EXISTS romaneio_itens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pacote_id INTEGER,
        espessura REAL,
        largura REAL,
        comprimento REAL,
        quantidade INTEGER,
        volume_m3 REAL,
        volume_ml REAL
      );
    `);
  }

  applyMigrations(db);

  // Verificar se a tabela especies precisa ser populada com o dump oficial
  try {
    let dumpJaRodou = false;
    try {
      const checkAmapa = db.exec("SELECT id FROM especies WHERE nome = 'Amapá'");
      dumpJaRodou = checkAmapa.length > 0 && checkAmapa[0].values.length > 0;
    } catch (e) {
      dumpJaRodou = false;
    }
    
    if (!dumpJaRodou) {
      const pathsToTry = [
        path.join(app.getAppPath(), '..', 'especies.sql'),
        path.join(app.getAppPath(), 'especies.sql'),
        path.join(process.cwd(), 'especies.sql'),
        path.join(process.cwd(), '..', 'especies.sql'),
        'especies.sql'
      ];
      
      let sqlPath = '';
      for (const p of pathsToTry) {
        if (fs.existsSync(p)) {
          sqlPath = p;
          break;
        }
      }

      if (sqlPath) {
        const sqlContent = fs.readFileSync(sqlPath, 'utf8');
        db.run("DROP TABLE IF EXISTS especies");
        db.run(sqlContent);
        console.log(`Tabela especies dropada e populada com sucesso a partir de ${sqlPath}`);
      } else {
        console.warn('Arquivo especies.sql não foi encontrado nos caminhos buscados.');
      }
    }
  } catch (err) {
    console.error('Erro ao verificar ou popular a tabela especies:', err.message);
  }

  saveDB();
}

function saveDB() {
  const data = db.export();
  const buffer = Buffer.from(data);
  const dbPath = path.join(app.getPath('userData'), 'romaneios.sqlite');
  const tmpPath = path.join(app.getPath('userData'), 'romaneios.sqlite.tmp');
  try {
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, dbPath);
  } catch (err) {
    console.error('Erro na escrita atômica do banco de dados:', err.message);
    // Fallback de contingência
    fs.writeFileSync(dbPath, buffer);
  }
}

function getDbFilePath() {
  return path.join(app.getPath('userData'), 'romaneios.sqlite');
}

// ─── CONFIG DE BACKUP ────────────────────────────────────────────────────────

function getBackupConfigPath() {
  return path.join(app.getPath('userData'), 'backup-config.json');
}

function readBackupConfig() {
  const cfgPath = getBackupConfigPath();
  if (fs.existsSync(cfgPath)) {
    try {
      return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    } catch (e) {
      return {};
    }
  }
  return {};
}

function writeBackupConfig(config) {
  fs.writeFileSync(getBackupConfigPath(), JSON.stringify(config, null, 2), 'utf8');
}

function doAutoBackup() {
  const cfg = readBackupConfig();
  if (!cfg.autoBackupEnabled || !cfg.backupFolder) return;
  const backupFolder = cfg.backupFolder;
  if (!fs.existsSync(backupFolder)) {
    try { fs.mkdirSync(backupFolder, { recursive: true }); } catch (e) { return; }
  }
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const destPath = path.join(backupFolder, `romaneios_backup_${ts}.sqlite`);
  try {
    saveDB();
    fs.copyFileSync(getDbFilePath(), destPath);
    writeBackupConfig({ ...cfg, lastAutoBackup: now.toISOString() });
    console.log(`[Auto-Backup] Backup realizado: ${destPath}`);
  } catch (e) {
    console.error('[Auto-Backup] Falha:', e.message);
  }
}

function scheduleAutoBackup() {
  // Checagem roda a cada 30 segundos para não perder o minuto exato
  setInterval(() => {
    const c = readBackupConfig();
    if (!c.autoBackupEnabled || !c.backupFolder) return;
    
    // Prioridade: se o usuário configurou horários específicos (ex: ["18:00", "12:00"])
    if (c.backupHours && Array.isArray(c.backupHours) && c.backupHours.length > 0) {
      const now = new Date();
      // Pega hora e minuto atual no formato local
      const currentHourMinute = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      
      if (c.backupHours.includes(currentHourMinute)) {
        // Para evitar disparar várias vezes no mesmo minuto
        if (c.lastAutoBackup) {
          const last = new Date(c.lastAutoBackup);
          if (now - last < 5 * 60 * 1000) return; // Só roda se o último foi há mais de 5 minutos
        }
        doAutoBackup();
      }
    } else {
      // Fallback: Lógica legada de frequência (ex: a cada 24h)
      const frequencyHours = { 'diario': 24, 'semanal': 168, 'quinzenal': 360, 'mensal': 720 };
      const h = (frequencyHours[c.frequency] || 24) * 60 * 60 * 1000;
      if (c.lastAutoBackup) {
        if (new Date() - new Date(c.lastAutoBackup) >= h) doAutoBackup();
      } else {
        doAutoBackup();
      }
    }
  }, 30 * 1000); // 30 segundos
}

// ─── APP INIT ────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:') || url.startsWith('whatsapp:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    Menu.setApplicationMenu(null);
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(async () => {
  await initDB();
  await verificarLicencaLocal();
  scheduleAutoBackup();
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC: DB QUERY ───────────────────────────────────────────────────────────

protectedHandle('db-query', (event, query, params) => {
  try {
    const stmt = db.prepare(query);
    if (params) {
      stmt.bind(params);
    }
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return { success: true, data: results };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

protectedHandle('db-execute', (event, query, params) => {
  try {
    if (params) {
      const stmt = db.prepare(query);
      stmt.run(params);
      stmt.free();
    } else {
      db.run(query);
    }
    saveDB();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Helper to get or insert
function getOrInsert(tableName, nome) {
  let stmt = db.prepare(`SELECT id FROM ${tableName} WHERE nome = ?`);
  stmt.bind([nome]);
  if (stmt.step()) {
    const id = stmt.getAsObject().id;
    stmt.free();
    return id;
  }
  stmt.free();
  
  db.run(`INSERT INTO ${tableName} (nome) VALUES (?)`, [nome]);
  const res = db.exec("SELECT last_insert_rowid() as id");
  return res[0].values[0][0];
}

// Helper to get or insert especie (case-insensitive)
function getOrInsertEspecie(nome) {
  if (!nome) return null;
  const cleanNome = nome.trim();
  if (!cleanNome) return null;
  
  let stmt = db.prepare(`SELECT id FROM especies WHERE LOWER(nome) = LOWER(?)`);
  stmt.bind([cleanNome]);
  if (stmt.step()) {
    const id = stmt.getAsObject().id;
    stmt.free();
    return id;
  }
  stmt.free();
  
  db.run(`INSERT INTO especies (nome) VALUES (?)`, [cleanNome]);
  const res = db.exec("SELECT last_insert_rowid() as id");
  return res[0].values[0][0];
}

protectedHandle('save-romaneio', (event, data) => {
  try {
    const cliente_id = getOrInsert('clientes', data.cliente);

    let firstEspecieId = null;
    if (data.pacotes && data.pacotes.length > 0) {
      firstEspecieId = getOrInsertEspecie(data.pacotes[0].especie);
    }

    db.run(
      `INSERT INTO romaneios (data, cliente_id, especie_id, total_m3, total_ml, status, tipo_romaneio) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.data, cliente_id, firstEspecieId, data.total_m3, data.total_ml, 'Ativo', data.tipo_romaneio || 'padrao']
    );
    const romaneio_id = db.exec("SELECT last_insert_rowid()")[0].values[0][0];

    data.pacotes.forEach(p => {
      const especie_id = getOrInsertEspecie(p.especie);
      db.run(
        `INSERT INTO romaneio_pacotes (romaneio_id, numero_pacote, total_m3, total_ml, especie_id) VALUES (?, ?, ?, ?, ?)`,
        [romaneio_id, p.numero_pacote, p.total_m3, p.total_ml, especie_id]
      );
      const pacote_id = db.exec("SELECT last_insert_rowid()")[0].values[0][0];

      p.itens.forEach(item => {
        db.run(
          `INSERT INTO romaneio_itens (pacote_id, espessura, largura, comprimento, quantidade, volume_m3, volume_ml) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [pacote_id, item.espessura, item.largura, item.comprimento, item.quantidade, item.volume_m3, item.volume_ml]
        );
      });
    });

    saveDB();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

protectedHandle('update-romaneio', (event, data) => {
  try {
    const { id } = data;

    const cliente_id = getOrInsert('clientes', data.cliente);

    let firstEspecieId = null;
    if (data.pacotes && data.pacotes.length > 0) {
      firstEspecieId = getOrInsertEspecie(data.pacotes[0].especie);
    }

    db.run(
      `UPDATE romaneios SET data = ?, cliente_id = ?, especie_id = ?, total_m3 = ?, total_ml = ?, tipo_romaneio = ? WHERE id = ?`,
      [data.data, cliente_id, firstEspecieId, data.total_m3, data.total_ml, data.tipo_romaneio || 'padrao', id]
    );

    const oldPackages = db.exec(`SELECT id FROM romaneio_pacotes WHERE romaneio_id = ${id}`);
    if (oldPackages.length > 0) {
      const pacoteIds = oldPackages[0].values.map(v => v[0]);
      pacoteIds.forEach(pid => {
        db.run(`DELETE FROM romaneio_itens WHERE pacote_id = ${pid}`);
      });
    }
    db.run(`DELETE FROM romaneio_pacotes WHERE romaneio_id = ${id}`);

    data.pacotes.forEach(p => {
      const especie_id = getOrInsertEspecie(p.especie);
      db.run(
        `INSERT INTO romaneio_pacotes (romaneio_id, numero_pacote, total_m3, total_ml, especie_id) VALUES (?, ?, ?, ?, ?)`,
        [id, p.numero_pacote, p.total_m3, p.total_ml, especie_id]
      );
      const pacote_id = db.exec("SELECT last_insert_rowid()")[0].values[0][0];

      p.itens.forEach(item => {
        db.run(
          `INSERT INTO romaneio_itens (pacote_id, espessura, largura, comprimento, quantidade, volume_m3, volume_ml) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [pacote_id, item.espessura, item.largura, item.comprimento, item.quantidade, item.volume_m3, item.volume_ml]
        );
      });
    });

    saveDB();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ─── IPC: BACKUP MANUAL ─────────────────────────────────────────────────────

protectedHandle('backup-db', async (event, destPath) => {
  try {
    saveDB();
    const src = getDbFilePath();
    let finalDest = destPath;
    if (!finalDest) {
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Salvar Backup do Banco de Dados',
        defaultPath: path.join(
          app.getPath('documents'),
          `romaneios_backup_${new Date().toISOString().slice(0, 10)}.sqlite`
        ),
        filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }],
      });
      if (canceled || !filePath) return { success: false, canceled: true };
      finalDest = filePath;
    }
    fs.copyFileSync(src, finalDest);
    const cfg = readBackupConfig();
    writeBackupConfig({ ...cfg, lastManualBackup: new Date().toISOString() });
    return { success: true, path: finalDest };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ─── IPC: RESTAURAR BACKUP ──────────────────────────────────────────────────

protectedHandle('restore-db', async (event, customFilePath) => {
  try {
    let targetFile = customFilePath;
    if (!targetFile) {
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Selecionar Arquivo de Backup para Restaurar',
        filters: [
          { name: 'Banco de Dados SQLite', extensions: ['sqlite', 'db'] },
          { name: 'Todos os Arquivos', extensions: ['*'] }
        ],
        properties: ['openFile']
      });
      if (canceled || !filePaths || filePaths.length === 0) {
        return { success: false, canceled: true };
      }
      targetFile = filePaths[0];
    }

    if (!fs.existsSync(targetFile)) {
      return { success: false, error: 'Arquivo de backup não encontrado no caminho especificado.' };
    }

    const fileBuffer = fs.readFileSync(targetFile);

    if (!SQLInstance) {
      SQLInstance = await initSqlJs();
    }

    let testDb;
    try {
      testDb = new SQLInstance.Database(fileBuffer);
    } catch (parseErr) {
      return { success: false, error: 'O arquivo selecionado não é um banco de dados SQLite válido.' };
    }

    // Verificar se as tabelas principais existem
    let tables = [];
    try {
      const tablesRes = testDb.exec("SELECT name FROM sqlite_master WHERE type='table'");
      if (tablesRes.length > 0) {
        tables = tablesRes[0].values.map(v => v[0]);
      }
    } catch (tblErr) {
      return { success: false, error: 'Não foi possível ler a estrutura do banco de dados.' };
    }

    if (!tables.includes('romaneios')) {
      return { success: false, error: 'O arquivo selecionado não possui a estrutura válida do sistema de romaneios.' };
    }

    // Criar backup de segurança preventivo do banco atual antes da substituição
    try {
      saveDB();
      const currentDbPath = getDbFilePath();
      if (fs.existsSync(currentDbPath)) {
        const now = new Date();
        const ts = now.toISOString().replace(/[:.]/g, '-');
        const safetyBackupPath = path.join(app.getPath('userData'), `romaneios_seguranca_pre_restore_${ts}.sqlite`);
        fs.copyFileSync(currentDbPath, safetyBackupPath);
        console.log(`[Backup Segurança] Criado em: ${safetyBackupPath}`);
      }
    } catch (safetyErr) {
      console.warn('Aviso: Falha ao criar backup preventivo de segurança:', safetyErr.message);
    }

    // Aplicar migrações ao banco restaurado
    applyMigrations(testDb);

    // Substituir a instância ativa
    db = testDb;

    // Salvar o novo banco no caminho do app
    saveDB();

    // Obter estatísticas do banco restaurado
    let romaneiosCount = 0;
    let especiesCount = 0;
    let pacotesCount = 0;
    try {
      romaneiosCount = db.exec('SELECT COUNT(*) FROM romaneios')[0]?.values[0][0] || 0;
      especiesCount = db.exec('SELECT COUNT(*) FROM especies')[0]?.values[0][0] || 0;
      pacotesCount = db.exec('SELECT COUNT(*) FROM romaneio_pacotes')[0]?.values[0][0] || 0;
    } catch (cntErr) {
      console.warn('Erro ao obter contagens após restauração:', cntErr.message);
    }

    return {
      success: true,
      path: targetFile,
      romaneiosCount,
      especiesCount,
      pacotesCount
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ─── IPC: SINCRONIZAR ESPÉCIES COM SUPABASE ─────────────────────────────────

protectedHandle('sync-especies', (event, remoteEspecies) => {
  try {
    if (!Array.isArray(remoteEspecies)) {
      return { success: false, error: 'Lista de espécies inválida.' };
    }

    let inserted = 0;
    let updated = 0;

    const selectStmt = db.prepare('SELECT id, nome, cientifico FROM especies WHERE LOWER(TRIM(nome)) = LOWER(TRIM(?))');
    const updateStmt = db.prepare('UPDATE especies SET cientifico = ? WHERE id = ?');
    const insertStmt = db.prepare('INSERT INTO especies (nome, cientifico) VALUES (?, ?)');

    for (const item of remoteEspecies) {
      if (!item || !item.nome) continue;
      const cleanNome = item.nome.trim();
      const cleanCientifico = item.cientifico ? item.cientifico.trim() : null;

      selectStmt.bind([cleanNome]);
      if (selectStmt.step()) {
        const localRow = selectStmt.getAsObject();
        selectStmt.reset();

        // Atualiza o nome científico se houver alteração
        if ((localRow.cientifico || null) !== cleanCientifico) {
          updateStmt.bind([cleanCientifico, localRow.id]);
          updateStmt.step();
          updateStmt.reset();
          updated++;
        }
      } else {
        selectStmt.reset();
        insertStmt.bind([cleanNome, cleanCientifico]);
        insertStmt.step();
        insertStmt.reset();
        inserted++;
      }
    }

    selectStmt.free();
    updateStmt.free();
    insertStmt.free();

    saveDB();

    const totalRes = db.exec('SELECT COUNT(*) FROM especies');
    const totalCount = totalRes.length > 0 ? totalRes[0].values[0][0] : 0;

    return {
      success: true,
      inserted,
      updated,
      total: totalCount
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ─── IPC: SELECIONAR PASTA ──────────────────────────────────────────────────

protectedHandle('select-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecionar Pasta para Backup Automático',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (canceled || filePaths.length === 0) return { success: false, canceled: true };
  return { success: true, path: filePaths[0] };
});

// ─── IPC: ABRIR PASTA ───────────────────────────────────────────────────────

protectedHandle('open-backup-folder', async (event, folderPath) => {
  try {
    if (folderPath && fs.existsSync(folderPath)) {
      await shell.openPath(folderPath);
      return { success: true };
    }
    return { success: false, error: 'Pasta não encontrada ou não configurada' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ─── IPC: INFO DO BANCO ─────────────────────────────────────────────────────

protectedHandle('get-db-info', () => {
  try {
    const dbPath = getDbFilePath();
    let sizeBytes = 0;
    if (fs.existsSync(dbPath)) sizeBytes = fs.statSync(dbPath).size;
    const romaneiosCount = db.exec('SELECT COUNT(*) FROM romaneios')[0]?.values[0][0] || 0;
    const especiesCount = db.exec('SELECT COUNT(*) FROM especies')[0]?.values[0][0] || 0;
    const pacotesCount = db.exec('SELECT COUNT(*) FROM romaneio_pacotes')[0]?.values[0][0] || 0;
    return { success: true, path: dbPath, sizeBytes, romaneiosCount, especiesCount, pacotesCount };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ─── IPC: CONFIG BACKUP ─────────────────────────────────────────────────────

protectedHandle('get-backup-config', () => {
  try {
    return { success: true, config: readBackupConfig() };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

protectedHandle('set-backup-config', (event, config) => {
  try {
    writeBackupConfig({ ...readBackupConfig(), ...config });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ─── IPC: RESETAR BANCO (preserva espécies) ─────────────────────────────────

protectedHandle('reset-romaneios-db', () => {
  try {
    db.run('DELETE FROM romaneio_itens');
    db.run('DELETE FROM romaneio_pacotes');
    db.run('DELETE FROM romaneios');
    db.run('DELETE FROM clientes');
    try {
      db.run("DELETE FROM sqlite_sequence WHERE name IN ('romaneios','romaneio_pacotes','romaneio_itens','clientes')");
    } catch (e) { /* tabela pode não existir */ }
    saveDB();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ─── IPC: COMPARTILHAMENTO & ARQUIVOS (WHATSAPP) ───────────────────────────

protectedHandle('save-temp-pdf', async (event, fileName, base64Data) => {
  try {
    const sanitizedFileName = (fileName || 'Romaneio.pdf').replace(/[\\/:*?"<>|]/g, '_');
    let targetDir = path.join(app.getPath('downloads'), 'Romaneios');
    if (!fs.existsSync(targetDir)) {
      try {
        fs.mkdirSync(targetDir, { recursive: true });
      } catch (e) {
        targetDir = app.getPath('temp');
      }
    }
    const filePath = path.join(targetDir, sanitizedFileName);
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filePath, buffer);
    return { success: true, filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

protectedHandle('show-item-in-folder', async (event, filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return { success: true };
    }
    return { success: false, error: 'Arquivo não encontrado' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

protectedHandle('open-external-url', async (event, url) => {
  try {
    if (url && (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('whatsapp://'))) {
      await shell.openExternal(url);
      return { success: true };
    }
    return { success: false, error: 'URL inválida' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ─── IPC: GET HARDWARE ID ───────────────────────────────────────────────────

function getHardwareId() {
  let systemUuid = '';
  
  if (process.platform === 'win32') {
    // 1. Tenta obter o MachineGuid diretamente do Registro do Windows (Mais rápido e confiável)
    try {
      const output = execSync('reg query "HKLM\\Software\\Microsoft\\Cryptography" /v MachineGuid', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      const match = output.match(/MachineGuid\s+REG_SZ\s+([a-fA-F0-9-]+)/i);
      if (match && match[1]) {
        systemUuid = match[1].trim();
      }
    } catch (e) {
      console.warn('Erro ao obter UUID via Registro:', e.message);
    }

    // 2. Fallback: Tenta obter o UUID via PowerShell CIM (Moderno)
    if (!systemUuid) {
      try {
        systemUuid = execSync('powershell -Command "(Get-CimInstance Win32_ComputerSystemProduct).UUID"', { stdio: ['ignore', 'pipe', 'ignore'] })
          .toString()
          .trim();
      } catch (e) {
        console.warn('Erro ao obter UUID via PowerShell CIM:', e.message);
      }
    }

    // 3. Segundo Fallback: Tenta via wmic csproduct (Legado, pode estar ausente em Windows 11 moderno)
    if (!systemUuid) {
      try {
        systemUuid = execSync('wmic csproduct get uuid', { stdio: ['ignore', 'pipe', 'ignore'] })
          .toString()
          .replace('UUID', '')
          .trim();
      } catch (e) {
        console.warn('Erro ao obter UUID via wmic:', e.message);
      }
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

ipcMain.handle('get-hardware-id', () => {
  try {
    return getHardwareId();
  } catch (error) {
    return crypto.createHash('sha256').update(os.hostname() || 'fallback').digest('hex');
  }
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// ─── AUTO UPDATER CONFIG & LISTENERS ─────────────────────────────────────────

autoUpdater.autoDownload = false;
autoUpdater.logger = console;

autoUpdater.on('checking-for-update', () => {
  if (mainWindow && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('update-checking');
  }
});

autoUpdater.on('update-available', (info) => {
  if (mainWindow && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes
    });
  }
});

autoUpdater.on('update-not-available', () => {
  if (mainWindow && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('update-not-available');
  }
});

autoUpdater.on('error', (err) => {
  if (mainWindow && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('update-error', err.message || err);
  }
});

autoUpdater.on('download-progress', (progressObj) => {
  if (mainWindow && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('download-progress', {
      percent: progressObj.percent,
      bytesPerSecond: progressObj.bytesPerSecond,
      transferred: progressObj.transferred,
      total: progressObj.total
    });
  }
});

autoUpdater.on('update-downloaded', () => {
  if (mainWindow && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('update-downloaded');
  }
});

// ─── IPC: AUTO UPDATER HANDLERS ─────────────────────────────────────────────

ipcMain.handle('check-for-updates', async () => {
  try {
    const isDev = !app.isPackaged;
    if (isDev) {
      // Simulação em ambiente de desenvolvimento
      if (mainWindow && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('update-checking');
      }
      setTimeout(() => {
        if (mainWindow && !mainWindow.webContents.isDestroyed()) {
          mainWindow.webContents.send('update-not-available');
        }
      }, 1500);
      return { success: true, isDev: true };
    }
    
    const result = await autoUpdater.checkForUpdates();
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    const isDev = !app.isPackaged;
    if (isDev) {
      return { success: false, error: 'O download de atualizações não está disponível em ambiente de desenvolvimento.' };
    }
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('install-update', () => {
  try {
    autoUpdater.quitAndInstall();
  } catch (error) {
    console.error('Erro ao instalar atualização:', error.message);
  }
});


// ─── IPC: ATIVAÇÃO DE LICENÇA (ZONA DE SEGURANÇA) ───────────────────────────

ipcMain.handle('check-activation-status', () => {
  return {
    ativado: sistemaAtivado,
    motivo: motivoBloqueio
  };
});

ipcMain.handle('ativar-sistema', async (event, chaveDigitada) => {
  try {
    const idHardware = getHardwareId();
    
    // 1. Decodifica o token Base64 enviado pelo cliente
    let licencaPacote;
    try {
      const jsonString = Buffer.from(chaveDigitada, 'base64').toString('utf8');
      licencaPacote = JSON.parse(jsonString);
    } catch (e) {
      return { success: false, error: 'Chave de licença em formato inválido ou corrompida.' };
    }

    if (!licencaPacote || !licencaPacote.data || !licencaPacote.signature) {
      return { success: false, error: 'Chave de licença incompleta ou corrompida.' };
    }

    const { data, signature } = licencaPacote;

    // 2. Valida o Hardware ID
    if (data.mid !== idHardware) {
      return { success: false, error: 'Esta chave de licença não pertence a este computador.' };
    }

    // 3. Valida a Assinatura RSA
    const dadosString = JSON.stringify(data);
    const verifier = crypto.createVerify('SHA256');
    verifier.update(dadosString);
    const assinaturaValida = verifier.verify(CHAVE_PUBLICA_RSA, signature, 'base64');

    if (!assinaturaValida) {
      return { success: false, error: 'Assinatura digital inválida. Chave de ativação falsificada!' };
    }

    // 4. Valida se a data de expiração da chave já passou
    const agora = new Date();
    const expiraEm = new Date(data.exp);
    if (agora > expiraEm) {
      return { success: false, error: 'A chave de licença fornecida já está expirada.' };
    }

    // Gravando licença ativada localmente com AES
    const appData = app.getPath('userData');
    const pastaLicenca = path.join(appData, 'romaneio-madeira');
    const arquivoLicenca = path.join(pastaLicenca, 'license.dat');

    if (!fs.existsSync(pastaLicenca)) {
      fs.mkdirSync(pastaLicenca, { recursive: true });
    }

    // Grava o token original completo e a data last_seen para validação local completa posterior
    const novaLicenca = {
      token: chaveDigitada,
      last_seen: agora.toISOString()
    };

    fs.writeFileSync(arquivoLicenca, criptografar(JSON.stringify(novaLicenca)));

    sistemaAtivado = true;
    motivoBloqueio = 'ok';
    return { success: true, validade: expiraEm.toLocaleDateString('pt-BR') };

  } catch (err) {
    console.error("Erro na ativação do sistema:", err.message);
    return { success: false, error: 'Erro interno ao processar ativação: ' + err.message };
  }
});


