# lisette-espin.github.io

Research record of Lisette Espín-Noboa: publications, citations, collaborators
and interactive tools. Live at https://lisette-espin.github.io/

## Layout

    index.html         markup only — the shell the rest plugs into
    css/style.css      all styling; the design tokens sit in :root
    js/app.js          all behaviour — store, views, charts, graph
    data/dashboard.js  all the content, including the page metadata
    data/citations-by-paper-year.csv   per-paper citations by year
    assets/            headshot, icons and tool thumbnails
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
reload; `index.html` needs no changes. Section headings and intros, chart
titles, the browser-tab title, search/Open Graph metadata and the schema.org
block are all written from `meta` and `sections` in that file at load.

Fields worth knowing:

  * `venueType`  — one of the categories in `profile.categories`
  * `topic`      — one of `profile.topics`
  * `affils`     — ordered list; the first entry drives grouping
  * `citations`  — from Google Scholar; update the headline totals in
                   `profile` (citationsTotal, hIndex, i10Index) alongside
  * `tools`      — `paperIds` reference papers by `id`
  * `podcasts`   — episodes with `spotifyId` and `paperIds`; `podcastShow`
                   is the channel link

`data/citations-by-paper-year.csv` (`paper_id,title,year,citations`) makes each
citation count in the paper list open a year-by-year chart. The page fetches
it, so this only works when served (GitHub Pages), not from disk.

Sources: CV; Google Scholar, 10 October 2026.
