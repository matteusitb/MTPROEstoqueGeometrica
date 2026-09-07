import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FilePlus2, Settings, ChevronLeft, ChevronRight,
  Zap, LogOut, Sun, Moon
} from 'lucide-react';
import { useRomaneioStore } from '../store/useRomaneioStore';
import { useAuthStore } from '../store/useAuthStore';

interface SidebarProps {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

export default function Sidebar({ mobileOpen, setMobileOpen }: SidebarProps) {
  const location = useLocation();
  const { sidebarCollapsed, toggleSidebar } = useRomaneioStore();
  const logout = useAuthStore((state) => state.logout);
  const isOfflineMode = useAuthStore((state) => state.isOfflineMode);
  const navigate = useNavigate();

  // Dark/Light Mode state
  const [isDark, setIsDark] = useState(() => {
    return localStorage.getItem('theme') === 'dark' || document.body.classList.contains('dark-mode');
  });

  useEffect(() => {
    // Initial theme check
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      document.body.classList.add('dark-mode');
      setIsDark(true);
    } else {
      document.body.classList.remove('dark-mode');
      setIsDark(false);
    }
  }, []);

  const handleToggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.body.classList.add('dark-mode');
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.classList.remove('dark-mode');
      localStorage.setItem('theme', 'light');
    }
  };

  const handleNovoRomaneioClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setMobileOpen(false);
    navigate('/novo');
  };



  const handleLogoClick = (e: React.MouseEvent) => {
    if (sidebarCollapsed) {
      e.preventDefault();
      toggleSidebar();
    } else {
      setMobileOpen(false);
    }
  };

  return (
    <nav id="sidebar" className={`${sidebarCollapsed ? 'minimized' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        {/* HEADER DA SIDEBAR */}
        <div className="sidebar-header">
          <Link to="/" className="logo-area" onClick={handleLogoClick}>
            <div className="logo-icon relative">
              <Zap />
              {isOfflineMode && (
                <span className="absolute -top-0.5 -right-0.5 block h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-950 bg-amber-500 animate-pulse" title="Você está operando em modo offline" />
              )}
            </div>
            <span className="nav-text flex flex-col items-start leading-tight">
              <span>MT <strong>PRO</strong></span>
              {isOfflineMode && (
                <span className="text-[9px] uppercase tracking-wider text-amber-500 font-extrabold bg-amber-500/10 px-1 py-0.5 rounded border border-amber-500/25 mt-0.5 scale-90 origin-left">
                  Offline
                </span>
              )}
            </span>
          </Link>
          <button className="btn-toggle-sidebar" onClick={toggleSidebar} title={sidebarCollapsed ? "Expandir Menu" : "Recolher Menu"}>
            {sidebarCollapsed ? <ChevronRight id="icon-toggle" /> : <ChevronLeft id="icon-toggle" />}
          </button>
        </div>

        {/* COMPONENTES DE MENU */}
        <ul className="components">
          {/* GRUPO GESTÃO */}
          <li className="menu-header">
            <span className="nav-text">Gestão</span>
          </li>
          
          <li className={location.pathname === '/' ? 'active' : ''} data-tooltip="Dashboard" onClick={() => setMobileOpen(false)}>
            <Link to="/">
              <LayoutDashboard />
              <span className="nav-text">Dashboard</span>
            </Link>
          </li>
          
          <li data-tooltip="Novo Romaneio">
            <button onClick={(e) => { setMobileOpen(false); handleNovoRomaneioClick(e); }}>
              <FilePlus2 />
              <span className="nav-text">Novo Romaneio</span>
            </button>
          </li>

          {/* GRUPO OPÇÕES */}
          <li className="menu-header">
            <span className="nav-text">Opções</span>
          </li>

          
          <li className={location.pathname === '/configuracoes' ? 'active' : ''} data-tooltip="Configurações" onClick={() => setMobileOpen(false)}>
            <Link to="/configuracoes">
              <Settings />
              <span className="nav-text">Configurações</span>
            </Link>
          </li>
        </ul>

        {/* RODAPÉ DA SIDEBAR */}
        <div className="sidebar-footer">
          <div className="dark-mode-toggle" onClick={handleToggleTheme} data-tooltip={isDark ? "Modo Claro" : "Modo Escuro"}>
            {isDark ? <Sun /> : <Moon />}
            <span className="nav-text">{isDark ? 'Modo Claro' : 'Modo Escuro'}</span>
          </div>
          <button className="btn-sair" onClick={logout} data-tooltip="Sair do Sistema">
            <LogOut />
            <span className="nav-text">Sair</span>
          </button>
        </div>
      </nav>
  );
}
