import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const confirmed = process.argv.includes("--confirm=merge-duplicate-users");
const supabaseUrl = process.env.SUPABASE_URL || process.env.SELFHOST_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SELFHOST_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Set Supabase URL and service-role credentials in .env before running this script.");
  process.exit(1);
}
if (apply && !confirmed) {
  console.error("Refusing to apply. Use --apply --confirm=merge-duplicate-users after reviewing the dry run.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Canonical accounts approved during duplicate review. The first account remains;
// the second account's public records are moved to it and its Auth identity is removed.
// The 8801700872245 pair is intentionally excluded: its retiring account holds
// the employee role, and the owner chose to keep both accounts separate.
const merges = [
  { phone: "8801304775767", keep: "419aec0a-ffac-4579-894d-c97a72f92870", retire: "f848633a-0425-4f9f-9c0a-33e89d8690ca" },
  { phone: "8801531362910", keep: "4b064281-0b8c-4735-afe3-4b1db359022b", retire: "218f2d69-43c0-44a8-94d0-03323960a917" },
  { phone: "8801577227576", keep: "633144a4-e3fd-4e00-871e-397b4da13490", retire: "7ff8f3ab-5427-4419-8410-c6ea868b3c67" },
  { phone: "8801627124654", keep: "c27e2ef1-53ac-441d-b515-233ec1c66628", retire: "77a1deba-845f-4ff8-9bf8-1d463c25e594" },
  { phone: "8801750593139", keep: "ddde9142-b221-4604-a4ba-43405b09c84e", retire: "8f6f256f-6a71-4c58-92b7-3caa643e677f" },
  { phone: "8801766165595", keep: "8fe439f0-167c-490c-af57-e2edbcc34b8d", retire: "ded20a2f-80bf-40d7-8b1f-fbae38053c30" },
  { phone: "8801776840370", keep: "eed9c5eb-09a8-46b6-a3f3-a12c1839f7bf", retire: "dabe5b74-b7f1-4efc-9cde-65c0582a3cd6" },
  { phone: "8801909590101", keep: "45c680aa-5024-4c60-b510-5f6a772e5669", retire: "ce77d76c-387d-45bf-9e73-3dcee7d4cdc4" },
];

const recordTables = [
  "admin_messages",
  "cart_items",
  "notifications",
  "orders",
  "refunds",
  "shipments",
  "sms_logs",
  "transactions",
  "wishlist",
];

function normalizePhone(value) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `880${digits.slice(1)}`;
  else if (!digits.startsWith("880")) digits = `880${digits}`;
  return /^8801\d{9}$/.test(digits) ? digits : null;
}

async function getOne(table, userId, fields) {
  const { data, error } = await supabase.from(table).select(fields).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

async function countRows(table, userId) {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

async function inspectMerge(merge) {
  const [{ data: keptUser, error: keptError }, { data: retiredUser, error: retiredError }, keptProfile, retiredProfile, keptWallet, retiredWallet, keptRoles, retiredRoles] = await Promise.all([
    supabase.auth.admin.getUserById(merge.keep),
    supabase.auth.admin.getUserById(merge.retire),
    getOne("profiles", merge.keep, "user_id,phone"),
    getOne("profiles", merge.retire, "user_id,phone"),
    getOne("wallets", merge.keep, "id,balance"),
    getOne("wallets", merge.retire, "id,balance"),
    supabase.from("user_roles").select("role").eq("user_id", merge.keep),
    supabase.from("user_roles").select("role").eq("user_id", merge.retire),
  ]);

  if (keptError || retiredError || !keptUser.user || !retiredUser.user) {
    throw new Error(`Mapped Auth user is missing for ${merge.phone}`);
  }
  if (keptRoles.error || retiredRoles.error) throw keptRoles.error || retiredRoles.error;

  const keptPhone = normalizePhone(keptProfile?.phone) || normalizePhone(keptUser.user.user_metadata?.phone);
  const retiredPhone = normalizePhone(retiredProfile?.phone) || normalizePhone(retiredUser.user.user_metadata?.phone);
  const errors = [];
  if (keptPhone !== merge.phone) errors.push("kept account no longer owns the expected phone");
  if (retiredPhone !== merge.phone) errors.push("retired account no longer owns the expected phone");

  const keptBalance = Number(keptWallet?.balance ?? 0);
  const retiredBalance = Number(retiredWallet?.balance ?? 0);
  if (keptWallet && retiredWallet && keptBalance !== 0 && retiredBalance !== 0) {
    errors.push("both wallets have non-zero balances");
  }
  const elevatedRetiredRole = (retiredRoles.data ?? []).some(({ role }) => role !== "user");
  if (elevatedRetiredRole) errors.push("retired account has a non-user role");

  const movedRows = Object.fromEntries(await Promise.all(
    recordTables.map(async (table) => [table, await countRows(table, merge.retire)]),
  ));

  return {
    ...merge,
    keepEmail: keptUser.user.email,
    retireEmail: retiredUser.user.email,
    keptBalance,
    retiredBalance,
    keptRoles: (keptRoles.data ?? []).map(({ role }) => role),
    retiredRoles: (retiredRoles.data ?? []).map(({ role }) => role),
    movedRows,
    errors,
  };
}

const plans = await Promise.all(merges.map(inspectMerge));
console.table(plans.map((plan) => ({
  phone: plan.phone,
  keep: plan.keepEmail,
  retire: plan.retireEmail,
  moved_records: Object.values(plan.movedRows).reduce((total, count) => total + count, 0),
  wallet: `${plan.keptBalance} + ${plan.retiredBalance}`,
  roles: [...new Set([...plan.keptRoles, ...plan.retiredRoles])].join(", ") || "none",
  status: plan.errors.length ? plan.errors.join("; ") : "ready",
})));

const blocked = plans.filter((plan) => plan.errors.length);
if (!apply) {
  console.log(`Dry run only. ${plans.length - blocked.length} ready; ${blocked.length} blocked.`);
  if (blocked.length) process.exitCode = 2;
  process.exit();
}
if (blocked.length) {
  console.error("No merges were applied because one or more mappings are blocked.");
  process.exit(2);
}

for (const plan of plans) {
  for (const table of recordTables) {
    const { error } = await supabase.from(table).update({ user_id: plan.keep }).eq("user_id", plan.retire);
    if (error) throw new Error(`${table}: ${error.message}`);
  }

  const { data: retainedRoles, error: retainedRolesError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", plan.keep);
  if (retainedRolesError) throw retainedRolesError;
  const retainedRoleNames = new Set((retainedRoles ?? []).map(({ role }) => role));
  for (const role of plan.retiredRoles) {
    if (retainedRoleNames.has(role)) continue;
    const { error } = await supabase.from("user_roles").insert({ user_id: plan.keep, role });
    if (error) throw new Error(`user_roles: ${error.message}`);
  }
  const { error: roleDeleteError } = await supabase.from("user_roles").delete().eq("user_id", plan.retire);
  if (roleDeleteError) throw roleDeleteError;

  const retainedWallet = await getOne("wallets", plan.keep, "id,balance");
  const retiredWallet = await getOne("wallets", plan.retire, "id,balance");
  if (retiredWallet && !retainedWallet) {
    const { error } = await supabase.from("wallets").update({ user_id: plan.keep }).eq("id", retiredWallet.id);
    if (error) throw new Error(`wallet transfer: ${error.message}`);
  } else if (retiredWallet && retainedWallet) {
    if (Number(retiredWallet.balance) !== 0 && Number(retainedWallet.balance) === 0) {
      const { error: deleteKeptWalletError } = await supabase.from("wallets").delete().eq("id", retainedWallet.id);
      if (deleteKeptWalletError) throw new Error(`empty wallet replacement: ${deleteKeptWalletError.message}`);
      const { error: transferWalletError } = await supabase.from("wallets").update({ user_id: plan.keep }).eq("id", retiredWallet.id);
      if (transferWalletError) throw new Error(`wallet transfer: ${transferWalletError.message}`);
    } else {
      const { error } = await supabase.from("wallets").delete().eq("id", retiredWallet.id);
      if (error) throw new Error(`empty duplicate wallet cleanup: ${error.message}`);
    }
  }

  const { error: deleteUserError } = await supabase.auth.admin.deleteUser(plan.retire, false);
  if (deleteUserError) throw new Error(`Auth user deletion: ${deleteUserError.message}`);
  console.log(`Merged ${plan.retireEmail} into ${plan.keepEmail}.`);
}

console.log("All approved duplicate accounts were merged.");
