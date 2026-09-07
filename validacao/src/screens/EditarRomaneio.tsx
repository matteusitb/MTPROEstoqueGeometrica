import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useRomaneioStore } from '../store/useRomaneioStore';
import GridCubagem from '../components/GridCubagem';
import {
  Plus, Save, Trash2, PackageSearch, ArrowLeft, Loader2, BarChart3,
  ChevronDown, ChevronUp, Copy, Layers, Ruler, Sparkles
} from 'lucide-react';
import Swal from 'sweetalert2';
import { motion, AnimatePresence } from 'framer-motion';
import {
  calcularVolumeM3,
  calcularMetrosLineares,
  calcularResumosConsolidados
} from '../utils/cubagemEngine';

interface CardPacoteProps {
  pacoteId: string;
  numero: number;
  especie: string;
  index: number;
  totalPacotes: number;
  especiesList: any[];
  onNumeroChange: (id: string, numero: number) => void;
  onEspecieChange: (id: string, especie: string) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
}

const CardPacote = React.memo(({
  pacoteId,
  numero,
  especie,
  index,
  totalPacotes,
  especiesList,
  onNumeroChange,
  onEspecieChange,
  onDuplicate,
  onRemove
}: CardPacoteProps) => {
  return (
    <div className="glass-card p-6 border border-slate-200/50 dark:border-slate-800/50 transition-all">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6 pb-6 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <span className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            Pacote Nº
          </span>
          <input
            type="number"
            min="1"
            className="w-20 glass-input px-3 py-2 text-center font-black text-slate-800 dark:text-slate-100 text-lg"
            value={numero}
            onChange={e => onNumeroChange(pacoteId, Number(e.target.value) || 1)}
          />
        </div>

        <div className="flex-1 max-w-md w-full">
          <div className="flex items-center gap-3">
            <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest shrink-0">
              Espécie: <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              list={`especies-list-${pacoteId}`}
              placeholder="Selecione ou digite"
              className={`w-full glass-input px-4 py-2.5 font-bold text-slate-800 dark:text-slate-100 text-sm ${
                !especie.trim()
                  ? 'border-amber-300/60 dark:border-amber-900/40'
                  : 'border-emerald-300/60 dark:border-emerald-900/40'
              }`}
              value={especie}
              onChange={e => onEspecieChange(pacoteId, e.target.value)}
            />
            <datalist id={`especies-list-${pacoteId}`}>
              {especiesList.map(esp => (
                <option key={esp.id} value={esp.nome} className="dark:bg-slate-900 dark:text-slate-200">
                  {esp.cientifico ? `${esp.nome} (${esp.cientifico})` : esp.nome}
                </option>
              ))}
            </datalist>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onDuplicate(pacoteId)}
            className="text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 dark:hover:text-emerald-400 px-3.5 py-2.5 rounded-xl font-bold transition-all flex items-center gap-1.5 border border-slate-200/60 dark:border-slate-700 cursor-pointer"
            title="Duplicar este pacote com todas as suas peças"
          >
            <Copy size={15} /> Duplicar Pacote
          </button>

          {totalPacotes > 1 && (
            <button
              type="button"
              onClick={() => onRemove(pacoteId)}
              className="text-xs text-red-500 hover:text-red-600 bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/40 px-3.5 py-2.5 rounded-xl font-bold transition-all flex items-center gap-1.5 border border-red-100 dark:border-red-900/30 cursor-pointer"
              title="Remover pacote"
            >
              <Trash2 size={15} /> Remover
            </button>
          )}
        </div>
      </div>

      <GridCubagem pacoteId={pacoteId} pacoteIndex={index} />
    </div>
  );
});

CardPacote.displayName = 'CardPacote';

export default function EditarRomaneio() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [salvando, setSalvando] = useState(false);
  const [mostrarResumo, setMostrarResumo] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [especiesList, setEspeciesList] = useState<any[]>([]);
  const [clienteError, setClienteError] = useState(false);
  const [addPacoteError, setAddPacoteError] = useState('');

  const cliente = useRomaneioStore(state => state.cliente);
  const data = useRomaneioStore(state => state.data);
  const pacotes = useRomaneioStore(state => state.pacotes);
  const setCliente = useRomaneioStore(state => state.setCliente);
  const setData = useRomaneioStore(state => state.setData);
  const addPacote = useRomaneioStore(state => state.addPacote);
  const removePacote = useRomaneioStore(state => state.removePacote);
  const duplicatePacote = useRomaneioStore(state => state.duplicatePacote);
  const setEspeciePacote = useRomaneioStore(state => state.setEspeciePacote);
  const setNumeroPacote = useRomaneioStore(state => state.setNumeroPacote);
  const loadRomaneio = useRomaneioStore(state => state.loadRomaneio);
  const resetForm = useRomaneioStore(state => state.resetForm);
  const tipoRomaneio = useRomaneioStore(state => state.tipoRomaneio);
  const setTipoRomaneio = useRomaneioStore(state => state.setTipoRomaneio);

  useEffect(() => {
    const carregar = async () => {
      if (!id) return;
      setCarregando(true);
      try {
        const espRes = await window.electronAPI.queryDB('SELECT * FROM especies ORDER BY nome');
        if (espRes.success && espRes.data) setEspeciesList(espRes.data);

        const rResult = await window.electronAPI.queryDB(`
          SELECT r.id, r.data, c.nome as cliente, r.total_m3, r.total_ml, r.tipo_romaneio
          FROM romaneios r LEFT JOIN clientes c ON r.cliente_id = c.id WHERE r.id = ?
        `, [Number(id)]);

        if (!rResult.success || !rResult.data || rResult.data.length === 0) {
          Swal.fire({ icon: 'error', title: 'Erro', text: 'Romaneio não encontrado.' });
          navigate('/');
          return;
        }

        const romaneio = rResult.data[0] as any;

        const pResult = await window.electronAPI.queryDB(`
          SELECT rp.*, COALESCE(e.nome, e_glob.nome) as especie
          FROM romaneio_pacotes rp
          LEFT JOIN especies e ON rp.especie_id = e.id
          LEFT JOIN romaneios r ON rp.romaneio_id = r.id
          LEFT JOIN especies e_glob ON r.especie_id = e_glob.id
          WHERE rp.romaneio_id = ? ORDER BY rp.numero_pacote
        `, [Number(id)]);

        const pacotesBD = pResult.data || [];

        if (pacotesBD.length > 0) {
          const pacoteIds = pacotesBD.map((p: any) => p.id);
          const placeholders = pacoteIds.map(() => '?').join(',');
          const iResult = await window.electronAPI.queryDB(
            `SELECT * FROM romaneio_itens WHERE pacote_id IN (${placeholders}) ORDER BY id`,
            pacoteIds
          );
          const itensMap = new Map<any, any[]>();
          (iResult.data || []).forEach((item: any) => {
            const list = itensMap.get(item.pacote_id) || [];
            list.push(item);
            itensMap.set(item.pacote_id, list);
          });
          for (const pacote of pacotesBD) {
            pacote.itens = itensMap.get(pacote.id) || [];
          }
        }

        loadRomaneio({
          cliente: romaneio.cliente,
          data: romaneio.data,
          pacotes: pacotesBD,
          tipoRomaneio: romaneio.tipo_romaneio || 'padrao'
        });
      } catch {
        Swal.fire({ icon: 'error', title: 'Erro', text: 'Falha ao carregar o romaneio.' });
        navigate('/');
      } finally {
        setCarregando(false);
      }
    };
    carregar();
    return () => { resetForm(); };
  }, [id, loadRomaneio, navigate, resetForm]);

  const handleAddPacote = useCallback(() => {
    const lastPacote = pacotes[pacotes.length - 1];
    if (lastPacote) {
      const temEspecie = lastPacote.especie && lastPacote.especie.trim().length > 0;
      const temLinhaCompleta = lastPacote.itens.some(
        i =>
          i.espessura !== '' &&
          i.largura !== '' &&
          i.comprimento !== '' &&
          i.quantidade !== '' &&
          Number(i.espessura) > 0 &&
          Number(i.comprimento) > 0 &&
          Number(i.quantidade) > 0
      );
      if (!temEspecie) {
        setAddPacoteError('Defina a espécie do pacote atual antes de adicionar um novo.');
        setTimeout(() => setAddPacoteError(''), 3500);
        return;
      }
      if (!temLinhaCompleta) {
        setAddPacoteError('Preencha pelo menos uma linha de cubagem completa no pacote atual.');
        setTimeout(() => setAddPacoteError(''), 3500);
        return;
      }
    }
    setAddPacoteError('');
    addPacote();
  }, [addPacote, pacotes]);

  const totaisGerais = useMemo(() => {
    let totalM3 = 0;
    let totalML = 0;
    (pacotes || []).forEach(p => {
      (p.itens || []).forEach(i => {
        totalM3 += calcularVolumeM3(i.espessura, i.largura, i.comprimento, i.quantidade, tipoRomaneio);
        totalML += calcularMetrosLineares(i.comprimento, i.quantidade, tipoRomaneio);
      });
    });
    return { totalGeralM3: totalM3, totalGeralML: totalML };
  }, [pacotes, tipoRomaneio]);

  const totalGeralM3 = totaisGerais.totalGeralM3;
  const totalGeralML = totaisGerais.totalGeralML;

  const resumos = useMemo(() => {
    if (!mostrarResumo && totalGeralM3 === 0) return null;
    return calcularResumosConsolidados(pacotes, tipoRomaneio);
  }, [pacotes, tipoRomaneio, mostrarResumo, totalGeralM3]);

  const salvarEdicao = useCallback(async () => {
    if (!cliente.trim()) {
      setClienteError(true);
      Swal.fire({
        icon: 'warning',
        title: 'Atenção',
        text: 'Preencha o nome do fornecedor/cliente antes de salvar.',
        confirmButtonColor: '#059669',
        customClass: { popup: 'rounded-3xl', confirmButton: 'rounded-xl font-bold px-6 py-3 shadow-md' }
      });
      return;
    }

    const isLarguraValida = (l: unknown) => {
      if (l === '' || l === undefined || l === null) return false;
      const lStr = String(l).trim();
      if (lStr === '') return false;
      if (tipoRomaneio === 'aberta' && /[\s-]+/.test(lStr)) {
        const partes = lStr.split(/\s*-\s*|\s+/);
        return partes.length > 0 && partes.every(p => {
          const num = Number(p);
          return !isNaN(num) && num > 0;
        });
      }
      if ((tipoRomaneio === 'padrao' || tipoRomaneio === 'pes') && /[\s-]+/.test(lStr)) return false;
      const num = Number(lStr);
      return !isNaN(num) && num > 0;
    };

    const hasItemValido = (p: typeof pacotes[0]) => {
      return p.itens.some(
        i =>
          i.espessura &&
          i.largura &&
          i.comprimento &&
          i.quantidade &&
          Number(i.espessura) > 0 &&
          isLarguraValida(i.largura) &&
          Number(i.comprimento) > 0 &&
          Number(i.quantidade) > 0
      );
    };

    // Validar espécie de todos os pacotes
    const pacoteSemEspecie = pacotes.find(p => !p.especie || !p.especie.trim());
    if (pacoteSemEspecie) {
      Swal.fire({
        icon: 'warning',
        title: 'Atenção',
        text: `Defina a espécie para todos os pacotes. (O Pacote Nº ${pacoteSemEspecie.numero} está sem espécie).`,
        confirmButtonColor: '#059669',
        customClass: { popup: 'rounded-3xl', confirmButton: 'rounded-xl font-bold px-6 py-3 shadow-md' }
      });
      return;
    }

    // Validar que todos os pacotes tenham pelo menos um item completo
    const pacoteSemItens = pacotes.find(p => !hasItemValido(p));
    if (pacoteSemItens) {
      Swal.fire({
        icon: 'warning',
        title: 'Atenção',
        text: `Preencha pelo menos uma linha de cubagem completa para todos os pacotes. (O Pacote Nº ${pacoteSemItens.numero} está vazio ou incompleto).`,
        confirmButtonColor: '#059669',
        customClass: { popup: 'rounded-3xl', confirmButton: 'rounded-xl font-bold px-6 py-3 shadow-md' }
      });
      return;
    }

    // Validar duplicidade de numeração
    const numerosPacotes = pacotes.map(p => p.numero);
    const temNumeroDuplicado = numerosPacotes.some((num, idx) => numerosPacotes.indexOf(num) !== idx);
    if (temNumeroDuplicado) {
      Swal.fire({
        icon: 'warning',
        title: 'Atenção',
        text: 'Existem pacotes com numeração duplicada.',
        confirmButtonColor: '#059669',
        customClass: { popup: 'rounded-3xl', confirmButton: 'rounded-xl font-bold px-6 py-3 shadow-md' }
      });
      return;
    }

    const pacotesValidos = pacotes.map(p => ({
      ...p,
      itens: p.itens.filter(
        i =>
          i.espessura &&
          i.largura &&
          i.comprimento &&
          i.quantidade &&
          Number(i.espessura) > 0 &&
          isLarguraValida(i.largura) &&
          Number(i.comprimento) > 0 &&
          Number(i.quantidade) > 0
      )
    }));

    setSalvando(true);

    const romaneioData = {
      id: Number(id),
      cliente,
      data,
      total_m3: totalGeralM3,
      total_ml: totalGeralML,
      tipo_romaneio: tipoRomaneio,
      pacotes: pacotesValidos.map(p => {
        const itensDesmembrados = p.itens.flatMap(i => {
          const lStr = String(i.largura).trim();
          if (/[\s-]+/.test(lStr)) {
            const larguras = lStr.split(/\s*-\s*|\s+/).map(Number);
            return larguras.map(l => ({
              espessura: Number(i.espessura),
              largura: l,
              comprimento: Number(i.comprimento),
              quantidade: 1,
              volume_m3: calcularVolumeM3(i.espessura, l, i.comprimento, 1, tipoRomaneio),
              volume_ml: calcularMetrosLineares(i.comprimento, 1, tipoRomaneio)
            }));
          } else {
            return [
              {
                espessura: Number(i.espessura),
                largura: Number(i.largura),
                comprimento: Number(i.comprimento),
                quantidade: Number(i.quantidade),
                volume_m3: calcularVolumeM3(i.espessura, i.largura, i.comprimento, i.quantidade, tipoRomaneio),
                volume_ml: calcularMetrosLineares(i.comprimento, i.quantidade, tipoRomaneio)
              }
            ];
          }
        });

        return {
          numero_pacote: p.numero,
          especie: p.especie,
          total_m3: itensDesmembrados.reduce((acc, i) => acc + i.volume_m3, 0),
          total_ml: itensDesmembrados.reduce((acc, i) => acc + i.volume_ml, 0),
          itens: itensDesmembrados
        };
      })
    };

    try {
      const result = await window.electronAPI.updateRomaneio(romaneioData as any);
      if (result.success) {
        Swal.fire({
          icon: 'success',
          title: 'Sucesso!',
          text: 'Romaneio atualizado com sucesso!',
          customClass: { popup: 'rounded-3xl', confirmButton: 'rounded-xl font-bold px-6 py-3' }
        }).then(() => {
          navigate(`/visualizar/${id}`);
        });
      } else {
        Swal.fire({ icon: 'error', title: 'Erro', text: result.error, customClass: { popup: 'rounded-3xl' } });
      }
    } catch {
      Swal.fire({ icon: 'error', title: 'Erro', text: 'Falha de comunicação', customClass: { popup: 'rounded-3xl' } });
    }
    setSalvando(false);
  }, [cliente, data, pacotes, tipoRomaneio, totalGeralM3, totalGeralML, id, navigate]);

  // Atalhos de teclado globais
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ctrl + S -> Salvar Edição
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        salvarEdicao();
      }
      // Ctrl + Enter -> Novo Pacote
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleAddPacote();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [salvarEdicao, handleAddPacote]);

  if (carregando) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-4 text-slate-400">
        <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
        <p className="font-semibold text-sm">Carregando dados do romaneio #{id}...</p>
      </div>
    );
  }

  return (
    <>
      <div className="w-full mx-auto space-y-8 pb-32 page-transition">
        {/* Cabeçalho */}
        <div className="glass-panel p-8 sm:p-10 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-3 h-full bg-gradient-to-b from-amber-400 to-amber-600"></div>

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
            <div className="flex items-center gap-3">
              <Link
                to={`/visualizar/${id}`}
                className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all mr-1"
                title="Voltar"
              >
                <ArrowLeft size={20} />
              </Link>
              <div className="bg-amber-100 dark:bg-amber-950/30 p-2.5 rounded-xl text-amber-600 dark:text-amber-450">
                <PackageSearch size={28} strokeWidth={2.5} />
              </div>
              <div>
                <h2 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
                  Editar Romaneio #{id?.toString().padStart(4, '0')}
                </h2>
                <p className="text-xs text-slate-400 dark:text-slate-500 font-semibold mt-0.5">
                  Atualize clientes, pacotes e cubagens deste romaneio
                </p>
              </div>
            </div>

            {/* Seletor em Abas/Pills */}
            <div className="bg-slate-100/80 dark:bg-slate-950/80 p-1.5 rounded-2xl flex items-center gap-1 border border-slate-200/60 dark:border-slate-800 self-start lg:self-auto">
              <button
                type="button"
                onClick={() => setTipoRomaneio('padrao')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  tipoRomaneio === 'padrao'
                    ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm border border-slate-200/50 dark:border-slate-700'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Layers size={14} /> Padrão
              </button>

              <button
                type="button"
                onClick={() => setTipoRomaneio('aberta')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  tipoRomaneio === 'aberta'
                    ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm border border-slate-200/50 dark:border-slate-700'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Ruler size={14} /> Bica Corrida
              </button>

              <button
                type="button"
                onClick={() => setTipoRomaneio('pes')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  tipoRomaneio === 'pes'
                    ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm border border-slate-200/50 dark:border-slate-700'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Sparkles size={14} /> Ipê (Pés)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 ml-1">
                Fornecedor / Cliente <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                className={`glass-input w-full px-5 py-4 text-slate-800 dark:text-slate-100 font-bold transition-all ${
                  clienteError ? 'border-red-400 ring-4 ring-red-400/10 bg-red-50/30 dark:bg-red-950/20' : ''
                }`}
                placeholder="Digite o nome do fornecedor ou cliente"
                value={cliente}
                onChange={e => {
                  setCliente(e.target.value);
                  if (e.target.value.trim()) setClienteError(false);
                }}
              />
              {clienteError && (
                <p className="text-xs text-red-500 dark:text-red-450 font-bold mt-1.5 ml-1 flex items-center gap-1">
                  <span>⚠</span> Campo obrigatório
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 ml-1">
                Data do Romaneio
              </label>
              <input
                type="date"
                className="glass-input w-full px-5 py-4 text-slate-800 dark:text-slate-100 font-bold"
                value={data}
                onChange={e => setData(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Lista de Pacotes (Componentes Isolados Memoizados) */}
        <div className="space-y-6">
          {pacotes.map((pacote, index) => (
            <CardPacote
              key={pacote.id}
              pacoteId={pacote.id}
              numero={pacote.numero}
              especie={pacote.especie}
              index={index}
              totalPacotes={pacotes.length}
              especiesList={especiesList}
              onNumeroChange={setNumeroPacote}
              onEspecieChange={setEspeciePacote}
              onDuplicate={duplicatePacote}
              onRemove={removePacote}
            />
          ))}
        </div>

        {/* Adicionar Pacote */}
        <div className="flex flex-col items-center gap-2 pt-2">
          {addPacoteError && (
            <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 text-amber-700 dark:text-amber-500 text-xs font-bold px-5 py-2.5 rounded-2xl">
              <span>⚠</span> {addPacoteError}
            </div>
          )}
          <button
            onClick={handleAddPacote}
            className="glass-card border border-emerald-200 dark:border-emerald-900/30 hover:border-emerald-300 dark:hover:border-emerald-800 text-slate-800 dark:text-slate-200 px-8 py-4 rounded-2xl font-black transition-all flex items-center gap-3 shadow-sm hover:shadow-md text-sm cursor-pointer"
          >
            <div className="bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 p-1.5 rounded-lg">
              <Plus size={20} strokeWidth={3} />
            </div>
            Adicionar Novo Pacote
          </button>
        </div>

        {/* Resumo Consolidado */}
        {totalGeralM3 > 0 && (
          <div className="glass-panel overflow-hidden transition-all duration-300 mt-8 border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setMostrarResumo(!mostrarResumo)}
              className="w-full flex items-center justify-between p-6 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors text-left outline-none cursor-pointer"
            >
              <div className="flex items-center gap-4">
                <div className="bg-slate-800 dark:bg-slate-950 text-white p-2.5 rounded-xl shadow-md">
                  <BarChart3 size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 dark:text-slate-100 text-base">Resumo Consolidado</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-450 font-semibold mt-0.5">
                    Balanço por espécie, bitola e faixas de comprimento
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs bg-slate-100 dark:bg-slate-850 text-slate-600 dark:text-slate-400 px-3 py-1.5 rounded-full font-black tracking-widest border border-slate-200 dark:border-slate-800 uppercase">
                  {resumos ? `${resumos.porEspecie.length} Espécie(s) | ${resumos.totalPecasGeral} Peças` : 'Ver Resumo'}
                </span>
                {mostrarResumo ? (
                  <ChevronUp className="text-slate-400" size={20} strokeWidth={2.5} />
                ) : (
                  <ChevronDown className="text-slate-400" size={20} strokeWidth={2.5} />
                )}
              </div>
            </button>

            <AnimatePresence>
              {mostrarResumo && resumos && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm p-8 grid grid-cols-1 xl:grid-cols-2 gap-8"
                >
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <h4 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">
                        Consolidado por Espécie
                      </h4>
                      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 uppercase font-black tracking-widest border-b border-slate-200 dark:border-slate-800 text-[9px]">
                            <tr>
                              <th className="px-5 py-3.5">Espécie</th>
                              <th className="px-5 py-3.5 text-center">Peças</th>
                              <th className="px-5 py-3.5 text-center">Total ML</th>
                              <th className="px-5 py-3.5 text-center">Total M³</th>
                              <th className="px-5 py-3.5 text-center w-24">% Vol</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                            {resumos.porEspecie.map((item, idx) => (
                              <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                <td className="px-5 py-3 font-bold text-slate-800 dark:text-slate-100">{item.especie}</td>
                                <td className="px-5 py-3 text-center">{item.totalPecas}</td>
                                <td className="px-5 py-3 text-center">{item.totalMl.toFixed(2)}</td>
                                <td className="px-5 py-3 text-center font-black text-emerald-600 dark:text-emerald-450">
                                  {item.totalM3.toFixed(3)}
                                </td>
                                <td className="px-5 py-3 text-center text-slate-400 dark:text-slate-500">
                                  {item.percentual.toFixed(1)}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">
                      Consolidado por Bitola (Seção)
                    </h4>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 uppercase font-black tracking-widest border-b border-slate-200 dark:border-slate-800 text-[9px]">
                          <tr>
                            <th className="px-5 py-3.5">Espécie</th>
                            <th className="px-5 py-3.5 text-center">Bitola (cm)</th>
                            <th className="px-5 py-3.5 text-center">Peças</th>
                            <th className="px-5 py-3.5 text-center">Total ML</th>
                            <th className="px-5 py-3.5 text-center">Total M³</th>
                            <th className="px-5 py-3.5 text-center w-20">% Vol</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                          {resumos.porBitola.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                              <td className="px-5 py-3 text-slate-800 dark:text-slate-100">{item.especie}</td>
                              <td className="px-5 py-3 text-center font-black text-slate-700 dark:text-slate-300 bg-slate-50/50 dark:bg-slate-950/25">
                                {item.espessura} <span className="text-[10px] text-slate-400 font-bold mx-0.5">X</span>{' '}
                                {item.largura}
                              </td>
                              <td className="px-5 py-3 text-center">{item.totalPecas}</td>
                              <td className="px-5 py-3 text-center">{item.totalMl.toFixed(2)}</td>
                              <td className="px-5 py-3 text-center font-black text-emerald-600 dark:text-emerald-450">
                                {item.totalM3.toFixed(3)}
                              </td>
                              <td className="px-5 py-3 text-center text-slate-400 dark:text-slate-500">
                                {item.percentual.toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Sticky Floating Footer Island */}
      <div className="w-full mx-auto sticky bottom-6 z-40 pointer-events-none">
        <div className="w-full bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 p-5 rounded-[2rem] flex items-center justify-between shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] pointer-events-auto text-white">
          <div className="text-slate-400 text-xs font-semibold hidden md:block">
            Atalhos: <kbd className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-slate-300">Ctrl+S</kbd> Salvar Edição | <kbd className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-slate-300">Ctrl+Enter</kbd> Novo Pacote
          </div>
          <div className="flex gap-8 items-center ml-auto md:ml-0">
            <div className="text-right">
              <span className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">Total ML</span>
              <span className="text-2xl font-black text-slate-100">{totalGeralML.toFixed(2)}</span>
            </div>
            <div className="text-right">
              <span className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">Total M³</span>
              <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">
                {totalGeralM3.toFixed(3)}
              </span>
            </div>
            <button
              onClick={salvarEdicao}
              disabled={salvando}
              className={`px-6 py-3.5 rounded-2xl font-black transition-all ml-4 flex items-center gap-2 cursor-pointer ${
                salvando
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-900 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] hover:-translate-y-1'
              }`}
            >
              <Save size={18} strokeWidth={2.5} />
              {salvando ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
