import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, password } = await req.json();

    if (!phone || !password) {
      return json({ error: "মোবাইল নাম্বার ও পাসওয়ার্ড দিন" }, 400);
    }

    let normalizedPhone = String(phone).replace(/[^0-9]/g, "");
    if (normalizedPhone.startsWith("0")) {
      normalizedPhone = "880" + normalizedPhone.substring(1);
    }
    if (!normalizedPhone.startsWith("880")) {
      normalizedPhone = "880" + normalizedPhone;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: profile } = await admin
      .from("profiles")
      .select("user_id")
      .eq("phone", normalizedPhone)
      .maybeSingle();

    if (!profile) {
      return json({ error: "এই নাম্বারে কোনো একাউন্ট নেই" }, 400);
    }

    const { data: userData, error: userError } = await admin.auth.admin.getUserById(profile.user_id);
    if (userError || !userData.user?.email) {
      return json({ error: "একাউন্ট পাওয়া যায়নি" }, 400);
    }

    // Verify the password using a normal (anon) client so no privileged bypass happens.
    const publicClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: signInData, error: signInError } = await publicClient.auth.signInWithPassword({
      email: userData.user.email,
      password: String(password),
    });

    if (signInError || !signInData.session) {
      return json({ error: "পাসওয়ার্ড সঠিক নয়" }, 400);
    }

    return json({
      success: true,
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
    });
  } catch (error: unknown) {
    console.error("phone-password-login error", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
