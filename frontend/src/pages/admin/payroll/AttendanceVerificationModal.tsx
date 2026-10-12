import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import type { PayrollAttendance, PayrollItem } from './types';

interface AttendanceVerificationModalProps {
  runId: number;
  item: PayrollItem;
  periodStart: string;
  periodEnd: string;
  onCancel: () => void;
  onVerified: () => Promise<void>;
}

export function AttendanceVerificationModal({
  runId,
  item,
  periodStart,
  periodEnd,
  onCancel,
  onVerified,
}: AttendanceVerificationModalProps) {
  const [attendance, setAttendance] = useState<PayrollAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  const busyRef = useRef(busy);
  onCancelRef.current = onCancel;
  busyRef.current = busy;

  useEffect(() => {
    let cancelled = false;
    setAttendance([]);
    setError('');
    setLoading(true);
    api<PayrollAttendance[]>(`/admin/payroll/runs/${runId}/items/${item.id}/attendance`)
      .then((rows) => {
        if (!cancelled) setAttendance(rows);
      })
      .catch((requestError: Error) => {
        if (!cancelled) setError(requestError.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [runId, item.id]);

  useEffect(() => {
    cancelButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) onCancelRef.current();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, []);

  const verify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api(`/admin/payroll/runs/${runId}/items/${item.id}/attendance/verify`, { method: 'POST' });
      await onVerified();
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : 'Unable to verify attendance.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="attendance-modal-title"
        aria-describedby="attendance-modal-description"
        className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg border bg-card shadow-xl"
      >
        <header className="border-b p-6">
          <h2 id="attendance-modal-title" className="text-lg font-semibold">Verify attendance</h2>
          <p id="attendance-modal-description" className="mt-1 text-sm text-muted-foreground">
            Review {item.employee_name}’s attendance for {periodStart} – {periodEnd} before confirming.
          </p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {error && <p role="alert" className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading attendance…</p>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table min-w-[600px]">
                <thead>
                  <tr><th>Date</th><th>Time in</th><th>Time out</th><th>Hours</th><th>Review notes</th></tr>
                </thead>
                <tbody>
                  {attendance.map((log) => (
                    <tr key={log.id}>
                      <td className="whitespace-nowrap">{log.logDate}</td>
                      <td className="whitespace-nowrap tabular-nums">{log.timeIn ?? '—'}</td>
                      <td className="whitespace-nowrap tabular-nums">{log.timeOut ?? '—'}</td>
                      <td className="whitespace-nowrap tabular-nums">{Number(log.hoursWorked).toFixed(2)}</td>
                      <td className="min-w-44">
                        {log.edited ? (
                          <span className="text-amber-700">Edited{log.editReason ? `: ${log.editReason}` : ''}</span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                  {!attendance.length && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No attendance records for this employee in this period.</td></tr>
                  )}
                </tbody>
                {attendance.length > 0 && (
                  <tfoot>
                    <tr>
                      <th colSpan={3} className="text-right">Total recorded hours</th>
                      <th className="tabular-nums">
                        {attendance.reduce((total, log) => total + Number(log.hoursWorked || 0), 0).toFixed(2)}
                      </th>
                      <th />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
        <footer className="border-t p-4">
          <form id="attendance-verification-form" onSubmit={verify} className="flex justify-between">
            <Button ref={cancelButtonRef} type="button" variant="outline" disabled={busy} onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || loading || Boolean(error)}>
              {busy ? 'Verifying…' : 'Verify'}
            </Button>
          </form>
        </footer>
      </section>
    </div>
  );
}
