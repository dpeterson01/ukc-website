#!/usr/bin/env node
/**
 * render.js — issue.json + design-system templates → bulletin PDF + email HTML
 * ---------------------------------------------------------------------------
 * Phase 3 of the bulletin automation pipeline (see
 * docs/bulletin-automation-architecture.md).
 *
 * Strategy: the design-system .html files are the SINGLE SOURCE OF TRUTH. They
 * stay valid standalone previews; this renderer injects issue.json into known
 * CSS selectors with cheerio (no template duplication), sets the liturgical
 * season + variant attributes, strips screen-only chrome, then prints the
 * bulletin to PDF with Playwright/Chromium.
 *
 * Usage:
 *   node render.js [issue-date]          # default: latest issues/*.json
 *   node render.js 2026-06-14
 *   node render.js 2026-06-14 --no-pdf   # HTML injection only (skip Chromium)
 *
 * Outputs (in issues/<date>/):
 *   bulletin.rendered.html   bulletin.pdf   bulletin-11x17.pdf
 *   email.html               email.meta.json
 */

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import * as cheerio from "cheerio";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DS = join(ROOT, "design-system", "ui_kits");
const BULLETIN_DIR = join(DS, "parish_bulletin");
const EMAIL_DIR = join(DS, "parish_email");

const SEASONS = ["ordinary", "advent", "christmas", "lent", "easter", "pentecost"];

// ---- args ----------------------------------------------------------------
const args = process.argv.slice(2);
const noPdf = args.includes("--no-pdf");
let date = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

// ---- helpers -------------------------------------------------------------
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

async function latestIssueDate() {
  const files = (await readdir(join(ROOT, "issues")))
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  if (!files.length) throw new Error("No issues/*.json files found.");
  return files[files.length - 1].replace(/\.json$/, "");
}

// ---- bulletin injection --------------------------------------------------
function renderBulletin(html, d) {
  const $ = cheerio.load(html, { decodeEntities: false });

  // Liturgical season on <html>
  const season = SEASONS.includes(d.liturgical?.season) ? d.liturgical.season : "ordinary";
  $("html").attr("class", `season-${season}`);

  // Masthead
  if (d.liturgical?.title) $(".masthead__sunday").text(d.liturgical.title);
  if (d.liturgical?.date_line) $(".masthead__day").text(d.liturgical.date_line);

  // Hero
  if (d.hero?.variant) $(".hero").attr("data-active-variant", d.hero.variant);
  if (d.hero?.quote) $('.hero__variant[data-variant="scripture"] .hero__quote').text(`“${d.hero.quote}”`);
  if (d.hero?.cite) $(".hero__quote-cite").text(d.hero.cite);
  if (d.hero?.photo_url != null) $(".hero__photo").attr("src", d.hero.photo_url);

  // Reflection
  if (d.reflection?.head) $(".reflection__head").text(d.reflection.head);
  if (Array.isArray(d.reflection?.body)) {
    $(".reflection__body").html(d.reflection.body.map((p) => `<p>${esc(p)}</p>`).join("\n"));
  }
  if (d.reflection?.question) $(".reflection__question").text(d.reflection.question);

  // One Thing
  if (d.one_thing?.copy) $(".one-thing__copy").text(d.one_thing.copy);

  // Readings
  if (Array.isArray(d.liturgical?.readings)) {
    $("ul.readings").html(
      d.liturgical.readings
        .map((r) => `<li><span>${esc(r.label)}</span><span>${esc(r.ref)}</span></li>`)
        .join("\n")
    );
  }
  if (d.liturgical?.gospel_preview) $(".gospel-preview").text(d.liturgical.gospel_preview);
  if (d.liturgical?.reflect_q) $(".reflect-q").text(d.liturgical.reflect_q);

  // Feature (sets the active variant; injects the Saint variant's fields)
  if (d.feature?.variant) $(".feature").attr("data-active-variant", d.feature.variant);
  const sv = $('.feature__variant[data-variant="saint"]');
  if (sv.length) {
    if (d.feature?.eyebrow) sv.find(".feature__eyebrow").text(d.feature.eyebrow);
    if (d.feature?.title) sv.find(".feature__title").text(d.feature.title);
    if (Array.isArray(d.feature?.body)) {
      sv.find(".feature__body").first().html(d.feature.body.map((p) => `<p>${esc(p)}</p>`).join("\n"));
    }
    if (d.feature?.meta) sv.find(".feature__saint-meta").text(d.feature.meta);
    if (d.feature?.kids_note) {
      sv.find(".feature__kids-note").html(
        `<span class="feature__kids-label">For little ones</span>${esc(d.feature.kids_note)}`
      );
    }
  }

  // Kids corner
  if (d.kids?.layout) $(".encounter-pair").attr("data-layout", d.kids.layout);
  if (d.kids?.variant) $(".kids-corner").attr("data-active-variant", d.kids.variant);

  // Mass intentions
  if (Array.isArray(d.intentions)) {
    $(".intentions__list").html(
      d.intentions
        .map((i) => {
          const by = i.by ? ` <em>${esc(i.by)}</em>` : "";
          return `<li><span class="intentions__when">${esc(i.when)}</span><span class="intentions__for">${esc(i.for)}${by}</span></li>`;
        })
        .join("\n")
    );
  }

  // This-week calendar
  if (Array.isArray(d.calendar)) {
    $(".calendar tbody").html(
      d.calendar
        .map((c) => `<tr><td>${esc(c.day)}</td><td>${esc(c.event)}</td><td>${esc(c.where)}</td></tr>`)
        .join("\n")
    );
  }

  // Announcements (keep the heading, rebuild the items)
  if (Array.isArray(d.announcements)) {
    $(".announcements .announcement").remove();
    const items = d.announcements
      .map((a) => {
        const contact = a.contact ? `<div class="announcement__contact">${esc(a.contact)}</div>` : "";
        return `<div class="announcement"><div class="announcement__title">${esc(a.title)}</div><div class="announcement__body">${esc(a.body)}</div>${contact}</div>`;
      })
      .join("\n");
    $(".announcements").append(items);
  }

  // Stewardship
  if (Array.isArray(d.stewardship?.cells)) {
    $(".stewardship__grid").html(
      d.stewardship.cells
        .map(
          (c) =>
            `<div class="stewardship__cell"><span class="stewardship__label">${esc(c.label)}</span><span class="stewardship__amount">${esc(c.amount)}</span><span class="stewardship__sub">${esc(c.sub)}</span></div>`
        )
        .join("\n")
    );
  }
  if (d.stewardship?.note) $(".stewardship__note").text(d.stewardship.note);

  // House card
  if (d.house_card?.variant) $(".house-card").attr("data-active-variant", d.house_card.variant);

  // Production cleanup: drop screen-only chrome + dev script
  $(".no-print").remove();
  $("script").remove();

  // <base> so relative css/fonts/logos resolve from any output location
  $("head").prepend(`<base href="${pathToFileURL(BULLETIN_DIR + "/").href}">`);

  return $.html();
}

// ---- email injection -----------------------------------------------------
// The email template inlines the Ordinary-Time liturgical accent as hex; swap
// the trio (accent / deep / tint) per season before parsing.
const EMAIL_SEASON_COLORS = {
  ordinary:  { accent: "#2E7D32", deep: "#1B5E20", tint: "#EAF1E4" },
  advent:    { accent: "#6A1B9A", deep: "#4A148C", tint: "#F1E7F6" },
  lent:      { accent: "#6A1B9A", deep: "#4A148C", tint: "#F1E7F6" },
  christmas: { accent: "#C9A93A", deep: "#8A6D14", tint: "#F7F1DE" },
  easter:    { accent: "#C9A93A", deep: "#8A6D14", tint: "#F7F1DE" },
  pentecost: { accent: "#C62828", deep: "#8E0000", tint: "#FBEAEA" },
};

function renderEmail(html, d) {
  const season = SEASONS.includes(d.liturgical?.season) ? d.liturgical.season : "ordinary";
  const c = EMAIL_SEASON_COLORS[season] ?? EMAIL_SEASON_COLORS.ordinary;
  const base = EMAIL_SEASON_COLORS.ordinary;
  if (c !== base) {
    html = html
      .replaceAll(base.accent, c.accent)
      .replaceAll(base.deep, c.deep)
      .replaceAll(base.tint, c.tint);
  }

  const $ = cheerio.load(html, { decodeEntities: false });

  // Preheader (inbox preview text)
  const preheader =
    d.email?.preheader ??
    (d.hero?.quote ? `This Sunday: “${d.hero.quote}” Plus the week ahead.` : null);
  if (preheader) $('[data-slot="preheader"]').text(preheader);

  // Dateline: "<Sunday title> · <date>"
  if (d.liturgical?.title) {
    const datePart = (d.liturgical.date_line ?? "").split("·")[0].trim();
    $('[data-slot="dateline"]').html(
      `${esc(d.liturgical.title)}${datePart ? ` &nbsp;&middot;&nbsp; ${esc(datePart)}` : ""}`
    );
  }

  // Hero quote + reflection
  if (d.hero?.quote) $('[data-slot="quote"]').text(`“${d.hero.quote}”`);
  if (d.reflection?.head) $('[data-slot="reflection-head"]').text(d.reflection.head);
  if (Array.isArray(d.reflection?.body) && d.reflection.body.length) {
    const paras = $('[data-slot="reflection-para"]');
    const proto = paras.first().clone();
    paras.slice(1).remove();
    let anchor = paras.first();
    anchor.text(d.reflection.body[0]);
    for (const p of d.reflection.body.slice(1)) {
      const next = proto.clone().text(p);
      anchor.after(next);
      anchor = next;
    }
  }
  if (d.reflection?.question) $('[data-slot="reflection-question"]').text(d.reflection.question);

  // Three Things to Know — from the week's announcements (max 3)
  if (Array.isArray(d.announcements) && d.announcements.length) {
    const things = $('[data-slot="thing"]');
    const proto = things.first().clone();
    const items = d.announcements.slice(0, 3);
    things.slice(1).remove();
    let anchor = things.first();
    items.forEach((a, i) => {
      const t = i === 0 ? anchor : proto.clone();
      t.find("td").first().text(`${i + 1}.`);
      const copy = t.find("td").last();
      const strong = copy.find("strong").first();
      strong.text(`${a.title}.`);
      // strong stays; replace the trailing text node(s) with the body
      copy.html(`${$.html(strong)}\n                  ${esc(a.body)}`);
      if (i > 0) {
        anchor.after(t);
        anchor = t;
      }
    });
  }

  // FORMED pick (optional — template copy stands if absent)
  if (d.formed_pick?.title) {
    $('[data-slot="formed-copy"]').html(
      `<strong>${esc(d.formed_pick.title)}</strong> — ${esc(d.formed_pick.blurb ?? "")} <a href="https://formed.org" style="color:#2E5E8A; font-weight:bold;">Watch free &rsaquo;</a>`
    );
  }

  // CTA button
  if (d.email?.cta?.label) {
    const a = $('[data-slot="cta"]');
    a.text(d.email.cta.label);
    if (d.email.cta.url) a.attr("href", d.email.cta.url);
  }

  return $.html();
}

// ---- 11×17 imposition ------------------------------------------------------
// Impose the 4 letter pages onto one duplex 11×17 sheet in booklet order
// (front: 4|1, back: 2|3) for the church's in-house printer + mechanical
// folder. Print duplex, FLIP ON SHORT EDGE.
async function imposeBooklet(srcPdfPath, outPath) {
  let PDFDocument;
  try {
    ({ PDFDocument } = await import("pdf-lib"));
  } catch {
    console.log("• pdf-lib not installed; skipping 11×17 imposition. Run `npm install` in render/.");
    return false;
  }
  const src = await PDFDocument.load(await readFile(srcPdfPath));
  if (src.getPageCount() !== 4) {
    console.log(`• bulletin has ${src.getPageCount()} pages (expected 4); skipping imposition.`);
    return false;
  }
  const out = await PDFDocument.create();
  const [p1, p2, p3, p4] = await out.embedPdf(src, [0, 1, 2, 3]);
  const W = 1224; // 17in
  const H = 792; // 11in
  const HALF = 612; // 8.5in
  const sheets = [
    [p4, p1], // front: page 4 left, page 1 right
    [p2, p3], // back:  page 2 left, page 3 right
  ];
  for (const [left, right] of sheets) {
    const page = out.addPage([W, H]);
    page.drawPage(left, { x: 0, y: 0, width: HALF, height: H });
    page.drawPage(right, { x: HALF, y: 0, width: HALF, height: H });
  }
  await writeFile(outPath, await out.save());
  return true;
}

// ---- main ----------------------------------------------------------------
async function main() {
  if (!date) date = await latestIssueDate();
  const issuePath = join(ROOT, "issues", `${date}.json`);
  if (!existsSync(issuePath)) throw new Error(`Missing ${issuePath}`);
  const data = JSON.parse(await readFile(issuePath, "utf8"));

  const outDir = join(ROOT, "issues", date);
  await mkdir(outDir, { recursive: true });

  // Bulletin HTML
  const bulletinTpl = await readFile(join(BULLETIN_DIR, "bulletin.html"), "utf8");
  const bulletinHtml = renderBulletin(bulletinTpl, data);
  const bulletinOut = join(outDir, "bulletin.rendered.html");
  await writeFile(bulletinOut, bulletinHtml);
  console.log(`✓ bulletin HTML → issues/${date}/bulletin.rendered.html`);

  // Email HTML + send metadata (subject/preheader for the Brevo adapter)
  if (existsSync(join(EMAIL_DIR, "email.html"))) {
    const emailTpl = await readFile(join(EMAIL_DIR, "email.html"), "utf8");
    await writeFile(join(outDir, "email.html"), renderEmail(emailTpl, data));
    const subject =
      data.email?.subject_chosen || data.email?.subject_options?.[0] || `Parish news — ${date}`;
    const preheader =
      data.email?.preheader ??
      (data.hero?.quote ? `This Sunday: “${data.hero.quote}” Plus the week ahead.` : "");
    await writeFile(
      join(outDir, "email.meta.json"),
      JSON.stringify({ issue_date: date, subject, preheader }, null, 2)
    );
    console.log(`✓ email HTML    → issues/${date}/email.html (+ email.meta.json)`);
  }

  // Bulletin PDF (Playwright)
  if (noPdf) {
    console.log("• --no-pdf set; skipping Chromium render.");
    return;
  }
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.log("• Playwright not installed; skipping PDF. Run `npm install` in render/ then re-run.");
    return;
  }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(pathToFileURL(bulletinOut).href, { waitUntil: "networkidle" });
  await page.pdf({
    path: join(outDir, "bulletin.pdf"),
    width: "8.5in",
    height: "11in",
    printBackground: true,
    preferCSSPageSize: true,
  });
  await browser.close();
  console.log(`✓ bulletin PDF  → issues/${date}/bulletin.pdf`);

  // Imposed 11×17 booklet for in-house printing (duplex, flip on short edge)
  if (await imposeBooklet(join(outDir, "bulletin.pdf"), join(outDir, "bulletin-11x17.pdf"))) {
    console.log(`✓ 11×17 booklet → issues/${date}/bulletin-11x17.pdf`);
  }
}

main().catch((e) => {
  console.error("✗ render failed:", e.message);
  process.exit(1);
});
