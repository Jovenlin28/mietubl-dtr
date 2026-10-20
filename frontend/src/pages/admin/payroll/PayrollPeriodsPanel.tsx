import type { FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { AttendanceVerificationModal } from './AttendanceVerificationModal';
import type { PayrollItem, PayrollRun, PayrollRunDetail } from './types';
import { formatPeso } from './types';

interface PayrollPeriodsPanelProps {
  runs: PayrollRun[];
  payrollMonth: string;
  employeeCount: number;
  busy: boolean;
  detail?: PayrollRunDetail;
  basicPayValues: Record<number, string>;
  onPayrollMonthChange: (month: string) => void;
  onCreatePeriods: (event: FormEvent<HTMLFormElement>) => void;
  onSelectRun: (runId: number) => void;
  onDeletePeriod: (run: PayrollRun) => void;
  onChangeStatus: (status: 'approved' | 'paid') => void;
  onBasicPayChange: (itemId: number, value: string) => void;
  onVerifyAttendance: (item: PayrollItem) => void;
  onApplyComputedPay: (item: PayrollItem) => void;
  onUpdateItem: (item: PayrollItem, event: FormEvent<HTMLFormElement>) => void;
  attendanceItem?: PayrollItem;
  selectedRunId?: number;
  onCloseAttendance: () => void;
  onAttendanceVerified: () => Promise<void>;
}

export function PayrollPeriodsPanel({
  runs,
  payrollMonth,
  employeeCount,
  busy,
  detail,
  basicPayValues,
  onPayrollMonthChange,
  onCreatePeriods,
  onSelectRun,
  onDeletePeriod,
  onChangeStatus,
  onBasicPayChange,
  onVerifyAttendance,
  onApplyComputedPay,
  onUpdateItem,
  attendanceItem,
  selectedRunId,
  onCloseAttendance,
  onAttendanceVerified,
}: PayrollPeriodsPanelProps) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Payroll periods</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Create both coverage periods for the selected month: the 1st–15th and 16th–last day. Pay dates come from Settings.</p>
        </CardHeader>
        <CardContent className="space-y-5">
          <form onSubmit={onCreatePeriods} className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="Payroll month"><Input type="month" required value={payrollMonth} onChange={(event) => onPayrollMonthChange(event.target.value)} /></Field>
            <Button type="submit" disabled={busy || !employeeCount}>Create both periods</Button>
          </form>
          <p className="text-xs text-muted-foreground">Monthly salaries are split evenly between both periods; an odd cent is included in the second period. New periods snapshot the employee rates and configured pay dates.</p>

          <div className="data-table-wrap">
            <table className="data-table min-w-[720px]">
              <thead><tr><th>Coverage period</th><th>Pay date</th><th>Employees</th><th>Gross pay</th><th>Deductions</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td>{run.periodStart} – {run.periodEnd}</td>
                    <td>{run.payDate ?? '—'}</td>
                    <td>{run.employeeCount}</td>
                    <td>{formatPeso(run.grossPay)}</td>
                    <td>{formatPeso(run.totalDeductions)}</td>
                    <td><StatusBadge status={run.status} /></td>
                    <td>
                      <div className="flex items-center justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => onSelectRun(run.id)}>Review</Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          aria-label={`Delete payroll period ${run.periodStart} to ${run.periodEnd}`}
                          title="Delete payroll period"
                          disabled={busy}
                          onClick={() => onDeletePeriod(run)}
                        >
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!runs.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No payroll periods have been created.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {detail && (
        <Card>
          <CardHeader className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Payroll period · {detail.periodStart} – {detail.periodEnd}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                <StatusBadge status={detail.status} /> · Pay date: {detail.payDate ?? 'not set'} · Verify attendance, then confirm and save each employee’s pay line before approval.
              </p>
            </div>
            {detail.status === 'draft'
              ? (
                <Button
                  disabled={busy || detail.items.length === 0 || !detail.items.every(
                    (item) => Boolean(item.attendance_verified_at && item.reviewed_at),
                  )}
                  title="Verify attendance and Confirm & Save every employee pay line before approving."
                  onClick={() => onChangeStatus('approved')}
                >
                  Approve and lock
                </Button>
              )
              : detail.status === 'approved'
                ? <Button disabled={busy} onClick={() => onChangeStatus('paid')}>Mark as paid</Button>
                : null}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="data-table-wrap">
              <table className="data-table min-w-[1920px]">
                <thead>
                  <tr>
                    <th>Employee / DTR review</th>
                    <th>Basic pay</th>
                    <th>Computed Pay<br /><span className="font-normal">based on total logged hours</span></th>
                    <th>Additional earnings<br /><span className="font-normal">OT, night, holiday, allowances</span></th>
                    <th>SSS<br /><span className="font-normal">employee</span></th><th>PhilHealth</th><th>Pag-IBIG<br /><span className="font-normal">employee</span></th><th>Withholding tax</th>
                    <th>Late penalties</th><th>Other deductions</th><th>Employer contributions</th><th>Gross / net</th><th>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((item) => {
                    const currentBasicPay = Number(basicPayValues[item.id] ?? item.basic_pay) || 0;
                    const gross = currentBasicPay + Number(item.other_earnings);
                    const lateMinutes = item.reviewed_at ? Number(item.late_minutes) : item.late_preview_minutes;
                    const latePenalty = item.reviewed_at ? Number(item.late_penalty) : item.late_preview_penalty;
                    const computedPayIsSaved = Boolean(item.attendance_verified_at) && item.computed_pay !== null;
                    const computedHours = computedPayIsSaved
                      ? Number(item.computed_hours ?? 0)
                      : item.computed_preview_hours;
                    const computedPay = computedPayIsSaved
                      ? Number(item.computed_pay)
                      : item.computed_preview_pay;
                    const deductions = Number(item.sss_deduction) + Number(item.philhealth_deduction) +
                      Number(item.pagibig_deduction) + Number(item.withholding_tax) +
                      latePenalty + Number(item.other_deductions);
                    const fields: [string, string][] = [
                      ['basicPay', item.basic_pay],
                      ['otherEarnings', item.other_earnings],
                      ['withholdingTax', item.withholding_tax],
                      ['otherDeductions', item.other_deductions],
                      ['employerContributions', item.employer_contributions],
                    ];
                    return (
                      <tr key={item.id}>
                        <td className="min-w-52">
                          <p className="font-medium">{item.employee_name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.pay_basis === 'monthly'
                              ? `Monthly salary · ${formatPeso(item.pay_rate ?? 0)}`
                              : item.pay_basis
                                ? `${item.pay_basis} · ${formatPeso(item.pay_rate ?? 0)} rate`
                                : 'Compensation profile not set'}
                          </p>
                          {item.pay_basis === 'monthly' && (
                            <p className="mt-1 text-xs text-muted-foreground">Basic pay is pre-filled as half the monthly salary.</p>
                          )}
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.logDays} log days · {item.recordedHours ?? '0.00'} raw hours · {item.editedLogDays} edited logs
                          </p>
                          <p className={`mt-1 text-xs font-medium ${item.reviewed_at ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {item.reviewed_at ? 'Pay line reviewed' : 'Review required'}
                          </p>
                        </td>
                        <td className="min-w-36">
                          <Input
                            form={`payroll-item-${item.id}`}
                            name="basicPay"
                            type="number"
                            min="0"
                            max="100000000"
                            step="0.01"
                            required
                            value={basicPayValues[item.id] ?? item.basic_pay}
                            onChange={(event) => onBasicPayChange(item.id, event.target.value)}
                            disabled={detail.status !== 'draft'}
                            className="w-32"
                          />
                        </td>
                        <td className="min-w-44">
                          <p className="font-medium tabular-nums">{formatPeso(computedPay)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {computedHours.toFixed(2)} hours
                            {item.approved_leave_days > 0
                              ? ` incl. ${Number(item.approved_leave_days).toFixed(2)} paid-leave days`
                              : ''}
                          </p>
                          {!computedPayIsSaved && (
                            <p className="mt-1 text-xs font-medium text-amber-700">Not verified · verify attendance first</p>
                          )}
                          {detail.status === 'draft' && (
                            <div className="mt-2 flex flex-col items-start gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={busy || Boolean(item.attendance_verified_at)}
                                onClick={() => onVerifyAttendance(item)}
                              >
                                {item.attendance_verified_at ? 'Attendance verified' : 'Verify attendance'}
                              </Button>
                              {item.attendance_verified_at && (
                                <>
                                  <p className="text-xs text-emerald-700">
                                    Verified by {item.attendance_verified_name ?? 'admin'} ·{' '}
                                    {String(item.attendance_verified_at).replace('T', ' ').slice(0, 19)}
                                  </p>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="min-w-[164px]"
                                    disabled={busy || detail.status !== 'draft'}
                                    onClick={() => onApplyComputedPay(item)}
                                  >
                                    Apply to Basic Pay
                                  </Button>
                                </>
                              )}
                            </div>
                          )}
                        </td>
                        {fields.slice(1, 2).map(([name, value]) => (
                          <td key={name} className="min-w-36">
                            <Input form={`payroll-item-${item.id}`} name={name} type="number" min="0" max="100000000" step="0.01" required defaultValue={value} disabled={detail.status !== 'draft'} className="w-32" />
                          </td>
                        ))}
                        <td className="min-w-40">
                          <Input
                            form={`payroll-item-${item.id}`}
                            name="sssOverride"
                            type="number"
                            min="0"
                            max="100000000"
                            step="0.01"
                            defaultValue={item.sss_override ?? item.sss_calculated ?? item.sss_deduction}
                            disabled={detail.status !== 'draft'}
                            className="w-32"
                            aria-label={`SSS deduction override for ${item.employee_name}; leave blank to use automatic calculation`}
                          />
                          <p className="mt-1 text-xs text-muted-foreground">
                            Calculated: {formatPeso(item.sss_calculated ?? item.sss_deduction)} · Applied: {formatPeso(item.sss_deduction)}
                          </p>
                        </td>
                        <td className="min-w-36">
                          <Input form={`payroll-item-${item.id}`} name="philhealthDeduction" type="number" min="0" max="100000000" step="0.01" required defaultValue={item.philhealth_deduction} disabled={detail.status !== 'draft'} className="w-32" />
                        </td>
                        <td className="min-w-40">
                          <Input
                            form={`payroll-item-${item.id}`}
                            name="pagibigOverride"
                            type="number"
                            min="0"
                            max="100000000"
                            step="0.01"
                            defaultValue={item.pagibig_override ?? item.pagibig_calculated ?? item.pagibig_deduction}
                            disabled={detail.status !== 'draft'}
                            className="w-32"
                            aria-label={`Pag-IBIG deduction override for ${item.employee_name}; leave blank to use automatic calculation`}
                          />
                          <p className="mt-1 text-xs text-muted-foreground">
                            Calculated: {formatPeso(item.pagibig_calculated ?? item.pagibig_deduction)} · Applied: {formatPeso(item.pagibig_deduction)}
                          </p>
                        </td>
                        {fields.slice(2, 3).map(([name, value]) => (
                          <td key={name} className="min-w-36">
                            <Input form={`payroll-item-${item.id}`} name={name} type="number" min="0" max="100000000" step="0.01" required defaultValue={value} disabled={detail.status !== 'draft'} className="w-32" />
                          </td>
                        ))}
                        <td className="min-w-36">
                          <p className="font-medium tabular-nums">{formatPeso(latePenalty)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{lateMinutes} billable late min</p>
                          {!item.reviewed_at && <p className="mt-1 text-xs font-medium text-amber-700">Not saved · use Confirm &amp; Save</p>}
                        </td>
                        {fields.slice(3).map(([name, value]) => (
                          <td key={name} className="min-w-36">
                            <Input form={`payroll-item-${item.id}`} name={name} type="number" min="0" max="100000000" step="0.01" required defaultValue={value} disabled={detail.status !== 'draft'} className="w-32" />
                          </td>
                        ))}
                        <td className="min-w-36 text-right">
                          <p>{formatPeso(gross)} gross</p>
                          <p className="text-xs text-muted-foreground">{formatPeso(gross - deductions)} net</p>
                        </td>
                        <td className="min-w-32 whitespace-nowrap">
                          {detail.status === 'draft' && (
                            <form id={`payroll-item-${item.id}`} className="flex min-w-40 flex-col items-center gap-2" onSubmit={(event) => onUpdateItem(item, event)}>
                              <Input
                                name="overrideReason"
                                type="text"
                                maxLength={500}
                                placeholder="Override reason (if used)"
                                defaultValue={item.override_reason ?? ''}
                                disabled={detail.status !== 'draft'}
                                className="w-40 text-xs"
                                aria-label={`SSS or Pag-IBIG override reason for ${item.employee_name}`}
                              />
                              <Button type="submit" size="sm" className="min-w-[132px] whitespace-nowrap" disabled={busy || !item.attendance_verified_at}>Confirm &amp; Save</Button>
                            </form>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!detail.items.length && <tr><td colSpan={13} className="px-4 py-8 text-center text-muted-foreground">This payroll run has no employee accounts.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              SSS and Pag-IBIG are calculated from the saved monthly salary and deducted in full on the second cutoff. Leave an override blank to use the calculation; entering an override requires a reason. PhilHealth and withholding tax remain manual. Verify statutory results against current Philippine rules before approval. Employer contributions are separate and not deducted from net pay.
            </p>
          </CardContent>
        </Card>
      )}
      {attendanceItem && selectedRunId !== undefined && detail && (
        <AttendanceVerificationModal
          key={`${selectedRunId}-${attendanceItem.id}`}
          runId={selectedRunId}
          item={attendanceItem}
          periodStart={detail.periodStart}
          periodEnd={detail.periodEnd}
          onCancel={onCloseAttendance}
          onVerified={onAttendanceVerified}
        />
      )}
    </>
  );
}
