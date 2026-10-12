import { useEffect, useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { Field, Input, Select } from '@/components/ui/input';

interface LeaveCategory {
  id: number;
  name: string;
  creditsPerYear: string | number;
  status: 'active' | 'inactive';
}

interface LeaveCategoryForm {
  name: string;
  creditsPerYear: string;
  status: LeaveCategory['status'];
}

const emptyForm: LeaveCategoryForm = { name: '', creditsPerYear: '25', status: 'active' };

export default function LeaveCategories() {
  const [categories, setCategories] = useState<LeaveCategory[]>([]);
  const [form, setForm] = useState<LeaveCategoryForm>(emptyForm);
  const [editing, setEditing] = useState<LeaveCategory>();
  const [categoryToDelete, setCategoryToDelete] = useState<LeaveCategory>();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setCategories(await api<LeaveCategory[]>('/admin/leave-categories'));
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load leave categories.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openCreate = () => {
    setEditing(undefined);
    setForm(emptyForm);
    setError('');
    setShowForm(true);
  };

  const openEdit = (category: LeaveCategory) => {
    setEditing(category);
    setForm({
      name: category.name,
      creditsPerYear: String(category.creditsPerYear),
      status: category.status,
    });
    setError('');
    setShowForm(true);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        creditsPerYear: Number(form.creditsPerYear),
        status: form.status,
      };
      if (editing) {
        await api(`/admin/leave-categories/${editing.id}`, { method: 'PUT', body: payload });
      } else {
        await api('/admin/leave-categories', { method: 'POST', body: payload });
      }
      setShowForm(false);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save leave category.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!categoryToDelete) return;
    setError('');
    setDeleting(true);
    try {
      await api(`/admin/leave-categories/${categoryToDelete.id}`, { method: 'DELETE' });
      setCategoryToDelete(undefined);
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete leave category.');
      setCategoryToDelete(undefined);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Leave categories</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Manage the leave types available to employees and their annual credits.</p>
          </div>
          <Button type="button" onClick={openCreate}><Plus size={16} />Add category</Button>
        </CardHeader>
        <CardContent>
          {error && !showForm && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
          <div className="data-table-wrap">
            <table className="data-table min-w-[620px]">
              <thead>
                <tr><th scope="col">Leave category</th><th scope="col">Leave credits per year</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id}>
                    <td className="font-medium">{category.name}</td>
                    <td className="tabular-nums">{Number(category.creditsPerYear).toLocaleString()}</td>
                    <td>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        category.status === 'active'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {category.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={`Edit ${category.name}`} title={`Edit ${category.name}`} onClick={() => openEdit(category)}>
                          <Pencil size={15} />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive" aria-label={`Delete ${category.name}`} title={`Delete ${category.name}`} onClick={() => setCategoryToDelete(category)}>
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {loading && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Loading leave categories…</td></tr>}
                {!loading && !categories.length && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">No leave categories have been created.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {showForm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) setShowForm(false);
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="leave-category-title" className="w-full max-w-lg rounded-lg border bg-card p-6 shadow-xl">
            <h2 id="leave-category-title" className="text-lg font-semibold">{editing ? 'Edit leave category' : 'Add leave category'}</h2>
            <form onSubmit={save} className="mt-5 space-y-4">
              {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
              <Field label="Leave category">
                <Input autoFocus required maxLength={100} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
              </Field>
              <Field label="Leave credits per year">
                <Input type="number" required min="0" max="999999.9" step="0.1" value={form.creditsPerYear} onChange={(event) => setForm((current) => ({ ...current, creditsPerYear: event.target.value }))} />
              </Field>
              <Field label="Status">
                <Select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as LeaveCategory['status'] }))}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </Field>
              <div className="flex justify-between border-t pt-4">
                <Button type="button" variant="outline" disabled={saving} onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create category'}</Button>
              </div>
            </form>
          </section>
        </div>
      )}

      <ConfirmationModal
        open={Boolean(categoryToDelete)}
        title="Delete leave category?"
        description={`Delete ${categoryToDelete?.name ?? 'this category'}? Categories used by leave request history cannot be deleted; deactivate those instead.`}
        confirmLabel="Delete category"
        destructive
        busy={deleting}
        onCancel={() => setCategoryToDelete(undefined)}
        onConfirm={remove}
      />
    </>
  );
}
