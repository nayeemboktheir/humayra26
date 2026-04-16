import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminDataTable, { Column } from "@/components/admin/AdminDataTable";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

const ROLE_OPTIONS = ["admin", "moderator", "employee", "user"];

export default function AdminRoles() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [emails, setEmails] = useState<{ user_id: string; email: string }[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [{ data: roles, error: rolesErr }, { data: userEmails, error: emailsErr }] = await Promise.all([
      supabase.from("user_roles").select("*"),
      supabase.rpc("get_user_emails"),
    ]);
    if (emailsErr) console.error("get_user_emails error:", emailsErr);
    setData(roles || []);
    setEmails(userEmails || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const getEmail = (userId: string) => {
    return emails.find((e) => e.user_id === userId)?.email || userId;
  };

  const columns: Column[] = [
    { key: "user_id", label: "User Email", render: (v) => <span className="text-sm font-medium">{getEmail(v)}</span> },
    { key: "role", label: "Role", editable: true, render: (v) => <Badge>{v}</Badge> },
  ];

  const onUpdate = async (id: string, vals: Record<string, any>) => {
    const { error } = await supabase.from("user_roles").update(vals).eq("id", id);
    if (error) throw error;
    fetchData();
  };

  const onDelete = async (id: string) => {
    const { error } = await supabase.from("user_roles").delete().eq("id", id);
    if (error) throw error;
    fetchData();
  };

  const handleCreate = async () => {
    if (!selectedUserId || !selectedRole) {
      toast({ title: "Please select both user and role", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("user_roles").insert([{ user_id: selectedUserId, role: selectedRole as any }]);
      if (error) throw error;
      toast({ title: "Role assigned successfully" });
      setCreateOpen(false);
      setSelectedUserId("");
      setSelectedRole("");
      fetchData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  // Users who don't already have a role
  const availableUsers = emails.filter((e) => !data.some((d) => d.user_id === e.user_id));

  return (
    <>
      <AdminDataTable
        title="User Roles"
        columns={columns}
        data={data}
        loading={loading}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
      <div className="mt-4">
        <Button onClick={() => setCreateOpen(true)}>+ Assign Role</Button>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Role to User</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>User (Email)</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger><SelectValue placeholder="Select user..." /></SelectTrigger>
                <SelectContent>
                  {availableUsers.map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>{u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Role</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger><SelectValue placeholder="Select role..." /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? "Saving..." : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
