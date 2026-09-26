import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as authService from '../services/authService';
import {
  clearSession,
  getStoredUser,
  getToken,
  saveSession,
  updateStoredUser,
  TOKEN_STORAGE_KEY,
} from '../services/authStorage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    authService
      .getMe()
      .then((data) => {
        setUser(data.user);
        updateStoredUser(data.user);
      })
      .catch(() => {
        clearSession();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // Signing out (or an expired session) in another tab signs this tab out too.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === TOKEN_STORAGE_KEY && !e.newValue) setUser(null);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const login = useCallback(async (email, password, remember = true) => {
    const data = await authService.login(email, password);
    saveSession(data.token, data.user, remember);
    setUser(data.user);
    return data.user;
  }, []);

  // Used after registration and Google sign-in, which already hold a fresh token + user.
  const establishSession = useCallback((token, sessionUser, remember = true) => {
    saveSession(token, sessionUser, remember);
    setUser(sessionUser);
    return sessionUser;
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, establishSession }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
