(function () {
  'use strict';

  var archive = document.querySelector('[data-bulletin-archive]');
  var latest = document.querySelector('[data-bulletin-latest]');
  if (!archive && !latest) return;

  var spanish = (archive || latest).dataset.locale === 'es';
  var locale = spanish ? 'es-US' : 'en-US';
  var copy = spanish
    ? {
        error: 'Los boletines no están disponibles en este momento.',
        empty: 'Todavía no hay boletines publicados.',
        latest: 'Boletín más reciente',
        recent: 'Boletines recientes',
        download: 'Descargar PDF en inglés',
        issue: 'Boletín parroquial semanal',
        parishes: 'San Juan Bautista<br>&amp;<br>Inmaculada Concepción',
        pages: 'PDF de 4 páginas en inglés',
      }
    : {
        error: 'Bulletins are unavailable right now.',
        empty: 'No bulletins have been published yet.',
        latest: 'Latest bulletin',
        recent: 'Recent bulletins',
        download: 'Download PDF',
        issue: 'Weekly Parish Bulletin',
        parishes: 'St. John the Baptist<br>&amp;<br>Immaculate Conception',
        pages: '4-page PDF',
      };

  function recentIssues(issues) {
    var seen = new Set();
    return issues.filter(function (issue) {
      if (!issue || typeof issue.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(issue.date)) return false;
      var date = new Date(issue.date + 'T00:00:00Z');
      if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== issue.date) return false;
      if (issue.path !== '/bulletins/' + issue.date.slice(0, 4) + '/' + issue.date + '-bulletin.pdf') return false;
      if (!Number.isFinite(issue.bytes) || issue.bytes <= 0 || seen.has(issue.date)) return false;
      seen.add(issue.date);
      return true;
    }).sort(function (left, right) {
      return right.date.localeCompare(left.date);
    }).slice(0, 4);
  }

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

  function issueMarkup(issue, index) {
    var date = formatDate(issue.date);
    return '<article class="bulletin-issue">'
      + '<div class="bulletin-issue__cover" aria-hidden="true">'
      + '<span class="eyebrow">' + copy.issue + '</span>'
      + '<span class="title">' + copy.parishes + '</span>'
      + '<span class="date">' + date + '</span>'
      + '</div>'
      + '<div class="bulletin-issue__body">'
      + '<div class="bulletin-issue__meta">' + (index === 0 ? copy.latest : copy.issue) + '</div>'
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
      if (!data || !Array.isArray(data.issues)) throw new Error('archive response is invalid');
      var issues = recentIssues(data.issues);
      if (archive) {
        archive.innerHTML = issues.length ? issues.map(issueMarkup).join('')
          : '<p class="bulletin-archive__status" role="status">' + copy.empty + '</p>';
      }
      if (latest && issues.length) {
        var issue = issues[0];
        latest.innerHTML = '<div><span class="eyebrow">' + copy.latest + '</span>'
          + '<p class="bulletin-latest__date">' + formatDate(issue.date) + '</p></div>'
          + '<div class="bulletin-latest__actions"><a class="btn btn--ghost" href="' + issue.path + '">' + copy.download + '</a>'
          + '<a class="bulletin-latest__recent" href="' + (spanish ? '/es/bulletins/' : '/bulletins/') + '">' + copy.recent + '</a></div>';
      }
    })
    .catch(function () {
      if (archive) archive.innerHTML = '<p class="bulletin-archive__status" role="status">' + copy.error + '</p>';
    });
}());