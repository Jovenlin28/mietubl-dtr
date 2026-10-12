export interface StatutoryContributions {
  sssEmployee: number;
  sssEmployer: number;
  sssEc: number;
  pagibigEmployee: number;
  pagibigEmployer: number;
  effective: string;
}

export interface LatePenaltySettings {
  requiredDaysPerWeek: number;
  requiredHoursPerDay: number;
  gracePeriodMinutes: number;
  workdayStartTime: string;
}

interface StatutoryRule {
  effective: string;
  sss: {
    rate: number;
    employeeShare: number;
    mscMin: number;
    mscMax: number;
    step: number;
    ecLow: number;
    ecHigh: number;
    ecThreshold: number;
  };
  pagibig: {
    fundSalaryCap: number;
    employeeRate: number;
    employeeRateLow: number;
    lowThreshold: number;
    employerRate: number;
  };
}

const rules: StatutoryRule[] = [
  {
    effective: '2025-01-01',
    sss: {
      rate: 0.15,
      employeeShare: 5 / 15,
      mscMin: 5_000,
      mscMax: 35_000,
      step: 500,
      ecLow: 10,
      ecHigh: 30,
      ecThreshold: 15_000,
    },
    pagibig: {
      fundSalaryCap: 10_000,
      employeeRate: 0.02,
      employeeRateLow: 0.01,
      lowThreshold: 1_500,
      employerRate: 0.02,
    },
  },
];

const round2 = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;

function parseTimeInSeconds(value: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/.exec(value);
  if (!match) throw new Error(`Invalid DTR time-in value: ${value}`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

export function calculateLateMinutes(
  timeIns: string[],
  settings: Pick<LatePenaltySettings, 'gracePeriodMinutes' | 'workdayStartTime'>,
): number {
  if (!Number.isInteger(settings.gracePeriodMinutes) ||
      settings.gracePeriodMinutes < 0 || settings.gracePeriodMinutes > 1440) {
    throw new Error('Grace period must be a whole number of minutes from 0 to 1,440.');
  }
  const startSeconds = parseTimeInSeconds(`${settings.workdayStartTime}:00`);
  return timeIns.reduce((total, timeIn) => {
    const lateSeconds = parseTimeInSeconds(timeIn) - startSeconds;
    if (lateSeconds <= 0) return total;
    const lateMinutes = Math.ceil(lateSeconds / 60);
    return total + Math.max(0, lateMinutes - settings.gracePeriodMinutes);
  }, 0);
}

export function calculateLatePenalty(
  payBasis: 'monthly' | 'daily' | 'hourly' | null,
  payRate: number | null,
  lateMinutes: number,
  settings: Pick<LatePenaltySettings, 'requiredDaysPerWeek' | 'requiredHoursPerDay'>,
): number {
  if (!Number.isFinite(lateMinutes) || lateMinutes < 0) {
    throw new Error('Late minutes must be a non-negative finite amount.');
  }
  if (lateMinutes === 0 || payBasis === null || payRate === null) return 0;
  if (!Number.isFinite(payRate) || payRate < 0) {
    throw new Error('Pay rate and late minutes must be non-negative finite amounts.');
  }
  if (!Number.isInteger(settings.requiredDaysPerWeek) ||
      settings.requiredDaysPerWeek < 1 || settings.requiredDaysPerWeek > 7) {
    throw new Error('Required workdays per week must be a whole number from 1 to 7.');
  }
  if (!Number.isFinite(settings.requiredHoursPerDay) || settings.requiredHoursPerDay <= 0) {
    throw new Error('Required work hours per day must be greater than zero.');
  }

  const perMinuteRate = payBasis === 'monthly'
    ? (payRate * 12) / (settings.requiredDaysPerWeek * 52.2) / settings.requiredHoursPerDay / 60
    : payBasis === 'daily'
      ? payRate / settings.requiredHoursPerDay / 60
      : payRate / 60;
  return round2(lateMinutes * perMinuteRate);
}

export interface ComputedPay {
  hours: number;
  pay: number;
}

export function calculateHoursBasedPay(
  payBasis: 'monthly' | 'daily' | 'hourly' | null,
  payRate: number | null,
  loggedHours: number,
  approvedLeaveDays: number,
  settings: Pick<LatePenaltySettings, 'requiredDaysPerWeek' | 'requiredHoursPerDay'>,
): ComputedPay {
  if (!Number.isFinite(loggedHours) || loggedHours < 0 ||
      !Number.isFinite(approvedLeaveDays) || approvedLeaveDays < 0) {
    throw new Error('Logged hours and approved leave days must be non-negative finite amounts.');
  }
  if (!Number.isFinite(settings.requiredHoursPerDay) || settings.requiredHoursPerDay <= 0) {
    throw new Error('Required work hours per day must be greater than zero.');
  }
  if (!Number.isInteger(settings.requiredDaysPerWeek) ||
      settings.requiredDaysPerWeek < 1 || settings.requiredDaysPerWeek > 7) {
    throw new Error('Required workdays per week must be a whole number from 1 to 7.');
  }
  if (payBasis === null || payRate === null) return { hours: loggedHours, pay: 0 };
  if (!Number.isFinite(payRate) || payRate < 0) {
    throw new Error('Pay rate must be a non-negative finite amount.');
  }

  const hours = loggedHours + approvedLeaveDays * settings.requiredHoursPerDay;
  const hourlyRate = payBasis === 'monthly'
    ? (payRate * 12) / (settings.requiredDaysPerWeek * 52.2) / settings.requiredHoursPerDay
    : payBasis === 'daily'
      ? payRate / settings.requiredHoursPerDay
      : payRate;
  return { hours, pay: round2(hours * hourlyRate) };
}

function rulesFor(payDate: string): StatutoryRule {
  const rule = [...rules]
    .sort((a, b) => b.effective.localeCompare(a.effective))
    .find((item) => item.effective <= payDate);
  if (!rule) throw new Error(`No statutory payroll rules are configured for pay date ${payDate}.`);
  return rule;
}

export function hasStatutoryRulesFor(payDate: string): boolean {
  return rules.some((rule) => rule.effective <= payDate);
}

export function calculateStatutoryContributions(
  monthlySalary: number,
  payDate: string,
): StatutoryContributions {
  if (!Number.isFinite(monthlySalary) || monthlySalary < 0) {
    throw new Error('Monthly salary must be a non-negative finite amount.');
  }
  const rule = rulesFor(payDate);
  const { sss, pagibig } = rule;
  const salaryCents = Math.round(monthlySalary * 100);
  const stepCents = sss.step * 100;
  const halfStepCents = stepCents / 2;
  const msc = Math.min(
    sss.mscMax,
    Math.max(sss.mscMin, Math.floor((salaryCents + halfStepCents) / stepCents) * sss.step),
  );
  const sssTotal = round2(msc * sss.rate);
  const sssEmployee = round2(sssTotal * sss.employeeShare);
  const sssEmployer = round2(sssTotal - sssEmployee);
  const sssEc = msc >= sss.ecThreshold ? sss.ecHigh : sss.ecLow;

  const pagibigBase = Math.min(monthlySalary, pagibig.fundSalaryCap);
  const pagibigEmployeeRate = monthlySalary <= pagibig.lowThreshold
    ? pagibig.employeeRateLow
    : pagibig.employeeRate;

  return {
    sssEmployee,
    sssEmployer,
    sssEc,
    pagibigEmployee: round2(pagibigBase * pagibigEmployeeRate),
    pagibigEmployer: round2(pagibigBase * pagibig.employerRate),
    effective: rule.effective,
  };
}
