const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const JavaScriptObfuscator = require('javascript-obfuscator');

console.log('🔒 Iniciando proteção do aplicativo...');

// 1. Compilar electron.cjs para bytecode V8 (electron.jsc)
try {
  console.log('📦 Compilando electron.cjs em bytecode...');
  // Executa a compilação via CLI do bytenode usando o executável do Electron
  execSync('npx electron node_modules/bytenode/lib/cli.js --compile public/electron.cjs', {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'inherit'
  });
  console.log('✅ electron.jsc gerado com sucesso.');
} catch (err) {
  console.error('❌ Erro ao compilar bytecode do Electron:', err.message);
  process.exit(1);
}

// 2. Ofuscar arquivos JS do Renderer (dist/assets/)
const assetsDir = path.join(__dirname, 'dist', 'assets');
if (fs.existsSync(assetsDir)) {
  console.log('🔍 Buscando bundles de frontend para ofuscação...');
  const files = fs.readdirSync(assetsDir);
  
  files.forEach(file => {
    if (file.endsWith('.js') && !file.includes('-obfuscated')) {
      const filePath = path.join(assetsDir, file);
      console.log(`🛡️ Ofuscando: ${file}...`);
      
      const code = fs.readFileSync(filePath, 'utf8');
      const obfuscationResult = JavaScriptObfuscator.obfuscate(code, {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.75,
        numbersToExpressions: true,
        simplify: true,
        stringArrayThreshold: 0.75
      });
      
      fs.writeFileSync(filePath, obfuscationResult.getObfuscatedCode(), 'utf8');
    }
  });
  console.log('✅ Ofuscação do frontend concluída.');
} else {
  console.warn('⚠️ Direotório dist/assets/ não encontrado. Certifique-se de rodar o build do Vite primeiro.');
}

console.log('🔒 Proteção concluída com sucesso!');
