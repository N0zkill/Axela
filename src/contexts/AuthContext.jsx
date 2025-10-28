import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ensureProfile, getProfile } from '@/lib/profileService';

const AuthContext = createContext();

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState(null);
  const handledOAuthRef = useRef(false);

  useEffect(() => {
    let isMounted = true;
    let initialResolved = false;
    let fallbackTimer = null;
    let subscription = null;

    const updateAuthState = async (nextSession) => {
      if (!isMounted) return;
      setSession(nextSession);
      setIsAuthenticated(Boolean(nextSession));
      setUser(nextSession?.user ?? null);
      
      // Load or create user profile when authenticated
      if (nextSession?.user) {
        const { data: profileData } = await ensureProfile(nextSession.user);
        if (profileData && isMounted) {
          setProfile(profileData);
        }
      } else {
        setProfile(null);
      }
    };

    const finalizeInitialLoad = () => {
      if (!isMounted || initialResolved) return;
      initialResolved = true;
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      setIsLoading(false);
    };

    const removeOAuthParamsFromUrl = (options = {}) => {
      if (typeof window === 'undefined') return;

      const { removeQuery = true, removeHash = true } = options;

      const url = new URL(window.location.href);
      const paramsToStrip = ['code', 'state', 'scope', 'prompt', 'authuser', 'hd', 'session_state'];
      let queryDirty = false;
      if (removeQuery) {
        paramsToStrip.forEach((param) => {
          if (url.searchParams.has(param)) {
            url.searchParams.delete(param);
            queryDirty = true;
          }
        });
      }

      let hashDirty = false;
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
      const hashKeysToStrip = [
        'access_token',
        'refresh_token',
        'expires_in',
        'token_type',
        'provider_token',
        'type',
      ];
      if (removeHash) {
        hashKeysToStrip.forEach((key) => {
          if (hashParams.has(key)) {
            hashParams.delete(key);
            hashDirty = true;
          }
        });
      }

      if (queryDirty || hashDirty) {
        const nextSearch = url.searchParams.toString();
        const nextHash = hashParams.toString();
        const cleanedUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${nextHash ? `#${nextHash}` : ''}`;
        window.history.replaceState({}, document.title, cleanedUrl);
      }
    };

    const cleanupOAuthQuery = () => {
      if (handledOAuthRef.current) return;
      handledOAuthRef.current = true;
      removeOAuthParamsFromUrl({ removeQuery: true, removeHash: true });
    };

    const checkForOAuthError = () => {
      if (typeof window === 'undefined') return;

      const url = new URL(window.location.href);
      const error = url.searchParams.get('error');
      const errorDescription = url.searchParams.get('error_description');

      if (!error && !errorDescription) {
        return;
      }

      console.error('OAuth callback returned an error', error, errorDescription);
      cleanupOAuthQuery();
      finalizeInitialLoad();
    };

    const initAuth = async () => {
      const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
        updateAuthState(nextSession);

        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
          if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
            cleanupOAuthQuery();
          }
          finalizeInitialLoad();
        }
      });

      subscription = data?.subscription ?? null;
      fallbackTimer = setTimeout(finalizeInitialLoad, 3000);

      checkForOAuthError();

      try {
        const { data: sessionData, error } = await supabase.auth.getSession();
        if (error) {
          console.error('Failed to fetch auth session', error);
        }
        updateAuthState(sessionData?.session ?? null);
      } catch (error) {
        console.error('Unexpected auth initialization error', error);
      } finally {
        removeOAuthParamsFromUrl({ removeQuery: false, removeHash: true });
        finalizeInitialLoad();
      }
    };

    initAuth();

    return () => {
      isMounted = false;
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
      }
      subscription?.unsubscribe?.();
    };
  }, []);

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    setSession(data.session);
    setIsAuthenticated(true);
    setUser(data.user);
    return data;
  };

  const signUp = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    setIsAuthenticated(false);
    setUser(null);
    setProfile(null);
    setSession(null);
  };

  const signInWithGoogle = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) throw error;
    return data;
  };

  const signInWithGithub = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) throw error;
    return data;
  };

  const value = {
    isAuthenticated,
    user,
    profile,
    session,
    isLoading,
    signIn,
    signUp,
    signOut,
    signInWithGoogle,
    signInWithGithub,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
