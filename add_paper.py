#!/usr/bin/env python3
"""Add a paper to data/content.json by answering questions.

    python3 add_paper.py

It asks for the title, year, venue and so on, offering the existing choices by
number so a typo cannot invent a ninth publication type or a new spelling of an
affiliation. Then it takes the author list one name at a time:

  * a name already in the record is matched and the papers you share are
    listed, so you can confirm it is the same person or say it is a different
    person who happens to share the name;
  * a genuinely new name is added, and you are asked for the gender used to
    colour the co-author graph.

Nothing is written until you confirm the summary at the end, and the previous
file is kept as content.json.bak. Afterwards run:

    python3 build.py

Citations are not asked for. They live in data/citations-by-paper-year.csv; a
new paper simply has no rows there yet and shows zero until it does.
"""

import json
import re
import shutil
import sys
import unicodedata
from datetime import date
from pathlib import Path

HERE = Path(__file__).parent
CONTENT = HERE / "data" / "content.json"


# ---------------------------------------------------------------- prompting

def ask(question, default=None, required=True):
    suffix = f" [{default}]" if default else ""
    while True:
        try:
            answer = input(f"{question}{suffix}: ").strip()
        except EOFError:
            sys.exit("\nnothing written.")
        if not answer and default is not None:
            return default
        if answer or not required:
            return answer
        print("  needed.")


def ask_yes(question, default=True):
    hint = "Y/n" if default else "y/N"
    while True:
        answer = ask(f"{question} ({hint})", "y" if default else "n").lower()
        if answer in ("y", "yes"):
            return True
        if answer in ("n", "no"):
            return False
        print("  answer y or n.")


def ask_int(question, lo, hi, default=None):
    while True:
        raw = ask(question, str(default) if default is not None else None)
        try:
            n = int(raw)
        except ValueError:
            print("  a number, please.")
            continue
        if lo <= n <= hi:
            return n
        print(f"  between {lo} and {hi}.")


def choose(label, options, default=None, allow_new=False):
    """Pick one of the existing values by number."""
    print(f"\n{label}")
    for i, opt in enumerate(options, start=1):
        print(f"  {i:2}. {opt}")
    if allow_new:
        print(f"  {len(options) + 1:2}. something else (adds a new one)")
    top = len(options) + (1 if allow_new else 0)
    default_n = options.index(default) + 1 if default in options else None
    n = ask_int("  choose", 1, top, default_n)
    if allow_new and n == len(options) + 1:
        return ask("  new value"), True
    return options[n - 1], False


def choose_many(label, options, allow_new=False):
    """Pick several, in the order given — the first one carries weight."""
    print(f"\n{label}")
    for i, opt in enumerate(options, start=1):
        print(f"  {i:2}. {opt}")
    print("  numbers separated by commas, in order; the first is the main one.")
    print("  a name that is not listed is added as a new one.")
    while True:
        raw = ask("  choose")
        picked, fresh = [], []
        for part in [x.strip() for x in raw.split(",") if x.strip()]:
            if part.isdigit() and 1 <= int(part) <= len(options):
                picked.append(options[int(part) - 1])
            elif allow_new:
                picked.append(part)
                fresh.append(part)
            else:
                picked = None
                break
        if picked:
            return picked, fresh
        print("  did not understand that.")


# ------------------------------------------------------------------- names

def fold(name):
    """Compare names without being tripped by accents, dots or case."""
    plain = unicodedata.normalize("NFKD", name)
    plain = "".join(c for c in plain if not unicodedata.combining(c))
    return re.sub(r"[^a-z]", "", plain.lower())


def tidy(name):
    """Nudge 'Firstname Lastname' towards the 'F. Lastname' house style."""
    name = " ".join(name.split())
    parts = name.split()
    if len(parts) >= 2 and len(parts[0]) > 1 and not parts[0].endswith("."):
        return parts[0][0] + ". " + " ".join(parts[1:])
    return name


def papers_with(record, name):
    return [p for p in record["papers"] if name in p.get("authors", [])]


def resolve_author(record, raw, self_name):
    """Turn one typed name into a name already in the record, or a new one.

    Returns (name, is_new). A new name still has to be given a gender.
    """
    name = tidy(raw)
    known = sorted({a for p in record["papers"] for a in p.get("authors", [])})

    exact = next((k for k in known if k == name), None)
    near = [k for k in known if k != exact and fold(k) == fold(name)]

    if exact is None and near:
        print(f"  '{name}' is not in the record, but '{near[0]}' is — same spelling, "
              f"different accents or punctuation.")
        if ask_yes(f"  use '{near[0]}'?"):
            exact = near[0]

    if exact is None:
        # a surname match is the common case for a different initial
        surname = fold(name.split()[-1]) if name.split() else ""
        cousins = [k for k in known if k.split() and fold(k.split()[-1]) == surname]
        if cousins:
            print(f"  '{name}' is new. The record already has: {', '.join(cousins)}.")
            if ask_yes("  is it one of those (a different initial for the same person)?", False):
                pick, _ = choose("  which one", cousins)
                return pick, False
        return name, True

    if exact == self_name:
        return exact, False

    shared = papers_with(record, exact)
    print(f"  '{exact}' is already in the record — {len(shared)} paper"
          f"{'' if len(shared) == 1 else 's'} with you:")
    for p in shared[:4]:
        print(f"      {p['year']}  {p['title'][:66]}")
    if len(shared) > 4:
        print(f"      … and {len(shared) - 4} more")
    if ask_yes("  same person?"):
        return exact, False

    print("  then this is a different person with the same name.")
    print("  give them a name that tells them apart, e.g. a middle initial or")
    print("  a fuller first name — it is what the page will display.")
    while True:
        alt = tidy(ask("  distinct name"))
        if alt and alt not in known:
            return alt, True
        print("  that one is taken; try another.")


# -------------------------------------------------------------------- main

def next_id(record):
    used = {p["id"] for p in record["papers"]}
    n = 1
    while f"p{n}" in used:
        n += 1
    return f"p{n}"


def main():
    if not CONTENT.exists():
        sys.exit(f"{CONTENT} not found.")
    record = json.loads(CONTENT.read_text(encoding="utf-8"))
    profile = record["profile"]
    self_name = profile["self"]

    print(f"Adding a paper to {CONTENT.relative_to(HERE)} — Ctrl-C to abandon.\n")

    title = ask("Title")
    year = ask_int("Year", 1990, date.today().year + 3, date.today().year)
    venue = ask("Venue, as it should be displayed (e.g. 'ICWSM', 'Scientific Reports')")

    venue_type, _ = choose("Publication type", profile["categories"])
    topic, new_topic = choose("Topic", profile["topics"], allow_new=True)
    affils, new_affils = choose_many("Affiliation(s) on the paper",
                                     sorted(profile["affilCountry"]), allow_new=True)

    url = ask("Link for the title (DOI or arXiv URL)", "", required=False)
    ids = ask("Identifier line shown in small type (e.g. 'arXiv:2601.00001')", "", required=False)

    # --- authors
    print("\nAuthors, in order. One per line; an empty line ends the list.")
    print(f"House style is 'F. Lastname'. Yours is '{self_name}'.")
    authors, pending_gender = [], {}
    while True:
        raw = ask(f"  author {len(authors) + 1}", "", required=False)
        if not raw:
            if not authors:
                print("  at least one.")
                continue
            break
        name, is_new = resolve_author(record, raw, self_name)
        if name in authors:
            print(f"  '{name}' is already on this paper; skipped.")
            continue
        if is_new and name != self_name:
            g, _ = choose(f"  gender recorded for '{name}' (colours the co-author graph)",
                          [f"{k} — {v}" for k, v in profile["genderLabels"].items()])
            pending_gender[name] = g.split(" ")[0]
        authors.append(name)
        print(f"  -> {name}")

    if self_name not in authors:
        print(f"\n! '{self_name}' is not among the authors.")
        if ask_yes("  add yourself?"):
            authors.append(self_name)

    # --- confirm
    paper = {"id": next_id(record), "year": year, "title": title, "authors": authors,
             "venue": venue, "venueType": venue_type, "topic": topic, "affils": affils}
    if url:
        paper["url"] = url
    if ids:
        paper["ids"] = ids

    print("\n" + "-" * 66)
    for k in ("id", "year", "title", "venue", "venueType", "topic"):
        print(f"  {k:10} {paper[k]}")
    print(f"  {'affils':10} {', '.join(affils)}")
    print(f"  {'authors':10} {', '.join(authors)}")
    if url:
        print(f"  {'url':10} {url}")
    if ids:
        print(f"  {'ids':10} {ids}")
    if pending_gender:
        print(f"  {'new':10} " + ", ".join(f"{k} ({v})" for k, v in pending_gender.items()))
    if new_topic:
        print(f"  {'new topic':10} {topic}")
    if new_affils:
        print(f"  {'new affil':10} {', '.join(new_affils)}")
    print("-" * 66)
    if not ask_yes("\nWrite this?"):
        sys.exit("nothing written.")

    for name, g in pending_gender.items():
        profile["coauthorGender"][name] = g
    if new_topic and topic not in profile["topics"]:
        profile["topics"].insert(len(profile["topics"]) - 1, topic)   # before "Other"
    for a in new_affils:
        if a not in profile["affilCountry"]:
            profile["affilCountry"][a] = ask(f"Country for '{a}'")

    record["papers"].insert(0, paper)
    record["papers"].sort(key=lambda p: -p["year"])

    shutil.copy2(CONTENT, CONTENT.with_suffix(".json.bak"))
    CONTENT.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nadded as {paper['id']}. Previous file kept as {CONTENT.name}.bak")
    print("add its citations to data/citations-by-paper-year.csv when it has any, then:")
    print("    python3 build.py")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit("\nnothing written.")
