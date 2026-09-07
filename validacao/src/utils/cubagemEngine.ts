/**
 * Motor central de regras matemáticas e cubagem de madeira serrada (MT PRO).
 * Unifica cálculos de volume (m³), metros lineares (ml), desmembramento de bica corrida (largura aberta),
 * conversão de unidades (pés para metros) e consolidações estatísticas.
 */

export const FATOR_PES_METROS = 0.3048;

export interface ItemCalculado {
  id?: string;
  espessura: number;
  largura: number;
  comprimento: number;
  quantidade: number;
  volume_m3: number;
  volume_ml: number;
}

export interface GrupoLarguraAberta {
  id: string;
  espessura: number;
  comprimento: number;
  larguras: number[];
  quantidade: number;
  volume_ml: number;
  volume_m3: number;
}

export interface ResumoEspecie {
  especie: string;
  totalMl: number;
  totalM3: number;
  totalPecas: number;
  percentual: number;
}

export interface ResumoBitola {
  especie: string;
  espessura: number;
  largura: number;
  totalMl: number;
  totalM3: number;
  totalPecas: number;
  percentual: number;
}

export interface ResumoLargura {
  especie: string;
  largura: number;
  totalMl: number;
  totalM3: number;
  totalPecas: number;
  percentual: number;
}

export interface ResumoConsolidadoGeral {
  porEspecie: ResumoEspecie[];
  porBitola: ResumoBitola[];
  porLargura: ResumoLargura[];
  totalMadeiraLongaM3: number;
  totalShortM3: number;
  totalAbaixo6M3: number;
  total7M3: number;
  totalAcima8M3: number;
  totalVolumeGeral: number;
  totalMlGeral: number;
  totalPecasGeral: number;
}

/**
 * Converte comprimento para metros reais, aplicando o fator caso a modalidade seja em pés.
 */
export function converterComprimentoParaMetros(comprimento: number | string, tipoRomaneio?: string): number {
  const c = Number(comprimento) || 0;
  if (c <= 0) return 0;
  return tipoRomaneio === 'pes' ? c * FATOR_PES_METROS : c;
}

/**
 * Calcula o volume em M³ de uma linha ou conjunto de larguras abertas.
 */
export function calcularVolumeM3(
  espessura: number | string,
  largura: number | string,
  comprimento: number | string,
  quantidade: number | string,
  tipoRomaneio?: string
): number {
  const e = Number(espessura) || 0;
  const c = Number(comprimento) || 0;
  if (e <= 0 || c <= 0) return 0;

  const cMetros = converterComprimentoParaMetros(c, tipoRomaneio);
  const largStr = String(largura ?? '').trim();

  // Tratamento de bica corrida (largura aberta com valores separados por hífen ou espaço)
  if (/[\s-]+/.test(largStr)) {
    const larguras = largStr
      .split(/\s*-\s*|\s+/)
      .map(Number)
      .filter(x => !isNaN(x) && x > 0);
    const somaLarguras = larguras.reduce((acc, curr) => acc + curr, 0);
    return (e / 100) * (somaLarguras / 100) * cMetros;
  }

  const l = Number(largura) || 0;
  const q = Number(quantidade) || 0;
  if (l <= 0 || q <= 0) return 0;

  return (e / 100) * (l / 100) * cMetros * q;
}

/**
 * Calcula os metros lineares (ML) de uma linha.
 */
export function calcularMetrosLineares(
  comprimento: number | string,
  quantidade: number | string,
  tipoRomaneio?: string
): number {
  const c = Number(comprimento) || 0;
  const q = Number(quantidade) || 0;
  if (c <= 0 || q <= 0) return 0;

  const cMetros = converterComprimentoParaMetros(c, tipoRomaneio);
  return cMetros * q;
}

/**
 * Processa a lista de itens de um pacote, agrupando bica corrida (largura aberta) e mantendo fixas normais.
 */
export function processarItensPacote(itens: any[], tipoRomaneio?: string): {
  normais: any[];
  abertos: GrupoLarguraAberta[];
  maxLarguras: number;
} {
  const normais: any[] = [];
  const gruposMap = new Map<string, GrupoLarguraAberta>();

  (itens || []).forEach(item => {
    const qtd = Number(item.quantidade) || 0;
    const largStr = String(item.largura ?? '').trim();
    const isMultiLargura = /[\s-]+/.test(largStr);

    if ((qtd > 1 && !isMultiLargura) || tipoRomaneio === 'padrao' || tipoRomaneio === 'pes') {
      normais.push(item);
      return;
    }

    const esp = Number(item.espessura) || 0;
    const comp = Number(item.comprimento) || 0;
    const cMetros = converterComprimentoParaMetros(comp, tipoRomaneio);
    const key = `${esp}_${comp}`;

    if (!gruposMap.has(key)) {
      gruposMap.set(key, {
        id: key,
        espessura: esp,
        comprimento: comp,
        larguras: [],
        quantidade: 0,
        volume_ml: 0,
        volume_m3: 0
      });
    }

    const grupo = gruposMap.get(key)!;

    if (isMultiLargura) {
      const largs = largStr.split(/\s*-\s*|\s+/).map(Number).filter(x => !isNaN(x) && x > 0);
      largs.forEach(l => {
        grupo.larguras.push(l);
        grupo.quantidade += 1;
        grupo.volume_ml += cMetros;
        grupo.volume_m3 += (esp / 100) * (l / 100) * cMetros;
      });
    } else {
      const l = Number(item.largura) || 0;
      if (l > 0) {
        grupo.larguras.push(l);
        grupo.quantidade += (qtd > 0 ? qtd : 1);
        grupo.volume_ml += cMetros * (qtd > 0 ? qtd : 1);
        grupo.volume_m3 += (esp / 100) * (l / 100) * cMetros * (qtd > 0 ? qtd : 1);
      }
    }
  });

  const abertos = Array.from(gruposMap.values());
  const maxLarguras = abertos.reduce((max, g) => Math.max(max, g.larguras.length), 0);

  return { normais, abertos, maxLarguras };
}

/**
 * Calcula os totais (Peças, ML e M³) de um único pacote.
 */
export function calcularTotaisPacote(itens: any[], tipoRomaneio?: string): {
  totalPecas: number;
  totalMl: number;
  totalM3: number;
} {
  let totalPecas = 0;
  let totalMl = 0;
  let totalM3 = 0;

  (itens || []).forEach(item => {
    const largStr = String(item.largura ?? '').trim();
    const esp = Number(item.espessura) || 0;
    const comp = Number(item.comprimento) || 0;
    const qtd = Number(item.quantidade) || 0;

    if (esp <= 0 || comp <= 0) return;

    if (/[\s-]+/.test(largStr)) {
      const larguras = largStr.split(/\s*-\s*|\s+/).map(Number).filter(x => !isNaN(x) && x > 0);
      totalPecas += larguras.length;
      larguras.forEach(l => {
        const cMetros = converterComprimentoParaMetros(comp, tipoRomaneio);
        totalM3 += (esp / 100) * (l / 100) * cMetros;
        totalMl += cMetros;
      });
    } else {
      const l = Number(item.largura) || 0;
      if (l > 0 && qtd > 0) {
        totalPecas += qtd;
        totalM3 += calcularVolumeM3(esp, l, comp, qtd, tipoRomaneio);
        totalMl += calcularMetrosLineares(comp, qtd, tipoRomaneio);
      }
    }
  });

  return { totalPecas, totalMl, totalM3 };
}

/**
 * Gera os resumos consolidados completos por Espécie, Bitola e Faixas de Comprimento.
 */
export function calcularResumosConsolidados(pacotes: any[], tipoRomaneio?: string): ResumoConsolidadoGeral {
  const resumoEspecieMap: { [key: string]: { especie: string; totalMl: number; totalM3: number; totalPecas: number } } = {};
  const resumoBitolaMap: { [key: string]: { especie: string; espessura: number; largura: number; totalMl: number; totalM3: number; totalPecas: number } } = {};
  const resumoLarguraMap: { [key: string]: { especie: string; largura: number; totalMl: number; totalM3: number; totalPecas: number } } = {};

  let totalMadeiraLongaM3 = 0;
  let totalShortM3 = 0;
  let totalAbaixo6M3 = 0;
  let total7M3 = 0;
  let totalAcima8M3 = 0;
  let totalVolumeGeral = 0;
  let totalMlGeral = 0;
  let totalPecasGeral = 0;

  (pacotes || []).forEach(p => {
    const especie = p.especie?.trim() || 'Sem espécie';

    (p.itens || []).forEach((i: any) => {
      const e = Number(i.espessura) || 0;
      const lVal = i.largura;
      const c = Number(i.comprimento) || 0;
      const q = Number(i.quantidade) || 0;

      if (!e || !lVal || !c || !q) return;

      const cMetros = converterComprimentoParaMetros(c, tipoRomaneio);
      const lStr = String(lVal).trim();

      if (/[\s-]+/.test(lStr)) {
        const larguras = lStr.split(/\s*-\s*|\s+/).map(Number).filter(x => !isNaN(x) && x > 0);
        larguras.forEach(l => {
          const m3 = (e / 100) * (l / 100) * cMetros * 1;
          const ml = cMetros * 1;

          totalVolumeGeral += m3;
          totalMlGeral += ml;
          totalPecasGeral += 1;

          if (tipoRomaneio === 'pes') {
            if (c <= 6) totalAbaixo6M3 += m3;
            else if (c > 6 && c < 8) total7M3 += m3;
            else totalAcima8M3 += m3;
          } else {
            if (cMetros >= 2.00) totalMadeiraLongaM3 += m3;
            else totalShortM3 += m3;
          }

          if (!resumoEspecieMap[especie]) {
            resumoEspecieMap[especie] = { especie, totalMl: 0, totalM3: 0, totalPecas: 0 };
          }
          resumoEspecieMap[especie].totalMl += ml;
          resumoEspecieMap[especie].totalM3 += m3;
          resumoEspecieMap[especie].totalPecas += 1;

          const bitolaKey = `${especie}_${e}_${l}`;
          if (!resumoBitolaMap[bitolaKey]) {
            resumoBitolaMap[bitolaKey] = { especie, espessura: e, largura: l, totalMl: 0, totalM3: 0, totalPecas: 0 };
          }
          resumoBitolaMap[bitolaKey].totalMl += ml;
          resumoBitolaMap[bitolaKey].totalM3 += m3;
          resumoBitolaMap[bitolaKey].totalPecas += 1;

          const larguraKey = `${especie}_${l}`;
          if (!resumoLarguraMap[larguraKey]) {
            resumoLarguraMap[larguraKey] = { especie, largura: l, totalMl: 0, totalM3: 0, totalPecas: 0 };
          }
          resumoLarguraMap[larguraKey].totalMl += ml;
          resumoLarguraMap[larguraKey].totalM3 += m3;
          resumoLarguraMap[larguraKey].totalPecas += 1;
        });
      } else {
        const l = Number(lVal) || 0;
        const m3 = (e / 100) * (l / 100) * cMetros * q;
        const ml = cMetros * q;

        totalVolumeGeral += m3;
        totalMlGeral += ml;
        totalPecasGeral += q;

        if (tipoRomaneio === 'pes') {
          if (c <= 6) totalAbaixo6M3 += m3;
          else if (c > 6 && c < 8) total7M3 += m3;
          else totalAcima8M3 += m3;
        } else {
          if (cMetros >= 2.00) totalMadeiraLongaM3 += m3;
          else totalShortM3 += m3;
        }

        if (!resumoEspecieMap[especie]) {
          resumoEspecieMap[especie] = { especie, totalMl: 0, totalM3: 0, totalPecas: 0 };
        }
        resumoEspecieMap[especie].totalMl += ml;
        resumoEspecieMap[especie].totalM3 += m3;
        resumoEspecieMap[especie].totalPecas += q;

        const bitolaKey = `${especie}_${e}_${l}`;
        if (!resumoBitolaMap[bitolaKey]) {
          resumoBitolaMap[bitolaKey] = { especie, espessura: e, largura: l, totalMl: 0, totalM3: 0, totalPecas: 0 };
        }
        resumoBitolaMap[bitolaKey].totalMl += ml;
        resumoBitolaMap[bitolaKey].totalM3 += m3;
        resumoBitolaMap[bitolaKey].totalPecas += q;

        const larguraKey = `${especie}_${l}`;
        if (!resumoLarguraMap[larguraKey]) {
          resumoLarguraMap[larguraKey] = { especie, largura: l, totalMl: 0, totalM3: 0, totalPecas: 0 };
        }
        resumoLarguraMap[larguraKey].totalMl += ml;
        resumoLarguraMap[larguraKey].totalM3 += m3;
        resumoLarguraMap[larguraKey].totalPecas += q;
      }
    });
  });

  const porEspecie: ResumoEspecie[] = Object.values(resumoEspecieMap)
    .sort((a, b) => b.totalM3 - a.totalM3)
    .map(x => ({
      ...x,
      percentual: totalVolumeGeral > 0 ? (x.totalM3 / totalVolumeGeral) * 100 : 0
    }));

  const porBitola: ResumoBitola[] = Object.values(resumoBitolaMap)
    .sort((a, b) => {
      if (a.especie !== b.especie) return a.especie.localeCompare(b.especie);
      if (a.espessura !== b.espessura) return b.espessura - a.espessura;
      return b.largura - a.largura;
    })
    .map(x => ({
      ...x,
      percentual: totalVolumeGeral > 0 ? (x.totalM3 / totalVolumeGeral) * 100 : 0
    }));

  const porLargura: ResumoLargura[] = Object.values(resumoLarguraMap)
    .sort((a, b) => {
      if (a.especie !== b.especie) return a.especie.localeCompare(b.especie);
      return b.largura - a.largura;
    })
    .map(x => ({
      ...x,
      percentual: totalVolumeGeral > 0 ? (x.totalM3 / totalVolumeGeral) * 100 : 0
    }));

  return {
    porEspecie,
    porBitola,
    porLargura,
    totalMadeiraLongaM3,
    totalShortM3,
    totalAbaixo6M3,
    total7M3,
    totalAcima8M3,
    totalVolumeGeral,
    totalMlGeral,
    totalPecasGeral
  };
}

/**
 * Validação de tolerâncias operacionais de madeira serrada.
 * Retorna alertas visuais amigáveis caso o operador digite medidas anômalas por acidente.
 */
export function validarToleranciaMedida(
  espessura: number | string,
  largura: number | string,
  comprimento: number | string,
  tipoRomaneio?: string
): { invalido: boolean; aviso?: string } {
  const e = Number(espessura);
  const l = Number(largura);
  const c = Number(comprimento);

  if (e > 25) {
    return { invalido: true, aviso: `Espessura de ${e} cm é incomum para madeira serrada (geralmente <= 15 cm).` };
  }
  if (tipoRomaneio === 'pes') {
    if (c > 30) {
      return { invalido: true, aviso: `Comprimento de ${c} pés é incomum (geralmente <= 24 pés).` };
    }
  } else {
    if (c > 8.5) {
      return { invalido: true, aviso: `Comprimento de ${c} m é incomum para tábuas e pranchas (geralmente <= 7,00 m).` };
    }
  }
  if (!isNaN(l) && l > 80) {
    return { invalido: true, aviso: `Largura de ${l} cm é muito ampla para madeira serrada.` };
  }

  return { invalido: false };
}
