import { chromium } from "playwright";

const BASE = "http://localhost:8080";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext({
  permissions: ["geolocation"],
  geolocation: { latitude: -6.7924, longitude: 39.2083 },
});
const page = await context.newPage();
const consoleMsgs = [];
page.on("console", (msg) => consoleMsgs.push(`[${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => consoleMsgs.push(`[pageerror] ${err.message}`));

try {
  await page.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
  await page.locator('button:has-text("Sign in")').first().click();
  await page.waitForTimeout(300);
  await page.fill("#email", "admin@admin.com");
  await page.fill("#pw", "Admin@2026!");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/, { timeout: 15000 });

  await page.goto(`${BASE}/app/service`, { waitUntil: "networkidle" });
  await page.locator("text=Plumber").first().click();
  await page.waitForURL(/\/app\/describe/, { timeout: 10000 });
  await page.locator("input").first().fill("Automated smoke test leak");
  await page.locator("textarea").first().fill("End-to-end submit verification").catch(() => {});
  await page.locator('button:has-text("See fundis near you")').click();
  await page.waitForURL(/\/app\/find/, { timeout: 10000 });

  const requestBtn = page.locator('button:has-text("Request fundi")');
  await requestBtn.waitFor({ state: "visible", timeout: 10000 });
  await page.waitForTimeout(500); // let disabled state settle
  await requestBtn.click();

  // Wait for either a success or error toast (sonner renders in a region with role="status"/"alert")
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "scripts/.debug-submit-result.png", fullPage: true });

  const bodyText = await page.locator("body").innerText();
  const sentToast = bodyText.includes("Request sent");
  console.log("Saw 'Request sent' toast text on page:", sentToast);

  console.log("=== CONSOLE LOG ===");
  for (const m of consoleMsgs) console.log(m);
} catch (err) {
  console.error("SCRIPT ERROR:", err.message);
  await page.screenshot({ path: "scripts/.debug-submit-error.png", fullPage: true }).catch(() => {});
  console.log("=== CONSOLE LOG ===");
  for (const m of consoleMsgs) console.log(m);
  process.exitCode = 1;
} finally {
  await browser.close();
}
