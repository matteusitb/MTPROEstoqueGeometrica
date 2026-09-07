import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';

if (pdfMake && (pdfFonts as any)?.pdfMake?.vfs) {
  (pdfMake as any).vfs = (pdfFonts as any).pdfMake.vfs;
}

export interface PacoteEtiqueta {
  numero_pacote: number;
  especie?: string;
  total_m3: number;
  total_ml: number;
  total_pecas?: number;
  itens?: {
    espessura: number;
    largura: number;
    comprimento: number;
    quantidade: number;
  }[];
}

export interface RomaneioEtiquetaInfo {
  id: number | string;
  cliente: string;
  data: string;
  tipo_romaneio?: string;
}

/**
 * Gera PDF com etiquetas térmicas de fardo (tamanho 100mm x 150mm por página ou fardo).
 */
export function gerarPdfEtiquetasPacote(
  romaneio: RomaneioEtiquetaInfo,
  pacotes: PacoteEtiqueta[]
) {
  const content: any[] = [];
  const dataFormatada = romaneio.data
    ? romaneio.data.split('-').reverse().join('/')
    : new Date().toLocaleDateString('pt-BR');

  pacotes.forEach((pacote, index) => {
    const totalPecas =
      pacote.total_pecas ||
      pacote.itens?.reduce((acc, it) => acc + (Number(it.quantidade) || 0), 0) ||
      0;

    const especie = pacote.especie || 'Mista';
    const numRomaneio = String(romaneio.id).padStart(4, '0');
    const numPacote = String(pacote.numero_pacote).padStart(2, '0');

    // Dados para o QR Code (resumo compacto)
    const qrText = `ROMANEIO:#${numRomaneio}|PACOTE:${numPacote}|CLIENTE:${romaneio.cliente}|ESP:${especie}|PECAS:${totalPecas}|M3:${Number(pacote.total_m3).toFixed(3)}|ML:${Number(pacote.total_ml).toFixed(2)}`;

    // Cartão da Etiqueta
    content.push({
      table: {
        widths: ['*'],
        body: [
          [
            {
              stack: [
                // Top Header
                {
                  columns: [
                    { text: 'MT PRO MADEIRAS', fontSize: 13, bold: true, color: '#047857' },
                    { text: `DATA: ${dataFormatada}`, fontSize: 9, bold: true, alignment: 'right', color: '#475569' }
                  ]
                },
                { canvas: [{ type: 'line', x1: 0, y1: 4, x2: 240, y2: 4, lineWidth: 1, lineColor: '#cbd5e1' }] },

                // Números Principais
                {
                  columns: [
                    {
                      stack: [
                        { text: 'ROMANEIO', fontSize: 8, bold: true, color: '#64748b' },
                        { text: `#${numRomaneio}`, fontSize: 20, bold: true, color: '#0f172a' }
                      ]
                    },
                    {
                      stack: [
                        { text: 'PACOTE Nº', fontSize: 8, bold: true, color: '#047857', alignment: 'right' },
                        { text: `${numPacote}`, fontSize: 28, bold: true, color: '#047857', alignment: 'right' }
                      ]
                    }
                  ],
                  margin: [0, 6, 0, 4]
                },

                // Cliente
                {
                  text: [
                    { text: 'CLIENTE: ', fontSize: 8, bold: true, color: '#64748b' },
                    { text: `${romaneio.cliente}`, fontSize: 11, bold: true, color: '#1e293b' }
                  ],
                  margin: [0, 2, 0, 4]
                },

                // Espécie
                {
                  text: [
                    { text: 'ESPÉCIE: ', fontSize: 8, bold: true, color: '#64748b' },
                    { text: `${especie}`, fontSize: 13, bold: true, color: '#059669' }
                  ],
                  margin: [0, 0, 0, 8]
                },

                // Caixa de Métricas do Pacote
                {
                  table: {
                    widths: ['*', '*', '*'],
                    body: [
                      [
                        { text: 'PEÇAS', fontSize: 8, bold: true, alignment: 'center', fillColor: '#f1f5f9' },
                        { text: 'METROS (ML)', fontSize: 8, bold: true, alignment: 'center', fillColor: '#f1f5f9' },
                        { text: 'VOLUME (M³)', fontSize: 8, bold: true, alignment: 'center', fillColor: '#dcfce7', color: '#15803d' }
                      ],
                      [
                        { text: `${totalPecas} un`, fontSize: 12, bold: true, alignment: 'center' },
                        { text: `${Number(pacote.total_ml).toFixed(2)}`, fontSize: 12, bold: true, alignment: 'center' },
                        { text: `${Number(pacote.total_m3).toFixed(3)}`, fontSize: 13, bold: true, alignment: 'center', color: '#15803d' }
                      ]
                    ]
                  },
                  margin: [0, 2, 0, 8]
                },

                // QR Code e Rodapé
                {
                  columns: [
                    {
                      qr: qrText,
                      fit: 55,
                      alignment: 'left'
                    },
                    {
                      stack: [
                        { text: 'CONFERÊNCIA DE PÁTIO', fontSize: 7, bold: true, color: '#64748b', alignment: 'right' },
                        { text: 'SISTEMA MT PRO MADEIRA', fontSize: 6, color: '#94a3b8', alignment: 'right', margin: [0, 2, 0, 0] },
                        { text: 'MADEIRA SERRADA INSPECIONADA', fontSize: 6, bold: true, color: '#059669', alignment: 'right', margin: [0, 2, 0, 0] }
                      ],
                      margin: [0, 10, 0, 0]
                    }
                  ],
                  margin: [0, 4, 0, 0]
                }
              ],
              padding: 10
            }
          ]
        ]
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => '#94a3b8',
        vLineColor: () => '#94a3b8'
      },
      pageBreak: index < pacotes.length - 1 ? 'after' : undefined
    });
  });

  const docDefinition: any = {
    pageSize: { width: 283, height: 425 }, // ~100mm x 150mm (etiqueta padrão de fardo)
    pageMargins: [15, 15, 15, 15],
    content,
    defaultStyle: {
      font: 'Roboto'
    }
  };

  return pdfMake.createPdf(docDefinition);
}
