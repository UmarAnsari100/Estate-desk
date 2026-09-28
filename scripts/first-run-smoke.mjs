import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const dataDir = resolve(".test-postgres", `first-run-${randomUUID()}`);
let processHandle;
async function start() {
  return new Promise((done, reject) => {
    let output = "";
    processHandle = spawn(
      process.execPath,
      ["--import", "tsx", "scripts/dev.mts"],
      {
        env: {
          ...process.env,
          ESTATE_DEV_DATA_DIR: dataDir,
          DATABASE_URL: "",
          NODE_ENV: "development",
          GEMINI_API_KEY: "",
          MOCK_MODE: "true",
        },
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        windowsHide: true,
      },
    );
    const timeout = setTimeout(
      () => reject(new Error("Dev startup timeout")),
      90000,
    );
    processHandle.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(
        /Estate Desk is ready: (http:\/\/localhost:\d+)/,
      );
      if (match) {
        clearTimeout(timeout);
        done(match[1]);
      }
    });
    processHandle.stderr.on("data", (chunk) => {
      output += chunk;
    });
    processHandle.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Dev process exited (${code}): ${output}`));
    });
  });
}
async function stop() {
  if (processHandle && processHandle.exitCode === null) {
    const exited = new Promise((done) => processHandle.once("exit", done));
    processHandle.send("shutdown");
    await exited;
  }
}
const browser = await chromium.launch({
  channel: process.platform === "win32" ? "chrome" : undefined,
  headless: true,
});
try {
  let url = await start();
  let page = await browser.newPage();
  await page.goto(url);
  await page
    .getByRole("heading", { name: "Create your administrator account" })
    .waitFor();
  await page.getByLabel("Your name").fill("Local Test Admin");
  await page.getByLabel("Email", { exact: true }).fill("first-run@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill("first-run-password-123");
  await page.getByLabel("Confirm password").fill("first-run-password-123");
  await page.getByRole("button", { name: "Create account & sign in" }).click();
  await page
    .getByRole("heading", { name: "Your business, at a glance" })
    .waitFor();
  await page.getByRole("link", { name: "Conversations", exact: true }).click();
  await page.getByRole("button", { name: "Simulate enquiry" }).click();
  await page.getByLabel("Simulated message").fill("Hi ! How are you ?");
  await page.getByRole("button", { name: "Run pipeline" }).click();
  await page.locator(".message.ai").first().waitFor({ timeout: 15000 });
  const reply = await page.locator(".message.ai p").first().textContent();
  assert.match(reply, /Hello!/);
  assert.doesNotMatch(reply, /PKR|DEMO-|match your requirements/);
  await page.close();
  await stop();
  url = await start();
  page = await browser.newPage();
  await page.goto(url);
  await page
    .getByRole("heading", { name: "Sign in to your workspace" })
    .waitFor();
  await page.getByLabel("Email", { exact: true }).fill("first-run@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill("first-run-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("heading", { name: "Your business, at a glance" })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  const menu = page.getByRole("button", { name: "Open navigation" });
  await menu.waitFor();
  await menu.click();
  await page.getByRole("link", { name: "Properties", exact: true }).waitFor();
  await page.getByRole("button", { name: "Close navigation" }).first().click();
  await menu.waitFor();
  console.log(
    "PASS: npm run dev startup, browser first-account signup, automatic login, hi greeting without listings, persistent account after full process/database restart, and subsequent login.",
  );
} finally {
  await browser.close();
  await stop();
}
