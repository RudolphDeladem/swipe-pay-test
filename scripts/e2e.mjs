// Browser end-to-end test: two separate sessions sign up, pay each other by username, NFC link and QR link.
// Usage: BASE_URL=http://localhost:8888 CHROMIUM_PATH=/path/to/chrome node scripts/e2e.mjs
import { chromium } from "playwright-core";
const BASE = process.env.BASE_URL ?? "http://localhost:8888";
const SHOTS = process.env.SHOTS_DIR ?? "/tmp";
const sfx = Date.now().toString(36).slice(-4);
const A = `ama.${sfx}`, B = `kofistore${sfx}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const errors = [];
const mk = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on("console", (m) => m.type() === "error" && errors.push(`[${name}] ${m.text()}`));
  p.on("pageerror", (e) => errors.push(`[${name}] pageerror ${e.message}`));
  return p;
};
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: false });
const keys = async (p, s) => { for (const ch of s) await p.getByRole("button", { name: ch === "." ? "Decimal point" : ch, exact: true }).click(); };
const step = (s) => console.log("✓", s);

async function signup(p, username, name) {
  await p.goto(BASE + "/");
  await p.waitForURL(/welcome/);
  await p.getByRole("link", { name: "Create a free account" }).click();
  await p.getByLabel("Full name").fill(name);
  await p.getByLabel("Username").fill(username);
  await p.getByLabel("Password").fill("password123");
  await p.getByRole("button", { name: "Continue" }).click();
  await keys(p, "482915");
  await p.getByText("Confirm your PIN").waitFor();
  await keys(p, "482915");
  await p.getByText("Wallet Balance").waitFor();
}

const pa = await mk("A"), pb = await mk("B"), pc = await mk("C");
await pa.goto(BASE + "/"); await pa.waitForURL(/welcome/); await shot(pa, "01-welcome");
await signup(pa, A, "Ama Mensah");
await pa.getByText("GH₵ 1,000.00").waitFor(); await shot(pa, "02-home"); step("A signed up with GH₵1,000");
await signup(pb, B, "Kofi's Store"); step("B signed up");

// A sends 50 to B by username
await pa.getByRole("link", { name: /Send Money/ }).click();
await pa.getByPlaceholder("Enter username").fill(B.slice(0, 6));
await pa.getByRole("link", { name: new RegExp(`@${B}`) }).click();
await keys(pa, "50"); await shot(pa, "03-amount");
await pa.getByRole("button", { name: "Continue" }).click();
await pa.getByText("Confirm Payment").waitFor(); await shot(pa, "04-confirm");
await pa.getByRole("button", { name: "Confirm and Send" }).click();
await keys(pa, "111112"); await pa.getByText(/Incorrect PIN/).waitFor(); step("wrong PIN rejected");
await shot(pa, "05-pin-wrong");
await keys(pa, "482915");
await pa.waitForURL(/receipt/); await pa.getByText("Payment sent").waitFor(); await shot(pa, "06-receipt"); step("A paid B GH₵50");
await pa.getByRole("link", { name: "Done" }).click();
await pa.getByText("GH₵ 950.00").waitFor(); step("A balance 950");

await pb.reload(); await pb.getByText("GH₵ 1,050.00").waitFor(); step("B balance 1,050 (separate session)");
await pb.locator(".badge-dot").waitFor(); await shot(pb, "07-b-home-notif");

// B sets up an NFC device
await pb.goto(BASE + "/profile/devices"); await shot(pb, "08-devices-empty");
await pb.getByRole("link", { name: "Add a Device" }).click();
await pb.getByLabel("Device name").fill("Shop counter");
await pb.getByRole("button", { name: "Generate payment link" }).click();
await pb.getByText("Your device's payment link", { exact: false }).waitFor(); await shot(pb, "09-device-setup");
const code = (await pb.locator(".link-box code").innerText()).trim();
const link = "http://" + code; step("device link " + link);

// B tests the tag: opening own link offers activation
await pb.goto(link); await pb.getByRole("button", { name: "Activate this device" }).click();
await pb.getByText(/Active\. Customers can tap/).waitFor(); await shot(pb, "10-own-link-activated"); step("device activated by owner");

// A taps the tag (opens link) and pays 12.50
await pa.goto(link); await pa.getByText(/Tapped · Shop counter/).waitFor();
await keys(pa, "12.5"); await pa.getByText("12.5").first().waitFor(); await shot(pa, "11-tap-amount");
await pa.getByRole("button", { name: "Continue" }).click();
await pa.getByRole("button", { name: "Confirm and Send" }).click();
await keys(pa, "482915"); await pa.waitForURL(/receipt/);
await pa.getByText("Tap to Pay (NFC) · Shop counter").waitFor(); step("NFC payment GH₵12.50 done");

// Signed-out visitor C opens the QR link, enters amount, signs in as A, returns with amount kept
await pc.goto(`${BASE}/pay/@${B}?src=qr`);
await keys(pc, "7"); await pc.getByRole("button", { name: "Sign in to pay" }).click();
await pc.waitForURL(/login/); await shot(pc, "12-login-to-pay");
await pc.getByLabel("Username").fill(A); await pc.getByLabel("Password").fill("password123");
await pc.getByRole("button", { name: "Sign in" }).click();
await pc.waitForURL(/\/pay\//); await pc.getByText("7", { exact: true }).first().waitFor();
await pc.getByRole("button", { name: "Continue" }).click();
await pc.getByRole("button", { name: "Confirm and Send" }).click();
await keys(pc, "482915"); await pc.waitForURL(/receipt/); await pc.getByText("Scan to Pay (QR)").waitFor(); step("QR link → sign in → resumed payment");

await pa.goto(BASE + "/"); await pa.getByText("GH₵ 930.50").waitFor(); step("A balance 930.50");
await pb.goto(BASE + "/"); await pb.getByText("GH₵ 1,069.50").waitFor(); step("B balance 1,069.50");
await pb.goto(BASE + "/activity"); await pb.locator(".list-item").nth(3).waitFor(); await shot(pb, "13-activity");
await pb.goto(BASE + "/receive"); await pb.locator(".qr-box img").waitFor(); await shot(pb, "14-receive");
await pb.goto(BASE + "/notifications"); await pb.getByText(/sent you/).first().waitFor(); await shot(pb, "15-notifications");
await pa.goto(BASE + "/send"); await pa.getByText("Tap to Pay").waitFor(); await shot(pa, "16-send");
await pa.goto(BASE + "/withdraw"); await shot(pa, "17-withdraw");
await pa.goto(BASE + "/profile"); await shot(pa, "18-profile");
// insufficient funds client check
await pa.goto(`${BASE}/send/${B}`); await keys(pa, "5000"); await pa.getByRole("button", { name: "Continue" }).click();
await pa.getByText(/Insufficient demo balance/).waitFor(); step("insufficient funds blocked");
console.log("console errors:", errors.length ? errors : "none");
await browser.close();
