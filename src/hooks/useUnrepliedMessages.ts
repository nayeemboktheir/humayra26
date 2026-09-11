import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  user_id: string;
  subject: string;
  sender_role: string | null;
  thread_id: string | null;
  order_id: string | null;
  created_at: string;
};

// Mirrors the thread grouping in AdminMessaging so the badge and the page agree on
// what counts as one conversation.
const threadKey = (m: Row) => `${m.user_id}::${m.thread_id || m.order_id || `subj:${m.subject}`}`;

// A null sender_role predates the column and means the message came from an admin.
const isFromUser = (m: Row) => (m.sender_role || "admin") === "user";

/**
 * Counts conversations awaiting an admin reply: threads whose most recent message came
 * from the customer. A customer writing three times in a row is still one conversation
 * to answer, and a thread the admin has already answered contributes nothing.
 *
 * Deliberately not based on `is_read` — AdminMessaging marks a thread read as soon as it
 * is opened, so an unread-based badge would clear itself on a glance rather than on a
 * reply.
 */
export function useUnrepliedMessages() {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    // Only the columns needed to group threads and order within them.
    const { data, error } = await supabase
      .from("admin_messages")
      .select("user_id, subject, sender_role, thread_id, order_id, created_at")
      .order("created_at", { ascending: true });

    if (error) return;

    // Rows arrive in ascending time order, so the last write per thread leaves behind
    // whether that conversation currently ends on a customer message.
    const awaitingReply = new Map<string, boolean>();
    for (const m of (data || []) as Row[]) {
      awaitingReply.set(threadKey(m), isFromUser(m));
    }

    let total = 0;
    for (const awaiting of awaitingReply.values()) if (awaiting) total += 1;
    setCount(total);
  }, []);

  useEffect(() => {
    void load();

    const channel = supabase
      .channel("admin_messages_unreplied_badge")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "admin_messages" },
        () => { void load(); },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  return count;
}
