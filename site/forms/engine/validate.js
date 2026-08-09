/* Validation rules for the parish forms engine.
 *
 * Everything here is a convenience for the person filling the form. The Worker
 * re-runs the same checks server-side, and that is the actual control.
 *
 * Two severities:
 *   error   blocks the step
 *   warning explains the concern and lets the person continue
 *
 * The warnings exist because the obvious "rules" have legitimate exceptions.
 * Adult converts receive baptism, Eucharist, and confirmation in one liturgy,
 * and Eastern Rite Catholics receive all three in infancy. Hard-blocking an
 * out-of-order sacrament sequence would reject correct records.
 */
(function (global) {
  'use strict';

  var EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

  // Typo suggestions cover the domains that actually show up in parish mail.
  var DOMAIN_TYPOS = {
    'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmail.co': 'gmail.com',
    'gmailcom': 'gmail.com', 'gnail.com': 'gmail.com', 'gmail.con': 'gmail.com',
    'yahooo.com': 'yahoo.com', 'yaho.com': 'yahoo.com', 'yahoo.co': 'yahoo.com',
    'hotmial.com': 'hotmail.com', 'hotmail.co': 'hotmail.com',
    'outlok.com': 'outlook.com', 'outloook.com': 'outlook.com',
    'icloud.co': 'icloud.com', 'iclould.com': 'icloud.com',
    'comcast.ent': 'comcast.net', 'comcast.com': 'comcast.net',
  };

  var STATES = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID',
    'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO',
    'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA',
    'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  ];

  function isBlank(v) {
    if (v === null || v === undefined) return true;
    if (Array.isArray(v)) return v.length === 0;
    return String(v).trim() === '';
  }

  function digits(v) {
    return String(v || '').replace(/\D/g, '');
  }

  /* Formats as the person types. Handles a leading US country code so pasting
   * "+1 509 674 2531" doesn't read as an eleven-digit error. */
  function formatPhone(value) {
    var d = digits(value);
    if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
    d = d.slice(0, 10);
    if (d.length === 0) return '';
    if (d.length <= 3) return '(' + d;
    if (d.length <= 6) return '(' + d.slice(0, 3) + ') ' + d.slice(3);
    return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
  }

  function validPhone(value) {
    var d = digits(value);
    if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
    return d.length === 10;
  }

  function validEmail(value) {
    return EMAIL_RE.test(String(value || '').trim());
  }

  function emailSuggestion(value) {
    var at = String(value || '').lastIndexOf('@');
    if (at < 0) return null;
    var domain = value.slice(at + 1).toLowerCase().trim();
    var fixed = DOMAIN_TYPOS[domain];
    return fixed ? value.slice(0, at + 1) + fixed : null;
  }

  function validZip(value) {
    return /^\d{5}(-?\d{4})?$/.test(String(value || '').trim());
  }

  /* Dates arrive as {month, day, year} from three separate inputs, which beat a
   * date picker for a birthdate several decades back. Returns null when the
   * pieces don't describe a real calendar date, so Feb 30 fails here rather
   * than silently rolling into March. */
  function toDate(parts) {
    if (!parts) return null;
    var m = parseInt(parts.month, 10);
    var d = parseInt(parts.day, 10);
    var y = parseInt(parts.year, 10);
    if (!m || !d || !y) return null;
    if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    var dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return dt;
  }

  function isoDate(parts) {
    var dt = toDate(parts);
    if (!dt) return '';
    return dt.toISOString().slice(0, 10);
  }

  function datePartsComplete(parts) {
    return !!(parts && !isBlank(parts.month) && !isBlank(parts.day) && !isBlank(parts.year));
  }

  function datePartsAny(parts) {
    return !!(parts && (!isBlank(parts.month) || !isBlank(parts.day) || !isBlank(parts.year)));
  }

  var pad2 = function (n) { return ('0' + n).slice(-2); };

  /* A sacrament forty years ago is often remembered as a year and nothing more.
   * Returns the most precise ISO prefix the answer supports: 1985, 1985-06, or
   * 1985-06-10. Empty when the pieces cannot make sense, which includes a day
   * with no month, since that is not a date anyone can act on. */
  function approximateIso(parts) {
    if (!parts) return '';
    var y = String(parts.year === undefined || parts.year === null ? '' : parts.year).trim();
    var m = String(parts.month === undefined || parts.month === null ? '' : parts.month).trim();
    var d = String(parts.day === undefined || parts.day === null ? '' : parts.day).trim();

    if (!/^\d{4}$/.test(y)) return '';
    if (!m) return d ? '' : y;

    var mi = parseInt(m, 10);
    if (!mi || mi < 1 || mi > 12) return '';
    if (!d) return y + '-' + pad2(mi);

    return isoDate({ month: m, day: d, year: y });
  }

  /* The day the answer means, for checks that need one. A year alone is read as
   * the first of January, which is early enough that a future or over-120 check
   * still behaves. */
  function approximateDate(parts) {
    var iso = approximateIso(parts);
    if (!iso) return null;
    var bits = iso.split('-');
    return new Date(Date.UTC(
      parseInt(bits[0], 10),
      bits[1] ? parseInt(bits[1], 10) - 1 : 0,
      bits[2] ? parseInt(bits[2], 10) : 1,
    ));
  }

  function ageOn(birth, when) {
    if (!birth) return null;
    var ref = when || new Date();
    var age = ref.getUTCFullYear() - birth.getUTCFullYear();
    var mDiff = ref.getUTCMonth() - birth.getUTCMonth();
    if (mDiff < 0 || (mDiff === 0 && ref.getUTCDate() < birth.getUTCDate())) age--;
    return age;
  }

  /* --- single field ---------------------------------------------------- */

  /* Returns { error, warning }, either of which may be null. `field` is the
   * schema definition, `value` the current value, `label` the resolved label. */
  function checkField(field, value) {
    var label = field.label || 'This field';

    if (field.type === 'date') {
      if (field.approximate) {
        if (!datePartsAny(value)) {
          return field.required ? { error: label + ' needs at least a year.' } : {};
        }
        var loose = approximateDate(value);
        if (!loose) {
          return { error: label + ' needs at least a year, and a day needs a month with it.' };
        }
        if (field.notFuture !== false && loose.getTime() > new Date().getTime()) {
          return { error: label + ' cannot be in the future.' };
        }
        return {};
      }

      if (!datePartsComplete(value)) {
        return field.required
          ? { error: label + ' needs a month, day, and year.' }
          : {};
      }
      var dt = toDate(value);
      if (!dt) return { error: 'That is not a real date. Please check the month and day.' };

      var now = new Date();
      if (field.notFuture !== false && dt.getTime() > now.getTime()) {
        return { error: label + ' cannot be in the future.' };
      }
      if (field.isBirthdate) {
        var age = ageOn(dt, now);
        if (age > 120) return { error: 'Please check the year. That works out to over 120 years old.' };
      }
      return {};
    }

    if (isBlank(value)) {
      return field.required ? { error: label + ' is required.' } : {};
    }

    switch (field.type) {
      case 'email':
        if (!validEmail(value)) return { error: 'Please enter a valid email address.' };
        var suggest = emailSuggestion(value);
        if (suggest) return { warning: 'Did you mean ' + suggest + '?', suggestion: suggest };
        return {};
      case 'tel':
        if (!validPhone(value)) return { error: 'Please enter a 10-digit phone number.' };
        return {};
      case 'zip':
        if (!validZip(value)) return { error: 'Please enter a 5 or 9 digit ZIP code.' };
        return {};
      case 'state':
        if (STATES.indexOf(String(value).toUpperCase()) < 0) return { error: 'Please choose a state.' };
        return {};
      case 'number':
        if (isNaN(parseFloat(value))) return { error: label + ' must be a number.' };
        return {};
      default:
        if (field.maxLength && String(value).length > field.maxLength) {
          return { error: label + ' is limited to ' + field.maxLength + ' characters.' };
        }
        return {};
    }
  }

  /* --- across fields ---------------------------------------------------- */

  var SACRAMENT_ORDER = ['baptism', 'eucharist', 'confirmation'];
  var SACRAMENT_NAMES = {
    baptism: 'Baptism', eucharist: 'First Eucharist',
    confirmation: 'Confirmation', marriage: 'Marriage',
  };

  /* `get(path)` reads a value out of the form data by dot path. `scope` is the
   * prefix for the person being checked, so this works for the head of
   * household, the spouse, and each child without knowing about any of them. */
  function checkPerson(scope, get) {
    var issues = [];
    var p = scope ? scope + '.' : '';
    var birth = toDate(get(p + 'birthdate'));

    SACRAMENT_ORDER.concat(['marriage']).forEach(function (rite) {
      if (get(p + rite + '.received') !== 'yes') return;
      var when = toDate(get(p + rite + '.date'));
      if (!when) return;
      if (birth && when.getTime() < birth.getTime()) {
        issues.push({
          path: p + rite + '.date',
          severity: 'error',
          message: SACRAMENT_NAMES[rite] + ' cannot be dated before the date of birth.',
        });
      }
    });

    // Order is the normal case, not the rule. Warn, never block.
    for (var i = 1; i < SACRAMENT_ORDER.length; i++) {
      var later = SACRAMENT_ORDER[i];
      var earlier = SACRAMENT_ORDER[i - 1];
      if (get(p + later + '.received') !== 'yes' || get(p + earlier + '.received') !== 'yes') continue;
      var a = toDate(get(p + earlier + '.date'));
      var b = toDate(get(p + later + '.date'));
      if (a && b && b.getTime() < a.getTime()) {
        issues.push({
          path: p + later + '.date',
          severity: 'warning',
          message: SACRAMENT_NAMES[later] + ' is dated before ' + SACRAMENT_NAMES[earlier]
            + '. That happens with adult converts and the Eastern Rites, so we have kept it. '
            + 'Please double-check if it was not intended.',
        });
      }
    }

    return issues;
  }

  /* An adult needs at least one way to be reached. Which fields count is passed
   * in, because the schemas name them differently per form. */
  function checkContactMethods(paths, get, message) {
    var any = paths.some(function (p) { return !isBlank(get(p)); });
    return any ? [] : [{ path: paths[0], severity: 'error', message: message }];
  }

  /* A child's stated grade should roughly track their age. Off-by-a-year is
   * ordinary, so this only speaks up when it is off by more than two. */
  function checkGradeAgainstAge(birthPath, gradePath, get) {
    var birth = toDate(get(birthPath));
    var grade = get(gradePath);
    if (!birth || isBlank(grade)) return [];
    var gradeNum = grade === 'K' || grade === 'k' ? 0 : parseInt(grade, 10);
    if (isNaN(gradeNum)) return [];
    var age = ageOn(birth, new Date());
    var expected = gradeNum + 5; // a kindergartener is about five
    if (Math.abs(age - expected) <= 2) return [];
    return [{
      path: gradePath,
      severity: 'warning',
      message: 'Grade ' + grade + ' is unusual for age ' + age + '. We have kept it, please confirm.',
    }];
  }

  global.UKCValidate = {
    STATES: STATES,
    isBlank: isBlank,
    digits: digits,
    formatPhone: formatPhone,
    validPhone: validPhone,
    validEmail: validEmail,
    emailSuggestion: emailSuggestion,
    validZip: validZip,
    toDate: toDate,
    isoDate: isoDate,
    datePartsComplete: datePartsComplete,
    datePartsAny: datePartsAny,
    approximateIso: approximateIso,
    approximateDate: approximateDate,
    ageOn: ageOn,
    checkField: checkField,
    checkPerson: checkPerson,
    checkContactMethods: checkContactMethods,
    checkGradeAgainstAge: checkGradeAgainstAge,
  };
}(typeof window !== 'undefined' ? window : globalThis));
