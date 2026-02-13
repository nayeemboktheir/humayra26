import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { MessageSquare, Send, Users, Loader2, Search, Mail, MailOpen } from "lucide-react";

export default function AdminMessaging() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [search, setSearch] = useState("");

  // Compose form
  const [targetUser, setTargetUser] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [broadcastMode, setBroadcastMode] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [msgRes, profileRes] = await Promise.all([
      supabase.from("admin_messages").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("user_id, full_name, phone"),
    ]);
    setMessages(msgRes.data || []);
    setProfiles(profileRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const profileMap = new Map(profiles.map((p) => [p.user_id, p]));

  const handleSend = async () => {
    if (!subject.trim() || !message.trim()) {
      toast({ title: "Please fill subject and message", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      if (broadcastMode) {
        // Send to all users
        const inserts = profiles.map((p) => ({
          user_id: p.user_id,
          subject,
          message,
          sent_by: user?.id,
        }));
        if (inserts.length === 0) throw new Error("No users found");
        const { error } = await supabase.from("admin_messages").insert(inserts as any);
        if (error) throw error;
        // Also create notifications for all
        const notifs = profiles.map((p) => ({
          user_id: p.user_id,
          title: subject,
          message,
          type: "message",
        }));
        await supabase.from("notifications").insert(notifs);
        toast({ title: `Message sent to ${inserts.length} users` });
      } else {
        if (!targetUser) {
          toast({ title: "Please select a user", variant: "destructive" });
          setSending(false);
          return;
        }
        const { error } = await supabase.from("admin_messages").insert([{
          user_id: targetUser,
          subject,
          message,
          sent_by: user?.id,
        }] as any);
        if (error) throw error;
        // Also create notification
        await supabase.from("notifications").insert([{
          user_id: targetUser,
          title: subject,
          message,
          type: "message",
        }]);
        toast({ title: "Message sent successfully" });
      }
      setShowCompose(false);
      setSubject("");
      setMessage("");
      setTargetUser("");
      setBroadcastMode(false);
      fetchData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSending(false);
  };

  const filtered = messages.filter((m) => {
    const profile = profileMap.get(m.user_id);
    const name = profile?.full_name || "";
    return name.toLowerCase().includes(search.toLowerCase()) || m.subject.toLowerCase().includes(search.toLowerCase());
  });

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Customer Messaging</h1>
          <p className="text-sm text-muted-foreground">{messages.length} messages sent</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-56" />
          </div>
          <Button onClick={() => setShowCompose(true)}>
            <Send className="h-4 w-4 mr-2" /> Compose
          </Button>
        </div>
      </div>

      {/* Messages list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-muted-foreground">
            <MessageSquare className="h-12 w-12 mb-3 opacity-40" />
            <p>No messages yet</p>
          </div>
        ) : filtered.map((msg) => {
          const profile = profileMap.get(msg.user_id);
          return (
            <Card key={msg.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  {msg.is_read ? <MailOpen className="h-5 w-5 text-muted-foreground" /> : <Mail className="h-5 w-5 text-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{profile?.full_name || "Unknown"}</span>
                    {!msg.is_read && <Badge variant="secondary" className="text-[10px]">Unread</Badge>}
                  </div>
                  <p className="font-semibold text-sm">{msg.subject}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{msg.message}</p>
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {new Date(msg.created_at).toLocaleDateString()}
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Compose Dialog */}
      <Dialog open={showCompose} onOpenChange={setShowCompose}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Compose Message</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={broadcastMode} onChange={(e) => setBroadcastMode(e.target.checked)} className="rounded" />
                <Users className="h-4 w-4" /> Send to all users
              </label>
            </div>
            {!broadcastMode && (
              <div>
                <Label className="text-xs">Recipient</Label>
                <Select value={targetUser} onValueChange={setTargetUser}>
                  <SelectTrigger><SelectValue placeholder="Select a user..." /></SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => (
                      <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.user_id} {p.phone ? `(${p.phone})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs">Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Message subject..." />
            </div>
            <div>
              <Label className="text-xs">Message</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write your message..." rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCompose(false)}>Cancel</Button>
            <Button onClick={handleSend} disabled={sending}>
              {sending ? "Sending..." : broadcastMode ? `Send to ${profiles.length} users` : "Send Message"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
