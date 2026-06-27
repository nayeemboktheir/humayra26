import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import EmptyState from "@/components/dashboard/EmptyState";
import { Loader2, MessageSquare, Send, Hash, ArrowLeft, Plus } from "lucide-react";
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

type Order = {
  id: string;
  order_number: string;
  product_name: string;
};

type Thread = {
  key: string;
  thread_id: string | null;
  order_id: string | null;
  subject: string;
  order_number?: string;
  product_name?: string;
  last: Msg;
  messages: Msg[];
  unread: number;
};

const Messages = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newOrderId, setNewOrderId] = useState<string>("");
  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchAll = async () => {
    if (!user) return;
    const [msgs, ords] = await Promise.all([
      supabase.from("admin_messages").select("*").eq("user_id", user.id).order("created_at", { ascending: true }),
      supabase.from("orders").select("id, order_number, product_name").eq("user_id", user.id).order("created_at", { ascending: false }),
    ]);
    setMessages((msgs.data as any) || []);
    setOrders((ords.data as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [user]);

  // Realtime updates for this user's messages
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("admin_messages_user_" + user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_messages", filter: `user_id=eq.${user.id}` }, () => {
        fetchAll();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const threads: Thread[] = useMemo(() => {
    const orderMap = new Map(orders.map((o) => [o.id, o]));
    const groups = new Map<string, Thread>();
    for (const m of messages) {
      const key = m.thread_id || m.order_id || `subj:${m.subject}`;
      const existing = groups.get(key);
      const ord = m.order_id ? orderMap.get(m.order_id) : undefined;
      if (existing) {
        existing.messages.push(m);
        existing.last = m;
        if (!m.is_read && (m.sender_role || "admin") !== "user") existing.unread++;
      } else {
        groups.set(key, {
          key,
          thread_id: m.thread_id,
          order_id: m.order_id,
          subject: m.subject,
          order_number: ord?.order_number,
          product_name: ord?.product_name,
          last: m,
          messages: [m],
          unread: !m.is_read && (m.sender_role || "admin") !== "user" ? 1 : 0,
        });
      }
    }
    return [...groups.values()].sort((a, b) => new Date(b.last.created_at).getTime() - new Date(a.last.created_at).getTime());
  }, [messages, orders]);

  const active = activeKey ? threads.find((t) => t.key === activeKey) : null;

  useEffect(() => {
    if (active) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.messages.length]);

  // Mark admin messages in active thread as read when opened
  useEffect(() => {
    if (!active || !user) return;
    const unreadIds = active.messages.filter((m) => !m.is_read && (m.sender_role || "admin") !== "user").map((m) => m.id);
    if (unreadIds.length === 0) return;
    supabase.from("admin_messages").update({ is_read: true }).in("id", unreadIds).then(() => {
      setMessages((prev) => prev.map((m) => unreadIds.includes(m.id) ? { ...m, is_read: true } : m));
    });
  }, [active?.key]);

  const sendReply = async () => {
    if (!user || !active || !reply.trim()) return;
    setSending(true);
    const { error } = await supabase.from("admin_messages").insert([{
      user_id: user.id,
      sent_by: user.id,
      sender_role: "user",
      subject: active.subject,
      message: reply.trim(),
      thread_id: active.thread_id || active.key,
      order_id: active.order_id,
      is_read: false,
    }] as any);
    setSending(false);
    if (error) { toast({ title: "Failed to send", description: error.message, variant: "destructive" }); return; }
    setReply("");
    fetchAll();
  };

  const startNewThread = async () => {
    if (!user || !newSubject.trim() || !newBody.trim()) {
      toast({ title: "Subject and message required", variant: "destructive" });
      return;
    }
    setSending(true);
    const threadId = crypto.randomUUID();
    const { error } = await supabase.from("admin_messages").insert([{
      user_id: user.id,
      sent_by: user.id,
      sender_role: "user",
      subject: newSubject.trim(),
      message: newBody.trim(),
      thread_id: threadId,
      order_id: newOrderId || null,
      is_read: false,
    }] as any);
    setSending(false);
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Message sent" });
    setShowNew(false);
    setNewSubject(""); setNewBody(""); setNewOrderId("");
    await fetchAll();
    setActiveKey(threadId);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  // Detail view (mobile-friendly: hide list when a thread is open on small screens)
  if (active) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        <div className="flex items-center gap-2 pb-3 border-b">
          <Button variant="ghost" size="icon" onClick={() => setActiveKey(null)}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold truncate">{active.subject}</h2>
            {active.order_number && (
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Hash className="h-3 w-3" />{active.order_number} · {active.product_name}</p>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-4 space-y-3">
          {active.messages.map((m) => {
            const mine = (m.sender_role || "admin") === "user";
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                  mine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm",
                )}>
                  <p className="whitespace-pre-wrap break-words">{m.message}</p>
                  <p className={cn("text-[10px] mt-1 opacity-70", mine ? "text-primary-foreground" : "text-muted-foreground")}>
                    {new Date(m.created_at).toLocaleString()}
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
            placeholder="Type your reply..."
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
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Messages</h1>
        <Button onClick={() => setShowNew(true)} size="sm"><Plus className="h-4 w-4 mr-1" />New</Button>
      </div>

      {showNew && (
        <Card className="mb-4">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold">New message to admin</h3>
            <div>
              <label className="text-xs text-muted-foreground">Related order (optional)</label>
              <select
                value={newOrderId}
                onChange={(e) => setNewOrderId(e.target.value)}
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">— None / General —</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>#{o.order_number} — {o.product_name?.slice(0, 60)}</option>
                ))}
              </select>
            </div>
            <Input placeholder="Subject" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} />
            <Textarea placeholder="Write your message..." rows={4} value={newBody} onChange={(e) => setNewBody(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button size="sm" onClick={startNewThread} disabled={sending}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 mr-1" />} Send
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {threads.length === 0 ? (
        <EmptyState
          title="No messages yet"
          description="Start a new conversation with our admin team."
          icon={<MessageSquare className="h-16 w-16 opacity-40" />}
        />
      ) : (
        <div className="space-y-2">
          {threads.map((t) => (
            <Card
              key={t.key}
              onClick={() => setActiveKey(t.key)}
              className={cn("cursor-pointer hover:shadow-md transition-shadow", t.unread > 0 && "border-primary/40 bg-primary/5")}
            >
              <CardContent className="p-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <MessageSquare className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm truncate">{t.subject}</p>
                    {t.unread > 0 && <Badge className="bg-primary text-primary-foreground text-[10px]">{t.unread}</Badge>}
                  </div>
                  {t.order_number && (
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Hash className="h-3 w-3" />{t.order_number}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
                    {(t.last.sender_role || "admin") === "user" ? "You: " : "Admin: "}{t.last.message}
                  </p>
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {new Date(t.last.created_at).toLocaleDateString()}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Messages;
