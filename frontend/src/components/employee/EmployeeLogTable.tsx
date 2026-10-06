import { useState } from 'react';
import { CalendarDays, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmtDay, fmtTime, hoursWorked } from '@/lib/utils';
import EditLogForm from './EditLogForm';
import type { EmployeeLog } from './types';
import { today } from './types';

export default function EmployeeLogTable({ logs, onSaved }: { logs: EmployeeLog[]; onSaved: () => void }) {
  const [editingDate, setEditingDate] = useState<string | null>(null);
  return (
    <Card className="overflow-hidden shadow-sm">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg"><CalendarDays size={18} className="text-primary" />Attendance history</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Your recent time-in and time-out records.</p>
        </div>
        <Button variant="outline" size="sm" className="bg-card" onClick={() => setEditingDate(today())}><Pencil size={14} />Fix a missing time</Button>
      </CardHeader>
      <CardContent className="pt-4">
        {editingDate && (
          <EditLogForm
            date={editingDate}
            log={logs.find((log) => log.log_date.slice(0, 10) === editingDate)}
            onCancel={() => setEditingDate(null)}
            onSaved={() => { setEditingDate(null); onSaved(); }}
          />
        )}
        <div className="data-table-wrap">
        <table className="data-table min-w-[760px]">
          <thead><tr><th scope="col">Date</th><th scope="col">Time in</th><th scope="col">Time out</th><th scope="col">Hours</th><th scope="col">Location</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.log_date}>
                <td className="whitespace-nowrap font-medium">{fmtDay(log.log_date)}</td>
                <td className="tnum whitespace-nowrap">{fmtTime(log.time_in)}</td><td className="tnum whitespace-nowrap">{fmtTime(log.time_out)}</td>
                <td className="tnum whitespace-nowrap font-medium">{hoursWorked(log.time_in, log.time_out)}</td>
                <td className="max-w-md text-muted-foreground">
                  <span className="line-clamp-2">{log.in_address ?? (log.edited ? 'Edited manually' : 'No location recorded')}</span>
                  {log.edited ? <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Edited</span> : null}
                </td>
                <td className="text-right"><Button variant="ghost" size="sm" onClick={() => setEditingDate(log.log_date.slice(0, 10))}>Edit</Button></td>
              </tr>
            ))}
            {!logs.length && <tr><td colSpan={6} className="px-4 py-10 text-center">
              <CalendarDays className="mx-auto mb-2 text-muted-foreground/60" size={24} />
              <p className="font-medium">No attendance records yet</p>
              <p className="mt-1 text-muted-foreground">Your records will appear here after your first time-in.</p>
            </td></tr>}
          </tbody>
        </table>
        </div>
      </CardContent>
    </Card>
  );
}
