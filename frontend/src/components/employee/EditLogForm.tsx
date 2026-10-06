import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { hhmm } from '@/lib/utils';
import type { EmployeeLog } from './types';
import { today } from './types';

export default function EditLogForm({ date: initialDate, log, onCancel, onSaved }: {
  date: string;
  log?: EmployeeLog;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(initialDate);
  const [timeIn, setTimeIn] = useState(hhmm(log?.time_in));
  const [timeOut, setTimeOut] = useState(hhmm(log?.time_out));
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const save = async () => {
    setError('');
    try {
      await api(`/logs/${date}`, { method: 'PUT', body: { timeIn: timeIn || null, timeOut: timeOut || null, reason } });
      onSaved();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="mb-4 grid gap-3 rounded-md border p-4 sm:grid-cols-4">
      <Field label="Date"><Input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Time in"><Input type="time" value={timeIn} onChange={(e) => setTimeIn(e.target.value)} /></Field>
      <Field label="Time out"><Input type="time" value={timeOut} onChange={(e) => setTimeOut(e.target.value)} /></Field>
      <Field label="Why are you editing?"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Forgot to time out" /></Field>
      <div className="flex items-center gap-2 sm:col-span-4">
        <Button onClick={save} disabled={reason.length < 5 || (!timeIn && !timeOut)}>Save changes</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        {error && <span role="alert" className="text-sm text-destructive">{error}</span>}
      </div>
    </div>
  );
}
