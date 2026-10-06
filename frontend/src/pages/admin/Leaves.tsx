import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import PaginationFooter from '@/components/ui/PaginationFooter';
import { fmtDay, fmtTime } from '@/lib/utils';

interface LeaveRequest {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  created_at: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
}

interface PaginatedLeaves {
  data: LeaveRequest[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export default function Leaves() {
  const [rows, setRows] = useState<LeaveRequest[]>([]);
  const [error, setError] = useState('');
  const [actingId, setActingId] = useState<number>();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const result = await api<PaginatedLeaves>(`/admin/leaves?page=${page}&perPage=${perPage}`);
      setRows(result.data);
      setPage(result.page);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [page, perPage]);

  const act = async (id: number, status: 'approved' | 'rejected') => {
    setError('');
    setActingId(id);
    try {
      await api(`/admin/leaves/${id}`, { method: 'PATCH', body: { status } });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActingId(undefined);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Leave requests</CardTitle></CardHeader>
      <CardContent>
        {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
        <div className="data-table-wrap">
        <table className="data-table min-w-[900px]">
          <thead>
            <tr>
              <th scope="col">Employee</th><th scope="col">Leave From</th><th scope="col">Leave to</th>
              <th scope="col">Reason</th><th scope="col">Date filed</th><th scope="col">Status</th><th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((request) => (
              <tr key={request.id}>
                <td className="whitespace-nowrap font-medium">{request.name}</td>
                <td className="whitespace-nowrap">{fmtDay(request.start_date)}</td>
                <td className="whitespace-nowrap">{fmtDay(request.end_date)}</td>
                <td className="max-w-xs">{request.reason || '—'}</td>
                <td className="whitespace-nowrap">{fmtDay(request.created_at)}<span className="ml-1 text-xs text-muted-foreground">{fmtTime(request.created_at)}</span></td>
                <td><StatusBadge status={request.status} /></td>
                <td>
                  {request.status === 'pending' ? (
                    <div className="flex gap-2">
                      <Button size="sm" disabled={actingId === request.id} onClick={() => act(request.id, 'approved')}>Approve</Button>
                      <Button size="sm" variant="outline" disabled={actingId === request.id} onClick={() => act(request.id, 'rejected')}>Reject</Button>
                    </div>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
              </tr>
            ))}
            {!loading && !rows.length && <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">No leave requests to review.</td></tr>}
            {loading && <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">Loading leave requests…</td></tr>}
          </tbody>
        </table>
        <PaginationFooter
          page={page}
          perPage={perPage}
          total={total}
          totalPages={totalPages}
          onPageChange={setPage}
          onPerPageChange={(size) => { setPage(1); setPerPage(size); }}
        />
        </div>
      </CardContent>
    </Card>
  );
}
