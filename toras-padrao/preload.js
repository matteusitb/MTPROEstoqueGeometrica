const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    invoke: (channel, data) => ipcRenderer.invoke(channel, data),
    send: (channel, data) => ipcRenderer.send(channel, data),
    receive: (channel, callback) => ipcRenderer.on(channel, (event, ...args) => callback(...args))
});

contextBridge.exposeInMainWorld('utils', {
    getMachineId: () => ipcRenderer.invoke('get-machine-id'),
    licencaExists: (pasta, arquivo) => ipcRenderer.invoke('licenca-exists', pasta, arquivo),
    licencaMkdir: (pasta) => ipcRenderer.invoke('licenca-mkdir', pasta),
    licencaWrite: (arquivo, conteudo) => ipcRenderer.invoke('licenca-write', arquivo, conteudo),
    licencaRead: (arquivo) => ipcRenderer.invoke('licenca-read', arquivo),
    getAppDataPath: () => ipcRenderer.invoke('get-appdata-path'),
    joinPath: (...args) => args.join('/'),
    checkActivationStatus: () => ipcRenderer.invoke('check-activation-status'),
    ativarSistema: (chave) => ipcRenderer.invoke('ativar-sistema', chave)
});