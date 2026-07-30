/* UI strings for the parts of the site that JavaScript builds at runtime.
 *
 * The static page copy lives in the HTML files, one tree per language. This file
 * only covers text that never appears in the HTML: the contact form's conditional
 * fields, validation messages, and confirmations.
 *
 * `es` starts out with every key present and empty. An empty value falls back to
 * English, so a half-finished translation shows English rather than a blank label.
 *
 * What NOT to put here: anything that ends up in a submission. The parish office
 * reads submissions in English regardless of the language the form was filled in,
 * so the reason, parish, sacrament, and subject labels sent to Formspree are held
 * in site.js and never translated.
 */
(function (root) {
  'use strict';

  var EN = {
    'contact.parish.label': 'Which parish?',
    'contact.parish.choose': 'Choose a parish…',
    'contact.parish.sjb': 'St. John the Baptist (Cle Elum)',
    'contact.parish.ic': 'Immaculate Conception (Roslyn)',
    'contact.parish.unsure': 'Not sure yet',

    'contact.phone.label': 'Phone number',
    'contact.phone.placeholder': '(509) 555-0123',
    'contact.heard.label': 'How did you hear about us?',
    'contact.heard.placeholder': 'A friend, online search, visiting Mass…',

    'contact.emails.label': "While you're here, want emails too?",
    'chip.weeklyBulletin': 'Weekly bulletin',
    'chip.quarterlyNewsletter': 'Quarterly newsletter',
    'chip.holyDayReminders': 'Holy-day reminders',

    'contact.prayerFor.label': 'Name of person needing prayer',
    'contact.prayerFor.placeholder': 'Name or initials',
    'contact.requester.label': "Requester's contact info",
    'contact.requester.placeholder': 'Email or phone for follow-up',
    'contact.prayer.note':
      'Your request is kept confidential and shared only with Father and the parish office.',

    'contact.sacrament.label': 'Sacrament type',
    'contact.sacrament.choose': 'Choose a sacrament…',
    'contact.sacrament.baptism': 'Baptism',
    'contact.sacrament.firstCommunion': 'First Communion',
    'contact.sacrament.confirmation': 'Confirmation',
    'contact.sacrament.marriage': 'Marriage',
    'contact.sacrament.funeral': 'Funeral',
    'contact.sacrament.anointing': 'Anointing of the Sick',
    'contact.timeframe.label': 'Preferred date or timeframe',
    'contact.timeframe.placeholder': 'A date, month, or general timeframe',

    'message.placeholder.default':
      'Registering, planning a sacrament, a prayer request, or just saying hello…',
    'message.placeholder.register':
      'Tell us a bit about your family, how you found us, or any questions…',
    'message.placeholder.prayer':
      'Share your intention. All requests are kept confidential.',

    'error.email': 'Please enter a valid email address.',
    'error.required': 'This field is required.',
    'error.send':
      'That did not go through. Please try again, or call the parish office at {phone}.',

    'success.friend': 'friend',
    'success.register':
      'Thank you, {name}. We have your details, and someone from the parish office will '
      + 'reach out soon about getting you registered.',
    'success.prayer':
      'Thank you. Your intention has been received and will be held in prayer, in confidence.',
    'success.default':
      "Thank you, {name}. Your message is on its way to the parish office. We'll reply "
      + 'during office hours; for anything urgent, please call {phone}.',

    'btn.send': 'Send message',
    'btn.sending': 'Sending…',
    'btn.signUp': 'Sign me up',
    'btn.signingUp': 'Signing up…',
    'signup.thanks': "You're on the list. Watch your inbox Sunday morning.",
  };

  /* Translator: fill in the values below. Leave a value as '' to keep English.
     Do not rename, reorder, or remove keys. See TRANSLATION.md for terminology. */
  var ES = {
    'contact.parish.label': '',
    'contact.parish.choose': '',
    'contact.parish.sjb': '',
    'contact.parish.ic': '',
    'contact.parish.unsure': '',

    'contact.phone.label': '',
    'contact.phone.placeholder': '',
    'contact.heard.label': '',
    'contact.heard.placeholder': '',

    'contact.emails.label': '',
    'chip.weeklyBulletin': '',
    'chip.quarterlyNewsletter': '',
    'chip.holyDayReminders': '',

    'contact.prayerFor.label': '',
    'contact.prayerFor.placeholder': '',
    'contact.requester.label': '',
    'contact.requester.placeholder': '',
    'contact.prayer.note': '',

    'contact.sacrament.label': '',
    'contact.sacrament.choose': '',
    'contact.sacrament.baptism': '',
    'contact.sacrament.firstCommunion': '',
    'contact.sacrament.confirmation': '',
    'contact.sacrament.marriage': '',
    'contact.sacrament.funeral': '',
    'contact.sacrament.anointing': '',
    'contact.timeframe.label': '',
    'contact.timeframe.placeholder': '',

    'message.placeholder.default': '',
    'message.placeholder.register': '',
    'message.placeholder.prayer': '',

    'error.email': '',
    'error.required': '',
    'error.send': '',

    'success.friend': '',
    'success.register': '',
    'success.prayer': '',
    'success.default': '',

    'btn.send': '',
    'btn.sending': '',
    'btn.signUp': '',
    'btn.signingUp': '',
    'signup.thanks': '',
  };

  var TABLES = { en: EN, es: ES };

  function lang() {
    var attr = (document.documentElement.getAttribute('lang') || 'en').toLowerCase();
    var base = attr.split('-')[0];
    return TABLES[base] ? base : 'en';
  }

  /* `vars` fills {placeholders}. Missing or empty translations fall through to
     English so a partial translation degrades to a readable page. */
  function t(key, vars) {
    var table = TABLES[lang()] || EN;
    var value = table[key];
    if (!value) value = EN[key];
    if (value == null) return '';
    if (!vars) return value;
    return value.replace(/\{(\w+)\}/g, function (match, name) {
      return Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : match;
    });
  }

  /* Escapes values interpolated into the innerHTML the contact form builds. */
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  root.UKC_I18N = { tables: TABLES, lang: lang, t: t, esc: esc };
}(typeof window !== 'undefined' ? window : globalThis));
