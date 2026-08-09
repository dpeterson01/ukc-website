/* What the form engine says on its own behalf.
 *
 * Only the engine's own words live here: buttons, progress, validation, the
 * thank-you screen. Everything a form asks is in the schema, and its Spanish
 * lives beside the schema in i18n/, so a translator can work on one form's
 * wording without reading any code.
 *
 * A missing key falls back to English rather than showing a key name. A
 * parishioner seeing one English label is a small problem; seeing
 * "form.btn.submit" is a broken page.
 */
(function (global) {
  'use strict';

  var STRINGS = {
    en: {
      'btn.continue': 'Continue',
      'btn.back': 'Back',
      'btn.submit': 'Submit',
      'btn.sending': 'Sending…',
      'btn.addAnother': 'Add another',
      'btn.remove': 'Remove',
      'choose.one': 'Choose one…',
      'date.month': 'Month',
      'date.day': 'Day',
      'date.year': 'Year',
      'date.monthOptional': 'Month (optional)',
      'date.dayOptional': 'Day (optional)',
      'loading': 'Loading the form…',
      'progress': 'Step {current} of {total}',
      'errors.heading': 'One thing needs your attention',
      'errors.headingPlural': '{count} things need your attention',
      'done.title': 'Thank you.',
      'done.body': 'The parish office has your form.',
      'done.reference': 'Your reference number is ',
      'done.questions': 'Questions? Call the parish office at ',
      'error.generic': 'Something went wrong. Please call the parish office at {phone}.',
      'error.send': 'We could not send that. ',
      'error.load': 'This form could not load. ',
      'error.callUs': 'Please call the parish office at ',
      'error.overThePhone': ' and we will take your details over the phone.',
      'resume.note': 'We saved your answers on this device. You can carry on where you left off.',
      'resume.discard': 'Start again',
      'required': 'required',
      'validate.required': '{field} is required.',
      'validate.email': 'Please enter a valid email address.',
      'validate.phone': 'Please enter a 10-digit phone number.',
      'validate.zip': 'Please enter a 5 or 9 digit ZIP code.',
      'validate.state': 'Please choose a state.',
      'validate.date': 'That is not a real date. Please check the month and day.',
      'validate.age': 'Please check the year. That works out to over 120 years old.',
      'validate.future': 'That date is in the future.',
      'validate.didYouMean': 'Did you mean ',
      'validate.checkIfUnintended': 'Please double-check if it was not intended.',
      'validate.thisField': 'This field',
      'validate.contactMethods': 'Please give us at least one way to reach you.',
      'validate.gradeAge': 'Grade ',
      'sign.required': 'Please type your full legal name.',
      'sign.fullName': 'That looks like a single name. Please use your first and last name.',
      'sign.intent': 'Please confirm that this is your electronic signature.',
      'sign.consent': 'Please agree to sign electronically, or call the office to sign on paper.',
      'sign.legend': 'Signature',
      'sign.nameLabel': 'Full legal name',
      'sign.namePlaceholder': 'Type your full legal name',
      'sign.econsent': 'I agree to sign this form electronically.',
      'sign.attest': 'By typing my name above I intend this to be my electronic signature, and I certify that the information I have given is true and complete to the best of my knowledge.',
      'sign.disclosure': 'You are agreeing to sign this form electronically instead of on paper. Your typed name, together with the date and time we receive this form, makes up your signature. We will email you a PDF copy for your records. If you would rather sign on paper, call the parish office at {phone} and we will mail you a form.',
      'sacrament.baptism': 'Baptism',
      'sacrament.eucharist': 'First Eucharist',
      'sacrament.confirmation': 'Confirmation',
      'sacrament.marriage': 'Marriage',
    },

    es: {
      'btn.continue': 'Continuar',
      'btn.back': 'Atrás',
      'btn.submit': 'Enviar',
      'btn.sending': 'Enviando…',
      'btn.addAnother': 'Agregar otro',
      'btn.remove': 'Quitar',
      'choose.one': 'Elija una opción…',
      'date.month': 'Mes',
      'date.day': 'Día',
      'date.year': 'Año',
      'date.monthOptional': 'Mes (opcional)',
      'date.dayOptional': 'Día (opcional)',
      'loading': 'Cargando el formulario…',
      'progress': 'Paso {current} de {total}',
      'errors.heading': 'Falta corregir un dato',
      'errors.headingPlural': 'Faltan corregir {count} datos',
      'done.title': 'Gracias.',
      'done.body': 'La oficina parroquial ya tiene su formulario.',
      'done.reference': 'Su número de referencia es ',
      'done.questions': '¿Tiene preguntas? Llame a la oficina parroquial al ',
      'error.generic': 'Algo salió mal. Por favor llame a la oficina parroquial al {phone}.',
      'error.send': 'No pudimos enviarlo. ',
      'error.load': 'No se pudo cargar este formulario. ',
      'error.callUs': 'Por favor llame a la oficina parroquial al ',
      'error.overThePhone': ' y tomaremos sus datos por teléfono.',
      'resume.note': 'Guardamos sus respuestas en este dispositivo. Puede continuar donde lo dejó.',
      'resume.discard': 'Empezar de nuevo',
      'required': 'obligatorio',
      'validate.required': '{field} es obligatorio.',
      'validate.email': 'Escriba un correo electrónico válido.',
      'validate.phone': 'Escriba un número de teléfono de 10 dígitos.',
      'validate.zip': 'Escriba un código postal de 5 o 9 dígitos.',
      'validate.state': 'Elija un estado.',
      'validate.date': 'Esa fecha no existe. Revise el mes y el día.',
      'validate.age': 'Revise el año. Eso da más de 120 años de edad.',
      'validate.future': 'Esa fecha es en el futuro.',
      'validate.didYouMean': '¿Quiso decir ',
      'validate.checkIfUnintended': 'Revíselo si no fue intencional.',
      'validate.thisField': 'Este campo',
      'validate.contactMethods': 'Déjenos al menos una forma de comunicarnos con usted.',
      'validate.gradeAge': 'Grado ',
      'sign.required': 'Escriba su nombre legal completo.',
      'sign.fullName': 'Eso parece un solo nombre. Por favor escriba su nombre y apellido.',
      'sign.intent': 'Confirme que esta es su firma electrónica.',
      'sign.consent': 'Acepte firmar electrónicamente, o llame a la oficina para firmar en papel.',
      'sign.legend': 'Firma',
      'sign.nameLabel': 'Nombre legal completo',
      'sign.namePlaceholder': 'Escriba su nombre legal completo',
      'sign.econsent': 'Acepto firmar este formulario electrónicamente.',
      'sign.attest': 'Al escribir mi nombre arriba, es mi intención que esta sea mi firma electrónica, y certifico que los datos que he dado son verdaderos y completos según mi leal saber y entender.',
      'sign.disclosure': 'Usted está aceptando firmar este formulario electrónicamente en lugar de en papel. Su nombre escrito, junto con la fecha y la hora en que recibimos este formulario, constituye su firma. Le enviaremos una copia en PDF por correo electrónico para sus archivos. Si prefiere firmar en papel, llame a la oficina parroquial al {phone} y le enviaremos un formulario.',
      'sacrament.baptism': 'Bautismo',
      'sacrament.eucharist': 'Primera Comunión',
      'sacrament.confirmation': 'Confirmación',
      'sacrament.marriage': 'Matrimonio',
    },
  };

  function Translator(lang, schemaStrings) {
    this.lang = STRINGS[lang] ? lang : 'en';
    this.content = schemaStrings || {};
  }

  Translator.prototype.t = function (key, vars) {
    var table = STRINGS[this.lang] || STRINGS.en;
    var text = table[key];
    if (text === undefined) text = STRINGS.en[key];
    if (text === undefined) return '';
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, function (whole, name) {
      return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole;
    });
  };

  /* Wording that belongs to a form rather than to the engine. Falls back to the
   * English already in the schema, so an untranslated field is readable rather
   * than blank. */
  Translator.prototype.content_ = function (key, fallback) {
    var found = this.content[key];
    return (typeof found === 'string' && found !== '') ? found : fallback;
  };

  Translator.prototype.isSpanish = function () { return this.lang === 'es'; };

  /* Rewrites the schema and blocks in place before anything renders, rather
   * than translating at each draw call. The engine then knows nothing about
   * language, and the keys here are exactly the ones
   * scripts/extract-form-strings.py writes, so the two cannot drift apart
   * without the coverage report saying so. */
  var TEXT_KEYS = ['label', 'help', 'title', 'placeholder', 'html', 'legend',
    'itemLabel', 'addLabel', 'successTitle', 'successBody', 'message',
    'subtitle', 'sameAsLabel'];

  function localiseFields(fields, prefix, t) {
    (fields || []).forEach(function (field) {
      var id = field.id || field.block || '?';
      var base = prefix + '.' + id;
      TEXT_KEYS.forEach(function (key) {
        if (typeof field[key] === 'string') {
          field[key] = t.content_(base + '.' + key, field[key]);
        }
      });
      // `options` is a choice list on a radio or select, and a bag of
      // interpolation variables on a block reference. Both can hold words a
      // person reads.
      if (Array.isArray(field.options)) {
        field.options.forEach(function (option, i) {
          if (!option || typeof option !== 'object') return;
          var value = option.value === undefined ? i : option.value;
          if (typeof option.label === 'string') {
            option.label = t.content_(base + '.option.' + value, option.label);
          }
          if (typeof option.help === 'string') {
            option.help = t.content_(base + '.option.' + value + '.help', option.help);
          }
        });
      } else if (field.options && typeof field.options === 'object') {
        // These get interpolated into a label, so an untranslated one leaves an
        // English word sitting inside a Spanish sentence.
        Object.keys(field.options).forEach(function (key) {
          if (typeof field.options[key] === 'string') {
            field.options[key] = t.content_(base + '.var.' + key, field.options[key]);
          }
        });
      }
    });
  }

  function localise(schema, blocks, t) {
    if (!t.isSpanish()) return;

    ['title', 'successTitle', 'successBody', 'submitLabel'].forEach(function (key) {
      if (typeof schema[key] === 'string') {
        schema[key] = t.content_('form.' + key, schema[key]);
      }
    });

    (schema.steps || []).forEach(function (step) {
      var base = 'step.' + (step.id || '?');
      ['title', 'help'].forEach(function (key) {
        if (typeof step[key] === 'string') step[key] = t.content_(base + '.' + key, step[key]);
      });
      (step.checks || []).forEach(function (check) {
        if (typeof check.message === 'string') {
          check.message = t.content_(base + '.check.' + (check.type || '?'), check.message);
        }
      });
      localiseFields(step.fields, base, t);
    });

    Object.keys(blocks || {}).forEach(function (name) {
      var block = blocks[name];
      if (name.charAt(0) === '_' || !block || typeof block !== 'object') return;
      localiseFields(block.fields, 'block.' + name, t);
      Object.keys(block.defaults || {}).forEach(function (key) {
        if (typeof block.defaults[key] === 'string' && /Label$/.test(key)) {
          block.defaults[key] = t.content_('block.' + name + '.default.' + key, block.defaults[key]);
        }
      });
    });
  }

  global.UKCFormsI18n = { Translator: Translator, STRINGS: STRINGS, localise: localise };
}(typeof window !== 'undefined' ? window : globalThis));
