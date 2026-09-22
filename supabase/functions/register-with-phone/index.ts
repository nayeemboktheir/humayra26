import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { clientIp, consumeRateLimit, tooManyRequests } from "../_shared/rate-limit.ts";
import { normalizeBangladeshPhone } from "../_shared/phone.ts";

const REGISTER_PHONE_LIMIT = 5;
const REGISTER_IP_LIMIT = 20;
const REGISTER_WINDOW_SECONDS = 60 * 60;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const publicError = (code: string, message: string, status = 400) =>
  json({ error: message, code }, status);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return publicError("method_not_allowed", "Method not allowed", 405);

  let createdUserId: string | null = null;

  try {
    const { fullName, email, password, phone, otp: rawOtp } = await req.json();
    const normalizedPhone = normalizeBangladeshPhone(phone);
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    const cleanFullName = String(fullName ?? "").trim();
    const otp = String(rawOtp ?? "").replace(/\D/g, "");

    if (!cleanFullName || cleanFullName.length > 120) {
      return publicError("invalid_name", "Please enter a valid full name.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return publicError("invalid_email", "Please enter a valid email address.");
    }
    if (String(password ?? "").length < 6) {
      return publicError("invalid_password", "Password must be at least 6 characters.");
    }
    if (!normalizedPhone) {
      return publicError("invalid_phone", "Please enter a valid Bangladesh mobile number.");
    }
    if (!/^\d{6}$/.test(otp)) {
      return publicError("invalid_otp", "Please enter the 6-digit OTP.");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const [withinPhoneBudget, withinIpBudget] = await Promise.all([
      consumeRateLimit(admin, `register:phone:${normalizedPhone}`, REGISTER_PHONE_LIMIT, REGISTER_WINDOW_SECONDS),
      consumeRateLimit(admin, `register:ip:${clientIp(req)}`, REGISTER_IP_LIMIT, REGISTER_WINDOW_SECONDS),
    ]);
    if (!withinPhoneBudget || !withinIpBudget) {
      return tooManyRequests(corsHeaders, "Too many registration attempts. Please try again later.");
    }

    const { data: otpRecord, error: otpLookupError } = await admin
      .from("phone_otps")
      .select("id")
      .eq("phone", normalizedPhone)
      .eq("purpose", "signup")
      .eq("otp_code", otp)
      .eq("verified", false)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpLookupError || !otpRecord) {
      return publicError("invalid_or_expired_otp", "The OTP is invalid or expired.");
    }

    // Compare-and-set makes a code single-use even when two requests race.
    const { data: consumedOtp, error: consumeError } = await admin
      .from("phone_otps")
      .update({ verified: true })
      .eq("id", otpRecord.id)
      .eq("verified", false)
      .select("id")
      .maybeSingle();

    if (consumeError || !consumedOtp) {
      return publicError("otp_already_used", "The OTP has already been used.");
    }

    const { data: existingProfile, error: profileLookupError } = await admin
      .from("profiles")
      .select("user_id")
      .eq("phone", normalizedPhone)
      .maybeSingle();
    if (profileLookupError) throw profileLookupError;
    if (existingProfile) {
      return publicError("account_exists", "An account already exists for these details.", 409);
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password: String(password),
      email_confirm: true,
      user_metadata: { full_name: cleanFullName, phone: normalizedPhone },
    });

    if (createError || !created.user) {
      console.warn("register-with-phone: create user rejected", { status: createError?.status ?? 400 });
      return publicError("account_exists_or_invalid", "Unable to create the account. The email or phone may already be registered.", 409);
    }
    createdUserId = created.user.id;

    // The trigger normally creates this row in the same Auth transaction. This upsert
    // also protects deployments that briefly run with an older trigger definition.
    const { error: profileError } = await admin.from("profiles").upsert(
      { user_id: createdUserId, full_name: cleanFullName, phone: normalizedPhone },
      { onConflict: "user_id" },
    );
    if (profileError) {
      await admin.auth.admin.deleteUser(createdUserId);
      createdUserId = null;
      console.error("register-with-phone: profile link failed", { code: profileError.code });
      return publicError("profile_link_failed", "Unable to create the account. Please try again.", 500);
    }

    const publicClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: signedIn, error: signInError } = await publicClient.auth.signInWithPassword({
      email: normalizedEmail,
      password: String(password),
    });
    if (signInError || !signedIn.session) {
      console.error("register-with-phone: session creation failed", { status: signInError?.status ?? 500 });
      return publicError("session_failed", "Account created, but sign-in failed. Please sign in again.", 500);
    }

    return json({
      success: true,
      access_token: signedIn.session.access_token,
      refresh_token: signedIn.session.refresh_token,
    }, 201);
  } catch (error: unknown) {
    console.error("register-with-phone failed", error instanceof Error ? error.message : "unknown error");
    return publicError("registration_failed", "Unable to create the account. Please try again.", 500);
  }
});
