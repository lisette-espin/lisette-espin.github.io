#!/usr/bin/env python3
"""Build data/dashboard.js from the two files you actually edit.

    data/content.json                  the facts: papers, authors, venues, text
    data/citations-by-paper-year.csv   the numbers: one row per paper and year
                        |
                        v
    data/dashboard.js                  generated — never edit this by hand

Run it before every push:

    python3 build.py

Everything countable is worked out here rather than typed anywhere: each
paper's citation count, the totals in the header strip, the h-index and
i10-index, the citations-received-per-year histogram, and the "as of" date in
the footer. Add a row to the CSV and all of them move together.

It also refreshes the static preview tags in index.html, so one command covers
the whole pre-push routine.
"""

import csv
import json
import subprocess
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

HERE = Path(__file__).parent
CONTENT = HERE / "data" / "content.json"
CITATIONS = HERE / "data" / "citations-by-paper-year.csv"
OUT = HERE / "data" / "dashboard.js"

HEADER = """// GENERATED FILE — do not edit.
//
// Built by build.py from data/content.json and
// data/citations-by-paper-year.csv. Edit those, then run:
//
//     python3 build.py
//
// Everything below is plain JSON wrapped in one assignment, so a browser can
// load it straight from disk as well as from a web server.
window.DASHBOARD =
"""


class BuildError(Exception):
    pass


def version_key(paper_id, version):
    """How a nested version is named in the CSV."""
    return f"{paper_id}:{version.get('label') or 'version'}"


def read_citations(path):
    """paper_id -> {year: count}, summing any repeated rows."""
    if not path.exists():
        return {}
    series = defaultdict(dict)
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        missing = {"paper_id", "year", "citations"} - set(reader.fieldnames or [])
        if missing:
            raise BuildError(
                f"{path.name} is missing the column(s) {', '.join(sorted(missing))}. "
                f"Expected header: paper_id,title,year,citations")
        for n, row in enumerate(reader, start=2):
            pid = (row.get("paper_id") or "").strip()
            if not pid:
                continue
            try:
                year, count = int(row["year"]), int(row["citations"])
            except (TypeError, ValueError):
                raise BuildError(
                    f"{path.name} line {n}: year and citations must be whole numbers, "
                    f"got year={row.get('year')!r} citations={row.get('citations')!r}")
            if count <= 0:
                continue
            series[pid][str(year)] = series[pid].get(str(year), 0) + count
    return {k: dict(sorted(v.items())) for k, v in series.items()}


def h_index(counts):
    h = 0
    for i, c in enumerate(sorted(counts, reverse=True), start=1):
        if c >= i:
            h = i
    return h


def attach(record, series):
    """Hang each series on its paper.

    Returns the ids in the CSV that match no paper. They are dropped from
    `series` in place, so a mistyped id cannot quietly inflate the totals.
    """
    known = set()
    for paper in record["papers"]:
        known.add(paper["id"])
        by = series.get(paper["id"])
        paper["citations"] = sum(by.values()) if by else 0
        if by:
            paper["citationsByYear"] = by
        else:
            paper.pop("citationsByYear", None)
        for v in paper.get("versions") or []:
            key = version_key(paper["id"], v)
            known.add(key)
            vby = series.get(key)
            v["citations"] = sum(vby.values()) if vby else 0
            if vby:
                v["citationsByYear"] = vby
            else:
                v.pop("citationsByYear", None)
    orphans = sorted(set(series) - known)
    for pid in orphans:
        del series[pid]
    return orphans


def received_per_year(series):
    """Citations summed by the calendar year they arrived."""
    hist = defaultdict(int)
    for by in series.values():
        for year, n in by.items():
            hist[year] += n
    return dict(sorted(hist.items()))


def citations_of(paper):
    """A work plus its alternate versions, the way the page counts it."""
    return paper["citations"] + sum(v["citations"] for v in paper.get("versions") or [])


def build():
    if not CONTENT.exists():
        raise BuildError(f"{CONTENT} not found. It holds the papers and the page text.")
    record = json.loads(CONTENT.read_text(encoding="utf-8"))
    if not isinstance(record.get("papers"), list) or not record["papers"]:
        raise BuildError("content.json has no papers.")

    series = read_citations(CITATIONS)
    orphans = attach(record, series)

    profile = record.setdefault("profile", {})
    totals = [citations_of(p) for p in record["papers"]]
    profile["citationsTotal"] = sum(totals)
    profile["hIndex"] = h_index(totals)
    profile["i10Index"] = sum(1 for c in totals if c >= 10)
    profile["asOf"] = date.today().strftime("%-d %B %Y")

    hist = received_per_year(series)
    if hist:
        record["citationsByYear"] = hist
    else:
        record.pop("citationsByYear", None)

    OUT.write_text(HEADER + json.dumps(record, ensure_ascii=False, indent=2) + ";\n",
                   encoding="utf-8")

    peers = {a for p in record["papers"] for a in p.get("authors", [])} - {profile.get("self")}
    print(f"{OUT.relative_to(HERE)} written")
    print(f"  {len(record['papers'])} works · {profile['citationsTotal']} citations · "
          f"h={profile['hIndex']} · i10={profile['i10Index']} · {len(peers)} co-authors")
    if hist:
        print(f"  citations received {min(hist)}–{max(hist)}, "
              f"{len(series)} works with a year-by-year series")
    else:
        print("  no citation rows found — counts show as 0 and are not clickable")
    for pid in orphans:
        print(f"  ! {CITATIONS.name} has rows for '{pid}', which is not a paper id "
              f"in content.json — those citations are being ignored", file=sys.stderr)
    return bool(orphans)


def main():
    try:
        had_warnings = build()
    except BuildError as e:
        sys.exit(f"build failed: {e}")
    except json.JSONDecodeError as e:
        sys.exit(f"build failed: content.json is not valid JSON — {e}")

    sync = HERE / "sync_meta.py"
    if sync.exists():
        subprocess.run([sys.executable, str(sync)], check=True)
    print("ready to push." if not had_warnings else "ready to push, but see the warning above.")


if __name__ == "__main__":
    main()
