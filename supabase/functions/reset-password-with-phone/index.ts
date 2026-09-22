import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { clientIp, consumeRateLimit, tooManyRequests } from "../_shared/rate-limit.ts";
import { normalizeBangladeshPhone } from "../_shared/phone.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  try {
    const { phone, otp: rawOtp, password } = await req.json();
    const normalizedPhone = normalizeBangladeshPhone(phone);
    const otp = String(rawOtp ?? "").replace(/\D/g, "");
    if (!normalizedPhone || !/^\d{6}$/.test(otp) || String(password ?? "").length < 6) return reply({ error: "Invalid reset details" }, 400);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
    const [phoneBudget, ipBudget] = await Promise.all([
      consumeRateLimit(admin, `password_reset:phone:${normalizedPhone}`, 5, 10 * 60),
      consumeRateLimit(admin, `password_reset:ip:${clientIp(req)}`, 30, 10 * 60),
    ]);
    if (!phoneBudget || !ipBudget) return tooManyRequests(corsHeaders, "Too many attempts. Please request a new OTP.");
    const { data: record } = await admin.from("phone_otps").select("id").eq("phone", normalizedPhone).eq("purpose", "password_reset").eq("otp_code", otp).eq("verified", false).gte("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!record) return reply({ error: "Invalid or expired OTP" }, 400);
    const { data: consumed } = await admin.from("phone_otps").update({ verified: true }).eq("id", record.id).eq("verified", false).select("id").maybeSingle();
    if (!consumed) return reply({ error: "Invalid or expired OTP" }, 400);
    const { data: profile } = await admin.from("profiles").select("user_id").eq("phone", normalizedPhone).maybeSingle();
    if (!profile) return reply({ error: "Invalid reset details" }, 400);
    const { error } = await admin.auth.admin.updateUserById(profile.user_id, { password: String(password) });
    if (error) throw error;
    return reply({ success: true });
  } catch (error) {
    console.error("reset-password-with-phone failed", error instanceof Error ? error.message : "unknown error");
    return reply({ error: "Unable to reset password" }, 500);
  }
});
