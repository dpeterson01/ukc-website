/* The PDF the office files and the family keeps.
 *
 * pdf-lib has no layout engine, so this is a plain top-to-bottom cursor: ask
 * how tall a block will be, start a new page if it will not fit, draw it, move
 * the cursor down. That is enough for a form, and it avoids pulling a headless
 * browser into a Worker.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const NAVY = rgb(0x2e / 255, 0x5e / 255, 0x8a / 255);
const NAVY_DARK = rgb(0x1a / 255, 0x3a / 255, 0x52 / 255);
const GOLD = rgb(0xb8 / 255, 0x94 / 255, 0x5f / 255);
const CHARCOAL = rgb(0x33 / 255, 0x33 / 255, 0x33 / 255);
const MUTED = rgb(0x6b / 255, 0x6b / 255, 0x6b / 255);
const HAIRLINE = rgb(0xdd / 255, 0xdd / 255, 0xdd / 255);
const WHITE = rgb(1, 1, 1);

const PAGE = { w: 612, h: 792 };
const MARGIN = 54;
const CONTENT_W = PAGE.w - MARGIN * 2;
const LABEL_W = 168;
const VALUE_X = MARGIN + LABEL_W + 12;
const VALUE_W = CONTENT_W - LABEL_W - 12;
const FOOTER_H = 46;

/* The standard PDF fonts speak WinAnsi and nothing else, so a name like
 * Kowalczyk survives but one with a Polish crossed L would throw. Diacritics
 * that decompose get folded, the handful that do not get mapped by hand, and
 * anything left over becomes a question mark rather than a 500. The exact
 * characters the family typed are preserved in submission.json either way. */
const HAND_MAP = {
  ł: 'l', Ł: 'L', đ: 'd', Đ: 'D', ħ: 'h', Ħ: 'H', ı: 'i', ŋ: 'n',
  '\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"',
  '\u2013': '-', '\u2014': '-', '\u2026': '...', '\u00a0': ' ',
};

export function safe(input) {
  const text = String(input ?? '');
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code === 10 || code === 13) { out += ' '; continue; }
    if (code < 32) continue;
    if (code <= 0xff) { out += char; continue; }
    if (HAND_MAP[char]) { out += HAND_MAP[char]; continue; }
    const folded = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    out += folded && folded.codePointAt(0) <= 0xff ? folded : '?';
  }
  return out;
}

function wrap(text, font, size, width) {
  const words = safe(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue; }
    if (line) lines.push(line);
    // A single word longer than the column, such as a long email address.
    if (font.widthOfTextAtSize(word, size) > width) {
      let chunk = '';
      for (const char of word) {
        if (font.widthOfTextAtSize(chunk + char, size) > width) { lines.push(chunk); chunk = ''; }
        chunk += char;
      }
      line = chunk;
    } else {
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

class Sheet {
  constructor(doc, fonts, header) {
    this.doc = doc;
    this.fonts = fonts;
    this.header = header;
    this.pages = [];
    this.newPage();
  }

  newPage() {
    const page = this.doc.addPage([PAGE.w, PAGE.h]);
    this.page = page;
    this.pages.push(page);
    if (this.pages.length === 1) {
      const bandH = 96;
      page.drawRectangle({ x: 0, y: PAGE.h - bandH, width: PAGE.w, height: bandH, color: NAVY_DARK });
      page.drawRectangle({ x: 0, y: PAGE.h - bandH - 4, width: PAGE.w, height: 4, color: GOLD });
      page.drawText(safe(this.header.title), {
        x: MARGIN, y: PAGE.h - 54, size: 20, font: this.fonts.displayBold, color: WHITE,
      });
      page.drawText(safe(this.header.parish), {
        x: MARGIN, y: PAGE.h - 74, size: 10, font: this.fonts.sans, color: rgb(0.82, 0.86, 0.9),
      });
      page.drawText(safe(this.header.stamp), {
        x: MARGIN, y: PAGE.h - 88, size: 8.5, font: this.fonts.sans, color: rgb(0.72, 0.78, 0.84),
      });
      this.y = PAGE.h - bandH - 18;
    } else {
      this.y = PAGE.h - MARGIN;
    }
  }

  room(height) {
    if (this.y - height < MARGIN + FOOTER_H) this.newPage();
  }

  text(str, { x = MARGIN, size = 11, font = this.fonts.serif, color = CHARCOAL, width = CONTENT_W, leading = 1.35 } = {}) {
    const lines = wrap(str, font, size, width);
    const step = size * leading;
    this.room(step * lines.length);
    for (const line of lines) {
      this.page.drawText(line, { x, y: this.y - size, size, font, color });
      this.y -= step;
    }
  }

  /* Label and value share a baseline block so the two columns cannot drift out
   * of step when one of them wraps. */
  row(label, value) {
    const labelLines = wrap(label, this.fonts.sans, 8.5, LABEL_W);
    const valueLines = wrap(value, this.fonts.serif, 11, VALUE_W);
    const height = Math.max(labelLines.length * 11.5, valueLines.length * 15) + 7;
    this.room(height);
    const top = this.y;
    labelLines.forEach((line, i) => {
      this.page.drawText(line, {
        x: MARGIN, y: top - 11 - i * 11.5, size: 8.5, font: this.fonts.sans, color: MUTED,
      });
    });
    valueLines.forEach((line, i) => {
      this.page.drawText(line, {
        x: VALUE_X, y: top - 11 - i * 15, size: 11, font: this.fonts.serif, color: CHARCOAL,
      });
    });
    this.y = top - height;
  }

  heading(title) {
    // Reserves the heading plus a row, otherwise a heading lands at the foot of
    // a page with everything it introduces on the next one.
    this.room(78);
    this.y -= 12;
    this.page.drawText(safe(title), {
      x: MARGIN, y: this.y - 13, size: 13, font: this.fonts.displayBold, color: NAVY,
    });
    this.y -= 20;
    this.page.drawRectangle({ x: MARGIN, y: this.y, width: CONTENT_W, height: 0.75, color: GOLD });
    this.y -= 10;
  }

  subheading(title) {
    this.room(56);
    this.y -= 6;
    this.page.drawText(safe(title), {
      x: MARGIN, y: this.y - 11, size: 10.5, font: this.fonts.serifBold, color: NAVY,
    });
    this.y -= 18;
  }

  rule() {
    this.room(10);
    this.page.drawRectangle({ x: MARGIN, y: this.y, width: CONTENT_W, height: 0.5, color: HAIRLINE });
    this.y -= 8;
  }

  gap(n = 8) {
    this.y -= n;
  }

  footers(lines) {
    const total = this.pages.length;
    this.pages.forEach((page, i) => {
      page.drawRectangle({ x: MARGIN, y: MARGIN + 30, width: CONTENT_W, height: 0.5, color: HAIRLINE });
      lines.forEach((line, n) => {
        page.drawText(safe(line), {
          x: MARGIN, y: MARGIN + 18 - n * 10, size: 7.5, font: this.fonts.sans, color: MUTED,
        });
      });
      const stamp = `Page ${i + 1} of ${total}`;
      const w = this.fonts.sans.widthOfTextAtSize(stamp, 7.5);
      page.drawText(stamp, {
        x: PAGE.w - MARGIN - w, y: MARGIN + 18, size: 7.5, font: this.fonts.sans, color: MUTED,
      });
    });
  }
}

const fullStamp = (iso) => `${new Date(iso).toUTCString().replace('GMT', 'UTC')}`;

export async function buildPdf(submission) {
  const {
    formTitle, formVersion, reference, submittedAt, sections, signatures,
    fingerprint, disclosureVersion, ip, userAgent, parishName,
  } = submission;

  const doc = await PDFDocument.create();
  doc.setTitle(`${formTitle} — ${reference}`);
  doc.setSubject(`${parishName} form submission`);
  doc.setProducer('ukc-forms worker');
  doc.setCreationDate(new Date(submittedAt));

  const fonts = {
    serif: await doc.embedFont(StandardFonts.TimesRoman),
    serifBold: await doc.embedFont(StandardFonts.TimesRomanBold),
    serifItalic: await doc.embedFont(StandardFonts.TimesRomanItalic),
    displayBold: await doc.embedFont(StandardFonts.TimesRomanBold),
    sans: await doc.embedFont(StandardFonts.Helvetica),
    sansBold: await doc.embedFont(StandardFonts.HelveticaBold),
  };

  const sheet = new Sheet(doc, fonts, {
    title: formTitle,
    parish: parishName,
    stamp: `Reference ${reference}  ·  Submitted ${fullStamp(submittedAt)}`,
  });

  for (const section of sections) {
    sheet.heading(section.title);
    section.groups.forEach((group, i) => {
      if (group.subtitle) sheet.subheading(group.subtitle);
      else if (i > 0) sheet.rule();
      group.rows.forEach((r) => sheet.row(r.label, r.value));
    });
  }

  for (const sig of signatures) {
    sheet.heading(sig.title || 'Signature');
    sheet.text(
      'By typing my name below I intend this to be my electronic signature, and I consent to '
      + 'receiving and signing this record electronically.',
      { size: 9.5, font: fonts.sans, color: MUTED },
    );
    sheet.gap(14);

    // The name goes on the line, the way it would on paper.
    sheet.room(44);
    sheet.page.drawText(safe(sig.value.typedName), {
      x: MARGIN + 6, y: sheet.y - 16, size: 16, font: fonts.serifItalic, color: CHARCOAL,
    });
    sheet.y -= 22;
    sheet.page.drawRectangle({ x: MARGIN, y: sheet.y, width: 280, height: 0.75, color: CHARCOAL });
    sheet.y -= 12;

    sheet.text(`Signed ${fullStamp(sig.value.signedAtClient || submittedAt)}`, {
      size: 8.5, font: fonts.sans, color: MUTED,
    });
    sheet.text('Intent to sign confirmed. Consent to electronic records confirmed.', {
      size: 8.5, font: fonts.sans, color: MUTED,
    });
  }

  sheet.heading('Record of this submission');
  sheet.row('Form', `${formTitle} (${submission.formId})`);
  sheet.row('Form version', String(formVersion || '1'));
  sheet.row('Disclosure version', String(disclosureVersion || '1'));
  sheet.row('Reference', reference);
  sheet.row('Received', fullStamp(submittedAt));
  sheet.row('Submitted from', ip || 'not recorded');
  sheet.row('Browser', userAgent || 'not recorded');
  sheet.gap(6);
  sheet.text(
    'This information is used for the purposes of the Church Office only and will not be given '
    + 'out without consent.',
    { size: 9, font: fonts.sans, color: MUTED },
  );

  sheet.footers([
    `${reference}  ·  ${fullStamp(submittedAt)}  ·  fingerprint ${fingerprint.hmac.slice(0, 16)}`,
    'The fingerprint above is a check value. If the stored record is altered, it will no longer match.',
  ]);

  return doc.save();
}
