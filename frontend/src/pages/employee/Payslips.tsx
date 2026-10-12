import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';

interface Payslip {
  runId: number;
  periodStart: string;
  periodEnd: string;
  payDate: string | null;
  status: 'approved' | 'paid';
  basicPay: string;
  otherEarnings: string;
  sssDeduction: string;
  philhealthDeduction: string;
  pagibigDeduction: string;
  withholdingTax: string;
  otherDeductions: string;
  lateMinutes: number;
  latePenalty: string;
  employerContributions: string;
}

interface PayslipsResponse {
  payslips: Payslip[];
  availableYears: number[];
}

const formatPeso = (value: number | string) => new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
}).format(Number(value) || 0);

export default function Payslips() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setPayslips([]);
    api<PayslipsResponse>(`/payroll/payslips?year=${selectedYear}&month=${selectedMonth}`)
      .then((result) => {
        if (!active) return;
        setPayslips(result.payslips);
        setAvailableYears(result.availableYears);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedYear, selectedMonth]);

  const years = [...new Set([currentYear, selectedYear, ...availableYears])]
    .filter((year) => year <= currentYear)
    .sort((a, b) => b - a);
  const months = Array.from({ length: 12 }, (_, index) => index + 1);
  const formatMonth = (month: number) => new Intl.DateTimeFormat('en-PH', {
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2020, month - 1, 1)));

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Payslips</h1>
        <p className="mt-1 text-sm text-muted-foreground">Approved payroll details for your employee account.</p>
      </header>
      {!error && (
        <div className="grid max-w-xl gap-4 sm:grid-cols-2">
          <Field label="Year">
            <Select
              value={selectedYear}
              disabled={loading}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
            >
              {years.map((year) => <option key={year} value={year}>{year}</option>)}
            </Select>
          </Field>
          <Field label="Month">
            <Select
              value={selectedMonth}
              disabled={loading}
              onChange={(event) => setSelectedMonth(Number(event.target.value))}
            >
              {months.map((month) => (
                <option key={month} value={month}>{formatMonth(month)}</option>
              ))}
            </Select>
          </Field>
        </div>
      )}
      {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      {loading && (
        <p role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          Loading payslips…
        </p>
      )}
      {!loading && !error && !payslips.length && (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No approved payslips for {formatMonth(selectedMonth)} {selectedYear}.</CardContent></Card>
      )}
      {!loading && payslips.map((payslip) => {
        const earnings = Number(payslip.basicPay) + Number(payslip.otherEarnings);
        const deductions = Number(payslip.sssDeduction) + Number(payslip.philhealthDeduction) +
          Number(payslip.pagibigDeduction) + Number(payslip.withholdingTax) +
          Number(payslip.latePenalty) + Number(payslip.otherDeductions);
        const rows: [string, string][] = [
          ['Basic pay', payslip.basicPay],
          ['Additional earnings', payslip.otherEarnings],
          ['SSS employee deduction', payslip.sssDeduction],
          ['PhilHealth employee deduction', payslip.philhealthDeduction],
          ['Pag-IBIG employee deduction', payslip.pagibigDeduction],
          ['Withholding tax', payslip.withholdingTax],
          [`Late deductions (${payslip.lateMinutes} min)`, payslip.latePenalty],
          ['Other deductions', payslip.otherDeductions],
        ];
        return (
          <Card key={payslip.runId}>
            <CardHeader className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Pay period · {payslip.periodStart} – {payslip.periodEnd}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pay date: {payslip.payDate ?? 'not set'} · Status: <StatusBadge status={payslip.status} />
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Net pay</p>
                <p className="text-xl font-semibold">{formatPeso(earnings - deductions)}</p>
              </div>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 sm:grid-cols-2">
                {rows.map(([label, amount]) => (
                  <div key={label} className="flex justify-between gap-4 border-b py-2 text-sm">
                    <dt>{label}</dt><dd className="font-medium tabular-nums">{formatPeso(amount)}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-4 border-b py-2 text-sm font-semibold">
                  <dt>Gross earnings</dt><dd className="tabular-nums">{formatPeso(earnings)}</dd>
                </div>
                <div className="flex justify-between gap-4 border-b py-2 text-sm font-semibold">
                  <dt>Total deductions</dt><dd className="tabular-nums">{formatPeso(deductions)}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                Employer contributions (not deducted from your pay): {formatPeso(payslip.employerContributions)}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
