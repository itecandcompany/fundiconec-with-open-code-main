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

const consoleMsgs = [];
page.on("console", (m) => consoleMsgs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => consoleMsgs.push(`[pageerror] ${e}`));
let sawServerFnCall = false;
page.on("request", (req) => {
  if (req.method() === "POST" && req.url().startsWith(BASE)) {
    sawServerFnCall = true;
    console.log(`SERVER_FN_POST: ${req.url()}`);
  }
});

await page.goto(`${BASE}/auth?role=fundi`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.fill("#email", fundiEmail);
await page.fill("#pw", password);
await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
await page.waitForURL("**/app", { timeout: 20000 });

for (let i = 1; i <= 10; i++) {
  await page.waitForTimeout(2000);
  const bodyText = await page.evaluate(() => document.body.innerText);
  const stillWaiting = bodyText.includes("Waiting for jobs nearby");
  console.log(`t=${i * 2}s stillWaiting=${stillWaiting} sawServerFnCall=${sawServerFnCall}`);
}

await page.screenshot({ path: `${outDir}/72-fundi-longwait.png` });
console.log("CONSOLE_START");
console.log(consoleMsgs.join("\n"));
console.log("CONSOLE_END");

await browser.close();
