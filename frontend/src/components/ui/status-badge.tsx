import { cn } from '@/lib/utils';

type Status = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'draft' | 'paid';

const statusStyles: Record<Status, string> = {
  pending: 'bg-blue-100 text-blue-800 ring-blue-200',
  approved: 'bg-green-100 text-green-800 ring-green-200',
  rejected: 'bg-red-100 text-red-800 ring-red-200',
  cancelled: 'bg-muted text-muted-foreground ring-border',
  draft: 'bg-amber-100 text-amber-800 ring-amber-200',
  paid: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ring-inset', statusStyles[status], className)}>
      {status}
    </span>
  );
}
