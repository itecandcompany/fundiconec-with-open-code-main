import { chromium } from "playwright";

const BASE = "http://localhost:8084";
const outDir = process.argv[2] || ".";
const fundiEmail = process.argv[3];
const password = process.argv[4];

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext({
  viewport: { width: 430, height: 900 },
  geolocation: { latitude: -6.795, longitude: 39.21 },
  permissions: ["geolocation"],
});
const page = await context.newPage();

const allRequests = [];
page.on("request", (req) => {
  allRequests.push({ url: req.url(), method: req.method() });
});
const allResponses = [];
page.on("response", (resp) => {
  allResponses.push({ url: resp.url(), status: resp.status() });
});
const consoleMsgs = [];
page.on("console", (m) => consoleMsgs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => consoleMsgs.push(`[pageerror] ${e}`));

await page.goto(`${BASE}/auth?role=fundi`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.fill("#email", fundiEmail);
await page.fill("#pw", password);
await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
await page.waitForURL("**/app", { timeout: 20000 });
await page.waitForTimeout(6000);

await page.screenshot({ path: `${outDir}/71-fundi-netcheck2.png` });

const supabaseReqs = allRequests.filter((r) => r.url.includes("supabase.co"));
console.log(`TOTAL_REQUESTS: ${allRequests.length}`);
console.log(`SUPABASE_REQUESTS: ${supabaseReqs.length}`);
console.log("SUPABASE_URLS_START");
for (const r of supabaseReqs) console.log(`${r.method} ${r.url}`);
console.log("SUPABASE_URLS_END");

console.log("CONSOLE_START");
console.log(consoleMsgs.join("\n"));
console.log("CONSOLE_END");

await browser.close();
