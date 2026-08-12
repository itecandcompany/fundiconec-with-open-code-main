import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const stamp = Date.now();
const fundiEmail = `qa-profile-fundi-${stamp}@example.com`;
const password = "Qa-Profile-Test-123!";

const { data: fundiUser, error: fundiErr } = await admin.auth.admin.createUser({
  email: fundiEmail,
  password,
  email_confirm: true,
  user_metadata: { full_name: "Juma Shabaan", role: "fundi", phone: "+255712345678" },
});
if (fundiErr) throw fundiErr;

const { error: fundiRowErr } = await admin.from("fundis").insert({
  id: fundiUser.user.id,
  service: "plumber",
  is_available: false,
  hourly_rate: 18000,
  bio: "10+ years fixing leaks and installations across Dar es Salaam. Fast, reliable, and I clean up after every job.",
  rating: 4.8,
  total_jobs: 132,
});
if (fundiRowErr) throw fundiRowErr;

// Also update the profile phone (handle_new_user sets it from metadata, but
// confirm it landed).
await admin.from("profiles").update({ phone: "+255712345678" }).eq("id", fundiUser.user.id);

console.log(JSON.stringify({ fundiEmail, password, fundiUserId: fundiUser.user.id }));
