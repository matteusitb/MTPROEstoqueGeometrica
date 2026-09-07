import { create } from 'zustand';
import { supabase } from '../utils/supabaseClient';

export interface UserLicenseInfo {
  id: string;
  email: string;
  machine_id: string | null;
  status_licenca: string;
  data_validade: string | null;
}

interface AuthState {
  isAuthenticated: boolean;
  user: UserLicenseInfo | null;
  isOfflineMode: boolean;
  isLoading: boolean;
  error: string | null;
  loginWithSupabase: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

// Gera o hash SHA-256 de uma senha concatenada com um salt
export async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  user: null,
  isOfflineMode: false,
  isLoading: false,
  error: null,

  loginWithSupabase: async (email, password) => {
    set({ isLoading: true, error: null });
    
    // Obter o Hardware ID da máquina física atual para validação local e remota
    let currentMachineId = '';
    if (window.electronAPI && typeof window.electronAPI.getHardwareId === 'function') {
      currentMachineId = await window.electronAPI.getHardwareId();
    } else {
      console.warn('Electron API (getHardwareId) não detectada. Usando fallback.');
      currentMachineId = 'development-web-client-id';
    }

    const emailLimpo = email.toLowerCase().trim();
    const isOnline = navigator.onLine;

    // Caso estejamos sem rede, vamos direto para o login offline
    if (!isOnline) {
      return await tentarLoginOffline(emailLimpo, password, currentMachineId);
    }

    try {
      // 1. Autenticar no Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: emailLimpo,
        password,
      });

      if (authError) {
        let msg = authError.message;
        // Erro específico de credenciais incorretas (usuário ou senha incorretos)
        if (msg === 'Invalid login credentials') {
          throw new Error('E-mail ou senha incorretos.');
        } 
        
        // Se for erro de rede/conexão intermitente do Supabase, tenta o fluxo offline
        if (msg.includes('Connection error') || msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
          console.warn('Erro de rede durante login online. Tentando login offline...', msg);
          return await tentarLoginOffline(emailLimpo, password, currentMachineId);
        }
        
        throw new Error(msg);
      }

      if (!authData.user) {
        throw new Error('Falha ao recuperar informações do usuário.');
      }

      const userId = authData.user.id;

      // 2. Buscar informações na tabela public.licencas
      const { data: licenca, error: licencaError } = await supabase
        .from('licencas')
        .select('*')
        .eq('id', userId)
        .single();

      if (licencaError || !licenca) {
        await supabase.auth.signOut();
        throw new Error('Nenhuma licença encontrada vinculada a este usuário.');
      }

      // 3. Validar status da licença
      if (licenca.status_licenca !== 'ativa') {
        await supabase.auth.signOut();
        throw new Error(`Esta licença está com o status: ${licenca.status_licenca}.`);
      }

      // 4. Validar data de validade da licença
      if (licenca.data_validade) {
        const validade = new Date(licenca.data_validade);
        const hoje = new Date();
        validade.setHours(23, 59, 59, 999);
        hoje.setHours(0, 0, 0, 0);

        if (validade < hoje) {
          await supabase.auth.signOut();
          const dataFormatada = new Date(licenca.data_validade).toLocaleDateString('pt-BR');
          throw new Error(`Sua licença expirou em ${dataFormatada}.`);
        }
      }

      // 5. Validar o machine_id (estritamente pré-cadastrado)
      if (!licenca.machine_id) {
        await supabase.auth.signOut();
        throw new Error('Este dispositivo não está pré-cadastrado para esta conta.');
      } else if (licenca.machine_id !== currentMachineId) {
        await supabase.auth.signOut();
        throw new Error('Esta conta está vinculada a outro dispositivo.');
      }

      // 6. Atualizar a cópia da licença localmente para permitir login offline futuro
      if (window.electronAPI && typeof window.electronAPI.executeDB === 'function') {
        try {
          const salt = Math.random().toString(36).substring(2) + Date.now().toString(36);
          const senhaHash = await hashPassword(password, salt);
          
          await window.electronAPI.executeDB(
            `INSERT OR REPLACE INTO licenca_local 
             (id, email, machine_id, status_licenca, data_validade, senha_hash, salt, ultimo_login) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              licenca.id,
              emailLimpo,
              licenca.machine_id,
              licenca.status_licenca,
              licenca.data_validade || null,
              senhaHash,
              salt,
              new Date().toISOString()
            ]
          );
        } catch (dbErr) {
          console.error('Falha ao salvar dados de login offline localmente:', dbErr);
        }
      }

      // Tudo ok!
      set({
        isAuthenticated: true,
        user: licenca as UserLicenseInfo,
        isOfflineMode: false,
        isLoading: false,
        error: null,
      });
      return true;
    } catch (err: any) {
      // Se por algum motivo falhar com erro de rede no catch geral, tenta o login offline
      const isNetworkErr = err.message && (
        err.message.includes('fetch') || 
        err.message.includes('Network') || 
        err.message.includes('conexão')
      );
      if (isNetworkErr) {
        return await tentarLoginOffline(emailLimpo, password, currentMachineId);
      }

      set({
        isAuthenticated: false,
        user: null,
        isOfflineMode: false,
        error: err.message || 'Ocorreu um erro inesperado.',
        isLoading: false,
      });
      return false;
    }

    // Função interna auxiliar para tentar validar as credenciais offline no banco local
    async function tentarLoginOffline(emailLocal: string, senhaLocal: string, machineIdFisico: string): Promise<boolean> {
      try {
        if (!window.electronAPI || typeof window.electronAPI.queryDB !== 'function') {
          throw new Error('Sem conexão com a internet. O ambiente local não suporta login offline.');
        }

        // Consultar banco SQLite local
        const res = await window.electronAPI.queryDB<any>(
          `SELECT * FROM licenca_local WHERE LOWER(email) = ?`,
          [emailLocal]
        );

        if (!res || !res.success || !res.data || res.data.length === 0) {
          throw new Error('Sem conexão com a internet. O primeiro acesso desse usuário precisa ser feito online.');
        }

        const localUser = res.data[0];

        // Validar senha
        const hashCalculado = await hashPassword(senhaLocal, localUser.salt);
        if (hashCalculado !== localUser.senha_hash) {
          throw new Error('E-mail ou senha incorretos.');
        }

        // Validar status da licença local
        if (localUser.status_licenca !== 'ativa') {
          throw new Error(`Esta licença está com o status: ${localUser.status_licenca}.`);
        }

        // Validar validade da licença local
        if (localUser.data_validade) {
          const validade = new Date(localUser.data_validade);
          const hoje = new Date();
          validade.setHours(23, 59, 59, 999);
          hoje.setHours(0, 0, 0, 0);

          if (validade < hoje) {
            const dataFormatada = new Date(localUser.data_validade).toLocaleDateString('pt-BR');
            throw new Error(`Sua licença expirou em ${dataFormatada}.`);
          }
        }

        // Validar se está rodando no mesmo computador
        if (localUser.machine_id !== machineIdFisico) {
          throw new Error('Esta conta está vinculada a outro dispositivo.');
        }

        // Registrar último login offline
        await window.electronAPI.executeDB(
          `UPDATE licenca_local SET ultimo_login = ? WHERE id = ?`,
          [new Date().toISOString(), localUser.id]
        );

        // Definir sucesso no estado como Modo Offline
        set({
          isAuthenticated: true,
          user: {
            id: localUser.id,
            email: localUser.email,
            machine_id: localUser.machine_id,
            status_licenca: localUser.status_licenca,
            data_validade: localUser.data_validade
          },
          isOfflineMode: true,
          isLoading: false,
          error: null,
        });

        console.log('Login efetuado com sucesso no modo offline.');
        return true;
      } catch (errOffline: any) {
        set({
          isAuthenticated: false,
          user: null,
          isOfflineMode: false,
          error: errOffline.message || 'Erro ao efetuar login offline.',
          isLoading: false,
        });
        return false;
      }
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('Erro ao deslogar do Supabase:', e);
    }
    set({
      isAuthenticated: false,
      user: null,
      isOfflineMode: false,
      isLoading: false,
      error: null,
    });
  },

  clearError: () => set({ error: null }),
}));
