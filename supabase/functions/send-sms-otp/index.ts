import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { clientIp, consumeRateLimit, tooManyRequests } from "../_shared/rate-limit.ts";

// Audit §3.2 — this endpoint sends a real, billed SMS per call with no auth and no
// throttle. Two budgets: one per destination number (stops SMS-bombing a specific
// person) and one per source IP (stops a loop cycling through many numbers to burn
// the BulkSMS balance).
const MAX_SENDS_PER_PHONE = 3;
const SEND_PHONE_WINDOW_SECONDS = 10 * 60;
const MAX_SENDS_PER_IP = 10;
const SEND_IP_WINDOW_SECONDS = 60 * 60;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateOtp(): number {
  const buf = new Uint32Array(1);
  // 4294967295 is not a multiple of 900000, so the tail of the range would bias the
  // low codes. Discard draws that fall in that unusable remainder.
  const limit = Math.floor(0xffffffff / 900000) * 900000;
  let value: number;
  do {
    crypto.getRandomValues(buf);
    value = buf[0];
  } while (value >= limit);
  return 100000 + (value % 900000);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone } = await req.json();

    if (!phone) {
      return new Response(
        JSON.stringify({ error: "Phone number is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize phone: ensure it starts with 880
    let normalizedPhone = phone.replace(/[^0-9]/g, "");
    if (normalizedPhone.startsWith("0")) {
      normalizedPhone = "880" + normalizedPhone.substring(1);
    }
    if (!normalizedPhone.startsWith("880")) {
      normalizedPhone = "880" + normalizedPhone;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const withinPhoneBudget = await consumeRateLimit(
      supabase,
      `otp_send:phone:${normalizedPhone}`,
      MAX_SENDS_PER_PHONE,
      SEND_PHONE_WINDOW_SECONDS,
    );
    const withinIpBudget = await consumeRateLimit(
      supabase,
      `otp_send:ip:${clientIp(req)}`,
      MAX_SENDS_PER_IP,
      SEND_IP_WINDOW_SECONDS,
    );
    if (!withinPhoneBudget || !withinIpBudget) {
      console.warn("send-sms-otp: rate limited", { phone: normalizedPhone });
      return tooManyRequests(corsHeaders, "Too many OTP requests. Please wait a few minutes and try again.");
    }

    // Read SMS config from app_settings
    const { data: smsSettings } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["bulksms_bd_api_key", "bulksms_bd_sender_id"]);

    const smsMap: Record<string, string> = {};
    if (smsSettings) smsSettings.forEach((r: any) => (smsMap[r.key] = r.value));

    const BULKSMS_API_KEY = smsMap.bulksms_bd_api_key;
    if (!BULKSMS_API_KEY) {
      throw new Error("BulkSMS BD API Key is not configured. Please set it in Admin Settings → SMS.");
    }

    const BULKSMS_SENDER_ID = smsMap.bulksms_bd_sender_id || "8809617618686";

    // Generate 6-digit OTP.
    //
    // Math.random() is not a CSPRNG — its output is predictable from observed values,
    // and this number is the sole factor gating a magic-link login (see verify-sms-otp).
    // Rejection-sample from crypto.getRandomValues instead so the 900000 possible codes
    // stay uniformly distributed.
    const otp = String(generateOtp());
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes (SMS can arrive late)

    // Clean up only EXPIRED OTPs for this phone. Keep still-valid ones so a
    // delayed SMS with the previous code can still verify after a resend.
    await supabase
      .from("phone_otps")
      .delete()
      .eq("phone", normalizedPhone)
      .lt("expires_at", new Date().toISOString());

    // Store OTP
    const { error: insertError } = await supabase.from("phone_otps").insert({
      phone: normalizedPhone,
      otp_code: otp,
      expires_at: expiresAt,
    });

    if (insertError) {
      throw new Error(`Failed to store OTP: ${insertError.message}`);
    }

    // Send SMS via BulkSMS BD
    const message = `Your OTP is: ${otp}. Valid for 10 minutes.`;
    const smsUrl = `https://bulksmsbd.net/api/smsapi?api_key=${BULKSMS_API_KEY}&type=text&number=${normalizedPhone}&senderid=${BULKSMS_SENDER_ID}&message=${encodeURIComponent(message)}`;

    const smsResponse = await fetch(smsUrl);
    const smsResult = await smsResponse.text();

    console.log("BulkSMS BD response:", smsResult);

    // Log to sms_logs (best-effort, do not fail the OTP request if logging fails)
    try {
      await supabase.from("sms_logs").insert({
        phone: normalizedPhone,
        message: "Your login OTP is: ****** (redacted)",
        sms_type: "otp",
        status: smsResponse.ok ? "sent" : "failed",
        response: smsResult.slice(0, 500),
      });
    } catch (_) { /* ignore */ }

    return new Response(
      JSON.stringify({ success: true, message: "OTP sent successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error sending OTP:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
