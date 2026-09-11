import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { clientIp, consumeRateLimit, tooManyRequests } from "../_shared/rate-limit.ts";

// Audit §3.1 — a correct OTP here mints a magic link for the matching account, so this
// endpoint is the account-takeover surface. It previously had no attempt cap, no
// lockout, and no per-IP throttle, and a wrong guess did not invalidate the code: a
// 6-digit secret with a 10-minute window was walkable by anyone who knew the number.
//
// After MAX_VERIFY_ATTEMPTS wrong guesses for a phone, every outstanding code for that
// phone is burned, so an attacker cannot simply keep going against the same code — they
// must trigger a resend, which send-sms-otp rate-limits in turn.
const MAX_VERIFY_ATTEMPTS = 5;
const VERIFY_PHONE_WINDOW_SECONDS = 10 * 60;
const MAX_VERIFY_PER_IP = 30;
const VERIFY_IP_WINDOW_SECONDS = 10 * 60;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, otp: rawOtp } = await req.json();
    const otp = String(rawOtp || "").replace(/[^0-9]/g, "");

    if (!phone || !otp) {
      return new Response(
        JSON.stringify({ error: "Phone and OTP are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize phone
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

    // Per-IP ceiling first: it is the only thing bounding an attacker who spreads guesses
    // across many phone numbers.
    if (!(await consumeRateLimit(
      supabase,
      `otp_verify:ip:${clientIp(req)}`,
      MAX_VERIFY_PER_IP,
      VERIFY_IP_WINDOW_SECONDS,
    ))) {
      console.warn("verify-sms-otp: ip rate limited");
      return tooManyRequests(corsHeaders, "Too many attempts. Please wait a few minutes and try again.");
    }

    // Per-phone attempt budget. Consumed on every attempt, including successful ones —
    // a legitimate user needs one or two, and burning the budget on success would only
    // matter to someone guessing.
    const withinAttemptBudget = await consumeRateLimit(
      supabase,
      `otp_verify:phone:${normalizedPhone}`,
      MAX_VERIFY_ATTEMPTS,
      VERIFY_PHONE_WINDOW_SECONDS,
    );

    if (!withinAttemptBudget) {
      // Budget exhausted: burn every outstanding code for this phone so the attacker
      // cannot resume against the same secret once the window rolls over.
      await supabase
        .from("phone_otps")
        .update({ verified: true })
        .eq("phone", normalizedPhone)
        .eq("verified", false);

      console.warn("verify-sms-otp: attempt cap reached, invalidated outstanding codes", {
        phone: normalizedPhone,
      });
      return tooManyRequests(corsHeaders, "Too many incorrect codes. Please request a new OTP.");
    }

    // Find valid OTP (latest matching, still-valid code for this phone)
    const { data: otpRecord, error: otpError } = await supabase
      .from("phone_otps")
      .select("*")
      .eq("phone", normalizedPhone)
      .eq("otp_code", otp)
      .eq("verified", false)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpError || !otpRecord) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired OTP" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark all matching OTPs for this phone as verified
    await supabase
      .from("phone_otps")
      .update({ verified: true })
      .eq("phone", normalizedPhone)
      .eq("verified", false);

    // Check if user with this phone exists in profiles
    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("phone", normalizedPhone)
      .maybeSingle();

    if (profile) {
      // Existing user - generate a magic link style session
      // Use admin API to create a session for existing user
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(profile.user_id);
      if (userError || !userData.user) {
        throw new Error("User not found");
      }

      // Generate a one-time link for the user
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: userData.user.email!,
      });

      if (linkError) {
        throw new Error(`Failed to generate link: ${linkError.message}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          isNewUser: false,
          token_hash: linkData.properties?.hashed_token,
          email: userData.user.email,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // New user - return flag so frontend can show registration form
      return new Response(
        JSON.stringify({
          success: true,
          isNewUser: true,
          verifiedPhone: normalizedPhone,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: unknown) {
    console.error("Error verifying OTP:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
