import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from './api';

export interface User { id: number; name: string; username: string; email?: string | null; phone?: string | null; profilePicture?: string | null; role: 'employee' | 'admin' }
const Ctx = createContext<{ user: User | null; loading: boolean; login: (t: string, u: User) => void; updateUser: (u: User) => void; logout: () => void }>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!localStorage.getItem('token'));
  useEffect(() => {
    if (localStorage.getItem('token')) api('/me').then(setUser).catch(() => {}).finally(() => setLoading(false));
  }, []);
  const login = (t: string, u: User) => { localStorage.setItem('token', t); setUser(u); };
  const updateUser = (u: User) => setUser(u);
  const logout = () => { localStorage.removeItem('token'); setUser(null); };
  return <Ctx.Provider value={{ user, loading, login, updateUser, logout }}>{children}</Ctx.Provider>;
}
