const { app } = require('electron');
const path = require('path');
const fs = require('fs');

// No desenvolvimento, o app não está empacotado.
// Em produção (instalador), o app está empacotado.
if (app.isPackaged) {
  // Carrega a engine de execução do bytecode
  require('bytenode');
  
  const jscPath = path.join(__dirname, 'electron.jsc');
  if (fs.existsSync(jscPath)) {
    require(jscPath);
  } else {
    require('./electron.cjs');
  }
} else {
  // Sempre carrega o original durante o desenvolvimento
  require('./electron.cjs');
}
