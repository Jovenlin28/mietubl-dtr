import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import LocationTimeClock from '@/components/employee/LocationTimeClock';
import EmployeeLogTable from '@/components/employee/EmployeeLogTable';
import type { EmployeeLog } from '@/components/employee/types';
import { Card, CardContent } from '@/components/ui/card';

export default function TimeLogs() {
  const [logs, setLogs] = useState<EmployeeLog[]>([]);
  const load = useCallback(() => api<EmployeeLog[]>('/logs').then(setLogs), []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <Card className="border-0 bg-transparent shadow-none">
        <CardContent className="px-1 py-0">
          <h1 className="text-2xl font-semibold tracking-tight">Time &amp; attendance</h1>
          <p className="mt-1 text-sm text-muted-foreground">Clock in and out, and review your recent attendance records.</p>
        </CardContent>
      </Card>
      <LocationTimeClock
        todayLog={logs.find((log) => log.log_date.slice(0, 10) === new Date().toLocaleDateString('en-CA'))}
        onPunched={load}
      />
      <EmployeeLogTable logs={logs} onSaved={load} />
    </div>
  );
}
