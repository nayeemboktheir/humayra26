import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  let p = String(phone).replace(/[^0-9]/g, "");
  if (!p) return null;
  if (p.startsWith("0")) p = "880" + p.substring(1);
  if (!p.startsWith("880")) p = "880" + p;
  if (p.length < 12 || p.length > 14) return null;
  return p;
}

interface Recipient {
  phone: string;
  user_id?: string | null;
  name?: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth check: only admins
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const senderId = claimsData.claims.sub as string;

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: senderId, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: admin required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const message: string = (body.message || "").toString().trim();
    const target: string = body.target || "single"; // 'single' | 'list' | 'all' | 'with_orders' | 'no_orders'
    const phones: string[] = Array.isArray(body.phones) ? body.phones : [];
    const smsType: string = body.smsType || "manual";

    if (!message || message.length < 2) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (message.length > 1000) {
      return new Response(JSON.stringify({ error: "Message too long (max 1000 chars)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build recipients list
    let recipients: Recipient[] = [];

    if (target === "single" || target === "list") {
      recipients = phones
        .map((p) => ({ phone: normalizePhone(p) || "", user_id: null }))
        .filter((r) => r.phone);
    } else {
      // pull from profiles
      let q = admin.from("profiles").select("user_id, full_name, phone").not("phone", "is", null).limit(2000);
      const { data: profiles } = await q;
      let userIds = (profiles || []).map((p: any) => p.user_id);

      if (target === "with_orders" && userIds.length > 0) {
        const { data: orderUsers } = await admin
          .from("orders").select("user_id").in("user_id", userIds);
        const set = new Set((orderUsers || []).map((o: any) => o.user_id));
        userIds = userIds.filter((id) => set.has(id));
      } else if (target === "no_orders" && userIds.length > 0) {
        const { data: orderUsers } = await admin
          .from("orders").select("user_id").in("user_id", userIds);
        const set = new Set((orderUsers || []).map((o: any) => o.user_id));
        userIds = userIds.filter((id) => !set.has(id));
      }

      const idSet = new Set(userIds);
      recipients = (profiles || [])
        .filter((p: any) => idSet.has(p.user_id))
        .map((p: any) => ({
          phone: normalizePhone(p.phone) || "",
          user_id: p.user_id,
          name: p.full_name,
        }))
        .filter((r) => r.phone);
    }

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ error: "No valid recipients" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load gateway credentials
    const { data: settings } = await admin
      .from("app_settings").select("key, value")
      .in("key", ["bulksms_bd_api_key", "bulksms_bd_sender_id"]);
    const map: Record<string, string> = {};
    (settings || []).forEach((r: any) => (map[r.key] = r.value));
    const apiKey = map.bulksms_bd_api_key;
    if (!apiKey) throw new Error("BulkSMS BD API Key not configured");
    const smsSender = map.bulksms_bd_sender_id || "8809617618686";

    let sent = 0, failed = 0;
    const logRows: any[] = [];

    for (const r of recipients) {
      const personalized = message
        .replace(/\{name\}/gi, r.name || "")
        .replace(/\{phone\}/gi, r.phone);
      const url = `http://bulksmsbd.net/api/smsapi?api_key=${apiKey}&type=text&number=${r.phone}&senderid=${smsSender}&message=${encodeURIComponent(personalized)}`;
      let status = "sent";
      let respText = "";
      try {
        const resp = await fetch(url);
        respText = await resp.text();
        if (!resp.ok) status = "failed";
        // BulkSMS BD success response usually contains "1002" or response_code 202
        if (/error|invalid|denied/i.test(respText) && !/202|1002|success/i.test(respText)) {
          status = "failed";
        }
      } catch (e) {
        status = "failed";
        respText = e instanceof Error ? e.message : "Network error";
      }
      if (status === "sent") sent++; else failed++;
      logRows.push({
        phone: r.phone,
        message: personalized,
        sms_type: smsType,
        status,
        response: respText.slice(0, 500),
        user_id: r.user_id || null,
        sent_by: senderId,
      });
    }

    if (logRows.length > 0) {
      await admin.from("sms_logs").insert(logRows);
    }

    return new Response(
      JSON.stringify({ success: true, sent, failed, total: recipients.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    console.error("admin-send-sms error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
