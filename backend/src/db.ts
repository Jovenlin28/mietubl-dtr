import 'dotenv/config';
import mysql from 'mysql2/promise';
import { hashPassword } from './password';

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  // DigitalOcean managed MySQL requires TLS. For strict verification, supply the CA cert via `ca`.
  ssl: process.env.DB_SSL === 'REQUIRED' ? { rejectUnauthorized: false } : undefined,
  dateStrings: true,
  connectionLimit: 10,
  timezone: '+08:00',
});

const schema = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    username VARCHAR(80) NULL UNIQUE,
    password VARCHAR(255) NULL,
    profile_picture MEDIUMTEXT NULL,
    email VARCHAR(190) UNIQUE NULL,
    phone VARCHAR(30) UNIQUE NULL,
    role ENUM('employee','admin') NOT NULL DEFAULT 'employee',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS time_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    log_date DATE NOT NULL,
    time_in DATETIME NULL, time_out DATETIME NULL,
    in_lat DECIMAL(9,6) NULL, in_lng DECIMAL(9,6) NULL, in_address VARCHAR(500) NULL, in_ip VARCHAR(64) NULL,
    out_lat DECIMAL(9,6) NULL, out_lng DECIMAL(9,6) NULL, out_address VARCHAR(500) NULL, out_ip VARCHAR(64) NULL,
    edited TINYINT(1) NOT NULL DEFAULT 0,
    edit_reason VARCHAR(500) NULL,
    UNIQUE KEY uq_user_date (user_id, log_date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS leave_balances (
    user_id INT NOT NULL,
    category ENUM('vacation','sick') NOT NULL,
    credits DECIMAL(5,1) NOT NULL DEFAULT 25,
    PRIMARY KEY (user_id, category),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS leave_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    category ENUM('vacation','sick') NOT NULL,
    start_date DATE NOT NULL, end_date DATE NOT NULL,
    days DECIMAL(5,1) NOT NULL,
    reason VARCHAR(500) NULL,
    status ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
    reviewed_by INT NULL, reviewed_at DATETIME NULL, admin_note VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
];

export async function initDb() {
  for (const sql of schema) await pool.query(sql);

  const [columns]: any = await pool.query('SHOW COLUMNS FROM users');
  const existingColumns = new Set(columns.map((column: { Field: string }) => column.Field));
  if (!existingColumns.has('username')) {
    await pool.query('ALTER TABLE users ADD COLUMN username VARCHAR(80) UNIQUE NULL');
  }
  if (!existingColumns.has('password')) {
    await pool.query('ALTER TABLE users ADD COLUMN password VARCHAR(255) NULL');
  }
  if (!existingColumns.has('profile_picture')) {
    await pool.query('ALTER TABLE users ADD COLUMN profile_picture MEDIUMTEXT NULL');
  }

  for (const user of [
    { name: 'Admin', username: 'admin', password: 'Kanroji0928', role: 'admin' },
    { name: 'Employee', username: 'employee', password: 'Kanroji0928', role: 'employee' },
  ]) {
    const [rows]: any = await pool.query('SELECT id FROM users WHERE username=?', [user.username]);
    if (rows.length) continue;

    const [result]: any = await pool.query(
      'INSERT INTO users (name, username, password, role) VALUES (?,?,?,?)',
      [user.name, user.username, hashPassword(user.password), user.role]);
    await pool.query(
      `INSERT INTO leave_balances (user_id, category, credits)
       VALUES (?, 'vacation', 25), (?, 'sick', 25)
       ON DUPLICATE KEY UPDATE credits=credits`,
      [result.insertId, result.insertId]);
  }
}
