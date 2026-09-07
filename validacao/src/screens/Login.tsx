import React, { useState, useEffect } from 'react';
import { Mail, Lock, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [machineId, setMachineId] = useState('');
  const [copied, setCopied] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const isLoading = useAuthStore((state) => state.isLoading);
  const error = useAuthStore((state) => state.error);
  const loginWithSupabase = useAuthStore((state) => state.loginWithSupabase);
  const clearError = useAuthStore((state) => state.clearError);

  // Monitora o estado da conexão de internet
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Carrega o Machine ID do computador
  useEffect(() => {
    const fetchMachineId = async () => {
      if (window.electronAPI && typeof window.electronAPI.getHardwareId === 'function') {
        const id = await window.electronAPI.getHardwareId();
        setMachineId(id);
      } else {
        setMachineId('development-web-client-id');
      }
    };
    fetchMachineId();
  }, []);

  const handleCopyId = () => {
    if (machineId) {
      navigator.clipboard.writeText(machineId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Limpa o erro ao desmontar a tela ou digitar
  useEffect(() => {
    clearError();
  }, [email, password, clearError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await loginWithSupabase(email, password);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-slate-950 relative overflow-hidden font-sans">
      {/* Background Decorativo */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-300/20 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-teal-300/20 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md p-6 page-transition relative z-10">
        <div className="glass-panel p-10 flex flex-col items-center">
          
          {/* Logo / Ícone */}
          <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-8 transform hover:scale-105 transition-transform duration-300">
            <ShieldCheck className="w-10 h-10 text-white" strokeWidth={1.5} />
          </div>

          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 mb-2 tracking-tight">Bem-vindo</h1>
          <p className="text-slate-500 dark:text-slate-400 mb-8 text-center text-sm">
            Faça login para acessar o sistema de Romaneio de Madeira Serrada.
          </p>

          <form onSubmit={handleSubmit} className="w-full space-y-5">
            {!isOnline && (
              <div className="bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-amber-700 dark:text-amber-400 px-4 py-3 rounded-xl flex items-center gap-3 text-xs animate-[fadeInSlideUp_0.3s_ease-out]">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p>Dispositivo offline. O acesso local será liberado se você já tiver feito login online neste computador antes.</p>
              </div>
            )}

            {error && (
              <div className="bg-red-50/80 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl flex items-center gap-3 text-sm animate-[fadeInSlideUp_0.3s_ease-out]">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 ml-1">E-mail</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="w-5 h-5 text-slate-400" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="glass-input w-full pl-11 pr-4 py-3.5 text-slate-700 dark:text-slate-200"
                  placeholder="Digite seu e-mail"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 ml-1">Senha</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="w-5 h-5 text-slate-400" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="glass-input w-full pl-11 pr-4 py-3.5 text-slate-700 dark:text-slate-200"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-medium py-3.5 px-4 rounded-xl shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all duration-300 flex items-center justify-center gap-2 group disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Entrar</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 text-center text-xs text-slate-400 flex flex-col items-center gap-3 justify-center w-full">
            <div className="flex items-center gap-2">
              <Lock className="w-3.5 h-3.5" />
              <span>Ambiente seguro e criptografado</span>
            </div>

            {machineId && (
              <div className="mt-2 p-3 bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-800/50 rounded-xl flex flex-col items-center gap-1.5 w-full">
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">ID deste Computador</span>
                <span className="text-[11px] font-mono text-slate-600 dark:text-slate-300 break-all select-all font-semibold bg-white/50 dark:bg-slate-950/50 px-2 py-1 rounded border border-slate-100 dark:border-slate-900">{machineId}</span>
                <button
                  type="button"
                  onClick={handleCopyId}
                  className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 font-bold transition-all mt-0.5 hover:underline cursor-pointer"
                >
                  {copied ? 'Copiado!' : 'Clique para copiar ID'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
