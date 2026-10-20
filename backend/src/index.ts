import 'dotenv/config';
import 'express-async-errors';
import express, { NextFunction, Request, Response } from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { initDb, pool } from './db';
import { hashPassword, verifyPassword } from './password';
import { AuthedRequest, requireAdmin, requireAuth, signToken } from './auth';
import { clientIp, daysBetween, fmtDate, fmtDateTime, reverseGeocode } from './util';
import {
  calculateLateMinutes,
  calculateLatePenalty,
  calculateHoursBasedPay,
  calculateStatutoryContributions,
} from './payroll';

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN }));
app.use(express.json({ limit: '2mb' }));
const uid = (req: Request) => (req as AuthedRequest).user.id;

// ---------- Username/password auth ----------
const authLimiter = rateLimit({ windowMs: 60_000, max: 10 });

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { username, password } = z.object({
    username: z.string().trim().min(1).max(80),
    password: z.string().min(1).max(128),
  }).parse(req.body);
  const [rows]: any = await pool.query(
    'SELECT id, name, username, email, phone, password, role, profile_picture AS profilePicture FROM users WHERE username=? AND is_active=1',
    [username]);
  const user = rows[0];
  if (!user || !user.password || !verifyPassword(password, user.password)) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const { password: _password, ...publicUser } = user;
  res.json({ token: signToken({ id: user.id, role: user.role }), user: publicUser });
});

app.get('/api/me', requireAuth, async (req, res) => {
  const [rows]: any = await pool.query('SELECT id, name, username, email, phone, role, profile_picture AS profilePicture FROM users WHERE id=?', [uid(req)]);
  res.json(rows[0]);
});

app.put('/api/me/profile', requireAuth, async (req, res) => {
  const dataUrl = z.string().max(1_500_000).regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z\d+/]+={0,2}$/).nullable();
  const { fullName, username, email, phone, profilePicture, currentPassword, newPassword } = z.object({
    fullName: z.string().trim().min(1).max(120),
    username: z.string().trim().min(1).max(80),
    email: z.preprocess(
      (value) => typeof value === 'string' && !value.trim() ? null : typeof value === 'string' ? value.trim() : value,
      z.string().email().max(190).nullable()),
    phone: z.preprocess(
      (value) => typeof value === 'string' && !value.trim() ? null : typeof value === 'string' ? value.trim() : value,
      z.string().regex(/^(?=(?:\D*\d){7,15}\D*$)\+?[0-9\s().-]+$/).max(30).nullable()),
    profilePicture: dataUrl.optional(),
    currentPassword: z.string().max(128).optional(),
    newPassword: z.string().min(8).max(128).optional(),
  }).parse(req.body);
  if (Boolean(currentPassword) !== Boolean(newPassword)) {
    return res.status(400).json({ error: 'Enter both the current and new password to change your password.' });
  }

  if (newPassword) {
    const [rows]: any = await pool.query('SELECT password FROM users WHERE id=?', [uid(req)]);
    if (!rows[0]?.password || !verifyPassword(currentPassword!, rows[0].password)) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }
  }

  const fields = ['username=?', 'name=?', 'email=?', 'phone=?'];
  const values: unknown[] = [username, fullName, email, phone];
  if (profilePicture !== undefined) {
    fields.push('profile_picture=?');
    values.push(profilePicture);
  }
  if (newPassword) {
    fields.push('password=?');
    values.push(hashPassword(newPassword));
  }

  try {
    values.push(uid(req));
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id=?`, values);
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Username, email, or contact number is already in use.' });
    throw error;
  }

  const [rows]: any = await pool.query('SELECT id, name, username, email, phone, role, profile_picture AS profilePicture FROM users WHERE id=?', [uid(req)]);
  res.json(rows[0]);
});

// ---------- Time logs ----------
const geo = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

app.get('/api/logs', requireAuth, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM time_logs WHERE user_id=? ORDER BY log_date DESC LIMIT 90', [uid(req)]);
  res.json(rows);
});

app.post('/api/logs/time-in', requireAuth, async (req, res) => {
  const { lat, lng } = geo.parse(req.body);
  const [ex]: any = await pool.query('SELECT time_in FROM time_logs WHERE user_id=? AND log_date=?', [uid(req), fmtDate()]);
  if (ex[0]?.time_in) return res.status(409).json({ error: 'You already timed in today.' });
  const address = await reverseGeocode(lat, lng);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO time_logs (user_id, log_date, time_in, in_lat, in_lng, in_address, in_ip) VALUES (?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE time_in=VALUES(time_in), in_lat=VALUES(in_lat), in_lng=VALUES(in_lng), in_address=VALUES(in_address), in_ip=VALUES(in_ip)`,
      [uid(req), fmtDate(), fmtDateTime(), lat, lng, address, clientIp(req)]);
    await invalidatePayrollAttendance(conn, uid(req), fmtDate(), fmtDate());
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
  res.json({ ok: true });
});

app.post('/api/logs/time-out', requireAuth, async (req, res) => {
  const { lat, lng } = geo.parse(req.body);
  const [ex]: any = await pool.query('SELECT time_in, time_out FROM time_logs WHERE user_id=? AND log_date=?', [uid(req), fmtDate()]);
  if (!ex[0]?.time_in) return res.status(409).json({ error: 'Time in first, or edit today’s log if you forgot.' });
  if (ex[0].time_out) return res.status(409).json({ error: 'You already timed out today.' });
  const address = await reverseGeocode(lat, lng);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE time_logs SET time_out=?, out_lat=?, out_lng=?, out_address=?, out_ip=? WHERE user_id=? AND log_date=?',
      [fmtDateTime(), lat, lng, address, clientIp(req), uid(req), fmtDate()]);
    await invalidatePayrollAttendance(conn, uid(req), fmtDate(), fmtDate());
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
  res.json({ ok: true });
});

// Fix a forgotten time in / time out (today or past days only; flagged as edited, reason required)
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional();
app.put('/api/logs/:date', requireAuth, async (req, res) => {
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.params.date);
  if (date > fmtDate()) return res.status(400).json({ error: 'You can’t edit a future date.' });
  const { timeIn, timeOut, reason } = z.object({ timeIn: hhmm, timeOut: hhmm, reason: z.string().min(5) }).parse(req.body);
  if (timeIn && timeOut && timeOut <= timeIn) return res.status(400).json({ error: 'Time out must be after time in.' });
  const ip = clientIp(req);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO time_logs (user_id, log_date, time_in, time_out, in_ip, out_ip, edited, edit_reason) VALUES (?,?,?,?,?,?,1,?)
       ON DUPLICATE KEY UPDATE time_in=COALESCE(VALUES(time_in), time_in), time_out=COALESCE(VALUES(time_out), time_out),
         in_ip=COALESCE(VALUES(in_ip), in_ip), out_ip=COALESCE(VALUES(out_ip), out_ip), edited=1, edit_reason=VALUES(edit_reason)`,
      [uid(req), date, timeIn ? `${date} ${timeIn}:00` : null, timeOut ? `${date} ${timeOut}:00` : null, timeIn ? ip : null, timeOut ? ip : null, reason]);
    await invalidatePayrollAttendance(conn, uid(req), date, date);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
  res.json({ ok: true });
});

// ---------- Leaves ----------
app.get('/api/leave-categories', requireAuth, async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT id, name FROM leave_categories
     WHERE status='active' ORDER BY name`);
  res.json(rows);
});

app.get('/api/leaves/balance', requireAuth, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT c.id AS categoryId, c.name AS category, b.credits,
       COALESCE(p.pendingDays, 0) AS pendingDays,
       GREATEST(b.credits - COALESCE(p.pendingDays, 0), 0) AS availableCredits
     FROM leave_balances b JOIN leave_categories c ON c.id=b.category_id
     LEFT JOIN (
       SELECT category_id, SUM(days) AS pendingDays
       FROM leave_requests
       WHERE user_id=? AND status='pending'
       GROUP BY category_id
     ) p ON p.category_id=b.category_id
     WHERE b.user_id=? AND c.status='active' ORDER BY c.name`,
    [uid(req), uid(req)]);
  res.json(rows);
});
app.get('/api/leaves', requireAuth, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT r.id, r.category_id AS categoryId, c.name AS category, r.start_date,
       r.end_date, r.days, r.reason, r.status, r.reviewed_by, r.reviewed_at,
       r.admin_note, r.created_at
     FROM leave_requests r JOIN leave_categories c ON c.id=r.category_id
     WHERE r.user_id=? ORDER BY r.created_at DESC`,
    [uid(req)]);
  res.json(rows);
});
app.post('/api/leaves', requireAuth, async (req, res) => {
  const b = z.object({
    categoryId: z.number().int().positive(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().max(500).optional(),
  }).parse(req.body);
  const days = daysBetween(b.startDate, b.endDate);
  if (!(days >= 1)) return res.status(400).json({ error: 'End date must be on or after start date.' });
  const [categoryRows]: any = await pool.query(
    "SELECT id FROM leave_categories WHERE id=? AND status='active'",
    [b.categoryId]);
  if (!categoryRows[0]) return res.status(400).json({ error: 'Selected leave category is not active.' });
  const [bal]: any = await pool.query(
    'SELECT credits FROM leave_balances WHERE user_id=? AND category_id=?',
    [uid(req), b.categoryId]);
  if (!bal[0]) return res.status(400).json({ error: 'No leave credits are configured for this category.' });
  const [pend]: any = await pool.query(
    "SELECT COALESCE(SUM(days),0) d FROM leave_requests WHERE user_id=? AND category_id=? AND status='pending'",
    [uid(req), b.categoryId]);
  if (Number(bal[0].credits) - Number(pend[0].d) < days) return res.status(400).json({ error: 'Not enough leave credits.' });
  await pool.query(
    'INSERT INTO leave_requests (user_id, category_id, start_date, end_date, days, reason) VALUES (?,?,?,?,?,?)',
    [uid(req), b.categoryId, b.startDate, b.endDate, days, b.reason ?? null]);
  res.json({ ok: true });
});
app.delete('/api/leaves/:id', requireAuth, async (req, res) => {
  await pool.query("UPDATE leave_requests SET status='cancelled' WHERE id=? AND user_id=? AND status='pending'", [req.params.id, uid(req)]);
  res.json({ ok: true });
});

// ---------- Admin ----------
const admin = [requireAuth, requireAdmin];

app.get('/api/admin/leave-categories', ...admin, async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT id, name, credits_per_year AS creditsPerYear, status
     FROM leave_categories ORDER BY name`);
  res.json(rows);
});

const leaveCategorySchema = z.object({
  name: z.string().trim().min(1).max(100),
  creditsPerYear: z.number().finite().min(0).max(999999.9),
  status: z.enum(['active', 'inactive']).default('active'),
});

app.post('/api/admin/leave-categories', ...admin, async (req, res) => {
  const category = leaveCategorySchema.parse(req.body);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result]: any = await conn.query(
      'INSERT INTO leave_categories (name, credits_per_year, status) VALUES (?,?,?)',
      [category.name, category.creditsPerYear, category.status]);
    await conn.query(
      `INSERT INTO leave_balances (user_id, category_id, credits)
       SELECT id, ?, ? FROM users WHERE role='employee' AND is_active=1`,
      [result.insertId, category.creditsPerYear]);
    await conn.commit();
    res.status(201).json({ id: result.insertId, ...category });
  } catch (error: any) {
    await conn.rollback();
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A leave category with that name already exists.' });
    throw error;
  } finally {
    conn.release();
  }
});

app.put('/api/admin/leave-categories/:id', ...admin, async (req, res) => {
  const category = leaveCategorySchema.parse(req.body);
  const categoryId = z.coerce.number().int().positive().parse(req.params.id);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [existing]: any = await conn.query(
      'SELECT id FROM leave_categories WHERE id=? FOR UPDATE',
      [categoryId]);
    if (!existing[0]) {
      await conn.rollback();
      return res.status(404).json({ error: 'Leave category not found.' });
    }
    await conn.query(
      `UPDATE leave_categories
       SET name=?, credits_per_year=?, status=? WHERE id=?`,
      [category.name, category.creditsPerYear, category.status, categoryId]);
    await conn.query(
      `INSERT IGNORE INTO leave_balances (user_id, category_id, credits)
       SELECT id, ?, ? FROM users WHERE role='employee' AND is_active=1`,
      [categoryId, category.creditsPerYear]);
    await conn.commit();
    res.json({ id: categoryId, ...category });
  } catch (error: any) {
    await conn.rollback();
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A leave category with that name already exists.' });
    throw error;
  } finally {
    conn.release();
  }
});

app.delete('/api/admin/leave-categories/:id', ...admin, async (req, res) => {
  const categoryId = z.coerce.number().int().positive().parse(req.params.id);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [categories]: any = await conn.query(
      'SELECT id FROM leave_categories WHERE id=? FOR UPDATE',
      [categoryId]);
    if (!categories[0]) {
      await conn.rollback();
      return res.status(404).json({ error: 'Leave category not found.' });
    }
    const [requests]: any = await conn.query(
      'SELECT COUNT(*) AS total FROM leave_requests WHERE category_id=?',
      [categoryId]);
    if (Number(requests[0].total) > 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'This category is used by leave request history. Deactivate it instead to preserve those records.' });
    }
    await conn.query('DELETE FROM leave_categories WHERE id=?', [categoryId]);
    await conn.commit();
    res.json({ ok: true });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
});

async function invalidatePayrollAttendance(
  conn: any,
  userId: number,
  startDate: string,
  endDate: string,
) {
  await conn.query(
    `UPDATE payroll_items i
     JOIN payroll_runs r ON r.id=i.payroll_run_id
     SET i.attendance_verified_by=NULL, i.attendance_verified_at=NULL,
         i.computed_hours=NULL, i.computed_pay=NULL,
         i.late_minutes=0, i.late_penalty=0,
         i.reviewed_by=NULL, i.reviewed_at=NULL
     WHERE i.user_id=? AND r.status='draft'
       AND r.period_start<=? AND r.period_end>=?`,
    [userId, endDate, startDate]);
}

async function invalidateAllDraftPayrollAttendance(conn: any) {
  await conn.query(
    `UPDATE payroll_items i JOIN payroll_runs r ON r.id=i.payroll_run_id
     SET i.attendance_verified_by=NULL, i.attendance_verified_at=NULL,
         i.computed_hours=NULL, i.computed_pay=NULL,
         i.late_minutes=0, i.late_penalty=0,
         i.reviewed_by=NULL, i.reviewed_at=NULL
     WHERE r.status='draft'`);
}

app.get('/api/admin/dashboard', ...admin, async (_req, res) => {
  const today = fmtDate();
  const [[employeeRows], [presentRows], [leaveRows], [pendingRows], [recentLeaves]]: any = await Promise.all([
    pool.query("SELECT COUNT(*) total FROM users WHERE role='employee' AND is_active=1"),
    pool.query(
      `SELECT COUNT(DISTINCT u.id) total
       FROM users u JOIN time_logs t ON t.user_id=u.id
       WHERE u.role='employee' AND u.is_active=1 AND t.log_date=? AND t.time_in IS NOT NULL`,
      [today]),
    pool.query(
      `SELECT COUNT(DISTINCT u.id) total
       FROM users u JOIN leave_requests l ON l.user_id=u.id
       WHERE u.role='employee' AND u.is_active=1 AND l.status='approved' AND l.start_date<=? AND l.end_date>=?`,
      [today, today]),
    pool.query("SELECT COUNT(*) total FROM leave_requests WHERE status='pending'"),
    pool.query(
      `SELECT l.id, u.name, c.name AS category, l.start_date, l.end_date, l.status, l.created_at
       FROM leave_requests l JOIN users u ON u.id=l.user_id
       JOIN leave_categories c ON c.id=l.category_id
       ORDER BY l.created_at DESC LIMIT 6`),
  ]);

  res.json({
    date: today,
    employeeCount: Number(employeeRows[0].total),
    presentToday: Number(presentRows[0].total),
    onLeaveToday: Number(leaveRows[0].total),
    pendingLeaveRequests: Number(pendingRows[0].total),
    recentLeaveRequests: recentLeaves,
  });
});
app.get('/api/admin/users', ...admin, async (_req, res) => {
  const [rows] = await pool.query('SELECT id, name, username, email, phone, role, created_at FROM users WHERE is_active=1 ORDER BY name');
  res.json(rows);
});
const userFields = {
  fullName: z.string().trim().min(1).max(120),
  username: z.string().trim().min(1).max(80),
  email: z.preprocess(
    (value) => typeof value === 'string' && !value.trim() ? null : typeof value === 'string' ? value.trim() : value,
    z.string().email().max(190).nullable()),
  phone: z.preprocess(
    (value) => typeof value === 'string' && !value.trim() ? null : typeof value === 'string' ? value.trim() : value,
    z.string().regex(/^(?=(?:\D*\d){7,15}\D*$)\+?[0-9\s().-]+$/).max(30).nullable()),
  role: z.enum(['admin', 'employee']),
};
const createUserSchema = z.object({ ...userFields, password: z.string().min(8).max(128) });
const updateUserSchema = z.object({ ...userFields, password: z.string().min(8).max(128).optional() }).partial();

app.post('/api/admin/users', ...admin, async (req, res) => {
  const user = createUserSchema.parse(req.body);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result]: any = await connection.query(
      'INSERT INTO users (name, username, email, phone, password, role) VALUES (?,?,?,?,?,?)',
      [user.fullName, user.username, user.email, user.phone, hashPassword(user.password), user.role]);
    if (user.role === 'employee') {
      await connection.query(
        `INSERT INTO leave_balances (user_id, category_id, credits)
         SELECT ?, id, credits_per_year FROM leave_categories WHERE status='active'`,
        [result.insertId]);
    }
    await connection.commit();
    res.status(201).json({ id: result.insertId, name: user.fullName, username: user.username, email: user.email, phone: user.phone, role: user.role });
  } catch (error: any) {
    await connection.rollback();
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Username, email, or contact number is already in use.' });
    throw error;
  } finally {
    connection.release();
  }
});

app.put('/api/admin/users/:id', ...admin, async (req, res) => {
  const user = updateUserSchema.parse(req.body);
  if (!Object.keys(user).length) return res.status(400).json({ error: 'Provide at least one field to update.' });

  const [existing]: any = await pool.query('SELECT id FROM users WHERE id=?', [req.params.id]);
  if (!existing.length) return res.status(404).json({ error: 'User not found.' });

  const fields: string[] = [];
  const values: unknown[] = [];
  if (user.username !== undefined) { fields.push('username=?'); values.push(user.username); }
  if (user.fullName !== undefined) { fields.push('name=?'); values.push(user.fullName); }
  if (user.email !== undefined) { fields.push('email=?'); values.push(user.email); }
  if (user.phone !== undefined) { fields.push('phone=?'); values.push(user.phone); }
  if (user.role !== undefined) { fields.push('role=?'); values.push(user.role); }
  if (user.password !== undefined) { fields.push('password=?'); values.push(hashPassword(user.password)); }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    values.push(req.params.id);
    await connection.query(`UPDATE users SET ${fields.join(', ')} WHERE id=?`, values);
    if (user.role === 'employee') {
      await connection.query(
        `INSERT IGNORE INTO leave_balances (user_id, category_id, credits)
         SELECT ?, id, credits_per_year FROM leave_categories WHERE status='active'`,
        [req.params.id]);
    }
    await connection.commit();
    res.json({ ok: true });
  } catch (error: any) {
    await connection.rollback();
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Username, email, or contact number is already in use.' });
    throw error;
  } finally {
    connection.release();
  }
});

app.delete('/api/admin/users/:id', ...admin, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows]: any = await connection.query('SELECT id, role FROM users WHERE id=? FOR UPDATE', [req.params.id]);
    if (!rows[0]) {
      await connection.rollback();
      return res.status(404).json({ error: 'User not found.' });
    }
    if (Number(rows[0].id) === uid(req)) {
      await connection.rollback();
      return res.status(409).json({ error: 'You cannot delete your own account.' });
    }
    if (rows[0].role === 'admin') {
      const [admins]: any = await connection.query("SELECT COUNT(*) count FROM users WHERE role='admin' AND id<>?", [req.params.id]);
      if (Number(admins[0].count) === 0) {
        await connection.rollback();
        return res.status(409).json({ error: 'Cannot delete the last admin account.' });
      }
    }

    await connection.query('UPDATE users SET is_active=0 WHERE id=?', [req.params.id]);
    await connection.commit();
    res.json({ ok: true });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});
app.get('/api/admin/logs', ...admin, async (req, res) => {
  const query = z.object({
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(10),
    userId: z.string().optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }).parse(req.query);
  const userId = query.userId ? z.coerce.number().int().positive().parse(query.userId) : null;
  const [countRows]: any = await pool.query(
    `SELECT COUNT(*) total FROM time_logs t
     WHERE (? IS NULL OR t.user_id=?) AND (? IS NULL OR t.log_date>=?) AND (? IS NULL OR t.log_date<=?)`,
    [userId, userId, query.from ?? null, query.from ?? null, query.to ?? null, query.to ?? null]);
  const total = Number(countRows[0].total);
  const totalPages = Math.ceil(total / query.perPage);
  const page = Math.min(query.page, Math.max(totalPages, 1));
  const offset = (page - 1) * query.perPage;
  const [rows] = await pool.query(
    `SELECT t.*, u.name FROM time_logs t JOIN users u ON u.id=t.user_id
     WHERE (? IS NULL OR t.user_id=?) AND (? IS NULL OR t.log_date>=?) AND (? IS NULL OR t.log_date<=?)
     ORDER BY t.log_date DESC, u.name LIMIT ? OFFSET ?`,
    [userId, userId, query.from ?? null, query.from ?? null, query.to ?? null, query.to ?? null, query.perPage, offset]);
  res.json({ data: rows, page, perPage: query.perPage, total, totalPages });
});
app.get('/api/admin/leaves', ...admin, async (req, res) => {
  const { page: requestedPage, perPage } = z.object({
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(10),
  }).parse(req.query);
  const [countRows]: any = await pool.query('SELECT COUNT(*) total FROM leave_requests');
  const total = Number(countRows[0].total);
  const totalPages = Math.ceil(total / perPage);
  const page = Math.min(requestedPage, Math.max(totalPages, 1));
  const offset = (page - 1) * perPage;
  const [rows] = await pool.query(
    `SELECT l.id, u.name, c.name AS category, l.start_date, l.end_date, l.days,
       l.reason, l.status, l.created_at, l.reviewed_by, l.reviewed_at, l.admin_note
     FROM leave_requests l JOIN users u ON u.id=l.user_id
     JOIN leave_categories c ON c.id=l.category_id
     ORDER BY CASE WHEN l.status='pending' THEN 0 ELSE 1 END, l.created_at DESC
     LIMIT ? OFFSET ?`,
    [perPage, offset]);
  res.json({ data: rows, page, perPage, total, totalPages });
});
app.get('/api/admin/dashboard/attendances', ...admin, async (_req, res) => {
  const today = fmtDate();
  const [rows] = await pool.query(
    `SELECT t.id, u.name, t.log_date, t.time_in, t.time_out, t.edited, t.edit_reason
     FROM time_logs t JOIN users u ON u.id=t.user_id
     WHERE u.role='employee' AND u.is_active=1 AND t.log_date=?
     ORDER BY u.name`,
    [today]);
  res.json(rows);
});
app.patch('/api/admin/leaves/:id', ...admin, async (req, res) => {
  const { status, note } = z.object({ status: z.enum(['approved', 'rejected']), note: z.string().max(500).optional() }).parse(req.body);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows]: any = await conn.query("SELECT * FROM leave_requests WHERE id=? AND status='pending' FOR UPDATE", [req.params.id]);
    if (!rows[0]) { await conn.rollback(); return res.status(404).json({ error: 'Pending request not found.' }); }
    const l = rows[0];
    if (status === 'approved') {
      const [u]: any = await conn.query(
        'UPDATE leave_balances SET credits=credits-? WHERE user_id=? AND category_id=? AND credits>=?',
        [l.days, l.user_id, l.category_id, l.days]);
      if (!u.affectedRows) { await conn.rollback(); return res.status(400).json({ error: 'Employee has insufficient credits.' }); }
    }
    await conn.query('UPDATE leave_requests SET status=?, reviewed_by=?, reviewed_at=NOW(), admin_note=? WHERE id=?', [status, uid(req), note ?? null, l.id]);
    if (status === 'approved') {
      await invalidatePayrollAttendance(conn, Number(l.user_id), String(l.start_date), String(l.end_date));
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
});

// ---------- Payroll ----------
const payrollAmount = z.number().finite().min(0).max(100_000_000);
const payrollProfileSchema = z.object({
  payBasis: z.enum(['monthly', 'daily', 'hourly']),
  payRate: payrollAmount,
});
const payrollPayDay = z.number().int().min(1).max(31);

app.get('/api/admin/payroll/settings', ...admin, async (_req, res) => {
  const [rows]: any = await pool.query(
    `SELECT first_pay_day AS firstPayDay, second_pay_day AS secondPayDay,
       required_days_per_week AS requiredDaysPerWeek,
       required_hours_per_day AS requiredHoursPerDay, break_hours AS breakHours,
       grace_period_minutes AS gracePeriodMinutes,
       TIME_FORMAT(workday_start_time, '%H:%i') AS workdayStartTime
     FROM payroll_settings WHERE id=1`);
  res.json({
    ...rows[0],
    requiredDaysPerWeek: Number(rows[0].requiredDaysPerWeek),
    requiredHoursPerDay: Number(rows[0].requiredHoursPerDay),
    breakHours: Number(rows[0].breakHours),
    gracePeriodMinutes: Number(rows[0].gracePeriodMinutes),
  });
});

app.put('/api/admin/payroll/settings', ...admin, async (req, res) => {
  const settings = z.object({
    firstPayDay: payrollPayDay,
    secondPayDay: payrollPayDay,
    requiredDaysPerWeek: z.number().int().min(1).max(7),
    requiredHoursPerDay: z.number().finite().gt(0).max(24),
    breakHours: z.number().finite().min(0).max(24),
    gracePeriodMinutes: z.number().int().min(0).max(1440),
    workdayStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  }).refine((value) => value.firstPayDay < value.secondPayDay, {
    message: 'The first pay date must be earlier than the second pay date.',
  }).refine((value) => value.breakHours < value.requiredHoursPerDay, {
    message: 'Break hours must be less than required work hours per day.',
  }).parse(req.body);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `UPDATE payroll_settings SET first_pay_day=?, second_pay_day=?,
         required_days_per_week=?, required_hours_per_day=?, break_hours=?,
         grace_period_minutes=?, workday_start_time=? WHERE id=1`,
      [settings.firstPayDay, settings.secondPayDay, settings.requiredDaysPerWeek,
        settings.requiredHoursPerDay, settings.breakHours, settings.gracePeriodMinutes,
        `${settings.workdayStartTime}:00`]);
    await invalidateAllDraftPayrollAttendance(conn);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
  res.json({ ok: true });
});

app.get('/api/admin/payroll/employees', ...admin, async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.name, p.pay_basis AS payBasis, p.pay_rate AS payRate
     FROM users u LEFT JOIN payroll_profiles p ON p.user_id=u.id
     WHERE u.role='employee' AND u.is_active=1 ORDER BY u.name`);
  res.json(rows);
});

app.put('/api/admin/payroll/employees/bulk', ...admin, async (req, res) => {
  const { employeeIds, ...profile } = z.object({
    employeeIds: z.array(z.number().int().positive()).min(1).max(500).refine(
      (ids) => new Set(ids).size === ids.length,
      'Select each employee only once.'),
    ...payrollProfileSchema.shape,
  }).parse(req.body);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const placeholders = employeeIds.map(() => '?').join(',');
    const [employees]: any = await conn.query(
      `SELECT id FROM users WHERE role='employee' AND is_active=1 AND id IN (${placeholders}) FOR UPDATE`,
      employeeIds);
    if (employees.length !== employeeIds.length) {
      await conn.rollback();
      return res.status(400).json({ error: 'One or more selected accounts are not employees.' });
    }
    await conn.query(
      `INSERT INTO payroll_profiles (user_id, pay_basis, pay_rate)
       VALUES ${employeeIds.map(() => '(?,?,?)').join(', ')}
       ON DUPLICATE KEY UPDATE pay_basis=VALUES(pay_basis), pay_rate=VALUES(pay_rate)`,
      employeeIds.flatMap((employeeId) => [employeeId, profile.payBasis, profile.payRate]));
    await conn.commit();
    res.json({ updated: employeeIds.length });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
});

app.put('/api/admin/payroll/employees/:id', ...admin, async (req, res) => {
  const userId = z.coerce.number().int().positive().parse(req.params.id);
  const profile = payrollProfileSchema.parse(req.body);
  const [employees]: any = await pool.query(
    "SELECT id FROM users WHERE id=? AND role='employee' AND is_active=1", [userId]);
  if (!employees.length) return res.status(404).json({ error: 'Employee not found.' });
  await pool.query(
    `INSERT INTO payroll_profiles (user_id, pay_basis, pay_rate) VALUES (?,?,?)
     ON DUPLICATE KEY UPDATE pay_basis=VALUES(pay_basis), pay_rate=VALUES(pay_rate)`,
    [userId, profile.payBasis, profile.payRate]);
  res.json({ ok: true });
});

app.get('/api/admin/payroll/runs', ...admin, async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT r.id, r.period_start AS periodStart, r.period_end AS periodEnd,
       r.pay_date AS payDate, r.status,
       r.created_at AS createdAt, r.approved_at AS approvedAt, r.paid_at AS paidAt,
       COUNT(i.id) AS employeeCount,
       COALESCE(SUM(i.basic_pay + i.other_earnings), 0) AS grossPay,
       COALESCE(SUM(i.sss_deduction + i.philhealth_deduction + i.pagibig_deduction +
         i.withholding_tax + i.other_deductions + i.late_penalty), 0) AS totalDeductions
     FROM payroll_runs r LEFT JOIN payroll_items i ON i.payroll_run_id=r.id
     GROUP BY r.id ORDER BY r.period_start DESC, r.id DESC`);
  res.json(rows);
});

app.post('/api/admin/payroll/months', ...admin, async (req, res) => {
  const { month } = z.object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).refine((value) => {
      const year = Number(value.slice(0, 4));
      return year >= 1000 && year <= 9999;
    }, 'Enter a valid payroll month.'),
  }).parse(req.body);
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const monthEnd = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  const periods = [
    { start: `${month}-01`, end: `${month}-15`, half: 1 },
    { start: `${month}-16`, end: monthEnd, half: 2 },
  ] as const;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [settingsRows]: any = await conn.query(
      'SELECT first_pay_day AS firstPayDay, second_pay_day AS secondPayDay FROM payroll_settings WHERE id=1 FOR UPDATE');
    const settings = settingsRows[0] as { firstPayDay: number; secondPayDay: number };
    const [employeeRows]: any = await conn.query(
      `SELECT u.id, u.name, p.pay_basis AS payBasis, p.pay_rate AS payRate
       FROM users u LEFT JOIN payroll_profiles p ON p.user_id=u.id
       WHERE u.role='employee' AND u.is_active=1 ORDER BY u.id`);
    const runIds: number[] = [];
    for (const period of periods) {
      const configuredPayDay = period.half === 1 ? settings.firstPayDay : settings.secondPayDay;
      const payDay = Math.min(configuredPayDay, Number(monthEnd.slice(-2)));
      const payDate = `${month}-${String(payDay).padStart(2, '0')}`;
      const [result]: any = await conn.query(
        'INSERT INTO payroll_runs (period_start, period_end, pay_date, created_by) VALUES (?,?,?,?)',
        [period.start, period.end, payDate, uid(req)]);
      runIds.push(result.insertId);
      for (const employee of employeeRows) {
        const monthlySalary = employee.payBasis === 'monthly' ? Number(employee.payRate) : null;
        const statutory = monthlySalary !== null && period.half === 2
          ? calculateStatutoryContributions(monthlySalary, payDate)
          : null;
        const firstHalfBasicPay = monthlySalary === null ? 0 : Math.floor(monthlySalary * 50) / 100;
        const basicPay = monthlySalary === null
          ? 0
          : period.half === 1
            ? firstHalfBasicPay
            : monthlySalary - firstHalfBasicPay;
        const sssDeduction = statutory?.sssEmployee ?? 0;
        const pagibigDeduction = statutory?.pagibigEmployee ?? 0;
        const employerContributions = statutory
          ? statutory.sssEmployer + statutory.sssEc + statutory.pagibigEmployer
          : 0;
        await conn.query(
          `INSERT INTO payroll_items (
            payroll_run_id, user_id, employee_name, pay_basis, pay_rate, basic_pay,
            sss_deduction, pagibig_deduction, employer_contributions,
            sss_calculated, pagibig_calculated, statutory_rules_effective
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [result.insertId, employee.id, employee.name, employee.payBasis, employee.payRate,
            basicPay, sssDeduction, pagibigDeduction, employerContributions,
            sssDeduction, pagibigDeduction, statutory?.effective ?? null]);
      }
    }
    await conn.commit();
    res.status(201).json({ runIds });
  } catch (error: any) {
    await conn.rollback();
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Payroll periods already exist for this month. Review the existing periods instead.' });
    }
    if (error instanceof Error && error.message.startsWith('No statutory payroll rules are configured')) {
      return res.status(400).json({ error: error.message });
    }
    throw error;
  } finally {
    conn.release();
  }
});

app.delete('/api/admin/payroll/runs/:id', ...admin, async (req, res) => {
  const runId = z.coerce.number().int().positive().parse(req.params.id);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [runs]: any = await conn.query(
      'SELECT id FROM payroll_runs WHERE id=? FOR UPDATE', [runId]);
    if (!runs[0]) {
      await conn.rollback();
      return res.status(404).json({ error: 'Payroll period not found.' });
    }
    await conn.query('DELETE FROM payroll_runs WHERE id=?', [runId]);
    await conn.commit();
    res.json({ ok: true });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
});

app.get('/api/admin/payroll/runs/:id', ...admin, async (req, res) => {
  const runId = z.coerce.number().int().positive().parse(req.params.id);
  const [runs]: any = await pool.query(
    `SELECT id, period_start AS periodStart, period_end AS periodEnd,
       pay_date AS payDate, status,
       created_at AS createdAt, approved_at AS approvedAt, paid_at AS paidAt
     FROM payroll_runs WHERE id=?`, [runId]);
  if (!runs[0]) return res.status(404).json({ error: 'Payroll run not found.' });
  const [items]: any = await pool.query(
    `SELECT i.*,
       (SELECT u.name FROM users u WHERE u.id=i.attendance_verified_by) AS attendance_verified_name,
       COUNT(t.id) AS logDays,
       SUM(CASE WHEN t.edited=1 THEN 1 ELSE 0 END) AS editedLogDays,
       ROUND(SUM(CASE WHEN t.time_in IS NOT NULL AND t.time_out IS NOT NULL
         THEN TIMESTAMPDIFF(SECOND, t.time_in, t.time_out) ELSE 0 END) / 3600, 2) AS recordedHours
     FROM payroll_items i
     JOIN payroll_runs r ON r.id=i.payroll_run_id
     LEFT JOIN time_logs t ON t.user_id=i.user_id AND t.log_date BETWEEN r.period_start AND r.period_end
     WHERE i.payroll_run_id=?
     GROUP BY i.id ORDER BY i.employee_name`, [runId]);
  const [settingsRows]: any = await pool.query(
    `SELECT required_days_per_week AS requiredDaysPerWeek,
       required_hours_per_day AS requiredHoursPerDay,
       grace_period_minutes AS gracePeriodMinutes,
       TIME_FORMAT(workday_start_time, '%H:%i') AS workdayStartTime
     FROM payroll_settings WHERE id=1`);
  const [timeRows]: any = await pool.query(
    `SELECT t.user_id AS userId, TIME_FORMAT(t.time_in, '%H:%i:%s') AS timeIn
     FROM time_logs t
     JOIN payroll_items i ON i.user_id=t.user_id AND i.payroll_run_id=?
     WHERE t.log_date BETWEEN ? AND ? AND t.time_in IS NOT NULL`,
    [runId, runs[0].periodStart, runs[0].periodEnd]);
  const [leaveRows]: any = await pool.query(
    `SELECT l.user_id AS userId,
       SUM(l.days * (DATEDIFF(LEAST(l.end_date, r.period_end),
         GREATEST(l.start_date, r.period_start)) + 1) /
         (DATEDIFF(l.end_date, l.start_date) + 1)) AS approvedLeaveDays
     FROM leave_requests l
     JOIN payroll_items i ON i.user_id=l.user_id AND i.payroll_run_id=?
     JOIN payroll_runs r ON r.id=i.payroll_run_id
     WHERE l.status='approved'
       AND l.start_date<=r.period_end AND l.end_date>=r.period_start
     GROUP BY l.user_id`,
    [runId]);
  const timeInsByUser = new Map<number, string[]>();
  for (const row of timeRows) {
    const times = timeInsByUser.get(Number(row.userId)) ?? [];
    times.push(row.timeIn);
    timeInsByUser.set(Number(row.userId), times);
  }
  const approvedLeaveDaysByUser = new Map<number, number>(
    leaveRows.map((row: { userId: number; approvedLeaveDays: string | number }) =>
      [Number(row.userId), Number(row.approvedLeaveDays)]));
  const settings = settingsRows[0];
  const itemsWithLatePreview = items.map((item: any) => {
    const latePreviewMinutes = calculateLateMinutes(
      timeInsByUser.get(Number(item.user_id)) ?? [],
      settings);
    const latePreviewPenalty = calculateLatePenalty(
      item.pay_basis,
      item.pay_rate === null ? null : Number(item.pay_rate),
      latePreviewMinutes,
      {
        requiredDaysPerWeek: Number(settings.requiredDaysPerWeek),
        requiredHoursPerDay: Number(settings.requiredHoursPerDay),
      });
    const approvedLeaveDays = approvedLeaveDaysByUser.get(Number(item.user_id)) ?? 0;
    const computedPreview = calculateHoursBasedPay(
      item.pay_basis,
      item.pay_rate === null ? null : Number(item.pay_rate),
      Number(item.recordedHours ?? 0),
      approvedLeaveDays,
      {
        requiredDaysPerWeek: Number(settings.requiredDaysPerWeek),
        requiredHoursPerDay: Number(settings.requiredHoursPerDay),
      });
    return {
      ...item,
      late_preview_minutes: latePreviewMinutes,
      late_preview_penalty: latePreviewPenalty,
      computed_preview_hours: computedPreview.hours,
      computed_preview_pay: computedPreview.pay,
      approved_leave_days: approvedLeaveDays,
    };
  });
  res.json({ ...runs[0], items: itemsWithLatePreview });
});

app.get('/api/admin/payroll/runs/:runId/items/:itemId/attendance', ...admin, async (req, res) => {
  const runId = z.coerce.number().int().positive().parse(req.params.runId);
  const itemId = z.coerce.number().int().positive().parse(req.params.itemId);
  const [items]: any = await pool.query(
    `SELECT i.user_id AS userId, r.period_start AS periodStart, r.period_end AS periodEnd
     FROM payroll_items i
     JOIN payroll_runs r ON r.id=i.payroll_run_id
     WHERE i.id=? AND i.payroll_run_id=?`,
    [itemId, runId]);
  if (!items[0]) return res.status(404).json({ error: 'Payroll item not found.' });
  const [attendance]: any = await pool.query(
    `SELECT id, DATE_FORMAT(log_date, '%Y-%m-%d') AS logDate,
       TIME_FORMAT(time_in, '%H:%i:%s') AS timeIn,
       TIME_FORMAT(time_out, '%H:%i:%s') AS timeOut,
       CASE WHEN time_in IS NOT NULL AND time_out IS NOT NULL
         THEN ROUND(TIMESTAMPDIFF(SECOND, time_in, time_out) / 3600, 2)
         ELSE 0
       END AS hoursWorked,
       edited, edit_reason AS editReason
     FROM time_logs
     WHERE user_id=? AND log_date BETWEEN ? AND ?
     ORDER BY log_date`,
    [items[0].userId, items[0].periodStart, items[0].periodEnd]);
  res.json(attendance);
});

app.post('/api/admin/payroll/runs/:runId/items/:itemId/attendance/verify', ...admin, async (req, res) => {
  const runId = z.coerce.number().int().positive().parse(req.params.runId);
  const itemId = z.coerce.number().int().positive().parse(req.params.itemId);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [items]: any = await conn.query(
      `SELECT i.user_id AS userId, i.pay_basis AS payBasis, i.pay_rate AS payRate,
         r.period_start AS periodStart, r.period_end AS periodEnd, r.status
       FROM payroll_items i JOIN payroll_runs r ON r.id=i.payroll_run_id
       WHERE i.id=? AND i.payroll_run_id=? FOR UPDATE`,
      [itemId, runId]);
    if (!items[0]) {
      await conn.rollback();
      return res.status(404).json({ error: 'Payroll item not found.' });
    }
    if (items[0].status !== 'draft') {
      await conn.rollback();
      return res.status(409).json({ error: 'Only draft payroll attendance can be verified.' });
    }
    const [settingsRows]: any = await conn.query(
      `SELECT required_days_per_week AS requiredDaysPerWeek,
         required_hours_per_day AS requiredHoursPerDay
       FROM payroll_settings WHERE id=1`);
    const settings = {
      requiredDaysPerWeek: Number(settingsRows[0].requiredDaysPerWeek),
      requiredHoursPerDay: Number(settingsRows[0].requiredHoursPerDay),
    };
    const [hoursRows]: any = await conn.query(
      `SELECT COALESCE(ROUND(SUM(CASE WHEN time_in IS NOT NULL AND time_out IS NOT NULL
        THEN TIMESTAMPDIFF(SECOND, time_in, time_out) ELSE 0 END) / 3600, 2), 0) AS loggedHours
       FROM time_logs WHERE user_id=? AND log_date BETWEEN ? AND ?`,
      [items[0].userId, items[0].periodStart, items[0].periodEnd]);
    const [leaveRows]: any = await conn.query(
      `SELECT COALESCE(SUM(l.days * (DATEDIFF(LEAST(l.end_date, ?),
        GREATEST(l.start_date, ?)) + 1) /
        (DATEDIFF(l.end_date, l.start_date) + 1)), 0) AS approvedLeaveDays
       FROM leave_requests l
       WHERE l.user_id=? AND l.status='approved'
         AND l.start_date<=? AND l.end_date>=?`,
      [items[0].periodEnd, items[0].periodStart, items[0].userId,
        items[0].periodEnd, items[0].periodStart]);
    const computedPay = calculateHoursBasedPay(
      items[0].payBasis,
      items[0].payRate === null ? null : Number(items[0].payRate),
      Number(hoursRows[0].loggedHours),
      Number(leaveRows[0].approvedLeaveDays),
      settings);
    await conn.query(
      `UPDATE payroll_items
       SET computed_hours=?, computed_pay=?, attendance_verified_by=?,
           attendance_verified_at=NOW(6), reviewed_by=NULL, reviewed_at=NULL
       WHERE id=?`,
      [computedPay.hours, computedPay.pay, uid(req), itemId]);
    await conn.commit();
    res.json({ ok: true, computedHours: computedPay.hours, computedPay: computedPay.pay });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
});

const payrollItemFields = {
  basicPay: payrollAmount,
  otherEarnings: payrollAmount,
  philhealthDeduction: payrollAmount,
  withholdingTax: payrollAmount,
  otherDeductions: payrollAmount,
  employerContributions: payrollAmount,
};
const payrollItemUpdateSchema = z.object({
  ...payrollItemFields,
  sssOverride: payrollAmount.nullable(),
  pagibigOverride: payrollAmount.nullable(),
  overrideReason: z.string().trim().min(5).max(500).nullable(),
}).refine(
  (value) => (value.sssOverride === null && value.pagibigOverride === null) || Boolean(value.overrideReason),
  { message: 'Enter a reason of at least 5 characters when overriding SSS or Pag-IBIG.' });
const payrollColumnNames: Record<keyof typeof payrollItemFields, string> = {
  basicPay: 'basic_pay',
  otherEarnings: 'other_earnings',
  philhealthDeduction: 'philhealth_deduction',
  withholdingTax: 'withholding_tax',
  otherDeductions: 'other_deductions',
  employerContributions: 'employer_contributions',
};

app.patch('/api/admin/payroll/runs/:runId/items/:itemId', ...admin, async (req, res) => {
  const runId = z.coerce.number().int().positive().parse(req.params.runId);
  const itemId = z.coerce.number().int().positive().parse(req.params.itemId);
  const updates = payrollItemUpdateSchema.parse(req.body);
  const fields = Object.keys(payrollItemFields) as (keyof typeof payrollItemFields)[];
  const overrideSet = updates.sssOverride !== null || updates.pagibigOverride !== null;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [items]: any = await conn.query(
      `SELECT i.user_id AS userId, i.pay_basis AS payBasis, i.pay_rate AS payRate,
         i.attendance_verified_at AS attendanceVerifiedAt,
         r.period_start AS periodStart, r.period_end AS periodEnd, r.status
       FROM payroll_items i JOIN payroll_runs r ON r.id=i.payroll_run_id
       WHERE i.id=? AND i.payroll_run_id=? FOR UPDATE`,
      [itemId, runId]);
    if (!items[0]) {
      await conn.rollback();
      return res.status(404).json({ error: 'Payroll item not found.' });
    }
    if (items[0].status !== 'draft') {
      await conn.rollback();
      return res.status(409).json({ error: 'Approved payroll runs cannot be edited.' });
    }
    if (!items[0].attendanceVerifiedAt) {
      await conn.rollback();
      return res.status(409).json({ error: 'Verify attendance before saving this payroll line.' });
    }
    const [settingsRows]: any = await conn.query(
      `SELECT required_days_per_week AS requiredDaysPerWeek,
         required_hours_per_day AS requiredHoursPerDay,
         grace_period_minutes AS gracePeriodMinutes,
         TIME_FORMAT(workday_start_time, '%H:%i') AS workdayStartTime
       FROM payroll_settings WHERE id=1`);
    const settings = settingsRows[0];
    const [timeRows]: any = await conn.query(
      `SELECT TIME_FORMAT(time_in, '%H:%i:%s') AS timeIn
       FROM time_logs
       WHERE user_id=? AND log_date BETWEEN ? AND ? AND time_in IS NOT NULL`,
      [items[0].userId, items[0].periodStart, items[0].periodEnd]);
    const lateMinutes = calculateLateMinutes(
      timeRows.map((row: { timeIn: string }) => row.timeIn),
      settings);
    const latePenalty = calculateLatePenalty(
      items[0].payBasis,
      items[0].payRate === null ? null : Number(items[0].payRate),
      lateMinutes,
      {
        requiredDaysPerWeek: Number(settings.requiredDaysPerWeek),
        requiredHoursPerDay: Number(settings.requiredHoursPerDay),
      });
    await conn.query(
      `UPDATE payroll_items i JOIN payroll_runs r ON r.id=i.payroll_run_id
       SET ${fields.map((field) => `i.${payrollColumnNames[field]}=?`).join(', ')},
         i.sss_override=?, i.pagibig_override=?,
         i.sss_deduction=IF(? IS NULL, COALESCE(i.sss_calculated, i.sss_deduction), ?),
         i.pagibig_deduction=IF(? IS NULL, COALESCE(i.pagibig_calculated, i.pagibig_deduction), ?),
         i.late_minutes=?, i.late_penalty=?,
         i.override_reason=?, i.override_by=IF(?, ?, NULL),
         i.override_at=IF(?, NOW(6), NULL),
         i.reviewed_by=?, i.reviewed_at=NOW(6)
       WHERE i.id=? AND i.payroll_run_id=? AND r.status='draft'`,
      [...fields.map((field) => updates[field]),
        updates.sssOverride, updates.pagibigOverride,
        updates.sssOverride, updates.sssOverride,
        updates.pagibigOverride, updates.pagibigOverride,
        lateMinutes, latePenalty,
        overrideSet ? updates.overrideReason : null,
        overrideSet, uid(req), overrideSet,
        uid(req), itemId, runId]);
    await conn.commit();
    res.json({ ok: true });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
});

app.patch('/api/admin/payroll/runs/:id/status', ...admin, async (req, res) => {
  const runId = z.coerce.number().int().positive().parse(req.params.id);
  const { status } = z.object({ status: z.enum(['approved', 'paid']) }).parse(req.body);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows]: any = await conn.query('SELECT status FROM payroll_runs WHERE id=? FOR UPDATE', [runId]);
    if (!rows[0]) {
      await conn.rollback();
      return res.status(404).json({ error: 'Payroll run not found.' });
    }
    const expected = status === 'approved' ? 'draft' : 'approved';
    if (rows[0].status !== expected) {
      await conn.rollback();
      return res.status(409).json({ error: `Payroll run must be ${expected} before it can be ${status}.` });
    }
    if (status === 'approved') {
      const [reviewRows]: any = await conn.query(
        `SELECT COUNT(*) AS total,
           SUM(reviewed_at IS NULL) AS unreviewed,
           SUM(attendance_verified_at IS NULL) AS unverified
         FROM payroll_items WHERE payroll_run_id=?`,
        [runId]);
      if (Number(reviewRows[0].total) === 0 ||
          Number(reviewRows[0].unreviewed) > 0 ||
          Number(reviewRows[0].unverified) > 0) {
        await conn.rollback();
        return res.status(409).json({
          error: 'Verify attendance and save every employee’s pay line before approving this payroll run.',
        });
      }
      await conn.query('UPDATE payroll_runs SET status=?, approved_by=?, approved_at=NOW() WHERE id=?',
        [status, uid(req), runId]);
    } else {
      await conn.query('UPDATE payroll_runs SET status=?, paid_at=NOW() WHERE id=?', [status, runId]);
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
});

app.get('/api/payroll/payslips', requireAuth, async (req, res) => {
  const { year, month } = z.object({
    year: z.coerce.number().int().min(1000).max(9999),
    month: z.coerce.number().int().min(1).max(12),
  }).parse(req.query);
  const [yearRows]: any = await pool.query(
    `SELECT DISTINCT YEAR(r.period_start) AS year
     FROM payroll_items i JOIN payroll_runs r ON r.id=i.payroll_run_id
     WHERE i.user_id=? AND r.status IN ('approved','paid')
     ORDER BY year DESC`,
    [uid(req)]);
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  const [rows] = await pool.query(
    `SELECT r.id AS runId, r.period_start AS periodStart, r.period_end AS periodEnd,
       r.pay_date AS payDate, r.status,
       i.basic_pay AS basicPay, i.other_earnings AS otherEarnings,
       i.sss_deduction AS sssDeduction, i.philhealth_deduction AS philhealthDeduction,
       i.pagibig_deduction AS pagibigDeduction, i.withholding_tax AS withholdingTax,
       i.other_deductions AS otherDeductions,
       i.late_minutes AS lateMinutes, i.late_penalty AS latePenalty,
       i.employer_contributions AS employerContributions
     FROM payroll_items i JOIN payroll_runs r ON r.id=i.payroll_run_id
     WHERE i.user_id=? AND r.status IN ('approved','paid')
       AND r.period_start>=? AND r.period_start<?
     ORDER BY r.period_start DESC, r.id DESC`, [uid(req), startDate, nextMonth]);
  res.json({
    payslips: rows,
    availableYears: yearRows.map((row: { year: number }) => Number(row.year)),
  });
});

const frontendDist = path.resolve(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));
app.get('*', (req, res, next) => {
  if (req.path === '/api' || req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
    if (err) next(err);
  });
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.name === 'ZodError') return res.status(400).json({ error: 'Please check your input.' });
  if (err?.message?.startsWith('Please wait')) return res.status(429).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

initDb().then(() => app.listen(process.env.PORT || 4000, () => console.log('API ready')))
  .catch((e) => { console.error('DB init failed:', e.message); process.exit(1); });
