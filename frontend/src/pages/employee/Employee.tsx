import { lazy, Suspense } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const TimeLogs = lazy(() => import('./TimeLogs'));
const Leaves = lazy(() => import('./Leaves'));
const Payslips = lazy(() => import('./Payslips'));

const tabs = [
  { to: 'time-logs', label: 'Time logs' },
  { to: 'leave', label: 'Leave' },
  { to: 'payslips', label: 'Payslips' },
];

export default function Employee() {
  return (
    <div className="space-y-6">
      <nav aria-label="Employee sections" className="flex gap-2">
        {tabs.map(({ to, label }) => (
          <NavLink key={to} to={`/employee/${to}`}>
            {({ isActive }) => <Button variant={isActive ? 'default' : 'outline'} aria-current={isActive ? 'page' : undefined}>{label}</Button>}
          </NavLink>
        ))}
      </nav>
      <Suspense fallback={<Card><CardContent className="py-8 text-center text-muted-foreground">Loading page…</CardContent></Card>}>
        <Routes>
          <Route index element={<Navigate to="time-logs" replace />} />
          <Route path="time-logs" element={<TimeLogs />} />
          <Route path="leave" element={<Leaves />} />
          <Route path="payslips" element={<Payslips />} />
          <Route path="*" element={<Navigate to="time-logs" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}
