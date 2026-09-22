# lisette-espin.github.io

Research record of Lisette Espín-Noboa: publications, citations, collaborators
and interactive tools. Live at https://lisette-espin.github.io/

## Layout

    index.html         markup only — the shell the rest plugs into
    css/style.css      all styling; the design tokens sit in :root
    js/app.js          all behaviour — store, views, charts, graph
    data/dashboard.js  all the content
    assets/            headshot and tool thumbnails
    .nojekyll          tells GitHub Pages to serve files as-is

No build step. GitHub Pages serves the root of `main` as it is, and the page
also opens straight from disk.

Load order matters: `data/dashboard.js` defines `window.DASHBOARD` and must
come before `js/app.js`, which reads it. Both are already wired up in
`index.html`.

## External requests

The page loads d3 v7.8.5 from cdnjs.cloudflare.com and IBM Plex from
fonts.googleapis.com. Everything else is served from this repository.

## Editing

All content lives in `data/dashboard.js` — one assignment,
`window.DASHBOARD = { ... }`, wrapping otherwise plain JSON. Edit it and
reload; `index.html` needs no changes.

Fields worth knowing:

  * `venueType`  — one of the categories in `profile.categories`
  * `topic`      — one of `profile.topics`
  * `affils`     — ordered list; the first entry drives grouping
  * `citations`  — from Google Scholar; update the headline totals in
                   `profile` (citationsTotal, hIndex, i10Index) alongside
  * `tools`      — `paperIds` reference papers by `id`

Sources: CV (September 2026); Google Scholar, 8 September 2026.
