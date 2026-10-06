import { useEffect, useState } from 'react';
import { CalendarDays, ClipboardList, UserCheck, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { fmtDay, fmtTime } from '@/lib/utils';

type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

interface RecentLeaveRequest {
  id: number;
  name: string;
  category: 'vacation' | 'sick';
  start_date: string;
  end_date: string;
  status: LeaveStatus;
  created_at: string;
}

interface DashboardData {
  date: string;
  employeeCount: number;
  presentToday: number;
  onLeaveToday: number;
  pendingLeaveRequests: number;
  recentLeaveRequests: RecentLeaveRequest[];
}

const metrics = [
  { key: 'employeeCount', label: 'Employees', description: 'Active employee accounts', icon: Users, color: 'bg-slate-100 text-slate-700' },
  { key: 'presentToday', label: 'Present today', description: 'Employees who have clocked in', icon: UserCheck, color: 'bg-emerald-100 text-emerald-700' },
  { key: 'onLeaveToday', label: 'On leave today', description: 'Approved leave requests for today', icon: CalendarDays, color: 'bg-sky-100 text-sky-700' },
  { key: 'pendingLeaveRequests', label: 'Pending requests', description: 'Leave requests awaiting review', icon: ClipboardList, color: 'bg-amber-100 text-amber-700' },
] as const;

export default function Dashboard() {
  const [data, setData] = useState<DashboardData>();
  const [error, setError] = useState('');

  useEffect(() => {
    api<DashboardData>('/admin/dashboard')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  const todayLabel = new Date(`${data?.date ?? new Date().toLocaleDateString('en-CA')}T00:00:00`)
    .toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">{todayLabel} · Here’s today’s attendance overview.</p>
      </header>

      {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

      <section aria-label="Attendance summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ key, label, description, icon: Icon, color }) => (
          <Card key={key} className="shadow-sm transition-shadow hover:shadow-md">
            <CardContent className="flex items-start justify-between gap-4 p-5">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{label}</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">{data ? data[key] : '—'}</p>
                <p className="mt-1 text-xs text-muted-foreground">{description}</p>
              </div>
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${color}`}>
                <Icon size={21} aria-hidden="true" />
              </span>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Recent leave requests</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Latest requests filed by employees.</p>
        </CardHeader>
        <CardContent>
          {!data && !error && <p className="py-8 text-center text-sm text-muted-foreground">Loading dashboard…</p>}
          {data && (
            <div className="data-table-wrap">
              <table className="data-table min-w-[720px]">
                <thead>
                  <tr>
                    <th scope="col">Employee</th>
                    <th scope="col">Type</th>
                    <th scope="col">Leave dates</th>
                    <th scope="col">Date filed</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentLeaveRequests.map((request) => (
                    <tr key={request.id}>
                      <td className="whitespace-nowrap font-medium">{request.name}</td>
                      <td className="capitalize">{request.category}</td>
                      <td className="whitespace-nowrap">{fmtDay(request.start_date)} – {fmtDay(request.end_date)}</td>
                      <td className="whitespace-nowrap">{fmtDay(request.created_at)} <span className="text-xs text-muted-foreground">{fmtTime(request.created_at)}</span></td>
                      <td><StatusBadge status={request.status} /></td>
                    </tr>
                  ))}
                  {!data.recentLeaveRequests.length && (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No leave requests have been filed yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
