const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
const idHardware = args[0];
const diasValidade = parseInt(args[1], 10) || 30; // 30 dias por padrão

if (!idHardware) {
  console.error('❌ Erro: Você deve fornecer o ID do Hardware do cliente!');
  console.log('Uso: node scripts/gerar-licenca.cjs <hardware_id> [dias_validade]');
  process.exit(1);
}

const privateKeyPath = path.join(__dirname, '..', 'private.key');
if (!fs.existsSync(privateKeyPath)) {
  console.error(`❌ Erro: Chave Privada não encontrada em ${privateKeyPath}!`);
  console.log('Execute primeiro: node scripts/gerar-chaves.cjs');
  process.exit(1);
}

try {
  const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

  // Calcula a data de expiração
  const expiraEm = new Date();
  expiraEm.setDate(expiraEm.getDate() + diasValidade);

  // Dados que serão assinados
  const licencaDados = {
    mid: idHardware,
    exp: expiraEm.toISOString()
  };

  const dadosString = JSON.stringify(licencaDados);

  // Gera a assinatura digital RSA-SHA256
  const sign = crypto.createSign('SHA256');
  sign.update(dadosString);
  const signature = sign.sign(privateKey, 'base64');

  // Pacote final da licença
  const licencaCompleta = {
    data: licencaDados,
    signature: signature
  };

  // Codifica todo o JSON final em Base64 para ser a Chave de Ativação do cliente
  const chaveAtivacao = Buffer.from(JSON.stringify(licencaCompleta)).toString('base64');

  console.log('\n======================================================================');
  console.log('🔑 LICENÇA ASSINADA RSA GERADA COM SUCESSO!');
  console.log('======================================================================');
  console.log(`💻 Cliente Hardware ID: ${idHardware}`);
  console.log(`📅 Expira em:           ${expiraEm.toLocaleString('pt-BR')}`);
  console.log(`⏳ Dias de Validade:    ${diasValidade} dias`);
  console.log('----------------------------------------------------------------------');
  console.log('🎟️ CHAVE DE ATIVAÇÃO (Envie este código completo para o cliente):');
  console.log('----------------------------------------------------------------------');
  console.log(chaveAtivacao);
  console.log('======================================================================\n');

} catch (err) {
  console.error('❌ Erro crítico ao assinar licença:', err.message);
  process.exit(1);
}
