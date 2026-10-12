import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import EmployeeForm from '@/components/admin/EmployeeForm';

interface EmployeeRecord {
  id: number;
  name: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  role: 'admin' | 'employee';
}

export default function Employees() {
  const [users, setUsers] = useState<EmployeeRecord[]>([]);
  const [selected, setSelected] = useState<EmployeeRecord>();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<number>();
  const [employeeToDelete, setEmployeeToDelete] = useState<EmployeeRecord>();

  const load = () => api<EmployeeRecord[]>('/admin/users').then(setUsers).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const removeUser = async () => {
    if (!employeeToDelete) return;
    const user = employeeToDelete;
    setError('');
    setDeletingId(user.id);
    try {
      await api(`/admin/users/${user.id}`, { method: 'DELETE' });
      setUsers((current) => current.filter((item) => item.id !== user.id));
      setEmployeeToDelete(undefined);
    } catch (e: any) {
      setError(e.message);
      setEmployeeToDelete(undefined);
    } finally {
      setDeletingId(undefined);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Employees</CardTitle>
          <Button onClick={() => { setSelected(undefined); setShowForm(true); }}><Plus size={16} />Add employee</Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
          <div className="data-table-wrap">
          <table className="data-table min-w-[680px]">
            <thead>
              <tr><th scope="col">Full name</th><th scope="col">Username</th><th scope="col">Email</th><th scope="col">Phone</th><th scope="col">Role</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>{users.map((user) => (
              <tr key={user.id}>
                <td className="font-medium">{user.name}</td><td>{user.username ?? '—'}</td><td>{user.email ?? '—'}</td><td>{user.phone ?? '—'}</td>
                <td className="capitalize">{user.role}</td>
                <td><div className="flex items-center justify-end gap-1">
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={`Edit ${user.username}`} title={`Edit ${user.username}`} onClick={() => { setSelected(user); setShowForm(true); }}><Pencil size={15} /></Button>
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive" aria-label={`Delete ${user.username}`} title={`Delete ${user.username}`} onClick={() => setEmployeeToDelete(user)} disabled={deletingId === user.id}><Trash2 size={15} /></Button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
          </div>
        </CardContent>
      </Card>
      {showForm && (
        <EmployeeForm
          user={selected}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); setError(''); load(); }}
        />
      )}
      <ConfirmationModal
        open={Boolean(employeeToDelete)}
        title="Delete employee?"
        description={`Delete ${employeeToDelete?.username ?? 'this employee'}? Their time logs and leave data will also be deleted.`}
        confirmLabel="Delete employee"
        destructive
        busy={Boolean(deletingId)}
        onCancel={() => setEmployeeToDelete(undefined)}
        onConfirm={removeUser}
      />
    </>
  );
}
