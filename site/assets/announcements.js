/* Notices for the bar that sits above the navigation on every page.
 *
 * To post a notice, add an entry to the list below. To take one down early,
 * delete it. Otherwise it removes itself after `end`, so nothing goes stale.
 *
 *   id     A short unique name. Changing it makes the notice reappear for
 *          anyone who had dismissed the previous one.
 *   start  First day the notice shows, YYYY-MM-DD.
 *   end    Last day it shows, YYYY-MM-DD. Inclusive.
 *   en/es  { label, text } and optionally { cta: { text, href } }.
 *
 * Both languages are required. The bar shows one notice at a time: the first
 * entry whose dates cover today.
 *
 * Writing a notice:
 *   - One notice, one idea. Anything needing a second sentence belongs on a
 *     page, linked from the cta.
 *   - Say WHAT, then WHEN, then WHERE. People stop reading early.
 *   - No "Please note that". No year. Abbreviate months and weekdays.
 *   - Limits are label 40 / text 100 / cta 24 characters in English, and
 *     50 / 125 / 30 in Spanish. Ceilings, not targets.
 *
 * `node scripts/verify-announcements.mjs` enforces all of the above.
 */
(function (root) {
  'use strict';

  root.UKC_ANNOUNCEMENTS = [
    {
      id: 'assumption-2026',
      start: '2026-08-14',
      end: '2026-08-15',
      en: {
        label: 'Assumption of the Blessed Virgin Mary',
        text: 'Mass Sat Aug 15 at 11 a.m., Immaculate Conception, Roslyn. '
          + 'No obligation this year; all welcome.',
      },
      es: {
        label: 'Asunción de la Santísima Virgen María',
        text: 'Misa sáb 15 de agosto a las 11 a.m., Inmaculada Concepción, Roslyn. '
          + 'Este año sin obligación; todos son bienvenidos.',
      },
    },
  ];
}(typeof window !== 'undefined' ? window : globalThis));
