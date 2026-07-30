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
 * The drawn canvas is not required by either statute. It is here because it
 * costs almost nothing and it reads as a signature to a person who will never
 * hear the word "attestation."
 */
(function (global) {
  'use strict';

  var DISCLOSURE = [
    'You are agreeing to sign this form electronically instead of on paper. Your typed',
    'name, the drawn signature below, and the date and time we receive this form together',
    'make up your signature. We will email you a PDF copy for your records. If you would',
    'rather sign on paper, call the parish office at (509) 674-2531 and we will mail you a',
    'form.',
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

  /* Sizes the backing store to the device pixel ratio so the stroke isn't a
   * blurry upscale on a phone, which is where most of these get signed. */
  function fitCanvas(canvas) {
    var ratio = global.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1f2933';
  }

  function attachPad(canvas, onChange) {
    var ctx = canvas.getContext('2d');
    var drawing = false;
    var dirty = false;
    var last = null;

    function point(e) {
      var rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function start(e) {
      // Ignore right-click and stray multi-touch, and keep the page from
      // scrolling out from under the stroke on a phone.
      if (e.button > 0) return;
      e.preventDefault();
      drawing = true;
      last = point(e);
      canvas.setPointerCapture(e.pointerId);
    }

    function move(e) {
      if (!drawing) return;
      e.preventDefault();
      var p = point(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
      if (!dirty) { dirty = true; onChange(true); }
    }

    function end(e) {
      if (!drawing) return;
      drawing = false;
      // A tap with no drag still counts, otherwise a dot signature reads empty.
      if (!dirty) { dirty = true; onChange(true); }
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
    }

    canvas.addEventListener('pointerdown', start);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', end);

    return {
      isDirty: function () { return dirty; },
      clear: function () {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        dirty = false;
        onChange(false);
      },
      resize: function () {
        // Resizing clears the backing store, so preserve whatever is drawn.
        var snapshot = dirty ? canvas.toDataURL('image/png') : null;
        fitCanvas(canvas);
        if (!snapshot) return;
        var img = new Image();
        img.onload = function () {
          var rect = canvas.getBoundingClientRect();
          ctx.drawImage(img, 0, 0, rect.width, rect.height);
        };
        img.src = snapshot;
      },
      toDataURL: function () { return dirty ? canvas.toDataURL('image/png') : ''; },
    };
  }

  /* Builds the block and returns { node, read, validate }.
   *   read()     -> the values to submit
   *   validate() -> array of { path, severity, message }
   */
  function build(field, opts) {
    var idBase = opts.idBase || 'sig';
    var onDirty = opts.onDirty || function () {};

    var typed = el('input', {
      type: 'text', id: idBase + '-typed', class: 'ukcf-input',
      autocomplete: 'name', placeholder: 'Type your full legal name',
    });

    var canvas = el('canvas', { class: 'ukcf-sigpad', 'aria-label': 'Draw your signature' });
    var clearBtn = el('button', { type: 'button', class: 'ukcf-sigclear', text: 'Clear' });

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

      el('div', { class: 'ukcf-field' }, [
        el('span', { class: 'ukcf-label', text: 'Draw your signature' }),
        el('div', { class: 'ukcf-sigwrap' }, [canvas, clearBtn]),
        el('p', {
          class: 'ukcf-help',
          text: 'Use a finger, a stylus, or a mouse. Optional, but it makes the record stronger.',
        }),
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

    var pad = null;

    // The canvas has no size until it is in the document and laid out.
    function activate() {
      if (pad) { pad.resize(); return; }
      fitCanvas(canvas);
      pad = attachPad(canvas, onDirty);
      clearBtn.addEventListener('click', function () { pad.clear(); });
      global.addEventListener('resize', function () { pad.resize(); });
    }

    [typed, intent, econsent].forEach(function (input) {
      input.addEventListener('change', function () { onDirty(true); });
    });
    // change alone waits for blur, which leaves a red message sitting under a
    // name the person has already finished typing.
    typed.addEventListener('input', function () { onDirty(true); });

    function read() {
      return {
        typedName: typed.value.trim(),
        drawnSignature: pad ? pad.toDataURL() : '',
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
