import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import PaginationFooter from '@/components/ui/PaginationFooter';
import { fmtDay, fmtTime, hoursWorked } from '@/lib/utils';

interface AdminUser { id: number; name: string }
interface AdminLog {
  id: number;
  name: string;
  log_date: string;
  time_in: string | null;
  time_out: string | null;
  in_address: string | null;
  in_ip: string | null;
  out_address: string | null;
  out_ip: string | null;
  edited: number;
  edit_reason: string | null;
}

interface PaginatedLogs {
  data: AdminLog[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export default function TimeLogs() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [filter, setFilter] = useState({ userId: '', from: '', to: '' });
  const [appliedFilter, setAppliedFilter] = useState({ userId: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = async (nextPage = page, nextFilter = filter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        perPage: String(perPage),
        ...Object.fromEntries(Object.entries(nextFilter).filter(([, value]) => value)),
      });
      const result = await api<PaginatedLogs>(`/admin/logs?${params}`);
      setLogs(result.data);
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
  useEffect(() => { api<AdminUser[]>('/admin/users').then(setUsers); }, []);
  useEffect(() => { load(page, appliedFilter); }, [page, perPage, appliedFilter]);

  const exportCsv = async () => {
    setError('');
    try {
      const params = new URLSearchParams({
        page: '1',
        perPage: '100',
        ...Object.fromEntries(Object.entries(appliedFilter).filter(([, value]) => value)),
      });
      const firstPage = await api<PaginatedLogs>(`/admin/logs?${params}`);
      const exportLogs = [...firstPage.data];
      for (let nextPage = 2; nextPage <= firstPage.totalPages; nextPage++) {
        params.set('page', String(nextPage));
        const result = await api<PaginatedLogs>(`/admin/logs?${params}`);
        exportLogs.push(...result.data);
      }
    const rows = [['Name', 'Date', 'In', 'Out', 'Hours', 'In address', 'In IP', 'Out address', 'Out IP', 'Edited', 'Reason'],
      ...exportLogs.map((log) => [log.name, log.log_date, log.time_in, log.time_out, hoursWorked(log.time_in, log.time_out), log.in_address, log.in_ip, log.out_address, log.out_ip, log.edited ? 'yes' : '', log.edit_reason])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'dtr-export.csv';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 0);
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-end gap-3">
        <Select className="w-48" aria-label="Employee" value={filter.userId} onChange={(e) => setFilter({ ...filter, userId: e.target.value })}>
          <option value="">All employees</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
        </Select>
        <Input className="w-40" type="date" aria-label="From" value={filter.from} onChange={(e) => setFilter({ ...filter, from: e.target.value })} />
        <Input className="w-40" type="date" aria-label="To" value={filter.to} onChange={(e) => setFilter({ ...filter, to: e.target.value })} />
        <Button onClick={() => { setPage(1); setAppliedFilter(filter); }}>Apply filters</Button><Button variant="outline" onClick={exportCsv}>Export CSV</Button>
      </CardHeader>
      <CardContent>
        {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
        <div className="data-table-wrap">
        <table className="data-table min-w-[960px]">
          <thead><tr><th scope="col">Employee</th><th scope="col">Date</th><th scope="col">In</th><th scope="col">Out</th><th scope="col">Hours</th><th scope="col">Time-in address / IP</th><th scope="col">Time-out address / IP</th></tr></thead>
          <tbody>{logs.map((log) => (
            <tr key={log.id}>
              <td className="whitespace-nowrap font-medium">{log.name}</td><td className="whitespace-nowrap">{fmtDay(log.log_date)}</td>
              <td className="tnum whitespace-nowrap">{fmtTime(log.time_in)}</td><td className="tnum whitespace-nowrap">{fmtTime(log.time_out)}</td><td className="tnum whitespace-nowrap">{hoursWorked(log.time_in, log.time_out)}</td>
              <td className="max-w-xs"><span>{log.in_address ?? '—'}</span><br /><span className="tnum text-xs text-muted-foreground">{log.in_ip}</span></td>
              <td className="max-w-xs"><span>{log.out_address ?? '—'}</span><br /><span className="tnum text-xs text-muted-foreground">{log.out_ip}</span>
                {log.edited ? <p className="text-amber-700">Edited: {log.edit_reason}</p> : null}</td>
            </tr>
          ))}
          {!loading && !logs.length && <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">No records match these filters.</td></tr>}
          {loading && <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">Loading time logs…</td></tr>}
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
