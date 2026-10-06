import { useRef } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { CircleUserRound, LogOut } from 'lucide-react';
import { useAuth } from './lib/auth';
import { Button } from './components/ui/button';
import Login from './pages/Login';
import Employee from './pages/employee/Employee';
import Admin from './pages/admin/Admin';
import Profile from './pages/Profile';

function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const accountMenu = useRef<HTMLDetailsElement>(null);
  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <span className="font-bold tracking-tight">Mietubl DTR</span>
          <div className="flex items-center gap-3 text-sm">
            <details ref={accountMenu} className="group relative">
              <summary aria-label="Open account menu" className="flex h-10 w-10 cursor-pointer list-none items-center justify-center overflow-hidden rounded-full border bg-muted text-muted-foreground transition hover:ring-2 hover:ring-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                {user?.profilePicture
                  ? <img src={user.profilePicture} alt="" className="h-full w-full object-cover" />
                  : <CircleUserRound size={24} aria-hidden="true" />}
              </summary>
              <div className="absolute right-0 top-12 z-50 w-52 rounded-lg border bg-card p-1.5 shadow-lg">
                <div className="border-b px-3 py-2">
                  <p className="truncate font-medium">{user?.name}</p>
                  <p className="text-xs capitalize text-muted-foreground">{user?.role}</p>
                </div>
                <Link to="/profile" onClick={() => { if (accountMenu.current) accountMenu.current.open = false; }} className="mt-1 block rounded-md px-3 py-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  My Profile
                </Link>
              </div>
            </details>
            <Button variant="ghost" size="sm" onClick={logout}><LogOut size={16} />Sign out</Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <p className="p-8 text-muted-foreground">Loading…</p>;
  if (!user) return <Routes><Route path="*" element={<Login />} /></Routes>;
  return (
    <Shell>
      <Routes>
        <Route path="/" element={user.role === 'admin' ? <Navigate to="/admin" /> : <Navigate to="/employee" />} />
        <Route path="/admin/*" element={user.role === 'admin' ? <Admin /> : <Navigate to="/" />} />
        <Route path="/employee/*" element={user.role === 'employee' ? <Employee /> : <Navigate to="/admin" />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Shell>
  );
}
