import { Request } from 'express';

const p = (n: number) => String(n).padStart(2, '0');
export const fmtDate = (d = new Date()) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
export const fmtDateTime = (d = new Date()) => `${fmtDate(d)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;

export const clientIp = (req: Request) =>
  ((req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || '').trim().replace('::ffff:', '');

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
      { headers: { 'User-Agent': 'dtr-app/1.0' } });
    const j: any = await r.json();
    return j.display_name || `${lat}, ${lng}`;
  } catch { return `${lat}, ${lng}`; }
}

export const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) + 1;
