import { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Home from './screens/Home';
import NovoRomaneio from './screens/NovoRomaneio';
import EditarRomaneio from './screens/EditarRomaneio';
import VisualizarRomaneio from './screens/VisualizarRomaneio';
import Configuracoes from './screens/Configuracoes';
import Login from './screens/Login';
import Ativacao from './screens/Ativacao';
import { useAuthStore } from './store/useAuthStore';
import { Menu, User, Loader2 } from 'lucide-react';

function MainLayout() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 992) {
        setMobileOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);



  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/') return 'Dashboard';
    if (path === '/novo') return 'Novo Romaneio';
    if (path.startsWith('/editar/')) return 'Editar Romaneio';
    if (path.startsWith('/visualizar/')) return 'Visualizar Romaneio';
    if (path === '/configuracoes') return 'Configurações';
    return 'MT PRO - Madeira Serrada';
  };

  return (
    <div className="wrapper">
      {/* SIDEBAR RESPONSIVA */}
      <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

      {/* OVERLAY ESCURO (Bloqueador de fundo no Mobile) */}
      <div 
        className={`sidebar-overlay ${mobileOpen ? 'active' : ''}`} 
        id="sidebar-overlay" 
        onClick={() => setMobileOpen(false)}
      />

      {/* ÁREA DE CONTEÚDO PRINCIPAL (MAIN CONTENT) */}
      <div id="content">
        {/* HEADER DA PÁGINA (Barra Superior) */}
        <header className="main-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            {/* Botão Hamburger (Apenas Mobile) */}
            <button className="btn-hamburger" id="btn-hamburger" onClick={() => setMobileOpen(true)} title="Abrir Menu">
              <Menu />
            </button>
            <h2 id="view-title">{getPageTitle()}</h2>
          </div>

          {/* Área Direita do Header (Informações de Perfil / Status) */}
          <div className="header-right">
            <div className="user-info">
              <User />
              <span>{user?.email || 'Administrador'}</span>
            </div>
          </div>
        </header>

        {/* CONTAINER ONDE AS VIEWS DINÂMICAS SERÃO CARREGADAS */}
        <main id="dynamic-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/novo" element={<NovoRomaneio />} />
            <Route path="/editar/:id" element={<EditarRomaneio />} />
            <Route path="/visualizar/:id" element={<VisualizarRomaneio />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [isActivated, setIsActivated] = useState(false);
  const [activationMotivo, setActivationMotivo] = useState<'unactivated' | 'expired' | 'fraud' | 'ok'>('unactivated');
  const [checkingActivation, setCheckingActivation] = useState(true);

  // Aplica o tema salvo no localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, []);

  const checkActivation = async () => {
    try {
      if (window.electronAPI && typeof window.electronAPI.checkActivationStatus === 'function') {
        const res = await window.electronAPI.checkActivationStatus();
        setIsActivated(res.ativado);
        setActivationMotivo(res.motivo);
      } else {
        setIsActivated(true);
        setActivationMotivo('ok');
      }
    } catch (e) {
      console.error('Erro ao verificar licença:', e);
      setIsActivated(true);
      setActivationMotivo('ok');
    } finally {
      setCheckingActivation(false);
    }
  };

  useEffect(() => {
    checkActivation();
  }, []);

  if (checkingActivation) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-955 font-sans">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mb-4" />
        <span className="text-sm font-bold text-slate-500 dark:text-slate-400">Verificando licença de uso...</span>
      </div>
    );
  }

  if (!isActivated) {
    return <Ativacao onActivated={checkActivation} motivo={activationMotivo} />;
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <HashRouter>
      <MainLayout />
    </HashRouter>
  );
}

export default App;
