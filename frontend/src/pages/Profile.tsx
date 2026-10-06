import { useRef, useState } from 'react';
import { Camera, CircleUserRound, KeyRound, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';

const maxPictureLength = 1_500_000;

async function encodeProfilePicture(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a JPEG, PNG, or WebP image.');
  }
  if (file.size > 5 * 1024 * 1024) throw new Error('Image must be 5 MB or smaller.');

  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 512 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not process this image.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Could not process this image.')), 'image/jpeg', 0.82);
    });
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read this image.'));
      reader.onerror = () => reject(new Error('Could not read this image.'));
      reader.readAsDataURL(blob);
    });
    if (dataUrl.length > maxPictureLength) throw new Error('Image is too large after processing. Choose a smaller image.');
    return dataUrl;
  } finally {
    image.close();
  }
}

export default function Profile() {
  const { user, updateUser } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState(user?.name ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [profilePicture, setProfilePicture] = useState<string | null | undefined>(user?.profilePicture);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const selectPicture = async (file?: File) => {
    if (!file) return;
    setError('');
    try {
      setProfilePicture(await encodeProfilePicture(file));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (Boolean(currentPassword) !== Boolean(newPassword)) {
      setError('Enter both your current and new password to change your password.');
      return;
    }
    setBusy(true);
    try {
      const updatedUser = await api<typeof user>('/me/profile', {
        method: 'PUT',
        body: {
          fullName,
          username,
          email,
          phone,
          profilePicture,
          ...(currentPassword && newPassword ? { currentPassword, newPassword } : {}),
        },
      });
      if (updatedUser) {
        updateUser(updatedUser);
        setUsername(updatedUser.username);
        setFullName(updatedUser.name);
        setEmail(updatedUser.email ?? '');
        setPhone(updatedUser.phone ?? '');
        setProfilePicture(updatedUser.profilePicture);
      }
      setCurrentPassword('');
      setNewPassword('');
      setSuccess('Your profile has been updated.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">My Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your account details, profile photo, and password.</p>
      </header>
      <form className="space-y-6" onSubmit={save}>
        <Card>
          <CardHeader><CardTitle>Personal information</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-col items-center gap-4 rounded-lg border bg-muted/20 p-5 sm:flex-row">
              <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full border bg-muted text-muted-foreground">
                {profilePicture
                  ? <img src={profilePicture} alt="Profile preview" className="h-full w-full object-cover" />
                  : <CircleUserRound size={56} strokeWidth={1.25} aria-hidden="true" />}
              </div>
              <div>
                <p className="font-medium">Profile picture</p>
                <p className="mt-1 text-sm text-muted-foreground">JPEG, PNG, or WebP. Images are resized before saving.</p>
                <div className="mt-3 flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => fileInput.current?.click()}><Camera size={15} />Upload photo</Button>
                  {profilePicture && <Button type="button" size="sm" variant="ghost" onClick={() => setProfilePicture(null)}>Remove</Button>}
                </div>
                <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { selectPicture(event.target.files?.[0]); event.target.value = ''; }} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name"><Input autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} required maxLength={120} /></Field>
              <Field label="Username"><Input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required maxLength={80} /></Field>
              <Field label="Role"><Input value={user?.role === 'admin' ? 'Admin' : 'Employee'} readOnly /></Field>
              <Field label="Email"><Input type="email" autoComplete="email" value={email ?? ''} onChange={(event) => setEmail(event.target.value)} /></Field>
              <Field label="Contact number"><Input type="tel" autoComplete="tel" value={phone ?? ''} onChange={(event) => setPhone(event.target.value)} /></Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound size={18} />Change password</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Current password"><Input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></Field>
            <Field label="New password"><Input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} maxLength={128} /></Field>
          </CardContent>
        </Card>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {success && <p role="status" className="text-sm text-green-700">{success}</p>}
        <div className="flex justify-end">
          <Button type="submit" disabled={busy}><Save size={16} />{busy ? 'Saving…' : 'Save changes'}</Button>
        </div>
      </form>
    </div>
  );
}
