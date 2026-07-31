/* The signature block.
 *
 * ESIGN and UETA ask for four things. Three of them are built here, and the
 * fourth is the Worker's:
 *
 *   Intent to sign          typed full name plus an explicit intent checkbox
 *   Consent to e-records    a separate checkbox with the disclosure inline
 *   Attribution             Worker captures UTC timestamp, IP, and user agent
 *   Retainable record       Worker returns a PDF to both parties
 *
 * There is no drawing pad. A finger scribble satisfies none of the four, and it
 * is the hardest thing on the form to do one-handed on a phone.
 */
(function (global) {
  'use strict';

  var DISCLOSURE = [
    'You are agreeing to sign this form electronically instead of on paper. Your typed name,',
    'together with the date and time we receive this form, makes up your signature. We will',
    'email you a PDF copy for your records. If you would rather sign on paper, call the parish',
    'office at (509) 674-2531 and we will mail you a form.',
  ].join(' ');

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { node.appendChild(c); });
    return node;
  }

  /* Builds the block and returns { node, read, validate }.
   *   read()     -> the values to submit
   *   validate() -> array of { path, severity, message }
   */
  function build(field, opts) {
    var idBase = opts.idBase || 'sig';
    var onDirty = opts.onDirty || function () {};

    var typed = el('input', {
      type: 'text', id: idBase + '-typed', class: 'ukcf-input ukcf-siginput',
      autocomplete: 'name', placeholder: 'Type your full legal name',
    });

    var intent = el('input', { type: 'checkbox', id: idBase + '-intent' });
    var econsent = el('input', { type: 'checkbox', id: idBase + '-econsent' });

    var node = el('fieldset', { class: 'ukcf-fieldset ukcf-signature' }, [
      el('legend', { class: 'ukcf-legend', text: field.label || 'Signature' }),

      el('div', { class: 'ukcf-consent' }, [
        el('label', { class: 'ukcf-check' }, [
          econsent,
          el('span', { text: 'I agree to sign this form electronically.' }),
        ]),
        el('p', { class: 'ukcf-help', text: DISCLOSURE }),
      ]),

      el('div', { class: 'ukcf-field' }, [
        el('label', { class: 'ukcf-label', for: idBase + '-typed', text: 'Full legal name' }),
        typed,
        el('div', { class: 'ukcf-msg', id: idBase + '-typed-msg', 'aria-live': 'polite' }),
      ]),

      el('label', { class: 'ukcf-check' }, [
        intent,
        el('span', {
          text: 'By typing my name above I intend this to be my electronic signature, and I '
            + 'certify that the information I have given is true and complete to the best of '
            + 'my knowledge.',
        }),
      ]),
      el('div', { class: 'ukcf-msg', id: idBase + '-attest-msg', 'aria-live': 'polite' }),
    ]);

    [typed, intent, econsent].forEach(function (input) {
      input.addEventListener('change', function () { onDirty(true); });
    });
    // change alone waits for blur, which leaves a red message sitting under a
    // name the person has already finished typing.
    typed.addEventListener('input', function () { onDirty(true); });

    // Kept so the engine keeps one call site for a block that may later need
    // measuring after layout.
    function activate() {}

    function read() {
      return {
        typedName: typed.value.trim(),
        intentToSign: intent.checked,
        electronicRecordsConsent: econsent.checked,
        disclosureVersion: field.disclosureVersion || '1.0',
        signedAtClient: new Date().toISOString(),
      };
    }

    function validate() {
      var issues = [];
      if (!econsent.checked) {
        issues.push({
          path: idBase + '-econsent',
          severity: 'error',
          message: 'Please agree to sign electronically, or call the office to sign on paper.',
        });
      }
      if (!typed.value.trim()) {
        issues.push({
          path: idBase + '-typed',
          severity: 'error',
          message: 'Please type your full legal name.',
        });
      } else if (typed.value.trim().split(/\s+/).length < 2) {
        issues.push({
          path: idBase + '-typed',
          severity: 'warning',
          message: 'That looks like a single name. Please use your first and last name.',
        });
      }
      if (!intent.checked) {
        issues.push({
          path: idBase + '-intent',
          severity: 'error',
          message: 'Please confirm that this is your electronic signature.',
        });
      }
      return issues;
    }

    function showIssues(issues) {
      var typedMsg = node.querySelector('#' + idBase + '-typed-msg');
      var attestMsg = node.querySelector('#' + idBase + '-attest-msg');
      typedMsg.textContent = '';
      attestMsg.textContent = '';
      typedMsg.className = 'ukcf-msg';
      attestMsg.className = 'ukcf-msg';

      issues.forEach(function (i) {
        var target = i.path === idBase + '-typed' ? typedMsg : attestMsg;
        target.textContent = i.message;
        target.className = 'ukcf-msg is-' + i.severity;
      });
      typed.setAttribute('aria-invalid', issues.some(function (i) {
        return i.path === idBase + '-typed' && i.severity === 'error';
      }) ? 'true' : 'false');
    }

    return {
      node: node,
      activate: activate,
      read: read,
      validate: validate,
      showIssues: showIssues,
    };
  }

  global.UKCSignature = { build: build, DISCLOSURE: DISCLOSURE };
}(typeof window !== 'undefined' ? window : globalThis));
