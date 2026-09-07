const Database = require('better-sqlite3');
// AJUSTE O CAMINHO ABAIXO para o nome real do seu arquivo .db
const db = new Database('database.db', { verbose: console.log });

console.log("🚀 Iniciando inserção de dados de teste...");

const insert = db.prepare(`
    INSERT INTO toras (codigo, especie_id, lote_id, comprimento, rodo, volume, status, data_entrada) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

// Usamos uma transação para ser instantâneo e não travar
const popularBanco = db.transaction(() => {
    for (let i = 11; i <= 500; i++) {
        const codigo = i.toString().padStart(4, '0'); // Número [cite: 2026-01-17]
        const especie_id = Math.floor(Math.random() * 10) + 1;
        const lote_id = 1;
        const comprimento = parseFloat((Math.random() * 8 + 4).toFixed(2));
        const rodo = parseFloat((Math.random() * 2.5 + 1.5).toFixed(2));
        const volume = parseFloat((Math.random() * 2 + 0.5).toFixed(3));
        const status = 'pátio';
        const data_entrada = new Date().toISOString();

        insert.run(codigo, especie_id, lote_id, comprimento, rodo, volume, status, data_entrada);
    }
});

try {
    popularBanco();
    console.log("✅ Sucesso! 500 toras inseridas.");
} catch (err) {
    console.error("❌ Erro ao inserir:", err.message);
} finally {
    db.close();
}