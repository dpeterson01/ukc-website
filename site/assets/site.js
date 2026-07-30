/* Behaviour for the static parish site.
 *
 * Replaces what the Claude Design React runtime used to do: the mobile nav drawer,
 * the footer signup, and the contact form's conditional fields and validation.
 * Everything degrades to readable HTML if this file fails to load.
 */
(function () {
  'use strict';

  var FORMSPREE = 'https://formspree.io/f/mjgnpjyr';
  var OFFICE_PHONE = '(509) 674-2531';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function validEmail(v) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((v || '').trim()); }

  /* ---------------------------------------------------------------- nav drawer */

  function initDrawer() {
    var toggle = $('.nav__toggle');
    var header = $('.nav');
    var links = $('.nav__links');
    if (!toggle || !header || !links) return;

    var drawer = document.createElement('div');
    drawer.className = 'nav__drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.hidden = true;

    $$('a.nav__link', links).forEach(function (a) {
      var copy = a.cloneNode(true);
      copy.className = 'nav__drawer-link' + (a.classList.contains('is-active') ? ' is-active' : '');
      drawer.appendChild(copy);
    });
    var cta = $('.nav__cta', links);
    if (cta) {
      var ctaCopy = cta.cloneNode(true);
      ctaCopy.className = 'btn btn--primary nav__drawer-cta';
      drawer.appendChild(ctaCopy);
    }
    var contact = document.createElement('div');
    contact.className = 'nav__drawer-contact';
    contact.innerHTML = '<a href="tel:+15096742531">' + OFFICE_PHONE + '</a>'
      + '<a href="mailto:parish@ukccatholic.org">parish@ukccatholic.org</a>';
    drawer.appendChild(contact);
    header.appendChild(drawer);

    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'nav-drawer');
    drawer.id = 'nav-drawer';

    function setOpen(open) {
      drawer.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
    }
    toggle.addEventListener('click', function () { setOpen(drawer.hidden); });
    drawer.addEventListener('click', function (e) { if (e.target.tagName === 'A') setOpen(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !drawer.hidden) setOpen(false); });
  }

  /* --------------------------------------------------------- preference chips */

  // The contact form's pills are inline-styled, so toggling has to restyle them.
  function pillStyle(on) {
    return 'display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:999px;'
      + 'cursor:pointer;font-family:var(--font-sans);font-size:13px;letter-spacing:0.04em;'
      + 'user-select:none;position:relative;transition:all .15s ease;'
      + (on
        ? 'border:1px solid var(--color-gold-screen);background:rgba(196,168,86,0.12);color:var(--color-navy);'
        : 'border:1px solid var(--border-default);background:transparent;color:var(--color-charcoal);');
  }
  function boxStyle(on) {
    return 'width:14px;height:14px;border-radius:3px;flex-shrink:0;display:inline-block;'
      + (on
        ? 'background:var(--color-gold-screen);border:1.5px solid var(--color-gold-screen);'
        : 'background:transparent;border:1.5px solid var(--border-default);');
  }

  function syncChip(label) {
    var input = $('input[type="checkbox"]', label);
    if (!input) return;
    var on = input.checked;
    if (label.classList.contains('chip')) {
      label.classList.toggle('is-on', on);
    } else {
      label.setAttribute('style', pillStyle(on));
      var box = label.querySelector('span');
      if (box) box.setAttribute('style', boxStyle(on));
    }
  }

  function initChips(root) {
    $$('label.chip, label[style*="border-radius:999px"]', root).forEach(function (label) {
      var input = $('input[type="checkbox"]', label);
      if (!input || input.dataset.chipBound) return;
      input.dataset.chipBound = '1';
      syncChip(label);
      input.addEventListener('change', function () { syncChip(label); });
    });
  }

  /* --------------------------------------------------------------- form fields */

  var PARISH_LABELS = {
    sjb: 'St. John the Baptist (Cle Elum)',
    ic: 'Immaculate Conception (Roslyn)',
    unsure: 'Not sure yet',
  };
  var SACRAMENT_LABELS = {
    baptism: 'Baptism', 'first-communion': 'First Communion', confirmation: 'Confirmation',
    marriage: 'Marriage', funeral: 'Funeral', anointing: 'Anointing of the Sick',
  };
  var REASON_LABELS = {
    hello: 'Just saying hello', register: 'Register as a parishioner',
    prayer: 'Prayer request', sacrament: 'Planning a sacrament', other: 'Something else',
  };
  var SUBJECT_LABELS = {
    hello: 'Just Saying Hello', register: 'Register as a Parishioner',
    prayer: 'Prayer Request', sacrament: 'Planning a Sacrament', other: 'Something Else',
  };
  var PLACEHOLDERS = {
    register: 'Tell us a bit about your family, how you found us, or any questions…',
    prayer: 'Share your intention. All requests are kept confidential.',
  };
  var DEFAULT_PLACEHOLDER = 'Registering, planning a sacrament, a prayer request, or just saying hello…';

  function chipMarkup(name, label) {
    return '<label style="' + pillStyle(false) + '">'
      + '<input name="' + name + '" type="checkbox" style="position:absolute;opacity:0;width:0;height:0">'
      + '<span style="' + boxStyle(false) + '"></span><span>' + label + '</span></label>';
  }

  var CONDITIONAL_GROUPS = {
    register:
      '<div class="form__field">'
      + '<label class="form__label" for="cf-parish">Which parish?</label>'
      + '<select class="form__input" id="cf-parish" name="parish">'
      + '<option value="">Choose a parish…</option>'
      + '<option value="sjb">St. John the Baptist (Cle Elum)</option>'
      + '<option value="ic">Immaculate Conception (Roslyn)</option>'
      + '<option value="unsure">Not sure yet</option>'
      + '</select></div>'
      + '<div class="contact-form-grid">'
      + '<div class="form__field"><label class="form__label" for="cf-phone">Phone number</label>'
      + '<input class="form__input" id="cf-phone" name="phone" type="text" placeholder="(509) 555-0123"></div>'
      + '<div class="form__field"><label class="form__label" for="cf-heard-about">How did you hear about us?</label>'
      + '<input class="form__input" id="cf-heard-about" name="heard_about_us" type="text" placeholder="A friend, online search, visiting Mass…"></div>'
      + '</div>'
      + '<div class="form__field"><span class="form__label">While you\'re here, want emails too?</span>'
      + '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">'
      + chipMarkup('weekly_bulletin', 'Weekly bulletin')
      + chipMarkup('quarterly_newsletter', 'Quarterly newsletter')
      + chipMarkup('holy_day_reminders', 'Holy-day reminders')
      + '</div></div>',
    prayer:
      '<div class="contact-form-grid">'
      + '<div class="form__field"><label class="form__label" for="cf-prayer-for">Name of person needing prayer</label>'
      + '<input class="form__input" id="cf-prayer-for" name="person_needing_prayer" type="text" placeholder="Name or initials"></div>'
      + '<div class="form__field"><label class="form__label" for="cf-requester-contact">Requester\'s contact info</label>'
      + '<input class="form__input" id="cf-requester-contact" name="requester_contact" type="text" placeholder="Email or phone for follow-up"></div>'
      + '</div>'
      + '<p class="form__help" style="margin-top:-4px">Your request is kept confidential and shared only with Father and the parish office.</p>',
    sacrament:
      '<div class="contact-form-grid">'
      + '<div class="form__field"><label class="form__label" for="cf-sacrament">Sacrament type</label>'
      + '<select class="form__input" id="cf-sacrament" name="sacrament_type">'
      + '<option value="">Choose a sacrament…</option>'
      + '<option value="baptism">Baptism</option>'
      + '<option value="first-communion">First Communion</option>'
      + '<option value="confirmation">Confirmation</option>'
      + '<option value="marriage">Marriage</option>'
      + '<option value="funeral">Funeral</option>'
      + '<option value="anointing">Anointing of the Sick</option>'
      + '</select></div>'
      + '<div class="form__field"><label class="form__label" for="cf-timeframe">Preferred date or timeframe</label>'
      + '<input class="form__input" id="cf-timeframe" name="preferred_timeframe" type="text" placeholder="A date, month, or general timeframe"></div>'
      + '</div>',
  };

  function setError(input, on) {
    if (!input) return;
    input.setAttribute('aria-invalid', on ? 'true' : 'false');
    // The footer signup input has no .form__field wrapper, so fall back to the
    // form itself, which puts the message below the input row.
    var field = input.closest('.form__field') || input.closest('form');
    if (!field) return;
    var msg = $('.form__error', field);
    if (on && !msg) {
      msg = document.createElement('p');
      msg.className = 'form__error';
      msg.id = input.id + '-error';
      msg.textContent = input.type === 'email'
        ? 'Please enter a valid email address.'
        : 'This field is required.';
      field.appendChild(msg);
    } else if (!on && msg) {
      msg.remove();
    }
  }

  function successMessage(reason, name) {
    var first = (name || '').trim().split(' ')[0] || 'friend';
    if (reason === 'register') {
      return 'Thank you, ' + first + '. We have your details, and someone from the parish '
        + 'office will reach out soon about getting you registered.';
    }
    if (reason === 'prayer') {
      return 'Thank you. Your intention has been received and will be held in prayer, in confidence.';
    }
    return 'Thank you, ' + first + '. Your message is on its way to the parish office. '
      + "We'll reply during office hours; for anything urgent, please call " + OFFICE_PHONE + '.';
  }

  function initContactForm(form) {
    var reasonSelect = $('#cf-reason', form);
    var subjectInput = $('input[name="_subject"]', form);
    var message = $('#cf-message', form);
    var tried = false;

    // A locked form (the Register block on the New Here? page) has no selector and
    // ships its conditional fields already rendered.
    function currentReason() {
      if (reasonSelect) return reasonSelect.value;
      return form.dataset.reason || 'hello';
    }

    var slot = null;
    if (reasonSelect) {
      slot = document.createElement('div');
      slot.className = 'form__conditional';
      var field = reasonSelect.closest('.form__field');
      field.parentNode.insertBefore(slot, field.nextSibling);

      var applyReason = function () {
        var reason = currentReason();
        slot.innerHTML = CONDITIONAL_GROUPS[reason] || '';
        initChips(slot);
        if (message) message.placeholder = PLACEHOLDERS[reason] || DEFAULT_PLACEHOLDER;
      };
      reasonSelect.addEventListener('change', applyReason);
      applyReason();
    }

    initChips(form);

    function validate() {
      var checks = [
        [$('#cf-name', form), function (v) { return !!v.trim(); }],
        [$('#cf-email', form), validEmail],
        [message, function (v) { return !!v.trim(); }],
      ];
      var firstBad = null;
      checks.forEach(function (pair) {
        var input = pair[0];
        if (!input) return;
        var ok = pair[1](input.value);
        setError(input, !ok);
        if (!ok && !firstBad) firstBad = input;
      });
      return firstBad;
    }

    form.addEventListener('input', function (e) {
      if (!tried) return;
      if (e.target.id === 'cf-email') setError(e.target, !validEmail(e.target.value));
      else if (e.target.id === 'cf-name' || e.target.id === 'cf-message') setError(e.target, !e.target.value.trim());
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      tried = true;
      var firstBad = validate();
      if (firstBad) { firstBad.focus(); return; }

      var reason = currentReason();
      var name = $('#cf-name', form).value.trim();
      var body = {
        _subject: 'New contact: ' + (SUBJECT_LABELS[reason] || SUBJECT_LABELS.hello) + ' from ' + name,
        name: name,
        email: $('#cf-email', form).value.trim(),
        reason: REASON_LABELS[reason] || REASON_LABELS.hello,
        message: message.value.trim(),
      };

      if (reason === 'register') {
        var parish = $('#cf-parish', form);
        body.parish = parish ? (PARISH_LABELS[parish.value] || '') : '';
        body.phone = ($('#cf-phone', form) || {}).value || '';
        body.heard_about_us = ($('#cf-heard-about', form) || {}).value || '';
        body.newsletter_preferences = $$('input[type="checkbox"]:checked', form)
          .map(function (c) {
            var span = c.parentNode.querySelectorAll('span')[1];
            return span ? span.textContent : c.name;
          }).join(', ');
      } else if (reason === 'prayer') {
        body.person_needing_prayer = ($('#cf-prayer-for', form) || {}).value || '';
        body.requester_contact = ($('#cf-requester-contact', form) || {}).value || '';
        body.confidentiality = 'Shared only with Father and the parish office';
      } else if (reason === 'sacrament') {
        var sac = $('#cf-sacrament', form);
        body.sacrament_type = sac ? (SACRAMENT_LABELS[sac.value] || '') : '';
        body.preferred_timeframe = ($('#cf-timeframe', form) || {}).value || '';
      }
      if (subjectInput) subjectInput.value = body._subject;

      var submitBtn = $('button[type="submit"]', form);
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending…'; }

      fetch(FORMSPREE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      }).then(function (res) {
        if (!res.ok) throw new Error('Formspree responded ' + res.status);
        var note = document.createElement('div');
        note.className = 'form__success';
        note.setAttribute('role', 'status');
        note.textContent = successMessage(reason, name);
        form.replaceWith(note);
      }).catch(function () {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send message'; }
        var err = $('.form__send-error', form) || document.createElement('p');
        err.className = 'form__error form__send-error';
        err.setAttribute('role', 'alert');
        err.textContent = 'That did not go through. Please try again, or call the parish office at '
          + OFFICE_PHONE + '.';
        form.appendChild(err);
      });
    });
  }

  /* ------------------------------------------------------------ footer signup */

  function initSignup(form) {
    initChips(form);
    var email = $('.footer__signup-input', form);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validEmail(email.value)) {
        setError(email, true);
        email.focus();
        return;
      }
      setError(email, false);

      var prefs = $$('.chip', form).filter(function (c) {
        var input = $('input[type="checkbox"]', c);
        return input && input.checked;
      }).map(function (c) { return $('span', c).textContent.trim(); });

      var btn = $('.footer__signup-btn', form);
      if (btn) { btn.disabled = true; btn.textContent = 'Signing up…'; }

      fetch(FORMSPREE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          _subject: 'Email signup: ' + email.value.trim(),
          email: email.value.trim(),
          reason: 'Email list signup',
          subscriptions: prefs.join(', ') || 'None selected',
        }),
      }).then(function (res) {
        if (!res.ok) throw new Error('Formspree responded ' + res.status);
        var note = document.createElement('p');
        note.className = 'footer__signup-thanks';
        note.setAttribute('role', 'status');
        note.textContent = "You're on the list. Watch your inbox Sunday morning.";
        form.replaceWith(note);
      }).catch(function () {
        if (btn) { btn.disabled = false; btn.textContent = 'Sign me up'; }
        setError(email, true);
      });
    });
  }

  /* -------------------------------------------------------------------- start */

  function init() {
    initDrawer();
    $$('form.form').forEach(initContactForm);
    $$('form.footer__signup-form').forEach(initSignup);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
