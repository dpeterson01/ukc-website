/* Behaviour for the static parish site.
 *
 * Replaces what the Claude Design React runtime used to do: the mobile nav drawer,
 * the footer signup, and the contact form's conditional fields and validation.
 * Everything degrades to readable HTML if this file fails to load.
 */
(function () {
  'use strict';

  var CONTACT_ENDPOINT = 'https://forms.ukccatholic.org/contact';
  var OFFICE_PHONE = '(509) 674-2531';
  // Both forms report how long the person took, so the server can apply the
  // same too-fast check the form engine uses.
  var LOADED_AT = Date.now();

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function validEmail(v) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((v || '').trim()); }

  var I18N = window.UKC_I18N;
  if (!I18N) throw new Error('strings.js must load before site.js');
  function t(key, vars) { return I18N.t(key, vars); }
  function esc(value) { return I18N.esc(value); }

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
    var lang = $('.utility-bar__lang');
    if (lang) contact.appendChild(lang.cloneNode(true));
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

  /* Submission labels. These are what the parish office reads in the email, so they
     stay English no matter which language the form was filled in. */
  var SACRAMENT_LABELS = {
    baptism: 'Baptism', 'first-communion': 'First Communion', confirmation: 'Confirmation',
    marriage: 'Marriage', funeral: 'Funeral', anointing: 'Anointing of the Sick',
  };
  var REASON_LABELS = {
    hello: 'Just saying hello',
    prayer: 'Prayer request', sacrament: 'Planning a sacrament', other: 'Something else',
  };
  var SUBJECT_LABELS = {
    hello: 'Just Saying Hello',
    prayer: 'Prayer Request', sacrament: 'Planning a Sacrament', other: 'Something Else',
  };

  function placeholderFor(reason) {
    if (reason === 'prayer') return t('message.placeholder.prayer');
    return t('message.placeholder.default');
  }

  /* Reads the English label a chip was built with, falling back to its visible
     text for the footer chips that ship in the HTML. */
  function chipValue(label) {
    var en = label.getAttribute('data-en');
    if (en) return en;
    var spans = label.querySelectorAll('span');
    var span = spans[spans.length - 1];
    return span ? span.textContent.trim() : '';
  }

  /* Option `value`s stay fixed in every language. They are the keys the submission
     maps back to English with, so only the visible text changes. */
  function conditionalGroup(reason) {
    if (reason === 'prayer') {
      return '<div class="contact-form-grid">'
        + '<div class="form__field"><label class="form__label" for="cf-prayer-for">' + esc(t('contact.prayerFor.label')) + '</label>'
        + '<input class="form__input" id="cf-prayer-for" name="person_needing_prayer" type="text" placeholder="' + esc(t('contact.prayerFor.placeholder')) + '"></div>'
        + '<div class="form__field"><label class="form__label" for="cf-requester-contact">' + esc(t('contact.requester.label')) + '</label>'
        + '<input class="form__input" id="cf-requester-contact" name="requester_contact" type="text" placeholder="' + esc(t('contact.requester.placeholder')) + '"></div>'
        + '</div>'
        + '<p class="form__help" style="margin-top:-4px">' + esc(t('contact.prayer.note')) + '</p>';
    }
    if (reason === 'sacrament') {
      return '<div class="contact-form-grid">'
        + '<div class="form__field"><label class="form__label" for="cf-sacrament">' + esc(t('contact.sacrament.label')) + '</label>'
        + '<select class="form__input" id="cf-sacrament" name="sacrament_type">'
        + '<option value="">' + esc(t('contact.sacrament.choose')) + '</option>'
        + '<option value="baptism">' + esc(t('contact.sacrament.baptism')) + '</option>'
        + '<option value="first-communion">' + esc(t('contact.sacrament.firstCommunion')) + '</option>'
        + '<option value="confirmation">' + esc(t('contact.sacrament.confirmation')) + '</option>'
        + '<option value="marriage">' + esc(t('contact.sacrament.marriage')) + '</option>'
        + '<option value="funeral">' + esc(t('contact.sacrament.funeral')) + '</option>'
        + '<option value="anointing">' + esc(t('contact.sacrament.anointing')) + '</option>'
        + '</select></div>'
        + '<div class="form__field"><label class="form__label" for="cf-timeframe">' + esc(t('contact.timeframe.label')) + '</label>'
        + '<input class="form__input" id="cf-timeframe" name="preferred_timeframe" type="text" placeholder="' + esc(t('contact.timeframe.placeholder')) + '"></div>'
        + '</div>';
    }
    return '';
  }

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
      msg.textContent = input.type === 'email' ? t('error.email') : t('error.required');
      field.appendChild(msg);
    } else if (!on && msg) {
      msg.remove();
    }
  }

  function successMessage(reason, name) {
    var first = (name || '').trim().split(' ')[0] || t('success.friend');
    if (reason === 'prayer') return t('success.prayer');
    return t('success.default', { name: first, phone: OFFICE_PHONE });
  }

  // A field no person sees and no person fills in. The value rides along in the
  // payload so the parish endpoint can reject it too, since a script posting
  // straight there never runs any of this.
  // Added from JS so all 37 forms stay in sync without a build step.
  function addHoneypot(form) {
    var hp = document.createElement('input');
    hp.type = 'text';
    hp.name = 'website';
    hp.tabIndex = -1;
    hp.autocomplete = 'off';
    hp.setAttribute('aria-hidden', 'true');
    hp.setAttribute(
      'style',
      'position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;'
    );
    form.appendChild(hp);
    return hp;
  }

  function initContactForm(form) {
    var reasonSelect = $('#cf-reason', form);
    var subjectInput = $('input[name="_subject"], input[name="subject"]', form);
    var message = $('#cf-message', form);
    var honeypot = addHoneypot(form);
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
        slot.innerHTML = conditionalGroup(reason);
        initChips(slot);
        if (message) message.placeholder = placeholderFor(reason);
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
      var fields = {
        Name: name,
        Email: $('#cf-email', form).value.trim(),
        Reason: REASON_LABELS[reason] || REASON_LABELS.hello,
        Message: message.value.trim(),
      };
      var body = {
        kind: 'contact',
        subject: 'New contact: ' + (SUBJECT_LABELS[reason] || SUBJECT_LABELS.hello) + ' from ' + name,
        website: honeypot.value,
        elapsedMs: Date.now() - LOADED_AT,
        fields: fields,
      };

      if (reason === 'prayer') {
        fields['Person needing prayer'] = ($('#cf-prayer-for', form) || {}).value || '';
        fields['Requester contact'] = ($('#cf-requester-contact', form) || {}).value || '';
        fields.Confidentiality = 'Shared only with Father and the parish office';
      } else if (reason === 'sacrament') {
        var sac = $('#cf-sacrament', form);
        fields.Sacrament = sac ? (SACRAMENT_LABELS[sac.value] || '') : '';
        fields['Preferred timeframe'] = ($('#cf-timeframe', form) || {}).value || '';
      }
      if (subjectInput) subjectInput.value = body.subject;

      var submitBtn = $('button[type="submit"]', form);
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = t('btn.sending'); }

      fetch(CONTACT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      }).then(function (res) {
        if (!res.ok) throw new Error('The server responded ' + res.status);
        var note = document.createElement('div');
        note.className = 'form__success';
        note.setAttribute('role', 'status');
        note.textContent = successMessage(reason, name);
        form.replaceWith(note);
      }).catch(function () {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = t('btn.send'); }
        var err = $('.form__send-error', form) || document.createElement('p');
        err.className = 'form__error form__send-error';
        err.setAttribute('role', 'alert');
        err.textContent = t('error.send', { phone: OFFICE_PHONE });
        form.appendChild(err);
      });
    });
  }

  /* ------------------------------------------------------------ footer signup */

  /* The signup holds its own parish wording rather than borrowing the contact
     form's, so the two can change independently. `en` is what the office and the
     mailing list read, whatever language the page was in. */
  var SIGNUP_PARISHES = [
    { value: 'both', key: 'signup.parish.both', en: 'Both parishes' },
    { value: 'sjb', key: 'signup.parish.sjb', en: 'St. John the Baptist (Cle Elum)' },
    { value: 'ic', key: 'signup.parish.ic', en: 'Immaculate Conception (Roslyn)' },
  ];

  function parishLabel(value) {
    for (var i = 0; i < SIGNUP_PARISHES.length; i++) {
      if (SIGNUP_PARISHES[i].value === value) return SIGNUP_PARISHES[i].en;
    }
    return '';
  }

  /* Someone signing up from a parish page almost always means that parish, so the
     page picks the default and the control never has to be touched. */
  function defaultParish() {
    var match = /\/(sjb|ic)(?:-history)?\//.exec(location.pathname);
    return match ? match[1] : 'both';
  }

  /* Injected for the same reason as the honeypot: the footer is copied into every
     page in both languages, and building it here keeps the copies from drifting.
     One line of small print under the button rather than a row of chips above it,
     because the default is already right for nearly everyone. */
  function addParishChoice(form) {
    var line = document.createElement('label');
    line.className = 'footer__signup-parish';
    var current = defaultParish();
    line.innerHTML = esc(t('signup.parish.label')) + ': '
      + '<select name="parish">'
      + SIGNUP_PARISHES.map(function (p) {
        return '<option value="' + p.value + '"'
          + (p.value === current ? ' selected' : '') + '>'
          + esc(t(p.key)) + '</option>';
      }).join('')
      + '</select>';
    form.appendChild(line);
    return line;
  }

  function initSignup(form) {
    addParishChoice(form);
    initChips(form);
    var email = $('.footer__signup-input', form);
    var honeypot = addHoneypot(form);

    // The label is also baked into every static footer. Taking it from
    // strings.js means a failed send cannot reset the button to different
    // wording than the page shipped with.
    var signUpBtn = $('.footer__signup-btn', form);
    if (signUpBtn) signUpBtn.textContent = t('btn.signUp');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var stale = $('.form__send-error', form);
      if (stale) stale.remove();
      if (!validEmail(email.value)) {
        setError(email, true);
        email.focus();
        return;
      }
      setError(email, false);

      var parish = $('select[name="parish"]', form);

      var prefs = $$('.chip', form).filter(function (c) {
        var input = $('input[type="checkbox"]', c);
        return input && input.checked;
      }).map(chipValue);

      var btn = $('.footer__signup-btn', form);
      if (btn) { btn.disabled = true; btn.textContent = t('btn.signingUp'); }

      fetch(CONTACT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          kind: 'signup',
          subject: 'Email signup: ' + email.value.trim(),
          website: honeypot.value,
          elapsedMs: Date.now() - LOADED_AT,
          fields: {
            Email: email.value.trim(),
            Parish: parish ? parishLabel(parish.value) : '',
            Subscriptions: prefs.join(', ') || 'None selected',
          },
        }),
      }).then(function (res) {
        if (!res.ok) throw new Error('The server responded ' + res.status);
        var note = document.createElement('p');
        note.className = 'footer__signup-thanks';
        note.setAttribute('role', 'status');
        note.textContent = t('signup.thanks');
        form.replaceWith(note);
      }).catch(function () {
        if (btn) { btn.disabled = false; btn.textContent = t('btn.signUp'); }
        // Not an invalid address, so say what actually went wrong.
        setError(email, false);
        var err = document.createElement('p');
        err.className = 'form__error form__send-error';
        err.setAttribute('role', 'alert');
        err.textContent = t('error.send', { phone: OFFICE_PHONE });
        form.appendChild(err);
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
