# lisette-espin.github.io

Research record of Lisette Espín-Noboa: publications, citations, collaborators
and interactive tools. Live at https://lisette-espin.github.io/

## Layout

    index.html                 the whole site, one self-contained file
    source/scholar-data.json   the same data, extracted for reading/editing
                               (the page does not load it)
    .nojekyll                  tells GitHub Pages to serve files as-is

No build step. GitHub Pages serves `index.html` from the root of `main`.

## External requests

The page loads d3 v7.8.5 from cdnjs.cloudflare.com and IBM Plex from
fonts.googleapis.com. Everything else (data, images) is embedded.

## Editing

The data lives in the `const SEED = { ... };` block near the top of the script
inside `index.html`. Edit it there and reload.

Fields worth knowing:

  * `venueType`  — one of the eight categories in `profile.categories`
  * `affils`     — ordered list; the first entry drives grouping
  * `topic`      — one of `profile.topics`
  * `citations`  — from Google Scholar; update the headline totals in
                   `profile` (citationsTotal, hIndex, i10Index) alongside
  * `tools`      — `paperIds` reference papers by `id`

Sources: CV (September 2026); Google Scholar, 8 September 2026.
