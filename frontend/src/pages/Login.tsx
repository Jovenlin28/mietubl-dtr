import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setError(''); setBusy(true);
    try { await fn(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const signIn = () => run(async () => {
    const r = await api('/auth/login', { method: 'POST', body: { username, password } });
    login(r.token, r.user);
  });

  return (
    <main className="relative isolate grid min-h-screen place-items-center overflow-hidden bg-[#153d40] px-4 py-8">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-cover bg-[center_42%]"
        style={{ backgroundImage: "linear-gradient(90deg, rgb(9 36 41 / 32%), rgb(9 36 41 / 8%)), url('/dtr-login-background.svg')" }}
      />
      <Card className="w-full max-w-sm border-white/70 bg-white/95 shadow-2xl shadow-slate-950/25 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-xl">Sign in to DTR</CardTitle>
          <p className="text-sm text-muted-foreground">Sign in with your username and password.</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); signIn(); }}>
            <Field label="Username">
              <Input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </Field>
            <Field label="Password">
              <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            <Button className="w-full" type="submit" disabled={busy || !username || !password}>Sign in</Button>
          </form>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </main>
  );
}
