// Creates (or promotes) a real admin account for local development.
// This is a normal Supabase Auth account — it works because it genuinely
// exists and the password genuinely matches, not because of any bypass.
//
// Usage:
//   node --env-file=.env scripts/seed-admin.mjs [email] [password]
// Defaults to admin@admin.com / Admin@2026! if not given.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with --env-file=.env");
  process.exit(1);
}

const email = process.argv[2] || "admin@admin.com";
const password = process.argv[3] || "Admin@2026!";
const fullName = "Admin";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserByEmail(targetEmail) {
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === targetEmail.toLowerCase());
    if (match) return match;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function main() {
  let userId;

  const existing = await findUserByEmail(email);
  if (existing) {
    userId = existing.id;
    console.log(`Found existing user ${email} (${userId}) — updating password + role.`);
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (updateError) throw updateError;
  } else {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`Created user ${email} (${userId}).`);
  }

  // handle_new_user() already inserted a 'client' profile + user_roles row.
  // Promote to admin, keeping both in sync (service_role bypasses the
  // guard_profile_update trigger's role-change check, per migration
  // 20260807120000_admin_user_management.sql).
  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({ role: "admin", full_name: fullName })
    .eq("id", userId);
  if (profileError) throw profileError;

  const { error: deleteRoleError } = await supabaseAdmin
    .from("user_roles")
    .delete()
    .eq("user_id", userId);
  if (deleteRoleError) throw deleteRoleError;

  const { error: insertRoleError } = await supabaseAdmin
    .from("user_roles")
    .insert({ user_id: userId, role: "admin" });
  if (insertRoleError) throw insertRoleError;

  console.log(`\nAdmin ready:\n  email:    ${email}\n  password: ${password}\n  role:     admin`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
