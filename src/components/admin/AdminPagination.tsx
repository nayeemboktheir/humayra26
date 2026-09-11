import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const PAGE_SIZE_OPTIONS = [12, 24, 48, 96];

/**
 * Client-side paging for admin lists that already hold the full result set in memory
 * (aggregates computed across every row, or a capped fetch). Lists that can page at the
 * database level should use AdminDataTable's server mode instead — it pages with
 * `range()` and never downloads the whole table.
 *
 * `resetKeys` are the filter/search values that can shrink the result set; any change
 * sends the view back to page 1 so you don't land on a page that no longer exists.
 */
export function usePagination<T>(items: T[], initialPageSize = 24, resetKeys: unknown[] = []) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;

  const resetKey = JSON.stringify([...resetKeys, pageSize]);
  useEffect(() => { setPage(1); }, [resetKey]);

  // A refetch can shrink the list under the current page; follow the clamp back.
  useEffect(() => { if (page !== currentPage) setPage(currentPage); }, [page, currentPage]);

  const paged = useMemo(
    () => items.slice(pageStart, pageStart + pageSize),
    [items, pageStart, pageSize],
  );

  return {
    paged,
    page: currentPage,
    pageSize,
    setPage,
    setPageSize,
    totalPages,
    pageStart,
    totalItems: items.length,
  };
}

interface AdminPaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  pageStart: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  /** Plural noun for the summary line, e.g. "orders", "customers". */
  label?: string;
  className?: string;
}

export default function AdminPagination({
  page, pageSize, totalItems, totalPages, pageStart,
  onPageChange, onPageSizeChange, label = "records", className = "",
}: AdminPaginationProps) {
  if (totalItems === 0) return null;

  // First page, last page, and a window around the current one; the rest collapses to "…".
  const pageNumbers: (number | "gap")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 2) pageNumbers.push(i);
    else if (pageNumbers[pageNumbers.length - 1] !== "gap") pageNumbers.push("gap");
  }

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 mt-6 ${className}`}>
      <p className="text-sm text-muted-foreground">
        Showing {pageStart + 1}–{Math.min(pageStart + pageSize, totalItems)} of {totalItems} {label}
      </p>

      <div className="flex items-center gap-3 flex-wrap justify-center">
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:inline">Per page</span>
            <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
              <SelectTrigger className="h-8 w-[76px]" aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline" size="sm" className="h-8"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
            >
              Previous
            </Button>
            {pageNumbers.map((n, i) =>
              n === "gap" ? (
                <span key={`gap-${i}`} className="px-1.5 text-muted-foreground">…</span>
              ) : (
                <Button
                  key={n}
                  variant={n === page ? "default" : "outline"}
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => onPageChange(n)}
                  aria-current={n === page ? "page" : undefined}
                >
                  {n}
                </Button>
              )
            )}
            <Button
              variant="outline" size="sm" className="h-8"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
