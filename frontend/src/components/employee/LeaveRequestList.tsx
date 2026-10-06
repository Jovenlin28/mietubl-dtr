import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { fmtDay } from '@/lib/utils';
import type { LeaveRequest } from './types';

export default function LeaveRequestList({ requests, onChanged }: { requests: LeaveRequest[]; onChanged: () => void }) {
  const [error, setError] = useState('');
  const [cancellingId, setCancellingId] = useState<number>();

  const cancel = async (id: number) => {
    setError('');
    setCancellingId(id);
    try {
      await api(`/leaves/${id}`, { method: 'DELETE' });
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCancellingId(undefined);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Your requests</CardTitle></CardHeader>
      <CardContent>
        {error && <p role="alert" className="mb-2 text-sm text-destructive">{error}</p>}
        {requests.map((request) => (
          <div key={request.id} className="flex items-center justify-between border-t py-3 text-sm">
            <div>
              <p className="font-medium capitalize">{request.category} · {Number(request.days)} day(s)</p>
              <p className="text-muted-foreground">{fmtDay(request.start_date)} to {fmtDay(request.end_date)}</p>
              {request.reason && <p className="text-muted-foreground">{request.reason}</p>}
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={request.status} />
              {request.status === 'pending' && <Button size="sm" variant="ghost" disabled={cancellingId === request.id} onClick={() => cancel(request.id)}>Cancel</Button>}
            </div>
          </div>
        ))}
        {!requests.length && <p className="py-6 text-center text-muted-foreground">No leave requests yet.</p>}
      </CardContent>
    </Card>
  );
}
