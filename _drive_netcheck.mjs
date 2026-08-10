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

const requests = [];
page.on("requestfinished", async (req) => {
  const url = req.url();
  if (url.includes("tile.openstreetmap.org") || url.includes("/assets/") || url.includes("/@")) {
    return; // noise: map tiles, dev-server asset/module chunks
  }
  const method = req.method();
  if (method === "GET" && (url.includes("/src/") || url.endsWith(".ts") || url.endsWith(".tsx"))) {
    return; // noise: Vite serving source modules
  }
  const resp = await req.response();
  let body = "";
  try {
    body = (await resp.text()).slice(0, 800);
  } catch {}
  requests.push({ url, method, status: resp?.status(), body });
});
page.on("requestfailed", (req) => {
  requests.push({ url: req.url(), failed: req.failure()?.errorText });
});
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(String(e)));

await page.goto(`${BASE}/auth?role=fundi`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.fill("#email", fundiEmail);
await page.fill("#pw", password);
await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
await page.waitForURL("**/app", { timeout: 20000 });
await page.waitForTimeout(5000);

await page.screenshot({ path: `${outDir}/70-fundi-netcheck.png` });

console.log("RELEVANT_REQUESTS_START");
console.log(JSON.stringify(requests, null, 2));
console.log("RELEVANT_REQUESTS_END");
console.log("CONSOLE_ERRORS_START");
console.log(consoleErrors.join("\n") || "(none)");
console.log("CONSOLE_ERRORS_END");

await browser.close();
