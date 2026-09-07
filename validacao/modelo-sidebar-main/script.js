/**
 * ==========================================================================
 * SCRIPT DE CONTROLE: SIDEBAR RETRÁTIL E CHANGER DE VIEWS DINÂMICAS
 * Funcionalidades: Alternância Light/Dark Mode, Sidebar Responsiva, Mini-menu
 * ==========================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
    // Inicialização dos ícones Lucide Icons (se importados no HTML)
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Aplica o tema salvo no localStorage
    iniciarTema();

    // Restaura o estado minimizado da sidebar no desktop
    iniciarSidebar();
});

// Elementos chaves do DOM
const sidebar        = document.getElementById('sidebar');
const iconToggle     = document.getElementById('icon-toggle');
const overlay        = document.getElementById('sidebar-overlay');
const viewTitle      = document.getElementById('view-title');
const BREAKPOINT_MB  = 992; // Pixels limite para definir modo mobile

/**
 * Retorna true se a largura do viewport for igual ou menor ao limite mobile
 */
function isMobileView() {
    return window.innerWidth <= BREAKPOINT_MB;
}

/**
 * Alterna a minimização no desktop ou abertura da gaveta mobile
 */
function toggleSidebar() {
    if (isMobileView()) {
        toggleSidebarMobile();
    } else {
        sidebar.classList.toggle('minimized');
        const isMinimized = sidebar.classList.contains('minimized');
        
        // Ajusta o ícone de seta do botão de minimizar
        if (iconToggle) {
            iconToggle.setAttribute('data-lucide', isMinimized ? 'chevron-right' : 'chevron-left');
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
        
        // Salva a preferência
        localStorage.setItem('sidebarMinimized', isMinimized ? '1' : '0');
    }
}

/**
 * Abre / Fecha a sidebar em formato slide-drawer no celular
 */
function toggleSidebarMobile() {
    const isOpen = sidebar.classList.contains('mobile-open');
    if (isOpen) {
        fecharSidebarMobile();
    } else {
        sidebar.classList.add('mobile-open');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden'; // Evita scroll do fundo
    }
}

/**
 * Fecha a sidebar e remove o overlay cinza escuro
 */
function fecharSidebarMobile() {
    sidebar.classList.remove('mobile-open');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
}

/**
 * Sistema simples de roteamento / troca de abas (Views)
 * @param {string} viewId ID da tela para ativação (ex: 'home')
 * @param {HTMLElement} element O link <li> que disparou a ação
 */
function carregarTela(viewId, element) {
    // 1. Remove classe ativa dos itens anteriores na sidebar
    document.querySelectorAll('#sidebar .components li').forEach(item => {
        item.classList.remove('active');
    });

    // 2. Adiciona a classe active no item clicado
    if (element) {
        element.classList.add('active');
    }

    // 3. Alterna a visualização das views correspondentes
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });

    const targetView = document.getElementById(`v-${viewId}`);
    if (targetView) {
        targetView.classList.add('active');
        
        // Retorna o scroll da main para o topo
        const dynamicContent = document.getElementById('dynamic-content');
        if (dynamicContent) {
            dynamicContent.scrollTop = 0;
        }
    }

    // 4. Altera o título da página no Header do main
    if (element && viewTitle) {
        const textSpan = element.querySelector('.nav-text');
        if (textSpan) {
            viewTitle.textContent = textSpan.textContent;
        }
    }

    // 5. Fecha a sidebar mobile após a escolha do link
    if (isMobileView()) {
        fecharSidebarMobile();
    }
}

// Event listener para fechar a sidebar mobile caso clique no botão de "Sair"
const btnSair = document.querySelector('#sidebar .btn-sair');
if (btnSair) {
    btnSair.addEventListener('click', () => {
        if (isMobileView()) {
            fecharSidebarMobile();
        }
    });
}

// Gerencia o redimensionamento dinâmico de tela
window.addEventListener('resize', () => {
    if (!isMobileView()) {
        // Se voltou ao desktop, limpa os estados exclusivos de mobile
        sidebar.classList.remove('mobile-open');
        overlay.classList.remove('active');
        document.body.style.overflow = '';

        // Restaura a preferência salva do desktop
        if (localStorage.getItem('sidebarMinimized') === '1') {
            sidebar.classList.add('minimized');
        } else {
            sidebar.classList.remove('minimized');
        }
    }
});

/**
 * Inicialização das configurações salvas no desktop
 */
function iniciarSidebar() {
    if (!isMobileView() && localStorage.getItem('sidebarMinimized') === '1') {
        sidebar.classList.add('minimized');
        if (iconToggle) {
            iconToggle.setAttribute('data-lucide', 'chevron-right');
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }
}

/* ==========================================================================
   LÓGICA E CONFIGURAÇÃO DO MODO ESCURO (DARK MODE)
   ========================================================================== */
const toggleDarkMode = document.querySelector('.dark-mode-toggle');

if (toggleDarkMode) {
    toggleDarkMode.addEventListener('click', () => {
        const isDark = document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        updateToggleUI(isDark);
    });
}

function iniciarTema() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        updateToggleUI(true);
    } else {
        document.body.classList.remove('dark-mode');
        updateToggleUI(false);
    }
}

function updateToggleUI(isDark) {
    const icon = document.querySelector('.dark-mode-toggle i');
    const span = document.querySelector('.dark-mode-toggle span');

    if (isDark) {
        if (icon) icon.setAttribute('data-lucide', 'sun');
        if (span) span.textContent = 'Modo Claro';
    } else {
        if (icon) icon.setAttribute('data-lucide', 'moon');
        if (span) span.textContent = 'Modo Escuro';
    }

    if (window.lucide) {
        lucide.createIcons();
    }
}
