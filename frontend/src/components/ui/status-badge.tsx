import { cn } from '@/lib/utils';

type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

const statusStyles: Record<LeaveStatus, string> = {
  pending: 'bg-blue-100 text-blue-800 ring-blue-200',
  approved: 'bg-green-100 text-green-800 ring-green-200',
  rejected: 'bg-red-100 text-red-800 ring-red-200',
  cancelled: 'bg-muted text-muted-foreground ring-border',
};

export function StatusBadge({ status, className }: { status: LeaveStatus; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ring-inset', statusStyles[status], className)}>
      {status}
    </span>
  );
}
