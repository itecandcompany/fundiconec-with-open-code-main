import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, serviceKey);

const email = `repro-newuser-${Date.now()}@example.com`;
const password = "Repro-Test-Pass-9182!";

const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: "Repro Client", role: "client" },
});
if (createErr) {
  console.error("CREATE_ERROR", createErr.message);
  process.exit(1);
}
console.log("USER_ID", created.user.id);
console.log("EMAIL", email);

// Give the AFTER INSERT trigger a moment, then check profiles/user_roles.
await new Promise((r) => setTimeout(r, 1000));

const { data: profile, error: profErr } = await admin
  .from("profiles")
  .select("*")
  .eq("id", created.user.id)
  .maybeSingle();
console.log("PROFILE", JSON.stringify(profile), profErr?.message);

const { data: roles, error: rolesErr } = await admin
  .from("user_roles")
  .select("*")
  .eq("user_id", created.user.id);
console.log("ROLES", JSON.stringify(roles), rolesErr?.message);

console.log("EMAIL_FOR_LOGIN", email);
console.log("PASSWORD_FOR_LOGIN", password);
