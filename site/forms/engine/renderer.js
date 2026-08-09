/* The forms engine: one schema, one form.
 *
 * A schema is a list of steps. A step is a list of fields. A field is either a
 * primitive input, a reference to a shared block, or a repeatable block. That
 * is the whole model, and it is what lets four paper forms share one build.
 *
 * Two rules shape the rest of the file:
 *
 *   Nothing is asked until it is known to be relevant. Fields carry `showIf`,
 *   and hidden fields never validate and never submit.
 *
 *   Typing is never interrupted. Visibility changes toggle `hidden` on nodes
 *   that already exist rather than re-rendering, so focus and caret position
 *   survive every keystroke.
 */
(function (global) {
  'use strict';

  /* Set when an engine is constructed. Nested closures reach the engine's words
   * through T() rather than `this`, which is not the engine inside most of them. */
  var activeT = null;
  function T(key, vars) {
    if (!activeT) activeT = new global.UKCFormsI18n.Translator('en', null);
    return activeT.t(key, vars);
  }

  var V = global.UKCValidate;

  /* --- small helpers ---------------------------------------------------- */

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function getPath(obj, path) {
    if (!path) return obj;
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || typeof cur !== 'object') return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function setPath(obj, path, value) {
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var key = parts[i];
      var nextIsIndex = /^\d+$/.test(parts[i + 1]);
      if (cur[key] === null || typeof cur[key] !== 'object') cur[key] = nextIsIndex ? [] : {};
      cur = cur[key];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function join(scope, id) {
    if (!id) return scope;
    return scope ? scope + '.' + id : id;
  }

  function domId(path) {
    return 'f-' + String(path).replace(/[^a-zA-Z0-9]+/g, '-');
  }

  /* Labels may interpolate block options, so one `address` block can say
   * "Same as mailing address" in one place and "Same as home address" in
   * another without duplicating the block. */
  function interpolate(text, options) {
    if (!text || text.indexOf('{{') < 0) return text;
    return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, function (m, key) {
      var v = (options || {})[key];
      return v === undefined || v === null ? '' : String(v);
    });
  }

  /* --- conditions -------------------------------------------------------- */

  /* Paths in `showIf` are relative to the enclosing scope, so a block can
   * reference its own siblings wherever it is mounted. A leading "/" escapes
   * to the top of the form. */
  function resolveRef(ref, scope) {
    if (ref.charAt(0) === '/') return ref.slice(1);
    return join(scope, ref);
  }

  function testCondition(cond, data, scope) {
    if (!cond) return true;
    if (Array.isArray(cond.all)) {
      return cond.all.every(function (c) { return testCondition(c, data, scope); });
    }
    if (Array.isArray(cond.any)) {
      return cond.any.some(function (c) { return testCondition(c, data, scope); });
    }
    if (cond.not) return !testCondition(cond.not, data, scope);

    var value = getPath(data, resolveRef(cond.field, scope));
    if ('equals' in cond) return value === cond.equals;
    if ('notEquals' in cond) return value !== cond.notEquals;
    if ('in' in cond) return cond.in.indexOf(value) >= 0;
    if ('notIn' in cond) return cond.notIn.indexOf(value) < 0;
    if ('isBlank' in cond) return V.isBlank(value) === cond.isBlank;
    return !V.isBlank(value);
  }

  /* --- block expansion ---------------------------------------------------- */

  /* Turns a `{ type: "block" }` reference into the concrete field list it
   * stands for, recursively, applying the block's include/exclude options and
   * interpolating labels. Returns plain field definitions the renderer already
   * knows how to draw. */
  function expandBlock(ref, blocks, inheritedOptions) {
    var def = blocks[ref.block];
    if (!def) throw new Error('Unknown block: ' + ref.block);
    var options = Object.assign({}, def.defaults || {}, inheritedOptions || {}, ref.options || {});

    return (def.fields || []).filter(function (f) {
      if (f.includeIf && !options[f.includeIf]) return false;
      if (f.excludeIf && options[f.excludeIf]) return false;
      return true;
    }).map(function (f) {
      var copy = Object.assign({}, f);
      copy.label = interpolate(copy.label, options);
      copy.help = interpolate(copy.help, options);
      copy.legend = interpolate(copy.legend, options);
      if (copy.type === 'block') {
        copy = Object.assign({}, copy, { options: Object.assign({}, options, copy.options || {}) });
      }
      return copy;
    });
  }

  /* --- the engine --------------------------------------------------------- */

  function Engine(mount, schema, blocks, config) {
    this.mount = mount;
    this.schema = schema;
    this.blocks = blocks;
    this.config = config || {};
    this.t = this.config.t || new global.UKCFormsI18n.Translator('en', null);
    // Half the places that need a word are inside nested closures where `this`
    // is not the engine. One form renders per page, so a module-scoped handle
    // is simpler than threading `self` through every one of them.
    activeT = this.t;
    this.data = {};
    this.registry = [];      // every rendered field, for visibility and validation
    this.repeats = [];       // repeat controllers, so add/remove can rebuild
    this.signatures = [];
    this.stepNodes = [];
    this.current = 0;
    this.startedAt = Date.now();
    this.storageKey = 'ukcf:' + schema.formId + ':v' + (schema.version || '1');
    this.submitting = false;
  }

  Engine.prototype.render = function () {
    var self = this;
    this.mount.innerHTML = '';
    this.mount.classList.add('ukcf');

    this.restore();

    this.progress = el('div', { class: 'ukcf-progress' }, [
      el('p', { class: 'ukcf-progress-text', 'aria-live': 'polite' }),
      el('div', { class: 'ukcf-progress-bar' }, [el('span', { class: 'ukcf-progress-fill' })]),
    ]);
    this.mount.appendChild(this.progress);

    this.resumeNote = el('div', { class: 'ukcf-resume', hidden: 'hidden' });
    this.mount.appendChild(this.resumeNote);

    this.form = el('form', { class: 'ukcf-form', novalidate: 'novalidate' });
    this.mount.appendChild(this.form);

    // Bots fill everything they find. A human never sees this.
    this.honeypot = el('input', {
      type: 'text', name: 'website', class: 'ukcf-hp',
      tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true',
    });
    this.form.appendChild(el('div', { class: 'ukcf-hp-wrap', 'aria-hidden': 'true' }, [this.honeypot]));

    this.schema.steps.forEach(function (step, i) {
      var node = el('section', {
        class: 'ukcf-step', id: 'step-' + step.id,
        role: 'group', 'aria-labelledby': 'step-' + step.id + '-h', hidden: 'hidden',
      }, [
        el('h2', { class: 'ukcf-step-title', id: 'step-' + step.id + '-h', text: step.title }),
        step.help ? el('p', { class: 'ukcf-step-help', text: step.help }) : null,
      ]);
      var body = el('div', { class: 'ukcf-step-body' });
      node.appendChild(body);
      self.renderFields(step.fields || [], body, '', step);
      self.form.appendChild(node);
      self.stepNodes.push({ step: step, node: node, index: i });
    });

    this.errorSummary = el('div', {
      class: 'ukcf-summary', role: 'alert', tabindex: '-1', hidden: 'hidden',
    });
    this.form.appendChild(this.errorSummary);

    this.backBtn = el('button', { type: 'button', class: 'ukcf-btn ukcf-btn--ghost', text: 'Back' });
    this.nextBtn = el('button', { type: 'button', class: 'ukcf-btn ukcf-btn--primary', text: T('btn.continue') });
    this.form.appendChild(el('div', { class: 'ukcf-actions' }, [this.backBtn, this.nextBtn]));

    this.statusNode = el('p', { class: 'ukcf-status', 'aria-live': 'polite' });
    this.form.appendChild(this.statusNode);

    this.backBtn.addEventListener('click', function () { self.goBack(); });
    this.nextBtn.addEventListener('click', function () { self.goNext(); });
    this.form.addEventListener('submit', function (e) { e.preventDefault(); self.goNext(); });

    // Enter should advance, not submit a half-filled form from a text input.
    this.form.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') {
        e.preventDefault();
        self.goNext();
      }
    });

    this.refreshVisibility();
    this.showStep(0);
    return this;
  };

  /* --- field rendering ---------------------------------------------------- */

  Engine.prototype.renderFields = function (fields, container, scope, step) {
    var self = this;
    fields.forEach(function (field) { self.renderField(field, container, scope, step); });
  };

  Engine.prototype.renderField = function (field, container, scope, step) {
    var self = this;

    if (field.type === 'block') {
      var inner = expandBlock(field, this.blocks, field.options);
      var blockScope = join(scope, field.id);
      // An unlabelled block is a composition detail, not a section a person
      // should see a box drawn around.
      var wrap = field.label
        ? el('fieldset', { class: 'ukcf-fieldset' }, [
          el('legend', { class: 'ukcf-legend', text: field.label }),
          field.help ? el('p', { class: 'ukcf-help', text: field.help }) : null,
        ])
        : el('div', { class: 'ukcf-blockgroup' }, [
          field.help ? el('p', { class: 'ukcf-help', text: field.help }) : null,
        ]);
      var body = el('div', { class: 'ukcf-grid' });
      wrap.appendChild(body);
      this.renderFields(inner, body, blockScope, step);
      container.appendChild(wrap);
      this.registry.push({ kind: 'group', node: wrap, field: field, scope: scope, step: step });
      return;
    }

    if (field.type === 'repeat') {
      this.renderRepeat(field, container, scope, step);
      return;
    }

    if (field.type === 'signature') {
      var sig = global.UKCSignature.build(field, {
        idBase: domId(join(scope, field.id || 'signature')),
        onDirty: function () { self.touch(); },
      });
      container.appendChild(sig.node);
      sig.path = join(scope, field.id || 'signature');
      this.signatures.push(sig);
      this.registry.push({ kind: 'signature', node: sig.node, field: field, scope: scope, step: step, sig: sig });
      return;
    }

    if (field.type === 'static') {
      var statik = el('div', { class: 'ukcf-static' }, [
        field.label ? el('h3', { class: 'ukcf-static-title', text: field.label }) : null,
        el('div', { class: 'ukcf-static-body', html: field.html || '' }),
      ]);
      container.appendChild(statik);
      this.registry.push({ kind: 'static', node: statik, field: field, scope: scope, step: step });
      return;
    }

    if (field.type === 'review') {
      var review = el('div', { class: 'ukcf-review' });
      container.appendChild(review);
      this.registry.push({ kind: 'review', node: review, field: field, scope: scope, step: step });
      this.reviewNode = review;
      return;
    }

    // primitive input
    var path = join(scope, field.id);
    var entry = this.buildInput(field, path, scope, step);
    container.appendChild(entry.node);
    this.registry.push(entry);
  };

  Engine.prototype.buildInput = function (field, path, scope, step) {
    var self = this;
    var id = domId(path);
    var msg = el('div', { class: 'ukcf-msg', id: id + '-msg', 'aria-live': 'polite' });
    var control;
    var widthClass = 'ukcf-field--' + (field.width || 'full');

    function commit(value) {
      setPath(self.data, path, value);
      self.clearIssueIfFixed(path);
      self.touch();
    }

    // Defaults only seed an empty slot, so a restored draft always wins.
    if (field.default !== undefined && getPath(this.data, path) === undefined) {
      setPath(this.data, path, field.default);
    }

    if (field.type === 'select' || field.type === 'state') {
      var opts = field.type === 'state'
        ? V.STATES.map(function (s) { return { value: s, label: s }; })
        : (field.options || []);
      control = el('select', { id: id, class: 'ukcf-input' });
      control.appendChild(el('option', { value: '', text: field.placeholder || T('choose.one') }));
      opts.forEach(function (o) {
        control.appendChild(el('option', { value: o.value, text: o.label }));
      });
      control.addEventListener('change', function () { commit(control.value); });

    } else if (field.type === 'radio') {
      control = el('div', { class: 'ukcf-choices', role: 'radiogroup', 'aria-labelledby': id + '-l' });
      (field.options || []).forEach(function (o, i) {
        var input = el('input', { type: 'radio', name: id, value: o.value, id: id + '-' + i });
        input.addEventListener('change', function () { if (input.checked) commit(o.value); });
        control.appendChild(el('label', { class: 'ukcf-choice' }, [
          input,
          el('span', { text: o.label }),
          o.help ? el('small', { text: o.help }) : null,
        ]));
      });

    } else if (field.type === 'checkbox') {
      var box = el('input', { type: 'checkbox', id: id });
      box.addEventListener('change', function () { commit(box.checked); });
      control = el('label', { class: 'ukcf-check' }, [box, el('span', { text: field.label })]);

    } else if (field.type === 'checkboxes') {
      control = el('div', { class: 'ukcf-choices', role: 'group', 'aria-labelledby': id + '-l' });
      (field.options || []).forEach(function (o, i) {
        var input = el('input', { type: 'checkbox', value: o.value, id: id + '-' + i });
        input.addEventListener('change', function () {
          var chosen = Array.prototype.slice.call(control.querySelectorAll('input:checked'))
            .map(function (c) { return c.value; });
          commit(chosen);
        });
        control.appendChild(el('label', { class: 'ukcf-choice' }, [input, el('span', { text: o.label })]));
      });

    } else if (field.type === 'textarea') {
      control = el('textarea', {
        id: id, class: 'ukcf-input ukcf-textarea', rows: field.rows || 4,
        placeholder: field.placeholder || null,
      });
      control.addEventListener('input', function () { commit(control.value); });

    } else if (field.type === 'date') {
      control = el('div', { class: 'ukcf-date', role: 'group', 'aria-labelledby': id + '-l' });
      var parts = {};
      // An approximate date needs only the year, so the other two say so rather
      // than leaving someone guessing whether they can be left empty.
      var loose = field.approximate === true;
      [
        { key: 'month', label: T(loose ? 'date.monthOptional' : 'date.month'), max: 2, ph: 'MM' },
        { key: 'day', label: T(loose ? 'date.dayOptional' : 'date.day'), max: 2, ph: 'DD' },
        { key: 'year', label: T('date.year'), max: 4, ph: 'YYYY' },
      ].forEach(function (p) {
        var input = el('input', {
          type: 'text', inputmode: 'numeric', class: 'ukcf-input ukcf-date-part',
          id: id + '-' + p.key, placeholder: p.ph, maxlength: String(p.max),
          'aria-label': p.label, autocomplete: 'off',
        });
        input.addEventListener('input', function () {
          input.value = input.value.replace(/\D/g, '').slice(0, p.max);
          // Jump to the next box when this one is full, so the whole date is
          // one uninterrupted run of digits on a phone keypad.
          if (input.value.length === p.max) {
            var next = input.parentNode.nextElementSibling;
            var nextInput = next && next.querySelector('input');
            if (nextInput) nextInput.focus();
          }
          commit({
            month: parts.month.value, day: parts.day.value, year: parts.year.value,
          });
        });
        parts[p.key] = input;
        control.appendChild(el('div', { class: 'ukcf-date-cell' }, [
          el('label', { class: 'ukcf-date-label', for: id + '-' + p.key, text: p.label }),
          input,
        ]));
      });
      control._parts = parts;

    } else {
      var type = field.type === 'zip' || field.type === 'tel' ? 'text' : (field.type || 'text');
      control = el('input', {
        type: type, id: id, class: 'ukcf-input',
        placeholder: field.placeholder || null,
        inputmode: field.type === 'tel' || field.type === 'zip' ? 'numeric' : null,
        autocomplete: field.autocomplete || null,
        maxlength: field.maxLength ? String(field.maxLength) : null,
      });
      control.addEventListener('input', function () {
        if (field.type === 'tel') {
          var caretAtEnd = control.selectionStart === control.value.length;
          control.value = V.formatPhone(control.value);
          if (caretAtEnd) control.selectionStart = control.selectionEnd = control.value.length;
        }
        commit(control.value);
      });
      // Re-check on blur so a warning like a misspelled domain shows once the
      // person has actually finished typing, not on the third character.
      control.addEventListener('blur', function () { self.showFieldIssue(path); });
    }

    var showLabel = field.type !== 'checkbox';
    var node = el('div', { class: 'ukcf-field ' + widthClass }, [
      showLabel ? el(field.type === 'radio' || field.type === 'date' || field.type === 'checkboxes' ? 'span' : 'label', {
        class: 'ukcf-label', id: id + '-l',
        for: field.type === 'radio' || field.type === 'date' || field.type === 'checkboxes' ? null : id,
      }, [
        el('span', { text: field.label || '' }),
        field.required ? el('span', { class: 'ukcf-req', text: ' *', 'aria-label': 'required' }) : null,
      ]) : null,
      control,
      field.help ? el('p', { class: 'ukcf-help', text: field.help }) : null,
      msg,
    ]);

    return {
      kind: 'input', node: node, control: control, msg: msg,
      field: field, path: path, scope: scope, step: step, id: id,
    };
  };

  /* --- repeatables --------------------------------------------------------- */

  /* The paper form hardcodes exactly four children. This has no upper limit,
   * which is the whole reason the block repeats. */
  Engine.prototype.renderRepeat = function (field, container, scope, step) {
    var self = this;
    var path = join(scope, field.id);
    var min = field.min === undefined ? 1 : field.min;

    var wrap = el('fieldset', { class: 'ukcf-fieldset ukcf-repeat' }, [
      field.label ? el('legend', { class: 'ukcf-legend', text: field.label }) : null,
      field.help ? el('p', { class: 'ukcf-help', text: field.help }) : null,
    ]);
    var items = el('div', { class: 'ukcf-repeat-items' });
    var addBtn = el('button', {
      type: 'button', class: 'ukcf-btn ukcf-btn--ghost ukcf-repeat-add',
      text: field.addLabel || T('btn.addAnother'),
    });
    wrap.appendChild(items);
    wrap.appendChild(addBtn);
    container.appendChild(wrap);

    var controller = {
      kind: 'repeat', node: wrap, field: field, path: path, scope: scope, step: step, count: 0,
    };

    function itemLabel(i) {
      return (field.itemLabel || 'Item') + ' ' + (i + 1);
    }

    function relabel() {
      Array.prototype.slice.call(items.children).forEach(function (card, i) {
        var legend = card.querySelector('.ukcf-repeat-legend');
        if (legend) legend.textContent = itemLabel(i);
        var remove = card.querySelector('.ukcf-repeat-remove');
        if (remove) remove.hidden = items.children.length <= min;
      });
    }

    function addItem(skipTouch) {
      var index = items.children.length;
      var itemScope = path + '.' + index;
      var card = el('div', { class: 'ukcf-repeat-item' });
      var head = el('div', { class: 'ukcf-repeat-head' }, [
        el('h3', { class: 'ukcf-repeat-legend', text: itemLabel(index) }),
        el('button', { type: 'button', class: 'ukcf-repeat-remove', text: T('btn.remove') }),
      ]);
      card.appendChild(head);
      var body = el('div', { class: 'ukcf-grid' });
      card.appendChild(body);

      var inner = expandBlock(field, self.blocks, field.options);
      self.renderFields(inner, body, itemScope, step);
      items.appendChild(card);

      head.querySelector('.ukcf-repeat-remove').addEventListener('click', function () {
        removeItem(card);
      });

      relabel();
      controller.count = items.children.length;
      if (!skipTouch) {
        self.refreshVisibility();
        self.touch();
        var firstInput = body.querySelector('input, select, textarea');
        if (firstInput) firstInput.focus();
      }
      return card;
    }

    /* Removing item 1 of 3 has to renumber the survivors, because the paths
     * carry the index. Rebuilding the whole list from the surviving data is
     * simpler and less error-prone than splicing paths in place. */
    function removeItem(card) {
      var index = Array.prototype.indexOf.call(items.children, card);
      var list = getPath(self.data, path) || [];
      list.splice(index, 1);
      setPath(self.data, path, list);
      rebuild(list.length);
      self.touch();
    }

    function rebuild(count) {
      // Drop the registry entries that belonged to the old items.
      self.registry = self.registry.filter(function (entry) {
        return !entry.path || entry.path.indexOf(path + '.') !== 0;
      });
      items.innerHTML = '';
      for (var i = 0; i < Math.max(count, min); i++) addItem(true);
      self.syncControls();
      self.refreshVisibility();
    }

    addBtn.addEventListener('click', function () {
      if (field.max && items.children.length >= field.max) return;
      addItem(false);
    });

    controller.rebuild = rebuild;
    this.repeats.push(controller);
    this.registry.push(controller);

    var existing = getPath(this.data, path);
    rebuild(Array.isArray(existing) ? existing.length : min);
  };

  /* --- state, visibility, persistence -------------------------------------- */

  Engine.prototype.touch = function () {
    var self = this;
    this.refreshVisibility();
    // Once the summary is up, the messages are live. Fixing one item clears it
    // straight away rather than leaving a wall of red that no longer applies.
    if (this.errorSummary && !this.errorSummary.hidden) this.revalidate();
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(function () { self.save(); }, 400);
  };

  Engine.prototype.revalidate = function () {
    var issues = this.validateStep(this.current);
    this.paintIssues(issues);
    var errors = issues.filter(function (i) { return i.severity === 'error'; });
    if (!errors.length) { this.errorSummary.hidden = true; return; }
    this.renderSummary(errors);
  };

  /* Pushes `this.data` back into the DOM. Used after restoring from storage and
   * after a repeat rebuild. */
  Engine.prototype.syncControls = function () {
    var self = this;
    this.registry.forEach(function (entry) {
      if (entry.kind !== 'input') return;
      var value = getPath(self.data, entry.path);
      var f = entry.field;
      if (f.type === 'date') {
        var parts = value || {};
        entry.control._parts.month.value = parts.month || '';
        entry.control._parts.day.value = parts.day || '';
        entry.control._parts.year.value = parts.year || '';
      } else if (f.type === 'radio') {
        Array.prototype.slice.call(entry.control.querySelectorAll('input')).forEach(function (i) {
          i.checked = i.value === value;
        });
      } else if (f.type === 'checkbox') {
        entry.control.querySelector('input').checked = !!value;
      } else if (f.type === 'checkboxes') {
        var chosen = Array.isArray(value) ? value : [];
        Array.prototype.slice.call(entry.control.querySelectorAll('input')).forEach(function (i) {
          i.checked = chosen.indexOf(i.value) >= 0;
        });
      } else if (value !== undefined && value !== null) {
        entry.control.value = value;
      }
    });
  };

  Engine.prototype.isVisible = function (entry) {
    return testCondition(entry.field.showIf, this.data, entry.scope);
  };

  Engine.prototype.refreshVisibility = function () {
    var self = this;
    this.registry.forEach(function (entry) {
      var show = self.isVisible(entry);
      entry.hidden = !show;
      entry.node.hidden = !show;
    });
    this.stepNodes.forEach(function (s) {
      s.skipped = !testCondition(s.step.showIf, self.data, '');
    });
    this.updateProgress();
  };

  Engine.prototype.visibleSteps = function () {
    return this.stepNodes.filter(function (s) { return !s.skipped; });
  };

  Engine.prototype.updateProgress = function () {
    if (!this.progress) return;
    var visible = this.visibleSteps();
    var pos = visible.findIndex(function (s) { return s.index === this.current; }.bind(this));
    var human = (pos < 0 ? 0 : pos) + 1;
    this.progress.querySelector('.ukcf-progress-text').textContent =
      'Step ' + human + ' of ' + visible.length;
    this.progress.querySelector('.ukcf-progress-fill').style.width =
      Math.round((human / visible.length) * 100) + '%';
  };

  /* Half an hour of typing should survive a dropped connection or a misplaced
   * tap on the back button. */
  Engine.prototype.save = function () {
    try {
      global.localStorage.setItem(this.storageKey, JSON.stringify({
        savedAt: Date.now(), data: this.data,
      }));
    } catch (e) { /* private browsing or a full quota; not worth interrupting for */ }
  };

  Engine.prototype.restore = function () {
    var raw;
    try { raw = global.localStorage.getItem(this.storageKey); } catch (e) { return; }
    if (!raw) return;
    try {
      var saved = JSON.parse(raw);
      // A month-old draft is noise, not a convenience.
      if (Date.now() - saved.savedAt > 30 * 24 * 60 * 60 * 1000) { this.clearSaved(); return; }
      this.data = saved.data || {};
      this.restored = true;
    } catch (e) { this.clearSaved(); }
  };

  Engine.prototype.clearSaved = function () {
    try { global.localStorage.removeItem(this.storageKey); } catch (e) { /* nothing to clear */ }
  };

  /* --- navigation ----------------------------------------------------------- */

  Engine.prototype.showStep = function (index) {
    var self = this;
    this.current = index;
    this.stepNodes.forEach(function (s) { s.node.hidden = s.index !== index; });

    var visible = this.visibleSteps();
    var pos = visible.findIndex(function (s) { return s.index === index; });
    this.backBtn.hidden = pos <= 0;
    var last = pos === visible.length - 1;
    this.nextBtn.textContent = last ? (this.schema.submitLabel || T('btn.submit')) : T('btn.continue');
    this.isLastStep = last;

    // The read-back sits on its own step, one before the signature, so it has
    // to be rebuilt on every move rather than only when the end is reached.
    this.buildReview();
    this.registry.forEach(function (entry) {
      if (entry.kind === 'signature' && entry.step === self.stepNodes[index].step) entry.sig.activate();
    });

    this.syncControls();
    this.updateProgress();
    this.errorSummary.hidden = true;

    if (this.restored && !this._noticedResume) {
      this._noticedResume = true;
      this.showResumeNote();
    }

    var heading = this.stepNodes[index].node.querySelector('.ukcf-step-title');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
    this.mount.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  Engine.prototype.showResumeNote = function () {
    var self = this;
    var startOver = el('button', { type: 'button', class: 'ukcf-linkbtn', text: 'start over' });
    this.resumeNote.innerHTML = '';
    this.resumeNote.appendChild(el('p', {}, [
      el('span', { text: 'We saved what you had already filled in. You can pick up where you left off, or ' }),
      startOver,
      el('span', { text: '.' }),
    ]));
    this.resumeNote.hidden = false;
    startOver.addEventListener('click', function () {
      self.clearSaved();
      global.location.reload();
    });
  };

  Engine.prototype.goBack = function () {
    var visible = this.visibleSteps();
    var pos = visible.findIndex(function (s) { return s.index === this.current; }.bind(this));
    if (pos > 0) this.showStep(visible[pos - 1].index);
  };

  Engine.prototype.goNext = function () {
    var issues = this.validateStep(this.current);
    var errors = issues.filter(function (i) { return i.severity === 'error'; });
    this.paintIssues(issues);

    if (errors.length) {
      this.showSummary(errors);
      return;
    }
    this.errorSummary.hidden = true;

    if (this.isLastStep) { this.submit(); return; }

    var visible = this.visibleSteps();
    var pos = visible.findIndex(function (s) { return s.index === this.current; }.bind(this));
    if (pos < visible.length - 1) this.showStep(visible[pos + 1].index);
  };

  /* --- validation ----------------------------------------------------------- */

  Engine.prototype.stepEntries = function (index) {
    var step = this.stepNodes[index].step;
    var self = this;
    return this.registry.filter(function (e) {
      return e.step === step && !e.hidden && !self.ancestorHidden(e);
    });
  };

  /* A field inside a hidden fieldset is itself hidden, even though its own
   * showIf passed. Nothing hidden may block submission.
   *
   * Steps are the exception. Only one step is on screen at a time, so a step
   * section carries `hidden` for the eight steps the person is not looking at
   * right now. That says nothing about whether its answers count. The question
   * for a step is whether it was skipped, which refreshVisibility already
   * tracks, so the walk stops at the step boundary and asks that instead.
   */
  Engine.prototype.ancestorHidden = function (entry) {
    var node = entry.node.parentNode;
    while (node && node !== this.form) {
      if (node.classList && node.classList.contains('ukcf-step')) break;
      if (node.hidden) return true;
      node = node.parentNode;
    }
    return this.stepSkipped(entry.step);
  };

  Engine.prototype.stepSkipped = function (step) {
    var found = this.stepNodes.filter(function (s) { return s.step === step; })[0];
    return !!(found && found.skipped);
  };

  Engine.prototype.validateStep = function (index) {
    var self = this;
    var issues = [];

    this.stepEntries(index).forEach(function (entry) {
      if (entry.kind === 'input') {
        var result = V.checkField(entry.field, getPath(self.data, entry.path));
        if (result.error) issues.push({ path: entry.path, severity: 'error', message: result.error });
        else if (result.warning) issues.push({ path: entry.path, severity: 'warning', message: result.warning });
      } else if (entry.kind === 'signature') {
        entry.sig.validate().forEach(function (i) {
          issues.push({ path: i.path, severity: i.severity, message: i.message, sig: entry.sig });
        });
      }
    });

    // Cross-field checks live on the step that owns the last field they read,
    // so a warning about a spouse's baptism date never fires before the spouse
    // step has been filled in.
    var step = this.stepNodes[index].step;
    (step.checks || []).forEach(function (check) {
      issues = issues.concat(self.runCheck(check));
    });

    return issues;
  };

  Engine.prototype.runCheck = function (check) {
    var self = this;
    var get = function (p) { return getPath(self.data, p); };
    if (check.showIf && !testCondition(check.showIf, this.data, '')) return [];

    if (check.type === 'person') return V.checkPerson(check.scope, get);
    if (check.type === 'personEach') {
      var list = getPath(this.data, check.repeat) || [];
      return list.reduce(function (acc, _item, i) {
        return acc.concat(V.checkPerson(check.repeat + '.' + i, get));
      }, []);
    }
    if (check.type === 'contactMethods') {
      return V.checkContactMethods(check.paths, get, check.message);
    }
    if (check.type === 'gradeAge') {
      var kids = getPath(this.data, check.repeat) || [];
      return kids.reduce(function (acc, _item, i) {
        return acc.concat(V.checkGradeAgainstAge(
          check.repeat + '.' + i + '.' + check.birthdate,
          check.repeat + '.' + i + '.' + check.grade,
          get
        ));
      }, []);
    }
    return [];
  };

  Engine.prototype.entryByPath = function (path) {
    return this.registry.filter(function (e) { return e.path === path; })[0];
  };

  Engine.prototype.paintIssues = function (issues) {
    var self = this;
    this.registry.forEach(function (e) {
      if (e.kind !== 'input') return;
      e.msg.textContent = '';
      e.msg.className = 'ukcf-msg';
      e.control.removeAttribute && e.control.removeAttribute('aria-invalid');
    });
    this.signatures.forEach(function (s) { s.showIssues([]); });

    var bySig = new Map();
    issues.forEach(function (issue) {
      if (issue.sig) {
        if (!bySig.has(issue.sig)) bySig.set(issue.sig, []);
        bySig.get(issue.sig).push(issue);
        return;
      }
      var entry = self.entryByPath(issue.path);
      if (!entry || entry.kind !== 'input') return;
      entry.msg.textContent = issue.message;
      entry.msg.className = 'ukcf-msg is-' + issue.severity;
      if (issue.severity === 'error' && entry.control.setAttribute) {
        entry.control.setAttribute('aria-invalid', 'true');
        entry.control.setAttribute('aria-describedby', entry.id + '-msg');
      }
    });
    bySig.forEach(function (list, sig) { sig.showIssues(list); });
  };

  /* The moment someone fixes a field, its message goes away. Holding it until
   * blur means the line collapses just as they reach for the next control, and
   * on a phone the thing they were aiming at slides out from under the tap. */
  Engine.prototype.clearIssueIfFixed = function (path) {
    var entry = this.entryByPath(path);
    if (!entry || entry.kind !== 'input' || !entry.msg.textContent) return;
    var result = V.checkField(entry.field, getPath(this.data, path));
    if (result.error || result.warning) return;
    entry.msg.textContent = '';
    entry.msg.className = 'ukcf-msg';
    if (entry.control.removeAttribute) {
      entry.control.removeAttribute('aria-invalid');
      entry.control.removeAttribute('aria-describedby');
    }
  };

  Engine.prototype.showFieldIssue = function (path) {
    var entry = this.entryByPath(path);
    if (!entry || entry.hidden) return;
    var value = getPath(this.data, path);
    if (V.isBlank(value)) return;    // don't scold someone for tabbing through
    var result = V.checkField(entry.field, value);
    entry.msg.textContent = result.error || result.warning || '';
    entry.msg.className = 'ukcf-msg' + (result.error ? ' is-error' : result.warning ? ' is-warning' : '');
  };

  Engine.prototype.renderSummary = function (errors) {
    var self = this;
    this.errorSummary.innerHTML = '';
    this.errorSummary.appendChild(el('h3', {
      text: errors.length === 1 ? T('errors.heading') : T('errors.headingPlural', { count: errors.length }),
    }));
    var list = el('ul');
    errors.forEach(function (e) {
      var entry = self.entryByPath(e.path);
      var link = el('a', { href: '#' + (entry ? entry.id : e.path), text: e.message });
      link.addEventListener('click', function (ev) {
        ev.preventDefault();
        var target = document.getElementById(entry ? entry.id : e.path);
        if (target) { target.focus(); target.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      });
      list.appendChild(el('li', {}, [link]));
    });
    this.errorSummary.appendChild(list);
  };

  Engine.prototype.showSummary = function (errors) {
    this.renderSummary(errors);
    this.errorSummary.hidden = false;
    this.errorSummary.focus();
  };

  /* --- review --------------------------------------------------------------- */

  /* A plain read-back of everything that will be sent. People are about to sign
   * this, so they should be able to see it without scrolling back through eight
   * steps. */
  Engine.prototype.buildReview = function () {
    if (!this.reviewNode) return;
    var self = this;
    this.reviewNode.innerHTML = '';

    this.stepNodes.forEach(function (s) {
      if (s.skipped) return;
      var rows = [];
      self.registry.forEach(function (entry) {
        if (entry.step !== s.step || entry.kind !== 'input' || entry.hidden) return;
        if (self.ancestorHidden(entry)) return;
        var value = self.displayValue(entry);
        if (V.isBlank(value)) return;
        rows.push(el('div', { class: 'ukcf-review-row' }, [
          el('dt', { text: entry.field.label || entry.path }),
          el('dd', { text: value }),
        ]));
      });
      if (!rows.length) return;
      var section = el('div', { class: 'ukcf-review-section' }, [
        el('h3', { text: s.step.title }),
      ]);
      var dl = el('dl', { class: 'ukcf-review-list' });
      rows.forEach(function (r) { dl.appendChild(r); });
      section.appendChild(dl);
      self.reviewNode.appendChild(section);
    });
  };

  Engine.prototype.displayValue = function (entry) {
    var value = getPath(this.data, entry.path);
    var f = entry.field;
    if (f.type === 'date') {
      return f.approximate ? V.approximateIso(value)
        : (V.datePartsComplete(value) ? V.isoDate(value) : '');
    }
    if (f.type === 'checkbox') return value ? 'Yes' : '';
    if (f.type === 'checkboxes') {
      var labels = (f.options || []).filter(function (o) {
        return (value || []).indexOf(o.value) >= 0;
      }).map(function (o) { return o.label; });
      return labels.join(', ');
    }
    if (f.type === 'select' || f.type === 'radio') {
      var match = (f.options || []).filter(function (o) { return o.value === value; })[0];
      return match ? match.label : (value || '');
    }
    return value === undefined || value === null ? '' : String(value);
  };

  /* --- submit --------------------------------------------------------------- */

  /* Strips everything the person never saw. A branch they skipped must not
   * arrive at the parish office as an empty field. */
  Engine.prototype.collect = function () {
    var self = this;
    var out = {};
    this.registry.forEach(function (entry) {
      if (entry.kind !== 'input' || entry.hidden || self.ancestorHidden(entry)) return;
      var value = getPath(self.data, entry.path);
      if (V.isBlank(value)) return;
      if (entry.field.type === 'date') {
        var iso = entry.field.approximate ? V.approximateIso(value) : V.isoDate(value);
        if (iso) setPath(out, entry.path, iso);
      } else {
        setPath(out, entry.path, value);
      }
    });
    this.signatures.forEach(function (sig) {
      if (sig.node.hidden) return;
      setPath(out, sig.path, sig.read());
    });
    return out;
  };

  /* Field labels travel with the submission so the Worker can render a readable
   * email and PDF without importing the schema. */
  Engine.prototype.labelMap = function () {
    var self = this;
    var map = {};
    this.registry.forEach(function (entry) {
      if (entry.kind !== 'input' || entry.hidden || self.ancestorHidden(entry)) return;
      map[entry.path] = {
        label: entry.field.label || entry.path,
        step: entry.step.title,
        display: self.displayValue(entry),
      };
    });
    return map;
  };

  Engine.prototype.submit = function () {
    var self = this;
    if (this.submitting) return;

    var elapsed = Date.now() - this.startedAt;
    // Nobody fills a registration form in four seconds.
    if (this.honeypot.value || elapsed < 5000) {
      this.statusNode.textContent = T('error.generic', { phone: '(509) 674-2531' });
      this.statusNode.className = 'ukcf-status is-error';
      return;
    }

    this.submitting = true;
    this.nextBtn.disabled = true;
    this.backBtn.disabled = true;
    this.nextBtn.textContent = T('btn.sending');
    this.statusNode.textContent = '';
    this.statusNode.className = 'ukcf-status';

    var payload = {
      formId: this.schema.formId,
      formTitle: this.schema.title,
      version: this.schema.version,
      subjectPrefix: this.schema.subjectPrefix || this.schema.title,
      submittedAt: new Date().toISOString(),
      elapsedMs: elapsed,
      // Sent so the server can apply the same check. Empty for a real person.
      website: this.honeypot.value || '',
      data: this.collect(),
      labels: this.labelMap(),
    };

    fetch(this.config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) throw new Error(body.message || 'The server responded ' + res.status);
        return body;
      });
    }).then(function (body) {
      self.clearSaved();
      self.showSuccess(body);
    }).catch(function (err) {
      self.submitting = false;
      self.nextBtn.disabled = false;
      self.backBtn.disabled = false;
      self.nextBtn.textContent = self.schema.submitLabel || T('btn.submit');
      self.statusNode.textContent = 'We could not send that. ' + err.message
        + ' Please try again, or call the parish office at (509) 674-2531.';
      self.statusNode.className = 'ukcf-status is-error';
      if (global.Turnstile && self.turnstileWidget) global.turnstile.reset(self.turnstileWidget);
    });
  };

  Engine.prototype.showSuccess = function (body) {
    var done = el('div', { class: 'ukcf-done', role: 'status', tabindex: '-1' }, [
      el('h2', { text: this.schema.successTitle || T('done.title') }),
      el('p', { text: this.schema.successBody || T('done.body') }),
      body && body.reference
        ? el('p', { class: 'ukcf-ref' }, [
          el('span', { text: T('done.reference') }),
          el('strong', { text: body.reference }),
          el('span', { text: '. We emailed you a copy for your records.' }),
        ])
        : null,
      el('p', {}, [
        el('span', { text: T('done.questions') }),
        el('a', { href: 'tel:+15096742531', text: '(509) 674-2531' }),
        el('span', { text: '.' }),
      ]),
    ]);
    this.mount.innerHTML = '';
    this.mount.appendChild(done);
    done.focus();
    this.mount.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* --- boot ----------------------------------------------------------------- */

  /* Reads its configuration off the mount element, so a form page is a shell
   * with no inline script beyond one data attribute per setting. */
  function boot() {
    var mount = document.querySelector('[data-ukc-form]');
    if (!mount) return;

    var base = mount.getAttribute('data-base') || '../';
    var formId = mount.getAttribute('data-ukc-form');
    var schemaUrl = base + 'schemas/' + formId + '.json';
    var blocksUrl = base + 'blocks/blocks.json';
    var endpoint = mount.getAttribute('data-endpoint');
    var lang = mount.getAttribute('data-lang')
      || (document.documentElement.getAttribute('lang') || 'en').slice(0, 2);

    var i18n = global.UKCFormsI18n;
    var t = new i18n.Translator(lang, null);

    mount.appendChild(el('p', { class: 'ukcf-loading', text: t.t('loading') }));

    // A missing translation file is not a failure. The form renders in English,
    // which is worse than Spanish and far better than not loading at all.
    var strings = lang === 'en' ? Promise.resolve({}) : fetch(base + 'i18n/' + formId + '.' + lang + '.json')
      .then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; });
    var blockStrings = lang === 'en' ? Promise.resolve({}) : fetch(base + 'i18n/blocks.' + lang + '.json')
      .then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; });

    Promise.all([
      fetch(schemaUrl).then(function (r) { return r.json(); }),
      fetch(blocksUrl).then(function (r) { return r.json(); }),
      strings,
      blockStrings,
    ]).then(function (parts) {
      var schema = parts[0];
      var blocks = parts[1];
      var merged = {};
      [parts[2], parts[3]].forEach(function (table) {
        Object.keys(table || {}).forEach(function (k) { merged[k] = table[k]; });
      });
      t.content = merged;
      i18n.localise(schema, blocks, t);

      var engine = new Engine(mount, schema, blocks, { endpoint: endpoint, t: t, lang: t.lang });
      global.ukcFormEngine = engine;
      engine.render();
    }).catch(function (err) {
      mount.innerHTML = '';
      mount.appendChild(el('div', { class: 'ukcf-status is-error' }, [
        el('p', { text: t.t('error.load') + err.message }),
        el('p', {}, [
          el('span', { text: t.t('error.callUs') }),
          el('a', { href: 'tel:+15096742531', text: '(509) 674-2531' }),
          el('span', { text: t.t('error.overThePhone') }),
        ]),
      ]));
    });
  }

  global.UKCForms = {
    Engine: Engine,
    boot: boot,
    // exported for tests
    _internals: { getPath: getPath, setPath: setPath, testCondition: testCondition, expandBlock: expandBlock },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}(typeof window !== 'undefined' ? window : globalThis));
