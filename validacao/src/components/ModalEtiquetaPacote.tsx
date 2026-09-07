import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Tag, CheckSquare, Square, Printer, Loader2 } from 'lucide-react';
import Swal from 'sweetalert2';
import { gerarPdfEtiquetasPacote, type PacoteEtiqueta, type RomaneioEtiquetaInfo } from '../utils/etiquetaGenerator';

interface ModalEtiquetaPacoteProps {
  isOpen: boolean;
  onClose: () => void;
  romaneio: RomaneioEtiquetaInfo;
  pacotes: PacoteEtiqueta[];
}

export const ModalEtiquetaPacote: React.FC<ModalEtiquetaPacoteProps> = ({
  isOpen,
  onClose,
  romaneio,
  pacotes
}) => {
  const [pacotesSelecionados, setPacotesSelecionados] = useState<number[]>(() =>
    pacotes.map(p => p.numero_pacote)
  );
  const [gerando, setGerando] = useState(false);

  React.useEffect(() => {
    if (pacotes && pacotes.length > 0) {
      setPacotesSelecionados(pacotes.map(p => p.numero_pacote));
    }
  }, [pacotes]);

  const pacotesFiltrados = useMemo(() => {
    return pacotes.filter(p => pacotesSelecionados.includes(p.numero_pacote));
  }, [pacotes, pacotesSelecionados]);

  const handleTogglePacote = (num: number) => {
    setPacotesSelecionados(prev =>
      prev.includes(num) ? prev.filter(n => n !== num) : [...prev, num]
    );
  };

  const handleSelecionarTodos = () => {
    setPacotesSelecionados(pacotes.map(p => p.numero_pacote));
  };

  const handleDesmarcarTodos = () => {
    setPacotesSelecionados([]);
  };

  const handleImprimir = () => {
    if (pacotesFiltrados.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Atenção',
        text: 'Selecione pelo menos um pacote para gerar as etiquetas.',
        confirmButtonColor: '#059669',
        customClass: { popup: 'rounded-3xl' }
      });
      return;
    }

    setGerando(true);
    setTimeout(() => {
      try {
        const pdfDoc = gerarPdfEtiquetasPacote(romaneio, pacotesFiltrados);
        pdfDoc.download(`Etiquetas_Romaneio_${String(romaneio.id).padStart(4, '0')}.pdf`);
        onClose();
        Swal.fire({
          icon: 'success',
          title: 'Etiquetas Geradas!',
          text: 'O arquivo PDF com as etiquetas foi baixado com sucesso.',
          timer: 2000,
          showConfirmButton: false,
          toast: true,
          position: 'top-end'
        });
      } catch (err) {
        console.error('Erro ao gerar etiquetas:', err);
        Swal.fire({
          icon: 'error',
          title: 'Erro',
          text: 'Falha ao gerar o PDF das etiquetas.',
          customClass: { popup: 'rounded-3xl' }
        });
      } finally {
        setGerando(false);
      }
    }, 100);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 max-w-lg w-full overflow-hidden"
        >
          {/* Header */}
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-xl">
                <Tag size={22} strokeWidth={2.5} />
              </div>
              <div>
                <h3 className="font-black text-slate-800 dark:text-slate-100 text-lg">
                  Imprimir Etiquetas de Fardo
                </h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 font-semibold">
                  Romaneio #{String(romaneio.id).padStart(4, '0')} — {romaneio.cliente}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Selecione os Pacotes ({pacotesFiltrados.length} de {pacotes.length})
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSelecionarTodos}
                  className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  Todos
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={handleDesmarcarTodos}
                  className="text-[11px] font-bold text-slate-400 hover:underline cursor-pointer"
                >
                  Nenhum
                </button>
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {pacotes.map(p => {
                const isSelected = pacotesSelecionados.includes(p.numero_pacote);
                return (
                  <div
                    key={p.numero_pacote}
                    onClick={() => handleTogglePacote(p.numero_pacote)}
                    className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-300/80 dark:border-emerald-800'
                        : 'bg-slate-50/50 dark:bg-slate-950/30 border-slate-200/60 dark:border-slate-800 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {isSelected ? (
                        <CheckSquare size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                      ) : (
                        <Square size={18} className="text-slate-400 shrink-0" />
                      )}
                      <div>
                        <span className="font-black text-slate-800 dark:text-slate-100 text-sm">
                          Pacote Nº {p.numero_pacote}
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-500 font-semibold ml-2">
                          {p.especie || 'Mista'}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                        {Number(p.total_m3).toFixed(3)} M³
                      </span>
                      <span className="block text-[10px] text-slate-400 font-semibold">
                        {Number(p.total_ml).toFixed(2)} ML
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-950/50 rounded-2xl border border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              💡 As etiquetas incluem QR Code para conferência de carga rápida e formatação padrão de fardo (100mm × 150mm).
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3 bg-slate-50/50 dark:bg-slate-950/20">
            <button
              onClick={onClose}
              className="px-5 py-3 rounded-xl font-bold text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={handleImprimir}
              disabled={gerando || pacotesFiltrados.length === 0}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-black text-xs px-6 py-3 rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {gerando ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Gerando PDF...
                </>
              ) : (
                <>
                  <Printer size={16} /> Gerar {pacotesFiltrados.length} Etiqueta(s)
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
