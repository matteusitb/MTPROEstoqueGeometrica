import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, LayoutList, FileText, Calendar, Box, Activity, Pencil, Eye, Search,
  Copy, Trash2, Filter, FileSpreadsheet, ChevronLeft, ChevronRight
} from 'lucide-react';
import Swal from 'sweetalert2';
import { gerarPdfRomaneio } from '../utils/pdfGenerator';
import { useRomaneioStore } from '../store/useRomaneioStore';
import { motion } from 'framer-motion';
import { ModalWhatsApp, WhatsAppIcon } from '../components/ModalWhatsApp';
import { exportarRomaneioParaCSV } from '../utils/excelExporter';

const ITENS_POR_PAGINA = 15;

export default function Home() {
  const navigate = useNavigate();
  const loadRomaneio = useRomaneioStore(state => state.loadRomaneio);
  const resetForm = useRomaneioStore(state => state.resetForm);
  const [romaneios, setRomaneios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [busca, setBusca] = useState('');
  const [filtroEspecie, setFiltroEspecie] = useState('');
  const [filtroData, setFiltroData] = useState('todos');
  const [paginaAtual, setPaginaAtual] = useState(1);

  // Estados do Modal do WhatsApp
  const [whatsappModalAberto, setWhatsappModalAberto] = useState(false);
  const [romaneioSelecionadoWhatsApp, setRomaneioSelecionadoWhatsApp] = useState<any | null>(null);
  const [pacotesSelecionadosWhatsApp, setPacotesSelecionadosWhatsApp] = useState<any[]>([]);

  useEffect(() => {
    carregarRomaneios();
  }, []);

  // Atalho global Ctrl+N para novo romaneio
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleCriarNovoRomaneio();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCriarNovoRomaneio = () => {
    resetForm();
    navigate('/novo');
  };

  const carregarRomaneios = async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.queryDB(`
        SELECT r.id, r.data, c.nome as cliente, 
               COALESCE(
                 (SELECT GROUP_CONCAT(DISTINCT esp.nome) 
                  FROM romaneio_pacotes pack 
                  LEFT JOIN especies esp ON pack.especie_id = esp.id 
                  WHERE pack.romaneio_id = r.id AND pack.especie_id IS NOT NULL),
                 e_old.nome
               ) as especie,
               r.total_m3, r.total_ml, r.tipo_romaneio 
        FROM romaneios r 
        LEFT JOIN clientes c ON r.cliente_id = c.id 
        LEFT JOIN especies e_old ON r.especie_id = e_old.id
        ORDER BY r.id DESC
      `);
      if (result.success && result.data) {
        setRomaneios(result.data);
      }
    } catch (error) {
      console.error('Erro ao carregar romaneios', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImprimirPdf = async (romaneio: any) => {
    try {
      Swal.fire({
        title: 'Gerando Relatório...',
        text: 'Aguarde um momento.',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
      });

      const pResult = await window.electronAPI.queryDB(`
        SELECT rp.*, e.nome as especie
        FROM romaneio_pacotes rp
        LEFT JOIN especies e ON rp.especie_id = e.id
        WHERE rp.romaneio_id = ?
        ORDER BY rp.numero_pacote
      `, [romaneio.id]);

      if (!pResult.success) throw new Error('Erro ao buscar pacotes');
      const pacotes = pResult.data || [];

      for (const pacote of pacotes) {
        const iResult = await window.electronAPI.queryDB('SELECT * FROM romaneio_itens WHERE pacote_id = ?', [pacote.id]);
        if (!iResult.success) throw new Error('Erro ao buscar itens');
        pacote.itens = iResult.data || [];
      }

      Swal.close();

      const { value: pacotesSelecionados } = await Swal.fire({
        title: 'Selecionar Pacotes para o PDF',
        html: `
          <p class="text-[11px] text-slate-500 dark:text-slate-400 font-semibold mb-4 text-left leading-relaxed">
            Selecione quais pacotes farão parte deste PDF (útil para cargas parciais):
          </p>
          <div class="flex gap-2 mb-4">
            <button id="swal-select-all" type="button" class="text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-1.5 rounded-lg border border-emerald-100 dark:border-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/40 transition-all cursor-pointer">Selecionar Todos</button>
            <button id="swal-deselect-all" type="button" class="text-[10px] font-black text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750 transition-all cursor-pointer">Desmarcar Todos</button>
          </div>
          <div class="max-h-60 overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-xl p-3 bg-slate-50/50 dark:bg-slate-950/25 space-y-2 text-left">
            ${pacotes.map(p => `
              <label class="flex items-center gap-3 p-2 hover:bg-white dark:hover:bg-slate-900 rounded-lg cursor-pointer transition-colors">
                <input type="checkbox" name="swal-pacote-check" value="${p.id}" checked class="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300" />
                <div class="text-[11px] font-bold text-slate-700 dark:text-slate-350">
                  <span class="text-slate-900 dark:text-white font-extrabold">Pacote Nº ${p.numero_pacote}</span> - ${p.especie || 'Mista'} 
                  <span class="text-emerald-600 dark:text-emerald-450 ml-1">(${Number(p.total_m3).toFixed(3)} m³)</span>
                </div>
              </label>
            `).join('')}
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Gerar PDF',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#64748b',
        customClass: {
          popup: 'rounded-3xl p-6 font-sans border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 max-w-sm',
          title: 'text-xl font-black text-slate-800 dark:text-white tracking-tight',
          confirmButton: 'rounded-xl font-bold px-5 py-2.5 shadow-sm text-sm cursor-pointer',
          cancelButton: 'rounded-xl font-bold px-5 py-2.5 text-sm cursor-pointer'
        },
        didOpen: () => {
          const popup = Swal.getPopup();
          if (popup) {
            popup.querySelector('#swal-select-all')?.addEventListener('click', () => {
              popup.querySelectorAll('input[name="swal-pacote-check"]').forEach((cb) => {
                (cb as HTMLInputElement).checked = true;
              });
            });
            popup.querySelector('#swal-deselect-all')?.addEventListener('click', () => {
              popup.querySelectorAll('input[name="swal-pacote-check"]').forEach((cb) => {
                (cb as HTMLInputElement).checked = false;
              });
            });
          }
        },
        preConfirm: () => {
          const checked = Array.from(Swal.getPopup()!.querySelectorAll('input[name="swal-pacote-check"]:checked'))
            .map(el => (el as HTMLInputElement).value);
          if (checked.length === 0) {
            Swal.showValidationMessage('Selecione pelo menos um pacote!');
            return false;
          }
          return checked;
        }
      });

      if (!pacotesSelecionados) return;

      const pacotesFiltrados = pacotes.filter(p => pacotesSelecionados.includes(String(p.id)));

      const pdfDoc = gerarPdfRomaneio(romaneio, pacotesFiltrados);
      pdfDoc.download(`Romaneio_${romaneio.id.toString().padStart(4, '0')}.pdf`);
    } catch {
      Swal.fire({
        icon: 'error',
        title: 'Erro',
        text: 'Não foi possível gerar o PDF.',
        confirmButtonColor: '#ef4444',
        customClass: { popup: 'rounded-3xl' }
      });
    }
  };

  const handleCompartilharWhatsApp = async (romaneio: any) => {
    try {
      Swal.fire({
        title: 'Carregando Romaneio...',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
      });

      const pResult = await window.electronAPI.queryDB(`
        SELECT rp.*, COALESCE(e.nome, e_glob.nome) as especie
        FROM romaneio_pacotes rp
        LEFT JOIN especies e ON rp.especie_id = e.id
        LEFT JOIN romaneios r ON rp.romaneio_id = r.id
        LEFT JOIN especies e_glob ON r.especie_id = e_glob.id
        WHERE rp.romaneio_id = ?
        ORDER BY rp.numero_pacote
      `, [romaneio.id]);

      if (!pResult.success) throw new Error('Erro ao buscar pacotes');
      const pacotes = pResult.data || [];

      if (pacotes.length > 0) {
        const pacoteIds = pacotes.map((p: any) => p.id);
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
        for (const pacote of pacotes) {
          pacote.itens = itensMap.get(pacote.id) || [];
        }
      }

      Swal.close();

      setRomaneioSelecionadoWhatsApp(romaneio);
      setPacotesSelecionadosWhatsApp(pacotes);
      setWhatsappModalAberto(true);
    } catch (err) {
      console.error(err);
      Swal.fire({
        icon: 'error',
        title: 'Erro',
        text: 'Não foi possível carregar os dados para o WhatsApp.',
        confirmButtonColor: '#ef4444',
        customClass: { popup: 'rounded-3xl' }
      });
    }
  };

  const handleExportarExcelLista = async (romaneio: any) => {
    try {
      Swal.fire({ title: 'Preparando exportação...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      const pResult = await window.electronAPI.queryDB(`
        SELECT rp.*, COALESCE(e.nome, e_glob.nome) as especie
        FROM romaneio_pacotes rp
        LEFT JOIN especies e ON rp.especie_id = e.id
        LEFT JOIN romaneios r ON rp.romaneio_id = r.id
        LEFT JOIN especies e_glob ON r.especie_id = e_glob.id
        WHERE rp.romaneio_id = ? ORDER BY rp.numero_pacote
      `, [romaneio.id]);

      const pacotes = pResult.data || [];
      if (pacotes.length > 0) {
        const pacoteIds = pacotes.map((p: any) => p.id);
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
        for (const pacote of pacotes) {
          pacote.itens = itensMap.get(pacote.id) || [];
        }
      }
      Swal.close();

      exportarRomaneioParaCSV({
        id: romaneio.id,
        cliente: romaneio.cliente,
        data: romaneio.data,
        tipo_romaneio: romaneio.tipo_romaneio,
        total_m3: romaneio.total_m3,
        total_ml: romaneio.total_ml,
        pacotes: pacotes.map((p: any) => ({
          numero_pacote: p.numero_pacote,
          especie: p.especie,
          total_m3: p.total_m3,
          total_ml: p.total_ml,
          itens: p.itens || []
        }))
      });

      Swal.fire({
        icon: 'success',
        title: 'Planilha Exportada!',
        text: 'Arquivo CSV baixado com sucesso.',
        timer: 1800,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      });
    } catch {
      Swal.fire({ icon: 'error', title: 'Erro', text: 'Falha ao exportar planilha Excel.' });
    }
  };

  const handleDuplicarRomaneio = async (id: number) => {
    try {
      Swal.fire({
        title: 'Preparando cópia...',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
      });

      const pResult = await window.electronAPI.queryDB(`
        SELECT rp.*, COALESCE(e.nome, e_glob.nome) as especie
        FROM romaneio_pacotes rp
        LEFT JOIN especies e ON rp.especie_id = e.id
        LEFT JOIN romaneios r ON rp.romaneio_id = r.id
        LEFT JOIN especies e_glob ON r.especie_id = e_glob.id
        WHERE rp.romaneio_id = ?
        ORDER BY rp.numero_pacote
      `, [id]);

      if (!pResult.success) throw new Error('Erro pacotes');
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

      const rResult = await window.electronAPI.queryDB(`
        SELECT r.*, c.nome as cliente_nome
        FROM romaneios r
        LEFT JOIN clientes c ON r.cliente_id = c.id
        WHERE r.id = ?
      `, [id]);
      const romaneioBD = rResult.data?.[0] as any;

      Swal.close();

      loadRomaneio({
        cliente: romaneioBD?.cliente_nome ? `${romaneioBD.cliente_nome} (Cópia)` : 'Cópia de Romaneio',
        data: new Date().toISOString().split('T')[0],
        pacotes: pacotesBD,
        tipoRomaneio: romaneioBD?.tipo_romaneio || 'padrao'
      });

      navigate('/novo');
    } catch (err) {
      console.error(err);
      Swal.fire({
        icon: 'error', title: 'Erro', text: 'Não foi possível clonar.', customClass: { popup: 'rounded-3xl' }
      });
    }
  };

  const handleExcluirRomaneio = async (id: number) => {
    const confirm = await Swal.fire({
      title: 'Excluir Romaneio?',
      text: 'Esta ação não pode ser desfeita.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#94a3b8',
      confirmButtonText: 'Sim, excluir!',
      cancelButtonText: 'Cancelar',
      customClass: { popup: 'rounded-3xl', confirmButton: 'rounded-xl font-bold px-5 py-2.5', cancelButton: 'rounded-xl font-bold px-5 py-2.5' }
    });

    if (confirm.isConfirmed) {
      try {
        const pacotesRes = await window.electronAPI.queryDB('SELECT id FROM romaneio_pacotes WHERE romaneio_id = ?', [id]);
        if (pacotesRes.success && pacotesRes.data) {
          for (const pacote of pacotesRes.data) {
            await window.electronAPI.executeDB('DELETE FROM romaneio_itens WHERE pacote_id = ?', [pacote.id]);
          }
        }
        await window.electronAPI.executeDB('DELETE FROM romaneio_pacotes WHERE romaneio_id = ?', [id]);
        await window.electronAPI.executeDB('DELETE FROM romaneios WHERE id = ?', [id]);

        carregarRomaneios();
      } catch {
        Swal.fire({ icon: 'error', title: 'Erro', text: 'Falha ao excluir.', customClass: { popup: 'rounded-3xl' } });
      }
    }
  };

  const especiesList = useMemo(() => {
    const list: string[] = [];
    romaneios.forEach(r => {
      if (r.especie) {
        r.especie.split(',').forEach((s: string) => {
          const trimmed = s.trim();
          if (trimmed && !list.includes(trimmed)) list.push(trimmed);
        });
      }
    });
    return list.sort();
  }, [romaneios]);

  const romaneiosFiltrados = useMemo(() => {
    return romaneios.filter(r => {
      const matchBusca = !busca.trim() || r.cliente?.toLowerCase().includes(busca.toLowerCase());
      const matchEspecie = !filtroEspecie || (r.especie && r.especie.toLowerCase().includes(filtroEspecie.toLowerCase()));

      let matchData = true;
      if (filtroData !== 'todos' && r.data) {
        const [year, month, day] = r.data.split('-');
        const dataR = new Date(Number(year), Number(month) - 1, Number(day));
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        if (filtroData === 'hoje') matchData = dataR.toDateString() === hoje.toDateString();
        else if (filtroData === 'semana') {
          const seteDiasAtras = new Date();
          seteDiasAtras.setDate(hoje.getDate() - 7);
          seteDiasAtras.setHours(0, 0, 0, 0);
          matchData = dataR >= seteDiasAtras;
        } else if (filtroData === 'mes') {
          matchData = dataR.getMonth() === hoje.getMonth() && dataR.getFullYear() === hoje.getFullYear();
        }
      }
      return matchBusca && matchEspecie && matchData;
    });
  }, [romaneios, busca, filtroEspecie, filtroData]);

  // Paginação
  const totalPaginas = Math.ceil(romaneiosFiltrados.length / ITENS_POR_PAGINA) || 1;
  const romaneiosPaginados = useMemo(() => {
    const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
    return romaneiosFiltrados.slice(inicio, inicio + ITENS_POR_PAGINA);
  }, [romaneiosFiltrados, paginaAtual]);

  useEffect(() => {
    setPaginaAtual(1);
  }, [busca, filtroEspecie, filtroData]);

  const totalGeralM3 = romaneios.reduce((acc, r) => acc + (r.total_m3 || 0), 0);
  const totalFiltradoM3 = romaneiosFiltrados.reduce((acc, r) => acc + (r.total_m3 || 0), 0);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05 } }
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
  };

  return (
    <div className="w-full mx-auto space-y-8 pb-12 page-transition">
      {/* Banner Superior */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative bg-white dark:bg-slate-900 p-8 sm:p-10 rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col md:flex-row items-center justify-between gap-8"
      >
        <div className="absolute -right-20 -top-20 w-64 h-64 bg-emerald-500/10 blur-[80px] rounded-full pointer-events-none"></div>
        <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-blue-500/5 blur-[80px] rounded-full pointer-events-none"></div>

        <div className="relative z-10">
          <h2 className="text-4xl sm:text-5xl font-black text-slate-800 dark:text-slate-100 tracking-tight mb-3">
            Visão <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-700">Geral</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base max-w-lg font-medium leading-relaxed">
            Acompanhe a produção, gerencie cubagens e tenha o controle total do pátio de madeira em tempo real.
          </p>
        </div>

        <button
          onClick={handleCriarNovoRomaneio}
          className="relative z-10 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-slate-200 text-white dark:text-slate-900 px-8 py-4 rounded-2xl font-bold text-sm sm:text-base shadow-xl shadow-slate-900/20 dark:shadow-none transition-all flex items-center gap-3 hover:-translate-y-1 hover:shadow-slate-900/30 shrink-0 group cursor-pointer"
          title="Criar novo romaneio (Ctrl+N)"
        >
          <div className="bg-white/20 p-1.5 rounded-lg group-hover:scale-110 transition-transform">
            <Plus size={18} strokeWidth={3} />
          </div>
          Novo Romaneio
        </button>
      </motion.div>

      {/* Cards de Métricas */}
      <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div variants={itemVariants} className="glass-card p-6 flex flex-col">
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 p-3.5 rounded-2xl">
              <LayoutList size={24} strokeWidth={2.5} />
            </div>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Registros Totais</p>
          </div>
          <h3 className="text-4xl font-black text-slate-800 dark:text-slate-100">{romaneios.length}</h3>
        </motion.div>

        <motion.div variants={itemVariants} className="glass-card p-6 flex flex-col">
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 p-3.5 rounded-2xl">
              <Box size={24} strokeWidth={2.5} />
            </div>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Volume Global (M³)</p>
          </div>
          <h3 className="text-4xl font-black text-slate-800 dark:text-slate-100">{totalGeralM3.toFixed(3)}</h3>
        </motion.div>

        <motion.div variants={itemVariants} className="glass-card p-6 flex flex-col">
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 p-3.5 rounded-2xl">
              <Activity size={24} strokeWidth={2.5} />
            </div>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Volume Filtrado (M³)</p>
          </div>
          <h3 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-br from-purple-600 to-indigo-600">{totalFiltradoM3.toFixed(3)}</h3>
        </motion.div>
      </motion.div>

      {/* Filtros e Busca */}
      <motion.div variants={itemVariants} initial="hidden" animate="show">
        <div className="flex items-center justify-between mb-6 px-2">
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
            Histórico de Romaneios
          </h3>
          <span className="text-xs font-semibold text-slate-400">
            Mostrando {romaneiosFiltrados.length} resultado(s)
          </span>
        </div>

        <div className="glass-panel p-3 mb-8 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Pesquisar por fornecedor ou cliente..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="w-full bg-white/60 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800/60 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-semibold focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-400 outline-none transition-all shadow-sm placeholder:text-slate-400 dark:text-slate-200"
            />
            <Search className="absolute left-4 top-4 text-slate-400" size={18} strokeWidth={2.5} />
          </div>

          <div className="relative md:w-64">
            <select
              value={filtroEspecie}
              onChange={e => setFiltroEspecie(e.target.value)}
              className="w-full bg-white/60 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800/60 rounded-2xl pl-11 pr-4 py-3.5 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-400 outline-none transition-all shadow-sm appearance-none"
            >
              <option value="" className="dark:bg-slate-900 dark:text-slate-200">Todas as Espécies</option>
              {especiesList.map((esp, i) => (
                <option key={i} value={esp} className="dark:bg-slate-900 dark:text-slate-200">{esp}</option>
              ))}
            </select>
            <Filter className="absolute left-4 top-4 text-slate-400" size={18} />
          </div>

          <div className="relative md:w-56">
            <select
              value={filtroData}
              onChange={e => setFiltroData(e.target.value)}
              className="w-full bg-white/60 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800/60 rounded-2xl pl-11 pr-4 py-3.5 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-400 outline-none transition-all shadow-sm appearance-none"
            >
              <option value="todos" className="dark:bg-slate-900 dark:text-slate-200">Qualquer Data</option>
              <option value="hoje" className="dark:bg-slate-900 dark:text-slate-200">Hoje</option>
              <option value="semana" className="dark:bg-slate-900 dark:text-slate-200">Últimos 7 dias</option>
              <option value="mes" className="dark:bg-slate-900 dark:text-slate-200">Este Mês</option>
            </select>
            <Calendar className="absolute left-4 top-4 text-slate-400" size={18} />
          </div>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-4 text-slate-400">
            <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
            <p className="font-semibold text-sm">Sincronizando dados...</p>
          </div>
        ) : romaneiosFiltrados.length === 0 ? (
          <div className="glass-panel py-20 text-center flex flex-col items-center justify-center gap-4">
            <div className="bg-slate-100 dark:bg-slate-800 p-5 rounded-full text-slate-300 dark:text-slate-600">
              <FileText size={40} strokeWidth={1.5} />
            </div>
            <div>
              <h4 className="text-xl font-bold text-slate-700 dark:text-slate-200">Nenhum resultado</h4>
              <p className="text-slate-400 dark:text-slate-500 mt-2 text-sm max-w-sm mx-auto font-medium">
                Não encontramos romaneios com os filtros selecionados.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid gap-4">
              {romaneiosPaginados.map(romaneio => (
                <motion.div
                  variants={itemVariants}
                  key={romaneio.id}
                  className="group bg-white dark:bg-slate-900 p-5 rounded-3xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-6 hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.08)] hover:border-slate-200 dark:hover:border-slate-700 transition-all duration-300"
                >
                  <div className="flex items-center gap-6">
                    <div className="bg-slate-50 dark:bg-slate-950 px-5 py-4 rounded-2xl border border-slate-100 dark:border-slate-800 text-center shadow-inner shrink-0">
                      <span className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] mb-1">
                        Cód.
                      </span>
                      <span className="text-lg font-black text-slate-800 dark:text-slate-200">
                        #{romaneio.id.toString().padStart(4, '0')}
                      </span>
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-3 mb-2">
                        <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors tracking-tight">
                          {romaneio.cliente}
                        </h4>
                        <span
                          className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${
                            romaneio.tipo_romaneio === 'aberta'
                              ? 'bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 border-slate-200/80 dark:border-slate-800'
                              : romaneio.tipo_romaneio === 'pes'
                              ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-450 border-amber-100/50 dark:border-amber-900/30'
                              : 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-450 border-emerald-100/50 dark:border-emerald-900/30'
                          }`}
                        >
                          {romaneio.tipo_romaneio === 'aberta' ? 'Aberto' : romaneio.tipo_romaneio === 'pes' ? 'Ipê (Pés)' : 'Padrão'}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
                        <span className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 px-3 py-1.5 rounded-lg border border-emerald-100/50 dark:border-emerald-900/30">
                          <Box size={14} />
                          {romaneio.especie ? romaneio.especie.split(',').map((s: string) => s.trim()).join(', ') : 'Mista'}
                        </span>
                        <span className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                          <Calendar size={14} />
                          {romaneio.data
                            ? (() => {
                                const [year, month, day] = romaneio.data.split('-');
                                return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString('pt-BR');
                              })()
                            : 'S/ Data'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-6 items-center justify-between lg:justify-end lg:flex-1 border-t lg:border-t-0 dark:border-slate-800 pt-4 lg:pt-0">
                    <div className="flex gap-8 px-4 w-full sm:w-auto justify-around sm:justify-end">
                      <div className="text-right">
                        <span className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.1em] mb-1">
                          Total Metros
                        </span>
                        <span className="font-bold text-slate-600 dark:text-slate-350 text-lg">
                          {(romaneio.total_ml || 0).toFixed(2)}{' '}
                          <span className="text-sm text-slate-400">ml</span>
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.1em] mb-1">
                          Total Cubagem
                        </span>
                        <span className="font-black text-emerald-600 dark:text-emerald-400 text-lg">
                          {(romaneio.total_m3 || 0).toFixed(3)}{' '}
                          <span className="text-sm text-emerald-600/60 dark:text-emerald-400/60">m³</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-end">
                      <button
                        onClick={() => handleCompartilharWhatsApp(romaneio)}
                        className="bg-slate-50 dark:bg-slate-950 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-500 hover:text-[#25D366] dark:hover:text-[#25D366] p-3 rounded-xl transition-all duration-200 cursor-pointer"
                        title="Compartilhar no WhatsApp Web"
                      >
                        <WhatsAppIcon size={18} />
                      </button>
                      <button
                        onClick={() => handleImprimirPdf(romaneio)}
                        className="bg-slate-50 dark:bg-slate-950 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 p-3 rounded-xl transition-all duration-200 cursor-pointer"
                        title="Exportar PDF"
                      >
                        <FileText size={18} strokeWidth={2.5} />
                      </button>
                      <button
                        onClick={() => handleExportarExcelLista(romaneio)}
                        className="bg-slate-50 dark:bg-slate-950 hover:bg-teal-50 dark:hover:bg-teal-950/40 text-slate-500 hover:text-teal-600 dark:hover:text-teal-400 p-3 rounded-xl transition-all duration-200 cursor-pointer"
                        title="Exportar Excel (.csv)"
                      >
                        <FileSpreadsheet size={18} strokeWidth={2.5} />
                      </button>
                      <button
                        onClick={() => navigate(`/visualizar/${romaneio.id}`)}
                        className="bg-slate-50 dark:bg-slate-950 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 p-3 rounded-xl transition-all duration-200 cursor-pointer"
                        title="Visualizar Detalhes"
                      >
                        <Eye size={18} strokeWidth={2.5} />
                      </button>
                      <button
                        onClick={() => navigate(`/editar/${romaneio.id}`)}
                        className="bg-slate-50 dark:bg-slate-950 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 p-3 rounded-xl transition-all duration-200 cursor-pointer"
                        title="Editar"
                      >
                        <Pencil size={18} strokeWidth={2.5} />
                      </button>
                      <button
                        onClick={() => handleDuplicarRomaneio(romaneio.id)}
                        className="bg-slate-50 dark:bg-slate-950 hover:bg-purple-50 dark:hover:bg-purple-950/40 text-slate-500 hover:text-purple-600 dark:hover:text-purple-400 p-3 rounded-xl transition-all duration-200 cursor-pointer"
                        title="Duplicar Romaneio"
                      >
                        <Copy size={18} strokeWidth={2.5} />
                      </button>
                      <button
                        onClick={() => handleExcluirRomaneio(romaneio.id)}
                        className="bg-slate-50 dark:bg-slate-950 hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-500 hover:text-red-600 dark:hover:text-red-400 p-3 rounded-xl transition-all duration-200 cursor-pointer"
                        title="Excluir"
                      >
                        <Trash2 size={18} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            {/* Controles de Paginação */}
            {totalPaginas > 1 && (
              <div className="flex items-center justify-between p-4 glass-panel mt-6">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  Página {paginaAtual} de {totalPaginas}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPaginaAtual(p => Math.max(1, p - 1))}
                    disabled={paginaAtual === 1}
                    className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-750 transition-all cursor-pointer"
                    title="Página Anterior"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => setPaginaAtual(p => Math.min(totalPaginas, p + 1))}
                    disabled={paginaAtual === totalPaginas}
                    className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-750 transition-all cursor-pointer"
                    title="Próxima Página"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* Modal de Compartilhamento WhatsApp */}
      {romaneioSelecionadoWhatsApp && (
        <ModalWhatsApp
          isOpen={whatsappModalAberto}
          onClose={() => {
            setWhatsappModalAberto(false);
            setRomaneioSelecionadoWhatsApp(null);
          }}
          romaneio={romaneioSelecionadoWhatsApp}
          pacotes={pacotesSelecionadosWhatsApp}
        />
      )}
    </div>
  );
}
