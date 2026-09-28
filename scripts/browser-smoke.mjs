import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  channel: process.platform === "win32" ? "chrome" : undefined,
  headless: true,
});
const suffix = Date.now().toString().slice(-8);
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5174");
  await page
    .getByLabel("Email", { exact: true })
    .fill("integration@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill("a-test-password-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("heading", { name: "Your business, at a glance" })
    .waitFor();
  await mkdir("docs/screenshots", { recursive: true });
  await page.screenshot({
    path: "docs/screenshots/dashboard.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Properties", exact: true }).click();
  await page.getByRole("heading", { name: "Property portfolio" }).waitFor();
  await page.getByRole("button", { name: "Add property" }).click();
  await page
    .locator(".modal-card")
    .getByLabel("property Code", { exact: true })
    .fill(`BROWSER-${suffix}`);
  await page
    .locator(".modal-card")
    .getByLabel("title", { exact: true })
    .fill(`Browser-verified house ${suffix}`);
  await page
    .locator(".modal-card")
    .getByLabel("location", { exact: true })
    .fill("Bahria Town");
  await page
    .locator(".modal-card")
    .getByLabel("city", { exact: true })
    .fill("Rawalpindi");
  await page
    .locator(".modal-card")
    .getByLabel("price", { exact: true })
    .fill("19000000");
  await page.getByRole("button", { name: "Save property" }).click();
  await page
    .getByRole("heading", { name: `Browser-verified house ${suffix}` })
    .waitFor();
  await page.getByRole("link", { name: "Conversations", exact: true }).click();
  await page.getByRole("button", { name: "Simulate enquiry" }).click();
  await page.getByLabel("Simulated phone").fill(`92300${suffix}`);
  await page
    .getByLabel("Simulated message")
    .fill("5 marla house in Bahria under 2 crore");
  await page.getByRole("button", { name: "Run pipeline" }).click();
  await page.locator(".message.ai").first().waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Take over", exact: true }).click();
  await page
    .getByPlaceholder("Write a reply…")
    .fill("A consultant is here to help.");
  await page.getByRole("button", { name: "Send reply" }).click();
  await page
    .locator(".message.admin")
    .filter({ hasText: "A consultant is here to help." })
    .waitFor();
  await page.screenshot({
    path: "docs/screenshots/conversations.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "AI Settings", exact: true }).click();
  await page
    .getByRole("heading", { name: "AI settings", exact: true })
    .waitFor();
  await page
    .getByRole("link", { name: "Business Settings", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Business settings", exact: true })
    .waitFor();
  await page.getByLabel(/^company Name/).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await page.waitForFunction(()=>document.querySelector('.metric strong')?.textContent!=='—');
  await page.screenshot({
    path: "docs/screenshots/mobile.png",
    fullPage: true,
  });
  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: innerWidth,
  }));
  assert.ok(
    width.scroll <= width.width,
    `Mobile page overflow: ${JSON.stringify(width)}`,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: browser login, dashboard, property creation, simulation, takeover, manual reply, settings navigation and mobile layout; no runtime page errors.",
  );
} finally {
  await browser.close();
}
