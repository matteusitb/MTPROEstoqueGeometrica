import { create } from 'zustand';

const DRAFT_KEY = 'mtpro_romaneio_draft';
let draftTimeout: ReturnType<typeof setTimeout> | null = null;

const getLocalDateString = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export interface RomaneioItem {
  id: string;
  espessura: number | '';
  largura: number | string | '';
  comprimento: number | '';
  quantidade: number | '';
}

export interface RomaneioPacote {
  id: string;
  numero: number;
  especie: string;
  itens: RomaneioItem[];
}

interface RomaneioState {
  tipoRomaneio: 'padrao' | 'aberta' | 'pes';
  cliente: string;
  data: string;
  pacotes: RomaneioPacote[];

  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  setTipoRomaneio: (tipo: 'padrao' | 'aberta' | 'pes') => void;
  setCliente: (cliente: string) => void;
  setData: (data: string) => void;

  addPacote: () => void;
  removePacote: (pacoteId: string) => void;
  duplicatePacote: (pacoteId: string) => void;
  aplicarBitolaPacote: (pacoteId: string, espessura: number | '', comprimento: number | '') => void;
  colarItensExcel: (pacoteId: string, clipboardText: string) => number;
  setEspeciePacote: (pacoteId: string, especie: string) => void;
  setNumeroPacote: (pacoteId: string, numero: number) => void;

  addItem: (pacoteId: string) => void;
  removeItem: (pacoteId: string, itemId: string) => void;
  updateItem: (pacoteId: string, itemId: string, field: keyof RomaneioItem, value: string | number) => void;
  duplicateItem: (pacoteId: string, itemId: string) => void;

  loadRomaneio: (dados: {
    cliente: string;
    data: string;
    pacotes: {
      numero_pacote?: number;
      especie?: string;
      itens?: {
        espessura?: number | string;
        largura?: number | string;
        comprimento?: number | string;
        quantidade?: number | string;
      }[];
    }[];
    tipoRomaneio?: 'padrao' | 'aberta' | 'pes';
  }) => void;
  resetForm: () => void;

  // Gerenciamento de Rascunhos (Autosave)
  salvarRascunho: () => void;
  carregarRascunho: () => boolean;
  limparRascunho: () => void;
  temRascunhoSalvo: () => boolean;
}

const generateId = () => Math.random().toString(36).substring(2, 11);

export const useRomaneioStore = create<RomaneioState>((set, get) => ({
  tipoRomaneio: 'padrao',
  cliente: '',
  data: getLocalDateString(),
  pacotes: [
    {
      id: generateId(),
      numero: 1,
      especie: '',
      itens: [{ id: generateId(), espessura: '', largura: '', comprimento: '', quantidade: '' }]
    }
  ],
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setTipoRomaneio: (tipo) => {
    set({ tipoRomaneio: tipo });
    get().salvarRascunho();
  },

  setCliente: (cliente) => {
    set({ cliente });
    get().salvarRascunho();
  },

  setData: (data) => {
    set({ data });
    get().salvarRascunho();
  },

  addPacote: () => {
    set((state) => {
      const lastPacote = state.pacotes[state.pacotes.length - 1];

      // Verificar se o último pacote está minimamente preenchido
      if (lastPacote) {
        const temEspecie = lastPacote.especie && lastPacote.especie.trim().length > 0;
        const temLinhaCompleta = lastPacote.itens.some(
          (i) =>
            i.espessura !== '' &&
            i.largura !== '' &&
            i.comprimento !== '' &&
            i.quantidade !== '' &&
            Number(i.espessura) > 0 &&
            Number(i.comprimento) > 0 &&
            Number(i.quantidade) > 0
        );
        if (!temEspecie || !temLinhaCompleta) {
          return state;
        }
      }

      const maxNumero = state.pacotes.reduce((max, p) => (p.numero > max ? p.numero : max), 0);
      return {
        pacotes: [
          ...state.pacotes,
          {
            id: generateId(),
            numero: maxNumero + 1,
            especie: lastPacote ? lastPacote.especie : '',
            itens: [{ id: generateId(), espessura: '', largura: '', comprimento: '', quantidade: '' }]
          }
        ]
      };
    });
    get().salvarRascunho();
  },

  duplicatePacote: (pacoteId) => {
    set((state) => {
      const pacoteOriginal = state.pacotes.find((p) => p.id === pacoteId);
      if (!pacoteOriginal) return state;

      const maxNumero = state.pacotes.reduce((max, p) => (p.numero > max ? p.numero : max), 0);
      const pacoteDuplicado: RomaneioPacote = {
        id: generateId(),
        numero: maxNumero + 1,
        especie: pacoteOriginal.especie,
        itens: pacoteOriginal.itens.map((it) => ({
          ...it,
          id: generateId()
        }))
      };

      return {
        pacotes: [...state.pacotes, pacoteDuplicado]
      };
    });
    get().salvarRascunho();
  },

  aplicarBitolaPacote: (pacoteId, espessura, comprimento) => {
    set((state) => ({
      pacotes: state.pacotes.map((p) => {
        if (p.id === pacoteId) {
          return {
            ...p,
            itens: p.itens.map((item) => ({
              ...item,
              espessura: espessura !== '' ? Number(espessura) : item.espessura,
              comprimento: comprimento !== '' ? Number(comprimento) : item.comprimento
            }))
          };
        }
        return p;
      })
    }));
    get().salvarRascunho();
  },

  colarItensExcel: (pacoteId, clipboardText) => {
    if (!clipboardText || !clipboardText.trim()) return 0;
    const linhas = clipboardText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (linhas.length === 0) return 0;

    const novosItens: RomaneioItem[] = [];

    for (const linha of linhas) {
      // Divide por Tabulação (Excel padrão) ou ponto-e-vírgula/vírgula
      const colunas = linha.split(/\t|;/).map((c) => c.trim().replace(',', '.'));
      if (colunas.length === 0 || !colunas.some((c) => c !== '')) continue;

      let esp: number | '' = '';
      let comp: number | '' = '';
      let larg: number | string | '' = '';
      let qtd: number | '' = '';

      if (colunas.length >= 4) {
        // [Espessura, Comprimento, Largura, Qtd] ou [Espessura, Largura, Comprimento, Qtd]
        // Se a 2ª coluna for maior que a 3ª e >= 1, normalmente é comprimento
        const col0 = Number(colunas[0]);
        const col1 = Number(colunas[1]);
        const col2 = Number(colunas[2]);
        const col3 = Number(colunas[3]);

        esp = !isNaN(col0) && col0 > 0 ? col0 : '';
        if (col1 > col2) {
          comp = !isNaN(col1) && col1 > 0 ? col1 : '';
          larg = !isNaN(col2) && col2 > 0 ? col2 : colunas[2];
        } else {
          larg = !isNaN(col1) && col1 > 0 ? col1 : colunas[1];
          comp = !isNaN(col2) && col2 > 0 ? col2 : '';
        }
        qtd = !isNaN(col3) && col3 > 0 ? col3 : 1;
      } else if (colunas.length === 3) {
        // [Espessura, Comprimento, Largura]
        const col0 = Number(colunas[0]);
        const col1 = Number(colunas[1]);
        const col2 = Number(colunas[2]);
        esp = !isNaN(col0) && col0 > 0 ? col0 : '';
        comp = !isNaN(col1) && col1 > 0 ? col1 : '';
        larg = !isNaN(col2) && col2 > 0 ? col2 : colunas[2];
        qtd = 1;
      } else if (colunas.length === 1) {
        // Apenas Larguras consecutivas
        larg = colunas[0];
        qtd = 1;
      }

      novosItens.push({
        id: generateId(),
        espessura: esp,
        largura: larg,
        comprimento: comp,
        quantidade: qtd
      });
    }

    if (novosItens.length === 0) return 0;

    set((state) => ({
      pacotes: state.pacotes.map((p) => {
        if (p.id === pacoteId) {
          // Se o pacote só tiver 1 linha em branco inicial, substitui
          const isInicialVazia =
            p.itens.length === 1 &&
            p.itens[0].espessura === '' &&
            p.itens[0].largura === '' &&
            p.itens[0].comprimento === '' &&
            p.itens[0].quantidade === '';

          return {
            ...p,
            itens: isInicialVazia ? novosItens : [...p.itens, ...novosItens]
          };
        }
        return p;
      })
    }));

    get().salvarRascunho();
    return novosItens.length;
  },

  removePacote: (pacoteId) => {
    set((state) => ({
      pacotes: state.pacotes.filter((p) => p.id !== pacoteId)
    }));
    get().salvarRascunho();
  },

  setEspeciePacote: (pacoteId, especie) => {
    set((state) => ({
      pacotes: state.pacotes.map((p) => (p.id === pacoteId ? { ...p, especie } : p))
    }));
    get().salvarRascunho();
  },

  setNumeroPacote: (pacoteId, numero) => {
    set((state) => ({
      pacotes: state.pacotes.map((p) => (p.id === pacoteId ? { ...p, numero } : p))
    }));
    get().salvarRascunho();
  },

  addItem: (pacoteId) => {
    set((state) => {
      const pIdx = state.pacotes.findIndex((p) => p.id === pacoteId);
      if (pIdx === -1) return state;
      const p = state.pacotes[pIdx];
      const lastItem = p.itens[p.itens.length - 1];
      const newItem: RomaneioItem = {
        id: generateId(),
        espessura: lastItem ? lastItem.espessura : '',
        largura: '',
        comprimento: lastItem ? lastItem.comprimento : '',
        quantidade: ''
      };
      const newPacotes = [...state.pacotes];
      newPacotes[pIdx] = {
        ...p,
        itens: [...p.itens, newItem]
      };
      return { pacotes: newPacotes };
    });
    get().salvarRascunho();
  },

  removeItem: (pacoteId, itemId) => {
    set((state) => {
      const pIdx = state.pacotes.findIndex((p) => p.id === pacoteId);
      if (pIdx === -1) return state;
      const p = state.pacotes[pIdx];
      const newPacotes = [...state.pacotes];
      newPacotes[pIdx] = {
        ...p,
        itens: p.itens.filter((i) => i.id !== itemId)
      };
      return { pacotes: newPacotes };
    });
    get().salvarRascunho();
  },

  duplicateItem: (pacoteId, itemId) => {
    set((state) => {
      const pIdx = state.pacotes.findIndex((p) => p.id === pacoteId);
      if (pIdx === -1) return state;
      const p = state.pacotes[pIdx];
      const idx = p.itens.findIndex((i) => i.id === itemId);
      if (idx === -1) return state;
      const itemToDuplicate = p.itens[idx];
      const newItem: RomaneioItem = {
        ...itemToDuplicate,
        id: generateId()
      };
      const newItens = [...p.itens];
      newItens.splice(idx + 1, 0, newItem);
      const newPacotes = [...state.pacotes];
      newPacotes[pIdx] = {
        ...p,
        itens: newItens
      };
      return { pacotes: newPacotes };
    });
    get().salvarRascunho();
  },

  updateItem: (pacoteId, itemId, field, value) => {
    set((state) => {
      const pIdx = state.pacotes.findIndex((p) => p.id === pacoteId);
      if (pIdx === -1) return state;
      const p = state.pacotes[pIdx];
      const iIdx = p.itens.findIndex((i) => i.id === itemId);
      if (iIdx === -1) return state;
      if (p.itens[iIdx][field] === value) return state;

      const newItens = [...p.itens];
      newItens[iIdx] = { ...newItens[iIdx], [field]: value };
      const newPacotes = [...state.pacotes];
      newPacotes[pIdx] = { ...p, itens: newItens };
      return { pacotes: newPacotes };
    });
    get().salvarRascunho();
  },

  resetForm: () => {
    set({
      tipoRomaneio: 'padrao',
      cliente: '',
      data: getLocalDateString(),
      pacotes: [
        {
          id: generateId(),
          numero: 1,
          especie: '',
          itens: [{ id: generateId(), espessura: '', largura: '', comprimento: '', quantidade: '' }]
        }
      ]
    });
  },

  loadRomaneio: (dados) =>
    set({
      tipoRomaneio: dados.tipoRomaneio || 'padrao',
      cliente: dados.cliente,
      data: dados.data,
      pacotes: dados.pacotes.map((p, pIdx: number) => {
        const itensBD = p.itens || [];
        const itensAgrupados: RomaneioItem[] = [];
        const bicaCorridaMap: { [key: string]: { espessura: number; comprimento: number; larguras: number[] } } = {};

        itensBD.forEach((i) => {
          const esp = Number(i.espessura) || 0;
          const comp = Number(i.comprimento) || 0;
          const qtd = Number(i.quantidade) || 0;
          const larg = Number(i.largura) || 0;

          if (dados.tipoRomaneio === 'aberta' && qtd === 1 && esp > 0 && comp > 0 && larg > 0) {
            const key = `${esp}_${comp}`;
            if (!bicaCorridaMap[key]) {
              bicaCorridaMap[key] = { espessura: esp, comprimento: comp, larguras: [] };
            }
            bicaCorridaMap[key].larguras.push(larg);
          } else {
            itensAgrupados.push({
              id: generateId(),
              espessura: (i.espessura as any) ?? '',
              largura: (i.largura as any) ?? '',
              comprimento: (i.comprimento as any) ?? '',
              quantidade: (i.quantidade as any) ?? ''
            });
          }
        });

        Object.values(bicaCorridaMap).forEach((grupo) => {
          if (grupo.larguras.length > 1) {
            itensAgrupados.push({
              id: generateId(),
              espessura: grupo.espessura,
              largura: grupo.larguras.join(' - '),
              comprimento: grupo.comprimento,
              quantidade: grupo.larguras.length
            });
          } else if (grupo.larguras.length === 1) {
            itensAgrupados.push({
              id: generateId(),
              espessura: grupo.espessura,
              largura: grupo.larguras[0],
              comprimento: grupo.comprimento,
              quantidade: 1
            });
          }
        });

        // Ordenar itens por espessura/comprimento decrescente para manter a bitola organizada
        itensAgrupados.sort((a, b) => {
          const espA = Number(a.espessura) || 0;
          const espB = Number(b.espessura) || 0;
          if (espA !== espB) return espB - espA;

          const compA = Number(a.comprimento) || 0;
          const compB = Number(b.comprimento) || 0;
          return compB - compA;
        });

        return {
          id: generateId(),
          numero: p.numero_pacote ?? pIdx + 1,
          especie: p.especie || '',
          itens:
            itensAgrupados.length > 0
              ? itensAgrupados
              : [{ id: generateId(), espessura: '', largura: '', comprimento: '', quantidade: '' }]
        };
      })
    }),

  // Autosave / Rascunhos com Debounce de 600ms (não bloqueia a digitação no grid)
  salvarRascunho: () => {
    if (draftTimeout) clearTimeout(draftTimeout);
    draftTimeout = setTimeout(() => {
      try {
        const state = get();
        const temDados =
          state.cliente.trim().length > 0 ||
          state.pacotes.some(
            (p) =>
              (p.especie && p.especie.trim().length > 0) ||
              p.itens.some((i) => i.espessura !== '' || i.largura !== '' || i.comprimento !== '')
          );

        if (temDados) {
          const payload = {
            tipoRomaneio: state.tipoRomaneio,
            cliente: state.cliente,
            data: state.data,
            pacotes: state.pacotes,
            updatedAt: new Date().toISOString()
          };
          localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
        }
      } catch {
        // Ignora erro de localStorage
      }
    }, 600);
  },

  carregarRascunho: () => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.pacotes) && parsed.pacotes.length > 0) {
        set({
          tipoRomaneio: parsed.tipoRomaneio || 'padrao',
          cliente: parsed.cliente || '',
          data: parsed.data || getLocalDateString(),
          pacotes: parsed.pacotes
        });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  limparRascunho: () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Ignora
    }
  },

  temRascunhoSalvo: () => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return !!(
        parsed &&
        (parsed.cliente?.trim() ||
          parsed.pacotes?.some(
            (p: any) =>
              p.especie?.trim() ||
              p.itens?.some((i: any) => i.espessura !== '' || i.largura !== '' || i.comprimento !== '')
          ))
      );
    } catch {
      return false;
    }
  }
}));
