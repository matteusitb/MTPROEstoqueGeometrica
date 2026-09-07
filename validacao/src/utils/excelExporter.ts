/**
 * Utilitário para exportação de Romaneios e Resumos para Excel (.CSV / .XLSX compatível com UTF-8 BOM).
 */

export interface DadosExportacaoExcel {
  id: number | string;
  cliente: string;
  data: string;
  tipo_romaneio?: string;
  total_m3: number;
  total_ml: number;
  pacotes: {
    numero_pacote: number;
    especie?: string;
    total_m3: number;
    total_ml: number;
    itens: {
      espessura: number;
      largura: number;
      comprimento: number;
      quantidade: number;
      volume_m3: number;
      volume_ml: number;
    }[];
  }[];
}

export function exportarRomaneioParaCSV(romaneio: DadosExportacaoExcel): void {
  const dataFormatada = romaneio.data
    ? romaneio.data.split('-').reverse().join('/')
    : '';

  const tipoNome =
    romaneio.tipo_romaneio === 'pes'
      ? 'Ipê (Pés)'
      : romaneio.tipo_romaneio === 'aberta'
      ? 'Largura Aberta'
      : 'Padrão (Fixas)';

  let csv = '\uFEFF'; // UTF-8 BOM para abrir perfeitamente com acentos no Excel

  // Cabeçalho Geral
  csv += 'MT PRO - SISTEMA DE ROMANEIO DE MADEIRA SERRADA\n';
  csv += `Romaneio Nº;${romaneio.id};Data;${dataFormatada}\n`;
  csv += `Cliente/Fornecedor;${romaneio.cliente};Tipo de Romaneio;${tipoNome}\n`;
  csv += `Volume Total (M³);${Number(romaneio.total_m3).toFixed(3).replace('.', ',')};Metros Lineares (ML);${Number(romaneio.total_ml).toFixed(2).replace('.', ',')}\n\n`;

  // Cabeçalho da Tabela Detalhada
  csv += 'Pacote;Espécie;Item;Espessura (cm);Comprimento;Largura (cm);Quantidade;Total ML;Total M³\n';

  romaneio.pacotes.forEach(p => {
    const especie = p.especie || 'Mista';
    p.itens.forEach((it, idx) => {
      const compStr = Number(it.comprimento).toFixed(2).replace('.', ',');
      const espStr = Number(it.espessura).toString().replace('.', ',');
      const largStr = Number(it.largura).toString().replace('.', ',');
      const mlStr = Number(it.volume_ml).toFixed(2).replace('.', ',');
      const m3Str = Number(it.volume_m3).toFixed(3).replace('.', ',');

      csv += `${p.numero_pacote};${especie};${idx + 1};${espStr};${compStr};${largStr};${it.quantidade};${mlStr};${m3Str}\n`;
    });

    // Subtotal do pacote
    csv += `Subtotal Pacote ${p.numero_pacote};${especie};;;;;;${Number(p.total_ml).toFixed(2).replace('.', ',')};${Number(p.total_m3).toFixed(3).replace('.', ',')}\n\n`;
  });

  // Criar download via Blob
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Romaneio_${String(romaneio.id).padStart(4, '0')}_${romaneio.cliente.replace(/[^a-zA-Z0-9]/g, '_')}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
