/**
 * Utilitários para formatação e envio de mensagens pelo WhatsApp Web
 */

export const limparTelefone = (valor: string): string => {
  return valor.replace(/\D/g, '');
};

export const formatarMascaraTelefone = (valor: string): string => {
  const digits = valor.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits.length > 0 ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
};

export const prepararTelefoneWhatsApp = (telefone: string): string => {
  let clean = limparTelefone(telefone);
  if (!clean) return '';
  
  // Se for DDD + Número (10 ou 11 dígitos), adiciona DDI 55 (Brasil)
  if (clean.length === 10 || clean.length === 11) {
    clean = `55${clean}`;
  }
  return clean;
};

export interface DadosRomaneioWhatsApp {
  id: number | string;
  cliente: string;
  data: string;
  especie?: string;
  tipo_romaneio?: string;
}

export const gerarTextoWhatsApp = (
  romaneio: DadosRomaneioWhatsApp,
  pacotes: any[],
  mensagemExtra?: string
): string => {
  const numeroFormatado = romaneio.id.toString().padStart(4, '0');
  
  // Formatar data
  let dataStr = romaneio.data;
  if (dataStr && dataStr.includes('-')) {
    const [y, m, d] = dataStr.split('-');
    dataStr = `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }

  // Obter espécies
  const temEspecieNosPacotes = pacotes.some(p => p.especie);
  const especies = temEspecieNosPacotes
    ? Array.from(new Set(pacotes.map(p => p.especie).filter(Boolean))).join(', ')
    : (romaneio.especie || 'Mista');

  // Calcular totais dos pacotes selecionados
  const totalM3 = pacotes.reduce((acc, p) => acc + (Number(p.total_m3) || 0), 0);
  const totalMl = pacotes.reduce((acc, p) => acc + (Number(p.total_ml) || 0), 0);
  const totalPecas = pacotes.reduce((acc, p) => {
    const pecasPacote = p.itens?.reduce((sub: number, it: any) => sub + (Number(it.quantidade) || 0), 0) || 0;
    return acc + pecasPacote;
  }, 0);

  const tipoNome = romaneio.tipo_romaneio === 'pes' 
    ? 'Ipê (Pés)' 
    : romaneio.tipo_romaneio === 'aberta' 
      ? 'Largura Aberta' 
      : 'Padrão';

  let msg = `📄 *ROMANEIO DE MADEIRA SERRADA*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🔹 *Romaneio Nº:* #${numeroFormatado}\n`;
  msg += `🔹 *Cliente:* ${romaneio.cliente || 'Consumidor'}\n`;
  msg += `🔹 *Data:* ${dataStr}\n`;
  msg += `🔹 *Tipo:* ${tipoNome}\n`;
  msg += `🔹 *Espécie(s):* ${especies}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📦 *Resumo da Carga:*\n`;
  msg += `• *Pacotes:* ${pacotes.length} pacote(s)\n`;
  if (totalPecas > 0) {
    msg += `• *Total de Peças:* ${totalPecas} un\n`;
  }
  msg += `• *Metros Lineares:* ${totalMl.toFixed(2).replace('.', ',')} ML\n`;
  msg += `• *Volume Total:* ${totalM3.toFixed(3).replace('.', ',')} M³\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;

  if (mensagemExtra && mensagemExtra.trim()) {
    msg += `📝 *Observação:*\n${mensagemExtra.trim()}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  }

  msg += `📎 _Segue em anexo o arquivo PDF com o detalhamento completo dos pacotes e peças._`;

  return msg;
};

export const obterLinkWhatsApp = (telefone: string, texto: string): string => {
  const telPreparado = prepararTelefoneWhatsApp(telefone);
  const textoCodificado = encodeURIComponent(texto);

  if (telPreparado) {
    return `https://web.whatsapp.com/send?phone=${telPreparado}&text=${textoCodificado}`;
  }
  return `https://web.whatsapp.com/send?text=${textoCodificado}`;
};
