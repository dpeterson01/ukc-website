#!/usr/bin/env node
/**
 * deliver-brevo.js — approved email HTML → Brevo draft campaign (+ test send)
 * ---------------------------------------------------------------------------
 * The delivery adapter behind the stable interface decided in the architecture
 * doc (§7.1): send_newsletter(html, subject, issue_date). Creates the campaign
 * in DRAFT status and (optionally) test-sends it to the reviewer list. The
 * actual list send stays HUMAN-CONFIRMED — this script never sends to the list.
 *
 *   node deliver-brevo.js 2026-07-19            # create draft campaign
 *   node deliver-brevo.js 2026-07-19 --test     # draft + test send to TEST_EMAILS
 *
 * Environment (.env in render/, chmod 600, or real env vars):
 *   BREVO_API_KEY        required — key scoped to campaigns
 *   BREVO_SENDER_NAME    default "Fr. Francisco Higuera"
 *   BREVO_SENDER_EMAIL   e.g. parish@ukccatholic.org (must be a verified sender)
 *   BREVO_LIST_ID        optional — recipient list attached to the draft (send
 *                        still requires a human in the Brevo UI)
 *   TEST_EMAILS          comma-separated addresses for --test
 *
 * Guardrails: refuses to run unless the issue's status is "approved"
 * (override with --allow-draft for pipeline testing).
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const API = "https://api.brevo.com/v3";

// minimal .env loader (no dependency)
if (existsSync(join(__dirname, ".env"))) {
  for (const line of (await readFile(join(__dirname, ".env"), "utf8")).split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const args = process.argv.slice(2);
const date = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const doTest = args.includes("--test");
const allowDraft = args.includes("--allow-draft");

if (!date) {
  console.error("Usage: node deliver-brevo.js YYYY-MM-DD [--test] [--allow-draft]");
  process.exit(1);
}
const KEY = process.env.BREVO_API_KEY;
if (!KEY) {
  console.error("✗ BREVO_API_KEY not set (render/.env or environment).");
  process.exit(1);
}

async function brevo(path, method, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "api-key": KEY, "content-type": "application/json", accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → HTTP ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

async function main() {
  const issue = JSON.parse(await readFile(join(ROOT, "issues", `${date}.json`), "utf8"));
  if (issue.status !== "approved" && !allowDraft) {
    console.error(`✗ issue status is "${issue.status}", not "approved". Use --allow-draft only for pipeline tests.`);
    process.exit(1);
  }

  const html = await readFile(join(ROOT, "issues", date, "email.html"), "utf8");
  const meta = JSON.parse(await readFile(join(ROOT, "issues", date, "email.meta.json"), "utf8"));

  const payload = {
    name: `Weekly Newsletter — ${date}`,
    subject: meta.subject,
    previewText: meta.preheader || undefined,
    sender: {
      name: process.env.BREVO_SENDER_NAME || "Fr. Francisco Higuera",
      email: process.env.BREVO_SENDER_EMAIL,
    },
    htmlContent: html,
    ...(process.env.BREVO_LIST_ID
      ? { recipients: { listIds: [Number(process.env.BREVO_LIST_ID)] } }
      : {}),
  };
  if (!payload.sender.email) {
    console.error("✗ BREVO_SENDER_EMAIL not set.");
    process.exit(1);
  }

  const { id } = await brevo("/emailCampaigns", "POST", payload);
  console.log(`✓ Brevo draft campaign #${id} — "${meta.subject}" (status: draft; list send is manual)`);

  if (doTest) {
    const emails = (process.env.TEST_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    await brevo(`/emailCampaigns/${id}/sendTest`, "POST", emails.length ? { emailTo: emails } : {});
    console.log(`✓ test send → ${emails.length ? emails.join(", ") : "Brevo test list"}`);
  }
}

main().catch((e) => {
  console.error("✗ deliver failed:", e.message);
  process.exit(1);
});
