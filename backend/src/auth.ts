import jwt from 'jsonwebtoken';
import { NextFunction, Request, Response } from 'express';

export interface AuthUser { id: number; role: 'employee' | 'admin' }
export type AuthedRequest = Request & { user: AuthUser };

export const signToken = (u: AuthUser) => jwt.sign(u, process.env.JWT_SECRET!, { expiresIn: '12h' });

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  try {
    (req as AuthedRequest).user = jwt.verify(token || '', process.env.JWT_SECRET!) as AuthUser;
    next();
  } catch { res.status(401).json({ error: 'Please sign in again.' }); }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if ((req as AuthedRequest).user.role !== 'admin') return res.status(403).json({ error: 'Admins only.' });
  next();
}
