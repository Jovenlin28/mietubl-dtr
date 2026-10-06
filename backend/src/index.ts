import 'dotenv/config';
import 'express-async-errors';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { initDb, pool } from './db';
import { hashPassword, verifyPassword } from './password';
import { AuthedRequest, requireAdmin, requireAuth, signToken } from './auth';
import { clientIp, daysBetween, fmtDate, fmtDateTime, reverseGeocode } from './util';

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
    'SELECT id, name, username, email, phone, password, role, profile_picture AS profilePicture FROM users WHERE username=?',
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
  await pool.query(
    `INSERT INTO time_logs (user_id, log_date, time_in, in_lat, in_lng, in_address, in_ip) VALUES (?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE time_in=VALUES(time_in), in_lat=VALUES(in_lat), in_lng=VALUES(in_lng), in_address=VALUES(in_address), in_ip=VALUES(in_ip)`,
    [uid(req), fmtDate(), fmtDateTime(), lat, lng, address, clientIp(req)]);
  res.json({ ok: true });
});

app.post('/api/logs/time-out', requireAuth, async (req, res) => {
  const { lat, lng } = geo.parse(req.body);
  const [ex]: any = await pool.query('SELECT time_in, time_out FROM time_logs WHERE user_id=? AND log_date=?', [uid(req), fmtDate()]);
  if (!ex[0]?.time_in) return res.status(409).json({ error: 'Time in first, or edit today’s log if you forgot.' });
  if (ex[0].time_out) return res.status(409).json({ error: 'You already timed out today.' });
  const address = await reverseGeocode(lat, lng);
  await pool.query('UPDATE time_logs SET time_out=?, out_lat=?, out_lng=?, out_address=?, out_ip=? WHERE user_id=? AND log_date=?',
    [fmtDateTime(), lat, lng, address, clientIp(req), uid(req), fmtDate()]);
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
  await pool.query(
    `INSERT INTO time_logs (user_id, log_date, time_in, time_out, in_ip, out_ip, edited, edit_reason) VALUES (?,?,?,?,?,?,1,?)
     ON DUPLICATE KEY UPDATE time_in=COALESCE(VALUES(time_in), time_in), time_out=COALESCE(VALUES(time_out), time_out),
       in_ip=COALESCE(VALUES(in_ip), in_ip), out_ip=COALESCE(VALUES(out_ip), out_ip), edited=1, edit_reason=VALUES(edit_reason)`,
    [uid(req), date, timeIn ? `${date} ${timeIn}:00` : null, timeOut ? `${date} ${timeOut}:00` : null, timeIn ? ip : null, timeOut ? ip : null, reason]);
  res.json({ ok: true });
});

// ---------- Leaves ----------
app.get('/api/leaves/balance', requireAuth, async (req, res) => {
  const [rows] = await pool.query('SELECT category, credits FROM leave_balances WHERE user_id=?', [uid(req)]);
  res.json(rows);
});
app.get('/api/leaves', requireAuth, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM leave_requests WHERE user_id=? ORDER BY created_at DESC', [uid(req)]);
  res.json(rows);
});
app.post('/api/leaves', requireAuth, async (req, res) => {
  const b = z.object({ category: z.enum(['vacation', 'sick']), startDate: z.string(), endDate: z.string(), reason: z.string().max(500).optional() }).parse(req.body);
  const days = daysBetween(b.startDate, b.endDate);
  if (!(days >= 1)) return res.status(400).json({ error: 'End date must be on or after start date.' });
  const [bal]: any = await pool.query('SELECT credits FROM leave_balances WHERE user_id=? AND category=?', [uid(req), b.category]);
  const [pend]: any = await pool.query("SELECT COALESCE(SUM(days),0) d FROM leave_requests WHERE user_id=? AND category=? AND status='pending'", [uid(req), b.category]);
  if (Number(bal[0].credits) - Number(pend[0].d) < days) return res.status(400).json({ error: 'Not enough leave credits.' });
  await pool.query('INSERT INTO leave_requests (user_id, category, start_date, end_date, days, reason) VALUES (?,?,?,?,?,?)',
    [uid(req), b.category, b.startDate, b.endDate, days, b.reason ?? null]);
  res.json({ ok: true });
});
app.delete('/api/leaves/:id', requireAuth, async (req, res) => {
  await pool.query("UPDATE leave_requests SET status='cancelled' WHERE id=? AND user_id=? AND status='pending'", [req.params.id, uid(req)]);
  res.json({ ok: true });
});

// ---------- Admin ----------
const admin = [requireAuth, requireAdmin];
app.get('/api/admin/dashboard', ...admin, async (_req, res) => {
  const today = fmtDate();
  const [[employeeRows], [presentRows], [leaveRows], [pendingRows], [recentLeaves]]: any = await Promise.all([
    pool.query("SELECT COUNT(*) total FROM users WHERE role='employee'"),
    pool.query(
      `SELECT COUNT(DISTINCT u.id) total
       FROM users u JOIN time_logs t ON t.user_id=u.id
       WHERE u.role='employee' AND t.log_date=? AND t.time_in IS NOT NULL`,
      [today]),
    pool.query(
      `SELECT COUNT(DISTINCT u.id) total
       FROM users u JOIN leave_requests l ON l.user_id=u.id
       WHERE u.role='employee' AND l.status='approved' AND l.start_date<=? AND l.end_date>=?`,
      [today, today]),
    pool.query("SELECT COUNT(*) total FROM leave_requests WHERE status='pending'"),
    pool.query(
      `SELECT l.id, u.name, l.category, l.start_date, l.end_date, l.status, l.created_at
       FROM leave_requests l JOIN users u ON u.id=l.user_id
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
  const [rows] = await pool.query('SELECT id, name, username, email, phone, role, created_at FROM users ORDER BY name');
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
    await connection.query(
      `INSERT INTO leave_balances (user_id, category, credits)
       VALUES (?, 'vacation', 25), (?, 'sick', 25)`,
      [result.insertId, result.insertId]);
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

  try {
    values.push(req.params.id);
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id=?`, values);
    res.json({ ok: true });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Username, email, or contact number is already in use.' });
    throw error;
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

    await connection.query('DELETE FROM users WHERE id=?', [req.params.id]);
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
    `SELECT l.*, u.name FROM leave_requests l JOIN users u ON u.id=l.user_id
     ORDER BY CASE WHEN l.status='pending' THEN 0 ELSE 1 END, l.created_at DESC
     LIMIT ? OFFSET ?`,
    [perPage, offset]);
  res.json({ data: rows, page, perPage, total, totalPages });
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
      const [u]: any = await conn.query('UPDATE leave_balances SET credits=credits-? WHERE user_id=? AND category=? AND credits>=?', [l.days, l.user_id, l.category, l.days]);
      if (!u.affectedRows) { await conn.rollback(); return res.status(400).json({ error: 'Employee has insufficient credits.' }); }
    }
    await conn.query('UPDATE leave_requests SET status=?, reviewed_by=?, reviewed_at=NOW(), admin_note=? WHERE id=?', [status, uid(req), note ?? null, l.id]);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.name === 'ZodError') return res.status(400).json({ error: 'Please check your input.' });
  if (err?.message?.startsWith('Please wait')) return res.status(429).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

initDb().then(() => app.listen(process.env.PORT || 4000, () => console.log('API ready')))
  .catch((e) => { console.error('DB init failed:', e.message); process.exit(1); });
