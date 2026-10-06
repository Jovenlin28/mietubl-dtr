import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { today } from './types';

export default function LeaveRequestForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [form, setForm] = useState({ category: 'vacation', startDate: today(), endDate: today(), reason: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      await api('/leaves', { method: 'POST', body: form });
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
      <CardContent className="space-y-3">
        <Field label="Leave type"><Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option value="vacation">Vacation</option><option value="sick">Sick leave</option></Select></Field>
        <Field label="From"><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
        <Field label="To"><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
        <Field label="Reason (optional)"><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
        <Button className="w-full" onClick={submit} disabled={busy}>{busy ? 'Submitting…' : 'Submit request'}</Button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
