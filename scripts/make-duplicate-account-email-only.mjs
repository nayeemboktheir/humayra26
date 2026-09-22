import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const confirmed = process.argv.includes("--confirm=make-account-email-only");
const supabaseUrl = process.env.SUPABASE_URL || process.env.SELFHOST_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SELFHOST_SERVICE_ROLE_KEY;

// Owner-approved exception: preserve phone login for the employee account
// shofiqul7800@gmail.com, while retaining shofiqul9649@gmail.com as email-only.
const retainedPhoneUserId = "a767b852-c253-4981-85d4-8d7a51d8724c";
const emailOnlyUserId = "babd648b-c283-403f-84b8-7efcb33c8203";
const phone = "8801700872245";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Set Supabase URL and service-role credentials in .env before running this script.");
  process.exit(1);
}
if (apply && !confirmed) {
  console.error("Refusing to apply. Use --apply --confirm=make-account-email-only after reviewing the dry run.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function normalizePhone(value) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `880${digits.slice(1)}`;
  else if (!digits.startsWith("880")) digits = `880${digits}`;
  return /^8801\d{9}$/.test(digits) ? digits : null;
}

const [{ data: retainedAuth, error: retainedAuthError }, { data: emailOnlyAuth, error: emailOnlyAuthError }, retainedProfileResult, emailOnlyProfileResult] = await Promise.all([
  supabase.auth.admin.getUserById(retainedPhoneUserId),
  supabase.auth.admin.getUserById(emailOnlyUserId),
  supabase.from("profiles").select("user_id,phone").eq("user_id", retainedPhoneUserId).maybeSingle(),
  supabase.from("profiles").select("user_id,phone").eq("user_id", emailOnlyUserId).maybeSingle(),
]);

if (retainedAuthError || emailOnlyAuthError || !retainedAuth.user || !emailOnlyAuth.user) {
  throw new Error("Expected Auth accounts were not found.");
}
if (retainedProfileResult.error || emailOnlyProfileResult.error) {
  throw retainedProfileResult.error || emailOnlyProfileResult.error;
}

const retainedPhone = normalizePhone(retainedProfileResult.data?.phone) || normalizePhone(retainedAuth.user.user_metadata?.phone);
const emailOnlyPhone = normalizePhone(emailOnlyProfileResult.data?.phone) || normalizePhone(emailOnlyAuth.user.user_metadata?.phone);
const checks = [];
if (retainedPhone !== phone) checks.push("the employee account no longer owns the expected phone");
if (emailOnlyPhone !== phone) checks.push("the email-only account no longer owns the expected phone");

console.table([{
  phone,
  phone_login_account: retainedAuth.user.email,
  email_only_account: emailOnlyAuth.user.email,
  status: checks.length ? checks.join("; ") : "ready",
}]);

if (!apply) {
  console.log("Dry run only. No account was changed.");
  process.exit(checks.length ? 2 : 0);
}
if (checks.length) {
  console.error("No change was applied because the account state no longer matches the approved mapping.");
  process.exit(2);
}

// Clear the public lookup first, then clear mutable Auth metadata. Both must be
// absent so the migration cannot backfill the duplicate phone from metadata.
const { error: profileError } = await supabase
  .from("profiles")
  .update({ phone: null })
  .eq("user_id", emailOnlyUserId)
  .eq("phone", emailOnlyProfileResult.data?.phone);
if (profileError) throw new Error(`profile phone removal: ${profileError.message}`);

const metadata = { ...(emailOnlyAuth.user.user_metadata ?? {}), phone: null };
const { error: metadataError } = await supabase.auth.admin.updateUserById(emailOnlyUserId, {
  user_metadata: metadata,
});
if (metadataError) throw new Error(`Auth phone metadata removal: ${metadataError.message}`);

console.log(`${emailOnlyAuth.user.email} is now email-only; ${retainedAuth.user.email} retains phone login for ${phone}.`);
