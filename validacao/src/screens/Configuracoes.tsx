import { useState, useEffect, useRef } from 'react';
import {
  Database, HardDriveDownload, FolderOpen, Clock, Shield,
  ToggleLeft, ToggleRight, Save, Trash2, AlertTriangle,
  CheckCircle2, XCircle, Copy, Check, X, RefreshCw,
  Search, ArrowUpCircle, Download, RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Swal from 'sweetalert2';
import { supabase } from '../utils/supabaseClient';

interface DbInfo {
  path: string;
  sizeBytes: number;
  romaneiosCount: number;
  especiesCount: number;
  pacotesCount: number;
}

interface BackupConfig {
  autoBackupEnabled?: boolean;
  backupFolder?: string;
  frequency?: string;
  lastManualBackup?: string;
  lastAutoBackup?: string;
  backupHours?: string[];
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDate(iso?: string) {
  if (!iso) return 'Nunca';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Configuracoes() {
  const [dbInfo, setDbInfo] = useState<DbInfo | null>(null);
  const [backupConfig, setBackupConfig] = useState<BackupConfig>({});
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const [syncingEspecies, setSyncingEspecies] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);

  // Espécies
  const [especies, setEspecies] = useState<any[]>([]);
  const [buscaEspecie, setBuscaEspecie] = useState('');

  // Modal de reset
  const [resetModalAberto, setResetModalAberto] = useState(false);
  const [resetTexto, setResetTexto] = useState('');
  const [resetando, setResetando] = useState(false);
  const resetInputRef = useRef<HTMLInputElement>(null);

  // Novo estado para o input de horário
  const [novoHorario, setNovoHorario] = useState('18:00');

  // Estados do Auto-Updater
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<{ version: string; releaseNotes?: string } | null>(null);
  const [updateNotAvailable, setUpdateNotAvailable] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ percent: number; bytesPerSecond: number; transferred: number; total: number } | null>(null);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [checkingError, setCheckingError] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState('1.0.3');

  useEffect(() => {
    carregarDados();

    if (window.electronAPI && typeof window.electronAPI.getAppVersion === 'function') {
      window.electronAPI.getAppVersion().then(v => {
        if (v) setAppVersion(v);
      }).catch(() => {});
    }

    // Configura os listeners de atualização do Electron
    const unsubscribeChecking = window.electronAPI.onUpdateChecking(() => {
      setUpdateChecking(true);
      setUpdateAvailable(null);
      setUpdateNotAvailable(false);
      setUpdateError(null);
      setDownloadProgress(null);
      setUpdateDownloaded(false);
      setCheckingError(null);
    });

    const unsubscribeAvailable = window.electronAPI.onUpdateAvailable((info) => {
      setUpdateChecking(false);
      setUpdateAvailable(info);
      setUpdateNotAvailable(false);
      setUpdateError(null);
    });

    const unsubscribeNotAvailable = window.electronAPI.onUpdateNotAvailable(() => {
      setUpdateChecking(false);
      setUpdateAvailable(null);
      setUpdateNotAvailable(true);
      setUpdateError(null);
    });

    const unsubscribeError = window.electronAPI.onUpdateError((err) => {
      setUpdateChecking(false);
      setUpdateError(err);
      setUpdateAvailable(null);
    });

    const unsubscribeProgress = window.electronAPI.onDownloadProgress((progress) => {
      setDownloadProgress(progress);
    });

    const unsubscribeDownloaded = window.electronAPI.onUpdateDownloaded(() => {
      setUpdateDownloaded(true);
      setDownloadProgress(null);
    });

    return () => {
      unsubscribeChecking();
      unsubscribeAvailable();
      unsubscribeNotAvailable();
      unsubscribeError();
      unsubscribeProgress();
      unsubscribeDownloaded();
    };
  }, []);

  const handleCheckForUpdates = async () => {
    setCheckingError(null);
    setUpdateNotAvailable(false);
    setUpdateError(null);
    try {
      const res = await window.electronAPI.checkForUpdates();
      if (!res.success) {
        setCheckingError(res.error || 'Erro desconhecido ao verificar atualizações.');
      }
    } catch (e: any) {
      setCheckingError(e.message || 'Falha de comunicação.');
    }
  };

  const handleDownloadUpdate = async () => {
    try {
      const res = await window.electronAPI.downloadUpdate();
      if (!res.success) {
        setUpdateError(res.error || 'Erro ao iniciar download.');
      }
    } catch (e: any) {
      setUpdateError(e.message || 'Falha de comunicação.');
    }
  };

  const handleInstallUpdate = () => {
    window.electronAPI.installUpdate();
  };

  useEffect(() => {
    if (resetModalAberto) {
      setTimeout(() => resetInputRef.current?.focus(), 100);
    } else {
      setResetTexto('');
    }
  }, [resetModalAberto]);

  const carregarDados = async () => {
    setLoadingInfo(true);
    try {
      const [infoRes, cfgRes, espRes] = await Promise.all([
        window.electronAPI.getDbInfo(),
        window.electronAPI.getBackupConfig(),
        window.electronAPI.queryDB('SELECT * FROM especies ORDER BY nome')
      ]);
      if (infoRes.success) setDbInfo(infoRes as any);
      if (cfgRes.success) setBackupConfig(cfgRes.config || {});
      if (espRes.success && espRes.data) setEspecies(espRes.data);
    } catch (e) {
      console.error('Erro ao carregar dados:', e);
    } finally {
      setLoadingInfo(false);
    }
  };

  const handleBackupManual = async () => {
    setBackupLoading(true);
    try {
      const result = await window.electronAPI.backupDB();
      if (result.success) {
        Swal.fire({
          icon: 'success',
          title: 'Backup Realizado!',
          html: `<p class="text-sm text-slate-600">Arquivo salvo em:</p><p class="text-xs font-mono bg-slate-100 rounded p-2 mt-2 break-all">${result.path}</p>`,
          confirmButtonColor: '#059669',
          customClass: { popup: 'rounded-3xl', confirmButton: 'rounded-xl font-bold px-6 py-3' }
        });
        carregarDados();
      } else if (!result.canceled) {
        Swal.fire({ icon: 'error', title: 'Erro', text: result.error || 'Falha ao criar backup.', customClass: { popup: 'rounded-3xl' } });
      }
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Erro', text: 'Falha de comunicação.', customClass: { popup: 'rounded-3xl' } });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestaurarBackup = async () => {
    const confirmation = await Swal.fire({
      title: 'Restaurar Backup do Banco?',
      html: `
        <div style="text-align: left; font-size: 0.875rem; color: #475569; display: flex; flex-direction: column; gap: 12px; padding: 4px 12px;">
          <p>Esta ação irá <strong>substituir todos os dados atuais</strong> pelos dados contidos no arquivo de backup selecionado.</p>
          <div style="padding: 12px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; font-size: 0.75rem; color: #065f46;">
            <strong>🛡️ Segurança:</strong> Um backup automático do estado atual será criado preventivamente antes da restauração.
          </div>
          <p style="font-size: 0.8rem; color: #64748b;">Deseja selecionar o arquivo de backup (.sqlite ou .db) agora?</p>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Selecionar Arquivo e Restaurar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#059669',
      cancelButtonColor: '#94a3b8',
      customClass: {
        popup: 'rounded-3xl p-6 font-sans border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950',
        title: 'text-xl font-black text-slate-800 dark:text-white tracking-tight',
        confirmButton: 'rounded-xl font-bold px-5 py-2.5 shadow-sm text-sm cursor-pointer',
        cancelButton: 'rounded-xl font-bold px-5 py-2.5 text-sm cursor-pointer'
      }
    });

    if (!confirmation.isConfirmed) return;

    setRestoringBackup(true);
    try {
      const result = await window.electronAPI.restoreDB();
      if (result.success) {
        const nomeArquivo = result.path ? result.path.split(/[\\/]/).pop() : 'backup.sqlite';
        await Swal.fire({
          icon: 'success',
          title: 'Backup Restaurado com Sucesso!',
          html: `
            <div style="text-align: left; font-size: 0.875rem; color: #475569; display: flex; flex-direction: column; gap: 12px; padding: 4px 12px;">
              <p>O banco de dados foi atualizado com as informações do backup.</p>
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; justify-content: space-between; font-size: 0.75rem;">
                  <span style="color: #64748b;">Arquivo importado:</span>
                  <span style="font-family: monospace; font-weight: 700; color: #1e293b; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${nomeArquivo}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.75rem;">
                  <span style="color: #64748b;">Romaneios restaurados:</span>
                  <span style="font-weight: 800; color: #2563eb;">${result.romaneiosCount ?? 0}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.75rem;">
                  <span style="color: #64748b;">Pacotes restaurados:</span>
                  <span style="font-weight: 800; color: #7c3aed;">${result.pacotesCount ?? 0}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.75rem;">
                  <span style="color: #64748b;">Espécies de madeira:</span>
                  <span style="font-weight: 800; color: #059669;">${result.especiesCount ?? 0}</span>
                </div>
              </div>
            </div>
          `,
          confirmButtonColor: '#059669',
          customClass: {
            popup: 'rounded-3xl p-6 font-sans border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950',
            title: 'text-xl font-black text-slate-800 dark:text-white tracking-tight',
            confirmButton: 'rounded-xl font-bold px-6 py-3 shadow-md text-sm cursor-pointer'
          }
        });
        carregarDados();
      } else if (!result.canceled) {
        Swal.fire({
          icon: 'error',
          title: 'Erro na Restauração',
          text: result.error || 'Não foi possível restaurar o backup selecionado.',
          confirmButtonColor: '#ef4444',
          customClass: { popup: 'rounded-3xl' }
        });
      }
    } catch (e: any) {
      Swal.fire({
        icon: 'error',
        title: 'Erro',
        text: e?.message || 'Falha de comunicação ao restaurar o banco.',
        customClass: { popup: 'rounded-3xl' }
      });
    } finally {
      setRestoringBackup(false);
    }
  };

  const handleSelecionarPasta = async () => {
    try {
      const result = await window.electronAPI.selectFolder();
      if (result.success) {
        setBackupConfig(prev => ({ ...prev, backupFolder: result.path }));
      }
    } catch (e) {
      console.error('Erro ao selecionar pasta:', e);
    }
  };

  const handleAbrirPasta = async () => {
    if (!backupConfig.backupFolder) {
      Swal.fire({ icon: 'info', title: 'Nenhuma pasta configurada', text: 'Selecione uma pasta de backup primeiro.', customClass: { popup: 'rounded-3xl' } });
      return;
    }
    await window.electronAPI.openBackupFolder(backupConfig.backupFolder);
  };

  const handleSalvarConfig = async () => {
    setSavingConfig(true);
    try {
      const result = await window.electronAPI.setBackupConfig({
        autoBackupEnabled: backupConfig.autoBackupEnabled ?? false,
        backupFolder: backupConfig.backupFolder ?? '',
        frequency: backupConfig.frequency ?? 'diario',
        backupHours: backupConfig.backupHours ?? [],
      });
      if (result.success) {
        Swal.fire({
          icon: 'success', title: 'Configuração Salva!',
          timer: 1800, showConfirmButton: false,
          customClass: { popup: 'rounded-3xl' }
        });
      }
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Erro', text: 'Não foi possível salvar a configuração.', customClass: { popup: 'rounded-3xl' } });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleCopiarCaminho = () => {
    if (dbInfo?.path) {
      navigator.clipboard.writeText(dbInfo.path);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    }
  };

  const handleResetarBanco = async () => {
    if (resetTexto !== 'APAGAR') return;
    setResetando(true);
    try {
      const result = await window.electronAPI.resetRomaneiosDB();
      if (result.success) {
        setResetModalAberto(false);
        setResetTexto('');
        Swal.fire({
          icon: 'success',
          title: 'Banco Resetado!',
          text: 'Todos os romaneios foram removidos. As espécies foram mantidas.',
          confirmButtonColor: '#059669',
          customClass: { popup: 'rounded-3xl', confirmButton: 'rounded-xl font-bold px-6 py-3' }
        });
        carregarDados();
      } else {
        Swal.fire({ icon: 'error', title: 'Erro', text: result.error || 'Falha ao resetar banco.', customClass: { popup: 'rounded-3xl' } });
      }
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Erro', text: 'Falha de comunicação.', customClass: { popup: 'rounded-3xl' } });
    } finally {
      setResetando(false);
    }
  };

  const handleSincronizarEspecies = async () => {
    setSyncingEspecies(true);
    try {
      const { data, error } = await supabase
        .from('especies')
        .select('id, nome, cientifico')
        .order('nome');

      if (error) {
        throw new Error(error.message || 'Falha ao buscar espécies no Supabase.');
      }

      if (!data || data.length === 0) {
        Swal.fire({
          icon: 'info',
          title: 'Nenhuma espécie remota',
          text: 'A tabela de espécies no Supabase está vazia no momento.',
          customClass: { popup: 'rounded-3xl' }
        });
        return;
      }

      const res = await window.electronAPI.syncEspecies(data);

      if (res.success) {
        Swal.fire({
          icon: 'success',
          title: 'Espécies Sincronizadas!',
          html: `
            <div style="text-align: left; font-size: 0.875rem; color: #475569; display: flex; flex-direction: column; gap: 10px; padding: 4px 12px;">
              <p>O catálogo local foi atualizado com sucesso a partir da nuvem.</p>
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 6px;">
                <div style="display: flex; justify-content: space-between; font-size: 0.75rem;">
                  <span style="color: #64748b;">Novas espécies adicionadas:</span>
                  <span style="font-weight: 800; color: #059669;">${res.inserted ?? 0}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.75rem;">
                  <span style="color: #64748b;">Espécies atualizadas:</span>
                  <span style="font-weight: 800; color: #2563eb;">${res.updated ?? 0}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.75rem;">
                  <span style="color: #64748b;">Total no catálogo local:</span>
                  <span style="font-weight: 800; color: #7c3aed;">${res.total ?? 0}</span>
                </div>
              </div>
            </div>
          `,
          confirmButtonColor: '#059669',
          customClass: {
            popup: 'rounded-3xl p-6 font-sans border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950',
            title: 'text-xl font-black text-slate-800 dark:text-white tracking-tight',
            confirmButton: 'rounded-xl font-bold px-6 py-3 shadow-md text-sm cursor-pointer'
          }
        });
        carregarDados();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Erro na Sincronização Local',
          text: res.error || 'Não foi possível salvar as espécies no banco local.',
          customClass: { popup: 'rounded-3xl' }
        });
      }
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Erro de Conexão',
        text: err.message || 'Verifique sua conexão com a internet para sincronizar com o Supabase.',
        customClass: { popup: 'rounded-3xl' }
      });
    } finally {
      setSyncingEspecies(false);
    }
  };

  const handleAddHorario = () => {
    if (!novoHorario) return;
    setBackupConfig(prev => {
      const horas = prev.backupHours || [];
      if (!horas.includes(novoHorario)) {
        return { ...prev, backupHours: [...horas, novoHorario].sort() };
      }
      return prev;
    });
  };

  const handleRemoverHorario = (hr: string) => {
    setBackupConfig(prev => ({
      ...prev,
      backupHours: (prev.backupHours || []).filter((h: string) => h !== hr)
    }));
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.08 } }
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } }
  };

  return (
    <>
      <div className="w-full mx-auto space-y-8 pb-12 page-transition">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="relative bg-white dark:bg-slate-900 p-8 sm:p-10 rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col md:flex-row items-center justify-between gap-8"
        >
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-slate-500/5 blur-[80px] rounded-full pointer-events-none" />
          <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-blue-500/5 blur-[80px] rounded-full pointer-events-none" />
          <div className="relative z-10">
            <h2 className="text-4xl sm:text-5xl font-black text-slate-800 dark:text-slate-100 tracking-tight mb-3">
              Confi<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-700">gurações</span>
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base max-w-lg font-medium leading-relaxed">
              Gerencie backups, configure automações e mantenha seu banco de dados seguro.
            </p>
          </div>
          <div className="relative z-10 bg-slate-100 dark:bg-slate-800 p-5 rounded-3xl text-slate-400">
            <Shield size={40} strokeWidth={1.5} />
          </div>
        </motion.div>

        <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-1 xl:grid-cols-2 gap-6">

          {/* ── BACKUP MANUAL ── */}
          <motion.div variants={itemVariants} className="glass-card p-8 flex flex-col gap-6">
            <div className="flex items-center gap-4">
              <div className="bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 p-3.5 rounded-2xl">
                <HardDriveDownload size={26} strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight">Backup Manual</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-0.5">Salve uma cópia do banco agora</p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl p-5 space-y-3 border border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-2">
                  <Clock size={14} /> Último backup manual
                </span>
                <span className="font-bold text-slate-700 dark:text-slate-200">{formatDate(backupConfig.lastManualBackup)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-2">
                  <Clock size={14} /> Último backup automático
                </span>
                <span className="font-bold text-slate-700 dark:text-slate-200">{formatDate(backupConfig.lastAutoBackup)}</span>
              </div>
            </div>

            <button
              onClick={handleBackupManual}
              disabled={backupLoading}
              className="w-full bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-slate-200 text-white dark:text-slate-900 px-6 py-4 rounded-2xl font-bold shadow-xl shadow-slate-900/20 dark:shadow-none transition-all flex items-center justify-center gap-3 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              {backupLoading ? (
                <><RefreshCw size={20} className="animate-spin" /> Salvando...</>
              ) : (
                <><HardDriveDownload size={20} strokeWidth={2.5} /> Fazer Backup Agora</>
              )}
            </button>
          </motion.div>

          {/* ── RESTAURAR BACKUP ── */}
          <motion.div variants={itemVariants} className="glass-card p-8 flex flex-col gap-6">
            <div className="flex items-center gap-4">
              <div className="bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 p-3.5 rounded-2xl">
                <RotateCcw size={26} strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight">Restaurar Backup</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-0.5">Importe um banco salvo anteriormente</p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl p-5 space-y-3 border border-slate-100 dark:border-slate-800 flex-1 flex flex-col justify-center">
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                Carregue um arquivo <code className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs font-mono font-bold text-slate-700 dark:text-slate-300">.sqlite</code> ou <code className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs font-mono font-bold text-slate-700 dark:text-slate-300">.db</code> para restabelecer os romaneios e cadastros.
              </p>
              <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/30 rounded-xl p-2.5 text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
                <CheckCircle2 size={15} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>Backup preventivo automático antes de aplicar.</span>
              </div>
            </div>

            <button
              onClick={handleRestaurarBackup}
              disabled={restoringBackup}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-4 rounded-2xl font-bold shadow-xl shadow-indigo-600/20 transition-all flex items-center justify-center gap-3 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 cursor-pointer"
            >
              {restoringBackup ? (
                <><RefreshCw size={20} className="animate-spin" /> Restaurando...</>
              ) : (
                <><RotateCcw size={20} strokeWidth={2.5} /> Restaurar Backup Agora</>
              )}
            </button>
          </motion.div>

          {/* ── BACKUP AUTOMÁTICO ── */}
          <motion.div variants={itemVariants} className="glass-card p-8 flex flex-col gap-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 p-3.5 rounded-2xl">
                  <RefreshCw size={26} strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight">Backup Automático</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-0.5">Configure backups periódicos</p>
                </div>
              </div>
              <button
                onClick={() => setBackupConfig(prev => ({ ...prev, autoBackupEnabled: !prev.autoBackupEnabled }))}
                className="flex-shrink-0 transition-all hover:scale-105"
                title={backupConfig.autoBackupEnabled ? 'Desativar' : 'Ativar'}
              >
                {backupConfig.autoBackupEnabled
                  ? <ToggleRight size={44} className="text-emerald-500" strokeWidth={1.5} />
                  : <ToggleLeft size={44} className="text-slate-300" strokeWidth={1.5} />
                }
              </button>
            </div>

            <AnimatePresence>
              {backupConfig.autoBackupEnabled && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }} className="space-y-4 overflow-hidden"
                >
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-405 uppercase tracking-widest mb-2">Frequência (Padrão)</label>
                      <select
                        value={backupConfig.frequency || 'diario'}
                        onChange={e => setBackupConfig(prev => ({ ...prev, frequency: e.target.value }))}
                        className="glass-input w-full px-4 py-3 text-slate-700 dark:text-slate-200 font-semibold text-sm"
                      >
                        <option value="diario" className="dark:bg-slate-900 dark:text-slate-200">Diário</option>
                        <option value="semanal" className="dark:bg-slate-900 dark:text-slate-200">Semanal</option>
                        <option value="quinzenal" className="dark:bg-slate-900 dark:text-slate-200">Quinzenal</option>
                        <option value="mensal" className="dark:bg-slate-900 dark:text-slate-200">Mensal</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-405 uppercase tracking-widest mb-2">Horários Específicos</label>
                      <div className="flex gap-2">
                        <input
                          type="time"
                          value={novoHorario}
                          onChange={e => setNovoHorario(e.target.value)}
                          className="glass-input flex-1 px-3 py-3 text-slate-700 dark:text-slate-200 font-bold text-sm"
                        />
                        <button
                          onClick={handleAddHorario}
                          className="bg-emerald-100 dark:bg-emerald-950 hover:bg-emerald-200 dark:hover:bg-emerald-900 text-emerald-700 dark:text-emerald-400 px-4 py-3 rounded-xl font-black text-sm transition-all shadow-sm"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>

                  {(backupConfig.backupHours && backupConfig.backupHours.length > 0) && (
                    <div className="flex flex-wrap gap-2 mt-1 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-2xl">
                      {backupConfig.backupHours.map(hr => (
                        <div key={hr} className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-lg shadow-sm">
                          <Clock size={12} className="text-emerald-500" />
                          <span className="text-xs font-black text-slate-700 dark:text-slate-200">{hr}</span>
                          <button onClick={() => handleRemoverHorario(hr)} className="ml-1 text-slate-300 dark:text-slate-600 hover:text-red-500 transition-colors">
                            <X size={14} strokeWidth={3} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-405 uppercase tracking-widest mb-2">Pasta de Destino</label>
                    <div className="flex gap-2">
                      <input
                        readOnly
                        value={backupConfig.backupFolder || ''}
                        placeholder="Nenhuma pasta selecionada"
                        className="glass-input flex-1 px-4 py-3 text-slate-600 dark:text-slate-400 font-medium text-sm truncate cursor-default"
                      />
                      <button
                        onClick={handleSelecionarPasta}
                        className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-355 px-4 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2 shrink-0 border dark:border-slate-800"
                      >
                        <FolderOpen size={18} /> Selecionar
                      </button>
                    </div>
                  </div>

                  {backupConfig.backupFolder && (
                    <button
                      onClick={handleAbrirPasta}
                      className="text-sm text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 font-semibold flex items-center gap-2 transition-colors"
                    >
                      <FolderOpen size={16} /> Abrir pasta de backups
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <button
              onClick={handleSalvarConfig}
              disabled={savingConfig}
              className="mt-auto w-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 px-6 py-4 rounded-2xl font-bold shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-3 hover:-translate-y-0.5 disabled:opacity-60"
            >
              {savingConfig ? <><RefreshCw size={18} className="animate-spin" /> Salvando...</> : <><Save size={18} strokeWidth={2.5} /> Salvar Configuração</>}
            </button>
          </motion.div>

          {/* ── INFORMAÇÕES DO BANCO ── */}
          <motion.div variants={itemVariants} className="glass-card p-8 flex flex-col gap-6">
            <div className="flex items-center gap-4">
              <div className="bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 p-3.5 rounded-2xl">
                <Database size={26} strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight">Banco de Dados</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-0.5">Informações e localização</p>
              </div>
            </div>

            {loadingInfo ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-8 h-8 border-4 border-slate-200 dark:border-slate-800 border-t-slate-600 rounded-full animate-spin" />
              </div>
            ) : dbInfo ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-blue-50 dark:bg-blue-950/20 rounded-2xl p-4 text-center border border-blue-100/50 dark:border-blue-900/30">
                    <span className="block text-3xl font-black text-blue-700 dark:text-blue-400">{dbInfo.romaneiosCount}</span>
                    <span className="text-[10px] font-bold text-blue-500 dark:text-blue-500/80 uppercase tracking-wider">Romaneios</span>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl p-4 text-center border border-emerald-100/50 dark:border-emerald-900/30">
                    <span className="block text-3xl font-black text-emerald-700 dark:text-emerald-440">{dbInfo.especiesCount}</span>
                    <span className="text-[10px] font-bold text-emerald-500 dark:text-emerald-500/80 uppercase tracking-wider">Espécies</span>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-950/20 rounded-2xl p-4 text-center border border-purple-100/50 dark:border-purple-900/30">
                    <span className="block text-3xl font-black text-purple-700 dark:text-purple-400">{dbInfo.pacotesCount}</span>
                    <span className="text-[10px] font-bold text-purple-500 dark:text-purple-500/80 uppercase tracking-wider">Pacotes</span>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
                  <span className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Tamanho do Arquivo</span>
                  <span className="font-black text-slate-700 dark:text-slate-200 text-lg">{formatBytes(dbInfo.sizeBytes)}</span>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
                  <span className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Localização</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-600 dark:text-slate-400 break-all flex-1 leading-relaxed">{dbInfo.path}</span>
                    <button
                      onClick={handleCopiarCaminho}
                      className="shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-emerald-600 p-2 rounded-lg transition-all hover:border-emerald-300 dark:hover:border-emerald-700"
                      title="Copiar caminho"
                    >
                      {copiedPath ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-10 text-slate-400 font-medium">
                Não foi possível carregar as informações.
              </div>
            )}

            <button
              onClick={carregarDados}
              className="text-sm text-slate-400 hover:text-slate-600 font-semibold flex items-center gap-2 self-center transition-colors"
            >
              <RefreshCw size={14} /> Atualizar dados
            </button>
          </motion.div>

          {/* ── ZONA DE PERIGO ── */}
          <motion.div variants={itemVariants} className="glass-card p-8 flex flex-col gap-6 border border-red-150 dark:border-red-950/80">
            <div className="flex items-center gap-4">
              <div className="bg-red-50 dark:bg-red-950/30 text-red-500 dark:text-red-450 p-3.5 rounded-2xl">
                <AlertTriangle size={26} strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800 dark:text-slate-105 tracking-tight">Zona de Perigo</h3>
                <p className="text-sm text-red-400 dark:text-red-450 font-semibold mt-0.5">Ações irreversíveis</p>
              </div>
            </div>

            <div className="bg-red-50/70 dark:bg-red-950/20 border border-red-200/60 dark:border-red-900/40 rounded-2xl p-5 space-y-3">
              <h4 className="font-black text-slate-800 dark:text-slate-105 text-base flex items-center gap-2">
                <Trash2 size={18} className="text-red-500" /> Resetar Banco de Romaneios
              </h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                Esta ação irá <strong>excluir permanentemente</strong> todos os romaneios, pacotes, itens e clientes cadastrados.
              </p>
              <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/30 rounded-xl p-3">
                <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-450 shrink-0" />
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">As espécies de madeira serão mantidas intactas.</span>
              </div>
              <div className="flex items-center gap-2 bg-red-100/60 dark:bg-red-950/30 border border-red-200/60 dark:border-red-900/30 rounded-xl p-3">
                <XCircle size={16} className="text-red-500 shrink-0" />
                <span className="text-xs font-bold text-red-600 dark:text-red-455">Esta ação não pode ser desfeita. Faça um backup antes.</span>
              </div>
            </div>

            <button
              onClick={() => setResetModalAberto(true)}
              className="w-full bg-white dark:bg-slate-900 hover:bg-red-50 dark:hover:bg-red-955/20 text-red-600 dark:text-red-400 border-2 border-red-200 dark:border-red-900/60 hover:border-red-300 dark:hover:border-red-750 px-6 py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-3 hover:-translate-y-0.5 shadow-sm hover:shadow-md hover:shadow-red-500/10"
            >
              <Trash2 size={20} strokeWidth={2.5} /> Resetar Banco de Dados
            </button>
          </motion.div>

          {/* ── ATUALIZAÇÕES DO SISTEMA ── */}
          <motion.div variants={itemVariants} className="glass-card p-8 flex flex-col gap-6">
            <div className="flex items-center gap-4">
              <div className="bg-fuchsia-50 dark:bg-fuchsia-950/30 text-fuchsia-600 dark:text-fuchsia-400 p-3.5 rounded-2xl">
                <ArrowUpCircle size={26} strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight">Atualizações do Sistema</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-0.5">Versão instalada: v{appVersion}</p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl p-5 space-y-4 border border-slate-100 dark:border-slate-800 min-h-[140px] flex flex-col justify-center">
              {!updateChecking && !updateAvailable && !updateNotAvailable && !updateError && !checkingError && !updateDownloaded && (
                <div className="text-center py-4">
                  <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Verifique se existem atualizações disponíveis para obter novos recursos e correções.</p>
                </div>
              )}

              {updateChecking && (
                <div className="flex flex-col items-center gap-3 py-4">
                  <RefreshCw size={24} className="animate-spin text-fuchsia-500" />
                  <span className="text-sm font-bold text-slate-600 dark:text-slate-350">Buscando atualizações no servidor...</span>
                </div>
              )}

              {updateAvailable && !downloadProgress && !updateDownloaded && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-fuchsia-600 dark:text-fuchsia-400">
                    <CheckCircle2 size={18} />
                    <span className="text-sm font-black">Nova versão {updateAvailable.version} disponível!</span>
                  </div>
                  {updateAvailable.releaseNotes && (
                    <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-3 max-h-24 overflow-y-auto text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-semibold">
                      <span className="font-bold block mb-1">Notas de versão:</span>
                      <div dangerouslySetInnerHTML={{ __html: updateAvailable.releaseNotes }} />
                    </div>
                  )}
                  <button
                    onClick={handleDownloadUpdate}
                    className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Download size={14} strokeWidth={2.5} /> Baixar Atualização
                  </button>
                </div>
              )}

              {downloadProgress && !updateDownloaded && (
                <div className="space-y-3">
                  <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-350">
                    <span>Baixando atualização...</span>
                    <span>{Math.round(downloadProgress.percent)}%</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-fuchsia-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${downloadProgress.percent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400 font-semibold">
                    <span>Transferido: {formatBytes(downloadProgress.transferred)} de {formatBytes(downloadProgress.total)}</span>
                    <span>{(downloadProgress.bytesPerSecond / 1024 / 1024).toFixed(2)} MB/s</span>
                  </div>
                </div>
              )}

              {updateDownloaded && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 size={18} />
                    <span className="text-sm font-black">Atualização baixada com sucesso!</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">O aplicativo precisa ser reiniciado para aplicar a nova versão.</p>
                  <button
                    onClick={handleInstallUpdate}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 px-4 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <RefreshCw size={14} className="animate-spin-slow" /> Reiniciar e Instalar
                  </button>
                </div>
              )}

              {updateNotAvailable && (
                <div className="flex flex-col items-center gap-2 py-4">
                  <CheckCircle2 size={24} className="text-emerald-500" />
                  <span className="text-sm font-black text-slate-700 dark:text-slate-200">Você já está usando a versão mais recente!</span>
                  <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Última checagem: {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              )}

              {(updateError || checkingError) && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-red-500">
                    <AlertTriangle size={18} />
                    <span className="text-sm font-black">Falha na atualização</span>
                  </div>
                  <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-xl p-3 font-mono break-all max-h-24 overflow-y-auto">
                    {updateError || checkingError}
                  </p>
                </div>
              )}
            </div>

            {!updateChecking && !downloadProgress && !updateDownloaded && (
              <button
                onClick={handleCheckForUpdates}
                className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 text-white px-6 py-4 rounded-2xl font-bold shadow-xl shadow-fuchsia-600/10 transition-all flex items-center justify-center gap-3 hover:-translate-y-0.5 cursor-pointer"
              >
                <RefreshCw size={18} strokeWidth={2.5} /> Verificar Atualizações
              </button>
            )}
          </motion.div>

          {/* ── GERENCIAMENTO DE ESPÉCIES ── */}
          <motion.div variants={itemVariants} className="glass-card p-8 flex flex-col gap-6 xl:col-span-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-450 p-3.5 rounded-2xl">
                  <Database size={26} strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight">Catálogo de Espécies de Madeira</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-0.5">Sincronizado com o Supabase (Gerenciado pelo Master)</p>
                </div>
              </div>
              <button
                onClick={handleSincronizarEspecies}
                disabled={syncingEspecies}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 px-6 py-3.5 rounded-2xl font-black text-sm transition-all flex items-center gap-2 shadow-md cursor-pointer self-start sm:self-auto disabled:opacity-60 disabled:cursor-not-allowed hover:-translate-y-0.5"
              >
                <RefreshCw size={18} className={syncingEspecies ? 'animate-spin' : ''} strokeWidth={2.5} />
                {syncingEspecies ? 'Sincronizando...' : 'Sincronizar Espécies'}
              </button>
            </div>

            <div className="flex items-center gap-3 bg-emerald-50/80 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/40 rounded-2xl p-4 text-xs font-semibold text-emerald-800 dark:text-emerald-300 leading-relaxed">
              <CheckCircle2 size={20} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>
                <strong>Gestão Centralizada:</strong> O catálogo de espécies é administrado exclusivamente na nuvem pelo usuário Master. Clique em <strong>Sincronizar Espécies</strong> para carregar novos cadastros e atualizações para este computador.
              </span>
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="Buscar por espécie..."
                value={buscaEspecie}
                onChange={e => setBuscaEspecie(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-semibold focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-400 outline-none transition-all shadow-sm placeholder:text-slate-400 dark:text-slate-200"
              />
              <Search className="absolute left-4 top-4 text-slate-400" size={18} strokeWidth={2.5} />
            </div>

            <div className="max-h-80 overflow-y-auto border border-slate-150 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 overflow-hidden shadow-inner custom-scrollbar">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 uppercase font-black tracking-widest border-b border-slate-200 dark:border-slate-800 text-[9px] sticky top-0 z-10">
                  <tr>
                    <th className="px-5 py-4">Nome Comercial</th>
                    <th className="px-5 py-4">Nome Científico</th>
                    <th className="px-5 py-4 text-center w-36">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                  {especies.filter(e => e.nome.toLowerCase().includes(buscaEspecie.toLowerCase())).length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-5 py-8 text-center text-slate-400 italic">
                        Nenhuma espécie encontrada.
                      </td>
                    </tr>
                  ) : (
                    especies
                      .filter(e => e.nome.toLowerCase().includes(buscaEspecie.toLowerCase()))
                      .map((esp) => (
                        <tr key={esp.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="px-5 py-3.5 font-bold text-slate-800 dark:text-slate-100">{esp.nome}</td>
                          <td className="px-5 py-3.5 italic text-slate-500 dark:text-slate-400">{esp.cientifico || 'Não informado'}</td>
                          <td className="px-5 py-3.5 text-center">
                            <span className="inline-flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/40 px-3 py-1 rounded-full text-[10px] font-bold">
                              <CheckCircle2 size={11} /> Sincronizada
                            </span>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>

        </motion.div>
      </div>

      {/* ── MODAL DE CONFIRMAÇÃO DE RESET ── */}
      <AnimatePresence>
        {resetModalAberto && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-md"
              onClick={() => !resetando && setResetModalAberto(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 24 }}
              transition={{ type: 'spring', damping: 26, stiffness: 300 }}
              className="relative z-10 bg-white rounded-[2rem] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.3)] border border-slate-100 w-full max-w-md overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Top accent */}
              <div className="h-1.5 w-full bg-gradient-to-r from-red-400 via-red-500 to-red-600" />

              <div className="p-8">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="bg-red-100 text-red-600 p-3 rounded-2xl">
                      <AlertTriangle size={28} strokeWidth={2} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-slate-800 tracking-tight">Confirmar Reset</h3>
                      <p className="text-sm text-red-500 font-semibold mt-0.5">Ação irreversível</p>
                    </div>
                  </div>
                  <button
                    onClick={() => !resetando && setResetModalAberto(false)}
                    className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 hover:bg-slate-100 rounded-full"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4 mb-8">
                  <p className="text-slate-600 font-medium leading-relaxed text-sm">
                    Você está prestes a <strong className="text-red-600">apagar permanentemente</strong> todos os romaneios, pacotes, itens e clientes do sistema.
                  </p>

                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2.5">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    <span className="text-xs font-bold text-emerald-700">As espécies de madeira serão mantidas.</span>
                  </div>

                  <div className="pt-2">
                    <label className="block text-xs font-black text-slate-600 uppercase tracking-[0.15em] mb-3">
                      Digite <span className="text-red-600 font-black">APAGAR</span> para confirmar:
                    </label>
                    <input
                      ref={resetInputRef}
                      type="text"
                      value={resetTexto}
                      onChange={e => setResetTexto(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && resetTexto === 'APAGAR') handleResetarBanco(); }}
                      placeholder="Digite APAGAR"
                      disabled={resetando}
                      className={`w-full px-4 py-3.5 rounded-xl border-2 font-black text-lg tracking-widest text-center outline-none transition-all duration-200 ${
                        resetTexto === 'APAGAR'
                          ? 'border-red-400 bg-red-50 text-red-700 focus:ring-4 focus:ring-red-500/10'
                          : 'border-slate-200 bg-slate-50 text-slate-800 focus:border-slate-400 focus:ring-4 focus:ring-slate-500/10'
                      }`}
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => !resetando && setResetModalAberto(false)}
                    disabled={resetando}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-6 py-3.5 rounded-2xl font-bold transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleResetarBanco}
                    disabled={resetTexto !== 'APAGAR' || resetando}
                    className={`flex-1 px-6 py-3.5 rounded-2xl font-black transition-all flex items-center justify-center gap-2 ${
                      resetTexto === 'APAGAR' && !resetando
                        ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/25 hover:-translate-y-0.5'
                        : 'bg-red-100 text-red-300 cursor-not-allowed'
                    }`}
                  >
                    {resetando ? (
                      <><RefreshCw size={18} className="animate-spin" /> Apagando...</>
                    ) : (
                      <><Trash2 size={18} /> Confirmar Reset</>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
