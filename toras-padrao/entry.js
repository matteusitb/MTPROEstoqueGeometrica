const { app } = require('electron');
const bytenode = require('bytenode');
const fs = require('fs');
const path = require('path');

// No desenvolvimento (npm start), o app não está empacotado.
// Em produção (instalador), o app está empacotado.
if (app.isPackaged) {
    const jscPath = path.join(__dirname, 'main.jsc');
    if (fs.existsSync(jscPath)) {
        require(jscPath);
    } else {
        require('./main.js');
    }
} else {
    // Sempre carrega o original durante o desenvolvimento
    require('./main.js');
}
