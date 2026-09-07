const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('🗝️ Iniciando geração do par de chaves RSA de 2048 bits...');

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
});

const privateKeyPath = path.join(__dirname, '..', 'private.key');
const publicKeyPath = path.join(__dirname, '..', 'public.key');

fs.writeFileSync(privateKeyPath, privateKey, 'utf8');
fs.writeFileSync(publicKeyPath, publicKey, 'utf8');

console.log('✅ Par de chaves RSA gerado com sucesso!');
console.log(`🔑 Chave Privada salva em: ${privateKeyPath} (MANTENHA EM SEGREDO!)`);
console.log(`🔓 Chave Pública salva em: ${publicKeyPath}`);
