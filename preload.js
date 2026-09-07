const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    send: (channel, ...args) => ipcRenderer.send(channel, ...args),
    receive: (channel, callback) => ipcRenderer.on(channel, (event, ...args) => callback(...args))
});

contextBridge.exposeInMainWorld('utils', {
    getMachineId: () => ipcRenderer.invoke('get-hardware-id'),
    getHardwareId: () => ipcRenderer.invoke('get-hardware-id'),
    checkActivationStatus: () => ipcRenderer.invoke('check-activation-status'),
    ativarSistema: (chave) => ipcRenderer.invoke('ativar-sistema', chave),
    authSaveLocalLicense: (dados) => ipcRenderer.invoke('auth-save-local-license', dados),
    authLoginOffline: (email) => ipcRenderer.invoke('auth-login-offline', email),
    authUpdateOfflineLogin: (id) => ipcRenderer.invoke('auth-update-offline-login', id),
    getAppDataPath: () => ipcRenderer.invoke('get-appdata-path'),
    joinPath: (...args) => args.join('/')
});

contextBridge.exposeInMainWorld('electronAPI', {
    getHardwareId: () => ipcRenderer.invoke('get-hardware-id'),
    checkActivationStatus: () => ipcRenderer.invoke('check-activation-status'),
    ativarSistema: (chave) => ipcRenderer.invoke('ativar-sistema', chave),
    authSaveLocalLicense: (dados) => ipcRenderer.invoke('auth-save-local-license', dados),
    authLoginOffline: (email) => ipcRenderer.invoke('auth-login-offline', email),
    authUpdateOfflineLogin: (id) => ipcRenderer.invoke('auth-update-offline-login', id)
});