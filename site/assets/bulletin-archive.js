(function () {
  'use strict';

  var archive = document.querySelector('[data-bulletin-archive]');
  if (!archive) return;

  var locale = archive.dataset.locale === 'es' ? 'es-US' : 'en-US';
  var copy = archive.dataset.locale === 'es'
    ? {
        error: 'Los boletines no están disponibles en este momento.',
        download: 'Descargar PDF',
        issue: 'Boletín parroquial semanal',
        pages: 'PDF de 4 páginas',
      }
    : {
        error: 'Bulletins are unavailable right now.',
        download: 'Download PDF',
        issue: 'Weekly Parish Bulletin',
        pages: '4-page PDF',
      };

  function formatDate(value) {
    return new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(value + 'T00:00:00Z'));
  }

  function formatSize(bytes) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / 1048576) + ' MB';
  }

  function issueMarkup(issue) {
    var date = formatDate(issue.date);
    return '<article class="bulletin-issue">'
      + '<div class="bulletin-issue__cover" aria-hidden="true">'
      + '<span class="eyebrow">' + copy.issue + '</span>'
      + '<span class="title">St. John the Baptist<br>&amp;<br>Immaculate Conception</span>'
      + '<span class="date">' + date + '</span>'
      + '</div>'
      + '<div class="bulletin-issue__body">'
      + '<div class="bulletin-issue__meta">' + copy.issue + '</div>'
      + '<h3>' + date + '</h3>'
      + '<p>' + copy.pages + '</p>'
      + '<div class="bulletin-issue__actions">'
      + '<a class="btn btn--primary" href="' + issue.path + '">' + copy.download + '</a>'
      + '<span class="bulletin-issue__details">PDF · ' + formatSize(issue.bytes) + '</span>'
      + '</div></div></article>';
  }

  fetch('/bulletins/index.json', { headers: { Accept: 'application/json' } })
    .then(function (response) {
      if (!response.ok) throw new Error('archive request failed');
      return response.json();
    })
    .then(function (data) {
      if (!Array.isArray(data.issues)) throw new Error('archive response is invalid');
      archive.innerHTML = data.issues.map(issueMarkup).join('');
    })
    .catch(function () {
      archive.innerHTML = '<p class="bulletin-archive__status" role="status">' + copy.error + '</p>';
    });
}());