import { forwardRef, InputHTMLAttributes, SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
const base = 'flex h-10 w-full rounded-md border bg-card px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, r) => <input ref={r} className={cn(base, className)} {...p} />);
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select className={cn(base, className)} {...p} />;
export const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block space-y-1.5"><span className="text-sm font-medium">{label}</span>{children}</label>
);
