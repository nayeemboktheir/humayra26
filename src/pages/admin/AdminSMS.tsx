import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Loader2, MessageSquare, Send, Users, History, Search, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "single" | "bulk" | "history";

interface SmsLog {
  id: string;
  phone: string;
  message: string;
  sms_type: string;
  status: string;
  response: string | null;
  created_at: string;
}

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: "single", label: "Send to One", icon: Send },
  { id: "bulk", label: "Bulk Send", icon: Users },
  { id: "history", label: "History", icon: History },
];

const MAX_LEN = 1000;

export default function AdminSMS() {
  const [tab, setTab] = useState<Tab>("single");

  // Single send state
  const [singlePhone, setSinglePhone] = useState("");
  const [singleMessage, setSingleMessage] = useState("");
  const [singleSending, setSingleSending] = useState(false);

  // Bulk state
  const [bulkTarget, setBulkTarget] = useState<"all" | "with_orders" | "no_orders" | "list">("all");
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkPhones, setBulkPhones] = useState("");
  const [bulkSending, setBulkSending] = useState(false);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);

  // History state
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  const fetchLogs = async () => {
    setLogsLoading(true);
    const { data } = await supabase
      .from("sms_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setLogs((data as SmsLog[]) || []);
    setLogsLoading(false);
  };

  useEffect(() => {
    if (tab === "history") fetchLogs();
  }, [tab]);

  const refreshCount = async () => {
    if (bulkTarget === "list") {
      const phones = bulkPhones.split(/[\n,]+/).map((p) => p.trim()).filter(Boolean);
      setRecipientCount(phones.length);
      return;
    }
    setCounting(true);
    const { data: profiles } = await supabase
      .from("profiles").select("user_id, phone").not("phone", "is", null).limit(2000);
    let userIds = (profiles || []).map((p: any) => p.user_id);
    if (bulkTarget === "with_orders" && userIds.length) {
      const { data: orders } = await supabase.from("orders").select("user_id").in("user_id", userIds);
      const set = new Set((orders || []).map((o: any) => o.user_id));
      userIds = userIds.filter((id) => set.has(id));
    } else if (bulkTarget === "no_orders" && userIds.length) {
      const { data: orders } = await supabase.from("orders").select("user_id").in("user_id", userIds);
      const set = new Set((orders || []).map((o: any) => o.user_id));
      userIds = userIds.filter((id) => !set.has(id));
    }
    setRecipientCount(userIds.length);
    setCounting(false);
  };

  useEffect(() => { setRecipientCount(null); }, [bulkTarget, bulkPhones]);

  const sendSingle = async () => {
    if (!singlePhone.trim() || !singleMessage.trim()) {
      toast({ title: "Phone and message are required", variant: "destructive" });
      return;
    }
    setSingleSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-send-sms", {
        body: { target: "single", phones: [singlePhone.trim()], message: singleMessage, smsType: "manual" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "SMS sent", description: `${data?.sent || 0} delivered, ${data?.failed || 0} failed` });
      setSingleMessage("");
    } catch (e: any) {
      toast({ title: "Failed to send", description: e.message, variant: "destructive" });
    }
    setSingleSending(false);
  };

  const sendBulk = async () => {
    if (!bulkMessage.trim()) {
      toast({ title: "Message is required", variant: "destructive" });
      return;
    }
    const phones = bulkTarget === "list"
      ? bulkPhones.split(/[\n,]+/).map((p) => p.trim()).filter(Boolean)
      : [];
    if (bulkTarget === "list" && phones.length === 0) {
      toast({ title: "Add at least one phone number", variant: "destructive" });
      return;
    }
    if (!confirm(`Send this SMS to ${recipientCount ?? phones.length ?? "?"} recipients?`)) return;

    setBulkSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-send-sms", {
        body: { target: bulkTarget, phones, message: bulkMessage, smsType: "bulk" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Bulk SMS finished", description: `${data?.sent || 0} sent, ${data?.failed || 0} failed (of ${data?.total || 0})` });
      setBulkMessage("");
    } catch (e: any) {
      toast({ title: "Failed to send", description: e.message, variant: "destructive" });
    }
    setBulkSending(false);
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (filterType !== "all" && l.sms_type !== filterType) return false;
      if (!search) return true;
      const s = search.toLowerCase();
      return l.phone.toLowerCase().includes(s) || l.message.toLowerCase().includes(s);
    });
  }, [logs, search, filterType]);

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><MessageSquare className="h-5 w-5" /> SMS Center</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Send SMS to customers and review delivery history.</p>
      </div>

      {/* Tabs */}
      <div className="bg-muted/50 rounded-lg p-1 flex gap-1 flex-wrap">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                active ? "bg-background text-foreground shadow-sm"
                       : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* SINGLE */}
      {tab === "single" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><Send className="h-4 w-4 text-primary" /> Send SMS to a Customer</CardTitle>
            <p className="text-xs text-muted-foreground">Type any phone number (e.g. 01XXXXXXXXX) and a custom message.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Phone Number</Label>
              <Input value={singlePhone} onChange={(e) => setSinglePhone(e.target.value)} placeholder="01XXXXXXXXX" className="h-9" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Message</Label>
              <Textarea
                value={singleMessage}
                onChange={(e) => setSingleMessage(e.target.value.slice(0, MAX_LEN))}
                rows={5}
                placeholder="Type your message..."
                className="text-sm"
              />
              <div className="text-xs text-muted-foreground mt-1 text-right">{singleMessage.length}/{MAX_LEN}</div>
            </div>
            <Button onClick={sendSingle} disabled={singleSending} size="sm">
              {singleSending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
              Send SMS
            </Button>
          </CardContent>
        </Card>
      )}

      {/* BULK */}
      {tab === "bulk" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Bulk SMS Campaign</CardTitle>
            <p className="text-xs text-muted-foreground">Send one message to many recipients. Use <code className="px-1 rounded bg-muted">{"{name}"}</code> for personalization.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Recipient Group</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: "all", label: "All Customers" },
                  { id: "with_orders", label: "With Orders" },
                  { id: "no_orders", label: "No Orders Yet" },
                  { id: "list", label: "Custom List" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setBulkTarget(opt.id as any)}
                    className={cn(
                      "px-3 py-2 rounded-md border text-xs font-medium transition-colors",
                      bulkTarget === opt.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {bulkTarget === "list" && (
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Phone Numbers (one per line or comma-separated)</Label>
                <Textarea
                  value={bulkPhones}
                  onChange={(e) => setBulkPhones(e.target.value)}
                  rows={4}
                  placeholder="01711111111&#10;01822222222&#10;01933333333"
                  className="text-sm font-mono"
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button onClick={refreshCount} variant="outline" size="sm" disabled={counting}>
                {counting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                Count Recipients
              </Button>
              {recipientCount !== null && (
                <span className="text-sm text-muted-foreground">
                  → <strong className="text-foreground">{recipientCount}</strong> recipient{recipientCount === 1 ? "" : "s"}
                </span>
              )}
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Message</Label>
              <Textarea
                value={bulkMessage}
                onChange={(e) => setBulkMessage(e.target.value.slice(0, MAX_LEN))}
                rows={6}
                placeholder="Hi {name}, special offer just for you..."
                className="text-sm"
              />
              <div className="text-xs text-muted-foreground mt-1 text-right">{bulkMessage.length}/{MAX_LEN}</div>
            </div>

            <Button onClick={sendBulk} disabled={bulkSending} size="sm">
              {bulkSending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
              Send Bulk SMS
            </Button>
          </CardContent>
        </Card>
      )}

      {/* HISTORY */}
      {tab === "history" && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-sm flex items-center gap-2"><History className="h-4 w-4 text-primary" /> SMS History</CardTitle>
              <Button onClick={fetchLogs} variant="outline" size="sm" disabled={logsLoading}>
                {logsLoading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search phone or message..."
                  className="h-9 pl-8 text-sm"
                />
              </div>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="h-9 px-3 text-sm rounded-md border border-input bg-background"
              >
                <option value="all">All types</option>
                <option value="manual">Manual</option>
                <option value="bulk">Bulk</option>
                <option value="shipment">Shipment</option>
                <option value="otp">OTP</option>
              </select>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-[600px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Time</th>
                      <th className="text-left px-3 py-2 font-medium">Phone</th>
                      <th className="text-left px-3 py-2 font-medium">Type</th>
                      <th className="text-left px-3 py-2 font-medium">Message</th>
                      <th className="text-left px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logsLoading ? (
                      <tr><td colSpan={5} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></td></tr>
                    ) : filteredLogs.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-10 text-muted-foreground text-xs">No SMS records yet</td></tr>
                    ) : (
                      filteredLogs.map((l) => (
                        <tr key={l.id} className="border-t hover:bg-muted/30">
                          <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(l.created_at).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">{l.phone}</td>
                          <td className="px-3 py-2">
                            <span className="inline-block px-1.5 py-0.5 rounded bg-muted text-xs capitalize">{l.sms_type}</span>
                          </td>
                          <td className="px-3 py-2 text-xs max-w-md truncate" title={l.message}>{l.message}</td>
                          <td className="px-3 py-2">
                            {l.status === "sent" ? (
                              <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                                <CheckCircle2 className="h-3 w-3" /> Sent
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-destructive" title={l.response || ""}>
                                <XCircle className="h-3 w-3" /> Failed
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Showing latest 500 records.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
