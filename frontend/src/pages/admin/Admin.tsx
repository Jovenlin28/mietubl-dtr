import { lazy, Suspense } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const TimeLogs = lazy(() => import('./TimeLogs'));
const Leaves = lazy(() => import('./Leaves'));
const Employees = lazy(() => import('./Employees'));
const Dashboard = lazy(() => import('./Dashboard'));

const tabs = [
  { to: 'dashboard', label: 'Dashboard' },
  { to: 'time-logs', label: 'Time records' },
  { to: 'leaves', label: 'Leave requests' },
  { to: 'employees', label: 'Employees' },
];

export default function Admin() {
  return (
    <div className="space-y-6">
      <nav aria-label="Admin sections" className="flex gap-2">
        {tabs.map(({ to, label }) => (
          <NavLink key={to} to={`/admin/${to}`}>
            {({ isActive }) => <Button variant={isActive ? 'default' : 'outline'} aria-current={isActive ? 'page' : undefined}>{label}</Button>}
          </NavLink>
        ))}
      </nav>
      <Suspense fallback={<Card><CardContent className="py-8 text-center text-muted-foreground">Loading admin page…</CardContent></Card>}>
        <Routes>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="time-logs" element={<TimeLogs />} />
          <Route path="leaves" element={<Leaves />} />
          <Route path="employees" element={<Employees />} />
          <Route path="*" element={<Navigate to="dashboard" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}
