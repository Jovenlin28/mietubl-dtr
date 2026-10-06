import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PaginationFooterProps {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: number) => void;
}

export default function PaginationFooter({
  page,
  perPage,
  total,
  totalPages,
  onPageChange,
  onPerPageChange,
}: PaginationFooterProps) {
  const first = total === 0 ? 0 : (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, total);

  return (
    <footer className="flex flex-col gap-3 border-t bg-muted/20 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground">
        <span>Showing <span className="font-medium text-foreground">{first}–{last}</span> of <span className="font-medium text-foreground">{total}</span></span>
        <label className="flex items-center gap-2">
          Rows per page
          <select
            className="h-8 rounded-md border bg-card px-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={perPage}
            onChange={(event) => onPerPageChange(Number(event.target.value))}
            aria-label="Rows per page"
          >
            {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-2">
        <span className="mr-1 text-muted-foreground">Page {page} of {Math.max(totalPages, 1)}</span>
        <Button type="button" size="sm" variant="outline" aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft size={16} />Previous
        </Button>
        <Button type="button" size="sm" variant="outline" aria-label="Next page" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next<ChevronRight size={16} />
        </Button>
      </div>
    </footer>
  );
}
