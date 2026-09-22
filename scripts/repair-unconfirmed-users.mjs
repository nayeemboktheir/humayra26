import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const summaryOnly = process.argv.includes("--summary-only");
const supabaseUrl = process.env.SUPABASE_URL || process.env.SELFHOST_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SELFHOST_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Set SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY or SELFHOST_SUPABASE_URL/SELFHOST_SERVICE_ROLE_KEY before running this script.");
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

async function fetchAllProfiles() {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("profiles")
      .select("user_id,phone")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

async function fetchAllUsers() {
  const users = [];
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < perPage) return users;
  }
}

async function hasRecentOtpEvidence(phone, accountCreatedAt) {
  const createdAt = new Date(accountCreatedAt);
  const earliest = new Date(createdAt.getTime() - 15 * 60 * 1000);
  const { data, error } = await supabase
    .from("phone_otps")
    .select("id")
    .eq("phone", phone)
    .eq("verified", true)
    .gte("created_at", earliest.toISOString())
    .lte("created_at", createdAt.toISOString())
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

const profiles = await fetchAllProfiles();
const users = await fetchAllUsers();
const profileByUser = new Map(profiles.map((profile) => [profile.user_id, profile]));
const phoneOwners = new Map();

for (const profile of profiles) {
  const phone = normalizePhone(profile.phone);
  if (!phone) continue;
  const owners = phoneOwners.get(phone) ?? [];
  owners.push(profile.user_id);
  phoneOwners.set(phone, owners);
}

const results = [];
for (const user of users) {
  if (user.email_confirmed_at) continue;

  const profilePhone = normalizePhone(profileByUser.get(user.id)?.phone);
  const metadataPhone = normalizePhone(user.user_metadata?.phone);
  let status = "eligible";
  let reason = "matching phone and recent verified OTP";

  if (!profilePhone || !metadataPhone) {
    status = "manual_review";
    reason = "missing or invalid profile/metadata phone";
  } else if (profilePhone !== metadataPhone) {
    status = "manual_review";
    reason = "profile and metadata phones do not agree";
  } else if ((phoneOwners.get(profilePhone)?.length ?? 0) !== 1) {
    status = "manual_review";
    reason = "duplicate normalized phone";
  } else if (!(await hasRecentOtpEvidence(profilePhone, user.created_at))) {
    status = "manual_review";
    reason = "no successful OTP in the 15 minutes before account creation";
  }

  if (status === "eligible" && apply) {
    const { error } = await supabase.auth.admin.updateUserById(user.id, { email_confirm: true });
    if (error) {
      status = "failed";
      reason = `Admin API rejected confirmation (${error.status ?? "unknown status"})`;
    } else {
      status = "confirmed";
    }
  }

  results.push({ userId: user.id, email: user.email, status, reason });
}

if (!summaryOnly) console.table(results);
const counts = results.reduce((acc, item) => {
  acc[item.status] = (acc[item.status] ?? 0) + 1;
  return acc;
}, {});
console.log(apply ? "Apply summary:" : "Dry-run summary:", counts);
if (summaryOnly) {
  const reasons = results.reduce((acc, item) => {
    acc[item.reason] = (acc[item.reason] ?? 0) + 1;
    return acc;
  }, {});
  console.log("Reason summary:", reasons);
}
if (!apply) console.log("No users were modified. Re-run with --apply after reviewing every eligible row.");
