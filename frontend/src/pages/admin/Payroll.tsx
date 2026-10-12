import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { EmployeeRatesPanel } from './payroll/EmployeeRatesPanel';
import { PayrollPeriodsPanel } from './payroll/PayrollPeriodsPanel';
import { PayrollSettingsPanel } from './payroll/PayrollSettingsPanel';
import type { PayrollEmployee, PayrollItem, PayrollRun, PayrollRunDetail, PayrollSettings } from './payroll/types';

interface PayrollConfirmation {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  action: () => Promise<void>;
}

export default function Payroll() {
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [settings, setSettings] = useState<PayrollSettings>({
    firstPayDay: 15,
    secondPayDay: 31,
    requiredDaysPerWeek: 5,
    requiredHoursPerDay: 8,
    breakHours: 1,
    gracePeriodMinutes: 0,
    workdayStartTime: '08:00',
  });
  const [activeTab, setActiveTab] = useState<'settings' | 'employee-rates' | 'periods'>('settings');
  const [payrollMonth, setPayrollMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedRunId, setSelectedRunId] = useState<number>();
  const [detail, setDetail] = useState<PayrollRunDetail>();
  const [attendanceItem, setAttendanceItem] = useState<PayrollItem>();
  const [basicPayValues, setBasicPayValues] = useState<Record<number, string>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<PayrollConfirmation>();

  const loadSetup = async () => {
    const [employeeRows, runRows, payrollSettings] = await Promise.all([
      api<PayrollEmployee[]>('/admin/payroll/employees'),
      api<PayrollRun[]>('/admin/payroll/runs'),
      api<PayrollSettings>('/admin/payroll/settings'),
    ]);
    setEmployees(employeeRows);
    setRuns(runRows);
    setSettings(payrollSettings);
  };

  const loadDetail = async (runId: number) => {
    const result = await api<PayrollRunDetail>(`/admin/payroll/runs/${runId}`);
    setDetail(result);
    setBasicPayValues(Object.fromEntries(
      result.items.map((item) => [item.id, item.basic_pay]),
    ));
  };

  useEffect(() => {
    loadSetup().catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (selectedRunId !== undefined) {
      loadDetail(selectedRunId).catch((e) => setError(e.message));
    } else {
      setDetail(undefined);
    }
  }, [selectedRunId]);

  const saveProfile = async (
    employeeIds: number[],
    payBasis: NonNullable<PayrollEmployee['payBasis']>,
    payRate: number,
  ) => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await api('/admin/payroll/employees/bulk', {
        method: 'PUT',
        body: { employeeIds, payBasis, payRate },
      });
      await loadSetup();
      setNotice(`Compensation profile saved for ${employeeIds.length} employee${employeeIds.length === 1 ? '' : 's'}.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await api('/admin/payroll/settings', { method: 'PUT', body: settings });
      setNotice('Payroll settings saved. Existing payroll periods are unchanged.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const createPeriods = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const result = await api<{ runIds: number[] }>('/admin/payroll/months', {
        method: 'POST',
        body: { month: payrollMonth },
      });
      await loadSetup();
      setSelectedRunId(result.runIds[0]);
      setActiveTab('periods');
      setNotice('Both draft periods were created. Monthly salaries are split between the two periods; review pay and deductions before approval.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const verifyAttendance = (item: PayrollItem) => {
    if (!detail || detail.status !== 'draft') return;
    setAttendanceItem(item);
  };

  const attendanceVerified = async () => {
    if (selectedRunId === undefined) return;
    setError('');
    setNotice('');
    try {
      await loadDetail(selectedRunId);
      setNotice(`Attendance verified and computed pay saved for ${attendanceItem?.employee_name ?? 'the employee'}.`);
      setAttendanceItem(undefined);
    } catch (e: any) {
      setError(e.message);
      throw e;
    }
  };

  const applyComputedPay = (item: PayrollItem) => {
    if (!item.attendance_verified_at || item.computed_pay === null) return;
    setBasicPayValues((current) => ({
      ...current,
      [item.id]: Number(item.computed_pay).toFixed(2),
    }));
  };

  const updateItem = async (item: PayrollItem, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!detail) return;
    const form = new FormData(event.currentTarget);
    const amount = (name: string) => Number(form.get(name));
    const optionalAmount = (name: string) => {
      const value = form.get(name);
      return typeof value === 'string' && value.trim() !== '' ? Number(value) : null;
    };
    const enteredSss = optionalAmount('sssOverride');
    const enteredPagibig = optionalAmount('pagibigOverride');
    const sssCalculated = Number(item.sss_calculated ?? item.sss_deduction);
    const pagibigCalculated = Number(item.pagibig_calculated ?? item.pagibig_deduction);
    const sssOverride = enteredSss !== null && Math.round(enteredSss * 100) !== Math.round(sssCalculated * 100)
      ? enteredSss
      : null;
    const pagibigOverride = enteredPagibig !== null && Math.round(enteredPagibig * 100) !== Math.round(pagibigCalculated * 100)
      ? enteredPagibig
      : null;
    const overrideReasonValue = form.get('overrideReason');
    const overrideReason = typeof overrideReasonValue === 'string' && overrideReasonValue.trim()
      ? overrideReasonValue.trim()
      : null;
    if ((sssOverride !== null || pagibigOverride !== null) && (!overrideReason || overrideReason.length < 5)) {
      setError('Enter a reason of at least 5 characters when overriding SSS or Pag-IBIG.');
      return;
    }
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await api(`/admin/payroll/runs/${detail.id}/items/${item.id}`, {
        method: 'PATCH',
        body: {
          basicPay: amount('basicPay'),
          otherEarnings: amount('otherEarnings'),
          philhealthDeduction: amount('philhealthDeduction'),
          withholdingTax: amount('withholdingTax'),
          otherDeductions: amount('otherDeductions'),
          employerContributions: amount('employerContributions'),
          sssOverride,
          pagibigOverride,
          overrideReason,
        },
      });
      await loadDetail(detail.id);
      await loadSetup();
      setNotice(`Payroll values saved for ${item.employee_name}.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const deletePeriod = (run: PayrollRun) => {
    if (run.status !== 'draft') return;
    setConfirmation({
      title: 'Delete draft payroll period?',
      description: `Delete ${run.periodStart} – ${run.periodEnd}? Its pay lines will also be permanently deleted.`,
      confirmLabel: 'Delete period',
      destructive: true,
      action: async () => {
        await api(`/admin/payroll/runs/${run.id}`, { method: 'DELETE' });
        setRuns((current) => current.filter((item) => item.id !== run.id));
        if (selectedRunId === run.id) {
          setSelectedRunId(undefined);
          setDetail(undefined);
        }
        setNotice('Draft payroll period deleted.');
      },
    });
  };

  const changeStatus = (status: 'approved' | 'paid') => {
    if (!detail) return;
    const isApproval = status === 'approved';
    setConfirmation({
      title: isApproval ? 'Approve payroll run?' : 'Mark payroll run as paid?',
      description: isApproval
        ? 'Approve and lock this payroll run? Approved pay lines cannot be edited.'
        : 'Confirm that this payroll run has been paid.',
      confirmLabel: isApproval ? 'Approve and lock' : 'Mark as paid',
      action: async () => {
        await api(`/admin/payroll/runs/${detail.id}/status`, { method: 'PATCH', body: { status } });
        await loadDetail(detail.id);
        await loadSetup();
        setNotice(isApproval ? 'Payroll run approved and locked.' : 'Payroll run marked as paid.');
      },
    });
  };

  const confirmPayrollAction = async () => {
    if (!confirmation) return;
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await confirmation.action();
      setConfirmation(undefined);
    } catch (e: any) {
      setError(e.message);
      setConfirmation(undefined);
    } finally {
      setBusy(false);
    }
  };

  const changeTab = (tab: 'settings' | 'employee-rates' | 'periods') => {
    setActiveTab(tab);
    if (tab !== 'periods') setAttendanceItem(undefined);
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Payroll</h1>
        <p className="mt-1 text-sm text-muted-foreground">Configure monthly pay dates, manage employee rates, and prepare payroll periods for review.</p>
      </header>

      {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="rounded-md border border-emerald-600/30 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      <ConfirmationModal
        open={Boolean(confirmation)}
        title={confirmation?.title ?? ''}
        description={confirmation?.description ?? ''}
        confirmLabel={confirmation?.confirmLabel ?? 'Confirm'}
        destructive={confirmation?.destructive}
        busy={busy}
        onCancel={() => setConfirmation(undefined)}
        onConfirm={confirmPayrollAction}
      />

      <nav aria-label="Payroll configuration" className="flex gap-2">
        <Button type="button" variant={activeTab === 'settings' ? 'default' : 'outline'} aria-pressed={activeTab === 'settings'} onClick={() => changeTab('settings')}>Settings</Button>
        <Button type="button" variant={activeTab === 'employee-rates' ? 'default' : 'outline'} aria-pressed={activeTab === 'employee-rates'} onClick={() => changeTab('employee-rates')}>Employee rates</Button>
        <Button type="button" variant={activeTab === 'periods' ? 'default' : 'outline'} aria-pressed={activeTab === 'periods'} onClick={() => changeTab('periods')}>Payroll periods</Button>
      </nav>

      {activeTab === 'settings' && (
        <PayrollSettingsPanel
          settings={settings}
          busy={busy}
          onChange={setSettings}
          onSave={saveSettings}
        />
      )}
      {activeTab === 'employee-rates' && (
        <EmployeeRatesPanel employees={employees} busy={busy} onSave={saveProfile} />
      )}
      {activeTab === 'periods' && (
        <PayrollPeriodsPanel
          runs={runs}
          payrollMonth={payrollMonth}
          employeeCount={employees.length}
          busy={busy}
          detail={detail}
          basicPayValues={basicPayValues}
          onPayrollMonthChange={setPayrollMonth}
          onCreatePeriods={createPeriods}
          onSelectRun={setSelectedRunId}
          onDeletePeriod={deletePeriod}
          onChangeStatus={changeStatus}
          onBasicPayChange={(itemId, value) => setBasicPayValues((current) => ({ ...current, [itemId]: value }))}
          onVerifyAttendance={verifyAttendance}
          onApplyComputedPay={applyComputedPay}
          onUpdateItem={updateItem}
          attendanceItem={attendanceItem}
          selectedRunId={selectedRunId}
          onCloseAttendance={() => setAttendanceItem(undefined)}
          onAttendanceVerified={attendanceVerified}
        />
      )}
    </div>
  );
}
