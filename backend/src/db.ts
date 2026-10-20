import 'dotenv/config';
import mysql from 'mysql2/promise';
import { hashPassword } from './password';
import { calculateStatutoryContributions, hasStatutoryRulesFor } from './payroll';

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
    is_active TINYINT(1) NOT NULL DEFAULT 1,
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
  `CREATE TABLE IF NOT EXISTS leave_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    credits_per_year DECIMAL(7,1) NOT NULL,
    status ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS leave_balances (
    user_id INT NOT NULL,
    category_id INT NOT NULL,
    credits DECIMAL(7,1) NOT NULL DEFAULT 25,
    PRIMARY KEY (user_id, category_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES leave_categories(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS leave_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    category_id INT NOT NULL,
    start_date DATE NOT NULL, end_date DATE NOT NULL,
    days DECIMAL(5,1) NOT NULL,
    reason VARCHAR(500) NULL,
    status ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
    reviewed_by INT NULL, reviewed_at DATETIME NULL, admin_note VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES leave_categories(id)
  )`,
  `CREATE TABLE IF NOT EXISTS payroll_profiles (
    user_id INT PRIMARY KEY,
    pay_basis ENUM('monthly','daily','hourly') NOT NULL,
    pay_rate DECIMAL(12,2) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS payroll_runs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    pay_date DATE NULL,
    status ENUM('draft','approved','paid') NOT NULL DEFAULT 'draft',
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_by INT NULL,
    approved_at DATETIME NULL,
    paid_at DATETIME NULL,
    UNIQUE KEY uq_payroll_period (period_start, period_end),
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (approved_by) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS payroll_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payroll_run_id INT NOT NULL,
    user_id INT NOT NULL,
    employee_name VARCHAR(120) NOT NULL,
    pay_basis ENUM('monthly','daily','hourly') NULL,
    pay_rate DECIMAL(12,2) NULL,
    basic_pay DECIMAL(12,2) NOT NULL DEFAULT 0,
    computed_hours DECIMAL(10,2) NULL,
    computed_pay DECIMAL(12,2) NULL,
    attendance_verified_by INT NULL,
    attendance_verified_at DATETIME(6) NULL,
    other_earnings DECIMAL(12,2) NOT NULL DEFAULT 0,
    sss_deduction DECIMAL(12,2) NOT NULL DEFAULT 0,
    philhealth_deduction DECIMAL(12,2) NOT NULL DEFAULT 0,
    pagibig_deduction DECIMAL(12,2) NOT NULL DEFAULT 0,
    withholding_tax DECIMAL(12,2) NOT NULL DEFAULT 0,
    other_deductions DECIMAL(12,2) NOT NULL DEFAULT 0,
    late_minutes INT UNSIGNED NOT NULL DEFAULT 0,
    late_penalty DECIMAL(12,2) NOT NULL DEFAULT 0,
    employer_contributions DECIMAL(12,2) NOT NULL DEFAULT 0,
    sss_calculated DECIMAL(12,2) NULL,
    pagibig_calculated DECIMAL(12,2) NULL,
    sss_override DECIMAL(12,2) NULL,
    pagibig_override DECIMAL(12,2) NULL,
    override_reason VARCHAR(500) NULL,
    override_by INT NULL,
    override_at DATETIME(6) NULL,
    statutory_rules_effective DATE NULL,
    reviewed_by INT NULL,
    reviewed_at DATETIME(6) NULL,
    UNIQUE KEY uq_run_employee (payroll_run_id, user_id),
    FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (reviewed_by) REFERENCES users(id),
    FOREIGN KEY (override_by) REFERENCES users(id),
    FOREIGN KEY (attendance_verified_by) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS payroll_settings (
    id TINYINT PRIMARY KEY,
    first_pay_day TINYINT UNSIGNED NOT NULL DEFAULT 15,
    second_pay_day TINYINT UNSIGNED NOT NULL DEFAULT 31,
    required_days_per_week TINYINT UNSIGNED NOT NULL DEFAULT 5,
    required_hours_per_day DECIMAL(4,2) NOT NULL DEFAULT 8.00,
    break_hours DECIMAL(4,2) NOT NULL DEFAULT 1.00,
    grace_period_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    workday_start_time TIME NOT NULL DEFAULT '08:00:00',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
];

export async function initDb() {
  for (const sql of schema) await pool.query(sql);

  await pool.query(
    `INSERT IGNORE INTO leave_categories (name, credits_per_year, status)
     VALUES ('Vacation', 25, 'active'), ('Sick leave', 25, 'active')`);

  const [leaveBalanceColumns]: any = await pool.query('SHOW COLUMNS FROM leave_balances');
  const leaveBalanceColumnNames = new Set(
    leaveBalanceColumns.map((column: { Field: string }) => column.Field));
  if (!leaveBalanceColumnNames.has('category_id')) {
    await pool.query('ALTER TABLE leave_balances ADD COLUMN category_id INT NULL AFTER user_id');
  }
  if (leaveBalanceColumnNames.has('category')) {
    await pool.query(
      `UPDATE leave_balances b
       JOIN leave_categories c ON LOWER(c.name)=CASE LOWER(b.category)
         WHEN 'sick' THEN 'sick leave' ELSE LOWER(b.category) END
       SET b.category_id=c.id WHERE b.category_id IS NULL`);
    await pool.query(
      `ALTER TABLE leave_balances DROP PRIMARY KEY, DROP COLUMN category,
       MODIFY category_id INT NOT NULL, MODIFY credits DECIMAL(7,1) NOT NULL DEFAULT 25,
       ADD PRIMARY KEY (user_id, category_id)`);
  } else {
    await pool.query('ALTER TABLE leave_balances MODIFY credits DECIMAL(7,1) NOT NULL DEFAULT 25');
  }
  const [leaveBalanceForeignKeys]: any = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='leave_balances'
       AND COLUMN_NAME='category_id' AND REFERENCED_TABLE_NAME='leave_categories'`);
  if (!leaveBalanceForeignKeys.length) {
    await pool.query(
      'ALTER TABLE leave_balances ADD CONSTRAINT fk_leave_balances_category FOREIGN KEY (category_id) REFERENCES leave_categories(id) ON DELETE CASCADE');
  }
  await pool.query(
    `INSERT IGNORE INTO leave_balances (user_id, category_id, credits)
     SELECT u.id, c.id, c.credits_per_year
     FROM users u CROSS JOIN leave_categories c
     WHERE u.role='employee' AND u.is_active=1 AND c.status='active'`);

  const [leaveRequestColumns]: any = await pool.query('SHOW COLUMNS FROM leave_requests');
  const leaveRequestColumnNames = new Set(
    leaveRequestColumns.map((column: { Field: string }) => column.Field));
  if (!leaveRequestColumnNames.has('category_id')) {
    await pool.query('ALTER TABLE leave_requests ADD COLUMN category_id INT NULL AFTER user_id');
    await pool.query(
      `UPDATE leave_requests r
       JOIN leave_categories c ON LOWER(c.name)=CASE LOWER(r.category)
         WHEN 'sick' THEN 'sick leave' ELSE LOWER(r.category) END
       SET r.category_id=c.id`);
    await pool.query(
      'ALTER TABLE leave_requests DROP COLUMN category, MODIFY category_id INT NOT NULL');
  } else if (leaveRequestColumnNames.has('category')) {
    await pool.query('ALTER TABLE leave_requests DROP COLUMN category');
  }
  const [leaveRequestForeignKeys]: any = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='leave_requests'
       AND COLUMN_NAME='category_id' AND REFERENCED_TABLE_NAME='leave_categories'`);
  if (!leaveRequestForeignKeys.length) {
    await pool.query(
      'ALTER TABLE leave_requests ADD CONSTRAINT fk_leave_requests_category FOREIGN KEY (category_id) REFERENCES leave_categories(id)');
  }
  const [payrollRunColumns]: any = await pool.query('SHOW COLUMNS FROM payroll_runs');
  if (!payrollRunColumns.some((column: { Field: string }) => column.Field === 'pay_date')) {
    await pool.query('ALTER TABLE payroll_runs ADD COLUMN pay_date DATE NULL AFTER period_end');
  }
  await pool.query(
    'INSERT IGNORE INTO payroll_settings (id, first_pay_day, second_pay_day) VALUES (1, 15, 31)');
  const [payrollSettingsColumns]: any = await pool.query('SHOW COLUMNS FROM payroll_settings');
  const payrollSettingColumnNames = new Set(
    payrollSettingsColumns.map((column: { Field: string }) => column.Field));
  if (!payrollSettingColumnNames.has('required_days_per_week')) {
    await pool.query('ALTER TABLE payroll_settings ADD COLUMN required_days_per_week TINYINT UNSIGNED NOT NULL DEFAULT 5');
  }
  if (!payrollSettingColumnNames.has('required_hours_per_day')) {
    await pool.query('ALTER TABLE payroll_settings ADD COLUMN required_hours_per_day DECIMAL(4,2) NOT NULL DEFAULT 8.00');
  }
  if (!payrollSettingColumnNames.has('break_hours')) {
    await pool.query('ALTER TABLE payroll_settings ADD COLUMN break_hours DECIMAL(4,2) NOT NULL DEFAULT 1.00');
  }
  if (!payrollSettingColumnNames.has('grace_period_minutes')) {
    await pool.query('ALTER TABLE payroll_settings ADD COLUMN grace_period_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 0');
  }
  if (!payrollSettingColumnNames.has('workday_start_time')) {
    await pool.query("ALTER TABLE payroll_settings ADD COLUMN workday_start_time TIME NOT NULL DEFAULT '08:00:00'");
  }

  const [payrollItemColumns]: any = await pool.query('SHOW COLUMNS FROM payroll_items');
  const payrollItemColumnNames = new Set(
    payrollItemColumns.map((column: { Field: string }) => column.Field));
  if (!payrollItemColumnNames.has('reviewed_by')) {
    await pool.query('ALTER TABLE payroll_items ADD COLUMN reviewed_by INT NULL AFTER employer_contributions');
  }
  if (!payrollItemColumnNames.has('reviewed_at')) {
    await pool.query('ALTER TABLE payroll_items ADD COLUMN reviewed_at DATETIME(6) NULL AFTER reviewed_by');
  }
  const payrollItemAdditions: [string, string][] = [
    ['computed_hours', 'DECIMAL(10,2) NULL'],
    ['computed_pay', 'DECIMAL(12,2) NULL'],
    ['attendance_verified_by', 'INT NULL'],
    ['attendance_verified_at', 'DATETIME(6) NULL'],
    ['sss_calculated', 'DECIMAL(12,2) NULL'],
    ['pagibig_calculated', 'DECIMAL(12,2) NULL'],
    ['sss_override', 'DECIMAL(12,2) NULL'],
    ['pagibig_override', 'DECIMAL(12,2) NULL'],
    ['override_reason', 'VARCHAR(500) NULL'],
    ['override_by', 'INT NULL'],
    ['override_at', 'DATETIME(6) NULL'],
    ['statutory_rules_effective', 'DATE NULL'],
    ['late_minutes', 'INT UNSIGNED NOT NULL DEFAULT 0'],
    ['late_penalty', 'DECIMAL(12,2) NOT NULL DEFAULT 0'],
  ];
  for (const [column, definition] of payrollItemAdditions) {
    if (!payrollItemColumnNames.has(column)) {
      await pool.query(`ALTER TABLE payroll_items ADD COLUMN ${column} ${definition}`);
    }
  }
  const [payrollItemForeignKeys]: any = await pool.query(
    `SELECT CONSTRAINT_NAME, COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payroll_items'
       AND REFERENCED_TABLE_NAME='users'`);
  const foreignKeyColumns = new Set(
    payrollItemForeignKeys.map((key: { COLUMN_NAME: string }) => key.COLUMN_NAME));
  if (!foreignKeyColumns.has('reviewed_by')) {
    await pool.query(
      'ALTER TABLE payroll_items ADD CONSTRAINT fk_payroll_items_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id)');
  }
  if (!foreignKeyColumns.has('override_by')) {
    await pool.query(
      'ALTER TABLE payroll_items ADD CONSTRAINT fk_payroll_items_override_by FOREIGN KEY (override_by) REFERENCES users(id)');
  }
  if (!foreignKeyColumns.has('attendance_verified_by')) {
    await pool.query(
      'ALTER TABLE payroll_items ADD CONSTRAINT fk_payroll_items_attendance_verified_by FOREIGN KEY (attendance_verified_by) REFERENCES users(id)');
  }

  const [unreviewedDraftItems]: any = await pool.query(
    `SELECT i.id, i.pay_rate AS payRate, i.sss_deduction AS sssDeduction,
       i.pagibig_deduction AS pagibigDeduction,
       i.employer_contributions AS employerContributions,
       r.period_start AS periodStart, r.pay_date AS payDate
     FROM payroll_items i JOIN payroll_runs r ON r.id=i.payroll_run_id
     WHERE r.status='draft' AND i.reviewed_at IS NULL
       AND i.pay_basis='monthly' AND i.pay_rate IS NOT NULL
       AND i.sss_calculated IS NULL AND i.pagibig_calculated IS NULL
       AND r.pay_date IS NOT NULL`);
  for (const item of unreviewedDraftItems) {
    if (Number(item.sssDeduction) !== 0 || Number(item.pagibigDeduction) !== 0 ||
        Number(item.employerContributions) !== 0) continue;
    const secondCutoff = Number(String(item.periodStart).slice(8, 10)) >= 16;
    if (secondCutoff && !hasStatutoryRulesFor(String(item.payDate))) continue;
    const contributions = secondCutoff
      ? calculateStatutoryContributions(Number(item.payRate), String(item.payDate))
      : null;
    const sss = contributions?.sssEmployee ?? 0;
    const pagibig = contributions?.pagibigEmployee ?? 0;
    const employer = contributions
      ? Number((contributions.sssEmployer + contributions.sssEc + contributions.pagibigEmployer).toFixed(2))
      : 0;
    await pool.query(
      `UPDATE payroll_items SET sss_calculated=?, pagibig_calculated=?,
         sss_deduction=?, pagibig_deduction=?, employer_contributions=?,
         statutory_rules_effective=?
       WHERE id=? AND reviewed_at IS NULL AND sss_calculated IS NULL AND pagibig_calculated IS NULL`,
      [sss, pagibig, sss, pagibig, employer, contributions?.effective ?? null, item.id]);
  }

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
  if (!existingColumns.has('is_active')) {
    await pool.query('ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1');
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
      `INSERT IGNORE INTO leave_balances (user_id, category_id, credits)
       SELECT ?, id, credits_per_year FROM leave_categories WHERE status='active'`,
      [result.insertId]);
  }
}
