@echo off
title Controle de Estoque de Toras
cd /d "%~dp0"
node -e "require('fs').copyFileSync('renderer-dev.js', 'renderer.js')"
call .\node_modules\.bin\electron.cmd .
