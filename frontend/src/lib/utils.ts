import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export const cn = (...i: ClassValue[]) => twMerge(clsx(i));
export const fmtTime = (s?: string | null) =>
  s ? new Date(s.replace(' ', 'T')).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
export const fmtDay = (s: string) =>
  new Date(s.slice(0, 10) + 'T00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
export const hhmm = (s?: string | null) => (s ? s.slice(11, 16) : '');
export const hoursWorked = (a?: string | null, b?: string | null) =>
  a && b ? ((new Date(b.replace(' ', 'T')).getTime() - new Date(a.replace(' ', 'T')).getTime()) / 3600000).toFixed(2) : '—';
