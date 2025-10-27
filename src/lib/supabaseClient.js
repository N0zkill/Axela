import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  console.error('Missing Supabase environment variables. Please check your .env file in project root.');
  console.error('Required: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY');
}

const createStorageAdapter = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  const hasElectronBridge = Boolean(
    window.electronAPI?.getSetting && window.electronAPI?.setSetting
  );
  const hasLocalStorage = typeof window.localStorage !== 'undefined';

  if (!hasElectronBridge && !hasLocalStorage) {
    return null;
  }

  return {
    async getItem(key) {
      try {
        if (hasElectronBridge) {
          const value = await window.electronAPI.getSetting(key);
          return value ?? null;
        }
        return window.localStorage.getItem(key);
      } catch (error) {
        console.error('Failed to read auth session from storage', error);
        return null;
      }
    },
    async setItem(key, value) {
      try {
        if (hasElectronBridge) {
          await window.electronAPI.setSetting(key, value);
        } else {
          window.localStorage.setItem(key, value);
        }
      } catch (error) {
        console.error('Failed to persist auth session', error);
      }
    },
    async removeItem(key) {
      try {
        if (hasElectronBridge) {
          await window.electronAPI.setSetting(key, null);
        } else {
          window.localStorage.removeItem(key);
        }
      } catch (error) {
        console.error('Failed to clear auth session from storage', error);
      }
    },
  };
};

const storageAdapter = createStorageAdapter();

const authOptions = {
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true,
};

if (storageAdapter) {
  authOptions.storage = storageAdapter;
  authOptions.storageKey = 'axela.auth.session';
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: authOptions,
});
