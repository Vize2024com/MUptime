/**
 * monitor.js
 *
 * 1. Reads config.json
 * 2. Loops through each site
 * 3. If status code ∉ expectedStatus, fires a POST to webhook URL
 *
 * Usage: `node monitor.js`
 */

import fetch from "node-fetch";
import fs from "fs";
import path from "path";

// ──── 1. LOAD CONFIG ─────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(process.cwd(), "config.json");
let config;
try {
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  config = JSON.parse(raw);
} catch (err) {
  console.error("❌ Failed to load config.json:", err);
  process.exit(1);
}
const { webhook, sites } = config;
if (!webhook || !Array.isArray(sites)) {
  console.error("❌ config.json must contain a 'webhook' string and a 'sites' array.");
  process.exit(1);
}

// ──── 2. HELPERS ────────────────────────────────────────────────────────────────

/**
 * checkSite()
 * @param {{ name: string, url: string, expectedStatus: number[] }} site
 * @returns {Promise<{ up: boolean, statusCode: number | null }>}
 */
async function checkSite(site) {
  try {
    const res = await fetch(site.url, {
      method: "GET",
      timeout: 10000, // 10s timeout
    });
    const up = site.expectedStatus.includes(res.status);
    return { up, statusCode: res.status };
  } catch (err) {
    // Network error or timeout.
    return { up: false, statusCode: null };
  }
}

/**
 * sendWebhook()
 * Posts a JSON payload to the webhook URL:
 * {
 *   siteName: "My Blog",
 *   siteUrl:  "https://myblog.example.com",
 *   status:   "DOWN",            // or "UP"
 *   httpCode: 500,               // or null if no response
 *   timestamp: "2025-06-05T08:00:00Z"
 * }
 */
async function sendWebhook(payload) {
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      timeout: 10000,
    });
    if (!res.ok) {
      console.warn(
        `⚠️ Webhook responded with status ${res.status}: ${await res.text()}`
      );
    }
  } catch (err) {
    console.error("❌ Failed to send webhook:", err);
  }
}

// ──── 3. MAIN LOOP ─────────────────────────────────────────────────────────────

async function main() {
  const results = await Promise.all(
    sites.map(async (site) => {
      const { up, statusCode } = await checkSite(site);
      return { site, up, statusCode };
    })
  );

  const now = new Date().toISOString();
  for (const r of results) {
    const { site, up, statusCode } = r;
    if (!up) {
      console.log(
        `[${now}] 🚨 ${site.name} (${site.url}) is DOWN → code=${statusCode}`
      );
      const payload = {
        siteName: site.name,
        siteUrl: site.url,
        status: "DOWN",
        httpCode: statusCode,
        timestamp: now,
      };
      await sendWebhook(payload);
    } else {
      console.log(
        `[${now}] ✅ ${site.name} (${site.url}) is UP → code=${statusCode}`
      );
    }
  }
}

// Run once, then exit.
main()
  .then(() => {
    process.exit(0);
  })
  .catch((e) => {
    console.error("Fatal error in monitor.js:", e);
    process.exit(1);
  });
