export interface PayrollEmployee {
  id: number;
  name: string;
  payBasis: 'monthly' | 'daily' | 'hourly' | null;
  payRate: string | null;
}

export interface PayrollRun {
  id: number;
  periodStart: string;
  periodEnd: string;
  payDate: string | null;
  status: 'draft' | 'approved' | 'paid';
  employeeCount: number;
  grossPay: string;
  totalDeductions: string;
  paidAt?: string | null;
}

export interface PayrollItem {
  id: number;
  user_id: number;
  employee_name: string;
  pay_basis: 'monthly' | 'daily' | 'hourly' | null;
  pay_rate: string | null;
  basic_pay: string;
  computed_hours: string | null;
  computed_pay: string | null;
  computed_preview_hours: number;
  computed_preview_pay: number;
  approved_leave_days: number;
  attendance_verified_by: number | null;
  attendance_verified_at: string | null;
  attendance_verified_name: string | null;
  other_earnings: string;
  sss_deduction: string;
  sss_calculated: string | null;
  sss_override: string | null;
  philhealth_deduction: string;
  pagibig_deduction: string;
  pagibig_calculated: string | null;
  pagibig_override: string | null;
  override_reason: string | null;
  withholding_tax: string;
  other_deductions: string;
  late_minutes: number;
  late_penalty: string;
  late_preview_minutes: number;
  late_preview_penalty: number;
  employer_contributions: string;
  logDays: number;
  editedLogDays: number;
  recordedHours: string;
  reviewed_at: string | null;
}

export interface PayrollRunDetail extends Omit<PayrollRun, 'employeeCount' | 'grossPay' | 'totalDeductions'> {
  items: PayrollItem[];
}

export interface PayrollSettings {
  firstPayDay: number;
  secondPayDay: number;
  requiredDaysPerWeek: number;
  requiredHoursPerDay: number;
  breakHours: number;
  gracePeriodMinutes: number;
  workdayStartTime: string;
}

export interface PayrollAttendance {
  id: number;
  logDate: string;
  timeIn: string | null;
  timeOut: string | null;
  hoursWorked: number;
  edited: number;
  editReason: string | null;
}

export const formatPeso = (value: number | string) => new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
}).format(Number(value) || 0);
