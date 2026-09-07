import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { processarItensPacote, calcularResumosConsolidados } from './cubagemEngine';

// Configurar as fontes
if (pdfMake && (pdfFonts as any)?.pdfMake?.vfs) {
  (pdfMake as any).vfs = (pdfFonts as any).pdfMake.vfs;
}

export const gerarPdfRomaneio = (romaneio: any, pacotes: any[]) => {
  const content: Record<string, unknown>[] = [];

  const totalMlCalculado = pacotes.reduce((acc, p) => acc + (Number(p.total_ml) || 0), 0);
  const totalM3Calculado = pacotes.reduce((acc, p) => acc + (Number(p.total_m3) || 0), 0);

  // Computar espécies distintas dos pacotes (com fallback para a espécie global para dados legados)
  const temEspecieNosPacotes = pacotes.some(p => p.especie);
  const especiesDistintas = temEspecieNosPacotes
    ? Array.from(new Set(pacotes.map(p => p.especie).filter(Boolean))).join(', ')
    : (romaneio.especie || 'Sem espécie');

  // Lógica de resumos consolidados por Espécie e por Bitola (Seção) para o PDF usando o motor unificado
  const resumos = calcularResumosConsolidados(pacotes, romaneio.tipo_romaneio);

  // Cabeçalho
  content.push({
    columns: [
      {
        text: 'MT PRO Sistema de Romaneios',
        fontSize: 20,
        bold: true,
        color: '#059669',
        margin: [0, 0, 0, 8]
      },
      {
        text: `Romaneio Nº: ${romaneio.id.toString().padStart(5, '0')}`,
        fontSize: 16,
        bold: true,
        alignment: 'right',
        margin: [0, 0, 0, 8]
      }
    ]
  });

  // Dados Gerais
  content.push({
    table: {
      widths: ['*', '*', '*'],
      body: [
        [
          { text: 'Cliente', bold: true, fontSize: 10, color: '#4b5563', border: [false, false, false, false] },
          { text: 'Espécie(s)', bold: true, fontSize: 10, color: '#4b5563', border: [false, false, false, false] },
          { text: 'Data', bold: true, fontSize: 10, color: '#4b5563', border: [false, false, false, false] }
        ],
        [
          { text: romaneio.cliente, fontSize: 12, bold: true, border: [false, false, false, false] },
          { text: especiesDistintas, fontSize: 12, bold: true, border: [false, false, false, false] },
          { text: new Date(romaneio.data).toLocaleDateString('pt-BR'), fontSize: 12, bold: true, border: [false, false, false, false] }
        ]
      ]
    },
    margin: [0, 10, 0, 20],
    layout: {
      defaultBorder: false,
      paddingTop: () => 2,
      paddingBottom: () => 2
    }
  });

  // Pacotes
  pacotes.forEach((pacote) => {
    const especieNome = pacote.especie || romaneio.especie || 'Sem espécie';
    content.push({
      text: `Pacote Nº ${pacote.numero_pacote} - Espécie: ${especieNome}`,
      fontSize: 13,
      bold: true,
      color: '#047857',
      margin: [0, 15, 0, 5]
    });

    const { normais, abertos } = processarItensPacote(pacote.itens, romaneio.tipo_romaneio);
    const totalPecasPacote = pacote.itens?.reduce((acc: number, item: any) => acc + (Number(item.quantidade) || 0), 0) || 0;

    // Tabela de Larguras Abertas
    if (abertos.length > 0) {
      const headerAbertos: Record<string, unknown>[] = [
        { text: 'Esp(cm)', bold: true, fillColor: '#f3f4f6', alignment: 'center' },
        { text: romaneio.tipo_romaneio === 'pes' ? 'Comp(pés)' : 'Comp(m)', bold: true, fillColor: '#f3f4f6', alignment: 'center' },
        { text: 'Larguras (cm)', bold: true, fillColor: '#e0f2fe', color: '#0284c7', alignment: 'left' },
        { text: 'Qtd', bold: true, fillColor: '#f3f4f6', alignment: 'center' },
        { text: 'ML', bold: true, fillColor: '#f3f4f6', alignment: 'center' },
        { text: 'M³', bold: true, fillColor: '#f3f4f6', alignment: 'center' }
      ];

      const bodyAbertos: Record<string, unknown>[][] = [headerAbertos];

      abertos.forEach(grupo => {
        const somaLarguras = grupo.larguras.reduce((a: number, b: number) => a + b, 0);
        const largurasText = `${grupo.larguras.join(', ')} (Total: ${somaLarguras.toString().replace('.', ',')} cm)`;
        
        bodyAbertos.push([
          { text: grupo.espessura.toString().replace('.', ','), alignment: 'center' },
          { text: grupo.comprimento.toFixed(2).replace('.', ','), alignment: 'center' },
          { text: largurasText, alignment: 'left', color: '#4b5563' },
          { text: grupo.quantidade.toString(), alignment: 'center', bold: true },
          { text: grupo.volume_ml.toFixed(2).replace('.', ','), alignment: 'center' },
          { text: grupo.volume_m3.toFixed(3).replace('.', ','), alignment: 'center', color: '#047857' }
        ]);
      });

      content.push({
        table: {
          headerRows: 1,
          widths: ['auto', 'auto', '*', 'auto', 'auto', 'auto'],
          body: bodyAbertos
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 10]
      });
    }

    // Tabela Normal
    if (normais.length > 0) {
      const headers = [
        { text: 'Item', bold: true, fillColor: '#f3f4f6', alignment: 'center' },
        { text: 'Espessura (cm)', bold: true, fillColor: '#f3f4f6', alignment: 'center' },
        { text: romaneio.tipo_romaneio === 'pes' ? 'Comprimento (pés)' : 'Comprimento (m)', bold: true, fillColor: '#f3f4f6', alignment: 'center' },
        { text: 'Largura (cm)', bold: true, fillColor: '#f3f4f6', alignment: 'center' },
        { text: 'Qtd', bold: true, fillColor: '#f3f4f6', alignment: 'center' },
        { text: 'ML', bold: true, fillColor: '#f3f4f6', alignment: 'center' },
        { text: 'M³', bold: true, fillColor: '#f3f4f6', alignment: 'center' }
      ];

      const bodyNormais: Record<string, unknown>[][] = [ headers ];

      normais.forEach((item: any, idx: number) => {
        const cMetros = romaneio.tipo_romaneio === 'pes' ? item.comprimento * 0.3048 : item.comprimento;
        const m3 = (item.espessura / 100) * (item.largura / 100) * cMetros * item.quantidade;
        const ml = cMetros * item.quantidade;

        const row: any[] = [
          { text: (idx + 1).toString(), alignment: 'center' },
          { text: item.espessura.toString().replace('.', ','), alignment: 'center' },
          { text: romaneio.tipo_romaneio === 'pes' ? item.comprimento.toString().replace('.', ',') : item.comprimento.toFixed(2).replace('.', ','), alignment: 'center' },
          { text: item.largura.toString().replace('.', ','), alignment: 'center' },
          { text: item.quantidade.toString(), alignment: 'center', bold: true },
          { text: ml.toFixed(2).replace('.', ','), alignment: 'center' },
          { text: m3.toFixed(3).replace('.', ','), alignment: 'center', color: '#047857' }
        ];

        bodyNormais.push(row);
      });

      content.push({
        table: {
          headerRows: 1,
          widths: ['auto', '*', '*', '*', 'auto', '*', '*'],
          body: bodyNormais
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 10]
      });
    }

    // Tabela de Totais do Pacote
    content.push({
      table: {
        widths: ['*', 'auto', 'auto', 'auto'],
        body: [
          [
            { text: `TOTAIS DO PACOTE ${pacote.numero_pacote}`, bold: true, alignment: 'right', fillColor: '#f9fafb' },
            { text: `${totalPecasPacote} pçs`, bold: true, alignment: 'center', fillColor: '#f9fafb' },
            { text: `${pacote.total_ml.toFixed(2).replace('.', ',')} ML`, bold: true, alignment: 'center', fillColor: '#f9fafb' },
            { text: `${pacote.total_m3.toFixed(3).replace('.', ',')} M³`, bold: true, alignment: 'center', fillColor: '#ecfdf5', color: '#047857' }
          ]
        ]
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 20]
    });
  });

  // Totais Gerais
  content.push({
    margin: [0, 30, 0, 0],
    table: {
      widths: ['*', 'auto', 'auto'],
      body: [
        [
          { text: 'TOTAL GERAL DO ROMANEIO', bold: true, alignment: 'right', fontSize: 14 },
          { text: `${totalMlCalculado.toFixed(2).replace('.', ',')} ML`, bold: true, alignment: 'center', fontSize: 14 },
          { text: `${totalM3Calculado.toFixed(3).replace('.', ',')} M³`, bold: true, alignment: 'center', fontSize: 14, color: '#047857', fillColor: '#ecfdf5' }
        ]
      ]
    },
    layout: 'noBorders'
  });

  // Forçar quebra de página para o Resumo Consolidado (BI)
  content.push({ text: '', pageBreak: 'before' });

  content.push({
    text: 'RESUMO CONSOLIDADO DO ROMANEIO',
    fontSize: 16,
    bold: true,
    color: '#059669',
    margin: [0, 0, 0, 15],
    alignment: 'center'
  });

  // Tabela por Espécie
  const bodyEspecie: Record<string, unknown>[][] = [
    [
      { text: 'Espécie', bold: true, fillColor: '#f3f4f6', alignment: 'center' },
      { text: 'Total ML', bold: true, fillColor: '#f3f4f6', alignment: 'center' },
      { text: 'Total M³', bold: true, fillColor: '#f3f4f6', alignment: 'center' },
      { text: '% Vol', bold: true, fillColor: '#f3f4f6', alignment: 'center' }
    ]
  ];

  resumos.porEspecie.forEach(item => {
    bodyEspecie.push([
      { text: item.especie, bold: true, alignment: 'left' },
      { text: item.totalMl.toFixed(2).replace('.', ','), alignment: 'center' },
      { text: item.totalM3.toFixed(3).replace('.', ','), bold: true, alignment: 'center', color: '#047857', fillColor: '#ecfdf5' },
      { text: `${item.percentual.toFixed(1)}%`, alignment: 'center' }
    ]);
  });

  // Tabela por Bitola
  const bodyBitola: Record<string, unknown>[][] = [
    [
      { text: 'Espécie', bold: true, fillColor: '#f3f4f6', alignment: 'center' },
      { text: 'Bitola (cm)', bold: true, fillColor: '#f3f4f6', alignment: 'center' },
      { text: 'Total ML', bold: true, fillColor: '#f3f4f6', alignment: 'center' },
      { text: 'Total M³', bold: true, fillColor: '#f3f4f6', alignment: 'center' },
      { text: '% Vol', bold: true, fillColor: '#f3f4f6', alignment: 'center' }
    ]
  ];

  resumos.porBitola.forEach(item => {
    bodyBitola.push([
      { text: item.especie, alignment: 'left' },
      { text: `${item.espessura.toString().replace('.', ',')} x ${item.largura.toString().replace('.', ',')}`, bold: true, alignment: 'center' },
      { text: item.totalMl.toFixed(2).replace('.', ','), alignment: 'center' },
      { text: item.totalM3.toFixed(3).replace('.', ','), bold: true, alignment: 'center', color: '#047857', fillColor: '#ecfdf5' },
      { text: `${item.percentual.toFixed(1)}%`, alignment: 'center' }
    ]);
  });

  // Tabela por Largura
  const bodyLargura: Record<string, unknown>[][] = [
    [
      { text: 'Espécie', bold: true, fillColor: '#f3f4f6', alignment: 'center' },
      { text: 'Largura (cm)', bold: true, fillColor: '#f3f4f6', alignment: 'center' },
      { text: 'Total ML', bold: true, fillColor: '#f3f4f6', alignment: 'center' },
      { text: 'Total M³', bold: true, fillColor: '#f3f4f6', alignment: 'center' },
      { text: '% Vol', bold: true, fillColor: '#f3f4f6', alignment: 'center' }
    ]
  ];

  resumos.porLargura.forEach(item => {
    bodyLargura.push([
      { text: item.especie, alignment: 'left' },
      { text: `${item.largura.toString().replace('.', ',')} cm`, bold: true, alignment: 'center' },
      { text: item.totalMl.toFixed(2).replace('.', ','), alignment: 'center' },
      { text: item.totalM3.toFixed(3).replace('.', ','), bold: true, alignment: 'center', color: '#047857', fillColor: '#ecfdf5' },
      { text: `${item.percentual.toFixed(1)}%`, alignment: 'center' }
    ]);
  });

  content.push({
    text: 'Consolidado por Espécie',
    fontSize: 12,
    bold: true,
    color: '#374151',
    margin: [0, 10, 0, 5]
  });

  content.push({
    table: {
      headerRows: 1,
      widths: ['*', 'auto', 'auto', 'auto'],
      body: bodyEspecie
    },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 20]
  });

  const percentLonga = resumos.totalVolumeGeral > 0 ? (resumos.totalMadeiraLongaM3 / resumos.totalVolumeGeral) * 100 : 0;
  const percentShort = resumos.totalVolumeGeral > 0 ? (resumos.totalShortM3 / resumos.totalVolumeGeral) * 100 : 0;
  const percentAbaixo6 = resumos.totalVolumeGeral > 0 ? (resumos.totalAbaixo6M3 / resumos.totalVolumeGeral) * 100 : 0;
  const percent7 = resumos.totalVolumeGeral > 0 ? (resumos.total7M3 / resumos.totalVolumeGeral) * 100 : 0;
  const percentAcima8 = resumos.totalVolumeGeral > 0 ? (resumos.totalAcima8M3 / resumos.totalVolumeGeral) * 100 : 0;

  const bodyCategoria: Record<string, unknown>[][] = [
    [
      { text: 'Categoria de Comprimento', bold: true, fillColor: '#f3f4f6', alignment: 'center' },
      { text: 'Volume M³', bold: true, fillColor: '#f3f4f6', alignment: 'center' },
      { text: '% Vol', bold: true, fillColor: '#f3f4f6', alignment: 'center' }
    ]
  ];

  if (romaneio.tipo_romaneio === 'pes') {
    bodyCategoria.push(
      [
        { text: '6 PÉS E ABAIXO', bold: true, alignment: 'left' },
        { text: resumos.totalAbaixo6M3.toFixed(3).replace('.', ','), bold: true, alignment: 'center', color: '#b91c1c', fillColor: '#fef2f2' },
        { text: `${percentAbaixo6.toFixed(1)}%`, alignment: 'center' }
      ],
      [
        { text: '7 PÉS', bold: true, alignment: 'left' },
        { text: resumos.total7M3.toFixed(3).replace('.', ','), bold: true, alignment: 'center', color: '#d97706', fillColor: '#fffbeb' },
        { text: `${percent7.toFixed(1)}%`, alignment: 'center' }
      ],
      [
        { text: '8 PÉS E ACIMA', bold: true, alignment: 'left' },
        { text: resumos.totalAcima8M3.toFixed(3).replace('.', ','), bold: true, alignment: 'center', color: '#047857', fillColor: '#ecfdf5' },
        { text: `${percentAcima8.toFixed(1)}%`, alignment: 'center' }
      ]
    );
  } else {
    bodyCategoria.push(
      [
        { text: 'MADEIRA LONGA (>= 2,00 m)', bold: true, alignment: 'left' },
        { text: resumos.totalMadeiraLongaM3.toFixed(3).replace('.', ','), bold: true, alignment: 'center', color: '#047857', fillColor: '#ecfdf5' },
        { text: `${percentLonga.toFixed(1)}%`, alignment: 'center' }
      ],
      [
        { text: 'SHORT (<= 1,90 m)', bold: true, alignment: 'left' },
        { text: resumos.totalShortM3.toFixed(3).replace('.', ','), bold: true, alignment: 'center', color: '#b91c1c', fillColor: '#fef2f2' },
        { text: `${percentShort.toFixed(1)}%`, alignment: 'center' }
      ]
    );
  }

  content.push({
    text: 'Consolidado por Categoria de Comprimento',
    fontSize: 12,
    bold: true,
    color: '#374151',
    margin: [0, 10, 0, 5]
  });

  content.push({
    table: {
      headerRows: 1,
      widths: ['*', 'auto', 'auto'],
      body: bodyCategoria
    },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 20]
  });

  if (romaneio.tipo_romaneio === 'padrao') {
    content.push({
      text: 'Consolidado por Bitola (Seção)',
      fontSize: 12,
      bold: true,
      color: '#374151',
      margin: [0, 10, 0, 5]
    });

    content.push({
      table: {
        headerRows: 1,
        widths: ['*', 'auto', 'auto', 'auto', 'auto'],
        body: bodyBitola
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 20]
    });
  } else if (romaneio.tipo_romaneio === 'pes') {
    content.push({
      text: 'Consolidado por Largura',
      fontSize: 12,
      bold: true,
      color: '#374151',
      margin: [0, 10, 0, 5]
    });

    content.push({
      table: {
        headerRows: 1,
        widths: ['*', 'auto', 'auto', 'auto', 'auto'],
        body: bodyLargura
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 20]
    });
  }

  // Assinaturas
  content.push({
    margin: [0, 60, 0, 0],
    columns: [
      {
        stack: [
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 1 }] },
          { text: 'Assinatura da Empresa', alignment: 'center', marginTop: 5, fontSize: 10 }
        ],
        alignment: 'center'
      },
      {
        stack: [
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 1 }] },
          { text: 'Assinatura do Motorista/Cliente', alignment: 'center', marginTop: 5, fontSize: 10 }
        ],
        alignment: 'center'
      }
    ]
  });

  const docDefinition: any = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 40],
    content,
    defaultStyle: {
      font: 'Roboto',
      fontSize: 10,
      color: '#374151'
    }
  };

  return pdfMake.createPdf(docDefinition);
};
