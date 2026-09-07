// ============================================================
// ToraControl - Gestão de Estoque de Toras Geométrica
// ============================================================

const SUPABASE_AUTH_URL = 'https://hmuxkqtgyyglafqlqggv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_G--VZElf06QOrBbxIFKvhA_GE1eOJwI';

let usuarioLogado = null;
let currentHardwareId = '';

// ============================================================
// FORMATADOR DE DATAS PADRÃO BRASIL (DD/MM/AAAA)
// ============================================================
function formatarDataBR(dataStr, incluirHora = false) {
    if (!dataStr) return '-';
    const s = dataStr.toString().trim();
    if (!s || s === 'N/A' || s === 'null' || s === 'undefined' || s === '-') return '-';

    // Se já estiver no formato DD/MM/AAAA
    if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
        if (!incluirHora) return s.split(' ')[0];
        return s;
    }

    // Se contiver traço de separação YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        const partesEspaco = s.split(' ');
        const parteData = partesEspaco[0].split('T')[0];
        const parteHora = partesEspaco[1] || (s.includes('T') ? s.split('T')[1].split('.')[0] : '');

        const [ano, mes, dia] = parteData.split('-');
        if (ano && mes && dia) {
            const dataFmt = `${dia.padStart(2, '0')}/${mes.padStart(2, '0')}/${ano}`;
            if (incluirHora && parteHora) {
                const horaLimpa = parteHora.substring(0, 8);
                return `${dataFmt} ${horaLimpa}`;
            }
            return dataFmt;
        }
    }

    // Fallback com objeto Date
    try {
        const d = new Date(s);
        if (!isNaN(d.getTime())) {
            const dia = String(d.getDate()).padStart(2, '0');
            const mes = String(d.getMonth() + 1).padStart(2, '0');
            const ano = d.getFullYear();
            const dataFmt = `${dia}/${mes}/${ano}`;
            if (incluirHora) {
                const hora = String(d.getHours()).padStart(2, '0');
                const min = String(d.getMinutes()).padStart(2, '0');
                const seg = String(d.getSeconds()).padStart(2, '0');
                return `${dataFmt} ${hora}:${min}:${seg}`;
            }
            return dataFmt;
        }
    } catch (e) {}

    return s;
}

// Gera o hash SHA-256 de uma senha concatenada com um salt
async function hashPassword(password, salt) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + salt);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Copia o Hardware ID com feedback visual
async function copiarHardwareId(elementId, btnElement) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const text = el.innerText.trim();
    if (!text || text.includes('Carregando')) return;

    try {
        await navigator.clipboard.writeText(text);
        if (btnElement) {
            const originalHtml = btnElement.innerHTML;
            btnElement.innerHTML = `<i data-lucide="check" style="width:13px;height:13px;"></i> <span style="color:#10b981; font-weight:bold;">Copiado!</span>`;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            setTimeout(() => {
                btnElement.innerHTML = originalHtml;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }, 2000);
        }
    } catch (e) {
        console.error("Erro ao copiar ID:", e);
    }
}

// Inicializa a camada de autenticação e validação RSA
async function inicializarAutenticacao() {
    try {
        if (window.electronAPI && typeof window.electronAPI.getHardwareId === 'function') {
            currentHardwareId = await window.electronAPI.getHardwareId();
        } else if (window.utils && typeof window.utils.getHardwareId === 'function') {
            currentHardwareId = await window.utils.getHardwareId();
        } else {
            currentHardwareId = 'development-machine-id';
        }

        const elHwAtiv = document.getElementById('display-hwid-ativacao');
        const elHwLogin = document.getElementById('display-hwid-login');
        if (elHwAtiv) elHwAtiv.innerText = currentHardwareId;
        if (elHwLogin) elHwLogin.innerText = currentHardwareId;

        atualizarIndicadorRede();
        window.addEventListener('online', atualizarIndicadorRede);
        window.addEventListener('offline', atualizarIndicadorRede);

        let resLicenca = { ativado: false, motivo: 'unactivated' };
        if (window.electronAPI && typeof window.electronAPI.checkActivationStatus === 'function') {
            resLicenca = await window.electronAPI.checkActivationStatus();
        } else if (window.utils && typeof window.utils.checkActivationStatus === 'function') {
            resLicenca = await window.utils.checkActivationStatus();
        }

        const loadingScreen = document.getElementById('auth-screen-loading');
        const ativacaoScreen = document.getElementById('auth-screen-ativacao');
        const loginScreen = document.getElementById('auth-screen-login');
        const blobSec = document.getElementById('auth-blob-secondary');

        if (loadingScreen) loadingScreen.style.display = 'none';

        if (!resLicenca.ativado) {
            if (ativacaoScreen) ativacaoScreen.style.display = 'block';
            if (loginScreen) loginScreen.style.display = 'none';
            if (blobSec) blobSec.classList.add('blob-fuchsia');

            const alertBox = document.getElementById('ativacao-alert-box');
            const alertText = document.getElementById('ativacao-alert-text');
            if (alertBox && alertText) {
                if (resLicenca.motivo === 'expired') {
                    alertText.innerText = 'Sua licença de uso expirou. Envie o ID de hardware acima para renovação.';
                    alertBox.style.display = 'flex';
                } else if (resLicenca.motivo === 'fraud') {
                    alertText.innerText = 'Fraude de relógio detectada. O horário do sistema foi retrocedido. Ajuste a data e hora do seu computador.';
                    alertBox.style.display = 'flex';
                } else {
                    alertBox.style.display = 'none';
                }
            }
        } else {
            if (ativacaoScreen) ativacaoScreen.style.display = 'none';
            if (loginScreen) loginScreen.style.display = 'block';
            if (blobSec) blobSec.classList.remove('blob-fuchsia');
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (e) {
        console.error("Erro na verificação de licença:", e);
    }
}

function atualizarIndicadorRede() {
    const isOnline = navigator.onLine;
    const banner = document.getElementById('login-offline-banner');
    const headerStatus = document.getElementById('header-conn-status');

    if (banner) {
        banner.style.display = isOnline ? 'none' : 'flex';
    }
    if (headerStatus) {
        headerStatus.innerText = isOnline ? 'Sistema Conectado' : 'Modo Offline';
    }
}

async function processarAtivacaoSistema(e) {
    if (e) e.preventDefault();
    const inputChave = document.getElementById('input-chave-ativacao');
    const btnSubmit = document.getElementById('btn-ativar-submit');
    const alertBox = document.getElementById('ativacao-alert-box');
    const alertText = document.getElementById('ativacao-alert-text');

    if (!inputChave || !inputChave.value.trim()) return;
    const chave = inputChave.value.trim();

    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<i data-lucide="refresh-cw" class="animate-spin"></i> <span>Validando Licença...</span>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    try {
        let res = null;
        if (window.electronAPI && typeof window.electronAPI.ativarSistema === 'function') {
            res = await window.electronAPI.ativarSistema(chave);
        } else if (window.utils && typeof window.utils.ativarSistema === 'function') {
            res = await window.utils.ativarSistema(chave);
        }

        if (res && res.success) {
            Swal.fire({
                icon: 'success',
                title: 'Sistema Ativado com Sucesso!',
                text: `Sua licença foi validada e está ativa até ${res.validade}.`,
                confirmButtonColor: '#10b981',
                customClass: { popup: 'rounded-3xl' }
            });

            const ativacaoScreen = document.getElementById('auth-screen-ativacao');
            const loginScreen = document.getElementById('auth-screen-login');
            const blobSec = document.getElementById('auth-blob-secondary');

            if (ativacaoScreen) ativacaoScreen.style.display = 'none';
            if (loginScreen) loginScreen.style.display = 'block';
            if (blobSec) blobSec.classList.remove('blob-fuchsia');
            if (typeof lucide !== 'undefined') lucide.createIcons();
        } else {
            const msg = (res && res.error) ? res.error : 'Chave de ativação inválida ou incompatível com este computador.';
            if (alertBox && alertText) {
                alertText.innerText = msg;
                alertBox.style.display = 'flex';
            }
            Swal.fire({
                icon: 'error',
                title: 'Falha na Ativação',
                text: msg,
                confirmButtonColor: '#ef4444'
            });
        }
    } catch (err) {
        Swal.fire({
            icon: 'error',
            title: 'Erro no Processamento',
            text: err.message || 'Falha de comunicação.',
            confirmButtonColor: '#ef4444'
        });
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = `<i data-lucide="check-circle-2"></i> <span>Ativar Licença</span>`;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }
}

async function processarLoginUsuario(e) {
    if (e) e.preventDefault();
    const emailInput = document.getElementById('login-email');
    const passInput = document.getElementById('login-password');
    const btnSubmit = document.getElementById('btn-login-submit');
    const errBanner = document.getElementById('login-error-banner');
    const errText = document.getElementById('login-error-text');

    if (!emailInput || !passInput) return;
    const email = emailInput.value.trim().toLowerCase();
    const password = passInput.value;

    if (!email || !password) return;

    if (errBanner) errBanner.style.display = 'none';
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<i data-lucide="refresh-cw" class="animate-spin"></i> <span>Autenticando...</span>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    const isOnline = navigator.onLine;

    try {
        if (isOnline) {
            let authResponse = null;
            try {
                const url = `${SUPABASE_AUTH_URL}/auth/v1/token?grant_type=password`;
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': SUPABASE_ANON_KEY
                    },
                    body: JSON.stringify({ email, password })
                });
                authResponse = await resp.json();
            } catch (netErr) {
                console.warn("Falha de rede no Supabase, tentando login offline local...", netErr);
            }

            if (authResponse && authResponse.access_token && authResponse.user) {
                const userId = authResponse.user.id;

                const licResp = await fetch(`${SUPABASE_AUTH_URL}/rest/v1/licencas?id=eq.${userId}&select=*`, {
                    headers: {
                        'apikey': SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${authResponse.access_token}`
                    }
                });

                if (!licResp.ok) {
                    throw new Error('Falha ao verificar autorização da licença no servidor.');
                }

                const licencas = await licResp.json();
                if (!Array.isArray(licencas) || licencas.length === 0) {
                    throw new Error('Nenhuma licença vinculada a esta conta de usuário.');
                }

                const licenca = licencas[0];

                if (licenca.status_licenca !== 'ativa') {
                    throw new Error(`Sua conta está com o status: ${licenca.status_licenca}.`);
                }

                if (licenca.data_validade) {
                    const validade = new Date(licenca.data_validade);
                    const hoje = new Date();
                    validade.setHours(23, 59, 59, 999);
                    hoje.setHours(0, 0, 0, 0);
                    if (validade < hoje) {
                        const dataFmt = new Date(licenca.data_validade).toLocaleDateString('pt-BR');
                        throw new Error(`Sua assinatura expirou em ${dataFmt}.`);
                    }
                }

                if (!licenca.machine_id) {
                    throw new Error('Este computador não está pré-cadastrado para esta conta no painel master.');
                } else if (licenca.machine_id !== currentHardwareId) {
                    throw new Error('Esta conta está vinculada a outro computador físico.');
                }

                const salt = Math.random().toString(36).substring(2) + Date.now().toString(36);
                const senhaHash = await hashPassword(password, salt);

                if (window.electronAPI && typeof window.electronAPI.authSaveLocalLicense === 'function') {
                    await window.electronAPI.authSaveLocalLicense({
                        id: licenca.id,
                        email: email,
                        machine_id: licenca.machine_id,
                        status_licenca: licenca.status_licenca,
                        data_validade: licenca.data_validade || null,
                        senha_hash: senhaHash,
                        salt: salt
                    });
                }

                concluirLogin({
                    id: licenca.id,
                    email: email,
                    machine_id: licenca.machine_id,
                    status_licenca: licenca.status_licenca,
                    data_validade: licenca.data_validade
                }, false);
                return;
            } else if (authResponse && authResponse.error_description) {
                throw new Error(authResponse.error_description === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : authResponse.error_description);
            } else if (authResponse && authResponse.msg) {
                throw new Error(authResponse.msg);
            }
        }

        await tentarLoginOffline(email, password);

    } catch (err) {
        const msg = err.message || 'Erro ao realizar login.';
        if (errBanner && errText) {
            errText.innerText = msg;
            errBanner.style.display = 'flex';
        }
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = `<span>Entrar no Sistema</span> <i data-lucide="arrow-right"></i>`;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }
}

async function tentarLoginOffline(email, password) {
    let res = null;
    if (window.electronAPI && typeof window.electronAPI.authLoginOffline === 'function') {
        res = await window.electronAPI.authLoginOffline(email);
    }

    if (!res || !res.success || !res.user) {
        throw new Error('Sem conexão com a internet. O primeiro acesso deste usuário precisa ser feito online.');
    }

    const localUser = res.user;

    const hashCalculado = await hashPassword(password, localUser.salt);
    if (hashCalculado !== localUser.senha_hash) {
        throw new Error('E-mail ou senha incorretos.');
    }

    if (localUser.status_licenca !== 'ativa') {
        throw new Error(`Esta conta está com o status: ${localUser.status_licenca}.`);
    }

    if (localUser.data_validade) {
        const validade = new Date(localUser.data_validade);
        const hoje = new Date();
        validade.setHours(23, 59, 59, 999);
        hoje.setHours(0, 0, 0, 0);
        if (validade < hoje) {
            const dataFmt = new Date(localUser.data_validade).toLocaleDateString('pt-BR');
            throw new Error(`Sua licença expirou em ${dataFmt}.`);
        }
    }

    if (localUser.machine_id !== currentHardwareId) {
        throw new Error('Esta conta está vinculada a outro computador.');
    }

    if (window.electronAPI && typeof window.electronAPI.authUpdateOfflineLogin === 'function') {
        await window.electronAPI.authUpdateOfflineLogin(localUser.id);
    }

    concluirLogin({
        id: localUser.id,
        email: localUser.email,
        machine_id: localUser.machine_id,
        status_licenca: localUser.status_licenca,
        data_validade: localUser.data_validade
    }, true);
}

function concluirLogin(user, isOffline) {
    usuarioLogado = user;

    const headerUser = document.getElementById('header-user-display');
    const headerStatus = document.getElementById('header-conn-status');

    if (headerUser) {
        headerUser.innerText = user.email || 'Operador de Pátio';
    }
    if (headerStatus) {
        headerStatus.innerText = isOffline ? 'Modo Offline' : 'Sistema Conectado';
    }

    const portal = document.getElementById('auth-portal-overlay');
    if (portal) {
        portal.classList.add('auth-hidden');
    }

    atualizarDashboard();
    sincronizarEspeciesSupabase(true);
    configurarNavegacaoEnter();

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function fazerLogout() {
    usuarioLogado = null;
    const portal = document.getElementById('auth-portal-overlay');
    const passInput = document.getElementById('login-password');
    const errBanner = document.getElementById('login-error-banner');

    if (passInput) passInput.value = '';
    if (errBanner) errBanner.style.display = 'none';

    if (portal) {
        portal.classList.remove('auth-hidden');
    }
}

// Inicializar Ícones e Dados
document.addEventListener('DOMContentLoaded', async () => {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    try {
        await inicializarAutenticacao();
    } catch (e) {
        console.error("Erro na inicialização:", e);
    }
});

// --- NAVEGAÇÃO RÁPIDA COM TECLA ENTER (ROMANEIOS E ENTRADAS) ---
function configurarNavegacaoEnter() {
    // 1. FLUXO: ENTRADAS INDIVIDUAIS DE TORAS (v-entradas)
    const fluxoEntradas = [
        'tora-codigo',
        'tora-especie',
        'tora-lote',
        'tora-romaneio',
        'm1',
        'm2',
        'comprimento',
        'm1-bruto',
        'm2-bruto',
        'comprimento-bruto'
    ];

    fluxoEntradas.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;

        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();

                if (id === 'tora-codigo') {
                    aplicarMascaraNumero(el);
                    const proximo = document.getElementById('tora-especie');
                    if (proximo) proximo.focus();
                } else if (id === 'tora-especie') {
                    const proximo = document.getElementById('tora-lote');
                    if (proximo) proximo.focus();
                } else if (id === 'tora-lote') {
                    const proximo = document.getElementById('m1');
                    if (proximo) proximo.focus();
                } else if (id === 'tora-romaneio') {
                    const proximo = document.getElementById('m1');
                    if (proximo) proximo.focus();
                } else if (id === 'm1') {
                    calcularCubagem();
                    const proximo = document.getElementById('m2');
                    if (proximo) proximo.focus();
                } else if (id === 'm2') {
                    calcularCubagem();
                    const proximo = document.getElementById('comprimento');
                    if (proximo) proximo.focus();
                } else if (id === 'comprimento') {
                    finalizarComprimento(el);
                    calcularCubagem();
                    const m1Bruto = document.getElementById('m1-bruto');
                    if (m1Bruto && !m1Bruto.hasAttribute('readonly')) {
                        m1Bruto.focus();
                    } else {
                        salvarTora();
                    }
                } else if (id === 'm1-bruto') {
                    calcularCubagem();
                    const proximo = document.getElementById('m2-bruto');
                    if (proximo) proximo.focus();
                } else if (id === 'm2-bruto') {
                    calcularCubagem();
                    const proximo = document.getElementById('comprimento-bruto');
                    if (proximo) proximo.focus();
                } else if (id === 'comprimento-bruto') {
                    finalizarComprimento(el);
                    calcularCubagem();
                    salvarTora();
                }
            }
        });
    });

    // 2. FLUXO: SUB-FORMULÁRIO DO ROMANEIO DE ENTRADA (v-romaneios)
    const fluxoRomaneio = [
        'rom-frete-valor',
        'rom-tora-codigo',
        'rom-tora-especie',
        'rom-tora-lote',
        'rom-tora-m1',
        'rom-tora-m2',
        'rom-tora-comprimento',
        'rom-tora-m1-bruto',
        'rom-tora-m2-bruto',
        'rom-tora-comprimento-bruto'
    ];

    fluxoRomaneio.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;

        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();

                if (id === 'rom-frete-valor') {
                    const proximo = document.getElementById('rom-tora-codigo');
                    if (proximo) proximo.focus();
                } else if (id === 'rom-tora-codigo') {
                    aplicarMascaraNumero(el);
                    const proximo = document.getElementById('rom-tora-especie');
                    if (proximo) proximo.focus();
                } else if (id === 'rom-tora-especie') {
                    const proximo = document.getElementById('rom-tora-lote');
                    if (proximo) proximo.focus();
                } else if (id === 'rom-tora-lote') {
                    const proximo = document.getElementById('rom-tora-m1');
                    if (proximo) proximo.focus();
                } else if (id === 'rom-tora-m1') {
                    calcularCubagemSubForm();
                    const proximo = document.getElementById('rom-tora-m2');
                    if (proximo) proximo.focus();
                } else if (id === 'rom-tora-m2') {
                    calcularCubagemSubForm();
                    const proximo = document.getElementById('rom-tora-comprimento');
                    if (proximo) proximo.focus();
                } else if (id === 'rom-tora-comprimento') {
                    finalizarComprimento(el);
                    calcularCubagemSubForm();
                    const m1Bruto = document.getElementById('rom-tora-m1-bruto');
                    if (m1Bruto && !m1Bruto.hasAttribute('readonly')) {
                        m1Bruto.focus();
                    } else {
                        adicionarToraTempList();
                    }
                } else if (id === 'rom-tora-m1-bruto') {
                    calcularCubagemSubForm();
                    const proximo = document.getElementById('rom-tora-m2-bruto');
                    if (proximo) proximo.focus();
                } else if (id === 'rom-tora-m2-bruto') {
                    calcularCubagemSubForm();
                    const proximo = document.getElementById('rom-tora-comprimento-bruto');
                    if (proximo) proximo.focus();
                } else if (id === 'rom-tora-comprimento-bruto') {
                    finalizarComprimento(el);
                    calcularCubagemSubForm();
                    adicionarToraTempList();
                }
            }
        });
    });
}

// --- CONFIGURAÇÃO SWEETALERT (TOAST) ---
const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
});

function avisar(tipo, mensagem) {
    Toast.fire({ icon: tipo, title: mensagem });
}

// --- FUNÇÃO AUXILIAR PARA LIMPAR MENSAGENS DE ERRO ---
function tratarErroIpc(err) {
    if (!err) return "Erro desconhecido.";
    const originalMsg = (typeof err === 'string' ? err : (err.message || "Erro desconhecido"));
    const msg = originalMsg.toLowerCase();

    if (msg.includes("unique constraint failed: toras.codigo")) {
        return "Este número de tora já está cadastrado no sistema.";
    }
    if (msg.includes("unique constraint failed: lotes.numero")) {
        return "Este número de lote já existe.";
    }
    if (msg.includes("unique constraint failed: romaneios.numero")) {
        return "Já existe um romaneio com este número.";
    }
    if (msg.includes("unique constraint failed")) {
        return "Este registro já existe e não pode ser duplicado.";
    }
    if (msg.includes("foreign key constraint failed")) {
        return "Não é possível excluir: este registro está sendo usado em outra parte do sistema.";
    }

    return originalMsg.replace(/^Error invoking remote method '.*?':\s*/, '').replace(/^Error:\s*/, '');
}

// --- CONTROLE DE TEMA ESCURO ---
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// --- NAVEGAÇÃO ENTRE VIEWS ---
let formularioSujo = false;
let telaAtual = 'home';

document.addEventListener('input', (e) => {
    const isHome = e.target.closest('#v-home');
    const isBuscaGlobal = e.target.id === 'busca-global-numero';
    if (e.isTrusted && e.target.closest('.view') && !isHome && !isBuscaGlobal) {
        formularioSujo = true;
    }
});

async function carregarTela(viewName, element) {
    const viewsSemAviso = ['home', 'estoque', 'relatorios', 'logs', 'configuracoes', 'romaneios'];

    if (formularioSujo && !viewsSemAviso.includes(telaAtual)) {
        const resultado = await Swal.fire({
            title: 'Alterações não salvas',
            text: "Você preencheu dados neste formulário. Deseja realmente sair e descartar as alterações?",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#6366f1',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Sim, sair',
            cancelButtonText: 'Ficar aqui'
        });
        if (!resultado.isConfirmed) return;
    }

    const idsExcluidos = ['cfg-backup-horarios', 'cfg-backup-pasta', 'cfg-backup-ativo'];
    const todosOsInputs = document.querySelectorAll('input, select, textarea');
    todosOsInputs.forEach(campo => {
        if (idsExcluidos.includes(campo.id)) return;
        if (campo.tagName === 'SELECT') {
            campo.selectedIndex = 0;
        } else if (campo.type === 'checkbox') {
            // mantém
        } else {
            campo.value = '';
        }
    });

    if (viewName === 'relatorios') {
        const volTotal = document.getElementById('rel-total-vol');
        const qtdTotal = document.getElementById('rel-total-qtd');
        if (volTotal) volTotal.innerText = '0,000 m³';
        if (qtdTotal) qtdTotal.innerText = '0 toras encontradas';

        const tabelaCorpo = document.getElementById('rel-tabela-corpo');
        if (tabelaCorpo) {
            tabelaCorpo.innerHTML = `
                <tr>
                    <td colspan="6" class="text-muted" style="text-align: center; padding: 40px;">
                        <i data-lucide="info" style="display: inline-block; vertical-align: middle; margin-right: 8px;"></i>
                        Ajuste os filtros e clique em "Visualizar" para carregar os dados.
                    </td>
                </tr>
            `;
        }
        const containerResumos = document.getElementById('container-resumos');
        if (containerResumos) containerResumos.innerHTML = '';
        const btnMais = document.getElementById('btn-rel-carregar-mais');
        if (btnMais) btnMais.style.display = 'none';
    }

    formularioSujo = false;
    telaAtual = viewName;

    document.querySelectorAll('.components li').forEach(li => li.classList.remove('active'));
    if (element) element.classList.add('active');

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById('v-' + viewName);
    if (target) target.classList.add('active');

    const nomes = {
        'home': 'Dashboard',
        'especies': 'Cadastro de Espécies',
        'lotes': 'Cadastro de Lotes',
        'fornecedores': 'Cadastro de Fornecedores',
        'motoristas': 'Cadastro de Motoristas',
        'romaneios': 'Romaneios de Entrada',
        'entradas': 'Entradas no Estoque',
        'baixas': 'Baixas de Estoque',
        'estoque': 'Controle de Estoque Geral',
        'fechamentos': 'Fechamentos de Motoristas',
        'relatorios': 'Relatórios Gerenciais',
        'logs': 'Log de Sistemas',
        'configuracoes': 'Configurações'
    };
    const tituloElemento = document.getElementById('view-title');
    if (tituloElemento) {
        tituloElemento.innerText = nomes[viewName] || 'ToraControl';
    }

    try {
        switch (viewName) {
            case 'home':
                atualizarDashboard();
                break;
            case 'especies':
                await carregarEspecies();
                break;
            case 'lotes':
                await carregarLotes();
                break;
            case 'fornecedores':
                await carregarFornecedores();
                break;
            case 'motoristas':
                await carregarMotoristas();
                break;
            case 'fechamentos':
                await carregarSelectsFechamentos();
                switchFechamentoTab('novo');
                break;
            case 'romaneios':
                await carregarEspecies();
                await carregarLotes();
                await carregarFornecedores();
                await carregarMotoristas();
                await carregarRomaneios();
                await carregarProximoNumeroRomaneio();
                fecharDetalhesRomaneio();
                setTimeout(() => document.getElementById('rom-tora-codigo')?.focus(), 150);
                break;
            case 'entradas':
                await carregarEspecies();
                await carregarLotes();
                await carregarSelectRomaneios();
                await listarTorasRecentes();
                setTimeout(() => document.getElementById('tora-codigo')?.focus(), 150);
                break;
            case 'baixas':
                const hoje = new Date().toISOString().split('T')[0];
                const dtSaida = document.getElementById('saida-data');
                if (dtSaida && !dtSaida.value) dtSaida.value = hoje;
                break;
            case 'estoque':
                await carregarLotes();
                await carregarEspecies();
                carregarEstoque(true);
                break;
            case 'relatorios':
                await carregarFiltrosRelatorio();
                break;
            case 'logs':
                carregarLogs();
                break;
            case 'configuracoes':
                carregarConfiguracoesBackup();
                break;
        }
    } catch (err) {
        console.error("Erro ao carregar tela:", err);
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// --- MÁSCARAS E FORMATAÇÃO ---
function aplicarMascaraNumero(input) {
    if (!input || !input.value) return;
    let v = input.value.trim();
    if (/^\d+$/.test(v) && v.length < 3) {
        input.value = v.padStart(3, '0');
    }
}

function mascaraComprimento(input) {
    let value = input.value.replace(/\D/g, "");
    if (!value) { input.value = ""; return; }
    value = (parseInt(value, 10) / 100).toFixed(2);
    value = value.replace(".", ",");
    value = value.replace(/(\d)(\d{3}),/g, "$1.$2,");
    input.value = value;
}

function finalizarComprimento(input) {
    if (!input || !input.value) return;
    let v = input.value.replace(/\./g, '').replace(',', '.').trim();
    let num = parseFloat(v);
    if (!isNaN(num) && num > 0) {
        input.value = num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
}

function mascaraFrete(input) {
    let value = input.value.replace(/\D/g, "");
    if (!value) { input.value = ""; return; }
    value = (parseInt(value, 10) / 100).toFixed(2);
    value = value.replace(".", ",");
    input.value = value;
    recalcularFreteTotalRomaneio();
}

function mascaraMoeda(input) {
    let value = input.value.replace(/\D/g, "");
    if (!value) { input.value = ""; return; }
    value = (parseInt(value, 10) / 100).toFixed(2);
    value = value.replace(".", ",");
    value = value.replace(/(\d)(\d{3}),/g, "$1.$2,");
    input.value = value;
}

function obterValorLimpo(id) {
    const element = document.getElementById(id);
    if (!element) return 0;
    let valor = element.value.replace(/\./g, "").replace(",", ".").trim();
    return parseFloat(valor) || 0;
}

function toggleLockField(fieldId, btnElement) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    const isReadonly = field.hasAttribute('readonly');
    if (isReadonly) {
        field.removeAttribute('readonly');
        field.classList.remove('readonly-field');
        if (btnElement) {
            btnElement.innerHTML = '<i data-lucide="unlock" style="width: 16px; height: 16px; color: var(--accent-color);"></i>';
            btnElement.title = "Campos desbloqueados para digitação manual";
        }
    } else {
        field.setAttribute('readonly', 'readonly');
        field.classList.add('readonly-field');
        if (btnElement) {
            btnElement.innerHTML = '<i data-lucide="lock" style="width: 16px; height: 16px;"></i>';
            btnElement.title = "Bloqueado para cópia automática das medidas";
        }
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ============================================================
// CUBAGEM GEOMÉTRICA (Cálculo Oficial: (M1 * M2 * Comp * 78.54) / 1.000.000)
// ============================================================
function calcularVolumeGeometrico(m1, m2, comp) {
    if (m1 > 0 && m2 > 0 && comp > 0) {
        const volumeBruto = (m1 * m2 * comp * 78.54) / 1000000;
        return Math.floor(volumeBruto * 1000) / 1000;
    }
    return 0;
}

function calcularCubagem() {
    const m1 = parseFloat(document.getElementById('m1').value) || 0;
    const m2 = parseFloat(document.getElementById('m2').value) || 0;
    const comp = obterValorLimpo('comprimento');

    const m1BrutoField = document.getElementById('m1-bruto');
    const m2BrutoField = document.getElementById('m2-bruto');
    const compBrutoField = document.getElementById('comprimento-bruto');

    if (m1BrutoField && m1BrutoField.hasAttribute('readonly')) {
        m1BrutoField.value = m1 > 0 ? m1 : '';
    }
    if (m2BrutoField && m2BrutoField.hasAttribute('readonly')) {
        m2BrutoField.value = m2 > 0 ? m2 : '';
    }
    if (compBrutoField && compBrutoField.hasAttribute('readonly')) {
        compBrutoField.value = comp > 0 ? comp.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
    }

    const display = document.getElementById('volume-result');
    const detalhe = document.getElementById('detalhe-calculo');

    if (m1 > 0 && m2 > 0 && comp > 0) {
        const vol = calcularVolumeGeometrico(m1, m2, comp);
        display.innerText = vol.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + " m³";
        if (detalhe) {
            detalhe.innerText = `(${m1} cm × ${m2} cm × ${comp.toFixed(2)} m × 78,54) / 1.000.000 = ${vol.toFixed(3)} m³`;
        }
    } else {
        display.innerText = "0,000 m³";
        if (detalhe) detalhe.innerText = "";
    }
}

function calcularCubagemSubForm() {
    const m1 = parseFloat(document.getElementById('rom-tora-m1').value) || 0;
    const m2 = parseFloat(document.getElementById('rom-tora-m2').value) || 0;
    const comp = obterValorLimpo('rom-tora-comprimento');

    const m1BrutoField = document.getElementById('rom-tora-m1-bruto');
    const m2BrutoField = document.getElementById('rom-tora-m2-bruto');
    const compBrutoField = document.getElementById('rom-tora-comprimento-bruto');

    if (m1BrutoField && m1BrutoField.hasAttribute('readonly')) {
        m1BrutoField.value = m1 > 0 ? m1 : '';
    }
    if (m2BrutoField && m2BrutoField.hasAttribute('readonly')) {
        m2BrutoField.value = m2 > 0 ? m2 : '';
    }
    if (compBrutoField && compBrutoField.hasAttribute('readonly')) {
        compBrutoField.value = comp > 0 ? comp.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
    }

    const display = document.getElementById('rom-tora-volume-result');
    const detalhe = document.getElementById('rom-tora-detalhe-calculo');

    if (m1 > 0 && m2 > 0 && comp > 0) {
        const vol = calcularVolumeGeometrico(m1, m2, comp);
        display.innerText = vol.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + " m³";
        if (detalhe) {
            detalhe.innerText = `(${m1} cm × ${m2} cm × ${comp.toFixed(2)} m × 78,54) / 1.000.000 = ${vol.toFixed(3)} m³`;
        }
    } else {
        display.innerText = "0,000 m³";
        if (detalhe) detalhe.innerText = "";
    }
}

// ============================================================
// GESTÃO DE ESPÉCIES (SINCRONIZAÇÃO NUVEM SUPABASE)
// ============================================================
let listaEspeciesCache = [];

async function carregarEspecies() {
    try {
        const especies = await window.api.invoke('listar-especies');
        listaEspeciesCache = Array.isArray(especies) ? especies : [];
        renderizarTabelaEspecies(listaEspeciesCache);

        const selects = ['tora-especie', 'rom-tora-especie', 'rel-especie', 'filtro-estoque-especie'];
        selects.forEach(selId => {
            const el = document.getElementById(selId);
            if (!el) return;
            const isFilter = selId.startsWith('rel-') || selId.startsWith('filtro-');
            const defaultOpt = isFilter ? '<option value="todos">Todas as Espécies</option>' : '<option value="">Selecione...</option>';
            el.innerHTML = defaultOpt + listaEspeciesCache.map(e => `<option value="${e.id}">${e.nome}</option>`).join('');
        });

        await atualizarStatusSyncEspecies();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        console.error("Erro ao carregar espécies:", err);
    }
}

function renderizarTabelaEspecies(especies) {
    const tbody = document.getElementById('lista-especies');
    if (!tbody) return;

    if (!especies || especies.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; padding: 35px; color: #94a3b8;">
                    <i data-lucide="cloud-off" style="display:inline-block; vertical-align:middle; margin-right:8px; width:20px; height:20px;"></i>
                    Nenhuma espécie encontrada. Clique no botão <strong>Sincronizar com Supabase</strong> para importar as espécies da nuvem.
                </td>
            </tr>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    tbody.innerHTML = especies.map(esp => `
        <tr>
            <td><span style="font-family: monospace; font-size: 11px; background: rgba(99, 102, 241, 0.1); color: #6366f1; padding: 2px 6px; border-radius: 4px; font-weight: 600;">#${String(esp.id).padStart(3, '0')}</span></td>
            <td><strong style="color: var(--text-dark);">${esp.nome}</strong></td>
            <td><span style="font-style: italic; color: #64748b;">${esp.cientifico || '-'}</span></td>
            <td style="text-align: right; padding-right: 25px;">
                <span class="badge-status-pátio" style="background: rgba(16, 185, 129, 0.12); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 20px;">
                    <i data-lucide="cloud-check" style="width: 13px; height: 13px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Supabase Master
                </span>
            </td>
        </tr>`).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function filtrarTabelaEspecies(termo) {
    const busca = (termo || '').toLowerCase().trim();
    if (!busca) {
        renderizarTabelaEspecies(listaEspeciesCache);
        return;
    }
    const filtradas = listaEspeciesCache.filter(esp => 
        (esp.nome && esp.nome.toLowerCase().includes(busca)) ||
        (esp.cientifico && esp.cientifico.toLowerCase().includes(busca)) ||
        String(esp.id).includes(busca)
    );
    renderizarTabelaEspecies(filtradas);
}

async function atualizarStatusSyncEspecies() {
    try {
        const info = await window.api.invoke('get-info-sync-especies');
        const elTotal = document.getElementById('sync-esp-total');
        const elData = document.getElementById('sync-esp-data');

        if (elTotal) {
            elTotal.innerText = `${info.total || 0} espécies`;
        }
        if (elData) {
            if (info.lastSync) {
                elData.innerText = formatarDataBR(info.lastSync, true);
            } else {
                elData.innerText = "Nunca sincronizado";
            }
        }
    } catch (e) {
        console.error("Erro ao atualizar status de sincronização:", e);
    }
}

async function sincronizarEspeciesSupabase(silencioso = false) {
    const btnSync = document.getElementById('btn-sync-especies');
    if (btnSync) {
        btnSync.disabled = true;
        btnSync.innerHTML = '<i data-lucide="refresh-cw" class="lucide-spin" style="width: 16px; height: 16px;"></i> <span>Sincronizando...</span>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    if (!silencioso) {
        Swal.fire({
            title: 'Sincronizando com a Nuvem',
            html: 'Buscando catálogo de espécies atualizado no <strong>Supabase</strong>...',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });
    }

    try {
        const res = await window.api.invoke('sync-especies-supabase');
        if (res && res.success) {
            await carregarEspecies();
            if (!silencioso) {
                Swal.fire({
                    icon: 'success',
                    title: 'Sincronização Concluída!',
                    text: `${res.count} espécies foram sincronizadas do Supabase com sucesso.`,
                    confirmButtonColor: '#10b981'
                });
            } else {
                console.log(`✅ [SYNC] ${res.count} espécies sincronizadas automaticamente.`);
            }
        } else {
            throw new Error(res?.error || 'Não foi possível conectar ao Supabase.');
        }
    } catch (err) {
        console.warn("Aviso na sincronização de espécies:", err.message);
        if (!silencioso) {
            Swal.fire({
                icon: 'error',
                title: 'Falha na Sincronização',
                text: 'Não foi possível sincronizar com o Supabase. Verifique sua conexão com a internet ou as credenciais.',
                confirmButtonColor: '#6366f1'
            });
        }
    } finally {
        if (btnSync) {
            btnSync.disabled = false;
            btnSync.innerHTML = '<i data-lucide="cloud-download"></i> <span>Sincronizar com Supabase</span>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }
}

// ============================================================
// GESTÃO DE LOTES
// ============================================================
async function carregarLotes() {
    try {
        const lotes = await window.api.invoke('listar-lotes');
        const tbody = document.getElementById('lista-lotes');
        if (tbody) {
            tbody.innerHTML = lotes.map(l => `
                <tr>
                    <td><strong>${l.numero}</strong></td>
                    <td>${l.descricao || '-'}</td>
                    <td style="text-align: center;"><span class="badge-count">${l.total_toras} toras</span></td>
                    <td style="text-align: center;"><span class="badge-volume">${(l.volume_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3 })} m³</span></td>
                    <td style="text-align: right; padding-right: 25px;">
                        <button class="btn-icon-edit" onclick="prepararEdicaoLote('${encodeURIComponent(JSON.stringify(l))}')" title="Editar"><i data-lucide="pencil"></i></button>
                        <button class="btn-icon-delete" onclick="excluirLote(${l.id})" title="Excluir"><i data-lucide="trash-2"></i></button>
                    </td>
                </tr>`).join('');
        }

        const selects = ['tora-lote', 'rom-tora-lote', 'rel-lote', 'filtro-estoque-lote'];
        selects.forEach(selId => {
            const el = document.getElementById(selId);
            if (!el) return;
            const isFilter = selId.startsWith('rel-') || selId.startsWith('filtro-');
            const defaultOpt = isFilter ? '<option value="todos">Todos os Lotes</option>' : '<option value="">Selecione...</option>';
            el.innerHTML = defaultOpt + lotes.map(l => `<option value="${l.id}">${l.numero}</option>`).join('');
        });

        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        console.error("Erro ao carregar lotes:", err);
    }
}

async function salvarLote() {
    const id = document.getElementById('lote-id').value;
    const numero = document.getElementById('lote-numero').value.trim();
    const descricao = document.getElementById('lote-descricao').value.trim();

    if (!numero) return Swal.fire('Atenção', 'Número do lote obrigatório.', 'warning');

    try {
        const res = await window.api.invoke(id ? 'editar-lote' : 'salvar-lote', { id, numero, descricao });
        if (res && res.success) {
            avisar('success', id ? 'Lote atualizado!' : 'Lote criado!');
            resetLoteForm();
            carregarLotes();
        } else {
            throw new Error(res.error || 'Erro ao salvar lote.');
        }
    } catch (err) {
        avisar('error', tratarErroIpc(err));
    }
}

function prepararEdicaoLote(json) {
    const l = JSON.parse(decodeURIComponent(json));
    document.getElementById('lote-id').value = l.id;
    document.getElementById('lote-numero').value = l.numero;
    document.getElementById('lote-descricao').value = l.descricao || "";
    document.getElementById('btn-salvar-lote').querySelector('span').innerText = "Atualizar Lote";
    document.getElementById('btn-cancelar-edicao').style.display = "block";
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetLoteForm() {
    document.getElementById('lote-id').value = "";
    document.getElementById('lote-numero').value = "";
    document.getElementById('lote-descricao').value = "";
    document.getElementById('btn-salvar-lote').querySelector('span').innerText = "Salvar Lote";
    document.getElementById('btn-cancelar-edicao').style.display = "none";
}

async function excluirLote(id) {
    const r = await Swal.fire({
        title: 'Excluir Lote?',
        text: "Isso não pode ser desfeito.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#6366f1',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sim, excluir',
        cancelButtonText: 'Cancelar'
    });

    if (r.isConfirmed) {
        try {
            await window.api.invoke('excluir-lote', id);
            avisar('success', 'Lote removido.');
            carregarLotes();
        } catch (err) {
            Swal.fire({ title: 'Não permitido', text: tratarErroIpc(err), icon: 'error', confirmButtonColor: '#6366f1' });
        }
    }
}

// ============================================================
// GESTÃO DE FORNECEDORES
// ============================================================
async function carregarFornecedores() {
    try {
        const fornecedores = await window.api.invoke('listar-fornecedores');
        const tbody = document.getElementById('lista-fornecedores');
        if (tbody) {
            tbody.innerHTML = fornecedores.map(f => `
                <tr>
                    <td><strong>${f.nome}</strong></td>
                    <td style="text-align: right; padding-right: 25px;">
                        <button class="btn-icon-edit" onclick="prepararEdicaoFornecedor('${encodeURIComponent(JSON.stringify(f))}')" title="Editar"><i data-lucide="pencil"></i></button>
                        <button class="btn-icon-delete" onclick="excluirFornecedor(${f.id})" title="Excluir"><i data-lucide="trash-2"></i></button>
                    </td>
                </tr>`).join('');
        }

        const selects = ['rom-fornecedor-id', 'rel-forn-id'];
        selects.forEach(selId => {
            const el = document.getElementById(selId);
            if (!el) return;
            const isFilter = selId.startsWith('rel-');
            const defaultOpt = isFilter ? '<option value="todos">Todos os Fornecedores</option>' : '<option value="">Selecione...</option>';
            el.innerHTML = defaultOpt + fornecedores.map(f => `<option value="${f.id}">${f.nome}</option>`).join('');
        });

        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        console.error("Erro ao carregar fornecedores:", err);
    }
}

async function salvarFornecedor() {
    const id = document.getElementById('fornecedor-id').value;
    const nome = document.getElementById('fornecedor-nome').value.trim();

    if (!nome) return Swal.fire('Atenção', 'Nome do fornecedor obrigatório.', 'warning');

    try {
        const res = await window.api.invoke('salvar-fornecedor', { id: id ? parseInt(id, 10) : null, nome });
        if (res && res.success) {
            avisar('success', id ? 'Fornecedor atualizado!' : 'Fornecedor cadastrado!');
            resetFornecedorForm();
            carregarFornecedores();
        } else {
            throw new Error(res.error || 'Erro ao salvar fornecedor.');
        }
    } catch (err) {
        avisar('error', tratarErroIpc(err));
    }
}

function prepararEdicaoFornecedor(json) {
    const f = JSON.parse(decodeURIComponent(json));
    document.getElementById('fornecedor-id').value = f.id;
    document.getElementById('fornecedor-nome').value = f.nome;
    document.getElementById('forn-form-titulo').innerText = "Editar Fornecedor";
    document.getElementById('btn-salvar-fornecedor').querySelector('span').innerText = "Atualizar Fornecedor";
    document.getElementById('btn-cancelar-fornecedor').style.display = "block";
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetFornecedorForm() {
    document.getElementById('fornecedor-id').value = "";
    document.getElementById('fornecedor-nome').value = "";
    document.getElementById('forn-form-titulo').innerText = "Novo Fornecedor";
    document.getElementById('btn-salvar-fornecedor').querySelector('span').innerText = "Salvar Fornecedor";
    document.getElementById('btn-cancelar-fornecedor').style.display = "none";
}

async function excluirFornecedor(id) {
    const r = await Swal.fire({
        title: 'Excluir Fornecedor?',
        text: "Isso não pode ser desfeito.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#6366f1',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sim, excluir',
        cancelButtonText: 'Cancelar'
    });

    if (r.isConfirmed) {
        try {
            const res = await window.api.invoke('excluir-fornecedor', id);
            if (res && res.success) {
                avisar('success', 'Fornecedor removido.');
                carregarFornecedores();
            } else {
                throw new Error(res.error || 'Não foi possível excluir.');
            }
        } catch (err) {
            Swal.fire({ title: 'Não permitido', text: tratarErroIpc(err), icon: 'error', confirmButtonColor: '#6366f1' });
        }
    }
}

// ============================================================
// GESTÃO DE MOTORISTAS
// ============================================================
async function carregarMotoristas() {
    try {
        const motoristas = await window.api.invoke('listar-motoristas');
        const tbody = document.getElementById('lista-motoristas');
        if (tbody) {
            tbody.innerHTML = motoristas.map(m => `
                <tr>
                    <td><strong>${m.nome}</strong></td>
                    <td>${m.placa_veiculo || '-'}</td>
                    <td>${m.telefone || '-'}</td>
                    <td style="text-align: center;"><span class="badge-count">${(m.comissao || 0)}%</span></td>
                    <td style="text-align: center;"><span class="badge-volume">R$ ${(m.salario || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></td>
                    <td style="text-align: right; padding-right: 25px;">
                        <button class="btn-icon-edit" onclick="prepararEdicaoMotorista('${encodeURIComponent(JSON.stringify(m))}')" title="Editar"><i data-lucide="pencil"></i></button>
                        <button class="btn-icon-delete" onclick="excluirMotorista(${m.id})" title="Excluir"><i data-lucide="trash-2"></i></button>
                    </td>
                </tr>`).join('');
        }

        const selects = ['rom-motorista-id', 'rel-moto-id', 'fech-motorista-id', 'vale-motorista-id'];
        selects.forEach(selId => {
            const el = document.getElementById(selId);
            if (!el) return;
            const isFilter = selId.startsWith('rel-');
            const defaultOpt = isFilter ? '<option value="todos">Todos os Motoristas</option>' : '<option value="">Selecione...</option>';
            el.innerHTML = defaultOpt + motoristas.map(m => `<option value="${m.id}">${m.nome}</option>`).join('');
        });

        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        console.error("Erro ao carregar motoristas:", err);
    }
}

async function salvarMotorista() {
    const id = document.getElementById('motorista-id').value;
    const nome = document.getElementById('motorista-nome').value.trim();
    const cpf = document.getElementById('motorista-cpf').value.trim();
    const cnh = document.getElementById('motorista-cnh').value.trim();
    const placa_veiculo = document.getElementById('motorista-placa').value.trim();
    const telefone = document.getElementById('motorista-telefone').value.trim();
    const comissao = parseFloat(document.getElementById('motorista-comissao').value) || 0;
    const salario = obterValorLimpo('motorista-salario');

    if (!nome) return Swal.fire('Atenção', 'Nome do motorista obrigatório.', 'warning');

    try {
        const res = await window.api.invoke('salvar-motorista', {
            id: id ? parseInt(id, 10) : null,
            nome, cpf, cnh, placa_veiculo, telefone, comissao, salario
        });
        if (res && res.success) {
            avisar('success', id ? 'Motorista atualizado!' : 'Motorista cadastrado!');
            resetMotoristaForm();
            carregarMotoristas();
        } else {
            throw new Error(res.error || 'Erro ao salvar motorista.');
        }
    } catch (err) {
        avisar('error', tratarErroIpc(err));
    }
}

function prepararEdicaoMotorista(json) {
    const m = JSON.parse(decodeURIComponent(json));
    document.getElementById('motorista-id').value = m.id;
    document.getElementById('motorista-nome').value = m.nome;
    document.getElementById('motorista-cpf').value = m.cpf || "";
    document.getElementById('motorista-cnh').value = m.cnh || "";
    document.getElementById('motorista-placa').value = m.placa_veiculo || "";
    document.getElementById('motorista-telefone').value = m.telefone || "";
    document.getElementById('motorista-comissao').value = m.comissao || 0;
    document.getElementById('motorista-salario').value = (m.salario || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    document.getElementById('mot-form-titulo').innerText = "Editar Motorista";
    document.getElementById('btn-salvar-motorista').querySelector('span').innerText = "Atualizar Motorista";
    document.getElementById('btn-cancelar-motorista').style.display = "block";
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetMotoristaForm() {
    document.getElementById('motorista-id').value = "";
    document.getElementById('motorista-nome').value = "";
    document.getElementById('motorista-cpf').value = "";
    document.getElementById('motorista-cnh').value = "";
    document.getElementById('motorista-placa').value = "";
    document.getElementById('motorista-telefone').value = "";
    document.getElementById('motorista-comissao').value = "";
    document.getElementById('motorista-salario').value = "";
    document.getElementById('mot-form-titulo').innerText = "Novo Motorista";
    document.getElementById('btn-salvar-motorista').querySelector('span').innerText = "Salvar Motorista";
    document.getElementById('btn-cancelar-motorista').style.display = "none";
}

async function excluirMotorista(id) {
    const r = await Swal.fire({
        title: 'Excluir Motorista?',
        text: "Isso não pode ser desfeito.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#6366f1',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sim, excluir',
        cancelButtonText: 'Cancelar'
    });

    if (r.isConfirmed) {
        try {
            const res = await window.api.invoke('excluir-motorista', id);
            if (res && res.success) {
                avisar('success', 'Motorista removido.');
                carregarMotoristas();
            } else {
                throw new Error(res.error || 'Não foi possível excluir.');
            }
        } catch (err) {
            Swal.fire({ title: 'Não permitido', text: tratarErroIpc(err), icon: 'error', confirmButtonColor: '#6366f1' });
        }
    }
}

// ============================================================
// GESTÃO DE ROMANEIOS DE ENTRADA (CUBAGEM GEOMÉTRICA)
// ============================================================
let torasRomaneioTemp = [];
let indexEdicaoToraTemp = -1;
let torasDeletadasRomaneio = [];

async function carregarProximoNumeroRomaneio() {
    try {
        const res = await window.api.invoke('get-proximo-numero-romaneio');
        const inputNum = document.getElementById('rom-numero');
        if (inputNum && res && res.success) {
            inputNum.value = res.numero;
        }
        const dataInput = document.getElementById('rom-data');
        if (dataInput && !dataInput.value) {
            dataInput.value = new Date().toISOString().split('T')[0];
        }
    } catch (err) {
        console.error("Erro ao gerar próximo número do romaneio:", err);
    }
}

async function carregarSelectRomaneios() {
    try {
        const romaneios = await window.api.invoke('get-romaneios-select');
        const select = document.getElementById('tora-romaneio');
        if (select) {
            select.innerHTML = '<option value="">Sem Romaneio (Entrada Direta)</option>' +
                romaneios.map(r => `<option value="${r.id}">${r.numero} (${formatarDataBR(r.data)})</option>`).join('');
        }
    } catch (err) {
        console.error("Erro ao carregar select de romaneios:", err);
    }
}

async function carregarRomaneios() {
    try {
        const romaneios = await window.api.invoke('listar-romaneios');
        const tbody = document.getElementById('lista-romaneios-corpo');
        if (tbody) {
            if (romaneios.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 30px; color: #94a3b8;">Nenhum romaneio cadastrado até o momento.</td></tr>';
            } else {
                tbody.innerHTML = romaneios.map(r => `
                    <tr>
                        <td><strong>${r.numero}</strong></td>
                        <td>${formatarDataBR(r.data)}</td>
                        <td>${r.fornecedor_nome || r.fornecedor || '-'}</td>
                        <td>${r.motorista_nome || r.motorista || '-'}</td>
                        <td style="text-align: center;"><span class="badge-count">${r.total_toras}</span></td>
                        <td style="text-align: center;"><span class="badge-volume">${(r.volume_total_liquido || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3 })} m³</span></td>
                        <td style="text-align: center;"><span class="badge-volume" style="background:#f1f5f9; color:#475569;">${(r.volume_total_bruto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3 })} m³</span></td>
                        <td style="text-align: right; padding-right: 25px;">
                            <button class="btn-save" style="padding: 6px 12px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px; background: #6366f1;" onclick="verDetalhesRomaneio(${r.id})">
                                <i data-lucide="eye" style="width: 14px; height: 14px;"></i> Detalhes
                            </button>
                            <button class="btn-icon-edit" onclick="prepararEdicaoRomaneio(${r.id})" title="Editar"><i data-lucide="pencil"></i></button>
                            <button class="btn-icon-delete" onclick="excluirRomaneio(${r.id})" title="Excluir"><i data-lucide="trash-2"></i></button>
                        </td>
                    </tr>`).join('');
            }
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        console.error("Erro ao listar romaneios:", err);
    }
}

function recalcularFreteTotalRomaneio() {
    const freteValor = obterValorLimpo('rom-frete-valor');
    let totalVolBruto = 0;
    torasRomaneioTemp.forEach(t => {
        totalVolBruto += (t.volume_bruto || t.volume || 0);
    });
    const freteTotal = freteValor * totalVolBruto;
    const campoFreteTotal = document.getElementById('rom-frete-total');
    if (campoFreteTotal) {
        campoFreteTotal.value = freteTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
}

function adicionarToraTempList() {
    const codigoInput = document.getElementById('rom-tora-codigo');
    const especieSelect = document.getElementById('rom-tora-especie');
    const loteSelect = document.getElementById('rom-tora-lote');
    const m1Input = document.getElementById('rom-tora-m1');
    const m2Input = document.getElementById('rom-tora-m2');
    const compInput = document.getElementById('rom-tora-comprimento');

    const m1BrutoInput = document.getElementById('rom-tora-m1-bruto');
    const m2BrutoInput = document.getElementById('rom-tora-m2-bruto');
    const compBrutoInput = document.getElementById('rom-tora-comprimento-bruto');

    const codigo = codigoInput.value.trim();
    const especie_id = parseInt(especieSelect.value, 10);
    const lote_id = parseInt(loteSelect.value, 10);
    const m1 = parseFloat(m1Input.value) || 0;
    const m2 = parseFloat(m2Input.value) || 0;
    const comp = obterValorLimpo('rom-tora-comprimento');

    const m1_bruto = parseFloat(m1BrutoInput.value) || m1;
    const m2_bruto = parseFloat(m2BrutoInput.value) || m2;
    const comp_bruto = obterValorLimpo('rom-tora-comprimento-bruto') || comp;

    if (!codigo || !especie_id || !lote_id || m1 <= 0 || m2 <= 0 || comp <= 0) {
        return Swal.fire('Atenção', 'Preencha o Código, Espécie, Lote, M1, M2 e Comprimento da tora.', 'warning');
    }

    const jaExisteNaLista = torasRomaneioTemp.some((t, idx) => t.codigo === codigo && idx !== indexEdicaoToraTemp);
    if (jaExisteNaLista) {
        return Swal.fire('Atenção', `O número de tora "${codigo}" já foi adicionado a este romaneio.`, 'warning');
    }

    const volLiq = calcularVolumeGeometrico(m1, m2, comp);
    const volBruto = calcularVolumeGeometrico(m1_bruto, m2_bruto, comp_bruto);

    const especie_nome = especieSelect.options[especieSelect.selectedIndex]?.text || '';
    const lote_numero = loteSelect.options[loteSelect.selectedIndex]?.text || '';

    const toraObjeto = {
        codigo,
        especie_id,
        especie_nome,
        lote_id,
        lote_numero,
        m1,
        m2,
        comprimento: comp,
        m1_bruto,
        m2_bruto,
        comprimento_bruto: comp_bruto,
        volume: volLiq,
        volume_bruto: volBruto
    };

    if (indexEdicaoToraTemp >= 0) {
        if (torasRomaneioTemp[indexEdicaoToraTemp].id) {
            toraObjeto.id = torasRomaneioTemp[indexEdicaoToraTemp].id;
        }
        torasRomaneioTemp[indexEdicaoToraTemp] = toraObjeto;
        indexEdicaoToraTemp = -1;
        document.getElementById('btn-adicionar-tora-romaneio').innerHTML = '<i data-lucide="plus-circle"></i> Adicionar Tora';
        document.getElementById('btn-cancelar-tora-romaneio').style.display = 'none';
    } else {
        torasRomaneioTemp.push(toraObjeto);
    }

    codigoInput.value = '';
    m1Input.value = '';
    m2Input.value = '';
    compInput.value = '';
    m1BrutoInput.value = '';
    m2BrutoInput.value = '';
    compBrutoInput.value = '';
    document.getElementById('rom-tora-volume-result').innerText = '0,000 m³';
    if (document.getElementById('rom-tora-detalhe-calculo')) document.getElementById('rom-tora-detalhe-calculo').innerText = '';

    atualizarTabelaTorasRomaneioTemp();
    recalcularFreteTotalRomaneio();
    codigoInput.focus();
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function removerToraTempList(index) {
    if (index >= 0 && index < torasRomaneioTemp.length) {
        const removida = torasRomaneioTemp[index];
        if (removida.id) {
            torasDeletadasRomaneio.push(removida);
        }
        torasRomaneioTemp.splice(index, 1);
        atualizarTabelaTorasRomaneioTemp();
        recalcularFreteTotalRomaneio();
    }
}

function prepararEdicaoToraTempList(index) {
    if (index >= 0 && index < torasRomaneioTemp.length) {
        const t = torasRomaneioTemp[index];
        indexEdicaoToraTemp = index;

        document.getElementById('rom-tora-codigo').value = t.codigo;
        document.getElementById('rom-tora-especie').value = t.especie_id;
        document.getElementById('rom-tora-lote').value = t.lote_id;
        document.getElementById('rom-tora-m1').value = t.m1;
        document.getElementById('rom-tora-m2').value = t.m2;
        document.getElementById('rom-tora-comprimento').value = t.comprimento.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        document.getElementById('rom-tora-m1-bruto').value = t.m1_bruto;
        document.getElementById('rom-tora-m2-bruto').value = t.m2_bruto;
        document.getElementById('rom-tora-comprimento-bruto').value = t.comprimento_bruto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        calcularCubagemSubForm();
        document.getElementById('btn-adicionar-tora-romaneio').innerHTML = '<i data-lucide="check"></i> Atualizar Tora';
        document.getElementById('btn-cancelar-tora-romaneio').style.display = 'inline-flex';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

function cancelarEdicaoToraTempList() {
    indexEdicaoToraTemp = -1;
    document.getElementById('rom-tora-codigo').value = '';
    document.getElementById('rom-tora-m1').value = '';
    document.getElementById('rom-tora-m2').value = '';
    document.getElementById('rom-tora-comprimento').value = '';
    document.getElementById('rom-tora-m1-bruto').value = '';
    document.getElementById('rom-tora-m2-bruto').value = '';
    document.getElementById('rom-tora-comprimento-bruto').value = '';
    document.getElementById('rom-tora-volume-result').innerText = '0,000 m³';
    if (document.getElementById('rom-tora-detalhe-calculo')) document.getElementById('rom-tora-detalhe-calculo').innerText = '';
    document.getElementById('btn-adicionar-tora-romaneio').innerHTML = '<i data-lucide="plus-circle"></i> Adicionar Tora';
    document.getElementById('btn-cancelar-tora-romaneio').style.display = 'none';
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function atualizarTabelaTorasRomaneioTemp() {
    const tbody = document.getElementById('lista-toras-romaneio-temp');
    if (!tbody) return;

    if (torasRomaneioTemp.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="rom-empty-msg">Nenhuma tora vinculada a este romaneio ainda.</td></tr>';
        document.getElementById('tot-pecas-temp').innerText = '0';
        document.getElementById('tot-liq-temp').innerText = '0,000 m³';
        document.getElementById('tot-bruto-temp').innerText = '0,000 m³';
        return;
    }

    let totLiq = 0;
    let totBruto = 0;

    tbody.innerHTML = torasRomaneioTemp.map((t, idx) => {
        totLiq += (t.volume || 0);
        totBruto += (t.volume_bruto || t.volume || 0);
        return `
            <tr>
                <td><strong>${t.codigo}</strong></td>
                <td>${t.especie_nome}</td>
                <td>${t.lote_numero}</td>
                <td style="text-align: center;">${t.m1} × ${t.m2} cm</td>
                <td style="text-align: center;">${t.comprimento.toFixed(2)} m</td>
                <td style="text-align: center;"><span class="badge-volume">${t.volume.toFixed(3)} m³</span></td>
                <td style="text-align: center;"><span class="badge-volume" style="background:#f1f5f9; color:#475569;">${(t.volume_bruto || t.volume).toFixed(3)} m³</span></td>
                <td style="text-align: right; padding-right: 20px;">
                    <button class="btn-icon-edit" onclick="prepararEdicaoToraTempList(${idx})" title="Editar"><i data-lucide="pencil"></i></button>
                    <button class="btn-icon-delete" onclick="removerToraTempList(${idx})" title="Remover"><i data-lucide="trash-2"></i></button>
                </td>
            </tr>
        `;
    }).join('');

    document.getElementById('tot-pecas-temp').innerText = torasRomaneioTemp.length.toString();
    document.getElementById('tot-liq-temp').innerText = totLiq.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + " m³";
    document.getElementById('tot-bruto-temp').innerText = totBruto.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + " m³";
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function salvarRomaneio() {
    const id = document.getElementById('rom-id').value;
    const numero = document.getElementById('rom-numero').value.trim();
    const data = document.getElementById('rom-data').value;
    const fornecedor_id = parseInt(document.getElementById('rom-fornecedor-id').value, 10) || null;
    const motorista_id = parseInt(document.getElementById('rom-motorista-id').value, 10) || null;
    const observacoes = document.getElementById('rom-observacoes').value.trim();
    const frete_valor = obterValorLimpo('rom-frete-valor');
    const frete_total = obterValorLimpo('rom-frete-total');

    if (!numero || !data) {
        return Swal.fire('Atenção', 'Número do romaneio e data são obrigatórios.', 'warning');
    }

    if (torasRomaneioTemp.length === 0) {
        return Swal.fire('Atenção', 'Adicione pelo menos uma tora a este romaneio.', 'warning');
    }

    const payload = {
        id: id ? parseInt(id, 10) : null,
        numero,
        data,
        fornecedor_id,
        motorista_id,
        observacoes,
        frete_valor,
        frete_total,
        toras: torasRomaneioTemp,
        torasDeletadas: torasDeletadasRomaneio
    };

    try {
        const res = await window.api.invoke(id ? 'editar-romaneio' : 'salvar-romaneio', payload);
        if (res && res.success) {
            avisar('success', id ? 'Romaneio atualizado com sucesso!' : 'Romaneio registrado com sucesso!');
            resetFormRomaneio();
            carregarRomaneios();
        } else {
            throw new Error(res.error || 'Erro ao salvar romaneio.');
        }
    } catch (err) {
        avisar('error', tratarErroIpc(err));
    }
}

async function prepararEdicaoRomaneio(romaneioId) {
    try {
        const res = await window.api.invoke('get-romaneio-detalhado', romaneioId);
        if (!res || !res.success) return Swal.fire('Erro', 'Romaneio não encontrado.', 'error');

        const r = res.romaneio;
        document.getElementById('rom-id').value = r.id;
        document.getElementById('rom-numero').value = r.numero;
        document.getElementById('rom-data').value = r.data;
        document.getElementById('rom-fornecedor-id').value = r.fornecedor_id || "";
        document.getElementById('rom-motorista-id').value = r.motorista_id || "";
        document.getElementById('rom-observacoes').value = r.observacoes || "";
        document.getElementById('rom-frete-valor').value = (r.frete_valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        document.getElementById('rom-frete-total').value = (r.frete_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

        torasRomaneioTemp = (res.toras || []).map(t => ({
            id: t.id,
            codigo: t.codigo,
            especie_id: t.especie_id,
            especie_nome: t.especie_nome,
            lote_id: t.lote_id,
            lote_numero: t.lote_numero,
            m1: t.m1,
            m2: t.m2,
            comprimento: t.comprimento,
            m1_bruto: t.m1_bruto || t.m1,
            m2_bruto: t.m2_bruto || t.m2,
            comprimento_bruto: t.comprimento_bruto || t.comprimento,
            volume: t.volume,
            volume_bruto: t.volume_bruto || t.volume
        }));

        torasDeletadasRomaneio = [];
        indexEdicaoToraTemp = -1;

        atualizarTabelaTorasRomaneioTemp();

        document.getElementById('rom-form-titulo').innerText = `Editar Romaneio ${r.numero}`;
        document.getElementById('btn-salvar-romaneio').querySelector('span').innerText = "Atualizar Romaneio";
        document.getElementById('btn-cancelar-romaneio').style.display = "inline-flex";

        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
        console.error("Erro ao preparar edição do romaneio:", err);
    }
}

function resetFormRomaneio() {
    document.getElementById('rom-id').value = "";
    document.getElementById('rom-observacoes').value = "";
    document.getElementById('rom-frete-valor').value = "";
    document.getElementById('rom-frete-total').value = "";
    torasRomaneioTemp = [];
    torasDeletadasRomaneio = [];
    indexEdicaoToraTemp = -1;
    cancelarEdicaoToraTempList();
    atualizarTabelaTorasRomaneioTemp();
    carregarProximoNumeroRomaneio();
    document.getElementById('rom-form-titulo').innerText = "Novo Romaneio de Entrada";
    document.getElementById('btn-salvar-romaneio').querySelector('span').innerText = "Salvar Romaneio";
    document.getElementById('btn-cancelar-romaneio').style.display = "none";
}

async function excluirRomaneio(id) {
    const r = await Swal.fire({
        title: 'Excluir Romaneio?',
        text: "Essa ação excluirá o registro de romaneio se não houver toras vinculadas.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#6366f1',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sim, excluir',
        cancelButtonText: 'Cancelar'
    });

    if (r.isConfirmed) {
        try {
            const res = await window.api.invoke('excluir-romaneio', id);
            if (res && res.success) {
                avisar('success', 'Romaneio excluído.');
                carregarRomaneios();
            } else {
                throw new Error(res.error || 'Não foi possível excluir.');
            }
        } catch (err) {
            Swal.fire({ title: 'Não permitido', text: tratarErroIpc(err), icon: 'error', confirmButtonColor: '#6366f1' });
        }
    }
}

let dadosRomaneioDetalheAtual = null;

async function verDetalhesRomaneio(romaneioId) {
    try {
        const res = await window.api.invoke('get-romaneio-detalhado', romaneioId);
        if (!res || !res.success) return Swal.fire('Erro', 'Romaneio não encontrado.', 'error');

        dadosRomaneioDetalheAtual = res;
        const r = res.romaneio;
        const toras = res.toras || [];

        const painel = document.getElementById('painel-detalhes-romaneio');
        painel.style.display = 'block';

        document.getElementById('detalhe-rom-titulo').innerText = `Romaneio ${r.numero}`;
        document.getElementById('detalhe-rom-info').innerText = `Data: ${formatarDataBR(r.data)} | Fornecedor: ${r.fornecedor_nome || r.fornecedor || 'Não informado'} | Motorista: ${r.motorista_nome || r.motorista || 'Não informado'}`;

        const resumoEspecies = {};
        let totLiq = 0;
        let totBruto = 0;

        toras.forEach(t => {
            totLiq += (t.volume || 0);
            totBruto += (t.volume_bruto || t.volume || 0);
            const esp = t.especie_nome || 'Indefinida';
            if (!resumoEspecies[esp]) resumoEspecies[esp] = { qtd: 0, liq: 0, bruto: 0 };
            resumoEspecies[esp].qtd++;
            resumoEspecies[esp].liq += (t.volume || 0);
            resumoEspecies[esp].bruto += (t.volume_bruto || t.volume || 0);
        });

        const containerResumo = document.getElementById('detalhe-rom-resumo');
        containerResumo.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px;">
                ${Object.keys(resumoEspecies).map(esp => `
                    <div class="dash-lotes-container" style="padding: 12px;">
                        <h5 style="margin: 0 0 5px 0; color: var(--text-dark);">${esp}</h5>
                        <div style="font-size: 13px; color: var(--text-main); display: flex; justify-content: space-between;">
                            <span>${resumoEspecies[esp].qtd} toras</span>
                            <strong style="color: #10b981;">${resumoEspecies[esp].liq.toFixed(3)} m³</strong>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        const tbody = document.getElementById('detalhe-rom-toras');
        tbody.innerHTML = toras.map(t => `
            <tr>
                <td><strong>${t.codigo}</strong></td>
                <td>${t.especie_nome || '-'}</td>
                <td>${t.lote_numero || '-'}</td>
                <td style="text-align: center;">${t.m1} × ${t.m2} cm</td>
                <td style="text-align: center;">${t.comprimento.toFixed(2)} m</td>
                <td style="text-align: center;"><span class="badge-volume">${(t.volume || 0).toFixed(3)} m³</span></td>
                <td style="text-align: center;"><span class="badge-volume" style="background:#f1f5f9; color:#475569;">${(t.volume_bruto || t.volume || 0).toFixed(3)} m³</span></td>
                <td style="text-align: center;"><span class="badge-count" style="${t.status === 'serrada' ? 'background:#fee2e2; color:#ef4444;' : 'background:#dcfce7; color:#10b981;'}">${t.status === 'serrada' ? 'Serrada' : 'No Pátio'}</span></td>
            </tr>
        `).join('');

        const containerTotais = document.getElementById('detalhe-rom-totais');
        containerTotais.innerHTML = `
            <div class="rom-resumo-totais">
                <div>Total Peças: <strong style="color: var(--text-dark);">${toras.length}</strong></div>
                <div>Volume Líquido: <strong style="color: #10b981;">${totLiq.toFixed(3)} m³</strong></div>
                <div>Volume Bruto: <strong style="color: #0284c7;">${totBruto.toFixed(3)} m³</strong></div>
                <div>Frete Total: <strong style="color: #f59e0b;">R$ ${(r.frete_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></div>
            </div>
        `;

        painel.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
        console.error("Erro ao carregar detalhes do romaneio:", err);
    }
}

function fecharDetalhesRomaneio() {
    const painel = document.getElementById('painel-detalhes-romaneio');
    if (painel) painel.style.display = 'none';
}

function imprimirRomaneio() {
    if (!dadosRomaneioDetalheAtual) return;
    const { romaneio, toras } = dadosRomaneioDetalheAtual;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(`ROMANEIO DE ENTRADA - ${romaneio.numero}`, 14, 18);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Data: ${formatarDataBR(romaneio.data)}`, 14, 25);
    doc.text(`Fornecedor: ${romaneio.fornecedor_nome || romaneio.fornecedor || 'Não informado'}`, 14, 30);
    doc.text(`Motorista: ${romaneio.motorista_nome || romaneio.motorista || 'Não informado'}`, 120, 25);
    doc.text(`Frete Total: R$ ${(romaneio.frete_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 120, 30);

    const tableRows = (toras || []).map((t, idx) => [
        idx + 1,
        t.codigo,
        t.especie_nome || '-',
        t.lote_numero || '-',
        `${t.m1} x ${t.m2}`,
        t.comprimento.toFixed(2),
        t.volume.toFixed(3),
        (t.volume_bruto || t.volume).toFixed(3)
    ]);

    doc.autoTable({
        head: [['#', 'Número', 'Espécie', 'Lote', 'Medidas (cm)', 'Comp (m)', 'Vol Líq (m³)', 'Vol Bruto (m³)']],
        body: tableRows,
        startY: 36,
        theme: 'striped',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [99, 102, 241] }
    });

    let totLiq = toras.reduce((s, t) => s + (t.volume || 0), 0);
    let totBruto = toras.reduce((s, t) => s + (t.volume_bruto || t.volume || 0), 0);

    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total de Toras: ${toras.length}`, 14, finalY);
    doc.text(`Volume Líquido Total: ${totLiq.toFixed(3)} m³`, 80, finalY);
    doc.text(`Volume Bruto Total: ${totBruto.toFixed(3)} m³`, 140, finalY);

    doc.save(`Romaneio_${romaneio.numero.replace(/[\/\\:]/g, '_')}.pdf`);
}

// ============================================================
// GESTÃO DE TORAS (ENTRADAS INDIVIDUAIS)
// ============================================================
async function salvarTora() {
    const btnSalvar = document.getElementById('btn-salvar-tora');
    const id = document.getElementById('tora-id').value;

    const data = {
        id,
        codigo: document.getElementById('tora-codigo').value.trim(),
        especie_id: document.getElementById('tora-especie').value,
        lote_id: document.getElementById('tora-lote').value,
        romaneio_id: document.getElementById('tora-romaneio').value || null,
        m1: parseFloat(document.getElementById('m1').value) || 0,
        m2: parseFloat(document.getElementById('m2').value) || 0,
        comprimento: obterValorLimpo('comprimento'),
        m1_bruto: parseFloat(document.getElementById('m1-bruto').value) || parseFloat(document.getElementById('m1').value) || 0,
        m2_bruto: parseFloat(document.getElementById('m2-bruto').value) || parseFloat(document.getElementById('m2').value) || 0,
        comprimento_bruto: obterValorLimpo('comprimento-bruto') || obterValorLimpo('comprimento'),
        volume: parseFloat(document.getElementById('volume-result').innerText.replace(" m³", "").replace(/\./g, "").replace(",", ".")),
        volume_bruto: 0
    };

    data.volume_bruto = calcularVolumeGeometrico(data.m1_bruto, data.m2_bruto, data.comprimento_bruto);

    if (!data.codigo || !data.especie_id || !data.lote_id || data.volume <= 0) {
        return Swal.fire('Atenção', 'Preencha o Código, Espécie, Lote, M1, M2 e Comprimento.', 'warning');
    }

    try {
        if (btnSalvar) {
            btnSalvar.disabled = true;
            btnSalvar.style.opacity = "0.7";
        }

        const res = await window.api.invoke(id ? 'editar-tora' : 'salvar-tora', data);

        if (res && res.success) {
            avisar('success', id ? 'Tora atualizada!' : `Tora Número ${data.codigo} registrada!`);
            resetFormEntrada();
            listarTorasRecentes();
        } else {
            throw new Error(res.error || 'Erro ao salvar tora.');
        }
    } catch (err) {
        avisar('error', tratarErroIpc(err));
    } finally {
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.style.opacity = "1";
        }
    }
}

async function listarTorasRecentes() {
    try {
        const toras = await window.api.invoke('listar-toras-recentes');
        const tbody = document.getElementById('lista-entradas-recentes');
        if (tbody) {
            tbody.innerHTML = toras.map(t => `
                <tr>
                    <td><strong>${t.codigo}</strong></td>
                    <td>${t.especie_nome || '-'}</td>
                    <td>${t.lote_numero || '-'}</td>
                    <td>${t.m1} × ${t.m2} cm | ${(t.comprimento || 0).toFixed(2)} m</td>
                    <td><span class="badge-volume">${(t.volume || 0).toFixed(3)} m³</span></td>
                    <td style="text-align: right; padding-right: 25px;">
                        <button class="btn-icon-edit" onclick="prepararEdicaoTora('${encodeURIComponent(JSON.stringify(t))}')" title="Editar"><i data-lucide="pencil"></i></button>
                        <button class="btn-icon-delete" onclick="excluirTora(${t.id})" title="Excluir"><i data-lucide="trash-2"></i></button>
                    </td>
                </tr>`).join('');
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        console.error("Erro ao listar toras recentes:", err);
    }
}

function prepararEdicaoTora(json) {
    const t = JSON.parse(decodeURIComponent(json));
    document.getElementById('tora-id').value = t.id;
    document.getElementById('tora-codigo').value = t.codigo;
    document.getElementById('tora-especie').value = t.especie_id;
    document.getElementById('tora-lote').value = t.lote_id;
    document.getElementById('tora-romaneio').value = t.romaneio_id || "";
    document.getElementById('m1').value = t.m1;
    document.getElementById('m2').value = t.m2;
    document.getElementById('comprimento').value = (t.comprimento || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    document.getElementById('m1-bruto').value = t.m1_bruto || t.m1;
    document.getElementById('m2-bruto').value = t.m2_bruto || t.m2;
    document.getElementById('comprimento-bruto').value = (t.comprimento_bruto || t.comprimento || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    calcularCubagem();
    document.getElementById('btn-salvar-tora').querySelector('span').innerText = "Atualizar Tora";
    document.getElementById('btn-cancelar-tora').style.display = "block";
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetFormEntrada() {
    document.getElementById('tora-id').value = "";
    document.getElementById('tora-codigo').value = "";
    document.getElementById('m1').value = "";
    document.getElementById('m2').value = "";
    document.getElementById('comprimento').value = "";
    document.getElementById('m1-bruto').value = "";
    document.getElementById('m2-bruto').value = "";
    document.getElementById('comprimento-bruto').value = "";
    document.getElementById('volume-result').innerText = "0,000 m³";
    if (document.getElementById('detalhe-calculo')) document.getElementById('detalhe-calculo').innerText = "";
    document.getElementById('btn-salvar-tora').querySelector('span').innerText = "Confirmar Entrada";
    document.getElementById('btn-cancelar-tora').style.display = "none";

    setTimeout(() => {
        const inputCodigo = document.getElementById('tora-codigo');
        if (inputCodigo) {
            inputCodigo.focus();
            inputCodigo.select();
        }
    }, 60);
}

async function excluirTora(id) {
    const r = await Swal.fire({
        title: 'Excluir Tora?',
        text: "Isso não pode ser desfeito.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#6366f1',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sim, excluir',
        cancelButtonText: 'Cancelar'
    });

    if (r.isConfirmed) {
        try {
            await window.api.invoke('excluir-tora', id);
            avisar('success', 'Tora removida.');
            listarTorasRecentes();
        } catch (err) {
            Swal.fire({ title: 'Não permitido', text: tratarErroIpc(err), icon: 'error', confirmButtonColor: '#6366f1' });
        }
    }
}

// ============================================================
// BAIXAS DE ESTOQUE / ROMANEIO DE SAÍDA
// ============================================================
let torasParaBaixa = [];

async function buscarEAdicionarALista() {
    const input = document.getElementById('buscar-tora-codigo');
    const codigo = input.value.trim();
    if (!codigo) return;

    if (torasParaBaixa.some(t => t.codigo === codigo)) {
        return avisar('warning', 'Tora já adicionada à lista de baixa.');
    }

    try {
        const tora = await window.api.invoke('buscar-tora-por-codigo', codigo);
        if (!tora) {
            return Swal.fire('Não encontrada', `A tora número "${codigo}" não está disponível no pátio.`, 'warning');
        }

        torasParaBaixa.push(tora);
        input.value = "";
        atualizarTabelaBaixa();
        input.focus();
    } catch (err) {
        avisar('error', tratarErroIpc(err));
    }
}

function removerToraDaBaixa(id) {
    torasParaBaixa = torasParaBaixa.filter(t => t.id !== id);
    atualizarTabelaBaixa();
}

function limparListaTemporaria() {
    torasParaBaixa = [];
    atualizarTabelaBaixa();
}

function atualizarTabelaBaixa() {
    const tbody = document.getElementById('lista-baixa-temporaria');
    if (!tbody) return;

    let totalVol = 0;
    tbody.innerHTML = torasParaBaixa.map(t => {
        totalVol += (t.volume || 0);
        return `
            <tr>
                <td><strong>${t.codigo}</strong></td>
                <td>${t.especie_nome || '-'}</td>
                <td>${t.lote_numero || '-'}</td>
                <td>${t.m1} × ${t.m2} cm | ${(t.comprimento || 0).toFixed(2)} m</td>
                <td><span class="badge-volume">${(t.volume || 0).toFixed(3)} m³</span></td>
                <td style="text-align: right; padding-right: 25px;">
                    <button class="btn-icon-delete" onclick="removerToraDaBaixa(${t.id})" title="Remover"><i data-lucide="trash-2"></i></button>
                </td>
            </tr>
        `;
    }).join('');

    document.getElementById('total-volume-baixa').innerText = totalVol.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + " m³";
    document.getElementById('total-toras-baixa').innerText = `${torasParaBaixa.length} Toras selecionadas`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function processarBaixaEGerarPDF() {
    if (torasParaBaixa.length === 0) {
        return Swal.fire('Atenção', 'Selecione pelo menos uma tora para dar baixa.', 'warning');
    }

    const dataSaida = document.getElementById('saida-data').value || new Date().toISOString().split('T')[0];

    try {
        const ids = torasParaBaixa.map(t => t.id);
        const res = await window.api.invoke('processar-baixa-lote', { ids, dataSaida });

        if (res && res.success) {
            avisar('success', 'Baixa de estoque concluída com sucesso!');

            // Gerar PDF do Romaneio de Saída
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.text("ROMANEIO DE SAÍDA / BAIXA DE ESTOQUE", 14, 18);

            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(`Data de Saída: ${formatarDataBR(dataSaida)}`, 14, 25);
            doc.text(`Total de Peças: ${torasParaBaixa.length}`, 120, 25);

            const tableRows = torasParaBaixa.map((t, idx) => [
                idx + 1,
                t.codigo,
                t.especie_nome || '-',
                t.lote_numero || '-',
                `${t.m1} x ${t.m2} cm`,
                (t.comprimento || 0).toFixed(2),
                (t.volume || 0).toFixed(3)
            ]);

            doc.autoTable({
                head: [['#', 'Número', 'Espécie', 'Lote', 'Medidas (cm)', 'Comp (m)', 'Volume (m³)']],
                body: tableRows,
                startY: 32,
                theme: 'striped',
                styles: { fontSize: 8 },
                headStyles: { fillColor: [239, 68, 68] }
            });

            const totalVol = torasParaBaixa.reduce((s, t) => s + (t.volume || 0), 0);
            const finalY = doc.lastAutoTable.finalY + 10;
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text(`Volume Total Baixado: ${totalVol.toFixed(3)} m³`, 14, finalY);

            doc.save(`Baixa_Estoque_${dataSaida}.pdf`);

            limparListaTemporaria();
        }
    } catch (err) {
        avisar('error', tratarErroIpc(err));
    }
}

// ============================================================
// CONTROLE DE ESTOQUE GERAL
// ============================================================
let estoqueOffset = 0;
const estoqueLimite = 50;

async function carregarEstoque(reset = false) {
    if (reset) estoqueOffset = 0;

    const status = document.getElementById('filtro-estoque-status')?.value || 'todos';
    const loteId = document.getElementById('filtro-estoque-lote')?.value || 'todos';
    const especieId = document.getElementById('filtro-estoque-especie')?.value || 'todos';
    const codigo = document.getElementById('filtro-estoque-codigo')?.value.trim() || '';

    try {
        const totais = await window.api.invoke('get-totais-estoque', { status, loteId, especieId, codigo });
        const indQtd = document.getElementById('indicador-qtd-patio');
        const indVol = document.getElementById('indicador-vol-patio');
        if (indQtd) indQtd.innerText = totais.total_qtd || 0;
        if (indVol) indVol.innerText = (totais.total_vol || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

        const dados = await window.api.invoke('get-estoque-detalhado', {
            status, loteId, especieId, codigo, limite: estoqueLimite, offset: estoqueOffset
        });

        const toras = dados.toras || [];
        const tbody = document.getElementById('lista-estoque-corpo');
        if (!tbody) return;

        if (reset) tbody.innerHTML = '';

        if (toras.length === 0 && reset) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:#94a3b8;">Nenhuma tora encontrada com os filtros selecionados.</td></tr>';
        } else {
            const html = toras.map(t => `
                <tr>
                    <td><strong>${t.codigo}</strong></td>
                    <td>${t.especie_nome || '-'}</td>
                    <td>${t.lote_numero || '-'}</td>
                    <td>${t.m1} × ${t.m2} cm | ${(t.comprimento || 0).toFixed(2)} m</td>
                    <td><span class="badge-volume">${(t.volume || 0).toFixed(3)} m³</span></td>
                    <td><span class="badge-count" style="${t.status === 'serrada' ? 'background:#fee2e2; color:#ef4444;' : 'background:#dcfce7; color:#10b981;'}">${t.status === 'serrada' ? 'Serrada' : 'No Pátio'}</span></td>
                    <td>${formatarDataBR(t.data_entrada)}</td>
                </tr>
            `).join('');

            if (reset) tbody.innerHTML = html;
            else tbody.innerHTML += html;
        }

        const btnMais = document.getElementById('btn-carregar-mais');
        if (btnMais) {
            btnMais.style.display = (toras.length === estoqueLimite) ? 'inline-flex' : 'none';
        }

        estoqueOffset += toras.length;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        console.error("Erro ao carregar estoque:", err);
    }
}

// ============================================================
// MÓDULO FINANCEIRO: FECHAMENTOS DE MOTORISTAS & VALES
// ============================================================
let previaFechamentoAtual = null;

function switchFechamentoTab(tabName, element) {
    document.querySelectorAll('.tabs-container .tab-btn').forEach(b => b.classList.remove('active'));
    if (element) element.classList.add('active');

    document.querySelectorAll('#v-fechamentos .tab-content').forEach(c => c.style.display = 'none');
    const target = document.getElementById('tab-content-' + tabName);
    if (target) target.style.display = 'block';

    if (tabName === 'historico') carregarHistoricoFechamentos();
    if (tabName === 'vales') carregarVales();
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function carregarSelectsFechamentos() {
    await carregarMotoristas();
}

function toggleTipoFiltroFechamento() {
    const tipo = document.getElementById('fech-tipo-filtro').value;
    const rowDatas = document.getElementById('row-filtro-datas');
    const rowRomaneios = document.getElementById('row-filtro-romaneios');

    if (tipo === 'datas') {
        rowDatas.style.display = 'grid';
        rowRomaneios.style.display = 'none';
    } else {
        rowDatas.style.display = 'none';
        rowRomaneios.style.display = 'grid';
    }
}

function limparPreviaFechamento() {
    previaFechamentoAtual = null;
    const container = document.getElementById('container-previa-fechamento');
    if (container) container.style.display = 'none';
}

async function gerarPreviaFechamento() {
    const motoristaId = document.getElementById('fech-motorista-id').value;
    if (!motoristaId) return Swal.fire('Atenção', 'Selecione o motorista.', 'warning');

    const tipo = document.getElementById('fech-tipo-filtro').value;
    const dataInicio = document.getElementById('fech-data-inicio').value;
    const dataFim = document.getElementById('fech-data-fim').value;
    const romaneioInicio = document.getElementById('fech-rom-inicio').value.trim();
    const romaneioFim = document.getElementById('fech-rom-fim').value.trim();

    try {
        const res = await window.api.invoke('calcular-previa-fechamento', {
            motoristaId, dataInicio, dataFim, romaneioInicio, romaneioFim
        });

        if (!res || !res.success) throw new Error(res.error || 'Erro ao calcular prévia.');

        previaFechamentoAtual = res;
        const container = document.getElementById('container-previa-fechamento');
        container.style.display = 'block';

        document.getElementById('fech-resumo-salario').innerText = `R$ ${(res.motorista.salario || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        document.getElementById('fech-resumo-comissoes').innerText = `+ R$ ${(res.totalComissao || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        document.getElementById('fech-resumo-vales').innerText = `- R$ ${(res.totalVales || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        document.getElementById('fech-resumo-liquido').innerText = `R$ ${(res.totalLiquido || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

        const tbodyCargas = document.getElementById('fech-tabela-cargas');
        tbodyCargas.innerHTML = (res.cargas || []).map(c => `
            <tr>
                <td><strong>${c.numero}</strong></td>
                <td>${formatarDataBR(c.data)}</td>
                <td>${c.total_toras}</td>
                <td>${(c.vol_bruto || 0).toFixed(3)} m³</td>
                <td>R$ ${(c.frete_valor || 0).toFixed(2)}</td>
                <td>R$ ${(c.frete_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td style="color: #10b981; font-weight: bold;">R$ ${(c.valor_comissao || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            </tr>
        `).join('') || '<tr><td colspan="7" style="text-align:center; padding:20px;">Nenhuma carga encontrada no período.</td></tr>';

        const tbodyVales = document.getElementById('fech-tabela-vales-previa');
        tbodyVales.innerHTML = (res.vales || []).map(v => `
            <tr>
                <td style="text-align: center;"><input type="checkbox" class="chk-vale-previa" value="${v.id}" data-valor="${v.valor}" checked onchange="recalcularTotaisPreviaFechamento()"></td>
                <td>${formatarDataBR(v.data)}</td>
                <td style="color: #ef4444; font-weight: bold;">R$ ${(v.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td>${v.descricao || '-'}</td>
            </tr>
        `).join('') || '<tr><td colspan="4" style="text-align:center; padding:20px;">Nenhum vale em aberto.</td></tr>';

        const masterChk = document.getElementById('fech-vales-select-all');
        if (masterChk) masterChk.checked = true;

        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        avisar('error', tratarErroIpc(err));
    }
}

function toggleSelectAllValesPrevia(master) {
    document.querySelectorAll('.chk-vale-previa').forEach(c => c.checked = master.checked);
    recalcularTotaisPreviaFechamento();
}

function recalcularTotaisPreviaFechamento() {
    if (!previaFechamentoAtual) return;
    let totVales = 0;
    document.querySelectorAll('.chk-vale-previa:checked').forEach(c => {
        totVales += parseFloat(c.getAttribute('data-valor')) || 0;
    });

    const salario = previaFechamentoAtual.motorista.salario || 0;
    const comissao = previaFechamentoAtual.totalComissao || 0;
    const liquido = salario + comissao - totVales;

    document.getElementById('fech-resumo-vales').innerText = `- R$ ${totVales.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    document.getElementById('fech-resumo-liquido').innerText = `R$ ${liquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

async function confirmarSalvarFechamento() {
    if (!previaFechamentoAtual) return;

    const motoristaId = parseInt(document.getElementById('fech-motorista-id').value, 10);
    const dataInicio = document.getElementById('fech-data-inicio').value;
    const dataFim = document.getElementById('fech-data-fim').value;
    const romaneioInicio = document.getElementById('fech-rom-inicio').value.trim();
    const romaneioFim = document.getElementById('fech-rom-fim').value.trim();
    const observacoes = document.getElementById('fech-observacoes').value.trim();

    const valesIds = [];
    let totVales = 0;
    document.querySelectorAll('.chk-vale-previa:checked').forEach(c => {
        valesIds.push(parseInt(c.value, 10));
        totVales += parseFloat(c.getAttribute('data-valor')) || 0;
    });

    const salario = previaFechamentoAtual.motorista.salario || 0;
    const comissao = previaFechamentoAtual.totalComissao || 0;
    const liquido = salario + comissao - totVales;

    const dados = {
        motorista_id: motoristaId,
        periodo_inicio: dataInicio || 'N/A',
        periodo_fim: dataFim || 'N/A',
        romaneio_inicio: romaneioInicio || null,
        romaneio_fim: romaneioFim || null,
        valor_salario: salario,
        valor_comissao: comissao,
        valor_vales: totVales,
        valor_liquido: liquido,
        observacoes,
        valesIds
    };

    try {
        const res = await window.api.invoke('salvar-fechamento-motorista', dados);
        if (res && res.success) {
            avisar('success', 'Fechamento de motorista concluído com sucesso!');
            limparPreviaFechamento();
            switchFechamentoTab('historico');
        } else {
            throw new Error(res.error || 'Erro ao salvar fechamento.');
        }
    } catch (err) {
        avisar('error', tratarErroIpc(err));
    }
}

async function carregarHistoricoFechamentos() {
    try {
        const fechamentos = await window.api.invoke('listar-fechamentos-motorista');
        const tbody = document.getElementById('fech-tabela-historico');
        if (!tbody) return;

        tbody.innerHTML = fechamentos.map(f => `
            <tr>
                <td>#${f.id}</td>
                <td><strong>${f.motorista_nome}</strong></td>
                <td>${formatarDataBR(f.data_fechamento, true)}</td>
                <td>${formatarDataBR(f.periodo_inicio)} a ${formatarDataBR(f.periodo_fim)}</td>
                <td>R$ ${(f.valor_salario || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td style="color: #10b981;">+ R$ ${(f.valor_comissao || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td style="color: #ef4444;">- R$ ${(f.valor_vales || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td style="font-weight: bold;">R$ ${(f.valor_liquido || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td style="text-align: center;">
                    <button class="btn-save" style="padding: 5px 10px; font-size: 11px;" onclick="abrirModalReciboFechamento(${f.id})" title="Imprimir Recibo"><i data-lucide="receipt"></i></button>
                    <button class="btn-icon-delete" onclick="estornarFechamento(${f.id})" title="Estornar"><i data-lucide="rotate-ccw"></i></button>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="9" style="text-align:center; padding:30px; color:#94a3b8;">Nenhum fechamento registrado.</td></tr>';

        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        console.error("Erro ao carregar histórico de fechamentos:", err);
    }
}

async function abrirModalReciboFechamento(id) {
    try {
        const res = await window.api.invoke('get-fechamento-detalhado', id);
        if (!res || !res.success) return Swal.fire('Erro', 'Fechamento não encontrado.', 'error');

        const { fechamento, cargas, vales } = res;
        const modal = document.getElementById('modal-recibo-fechamento');
        modal.style.display = 'flex';

        const conteudo = document.getElementById('recibo-impressao-conteudo');
        conteudo.innerHTML = `
            <div style="border-bottom: 2px dashed #000; padding-bottom: 10px; margin-bottom: 15px; text-align: center;">
                <h2 style="font-size: 1.2rem; font-weight: bold; margin: 0;">EXTRATO DE FECHAMENTO DE MOTORISTA</h2>
                <p style="margin: 3px 0 0 0;">TORACONTROL - CONTROLE DE ESTOQUE E FRETE</p>
            </div>

            <div style="margin-bottom: 15px; line-height: 1.5;">
                <p><strong>Fechamento Nº:</strong> #${fechamento.id} &nbsp;|&nbsp; <strong>Data Emissão:</strong> ${formatarDataBR(fechamento.data_fechamento, true)}</p>
                <p><strong>Motorista:</strong> ${fechamento.motorista_nome} &nbsp;|&nbsp; <strong>Placa:</strong> ${fechamento.placa_veiculo || 'N/A'}</p>
                <p><strong>Período:</strong> ${formatarDataBR(fechamento.periodo_inicio)} a ${formatarDataBR(fechamento.periodo_fim)}</p>
            </div>

            <h4 style="border-bottom: 1px solid #000; padding-bottom: 3px; margin: 15px 0 5px 0;">1. DEMONSTRATIVO DE CARGAS E FRETES</h4>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 0.8rem;">
                <thead>
                    <tr style="border-bottom: 1px solid #000; text-align: left;">
                        <th>Romaneio</th>
                        <th>Data</th>
                        <th>Toras</th>
                        <th>Vol. Bruto</th>
                        <th>Frete (R$)</th>
                        <th style="text-align: right;">Comissão (R$)</th>
                    </tr>
                </thead>
                <tbody>
                    ${cargas.map(c => `
                        <tr>
                            <td>${c.numero}</td>
                            <td>${formatarDataBR(c.data)}</td>
                            <td>${c.total_toras}</td>
                            <td>${(c.vol_bruto || 0).toFixed(3)} m³</td>
                            <td>R$ ${(c.frete_total || 0).toFixed(2)}</td>
                            <td style="text-align: right;">R$ ${(c.valor_comissao || 0).toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <h4 style="border-bottom: 1px solid #000; padding-bottom: 3px; margin: 15px 0 5px 0;">2. ADIANTAMENTOS E VALES DESCONTADOS</h4>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 0.8rem;">
                <thead>
                    <tr style="border-bottom: 1px solid #000; text-align: left;">
                        <th>Data</th>
                        <th>Descrição</th>
                        <th style="text-align: right;">Valor (R$)</th>
                    </tr>
                </thead>
                <tbody>
                    ${vales.map(v => `
                        <tr>
                            <td>${formatarDataBR(v.data)}</td>
                            <td>${v.descricao || '-'}</td>
                            <td style="text-align: right;">R$ ${(v.valor || 0).toFixed(2)}</td>
                        </tr>
                    `).join('') || '<tr><td colspan="3">Nenhum vale descontado.</td></tr>'}
                </tbody>
            </table>

            <div style="border-top: 2px solid #000; padding-top: 10px; margin-top: 20px; font-size: 0.95rem;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <span>(+) Salário Fixo:</span>
                    <strong>R$ ${(fechamento.valor_salario || 0).toFixed(2)}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <span>(+) Total de Comissões:</span>
                    <strong>R$ ${(fechamento.valor_comissao || 0).toFixed(2)}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span>(-) Total de Vales:</span>
                    <strong>R$ ${(fechamento.valor_vales || 0).toFixed(2)}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 1.1rem; border-top: 1px solid #000; padding-top: 6px;">
                    <span>(=) VALOR LÍQUIDO A PAGAR:</span>
                    <strong style="color: #000;">R$ ${(fechamento.valor_liquido || 0).toFixed(2)}</strong>
                </div>
            </div>

            <div style="margin-top: 40px; display: flex; justify-content: space-around; text-align: center;">
                <div style="border-top: 1px solid #000; width: 220px; padding-top: 5px;">
                    Assinatura do Responsável
                </div>
                <div style="border-top: 1px solid #000; width: 220px; padding-top: 5px;">
                    Assinatura do Motorista
                </div>
            </div>
        `;
    } catch (err) {
        console.error("Erro ao detalhar recibo:", err);
    }
}

function fecharModalRecibo() {
    const modal = document.getElementById('modal-recibo-fechamento');
    if (modal) modal.style.display = 'none';
}

function imprimirReciboConteudo() {
    const conteudo = document.getElementById('recibo-impressao-conteudo').innerHTML;
    const janela = window.open('', '', 'width=800,height=600');
    janela.document.write(`
        <html>
            <head>
                <title>Recibo de Fechamento</title>
                <style>
                    body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; padding: 20px; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { padding: 4px 6px; }
                </style>
            </head>
            <body>${conteudo}</body>
        </html>
    `);
    janela.document.close();
    janela.focus();
    janela.print();
    janela.close();
}

async function estornarFechamento(id) {
    const r = await Swal.fire({
        title: 'Estornar Fechamento?',
        text: "Os vales descontados voltarão para o status 'em aberto'.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sim, estornar',
        cancelButtonText: 'Cancelar'
    });

    if (r.isConfirmed) {
        try {
            const res = await window.api.invoke('excluir-fechamento-motorista', id);
            if (res && res.success) {
                avisar('success', 'Fechamento estornado com sucesso!');
                carregarHistoricoFechamentos();
            } else {
                throw new Error(res.error || 'Erro ao estornar.');
            }
        } catch (err) {
            avisar('error', tratarErroIpc(err));
        }
    }
}

// --- VALES DE MOTORISTAS ---
async function carregarVales() {
    try {
        const vales = await window.api.invoke('listar-vales-motorista');
        const tbody = document.getElementById('vale-tabela-lista');
        if (!tbody) return;

        tbody.innerHTML = vales.map(v => `
            <tr>
                <td>${formatarDataBR(v.data)}</td>
                <td><strong>${v.motorista_nome}</strong></td>
                <td style="color: #ef4444; font-weight: bold;">R$ ${(v.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td>${v.descricao || '-'}</td>
                <td><span class="badge-count" style="${v.status === 'pago' ? 'background:#dcfce7; color:#10b981;' : 'background:#fef9c3; color:#a16207;'}">${v.status === 'pago' ? 'Pago (Descontado)' : 'Em Aberto'}</span></td>
                <td style="text-align: center;">
                    ${v.status === 'aberto' ? `
                        <button class="btn-icon-edit" onclick="prepararEdicaoVale('${encodeURIComponent(JSON.stringify(v))}')" title="Editar"><i data-lucide="pencil"></i></button>
                        <button class="btn-icon-delete" onclick="excluirVale(${v.id})" title="Excluir"><i data-lucide="trash-2"></i></button>
                    ` : '<span style="color:#94a3b8; font-size:11px;">Consolidado</span>'}
                </td>
            </tr>
        `).join('') || '<tr><td colspan="6" style="text-align:center; padding:30px; color:#94a3b8;">Nenhum vale lançado.</td></tr>';

        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        console.error("Erro ao listar vales:", err);
    }
}

async function salvarValeMotorista() {
    const id = document.getElementById('vale-id').value;
    const motorista_id = parseInt(document.getElementById('vale-motorista-id').value, 10);
    const valor = obterValorLimpo('vale-valor');
    const data = document.getElementById('vale-data').value;
    const descricao = document.getElementById('vale-descricao').value.trim();

    if (!motorista_id || valor <= 0 || !data) {
        return Swal.fire('Atenção', 'Selecione o motorista, informe o valor e a data.', 'warning');
    }

    try {
        const res = await window.api.invoke('salvar-vale-motorista', {
            id: id ? parseInt(id, 10) : null,
            motorista_id, valor, data, descricao
        });

        if (res && res.success) {
            avisar('success', id ? 'Vale atualizado!' : 'Vale cadastrado com sucesso!');
            resetFormVale();
            carregarVales();
        } else {
            throw new Error(res.error || 'Erro ao salvar vale.');
        }
    } catch (err) {
        avisar('error', tratarErroIpc(err));
    }
}

function prepararEdicaoVale(json) {
    const v = JSON.parse(decodeURIComponent(json));
    document.getElementById('vale-id').value = v.id;
    document.getElementById('vale-motorista-id').value = v.motorista_id;
    document.getElementById('vale-valor').value = (v.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    document.getElementById('vale-data').value = v.data;
    document.getElementById('vale-descricao').value = v.descricao || "";
    document.getElementById('btn-cancelar-vale').style.display = "inline-flex";
}

function resetFormVale() {
    document.getElementById('vale-id').value = "";
    document.getElementById('vale-valor').value = "";
    document.getElementById('vale-descricao').value = "";
    document.getElementById('btn-cancelar-vale').style.display = "none";
}

async function excluirVale(id) {
    const r = await Swal.fire({
        title: 'Excluir Vale?',
        text: "Isso não pode ser desfeito.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#6366f1',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sim, excluir',
        cancelButtonText: 'Cancelar'
    });

    if (r.isConfirmed) {
        try {
            const res = await window.api.invoke('excluir-vale-motorista', id);
            if (res && res.success) {
                avisar('success', 'Vale removido.');
                carregarVales();
            } else {
                throw new Error(res.error || 'Erro ao excluir.');
            }
        } catch (err) {
            Swal.fire({ title: 'Não permitido', text: tratarErroIpc(err), icon: 'error', confirmButtonColor: '#6366f1' });
        }
    }
}

// ============================================================
// RELATÓRIOS GERENCIAIS & FORNECEDORES & MOTORISTAS
// ============================================================
async function carregarFiltrosRelatorio() {
    await carregarEspecies();
    await carregarLotes();
    await carregarFornecedores();
    await carregarMotoristas();
}

function limparFiltrosRelatorio() {
    document.getElementById('rel-tipo').value = 'geral';
    document.getElementById('rel-data-inicio').value = '';
    document.getElementById('rel-data-fim').value = '';
    document.getElementById('rel-especie').value = 'todas';
    document.getElementById('rel-lote').value = 'todos';

    document.getElementById('rel-total-vol').innerText = '0,000 m³';
    document.getElementById('rel-total-qtd').innerText = '0 toras encontradas';
    document.getElementById('rel-tabela-corpo').innerHTML = `
        <tr><td colspan="6" style="text-align: center; padding: 40px; color: #94a3b8;">Ajuste os filtros e clique em "Visualizar" para carregar os dados.</td></tr>
    `;
    document.getElementById('container-resumos').innerHTML = '';
}

async function gerarPreviaRelatorio() {
    const tipo = document.getElementById('rel-tipo').value;
    const dataInicio = document.getElementById('rel-data-inicio').value;
    const dataFim = document.getElementById('rel-data-fim').value;
    const especieId = document.getElementById('rel-especie').value;
    const loteId = document.getElementById('rel-lote').value;

    try {
        const toras = await window.api.invoke('buscar-dados-relatorio', { tipo, dataInicio, dataFim, especieId, loteId });
        const resumo = await window.api.invoke('get-resumo-gerencial', { tipo, dataInicio, dataFim, especieId, loteId });

        document.getElementById('rel-total-vol').innerText = (resumo.volTotalGeral || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3 }) + " m³";
        document.getElementById('rel-total-qtd').innerText = `${resumo.qtdTotalGeral || 0} toras encontradas`;

        const tbody = document.getElementById('rel-tabela-corpo');
        if (toras.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #94a3b8;">Nenhum registro encontrado com estes filtros.</td></tr>';
        } else {
            tbody.innerHTML = toras.map(t => `
                <tr>
                    <td><strong>${t.codigo}</strong></td>
                    <td>${t.especie_nome || '-'}</td>
                    <td>${t.lote_numero || '-'}</td>
                    <td style="text-align: center;">${t.m1} × ${t.m2} cm | ${(t.comprimento || 0).toFixed(2)} m</td>
                    <td style="text-align: center;"><span class="badge-volume">${(t.volume || 0).toFixed(3)} m³</span></td>
                    <td style="text-align: right; padding-right: 20px;">${formatarDataBR(t.status === 'serrada' ? t.data_saida : t.data_entrada)}</td>
                </tr>
            `).join('');
        }

        const containerResumos = document.getElementById('container-resumos');
        if (resumo.resumoEspecies) {
            containerResumos.innerHTML = `
                <div class="form-card" style="margin-top: 20px;">
                    <div class="form-header">
                        <div class="header-icon"><i data-lucide="pie-chart"></i></div>
                        <div><h3>Resumo por Espécie</h3></div>
                    </div>
                    <div class="form-body" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 15px;">
                        ${Object.keys(resumo.resumoEspecies).map(esp => {
                            const r = resumo.resumoEspecies[esp];
                            return `
                                <div class="dash-lotes-container" style="padding: 15px;">
                                    <h4 style="margin: 0 0 8px 0;">${esp}</h4>
                                    <p style="margin: 0; font-size: 13px; color: #64748b;">Pátio: ${r.pQtd} toras (${r.pVol.toFixed(3)} m³)</p>
                                    <p style="margin: 0; font-size: 13px; color: #64748b;">Serradas: ${r.sQtd} toras (${r.sVol.toFixed(3)} m³)</p>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        console.error("Erro ao gerar relatório:", err);
    }
}

async function exportarRelatorioPDF() {
    const tipo = document.getElementById('rel-tipo').value;
    const dataInicio = document.getElementById('rel-data-inicio').value;
    const dataFim = document.getElementById('rel-data-fim').value;
    const especieId = document.getElementById('rel-especie').value;
    const loteId = document.getElementById('rel-lote').value;

    const toras = await window.api.invoke('buscar-dados-relatorio', { tipo, dataInicio, dataFim, especieId, loteId });
    if (toras.length === 0) return Swal.fire('Atenção', 'Nenhum dado para exportar.', 'warning');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(`RELATÓRIO GERENCIAL - ${tipo.toUpperCase()}`, 14, 18);

    const tableRows = toras.map((t, idx) => [
        idx + 1,
        t.codigo,
        t.especie_nome || '-',
        t.lote_numero || '-',
        `${t.m1} x ${t.m2} cm`,
        (t.comprimento || 0).toFixed(2),
        (t.volume || 0).toFixed(3),
        t.status === 'serrada' ? 'Serrada' : 'No Pátio',
        formatarDataBR(t.status === 'serrada' ? t.data_saida : t.data_entrada)
    ]);

    doc.autoTable({
        head: [['#', 'Número', 'Espécie', 'Lote', 'Medidas (cm)', 'Comp (m)', 'Vol (m³)', 'Status', 'Data']],
        body: tableRows,
        startY: 28,
        theme: 'striped',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [99, 102, 241] }
    });

    const totVol = toras.reduce((s, t) => s + (t.volume || 0), 0);
    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total de Toras: ${toras.length} | Volume Total: ${totVol.toFixed(3)} m³`, 14, finalY);

    doc.save(`Relatorio_${tipo}_${Date.now()}.pdf`);
}

async function exportarRelatorioExcel() {
    const tipo = document.getElementById('rel-tipo').value;
    const dataInicio = document.getElementById('rel-data-inicio').value;
    const dataFim = document.getElementById('rel-data-fim').value;
    const especieId = document.getElementById('rel-especie').value;
    const loteId = document.getElementById('rel-lote').value;

    const toras = await window.api.invoke('buscar-dados-relatorio', { tipo, dataInicio, dataFim, especieId, loteId });
    if (toras.length === 0) return Swal.fire('Atenção', 'Nenhum dado para exportar.', 'warning');

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Relatório');

    worksheet.columns = [
        { header: 'Número', key: 'codigo', width: 12 },
        { header: 'Espécie', key: 'especie', width: 20 },
        { header: 'Lote', key: 'lote', width: 15 },
        { header: 'M1 (cm)', key: 'm1', width: 12 },
        { header: 'M2 (cm)', key: 'm2', width: 12 },
        { header: 'Comprimento (m)', key: 'comp', width: 16 },
        { header: 'Volume (m³)', key: 'vol', width: 14 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Data', key: 'data', width: 14 }
    ];

    toras.forEach(t => {
        worksheet.addRow({
            codigo: t.codigo,
            especie: t.especie_nome || '-',
            lote: t.lote_numero || '-',
            m1: t.m1,
            m2: t.m2,
            comp: t.comprimento,
            vol: t.volume,
            status: t.status === 'serrada' ? 'Serrada' : 'No Pátio',
            data: formatarDataBR(t.status === 'serrada' ? t.data_saida : t.data_entrada)
        });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Relatorio_${tipo}_${Date.now()}.xlsx`;
    link.click();
}

// --- RELATÓRIO DE ENTRADAS POR FORNECEDOR ---
async function gerarRelatorioFornecedor() {
    const fornecedorId = document.getElementById('rel-forn-id').value;
    const dataInicio = document.getElementById('rel-forn-inicio').value;
    const dataFim = document.getElementById('rel-forn-fim').value;
    const romaneioInicio = document.getElementById('rel-forn-rom-inicio').value.trim();
    const romaneioFim = document.getElementById('rel-forn-rom-fim').value.trim();

    try {
        const romaneios = await window.api.invoke('relatorio-entradas-fornecedor', {
            fornecedorId, dataInicio, dataFim, romaneioInicio, romaneioFim
        });

        const container = document.getElementById('rel-forn-tabela-container');
        const resumo = document.getElementById('rel-forn-resumo');
        const tbody = document.getElementById('rel-forn-tabela-corpo');

        container.style.display = 'block';
        resumo.style.display = 'flex';

        let totToras = 0;
        let totLiq = 0;
        let totBruto = 0;
        let totFrete = 0;

        tbody.innerHTML = romaneios.map(r => {
            totToras += (r.total_toras || 0);
            totLiq += (r.vol_liquido || 0);
            totBruto += (r.vol_bruto || 0);
            totFrete += (r.frete_total || 0);

            return `
                <tr>
                    <td><strong>${r.numero}</strong></td>
                    <td>${formatarDataBR(r.data)}</td>
                    <td>${r.fornecedor_nome || '-'}</td>
                    <td style="text-align: center;">${r.total_toras}</td>
                    <td style="text-align: center;"><span class="badge-volume">${(r.vol_liquido || 0).toFixed(3)} m³</span></td>
                    <td style="text-align: center;"><span class="badge-volume" style="background:#f1f5f9; color:#475569;">${(r.vol_bruto || 0).toFixed(3)} m³</span></td>
                    <td style="text-align: right; color: #f59e0b; font-weight: bold;">R$ ${(r.frete_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                </tr>
            `;
        }).join('') || '<tr><td colspan="7" style="text-align:center; padding:20px;">Nenhum romaneio encontrado com estes filtros.</td></tr>';

        document.getElementById('tot-forn-rom').innerText = romaneios.length.toString();
        document.getElementById('tot-forn-toras').innerText = totToras.toString();
        document.getElementById('tot-forn-liq').innerText = totLiq.toFixed(3) + " m³";
        document.getElementById('tot-forn-bruto').innerText = totBruto.toFixed(3) + " m³";
        document.getElementById('tot-forn-frete').innerText = `R$ ${totFrete.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    } catch (err) {
        console.error("Erro no relatório de fornecedor:", err);
    }
}

async function exportarRelatorioFornecedorPDF() {
    const fornecedorId = document.getElementById('rel-forn-id').value;
    const dataInicio = document.getElementById('rel-forn-inicio').value;
    const dataFim = document.getElementById('rel-forn-fim').value;
    const romaneioInicio = document.getElementById('rel-forn-rom-inicio').value.trim();
    const romaneioFim = document.getElementById('rel-forn-rom-fim').value.trim();

    const romaneios = await window.api.invoke('relatorio-entradas-fornecedor', {
        fornecedorId, dataInicio, dataFim, romaneioInicio, romaneioFim
    });
    if (romaneios.length === 0) return Swal.fire('Atenção', 'Nenhum dado para exportar.', 'warning');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text("RELATÓRIO DE ENTRADAS POR FORNECEDOR", 14, 18);

    const tableRows = romaneios.map((r, idx) => [
        idx + 1,
        r.numero,
        formatarDataBR(r.data),
        r.fornecedor_nome || '-',
        r.total_toras,
        (r.vol_liquido || 0).toFixed(3),
        (r.vol_bruto || 0).toFixed(3),
        `R$ ${(r.frete_total || 0).toFixed(2)}`
    ]);

    doc.autoTable({
        head: [['#', 'Romaneio', 'Data', 'Fornecedor', 'Toras', 'Vol Líq (m³)', 'Vol Bruto (m³)', 'Frete Total']],
        body: tableRows,
        startY: 28,
        theme: 'striped',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [99, 102, 241] }
    });

    doc.save(`Relatorio_Fornecedor_${Date.now()}.pdf`);
}

function limparRelatorioFornecedor() {
    document.getElementById('rel-forn-id').value = 'todos';
    document.getElementById('rel-forn-inicio').value = '';
    document.getElementById('rel-forn-fim').value = '';
    document.getElementById('rel-forn-rom-inicio').value = '';
    document.getElementById('rel-forn-rom-fim').value = '';
    document.getElementById('rel-forn-tabela-container').style.display = 'none';
    document.getElementById('rel-forn-resumo').style.display = 'none';
}

// --- RELATÓRIO DE CARGAS POR MOTORISTA & COMISSÃO ---
async function gerarRelatorioMotorista() {
    const motoristaId = document.getElementById('rel-moto-id').value;
    const dataInicio = document.getElementById('rel-moto-inicio').value;
    const dataFim = document.getElementById('rel-moto-fim').value;
    const romaneioInicio = document.getElementById('rel-moto-rom-inicio').value.trim();
    const romaneioFim = document.getElementById('rel-moto-rom-fim').value.trim();

    try {
        const cargas = await window.api.invoke('relatorio-cargas-motorista', {
            motoristaId, dataInicio, dataFim, romaneioInicio, romaneioFim
        });

        const container = document.getElementById('rel-moto-tabela-container');
        const resumo = document.getElementById('rel-moto-resumo');
        const tbody = document.getElementById('rel-moto-tabela-corpo');

        container.style.display = 'block';
        resumo.style.display = 'flex';

        let totToras = 0;
        let totBruto = 0;
        let totFrete = 0;
        let totComissao = 0;

        tbody.innerHTML = cargas.map(c => {
            const comissaoPct = c.comissao || 0;
            const valComissao = (c.frete_total || 0) * (comissaoPct / 100);

            totToras += (c.total_toras || 0);
            totBruto += (c.vol_bruto || 0);
            totFrete += (c.frete_total || 0);
            totComissao += valComissao;

            return `
                <tr>
                    <td><strong>${c.numero}</strong></td>
                    <td>${formatarDataBR(c.data)}</td>
                    <td>${c.motorista_nome || '-'}</td>
                    <td style="text-align: center;">${c.total_toras}</td>
                    <td style="text-align: center;"><span class="badge-volume">${(c.vol_bruto || 0).toFixed(3)} m³</span></td>
                    <td style="text-align: right;">R$ ${(c.frete_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td style="text-align: center;">${comissaoPct}%</td>
                    <td style="text-align: right; color: #10b981; font-weight: bold;">R$ ${valComissao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                </tr>
            `;
        }).join('') || '<tr><td colspan="8" style="text-align:center; padding:20px;">Nenhuma carga encontrada.</td></tr>';

        document.getElementById('tot-moto-cargas').innerText = cargas.length.toString();
        document.getElementById('tot-moto-toras').innerText = totToras.toString();
        document.getElementById('tot-moto-bruto').innerText = totBruto.toFixed(3) + " m³";
        document.getElementById('tot-moto-frete').innerText = `R$ ${totFrete.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        document.getElementById('tot-moto-comissao').innerText = `R$ ${totComissao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    } catch (err) {
        console.error("Erro no relatório de motorista:", err);
    }
}

async function exportarRelatorioMotoristaPDF() {
    const motoristaId = document.getElementById('rel-moto-id').value;
    const dataInicio = document.getElementById('rel-moto-inicio').value;
    const dataFim = document.getElementById('rel-moto-fim').value;
    const romaneioInicio = document.getElementById('rel-moto-rom-inicio').value.trim();
    const romaneioFim = document.getElementById('rel-moto-rom-fim').value.trim();

    const cargas = await window.api.invoke('relatorio-cargas-motorista', {
        motoristaId, dataInicio, dataFim, romaneioInicio, romaneioFim
    });
    if (cargas.length === 0) return Swal.fire('Atenção', 'Nenhum dado para exportar.', 'warning');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text("RELATÓRIO DE CARGAS POR MOTORISTA (COMISSÃO)", 14, 18);

    const tableRows = cargas.map((c, idx) => {
        const comissaoPct = c.comissao || 0;
        const valComissao = (c.frete_total || 0) * (comissaoPct / 100);
        return [
            idx + 1,
            c.numero,
            formatarDataBR(c.data),
            c.motorista_nome || '-',
            c.total_toras,
            (c.vol_bruto || 0).toFixed(3),
            `R$ ${(c.frete_total || 0).toFixed(2)}`,
            `${comissaoPct}%`,
            `R$ ${valComissao.toFixed(2)}`
        ];
    });

    doc.autoTable({
        head: [['#', 'Romaneio', 'Data', 'Motorista', 'Toras', 'Vol Bruto (m³)', 'Frete Total', 'Comissão %', 'Valor Comissão']],
        body: tableRows,
        startY: 28,
        theme: 'striped',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [99, 102, 241] }
    });

    doc.save(`Relatorio_Motorista_${Date.now()}.pdf`);
}

function limparRelatorioMotorista() {
    document.getElementById('rel-moto-id').value = 'todos';
    document.getElementById('rel-moto-inicio').value = '';
    document.getElementById('rel-moto-fim').value = '';
    document.getElementById('rel-moto-rom-inicio').value = '';
    document.getElementById('rel-moto-rom-fim').value = '';
    document.getElementById('rel-moto-tabela-container').style.display = 'none';
    document.getElementById('rel-moto-resumo').style.display = 'none';
}

// ============================================================
// DASHBOARD & GRÁFICOS ANALÍTICOS (SVG)
// ============================================================
async function atualizarDashboard() {
    try {
        const data = await window.api.invoke('get-dashboard-data');
        if (!data) return;

        document.getElementById('dash-total-pecas').innerText = data.totalPecas || 0;
        document.getElementById('dash-total-volume').innerText = (data.totalVolume || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3 });
        document.getElementById('dash-acoes-hoje').innerText = data.logsHoje || 0;

        const tbodyRecentes = document.getElementById('dash-lista-recente');
        if (tbodyRecentes) {
            tbodyRecentes.innerHTML = (data.ultimasToras || []).map(t => `
                <tr>
                    <td><strong>${t.codigo}</strong></td>
                    <td>${t.especie || '-'}</td>
                    <td>${(t.volume || 0).toFixed(3)} m³</td>
                    <td class="text-right">${formatarDataBR(t.data_entrada)}</td>
                </tr>
            `).join('');
        }

        const divLotes = document.getElementById('dash-lista-lotes');
        if (divLotes) {
            divLotes.innerHTML = (data.resumoLotes || []).map(l => `
                <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border-color); font-size: 13px;">
                    <span>Lote <strong>${l.lote}</strong> (${l.totalToras} toras)</span>
                    <span style="color: #6366f1; font-weight: 600;">${(l.volumeTotal || 0).toFixed(3)} m³</span>
                </div>
            `).join('');
        }

        const divRanking = document.getElementById('dash-ranking-especies');
        if (divRanking) {
            divRanking.innerHTML = (data.rankingEspecies || []).map(e => `
                <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border-color); font-size: 13px;">
                    <span>${e.especie}</span>
                    <span style="color: #10b981; font-weight: 600;">${(e.volumeTotal || 0).toFixed(3)} m³</span>
                </div>
            `).join('');
        }

        const divLogs = document.getElementById('dash-logs-recentes');
        if (divLogs) {
            divLogs.innerHTML = (data.logsRecentes || []).map(l => `
                <div style="padding: 6px 0; border-bottom: 1px solid var(--border-color); font-size: 12px; color: var(--text-main);">
                    <strong>${formatarDataBR(l.data_hora, true)}</strong>: ${l.descricao}
                </div>
            `).join('');
        }

        renderizarGraficoMovimentacaoMensal(data.historicoMovimentacao || []);
        renderizarGraficoEspeciesDonut(data.rankingEspecies || []);

        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        console.error("Erro no dashboard:", err);
    }
}

function renderizarGraficoMovimentacaoMensal(dados) {
    const container = document.getElementById('chart-volume-movimentacao');
    if (!container) return;

    if (!dados || dados.length === 0) {
        container.innerHTML = '<p style="margin: auto; color: var(--text-main);">Sem dados de movimentação recente.</p>';
        return;
    }

    let maxVol = 1;
    dados.forEach(d => {
        if (d.entradas > maxVol) maxVol = d.entradas;
        if (d.saidas > maxVol) maxVol = d.saidas;
    });

    const maxGraphHeight = 180; // px

    container.innerHTML = dados.map(d => {
        const hEntradas = Math.max(4, Math.round((d.entradas / maxVol) * maxGraphHeight));
        const hSaidas = Math.max(4, Math.round((d.saidas / maxVol) * maxGraphHeight));

        return `
            <div style="display: flex; flex-direction: column; align-items: center; gap: 8px; flex: 1; height: 100%; justify-content: flex-end;">
                <div style="display: flex; gap: 6px; align-items: flex-end; height: ${maxGraphHeight}px;">
                    <div title="Entradas: ${d.entradas.toFixed(3)} m³" style="width: 18px; height: ${hEntradas}px; background: #6366f1; border-radius: 4px 4px 0 0; transition: height 0.3s ease;"></div>
                    <div title="Saídas: ${d.saidas.toFixed(3)} m³" style="width: 18px; height: ${hSaidas}px; background: #ef4444; border-radius: 4px 4px 0 0; transition: height 0.3s ease;"></div>
                </div>
                <span style="font-size: 11px; color: var(--text-main); font-weight: 500;">${d.label}</span>
            </div>
        `;
    }).join('') + `
        <div style="position: absolute; top: -15px; right: 10px; display: flex; gap: 15px; font-size: 11px;">
            <span style="display: flex; align-items: center; gap: 5px;"><span style="width: 10px; height: 10px; background: #6366f1; border-radius: 2px;"></span> Entradas</span>
            <span style="display: flex; align-items: center; gap: 5px;"><span style="width: 10px; height: 10px; background: #ef4444; border-radius: 2px;"></span> Saídas</span>
        </div>
    `;
}

function renderizarGraficoEspeciesDonut(dados) {
    const container = document.getElementById('chart-especies-donut');
    if (!container) return;

    if (!dados || dados.length === 0) {
        container.innerHTML = '<p style="color: var(--text-main);">Nenhuma espécie em estoque.</p>';
        return;
    }

    const totalVol = dados.reduce((sum, e) => sum + (e.volumeTotal || 0), 0);
    if (totalVol <= 0) {
        container.innerHTML = '<p style="color: var(--text-main);">Estoque zerado.</p>';
        return;
    }

    const cores = ['#6366f1', '#10b981', '#f59e0b', '#06b6d4', '#ec4899', '#8b5cf6'];
    let accumulatedAngle = 0;
    const size = 180;
    const center = size / 2;
    const radius = 70;
    const strokeWidth = 26;

    const circumference = 2 * Math.PI * radius;
    let strokeDashoffsets = 0;

    const paths = dados.map((e, idx) => {
        const pct = (e.volumeTotal || 0) / totalVol;
        const dashArray = `${pct * circumference} ${circumference}`;
        const dashOffset = -strokeDashoffsets;
        strokeDashoffsets += pct * circumference;
        const cor = cores[idx % cores.length];

        return `
            <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${cor}"
                stroke-width="${strokeWidth}" stroke-dasharray="${dashArray}" stroke-dashoffset="${dashOffset}"
                transform="rotate(-90 ${center} ${center})">
                <title>${e.especie}: ${(e.volumeTotal || 0).toFixed(3)} m³ (${(pct * 100).toFixed(1)}%)</title>
            </circle>
        `;
    }).join('');

    container.innerHTML = `
        <div style="display: flex; align-items: center; gap: 20px;">
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
                ${paths}
                <text x="${center}" y="${center + 4}" text-anchor="middle" font-size="14" font-weight="bold" fill="var(--text-dark)">${totalVol.toFixed(1)} m³</text>
            </svg>
            <div style="display: flex; flex-direction: column; gap: 6px; font-size: 11px;">
                ${dados.map((e, idx) => `
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="width: 8px; height: 8px; background: ${cores[idx % cores.length]}; border-radius: 50%;"></span>
                        <span style="color: var(--text-main);">${e.especie}</span>
                        <strong style="color: var(--text-dark);">${(((e.volumeTotal || 0) / totalVol) * 100).toFixed(0)}%</strong>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

async function buscarNumeroGlobal() {
    const input = document.getElementById('busca-global-numero');
    const codigo = input.value.trim();
    if (!codigo) return;

    try {
        const res = await window.api.invoke('buscar-tora-por-numero', codigo);
        if (res && res.success && res.data) {
            const t = res.data;
            Swal.fire({
                title: `Tora Número ${t.codigo}`,
                html: `
                    <div style="text-align: left; font-size: 14px; line-height: 1.6;">
                        <p><strong>Espécie:</strong> ${t.especie_nome || '-'}</p>
                        <p><strong>Lote:</strong> ${t.lote_nome || t.lote_numero || '-'}</p>
                        <p><strong>Medidas:</strong> ${t.m1} × ${t.m2} cm | ${(t.comprimento || 0).toFixed(2)} m</p>
                        <p><strong>Volume:</strong> ${(t.volume || 0).toFixed(3)} m³</p>
                        <p><strong>Status:</strong> <span style="font-weight: bold; color: ${t.status === 'serrada' ? '#ef4444' : '#10b981'};">${t.status === 'serrada' ? 'Serrada (Baixada)' : 'No Pátio'}</span></p>
                        <p><strong>Entrada:</strong> ${formatarDataBR(t.data_entrada)}</p>
                        ${t.data_saida ? `<p><strong>Saída:</strong> ${formatarDataBR(t.data_saida)}</p>` : ''}
                    </div>
                `,
                icon: 'info',
                confirmButtonColor: '#6366f1'
            });
        } else {
            Swal.fire('Não encontrada', `A tora número "${codigo}" não foi localizada no sistema.`, 'warning');
        }
    } catch (err) {
        avisar('error', tratarErroIpc(err));
    }
}

// ============================================================
// LOGS DO SISTEMA
// ============================================================
async function carregarLogs() {
    const acao = document.getElementById('log-filtro-acao')?.value || 'todos';
    const dataInicio = document.getElementById('input-filtro-data-inicio-logs')?.value || '';
    const dataFim = document.getElementById('input-filtro-data-fim-logs')?.value || '';

    try {
        const res = await window.api.invoke('listar-logs', { acao, dataInicio, dataFim });
        const logs = (res && res.success) ? res.data : [];

        const tbody = document.getElementById('lista-logs');
        if (!tbody) return;

        tbody.innerHTML = logs.map(l => `
            <tr>
                <td>${formatarDataBR(l.data_hora, true)}</td>
                <td>${l.usuario || 'Operador'}</td>
                <td><span class="badge-count">${l.acao}</span></td>
                <td>${l.descricao}</td>
            </tr>
        `).join('') || '<tr><td colspan="4" style="text-align:center; padding:30px; color:#94a3b8;">Nenhum log encontrado.</td></tr>';

        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        console.error("Erro ao carregar logs:", err);
    }
}

function limparFiltrosLogs() {
    document.getElementById('log-filtro-acao').value = 'todos';
    document.getElementById('input-filtro-data-inicio-logs').value = '';
    document.getElementById('input-filtro-data-fim-logs').value = '';
    carregarLogs();
}

async function exportarLogsPDF() {
    const acao = document.getElementById('log-filtro-acao')?.value || 'todos';
    const dataInicio = document.getElementById('input-filtro-data-inicio-logs')?.value || '';
    const dataFim = document.getElementById('input-filtro-data-fim-logs')?.value || '';

    const res = await window.api.invoke('listar-logs', { acao, dataInicio, dataFim });
    const logs = (res && res.success) ? res.data : [];

    if (logs.length === 0) return Swal.fire('Atenção', 'Nenhum log para exportar.', 'warning');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text("LOG DE AUDITORIA DO SISTEMA", 14, 18);

    const tableRows = logs.map(l => [
        formatarDataBR(l.data_hora, true),
        l.usuario || 'Operador',
        l.acao,
        l.descricao
    ]);

    doc.autoTable({
        head: [['Data/Hora', 'Usuário', 'Ação', 'Descrição']],
        body: tableRows,
        startY: 28,
        theme: 'striped',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [71, 85, 105] }
    });

    doc.save(`Logs_${Date.now()}.pdf`);
}

// ============================================================
// CONFIGURAÇÕES E BACKUP AUTOMÁTICO AGENDADO
// ============================================================
async function carregarConfiguracoesBackup() {
    try {
        const config = await window.api.invoke('get-backup-config');
        if (config) {
            const inputHorarios = document.getElementById('cfg-backup-horarios');
            const inputPasta = document.getElementById('cfg-backup-pasta');
            const chkAtivo = document.getElementById('cfg-backup-ativo');

            if (inputHorarios) inputHorarios.value = (config.horarios || []).join(', ');
            if (inputPasta) inputPasta.value = config.pasta || '';
            if (chkAtivo) chkAtivo.checked = !!config.ativo;
        }
    } catch (err) {
        console.error("Erro ao carregar configurações de backup:", err);
    }
}

async function selecionarPastaBackup() {
    try {
        const pasta = await window.api.invoke('selecionar-pasta-backup');
        if (pasta) {
            document.getElementById('cfg-backup-pasta').value = pasta;
        }
    } catch (err) {
        console.error("Erro ao selecionar pasta:", err);
    }
}

async function salvarConfigsBackup() {
    const horariosStr = document.getElementById('cfg-backup-horarios').value.trim();
    const pasta = document.getElementById('cfg-backup-pasta').value.trim();
    const ativo = document.getElementById('cfg-backup-ativo').checked;

    const horarios = horariosStr.split(',')
        .map(h => h.trim())
        .filter(h => /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(h));

    if (ativo && (!pasta || horarios.length === 0)) {
        return Swal.fire('Atenção', 'Para ativar o backup automático, selecione a pasta e informe ao menos um horário no formato HH:MM (ex: 12:00, 18:00).', 'warning');
    }

    try {
        const res = await window.api.invoke('set-backup-config', { ativo, horarios, pasta });
        if (res && res.success) {
            avisar('success', 'Configurações de backup salvas com sucesso!');
        } else {
            throw new Error('Falha ao salvar configuração.');
        }
    } catch (err) {
        avisar('error', err.message);
    }
}

async function fazerBackup() {
    try {
        const res = await window.api.invoke('exportar-backup');
        if (res && res.success) {
            Swal.fire({
                icon: 'success',
                title: 'Backup Concluído',
                text: res.message,
                confirmButtonColor: '#6366f1'
            });
        }
    } catch (err) {
        avisar('error', tratarErroIpc(err));
    }
}

async function restaurarDados() {
    const { isConfirmed } = await Swal.fire({
        title: 'Restaurar Banco de Dados?',
        text: "Atenção: Todos os dados atuais serão substituídos pelo arquivo de backup!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#f59e0b',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sim, substituir tudo',
        cancelButtonText: 'Cancelar',
        reverseButtons: true
    });

    if (isConfirmed) {
        Swal.fire({
            title: 'Restaurando...',
            html: 'Aguarde enquanto os dados são processados.',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        const resultado = await window.api.invoke('importar-backup');

        if (resultado.success) {
            await Swal.fire({
                icon: 'success',
                title: 'Restauração Concluída',
                text: resultado.message,
                confirmButtonColor: '#6366f1'
            });
            window.location.reload();
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Erro na Importação',
                text: resultado.message,
                confirmButtonColor: '#6366f1'
            });
        }
    }
}

async function resetarSistemaCompleto() {
    const { isConfirmed } = await Swal.fire({
        title: 'Resetar Banco de Dados?',
        text: "Esta ação apagará permanentemente todas as toras, lotes, espécies, fornecedores, motoristas e logs!",
        icon: 'error',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sim, apagar tudo',
        cancelButtonText: 'Cancelar'
    });

    if (isConfirmed) {
        try {
            await window.api.invoke('limpar-banco-dados');
            await Swal.fire('Limpo', 'Todos os dados foram apagados com sucesso.', 'success');
            window.location.reload();
        } catch (err) {
            avisar('error', tratarErroIpc(err));
        }
    }
}