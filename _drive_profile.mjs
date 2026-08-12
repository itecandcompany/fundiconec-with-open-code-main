import { chromium } from "playwright";

const BASE = "http://localhost:8084";
const outDir = process.argv[2] || ".";
const email = process.argv[3];
const password = process.argv[4];

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 430, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(String(e)));

async function shot(name) {
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
  console.log(`SHOT ${name}`);
}

try {
  await page.goto(`${BASE}/auth?role=fundi`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.fill("#email", email);
  await page.fill("#pw", password);
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await page.waitForURL("**/app", { timeout: 20000 });
  await page.waitForTimeout(2000);
  await shot("80-fundi-dashboard-with-profile-link");

  // Click the new avatar/name link in the header.
  await page.getByText("Juma").first().click({ timeout: 5000 });
  await page.waitForURL("**/app/account", { timeout: 10000 });
  await page.waitForTimeout(1500);
  await shot("81-fundi-profile-page");

  console.log("CONSOLE_ERRORS_START");
  console.log(errors.join("\n") || "(none)");
  console.log("CONSOLE_ERRORS_END");
} catch (e) {
  console.error("DRIVE_ERROR", e.message);
  await shot("error-profile");
} finally {
  await browser.close();
}
