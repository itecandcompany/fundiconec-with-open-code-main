import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const stamp = Date.now();
const clientEmail = `qa-mutualvis-client-${stamp}@example.com`;
const fundiEmail = `qa-mutualvis-fundi-${stamp}@example.com`;
const password = "Qa-MutualVis-Test-123!";

const { data: clientUser, error: clientErr } = await admin.auth.admin.createUser({
  email: clientEmail,
  password,
  email_confirm: true,
  user_metadata: { full_name: "QA MutualVis Client", role: "client" },
});
if (clientErr) throw clientErr;

const { data: fundiUser, error: fundiErr } = await admin.auth.admin.createUser({
  email: fundiEmail,
  password,
  email_confirm: true,
  user_metadata: { full_name: "QA MutualVis Fundi", role: "fundi" },
});
if (fundiErr) throw fundiErr;

// Available, with a location, matching the client's default service (plumber).
const { error: fundiRowErr } = await admin.from("fundis").insert({
  id: fundiUser.user.id,
  service: "plumber",
  is_available: true,
  current_lat: -6.795,
  current_lng: 39.21,
});
if (fundiRowErr) throw fundiRowErr;

console.log(
  JSON.stringify({
    clientEmail,
    fundiEmail,
    password,
    clientUserId: clientUser.user.id,
    fundiUserId: fundiUser.user.id,
  }),
);
