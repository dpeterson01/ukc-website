(function () {
  'use strict';

  // The archive pages are static HTML written by scripts/build-bulletins.mjs. This script only fills
  // the latest-bulletin strip on Home and Watch, and leaves its archive link in place if anything fails.
  var latest = document.querySelector('[data-bulletin-latest]');
  if (!latest) return;

  var spanish = latest.dataset.locale === 'es';
  var locale = spanish ? 'es-US' : 'en-US';
  var copy = spanish
    ? {
        latest: 'Boletín más reciente',
        recent: 'Boletines recientes',
        download: 'Descargar PDF en inglés',
      }
    : {
        latest: 'Latest bulletin',
        recent: 'Recent bulletins',
        download: 'Download PDF',
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
    });
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

  fetch('/bulletins/index.json', { headers: { Accept: 'application/json' } })
    .then(function (response) {
      if (!response.ok) throw new Error('archive request failed');
      return response.json();
    })
    .then(function (data) {
      if (!data || !Array.isArray(data.issues)) throw new Error('archive response is invalid');
      var issues = recentIssues(data.issues);
      if (issues.length) {
        var issue = issues[0];
        latest.innerHTML = '<div><span class="eyebrow">' + copy.latest + '</span>'
          + '<p class="bulletin-latest__date">' + formatDate(issue.date) + '</p></div>'
          + '<div class="bulletin-latest__actions"><a class="btn btn--ghost" href="' + issue.path + '">' + copy.download + '</a>'
          + '<a class="bulletin-latest__recent" href="' + (spanish ? '/es/bulletins/' : '/bulletins/') + '">' + copy.recent + '</a></div>';
      }
    })
    .catch(function () {
      // Keep the static link to the archive.
    });
}());