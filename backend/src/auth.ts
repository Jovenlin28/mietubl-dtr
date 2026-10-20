import jwt from 'jsonwebtoken';
import { NextFunction, Request, Response } from 'express';
import { pool } from './db';

export interface AuthUser { id: number; role: 'employee' | 'admin' }
export type AuthedRequest = Request & { user: AuthUser };

export const signToken = (u: AuthUser) => jwt.sign(u, process.env.JWT_SECRET!, { expiresIn: '12h' });

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  let user: AuthUser;
  try {
    user = jwt.verify(token || '', process.env.JWT_SECRET!) as AuthUser;
  } catch {
    return res.status(401).json({ error: 'Please sign in again.' });
  }

  const [rows]: any = await pool.query('SELECT is_active FROM users WHERE id=?', [user.id]);
  if (!rows[0] || !rows[0].is_active) {
    return res.status(401).json({ error: 'This account is inactive. Contact an administrator.' });
  }
  (req as AuthedRequest).user = user;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if ((req as AuthedRequest).user.role !== 'admin') return res.status(403).json({ error: 'Admins only.' });
  next();
}
