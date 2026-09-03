import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Pencil, Trash2, Plus, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface Column {
  key: string;
  label: string;
  editable?: boolean;
  render?: (value: any, row: any) => React.ReactNode;
}

interface AdminDataTableProps {
  title: string;
  columns: Column[];
  onUpdate?: (id: string, data: Record<string, any>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onCreate?: (data: Record<string, any>) => Promise<void>;
  createFields?: { key: string; label: string; type?: string; required?: boolean }[];

  /**
   * Server-side mode. When `table` is set, this component owns fetching: search and
   * paging become database queries instead of a client-side filter over every row.
   * These admin lists previously issued an unbounded select("*") and filtered in the
   * browser, so cost grew with total table size on every page view.
   */
  table?: string;
  /** Text columns the search box queries with ilike. Must be text/varchar. */
  searchColumns?: string[];
  orderBy?: { column: string; ascending?: boolean };
  pageSize?: number;
  /** Equality filters applied server-side, e.g. { status: "Delivered" }. */
  filters?: Record<string, string | number | boolean | null>;
  /**
   * Enrich the fetched page before render (e.g. attach customer names). Runs on the
   * current page only, so a lookup join costs one query for `pageSize` rows rather
   * than loading every related row up front.
   */
  transformRows?: (rows: any[]) => Promise<any[]> | any[];

  /** Client-side mode (used by pages that pass derived or joined rows). */
  data?: any[];
  loading?: boolean;
}

const DEFAULT_PAGE_SIZE = 50;

// PostgREST treats these as syntax inside an or() filter, so strip them from user input.
function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,()"%*\\]/g, " ").trim();
}

export default function AdminDataTable({
  title, columns, onUpdate, onDelete, onCreate, createFields,
  table, searchColumns, orderBy, pageSize = DEFAULT_PAGE_SIZE, filters, transformRows,
  data: clientData, loading: clientLoading,
}: AdminDataTableProps) {
  const serverMode = Boolean(table);
  const [search, setSearch] = useState("");
  const [editRow, setEditRow] = useState<any>(null);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [createValues, setCreateValues] = useState<Record<string, any>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Server-side state
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [serverLoading, setServerLoading] = useState(serverMode);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const reqIdRef = useRef(0);

  // Debounce keystrokes so typing doesn't fire a query per character.
  useEffect(() => {
    if (!serverMode) return;
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search, serverMode]);

  // Callers usually pass an inline object literal; key on its contents, not identity.
  const filterKey = JSON.stringify(filters ?? {});

  // A new search term or filter invalidates the current page offset. This resets during
  // render rather than inside an effect: an effect let `load` fire once with the new term
  // but the stale page, and again after setPage(0) landed — two queries per change, the
  // first of them against the wrong offset.
  const resetKey = JSON.stringify([debouncedSearch, filterKey]);
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (serverMode && resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setPage(0);
  }

  const orderColumn = orderBy?.column ?? "created_at";
  const orderAscending = orderBy?.ascending ?? false;
  const searchCols = useMemo(
    () => searchColumns ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchColumns?.join(",")],
  );

  const load = useCallback(async () => {
    if (!table) return;
    const reqId = ++reqIdRef.current;
    setServerLoading(true);
    try {
      let q = supabase.from(table as any).select("*", { count: "exact" });

      for (const [col, val] of Object.entries(filters ?? {})) {
        if (val !== null && val !== undefined) q = q.eq(col, val as any);
      }

      const term = sanitizeSearchTerm(debouncedSearch);
      if (term && searchCols.length > 0) {
        q = q.or(searchCols.map((c) => `${c}.ilike.%${term}%`).join(","));
      }

      const from = page * pageSize;
      const { data: d, count, error } = await q
        .order(orderColumn, { ascending: orderAscending })
        .range(from, from + pageSize - 1);

      // Ignore responses from superseded requests (fast typing / rapid paging).
      if (reqId !== reqIdRef.current) return;
      if (error) {
        toast({ title: "Failed to load", description: error.message, variant: "destructive" });
        setRows([]);
        setTotal(0);
      } else {
        const totalCount = count ?? 0;

        // Deleting the last row of the last page leaves `page` past the end, which would
        // render an empty table with no indication why. Step back and let the page change
        // retrigger the load.
        const lastPage = totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize) - 1;
        if (page > lastPage) {
          setTotal(totalCount);
          setPage(lastPage);
          return;
        }

        const fetched = d || [];
        const enriched = transformRows ? await transformRows(fetched) : fetched;
        if (reqId !== reqIdRef.current) return;
        setRows(enriched);
        setTotal(totalCount);
      }
    } finally {
      if (reqId === reqIdRef.current) setServerLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, debouncedSearch, searchCols, page, pageSize, orderColumn, orderAscending, filterKey]);

  useEffect(() => {
    if (serverMode) void load();
  }, [serverMode, load]);

  // In client mode the parent still supplies and filters the rows.
  const clientFiltered = (clientData ?? []).filter((row) =>
    columns.some((col) =>
      String(row[col.key] ?? "").toLowerCase().includes(search.toLowerCase())
    )
  );

  const filtered = serverMode ? rows : clientFiltered;
  const loading = serverMode ? serverLoading : Boolean(clientLoading);
  const totalCount = serverMode ? total : clientFiltered.length;
  const totalPages = serverMode ? Math.max(1, Math.ceil(total / pageSize)) : 1;

  // Mutations refresh the current page rather than the parent refetching everything.
  const afterMutation = async () => {
    if (serverMode) await load();
  };

  const handleEdit = (row: any) => {
    setEditRow(row);
    const vals: Record<string, any> = {};
    columns.filter((c) => c.editable).forEach((c) => (vals[c.key] = row[c.key] ?? ""));
    setEditValues(vals);
  };

  const handleSaveEdit = async () => {
    if (!onUpdate || !editRow) return;
    setSaving(true);
    try {
      await onUpdate(editRow.id, editValues);
      await afterMutation();
      toast({ title: "Updated successfully" });
      setEditRow(null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const handleCreate = async () => {
    if (!onCreate) return;
    setSaving(true);
    try {
      await onCreate(createValues);
      await afterMutation();
      toast({ title: "Created successfully" });
      setCreateOpen(false);
      setCreateValues({});
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!onDelete || !deleteId) return;
    setSaving(true);
    try {
      await onDelete(deleteId);
      await afterMutation();
      toast({ title: "Deleted successfully" });
      setDeleteId(null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <h2 className="text-2xl font-bold">{title}</h2>
        <div className="flex gap-2 w-full sm:w-auto">
          {/* A server-mode table with no searchable text columns gets paging but no
              search box, rather than one that silently does nothing. */}
          {(!serverMode || searchCols.length > 0) && (
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          )}
          {onCreate && createFields && (
            <Button onClick={() => setCreateOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          )}
        </div>
      </div>

      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key}>{col.label}</TableHead>
              ))}
              {(onUpdate || onDelete) && <TableHead className="w-24">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={columns.length + 1} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={columns.length + 1} className="text-center py-8 text-muted-foreground">No data found</TableCell></TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow key={row.id}>
                  {columns.map((col) => (
                    <TableCell key={col.key} className="max-w-[200px] truncate">
                      {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? "—")}
                    </TableCell>
                  ))}
                  {(onUpdate || onDelete) && (
                    <TableCell>
                      <div className="flex gap-1">
                        {onUpdate && (
                          <Button variant="ghost" size="icon" aria-label="Edit row" onClick={() => handleEdit(row)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {onDelete && (
                          <Button variant="ghost" size="icon" aria-label="Delete row" onClick={() => setDeleteId(row.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mt-2">
        <p className="text-xs text-muted-foreground">
          {serverMode
            ? `${totalCount} record(s)${totalCount > 0 ? ` · page ${page + 1} of ${totalPages}` : ""}`
            : `${totalCount} record(s)`}
        </p>
        {serverMode && totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
              disabled={page + 1 >= totalPages || loading}
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editRow} onOpenChange={() => setEditRow(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Record</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {columns.filter((c) => c.editable).map((col) => (
              <div key={col.key}>
                <Label>{col.label}</Label>
                <Input value={editValues[col.key] ?? ""} onChange={(e) => setEditValues((v) => ({ ...v, [col.key]: e.target.value }))} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRow(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create New</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {createFields?.map((f) => (
              <div key={f.key}>
                <Label>{f.label}{f.required && " *"}</Label>
                <Input type={f.type || "text"} value={createValues[f.key] ?? ""} onChange={(e) => setCreateValues((v) => ({ ...v, [f.key]: e.target.value }))} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? "Creating..." : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirm Delete</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">Are you sure you want to delete this record? This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>{saving ? "Deleting..." : "Delete"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
