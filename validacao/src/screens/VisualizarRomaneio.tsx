import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  PackageSearch, ArrowLeft, Loader2, Calendar, User, Box, Pencil, FileDown,
  FileSpreadsheet, Tag
} from 'lucide-react';
import Swal from 'sweetalert2';
import { gerarPdfRomaneio } from '../utils/pdfGenerator';
import { motion } from 'framer-motion';
import { ModalWhatsApp, WhatsAppIcon } from '../components/ModalWhatsApp';
import { ModalEtiquetaPacote } from '../components/ModalEtiquetaPacote';
import { exportarRomaneioParaCSV } from '../utils/excelExporter';
import { processarItensPacote, calcularResumosConsolidados } from '../utils/cubagemEngine';

const PacoteTabelas = ({ pacote, tipoRomaneio }: { pacote: any; tipoRomaneio?: string }) => {
  const { normais, abertos } = processarItensPacote(pacote.itens, tipoRomaneio);
  const totalPecas = pacote.itens?.reduce((acc: number, item: Record<string, unknown>) => acc + (Number(item.quantidade) || 0), 0) || 0;

  return (
    <div className="flex flex-col gap-6">
      {abertos.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] custom-scrollbar">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-black tracking-widest border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-5 py-4 text-center">Espessura (cm)</th>
                <th className="px-5 py-4 text-center border-r border-slate-200 dark:border-slate-800">{tipoRomaneio === 'pes' ? 'Compr. (pés)' : 'Compr. (m)'}</th>
                <th className="px-5 py-4 text-left text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20">Larguras (cm)</th>
                <th className="px-5 py-4 text-center border-l border-slate-200 dark:border-slate-800">Qtd</th>
                <th className="px-5 py-4 text-center">Total ML</th>
                <th className="px-5 py-4 text-center">Total M³</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {abertos.map((grupo: any) => (
                <tr key={grupo.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="px-5 py-3 text-center font-bold text-slate-800 dark:text-slate-200">{grupo.espessura.toString().replace('.', ',')}</td>
                  <td className="px-5 py-3 text-center font-bold text-slate-800 dark:text-slate-200 border-r border-slate-100 dark:border-slate-800">{grupo.comprimento.toFixed(2).replace('.', ',')}</td>
                  <td className="px-5 py-3 text-left font-semibold text-slate-600 dark:text-slate-400 bg-blue-50/20 dark:bg-blue-950/10 leading-relaxed">
                    {grupo.larguras.join(', ')} <span className="font-bold text-blue-750 dark:text-blue-400 ml-2">(Total: {grupo.larguras.reduce((a: number, b: number) => a + b, 0).toString().replace('.', ',')} cm)</span>
                  </td>
                  <td className="px-5 py-3 text-center font-black text-slate-800 dark:text-slate-100 border-l border-slate-100 dark:border-slate-800">{grupo.quantidade}</td>
                  <td className="px-5 py-3 text-center text-slate-500 dark:text-slate-450 font-semibold">{grupo.volume_ml.toFixed(2).replace('.', ',')}</td>
                  <td className="px-5 py-3 text-center font-black text-emerald-600 dark:text-emerald-450 bg-emerald-50/30 dark:bg-emerald-950/20">{grupo.volume_m3.toFixed(3).replace('.', ',')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {normais.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)]">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-black tracking-widest border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-5 py-4 text-center w-16">Item</th>
                <th className="px-5 py-4 text-center">Espessura (cm)</th>
                <th className="px-5 py-4 text-center">{tipoRomaneio === 'pes' ? 'Comprimento (pés)' : 'Comprimento (m)'}</th>
                <th className="px-5 py-4 text-center">Largura (cm)</th>
                <th className="px-5 py-4 text-center w-24">Qtd</th>
                <th className="px-5 py-4 text-center">Total ML</th>
                <th className="px-5 py-4 text-center">Total M³</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {normais.map((item: any, idx: number) => {
                const cMetros = tipoRomaneio === 'pes' ? item.comprimento * 0.3048 : item.comprimento;
                const m3 = (item.espessura / 100) * (item.largura / 100) * cMetros * item.quantidade;
                const ml = cMetros * item.quantidade;
                return (
                  <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-3 text-center text-slate-400 dark:text-slate-500 font-black text-[10px] tracking-wider">{idx + 1}</td>
                    <td className="px-5 py-3 text-center font-bold text-slate-800 dark:text-slate-200">{item.espessura.toString().replace('.', ',')}</td>
                    <td className="px-5 py-3 text-center font-bold text-slate-800 dark:text-slate-200">
                      {tipoRomaneio === 'pes' ? item.comprimento.toString().replace('.', ',') : item.comprimento.toFixed(2).replace('.', ',')}
                    </td>
                    <td className="px-5 py-3 text-center font-bold text-slate-800 dark:text-slate-200">{item.largura.toString().replace('.', ',')}</td>
                    <td className="px-5 py-3 text-center font-black text-slate-800 dark:text-slate-100">{item.quantidade}</td>
                    <td className="px-5 py-3 text-center text-slate-500 dark:text-slate-450 font-semibold">{ml.toFixed(2).replace('.', ',')}</td>
                    <td className="px-5 py-3 text-center font-black text-emerald-600 dark:text-emerald-450 bg-emerald-50/30 dark:bg-emerald-950/20">{m3.toFixed(3).replace('.', ',')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {abertos.length === 0 && normais.length === 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm p-10 text-center text-slate-400 dark:text-slate-500 font-semibold italic">
          Nenhum item cadastrado neste pacote.
        </div>
      )}

      {(abertos.length > 0 || normais.length > 0) && (
        <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm flex flex-wrap md:flex-nowrap items-center justify-end divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800">
          <div className="px-6 py-4 font-black text-xs uppercase tracking-widest text-slate-600 dark:text-slate-400 bg-slate-100/50 dark:bg-slate-900/40 w-full md:w-auto flex-grow text-right">
            Totais do Pacote {pacote.numero_pacote}:
          </div>
          <div className="px-6 py-4 text-center text-slate-800 dark:text-slate-200 font-black text-sm w-full md:w-auto min-w-[120px]">
            {totalPecas} Peças
          </div>
          <div className="px-6 py-4 text-center text-slate-800 dark:text-slate-200 font-black text-sm w-full md:w-auto min-w-[120px]">
            {pacote.total_ml.toFixed(2).replace('.', ',')} ML
          </div>
          <div className="px-6 py-4 text-center text-emerald-700 dark:text-emerald-450 bg-emerald-50/50 dark:bg-emerald-950/20 font-black text-sm w-full md:w-auto min-w-[120px]">
            {pacote.total_m3.toFixed(3).replace('.', ',')} M³
          </div>
        </div>
      )}
    </div>
  );
};

export default function VisualizarRomaneio() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [carregando, setCarregando] = useState(true);
  const [romaneio, setRomaneio] = useState<any | null>(null);
  const [pacotes, setPacotes] = useState<any[]>([]);
  const [abaAtiva, setAbaAtiva] = useState('resumo');
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [whatsappModalAberto, setWhatsappModalAberto] = useState(false);
  const [etiquetaModalAberto, setEtiquetaModalAberto] = useState(false);

  const gerarPDF = async () => {
    try {
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
          <div className="max-h-60 overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-xl p-3 bg-slate-50/50 dark:bg-slate-950/25 space-y-2 text-left">
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

      setGerandoPdf(true);
      Swal.fire({ title: 'Gerando Relatório...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

      setTimeout(() => {
        try {
          const pacotesFiltrados = pacotes.filter(p => pacotesSelecionados.includes(String(p.id)));
          const pdfDoc = gerarPdfRomaneio(romaneio, pacotesFiltrados);
          pdfDoc.download(`Romaneio_${romaneio.id.toString().padStart(4, '0')}.pdf`);
          Swal.close();
        } catch {
          Swal.fire({ icon: 'error', title: 'Erro', text: 'Falha ao gerar o PDF.', customClass: { popup: 'rounded-3xl' } });
        } finally {
          setGerandoPdf(false);
        }
      }, 100);

    } catch (e) {
      console.error(e);
    }
  };

  const handleExportarExcel = () => {
    try {
      exportarRomaneioParaCSV({
        id: romaneio.id,
        cliente: romaneio.cliente,
        data: romaneio.data,
        tipo_romaneio: romaneio.tipo_romaneio,
        total_m3: romaneio.total_m3,
        total_ml: romaneio.total_ml,
        pacotes: pacotes.map(p => ({
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
        text: 'Arquivo CSV compatível com Excel baixado com sucesso.',
        timer: 2000,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      });
    } catch {
      Swal.fire({ icon: 'error', title: 'Erro', text: 'Falha ao exportar planilha Excel.' });
    }
  };

  useEffect(() => {
    const carregar = async () => {
      if (!id) return;
      setCarregando(true);
      try {
        const rResult = await window.electronAPI.queryDB(`
          SELECT r.id, r.data, c.nome as cliente, r.total_m3, r.total_ml, r.tipo_romaneio FROM romaneios r LEFT JOIN clientes c ON r.cliente_id = c.id WHERE r.id = ?
        `, [Number(id)]);

        if (!rResult.success || !rResult.data || rResult.data.length === 0) {
          Swal.fire({ icon: 'error', title: 'Erro', text: 'Romaneio não encontrado.' });
          navigate('/');
          return;
        }
        const romaneioBD = rResult.data[0];

        const pResult = await window.electronAPI.queryDB(`
          SELECT rp.*, COALESCE(e.nome, e_glob.nome) as especie FROM romaneio_pacotes rp LEFT JOIN especies e ON rp.especie_id = e.id LEFT JOIN romaneios r ON rp.romaneio_id = r.id LEFT JOIN especies e_glob ON r.especie_id = e_glob.id WHERE rp.romaneio_id = ? ORDER BY rp.numero_pacote
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

        const temEspecieNosPacotes = pacotesBD.some((p: Record<string, unknown>) => p.especie);
        const especiesConsolidadas = temEspecieNosPacotes
          ? Array.from(new Set(pacotesBD.map((p: Record<string, unknown>) => p.especie).filter(Boolean))).join(', ')
          : 'Sem espécie';

        setRomaneio({ ...romaneioBD, especie: especiesConsolidadas });
        setPacotes(pacotesBD);
      } catch {
        Swal.fire({ icon: 'error', title: 'Erro', text: 'Falha ao carregar o romaneio.' });
        navigate('/');
      } finally {
        setCarregando(false);
      }
    };
    carregar();
  }, [id, navigate]);

  const resumos = useMemo(() => {
    return calcularResumosConsolidados(pacotes, romaneio?.tipo_romaneio);
  }, [pacotes, romaneio?.tipo_romaneio]);

  if (carregando) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400 py-24">
        <Loader2 size={40} className="animate-spin text-blue-500" />
        <p className="font-semibold text-sm">Carregando visualização do romaneio...</p>
      </div>
    );
  }

  const pacoteAtivo = pacotes.find(p => p.id === abaAtiva);

  return (
    <>
      <div className="w-full mx-auto space-y-8 pb-32 page-transition">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-8 sm:p-10 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-3 h-full bg-gradient-to-b from-blue-500 to-indigo-600"></div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <h2 className="text-3xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-3">
              <div className="bg-blue-100 dark:bg-blue-950/30 p-2.5 rounded-xl text-blue-600 dark:text-blue-400">
                <PackageSearch size={28} strokeWidth={2.5} />
              </div>
              Visualizando <span className="text-blue-600 dark:text-blue-400 ml-1">#{romaneio.id.toString().padStart(4, '0')}</span>
            </h2>
            <Link
              to="/"
              className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 bg-slate-100/50 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-4 py-2.5 rounded-xl font-bold transition-all self-start sm:self-auto"
            >
              <ArrowLeft size={16} strokeWidth={2.5} /> Voltar
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="glass-card p-5 border border-slate-200/50 dark:border-slate-800/50 flex items-center gap-4">
              <div className="bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 p-3.5 rounded-xl">
                <User size={22} strokeWidth={2.5} />
              </div>
              <div>
                <span className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">
                  Cliente / Destinatário
                </span>
                <span className="text-base font-bold text-slate-800 dark:text-slate-100">{romaneio.cliente}</span>
              </div>
            </div>

            <div className="glass-card p-5 border border-slate-200/50 dark:border-slate-800/50 flex items-center gap-4">
              <div className="bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-455 p-3.5 rounded-xl">
                <Box size={22} strokeWidth={2.5} />
              </div>
              <div>
                <span className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">
                  Espécie(s)
                </span>
                <span className="text-base font-bold text-slate-800 dark:text-slate-100">{romaneio.especie}</span>
              </div>
            </div>

            <div className="glass-card p-5 border border-slate-200/50 dark:border-slate-800/50 flex items-center gap-4">
              <div className="bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-450 p-3.5 rounded-xl">
                <Calendar size={22} strokeWidth={2.5} />
              </div>
              <div>
                <span className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">
                  Data de Emissão
                </span>
                <span className="text-base font-bold text-slate-800 dark:text-slate-100">
                  {new Date(romaneio.data).toLocaleDateString('pt-BR')}
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Abas de Navegação */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setAbaAtiva('resumo')}
            className={`px-6 py-3 rounded-xl font-bold text-xs transition-all flex items-center gap-2 cursor-pointer ${
              abaAtiva === 'resumo'
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-lg shadow-slate-900/20 dark:shadow-none'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
            }`}
          >
            📊 Consolidado
          </button>
          {pacotes.map(pacote => (
            <button
              key={pacote.id}
              onClick={() => setAbaAtiva(pacote.id)}
              className={`px-6 py-3 rounded-xl font-bold text-xs transition-all flex items-center gap-2 cursor-pointer ${
                abaAtiva === pacote.id
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 dark:shadow-none'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
              }`}
            >
              📦 Pacote {pacote.numero_pacote} ({Number(pacote.total_m3).toFixed(3)} m³)
            </button>
          ))}
          <button
            onClick={() => setAbaAtiva('todos')}
            className={`px-6 py-3 rounded-xl font-bold text-xs transition-all flex items-center gap-2 cursor-pointer ${
              abaAtiva === 'todos'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 dark:shadow-none'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
            }`}
          >
            📂 Todos
          </button>
        </div>

        {/* Conteúdo da Aba Consolidado / Todos */}
        {(abaAtiva === 'resumo' || abaAtiva === 'todos') && pacotes.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-8 relative overflow-hidden border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
              <Box className="text-blue-600 dark:text-blue-400" size={20} strokeWidth={2.5} /> Resumo Consolidado do Romaneio
            </h3>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                    Consolidado por Espécie
                  </h4>
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)]">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 uppercase text-[9px] font-black tracking-widest border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="px-5 py-4">Espécie</th>
                          <th className="px-5 py-4 text-center">Peças</th>
                          <th className="px-5 py-4 text-center">Total ML</th>
                          <th className="px-5 py-4 text-center">Total M³</th>
                          <th className="px-5 py-4 text-center w-28">% Vol</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                        {resumos.porEspecie.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="px-5 py-3.5 font-bold text-slate-800 dark:text-slate-100">{item.especie}</td>
                            <td className="px-5 py-3.5 text-center font-semibold">{item.totalPecas}</td>
                            <td className="px-5 py-3.5 text-center font-semibold">{item.totalMl.toFixed(2).replace('.', ',')}</td>
                            <td className="px-5 py-3.5 text-center font-black text-emerald-600 dark:text-emerald-450">{item.totalM3.toFixed(3).replace('.', ',')}</td>
                            <td className="px-5 py-3.5 text-center">
                              <span className="font-bold text-slate-500 dark:text-slate-400">{item.percentual.toFixed(1)}%</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-850">
                  <h4 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                    Consolidado por Categoria de Comprimento
                  </h4>
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)]">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 uppercase text-[9px] font-black tracking-widest border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="px-5 py-4">Categoria</th>
                          <th className="px-5 py-4 text-center">Volume M³</th>
                          <th className="px-5 py-4 text-center w-28">% Vol</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                        {romaneio?.tipo_romaneio === 'pes' ? (
                          <>
                            <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                              <td className="px-5 py-3.5 font-bold text-slate-800 dark:text-slate-100">6 PÉS E ABAIXO</td>
                              <td className="px-5 py-3.5 text-center font-black text-red-600 dark:text-red-450 bg-red-50/20 dark:bg-red-950/10">{resumos.totalAbaixo6M3.toFixed(3).replace('.', ',')}</td>
                              <td className="px-5 py-3.5 text-center font-bold text-slate-500 dark:text-slate-400">
                                {(resumos.totalVolumeGeral > 0 ? (resumos.totalAbaixo6M3 / resumos.totalVolumeGeral) * 100 : 0).toFixed(1)}%
                              </td>
                            </tr>
                            <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                              <td className="px-5 py-3.5 font-bold text-slate-800 dark:text-slate-100">7 PÉS</td>
                              <td className="px-5 py-3.5 text-center font-black text-amber-600 dark:text-amber-450 bg-amber-50/20 dark:bg-amber-950/10">{resumos.total7M3.toFixed(3).replace('.', ',')}</td>
                              <td className="px-5 py-3.5 text-center font-bold text-slate-500 dark:text-slate-400">
                                {(resumos.totalVolumeGeral > 0 ? (resumos.total7M3 / resumos.totalVolumeGeral) * 100 : 0).toFixed(1)}%
                              </td>
                            </tr>
                            <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                              <td className="px-5 py-3.5 font-bold text-slate-800 dark:text-slate-100">8 PÉS E ACIMA</td>
                              <td className="px-5 py-3.5 text-center font-black text-emerald-600 dark:text-emerald-450 bg-emerald-50/20 dark:bg-emerald-950/10">{resumos.totalAcima8M3.toFixed(3).replace('.', ',')}</td>
                              <td className="px-5 py-3.5 text-center font-bold text-slate-500 dark:text-slate-400">
                                {(resumos.totalVolumeGeral > 0 ? (resumos.totalAcima8M3 / resumos.totalVolumeGeral) * 100 : 0).toFixed(1)}%
                              </td>
                            </tr>
                          </>
                        ) : (
                          <>
                            <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                              <td className="px-5 py-3.5 font-bold text-slate-800 dark:text-slate-100">MADEIRA LONGA (&gt;= 2,00 m)</td>
                              <td className="px-5 py-3.5 text-center font-black text-emerald-600 dark:text-emerald-450 bg-emerald-50/20 dark:bg-emerald-950/10">{resumos.totalMadeiraLongaM3.toFixed(3).replace('.', ',')}</td>
                              <td className="px-5 py-3.5 text-center font-bold text-slate-500 dark:text-slate-400">
                                {(resumos.totalVolumeGeral > 0 ? (resumos.totalMadeiraLongaM3 / resumos.totalVolumeGeral) * 100 : 0).toFixed(1)}%
                              </td>
                            </tr>
                            <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                              <td className="px-5 py-3.5 font-bold text-slate-800 dark:text-slate-100">SHORT (&lt;= 1,90 m)</td>
                              <td className="px-5 py-3.5 text-center font-black text-red-600 dark:text-red-450 bg-red-50/20 dark:bg-red-950/10">{resumos.totalShortM3.toFixed(3).replace('.', ',')}</td>
                              <td className="px-5 py-3.5 text-center font-bold text-slate-500 dark:text-slate-400">
                                {(resumos.totalVolumeGeral > 0 ? (resumos.totalShortM3 / resumos.totalVolumeGeral) * 100 : 0).toFixed(1)}%
                              </td>
                            </tr>
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                  Consolidado por Bitola (Seção)
                </h4>
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)]">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 uppercase text-[9px] font-black tracking-widest border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-5 py-4">Espécie</th>
                        <th className="px-5 py-4 text-center">Bitola (cm)</th>
                        <th className="px-5 py-4 text-center">Peças</th>
                        <th className="px-5 py-4 text-center">Total ML</th>
                        <th className="px-5 py-4 text-center">Total M³</th>
                        <th className="px-5 py-4 text-center w-20">% Vol</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                      {resumos.porBitola.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="px-5 py-3.5 text-slate-800 dark:text-slate-100 font-bold">{item.especie}</td>
                          <td className="px-5 py-3.5 text-center font-black text-slate-700 dark:text-slate-300 bg-slate-50/50 dark:bg-slate-950/20">
                            {item.espessura} <span className="text-[10px] text-slate-400 font-bold mx-0.5">X</span> {item.largura}
                          </td>
                          <td className="px-5 py-3.5 text-center font-semibold">{item.totalPecas}</td>
                          <td className="px-5 py-3.5 text-center font-semibold">{item.totalMl.toFixed(2).replace('.', ',')}</td>
                          <td className="px-5 py-3.5 text-center font-black text-emerald-600 dark:text-emerald-450">{item.totalM3.toFixed(3).replace('.', ',')}</td>
                          <td className="px-5 py-3.5 text-center font-bold text-slate-400">{item.percentual.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {abaAtiva !== 'resumo' && abaAtiva !== 'todos' && pacoteAtivo && (
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="glass-panel p-8 border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-4 mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
              <span className="bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 px-4 py-2 rounded-xl text-sm font-black tracking-wider uppercase border border-blue-200 dark:border-blue-900/30">
                Pacote {pacoteAtivo.numero_pacote}
              </span>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                Espécie:{' '}
                <strong className="text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-850 px-2 py-1 rounded-md ml-1">
                  {pacoteAtivo.especie || 'Sem espécie'}
                </strong>
              </span>
            </div>
            <PacoteTabelas pacote={pacoteAtivo} tipoRomaneio={romaneio?.tipo_romaneio} />
          </motion.div>
        )}

        {abaAtiva === 'todos' && (
          <div className="space-y-8">
            {pacotes.map(pacote => (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={pacote.id} className="glass-panel p-8 border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-4 mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <span className="bg-slate-100 dark:bg-slate-850 text-slate-700 dark:text-slate-350 px-4 py-2 rounded-xl text-sm font-black tracking-wider uppercase border border-slate-200 dark:border-slate-850">
                    Pacote {pacote.numero_pacote}
                  </span>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    Espécie: <strong className="text-slate-800 dark:text-slate-200 ml-1">{pacote.especie || 'Sem espécie'}</strong>
                  </span>
                </div>
                <PacoteTabelas pacote={pacote} tipoRomaneio={romaneio?.tipo_romaneio} />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Rodapé Fixo de Ações com Etiquetas e Excel */}
      <div className="w-full mx-auto sticky bottom-6 z-40 pointer-events-none">
        <div className="w-full bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 p-5 rounded-[2rem] flex flex-wrap items-center justify-between gap-4 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] pointer-events-auto text-white">
          <div className="flex flex-wrap gap-3 items-center">
            <Link
              to={`/editar/${romaneio.id}`}
              className="px-5 py-3 rounded-2xl font-black bg-blue-600 hover:bg-blue-500 text-white transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_25px_rgba(37,99,235,0.5)] text-xs cursor-pointer"
            >
              <Pencil size={16} strokeWidth={2.5} /> Editar
            </Link>

            <button
              onClick={gerarPDF}
              disabled={gerandoPdf}
              className={`px-5 py-3 rounded-2xl font-black transition-all flex items-center gap-2 cursor-pointer text-xs ${
                gerandoPdf
                  ? 'bg-emerald-500/50 text-white cursor-not-allowed'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-900 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] hover:-translate-y-0.5'
              }`}
            >
              <FileDown size={16} strokeWidth={2.5} />
              {gerandoPdf ? 'Gerando...' : 'Exportar PDF'}
            </button>

            <button
              onClick={() => setEtiquetaModalAberto(true)}
              className="px-5 py-3 rounded-2xl font-black bg-purple-600 hover:bg-purple-500 text-white transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(147,51,234,0.3)] hover:shadow-[0_0_25px_rgba(147,51,234,0.5)] hover:-translate-y-0.5 text-xs cursor-pointer"
              title="Gerar etiquetas de fardo com QR Code para identificação"
            >
              <Tag size={16} strokeWidth={2.5} />
              Etiquetas
            </button>

            <button
              onClick={handleExportarExcel}
              className="px-5 py-3 rounded-2xl font-black bg-teal-600 hover:bg-teal-500 text-white transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(13,148,136,0.3)] hover:shadow-[0_0_25px_rgba(13,148,136,0.5)] hover:-translate-y-0.5 text-xs cursor-pointer"
              title="Exportar planilha analítica compatível com Excel"
            >
              <FileSpreadsheet size={16} strokeWidth={2.5} />
              Excel (.csv)
            </button>

            <button
              onClick={() => setWhatsappModalAberto(true)}
              className="px-5 py-3 rounded-2xl font-black bg-[#25D366] hover:bg-[#20bd5a] text-white transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(37,211,102,0.3)] hover:shadow-[0_0_25px_rgba(37,211,102,0.5)] hover:-translate-y-0.5 text-xs cursor-pointer"
            >
              <WhatsAppIcon size={16} />
              WhatsApp
            </button>
          </div>

          <div className="flex gap-8 items-center ml-auto">
            <div className="text-right">
              <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Total ML</span>
              <span className="text-2xl font-black text-slate-100">{romaneio.total_ml.toFixed(2)}</span>
            </div>
            <div className="text-right">
              <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Total M³</span>
              <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">
                {romaneio.total_m3.toFixed(3)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Compartilhamento via WhatsApp */}
      {romaneio && (
        <ModalWhatsApp
          isOpen={whatsappModalAberto}
          onClose={() => setWhatsappModalAberto(false)}
          romaneio={romaneio}
          pacotes={pacotes}
        />
      )}

      {/* Modal de Etiquetas de Fardo */}
      {romaneio && (
        <ModalEtiquetaPacote
          isOpen={etiquetaModalAberto}
          onClose={() => setEtiquetaModalAberto(false)}
          romaneio={romaneio}
          pacotes={pacotes}
        />
      )}
    </>
  );
}
