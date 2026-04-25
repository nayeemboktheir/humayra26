import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Map shipment stage label -> setting key for the SMS template
const STAGE_TO_TEMPLATE_KEY: Record<string, string> = {
  "Ordered": "sms_tpl_ordered",
  "Purchased from 1688": "sms_tpl_purchased",
  "Shipped to Warehouse": "sms_tpl_purchased",
  "Arrived at Warehouse": "sms_tpl_china_warehouse",
  "Shipped to Bangladesh": "sms_tpl_shipped_bd",
  "In Customs": "sms_tpl_customs",
  "Out for Delivery": "sms_tpl_bd_warehouse",
  "Delivered": "sms_tpl_bd_warehouse",
};

function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  let p = phone.replace(/[^0-9]/g, "");
  if (!p) return null;
  if (p.startsWith("0")) p = "880" + p.substring(1);
  if (!p.startsWith("880")) p = "880" + p;
  // Bangladesh mobile: 880 + 1X + 8 digits = 13 digits total
  if (p.length < 12 || p.length > 14) return null;
  return p;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, stage, orderNumber } = await req.json();

    if (!userId || !stage) {
      return new Response(
        JSON.stringify({ error: "userId and stage are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const templateKey = STAGE_TO_TEMPLATE_KEY[stage];
    if (!templateKey) {
      return new Response(
        JSON.stringify({ skipped: true, reason: `No SMS template mapped for stage "${stage}"` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch user's phone from profiles
    const { data: profile } = await supabase
      .from("profiles")
      .select("phone, full_name")
      .eq("user_id", userId)
      .maybeSingle();

    const phone = normalizePhone(profile?.phone || "");
    if (!phone) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "User has no valid phone number" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch SMS template + BulkSMS credentials
    const { data: settings } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", [templateKey, "bulksms_bd_api_key", "bulksms_bd_sender_id"]);

    const map: Record<string, string> = {};
    if (settings) settings.forEach((r: any) => (map[r.key] = r.value));

    const apiKey = map.bulksms_bd_api_key;
    if (!apiKey) throw new Error("BulkSMS BD API Key not configured");
    const senderId = map.bulksms_bd_sender_id || "8809617618686";

    let message = map[templateKey];
    if (!message) {
      return new Response(
        JSON.stringify({ skipped: true, reason: `Template ${templateKey} is empty` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Optional placeholders
    if (orderNumber) message = message.replace(/\{order\}/gi, orderNumber);
    if (profile?.full_name) message = message.replace(/\{name\}/gi, profile.full_name);

    const smsUrl = `http://bulksmsbd.net/api/smsapi?api_key=${apiKey}&type=text&number=${phone}&senderid=${senderId}&message=${encodeURIComponent(message)}`;
    const smsResponse = await fetch(smsUrl);
    const smsResult = await smsResponse.text();
    console.log(`[send-shipment-sms] phone=${phone} stage="${stage}" response=${smsResult}`);

    // Log to sms_logs
    await supabase.from("sms_logs").insert({
      phone,
      message,
      sms_type: "shipment",
      status: smsResponse.ok ? "sent" : "failed",
      response: smsResult.slice(0, 500),
      user_id: userId,
    });

    return new Response(
      JSON.stringify({ success: true, phone, stage, response: smsResult }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error sending shipment SMS:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
