#!/usr/bin/env node
/**
 * pull.js — skeleton a week's issue.json from automated sources
 * --------------------------------------------------------------
 * Phase 4 of the bulletin automation pipeline (docs/bulletin-automation-architecture.md §3).
 *
 *   node pull.js 2026-07-19        # the Sunday date → issues/2026-07-19.json
 *   node pull.js 2026-07-19 --force  # overwrite an existing issue file
 *
 * Pulls:
 *   • USCCB daily readings page (date-deterministic URL) → readings refs + day title
 *   • Liturgical season — computed locally (computus; no network needed)
 *   • Saint-of-the-day RSS (Franciscan Media) → candidate saints for the week
 *   • announcements/backlog.json → announcements active for that Sunday
 *
 * AI-drafted fields (reflection, gospel preview, FORMED pick, prayer, subjects)
 * are emitted as "TODO:" markers for the agent's drafting pass. Every network
 * source fails soft — you always get a renderable skeleton.
 *
 * NOTE: bible.usccb.org rate-limits aggressive re-fetching (403 on rapid repeat
 * hits). The weekly Monday cron is well under the limit; if a pull 403s, the
 * skeleton carries the URL in its TODOs — re-run later or fill by hand.
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import * as cheerio from "cheerio";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const SAINT_RSS = "https://www.franciscanmedia.org/saint-of-the-day/feed";

// ---- args ------------------------------------------------------------------
const args = process.argv.slice(2);
const force = args.includes("--force");
const dateArg = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
if (!dateArg) {
  console.error("Usage: node pull.js YYYY-MM-DD (the Sunday) [--force]");
  process.exit(1);
}
const sunday = new Date(`${dateArg}T12:00:00`);
if (sunday.getDay() !== 0) {
  console.warn(`⚠ ${dateArg} is not a Sunday — continuing anyway.`);
}

// ---- liturgical season (no network) ----------------------------------------
// Gregorian Easter — Meeus/Jones/Butcher.
function easterSunday(year) {
  const a = year % 19,
    b = Math.floor(year / 100),
    c = year % 100,
    d = Math.floor(b / 4),
    e = b % 4,
    f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4),
    k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7,
    m = Math.floor((a + 11 * h + 22 * l) / 451),
    month = Math.floor((h + l - 7 * m + 114) / 31),
    day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day, 12);
}
const days = (n) => n * 86400000;

function liturgicalSeason(dt) {
  const y = dt.getFullYear();
  const easter = easterSunday(y);
  const ashWednesday = new Date(easter.getTime() - days(46));
  const holyThursday = new Date(easter.getTime() - days(3));
  const pentecost = new Date(easter.getTime() + days(49));

  // Advent: 4th Sunday before Christmas → Dec 24
  const christmas = new Date(y, 11, 25, 12);
  const advent1 = new Date(christmas.getTime() - days(christmas.getDay() === 0 ? 28 : 21 + christmas.getDay()));

  // Christmas season: Dec 25 → Baptism of the Lord (approx: the Sunday after Jan 6)
  const jan6 = new Date(y, 0, 6, 12);
  const baptismEnd = new Date(jan6.getTime() + days(((7 - jan6.getDay()) % 7) || 7));

  if (dt >= advent1 && dt < christmas) return "advent";
  if (dt >= christmas || dt <= baptismEnd) return "christmas";
  if (dt >= ashWednesday && dt < holyThursday) return "lent";
  if (dt.toDateString() === pentecost.toDateString()) return "pentecost";
  if (dt >= easter && dt < pentecost) return "easter";
  return "ordinary";
}

// ---- USCCB readings ---------------------------------------------------------
function usccbUrl(dt) {
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  const yy = String(dt.getFullYear()).slice(-2);
  return `https://bible.usccb.org/bible/readings/${mm}${dd}${yy}.cfm`;
}

async function fetchUsccb(dt) {
  const url = usccbUrl(dt);
  try {
    const res = await fetch(url, { headers: { "user-agent": "ukcc-bulletin-pull/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const $ = cheerio.load(await res.text());

    // Day title, e.g. "Sixteenth Sunday in Ordinary Time"
    const title =
      $("h2 .b-lectionary, .b-lectionary h2").first().text().trim() ||
      $("title").text().split("|")[0].trim();

    // Reading blocks: .b-verse holds h3 (name) + .address (ref)
    const readings = [];
    $(".b-verse").each((_, el) => {
      const name = $(el).find("h3").first().text().trim();
      const ref = $(el).find(".address").first().text().trim();
      if (!name || !ref) return;
      const label = name
        .replace(/^Reading\s+1$|^Reading\s+I$/i, "First Reading")
        .replace(/^Reading\s+2$|^Reading\s+II$/i, "Second Reading")
        .replace(/^Responsorial\s+Psalm$/i, "Psalm");
      if (/alleluia|verse before/i.test(label)) return;
      // USCCB lists optional shorter forms as a bare "or" block — fold into the previous ref
      if (/^or$/i.test(label) && readings.length) {
        readings[readings.length - 1].ref += ` (or ${ref})`;
        return;
      }
      readings.push({ label, ref });
    });

    return { title, readings, url };
  } catch (e) {
    console.warn(`⚠ USCCB fetch failed (${e.message}) — leaving TODOs. ${url}`);
    return { title: "", readings: [], url };
  }
}

// ---- Saint RSS ---------------------------------------------------------------
async function fetchSaints() {
  try {
    const res = await fetch(SAINT_RSS, { headers: { "user-agent": "ukcc-bulletin-pull/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const $ = cheerio.load(await res.text(), { xmlMode: true });
    const items = [];
    $("item").each((_, el) => {
      items.push({
        name: $(el).find("title").first().text().trim(),
        link: $(el).find("link").first().text().trim(),
        date: $(el).find("pubDate").first().text().trim(),
      });
    });
    return items.slice(0, 10);
  } catch (e) {
    console.warn(`⚠ Saint RSS fetch failed (${e.message}) — leaving TODO.`);
    return [];
  }
}

// ---- Announcement backlog -----------------------------------------------------
async function activeAnnouncements(dt) {
  const path = join(ROOT, "announcements", "backlog.json");
  if (!existsSync(path)) return [];
  try {
    const backlog = JSON.parse(await readFile(path, "utf8"));
    const iso = dt.toISOString().slice(0, 10);
    return (backlog.entries ?? [])
      .filter((e) => e.status === "active" && e.run_start <= iso && iso <= e.run_end)
      .map((e) => ({
        title: e.parish && e.parish !== "shared" ? `[${e.parish.toUpperCase()}] ${e.title}` : e.title,
        body: e.body,
        contact: e.contact ?? "",
      }));
  } catch (e) {
    console.warn(`⚠ backlog read failed (${e.message}) — no announcements merged.`);
    return [];
  }
}

// ---- main ----------------------------------------------------------------------
async function main() {
  const outPath = join(ROOT, "issues", `${dateArg}.json`);
  if (existsSync(outPath) && !force) {
    console.error(`✗ ${outPath} exists. Use --force to overwrite.`);
    process.exit(1);
  }

  const season = liturgicalSeason(sunday);
  const [usccb, saints, announcements] = await Promise.all([
    fetchUsccb(sunday),
    fetchSaints(),
    activeAnnouncements(sunday),
  ]);

  const dateLine = sunday.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const seasonLabel = { ordinary: "Ordinary Time", advent: "Advent", christmas: "Christmas", lent: "Lent", easter: "Easter", pentecost: "Pentecost" }[season];

  const issue = {
    issue_date: dateArg,
    liturgical: {
      season,
      title: usccb.title || `TODO: Sunday title (see ${usccb.url})`,
      date_line: `${dateLine} · ${seasonLabel}`,
      readings: usccb.readings.length
        ? usccb.readings
        : [
            { label: "First Reading", ref: `TODO (see ${usccb.url})` },
            { label: "Psalm", ref: "TODO" },
            { label: "Second Reading", ref: "TODO" },
            { label: "Gospel", ref: "TODO" },
          ],
      gospel_preview: "TODO: agent drafts (2-3 sentence teaser of the Gospel)",
      reflect_q: "TODO: agent drafts (pre-Mass reflection question)",
    },
    hero: { variant: "scripture", quote: "TODO: agent picks a line from the Gospel", cite: "TODO", photo_url: "" },
    reflection: {
      head: "From Fr. Francisco",
      body: ["TODO: agent drafts 200-300 words from the readings, parish voice, ends toward the question"],
      question: "TODO: agent drafts reflection question",
    },
    one_thing: { copy: "TODO: this week's single invitation (from announcements or calendar)", qr_url: "https://ukccatholic.org" },
    feature: {
      variant: "saint",
      eyebrow: "Saint of the Week",
      title: saints[0]?.name?.replace(/^Saint of the Day.*?:\s*/i, "") || "TODO: pick from saint candidates below",
      body: ["TODO: agent drafts 100-150 word bio (fact-check against the linked source)"],
      meta: "TODO: Feast · date · patronage",
      kids_note: "TODO: one-sentence kids tie-in",
    },
    saint_candidates: saints,
    kids: { layout: "side-by-side", variant: "short-story" },
    intentions: [],
    calendar: [],
    announcements,
    stewardship: { cells: [], note: "" },
    house_card: { variant: "email-signup" },
    formed_pick: { title: "TODO: agent recommends from FORMED, matched to the readings", blurb: "TODO" },
    email: {
      subject_options: ["TODO: agent drafts 3-5 options, <50 chars"],
      subject_chosen: null,
      feature_ref: "reflection",
      cta: { label: "TODO", url: "https://ukccatholic.org" },
    },
    status: "draft",
    review: { preview_url: null, revision: 0, feedback_log: [] },
  };

  await writeFile(outPath, JSON.stringify(issue, null, 2) + "\n");
  console.log(`✓ skeleton → issues/${dateArg}.json`);
  console.log(`  season: ${season} · readings: ${usccb.readings.length ? "pulled" : "TODO"} · saints: ${saints.length} candidates · announcements: ${announcements.length} active`);
}

main().catch((e) => {
  console.error("✗ pull failed:", e.message);
  process.exit(1);
});
