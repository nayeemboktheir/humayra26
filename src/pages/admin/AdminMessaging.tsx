import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { MessageSquare, Send, Users, Loader2, Search, ArrowLeft, Hash, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type Msg = {
  id: string;
  user_id: string;
  subject: string;
  message: string;
  is_read: boolean;
  sent_by: string | null;
  sender_role: string | null;
  thread_id: string | null;
  order_id: string | null;
  created_at: string;
};

type Thread = {
  key: string;
  user_id: string;
  thread_id: string | null;
  order_id: string | null;
  subject: string;
  last: Msg;
  messages: Msg[];
  unread: number;
};

export default function AdminMessaging() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [search, setSearch] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Compose form
  const [targetUser, setTargetUser] = useState("");
  const [targetOrder, setTargetOrder] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [broadcastMode, setBroadcastMode] = useState(false);
  const [broadcastScope, setBroadcastScope] = useState<"all" | "all_orders">("all");

  const fetchData = async () => {
    setLoading(true);
    const [msgRes, profileRes, orderRes] = await Promise.all([
      supabase.from("admin_messages").select("*").order("created_at", { ascending: true }),
      supabase.from("profiles").select("user_id, full_name, phone, avatar_url"),
      supabase.from("orders").select("id, user_id, order_number, product_name"),
    ]);
    setMessages(((msgRes.data as any) || []) as Msg[]);
    setProfiles(profileRes.data || []);
    setOrders(orderRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("admin_messages_admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_messages" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.user_id, p])), [profiles]);
  const orderMap = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);

  const threads: Thread[] = useMemo(() => {
    const groups = new Map<string, Thread>();
    for (const m of messages) {
      const tid = m.thread_id || m.order_id || `subj:${m.subject}`;
      const key = `${m.user_id}::${tid}`;
      const existing = groups.get(key);
      if (existing) {
        existing.messages.push(m);
        existing.last = m;
        if (!m.is_read && (m.sender_role || "admin") === "user") existing.unread++;
      } else {
        groups.set(key, {
          key,
          user_id: m.user_id,
          thread_id: m.thread_id,
          order_id: m.order_id,
          subject: m.subject,
          last: m,
          messages: [m],
          unread: !m.is_read && (m.sender_role || "admin") === "user" ? 1 : 0,
        });
      }
    }
    return [...groups.values()].sort((a, b) => new Date(b.last.created_at).getTime() - new Date(a.last.created_at).getTime());
  }, [messages]);

  const filteredThreads = threads.filter((t) => {
    const p = profileMap.get(t.user_id);
    const name = (p?.full_name || "").toLowerCase();
    const q = search.toLowerCase();
    return !q || name.includes(q) || t.subject.toLowerCase().includes(q);
  });

  const active = activeKey ? threads.find((t) => t.key === activeKey) : null;

  useEffect(() => { if (active) bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [active?.messages.length]);

  // Mark user messages in active thread as read
  useEffect(() => {
    if (!active) return;
    const unread = active.messages.filter((m) => !m.is_read && (m.sender_role || "admin") === "user").map((m) => m.id);
    if (unread.length === 0) return;
    supabase.from("admin_messages").update({ is_read: true }).in("id", unread).then(() => {
      setMessages((prev) => prev.map((m) => unread.includes(m.id) ? { ...m, is_read: true } : m));
    });
  }, [active?.key]);

  const totalUnread = threads.reduce((s, t) => s + t.unread, 0);

  const sendReply = async () => {
    if (!active || !reply.trim() || !user) return;
    setSending(true);
    const { error } = await supabase.from("admin_messages").insert([{
      user_id: active.user_id,
      sent_by: user.id,
      sender_role: "admin",
      subject: active.subject,
      message: reply.trim(),
      thread_id: active.thread_id || active.key.split("::")[1],
      order_id: active.order_id,
      is_read: false,
    }] as any);
    if (!error) {
      await supabase.from("notifications").insert([{
        user_id: active.user_id, title: active.subject, message: reply.trim(), type: "message",
      }]);
    }
    setSending(false);
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    setReply("");
    fetchData();
  };

  const handleCompose = async () => {
    if (!subject.trim() || !message.trim()) {
      toast({ title: "Please fill subject and message", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      if (broadcastMode) {
        let recipients: { user_id: string; order_id?: string }[] = [];
        if (broadcastScope === "all_orders") {
          // One message per order — appears in that order's thread
          recipients = orders.map((o) => ({ user_id: o.user_id, order_id: o.id }));
        } else {
          recipients = profiles.map((p) => ({ user_id: p.user_id }));
        }
        if (recipients.length === 0) throw new Error("No recipients found");
        const inserts = recipients.map((r) => ({
          user_id: r.user_id,
          order_id: r.order_id || null,
          thread_id: crypto.randomUUID(),
          subject,
          message,
          sent_by: user?.id,
          sender_role: "admin",
        }));
        const { error } = await supabase.from("admin_messages").insert(inserts as any);
        if (error) throw error;
        const notifs = recipients.map((r) => ({ user_id: r.user_id, title: subject, message, type: "message" }));
        await supabase.from("notifications").insert(notifs);
        toast({ title: `Sent to ${recipients.length} ${broadcastScope === "all_orders" ? "orders" : "users"}` });
      } else {
        if (!targetUser) { toast({ title: "Select a user", variant: "destructive" }); setSending(false); return; }
        const { error } = await supabase.from("admin_messages").insert([{
          user_id: targetUser,
          order_id: targetOrder || null,
          thread_id: crypto.randomUUID(),
          subject, message,
          sent_by: user?.id,
          sender_role: "admin",
        }] as any);
        if (error) throw error;
        await supabase.from("notifications").insert([{ user_id: targetUser, title: subject, message, type: "message" }]);
        toast({ title: "Message sent" });
      }
      setShowCompose(false);
      setSubject(""); setMessage(""); setTargetUser(""); setTargetOrder("");
      setBroadcastMode(false); setBroadcastScope("all");
      fetchData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSending(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  // Thread detail view
  if (active) {
    const p = profileMap.get(active.user_id);
    const ord = active.order_id ? orderMap.get(active.order_id) : null;
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        <div className="flex items-center gap-2 pb-3 border-b">
          <Button variant="ghost" size="icon" onClick={() => setActiveKey(null)}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold truncate">{active.subject}</h2>
            <p className="text-xs text-muted-foreground truncate">
              {p?.full_name || "Unknown"} {p?.phone && `· ${p.phone}`}
              {ord && <span className="ml-1 inline-flex items-center gap-1"><Hash className="h-3 w-3" />{ord.order_number}</span>}
            </p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-4 space-y-3">
          {active.messages.map((m) => {
            const fromAdmin = (m.sender_role || "admin") !== "user";
            return (
              <div key={m.id} className={cn("flex", fromAdmin ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                  fromAdmin ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm",
                )}>
                  <p className="whitespace-pre-wrap break-words">{m.message}</p>
                  <p className={cn("text-[10px] mt-1 opacity-70")}>
                    {fromAdmin ? "Admin" : (p?.full_name || "User")} · {new Date(m.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        <div className="border-t pt-3 flex items-end gap-2">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Write a reply..."
            rows={2}
            className="resize-none"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
          />
          <Button onClick={sendReply} disabled={sending || !reply.trim()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Customer Messaging</h1>
          <p className="text-sm text-muted-foreground">
            {threads.length} threads · {totalUnread} unread
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-56" />
          </div>
          <Button onClick={() => setShowCompose(true)}><Plus className="h-4 w-4 mr-1" /> Compose</Button>
        </div>
      </div>

      <div className="space-y-2">
        {filteredThreads.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-muted-foreground">
            <MessageSquare className="h-12 w-12 mb-3 opacity-40" />
            <p>No conversations yet</p>
          </div>
        ) : filteredThreads.map((t) => {
          const p = profileMap.get(t.user_id);
          const ord = t.order_id ? orderMap.get(t.order_id) : null;
          return (
            <Card key={t.key} onClick={() => setActiveKey(t.key)}
              className={cn("cursor-pointer hover:shadow-md transition-shadow", t.unread > 0 && "border-primary/40 bg-primary/5")}>
              <CardContent className="p-4 flex items-start gap-3">
                {p?.avatar_url ? (
                  <img src={p.avatar_url} alt="" loading="lazy" decoding="async" className="w-10 h-10 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <MessageSquare className="h-5 w-5 text-primary" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{p?.full_name || "Unknown"}</span>
                    {t.unread > 0 && <Badge className="bg-primary text-primary-foreground text-[10px]">{t.unread}</Badge>}
                  </div>
                  <p className="font-semibold text-sm truncate">{t.subject}</p>
                  {ord && (
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Hash className="h-3 w-3" />{ord.order_number} · {ord.product_name?.slice(0, 50)}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
                    {(t.last.sender_role || "admin") === "user" ? `${p?.full_name || "User"}: ` : "Admin: "}{t.last.message}
                  </p>
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {new Date(t.last.created_at).toLocaleDateString()}
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Compose */}
      <Dialog open={showCompose} onOpenChange={setShowCompose}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Compose Message</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={broadcastMode} onChange={(e) => setBroadcastMode(e.target.checked)} className="rounded" />
                <Users className="h-4 w-4" /> Broadcast
              </label>
              {broadcastMode && (
                <Select value={broadcastScope} onValueChange={(v) => setBroadcastScope(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All users ({profiles.length})</SelectItem>
                    <SelectItem value="all_orders">All orders ({orders.length}) — one message per order</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            {!broadcastMode && (
              <>
                <div>
                  <Label className="text-xs">Recipient</Label>
                  <Select value={targetUser} onValueChange={(v) => { setTargetUser(v); setTargetOrder(""); }}>
                    <SelectTrigger><SelectValue placeholder="Select a user..." /></SelectTrigger>
                    <SelectContent>
                      {profiles.map((p) => (
                        <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.user_id} {p.phone ? `(${p.phone})` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {targetUser && (
                  <div>
                    <Label className="text-xs">Related order (optional)</Label>
                    <Select value={targetOrder} onValueChange={setTargetOrder}>
                      <SelectTrigger><SelectValue placeholder="No specific order" /></SelectTrigger>
                      <SelectContent>
                        {orders.filter((o) => o.user_id === targetUser).map((o) => (
                          <SelectItem key={o.id} value={o.id}>#{o.order_number} — {o.product_name?.slice(0, 60)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
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
            <Button onClick={handleCompose} disabled={sending}>
              {sending ? "Sending..." : broadcastMode
                ? `Send to ${broadcastScope === "all_orders" ? orders.length + " orders" : profiles.length + " users"}`
                : "Send Message"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
