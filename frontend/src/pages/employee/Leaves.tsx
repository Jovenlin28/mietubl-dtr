import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import LeaveBalanceCards from '@/components/employee/LeaveBalanceCards';
import LeaveRequestForm from '@/components/employee/LeaveRequestForm';
import LeaveRequestList from '@/components/employee/LeaveRequestList';
import type { LeaveBalance, LeaveRequest } from '@/components/employee/types';

export default function Leaves() {
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [nextBalances, nextRequests] = await Promise.all([
        api<LeaveBalance[]>('/leaves/balance'),
        api<LeaveRequest[]>('/leaves'),
      ]);
      setBalances(nextBalances);
      setRequests(nextRequests);
      setError('');
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="grid gap-6 md:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        <LeaveBalanceCards balances={balances} />
        <LeaveRequestForm onSubmitted={load} />
      </div>
      <div className="space-y-3">
        {error && <Card><CardContent className="pt-5"><p role="alert" className="text-sm text-destructive">{error}</p></CardContent></Card>}
        <LeaveRequestList requests={requests} onChanged={load} />
      </div>
    </div>
  );
}
