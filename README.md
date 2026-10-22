# Research record — a one-page, data-driven academic dashboard

An interactive record of publications, citations, collaborators and tools.
No framework, no server-side code, and nothing to install — the page is plain
HTML, CSS and JavaScript, and runs from disk or from any host.

You edit two files. A script turns them into the one the page reads.

    data/content.json                  WHAT: papers, authors, venues, all text
    data/citations-by-paper-year.csv   HOW MANY: one row per paper and year
                |
                |  python3 build.py
                v
    data/dashboard.js                  generated — never edit by hand

The rest:

    index.html                 structure only — no words, no metadata
    css/style.css              all styling; the design tokens sit in :root
    js/app.js                  all behaviour — store, views, charts, graph
    assets/headshot.jpg        portrait shown in the header
    assets/tools/*.jpg         thumbnails for the tool cards
    build.py                   run this before every push
    add_paper.py               adds a paper by asking you questions
    sync_meta.py               called by build.py; link-preview tags
    make_single.py             optional; squashes the folder into one file

## The routine

New citation numbers — the usual case:

    1. open data/citations-by-paper-year.csv, add or change rows
    2. python3 build.py
    3. commit and push

A new paper:

    1. python3 add_paper.py     and answer the questions
    2. python3 build.py
    3. commit and push

`build.py` prints what it worked out, so you can see the new figures before
you push:

    data/dashboard.js written
      38 works · 400 citations · h=10 · i10=11 · 66 co-authors

## Nothing countable is typed anywhere

Every number on the page is derived from the CSV at build time:

  * each paper's citation count — the sum of its rows
  * the year-by-year chart behind each count in the paper list
  * **Papers per year** — a count of works
  * **Citations by year of publication** — each work's total, placed in the
    year it appeared
  * **Citations received per year** — every row summed by the year it fell in
  * the header strip: works, citations, h-index, i10-index, co-authors
  * "Figures as of …" in the footer — the day you last ran `build.py`

So a single new row in the CSV moves the paper, the three charts, the header
and the footer together, and they cannot disagree with each other.

The co-author count comes from the author lists in `content.json`, not from
a number you maintain.

`index.html` carries no content. Section headings, the lines under them, the
chart titles, the browser-tab title, the search metadata and the structured-data
block are all written from `data/dashboard.js` when the page loads. To change
what the page says, edit the data file; you never need to touch the HTML.

The one exception is the block between the `STATIC META` markers in the head.
Link-preview scrapers — LinkedIn, Slack, X, Bluesky, WhatsApp — fetch the file
and read it without running any JavaScript, so they would otherwise see an
empty title. That block is a static copy of the seven tags they look at. It is
generated, not hand-written:

    python3 sync_meta.py

Run that after editing `meta` in the data file and the two can never disagree.
The script rewrites only what sits between the markers, and says so when there
was nothing to change. Forgetting to run it costs you a stale preview card and
nothing else — the browser still takes everything from the data file.

## Running it

Open `index.html`. That is the whole procedure — double-click it on your own
machine, or upload the folder to GitHub Pages, Netlify, Cloudflare Pages or a
university web directory. There is no server requirement and no build step.

The content is loaded by a script tag rather than fetched, which is why it
works from disk as well as from a host. One feature needs a real host: the
Spotify players, which browsers refuse to frame on a page opened from disk.

Load order matters: `data/dashboard.js` defines `window.DASHBOARD` and must
come before `js/app.js`, which reads it. Both are already wired up in
`index.html`.

## Adapting it for someone else

Replace `data/content.json`, the CSV and the images, then run `build.py`.
Nothing in `index.html` needs to change. The shape of `content.json`:

### `profile`
Name, role, affiliations, ORCID, headshot path and `activeRange`. The citation
total, h-index, i10-index and "as of" date are **not** here — `build.py`
computes them and writes them into `dashboard.js`. It also holds:

  * `categories`     publication types, in the order they stack and sort
  * `topics`         research areas, in the order they group
  * `affilCountry`   affiliation short name -> country, for the country grouping
  * `profiles`       external links, each with a `group` ("Academic", "Social")
  * `appointments`, `education`, `visits`   the Background section
  * `coauthorGender` name -> "F" | "M" | "U", colours the co-author graph
  * `self`           the author's name exactly as it appears in author lists

### `papers`
One object per work:

    id          short unique key, referenced by tools and visits
    title       full title
    authors     list, formatted "F. Lastname"; one must equal profile.self
    year        integer
    venue       display name of the journal, conference or workshop
    venueType   must be one of profile.categories
    topic       must be one of profile.topics
    affils      ordered list; the first drives the affiliation grouping
    url         link for the title
    ids         DOI, arXiv id, pages — shown in small type
    versions    optional; alternate records of the same work (a preprint of a
                published paper, say), each nested under it in the list with
                its own citation count

### `tools`
Interactive tools: `name`, `url`, `blurb`, `image`, and `paperIds` linking
back to entries in `papers`. Leave the list empty and the section disappears.

### `software`
Released packages and datasets. `moreUrl` and `moreLabel` become the link at
the end of the section intro; `items` is the list, each with:

    id        short key, for your own reference
    name      display name
    blurb     a sentence or two on what it does
    lang      language label shown under the name
    links     [{label, url}, …] — PyPI, Source, Data and results, …
    paperIds  entries in `papers`, shown as "From"

### `outreach`
Talks, panels and press. `moreUrl` / `moreLabel` work as above. `groups` is a
list of columns, each `{id, label, items}`; an item is:

    when      "Jul 2026" — shown on the left
    title     what it was called
    outlet    venue, publication or institution
    place     optional; city, or "online"
    role      optional; "Keynote", "Panellist", "Invited talk", "Guest"
    by        optional; the journalist's name
    lang      optional; shown when it is not in English
    note      optional; one line of context
    links     [{label, url}, …] — add {"label":"Video","url":"…"} to a talk
              and the link appears under it. Add "paywall": true to a link
              and it is tagged, so nobody follows it expecting to read it

Items are not sorted for you — they appear in the order you write them.
Remove a group, or the whole block, and that part of the section disappears.

### `podcasts` and `podcastShow`
One entry per episode: `id`, `title`, `blurb`, `url`, `spotifyId` (the id in the
episode's Spotify link) and `paperIds`. `podcastShow` is the channel, with
`name` and `url`, and becomes the "follow my channel" line. Remove both and the
section disappears.

The player is Spotify's own embed, which browsers only load over `http://` or
`https://`. Opening `index.html` straight from disk shows an empty frame; the
players appear once the folder is on a host.

### `meta`
What the page says about itself: `title`, `description`, `shortDescription`,
`author`, `jobTitle`, `homepage`, `siteUrl`, `themeColor`, `ogImage`,
`alternateNames`
(spellings of the name that should lead to this page), `keywords` and
`alumniOf`. These become the `<title>`, the description, keywords and Open
Graph tags, and a schema.org `Person` block. Every link in `profile.profiles`
is added to that block as a `sameAs`, so search engines treat the profiles as
one person.

`siteUrl` is where the page is published. Preview cards need whole URLs, so
`ogImage` is resolved against it — set `siteUrl` to the wrong host and the
preview image will not load.

### `sections`
One entry per section — `charts`, `network`, `papers`, `tools`, `podcasts`,
`background` — each with a `title` and an `intro`. `charts` also has `panels`,
the three chart headings.

## Sections appear only when there is something to show

Each section hides itself when its data is missing, so you can delete whole
blocks from the data file without leaving empty headings behind. The same
applies to the three Background lists and to the citations-received chart.

## `data/citations-by-paper-year.csv`

The only file that is not JSON, so it opens in Excel, Numbers or Google
Sheets. One row per paper per year:

    paper_id,title,year,citations
    p5,Characterizing Information Diets of Social Media Users,2024,11

`paper_id` is the `id` of the work in `content.json`; for a nested version it
is `<paper id>:<version label>`. The `title` column is there to make the file
readable — only the id is used, so you can leave the title rough. Years with
no citations can simply be left out, and repeated rows for the same paper and
year are added together.

A paper with no rows shows zero, and its count is plain text rather than a
button. A `paper_id` that matches no paper is ignored and `build.py` says so
rather than letting the total drift.

## Adding a paper

`add_paper.py` asks for each field and offers the existing publication types,
topics and affiliations by number, so you cannot accidentally invent a ninth
publication type or a second spelling of an affiliation.

It is careful about authors. Each name is normalised towards the `F. Lastname`
house style, then:

  * a name already in the record is matched and the papers you share with that
    person are listed, so you can confirm it is them;
  * if it is **not** them — a different researcher with the same name — it
    asks for a name that tells the two apart, and keeps them separate in the
    co-author graph from then on;
  * a name that differs only in accents or punctuation is offered as a match,
    so `F. Karimi` and `F. Kárimi` do not become two people;
  * a surname that already exists with a different initial is offered too;
  * a genuinely new person is added, and you are asked for the gender that
    colours the co-author graph.

Nothing is written until you approve the summary, and the previous
`content.json` is kept as `content.json.bak`.

## Two external requests

d3 v7.8.5 from cdnjs and IBM Plex from Google Fonts. Both can be vendored into
`assets/` if you would rather the page made no third-party calls.
