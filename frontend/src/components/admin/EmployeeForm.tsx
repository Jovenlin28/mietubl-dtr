import { useState } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';

interface EmployeeFormUser {
  id: number;
  name: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  role: 'admin' | 'employee';
}

const phonePattern = /^(?=(?:\D*\d){7,15}\D*$)\+?[0-9\s().-]+$/;

export default function EmployeeForm({ user, onClose, onSaved }: { user?: EmployeeFormUser; onClose: () => void; onSaved: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const formik = useFormik({
    initialValues: {
      fullName: user?.name ?? '',
      email: user?.email ?? '',
      phone: user?.phone ?? '',
      username: user?.username ?? '',
      password: '',
      role: user?.role ?? 'employee',
    },
    validateOnMount: true,
    validationSchema: Yup.object({
      fullName: Yup.string().trim().required('Full name is required.').max(120, 'Full name must be at most 120 characters.'),
      email: Yup.string().trim().test('valid-email', 'Enter a valid email address.', (value) => !value || Yup.string().email().isValidSync(value)).max(190, 'Email must be at most 190 characters.'),
      phone: Yup.string().trim().test('valid-phone', 'Enter a valid contact number with 7–15 digits.', (value) => !value || phonePattern.test(value)).max(30, 'Contact number must be at most 30 characters.'),
      username: Yup.string().trim().required('Username is required.').max(80, 'Username must be at most 80 characters.'),
      password: user
      ? Yup.string().test('password-length', 'Password must be at least 8 characters.', (value) => !value || value.length >= 8).max(128, 'Password must be at most 128 characters.')
      : Yup.string().required('Password is required.').min(8, 'Password must be at least 8 characters.').max(128, 'Password must be at most 128 characters.'),
      role: Yup.mixed<'admin' | 'employee'>().oneOf(['admin', 'employee']).required('Role is required.'),
    }),
    onSubmit: async (values) => {
      setError('');
      setBusy(true);
      try {
      const body: Record<string, string> = {
        fullName: values.fullName.trim(),
        email: values.email.trim(),
        phone: values.phone.trim(),
        username: values.username.trim(),
        role: values.role,
      };
      if (!user || values.password) body.password = values.password;
      await api(user ? `/admin/users/${user.id}` : '/admin/users', { method: user ? 'PUT' : 'POST', body });
      onSaved();
      } catch (e: any) {
      setError(e.message);
      } finally {
      setBusy(false);
      }
    },
  });

  const fieldError = (name: keyof typeof formik.values) => formik.touched[name] && formik.errors[name]
    ? <span role="alert" className="text-xs text-destructive">{formik.errors[name]}</span>
    : null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="employee-form-title" className="my-auto w-full max-w-lg rounded-lg border bg-card shadow-xl">
        <header className="flex items-center justify-between border-b p-5">
          <h2 id="employee-form-title" className="font-semibold">{user ? 'Edit employee' : 'Create employee'}</h2>
          <Button type="button" variant="ghost" size="sm" aria-label="Close form" onClick={onClose}><X size={18} /></Button>
        </header>
        <form className="space-y-4 p-5" onSubmit={formik.handleSubmit} noValidate>
          <Field label="Full name">
            <Input name="fullName" autoComplete="name" value={formik.values.fullName} onChange={formik.handleChange} onBlur={formik.handleBlur} aria-invalid={!!(formik.touched.fullName && formik.errors.fullName)} />
            {fieldError('fullName')}
          </Field>
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" value={formik.values.email} onChange={formik.handleChange} onBlur={formik.handleBlur} aria-invalid={!!(formik.touched.email && formik.errors.email)} />
            {fieldError('email')}
          </Field>
          <Field label="Contact Number">
            <Input name="phone" type="tel" autoComplete="tel" value={formik.values.phone} onChange={formik.handleChange} onBlur={formik.handleBlur} aria-invalid={!!(formik.touched.phone && formik.errors.phone)} />
            {fieldError('phone')}
          </Field>
          <Field label="Username">
            <Input name="username" autoComplete="username" value={formik.values.username} onChange={formik.handleChange} onBlur={formik.handleBlur} aria-invalid={!!(formik.touched.username && formik.errors.username)} />
            {fieldError('username')}
          </Field>
          <Field label={user ? 'Password (leave blank to keep current password)' : 'Password'}>
            <Input name="password" type="password" autoComplete="new-password" value={formik.values.password} onChange={formik.handleChange} onBlur={formik.handleBlur} aria-invalid={!!(formik.touched.password && formik.errors.password)} />
            {fieldError('password')}
          </Field>
          <Field label="Role">
            <Select name="role" value={formik.values.role} onChange={formik.handleChange} onBlur={formik.handleBlur}>
              <option value="admin">Admin</option><option value="employee">Employee</option>
            </Select>
          </Field>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy || !formik.isValid}>{busy ? 'Saving…' : user ? 'Save changes' : 'Create employee'}</Button>
          </div>
        </form>
      </section>
    </div>
  );
}
