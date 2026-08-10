import { chromium } from "playwright";

const BASE = "http://localhost:8084";
const outDir = process.argv[2] || ".";
const clientEmail = process.argv[3];
const fundiEmail = process.argv[4];
const password = process.argv[5];

const browser = await chromium.launch({ args: ["--no-sandbox"] });

const clientCtx = await browser.newContext({
  viewport: { width: 430, height: 900 },
  geolocation: { latitude: -6.7924, longitude: 39.2083 }, // client's own pos
  permissions: ["geolocation"],
});
const fundiCtx = await browser.newContext({
  viewport: { width: 430, height: 900 },
  geolocation: { latitude: -6.795, longitude: 39.21 }, // fundi's own pos
  permissions: ["geolocation"],
});
const clientPage = await clientCtx.newPage();
const fundiPage = await fundiCtx.newPage();

const clientErrors = [];
const fundiErrors = [];
clientPage.on("console", (m) => {
  if (m.type() === "error") clientErrors.push(m.text());
});
fundiPage.on("console", (m) => {
  if (m.type() === "error") fundiErrors.push(m.text());
});

async function login(page, email, role) {
  await page.goto(`${BASE}/auth?role=${role}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.fill("#email", email);
  await page.fill("#pw", password);
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await page.waitForURL("**/app", { timeout: 20000 });
}

try {
  await login(fundiPage, fundiEmail, "fundi");
  await fundiPage.waitForTimeout(2500);
  await fundiPage.screenshot({ path: `${outDir}/60-fundi-app-loaded.png` });
  console.log("FUNDI_LOGGED_IN");

  await login(clientPage, clientEmail, "client");
  await clientPage.waitForTimeout(4000); // let realtime fundi fetch settle
  await clientPage.screenshot({ path: `${outDir}/61-client-map-should-show-fundi.png` });
  console.log("CLIENT_LOGGED_IN");

  // Does the client's map show a fundi marker? Leaflet markers render as
  // <img class="leaflet-marker-icon"> or divIcon <div> - count marker panes.
  const clientMarkerCount = await clientPage
    .locator(".leaflet-marker-pane > *")
    .count();
  console.log(`CLIENT_SEES_MARKERS: ${clientMarkerCount}`);

  // Client submits a request.
  await clientPage.fill(
    'input[placeholder*="What\'s the problem"]',
    "QA mutual-visibility test",
  );
  await clientPage.getByRole("button", { name: /Request a/ }).click({ timeout: 5000 });
  await clientPage.waitForTimeout(2000);
  await clientPage.screenshot({ path: `${outDir}/62-client-after-submit.png` });
  console.log("CLIENT_SUBMITTED_REQUEST");

  // Does the fundi see it show up (realtime, up to a few seconds)?
  await fundiPage.waitForTimeout(4000);
  await fundiPage.screenshot({ path: `${outDir}/63-fundi-should-see-request.png` });
  const fundiBodyText = await fundiPage.evaluate(() => document.body.innerText);
  const fundiSeesIt = fundiBodyText.includes("QA mutual-visibility test");
  console.log(`FUNDI_SEES_REQUEST_IN_TEXT: ${fundiSeesIt}`);

  const fundiMarkerCount = await fundiPage.locator(".leaflet-marker-pane > *").count();
  console.log(`FUNDI_MAP_MARKER_COUNT: ${fundiMarkerCount}`);

  console.log("CLIENT_CONSOLE_ERRORS_START");
  console.log(clientErrors.join("\n").slice(0, 2000) || "(none)");
  console.log("CLIENT_CONSOLE_ERRORS_END");
  console.log("FUNDI_CONSOLE_ERRORS_START");
  console.log(fundiErrors.join("\n").slice(0, 2000) || "(none)");
  console.log("FUNDI_CONSOLE_ERRORS_END");
} catch (e) {
  console.error("DRIVE_ERROR", e.message);
  await clientPage.screenshot({ path: `${outDir}/error7-client.png` }).catch(() => {});
  await fundiPage.screenshot({ path: `${outDir}/error7-fundi.png` }).catch(() => {});
} finally {
  await browser.close();
}
