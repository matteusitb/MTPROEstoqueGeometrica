import React, { useState, useEffect } from 'react';
import { ShieldAlert, Copy, Check, RefreshCw, KeyRound, Clock, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Swal from 'sweetalert2';

interface AtivacaoProps {
  onActivated: () => void;
  motivo: 'unactivated' | 'expired' | 'fraud' | 'ok';
}

const Ativacao: React.FC<AtivacaoProps> = ({ onActivated, motivo }) => {
  const [hardwareId, setHardwareId] = useState('');
  const [chave, setChave] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [ativando, setAtivando] = useState(false);
  const [erroAtivacao, setErroAtivacao] = useState<string | null>(null);

  useEffect(() => {
    const fetchId = async () => {
      if (window.electronAPI && typeof window.electronAPI.getHardwareId === 'function') {
        const id = await window.electronAPI.getHardwareId();
        setHardwareId(id);
      } else {
        setHardwareId('development-web-client-id');
      }
    };
    fetchId();
  }, []);

  const handleCopyId = () => {
    if (hardwareId) {
      navigator.clipboard.writeText(hardwareId);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    }
  };

  const handleAtivar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chave.trim()) return;
    
    setAtivando(true);
    setErroAtivacao(null);

    try {
      const res = await window.electronAPI.ativarSistema(chave.trim());
      if (res.success) {
        Swal.fire({
          icon: 'success',
          title: 'Sistema Ativado com Sucesso!',
          text: `Sua licença está ativa e é válida até ${res.validade}.`,
          confirmButtonColor: '#059669',
          customClass: { popup: 'rounded-3xl', confirmButton: 'rounded-xl font-bold px-6 py-3 shadow-md' }
        });
        onActivated();
      } else {
        setErroAtivacao(res.error || 'Falha ao ativar o sistema. Verifique a chave de ativação.');
      }
    } catch (err: any) {
      setErroAtivacao(err.message || 'Falha de comunicação com o sistema.');
    } finally {
      setAtivando(false);
    }
  };

  const getAlertMessage = () => {
    if (motivo === 'expired') {
      return {
        icon: <Clock className="w-5 h-5 text-amber-600 dark:text-amber-450 shrink-0" />,
        bg: 'bg-amber-50/80 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40',
        text: 'Sua licença de uso expirou. Para renová-la, por favor, envie o ID de hardware abaixo para o suporte técnico.'
      };
    }
    if (motivo === 'fraud') {
      return {
        icon: <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 animate-pulse" />,
        bg: 'bg-red-50/80 dark:bg-red-955/20 border-red-200/50 dark:border-red-900/30',
        text: 'Fraude de relógio detectada. O relógio do sistema parece ter sido retrocedido. Corrija o horário do computador para reativar o sistema.'
      };
    }
    return null;
  };

  const alert = getAlertMessage();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-slate-950 relative overflow-hidden font-sans">
      {/* Background Decorativo */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-fuchsia-300/20 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-300/20 rounded-full blur-[100px] pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md p-6 relative z-10"
      >
        <div className="glass-panel p-10 flex flex-col items-center border border-slate-100 dark:border-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.02)] bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-[2.5rem]">
          
          {/* Logo de Segurança */}
          <div className="w-20 h-20 bg-gradient-to-br from-fuchsia-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-fuchsia-500/20 mb-8 transform hover:scale-105 transition-transform duration-300">
            <KeyRound className="w-10 h-10 text-white" strokeWidth={1.5} />
          </div>

          <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100 mb-2 tracking-tight">Ativação Necessária</h1>
          <p className="text-slate-500 dark:text-slate-400 mb-8 text-center text-sm font-medium leading-relaxed">
            Uma licença válida é necessária para liberar o acesso a este computador.
          </p>

          <form onSubmit={handleAtivar} className="w-full space-y-6">
            <AnimatePresence mode="wait">
              {alert && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={`border p-4 rounded-xl flex items-start gap-3 text-xs font-semibold leading-relaxed ${alert.bg}`}
                >
                  {alert.icon}
                  <p className="text-slate-700 dark:text-slate-300">{alert.text}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {erroAtivacao && (
              <div className="bg-red-50/80 dark:bg-red-955/20 border border-red-200/50 dark:border-red-900/30 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl flex items-center gap-3 text-sm font-semibold">
                <ShieldAlert className="w-5 h-5 flex-shrink-0" />
                <p>{erroAtivacao}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-550 dark:text-slate-450 uppercase tracking-widest ml-1">Chave de Ativação</label>
              <div className="relative">
                <input
                  type="text"
                  value={chave}
                  onChange={(e) => setChave(e.target.value)}
                  className="glass-input w-full px-4 py-3.5 text-slate-700 dark:text-slate-200 font-bold text-center tracking-wider text-sm outline-none"
                  placeholder="Cole aqui a chave de ativação"
                  required
                  disabled={ativando || motivo === 'fraud'}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={ativando || motivo === 'fraud' || !chave.trim()}
              className="w-full bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white font-bold py-4 px-4 rounded-xl shadow-lg shadow-fuchsia-500/20 hover:shadow-fuchsia-550/30 transition-all duration-300 flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5 disabled:hover:translate-y-0"
            >
              {ativando ? (
                <><RefreshCw className="w-5 h-5 animate-spin" /> <span>Validando...</span></>
              ) : (
                <>
                  <span>Ativar Licença</span>
                </>
              )}
            </button>
          </form>

          {/* ID do Hardware */}
          <div className="mt-8 text-center text-xs text-slate-400 flex flex-col items-center gap-3 justify-center w-full">
            <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800/80 rounded-2xl flex flex-col items-center gap-1.5 w-full">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-wider">ID deste Computador (Hardware ID)</span>
              <span className="text-[11px] font-mono text-slate-600 dark:text-slate-300 break-all select-all font-bold bg-white dark:bg-slate-900 px-3 py-2 rounded-lg border border-slate-150 dark:border-slate-800 shadow-inner w-full text-center">
                {hardwareId || 'Carregando...'}
              </span>
              {hardwareId && (
                <button
                  type="button"
                  onClick={handleCopyId}
                  className="text-xs text-fuchsia-600 dark:text-fuchsia-400 hover:text-fuchsia-700 font-black transition-all mt-1 hover:underline cursor-pointer flex items-center gap-1.5"
                >
                  {copiado ? (
                    <><Check size={12} strokeWidth={3} className="text-emerald-500" /> <span className="text-emerald-500 font-bold">Copiado!</span></>
                  ) : (
                    <><Copy size={12} strokeWidth={2.5} /> Copiar Código</>
                  )}
                </button>
              )}
            </div>
          </div>

        </div>
      </motion.div>
    </div>
  );
};

export default Ativacao;
