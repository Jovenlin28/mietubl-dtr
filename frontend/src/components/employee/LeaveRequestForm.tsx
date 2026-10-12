import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { today } from './types';

interface LeaveCategory {
  id: number;
  name: string;
}

interface LeaveBalance {
  categoryId: number;
  credits: string | number;
  pendingDays: string | number;
  availableCredits: string | number;
}

export default function LeaveRequestForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [categories, setCategories] = useState<LeaveCategory[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [form, setForm] = useState({ categoryId: '', startDate: today(), endDate: today(), reason: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<LeaveCategory[]>('/leave-categories'),
      api<LeaveBalance[]>('/leaves/balance'),
    ])
      .then(([rows, categoryBalances]) => {
        if (cancelled) return;
        setCategories(rows);
        setBalances(categoryBalances);
        setForm((current) => ({
          ...current,
          categoryId: current.categoryId || String(rows[0]?.id ?? ''),
        }));
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingCategories(false);
      });
    return () => { cancelled = true; };
  }, []);

  const start = new Date(`${form.startDate}T00:00:00`);
  const end = new Date(`${form.endDate}T00:00:00`);
  const leaveDays = form.startDate && form.endDate &&
      !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) &&
      end.getTime() >= start.getTime()
    ? Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
    : 0;
  const selectedBalance = balances.find((balance) => balance.categoryId === Number(form.categoryId));
  const availableCredits = selectedBalance ? Number(selectedBalance.availableCredits) : 0;
  const exceedsAvailableCredits = leaveDays > 0 && selectedBalance !== undefined &&
    leaveDays > availableCredits;
  const canFile = leaveDays > 0 && selectedBalance !== undefined && !exceedsAvailableCredits;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canFile) return;
    setError('');
    setBusy(true);
    try {
      await api('/leaves', {
        method: 'POST',
        body: { ...form, categoryId: Number(form.categoryId) },
      });
      setBalances((current) => current.map((balance) => balance.categoryId === Number(form.categoryId)
        ? {
          ...balance,
          pendingDays: Number(balance.pendingDays) + leaveDays,
          availableCredits: Math.max(0, Number(balance.availableCredits) - leaveDays),
        }
        : balance));
      setForm((current) => ({ ...current, reason: '' }));
      onSubmitted();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle>File a leave request</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          {categories.length
            ? <Field label="Leave type"><Select required value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></Field>
            : <p className="text-sm text-muted-foreground">{loadingCategories ? 'Loading leave categories…' : 'No active leave categories are available.'}</p>}
          <Field label="From"><Input type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
          <Field label="To"><Input type="date" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
          {form.startDate && form.endDate && (
            <div className={`rounded-md border p-3 text-sm ${
              exceedsAvailableCredits
                ? 'border-destructive/30 bg-destructive/5 text-destructive'
                : canFile
                  ? 'border-emerald-600/30 bg-emerald-50 text-emerald-800'
                  : 'border-amber-600/30 bg-amber-50 text-amber-800'
            }`}>
              <p className="font-medium">
                {leaveDays > 0 ? `${leaveDays} leave day${leaveDays === 1 ? '' : 's'}` : 'Choose a valid date range'}
                {selectedBalance && ` · ${availableCredits} credit${availableCredits === 1 ? '' : 's'} available`}
              </p>
              {exceedsAvailableCredits ? (
                <p role="alert" className="mt-1 flex items-start gap-2">
                  <AlertCircle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
                  This request exceeds your available credits for this leave type.
                </p>
              ) : canFile ? (
                <p className="mt-1 flex items-center gap-2">
                  <CheckCircle2 size={17} aria-hidden="true" />
                  You have enough credits to file this leave request.
                </p>
              ) : null}
            </div>
          )}
          <Field label="Reason (optional)"><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
          <Button className="w-full" type="submit" disabled={busy || !canFile}>{busy ? 'Submitting…' : 'Submit request'}</Button>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
