# Analytics event contract

No analytics provider is installed on the site. This file fixes the names now, so the bulletin
links carry stable hooks and whichever provider the parish picks later can read them without
changing the pages.

## How the hooks look

Each tracked link carries `data-event` plus a few `data-event-*` attributes, written by
`scripts/build-bulletins.mjs`. A future provider adapter listens for clicks on `[data-event]` and
sends the event name with those attributes as properties. Nothing is collected today.

## Events

| Event | Fires on | Properties |
|---|---|---|
| `bulletin_pdf_open` | A bulletin PDF link on the archive or a weekly summary page | `locale`, `position`, `issue` |
| `bulletin_signup_click` | The email signup link on the archive | `locale`, `position` |
| `bulletin_summary_open` | A link from the archive to a weekly summary page | `locale`, `position`, `issue` |
| `bulletin_archive_view` | Reserved for a page view of either archive | `locale` |

## Property values

- `locale`: `en` or `es`.
- `position`: `latest`, `recent` (the three weeks after the latest), `older`, `summary` for the PDF
  button on a weekly summary page, or `archive` for the signup link.
- `issue`: the bulletin date, `YYYY-MM-DD`.

## What is never collected

Form values, names, email addresses, subscriber tokens, query strings, and any URL other than the
page path. Search Console measures search visibility separately and needs no page hooks.
