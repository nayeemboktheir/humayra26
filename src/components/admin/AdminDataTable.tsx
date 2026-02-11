import { useState } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Pencil, Trash2, Plus, Search } from "lucide-react";
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
  data: any[];
  loading: boolean;
  onUpdate?: (id: string, data: Record<string, any>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onCreate?: (data: Record<string, any>) => Promise<void>;
  createFields?: { key: string; label: string; type?: string; required?: boolean }[];
}

export default function AdminDataTable({
  title, columns, data, loading, onUpdate, onDelete, onCreate, createFields,
}: AdminDataTableProps) {
  const [search, setSearch] = useState("");
  const [editRow, setEditRow] = useState<any>(null);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [createValues, setCreateValues] = useState<Record<string, any>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = data.filter((row) =>
    columns.some((col) =>
      String(row[col.key] ?? "").toLowerCase().includes(search.toLowerCase())
    )
  );

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
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
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
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(row)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {onDelete && (
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(row.id)}>
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

      <p className="text-xs text-muted-foreground mt-2">{filtered.length} record(s)</p>

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
