/* Research record — behaviour.
   Loaded after data/dashboard.js, which defines window.DASHBOARD.
   Sections: 1 data hand-off, 2 utilities, 3 store, 4 views, 5 app. */

"use strict";
/* ============================================================================
   1. DATA
   ----------------------------------------------------------------------------
   Everything the page shows lives in data/dashboard.js — publications,
   citation counts, profile, links, tools and the co-author gender map.
   That file is loaded by a script tag in the head, which works both from a
   web server and straight from disk. Edit it to adapt this page to someone
   else; nothing here needs touching. Its images live in assets/.
   ========================================================================= */

/* ============================================================================
   2. UTILITIES — pure, no DOM
   ========================================================================= */
const Util = {
  CAT_COLOR: {
    "Journal":"var(--c-journal)", "Conference":"var(--c-conference)",
    "Workshop in proceedings":"var(--c-workshop)",
    "Tutorial in proceedings":"var(--c-tutorial)", "Workshop":"var(--c-workshop2)",
    "Preprint":"var(--c-preprint)",
    "Under review":"var(--c-review)", "In preparation":"var(--c-prep)",
    "Thesis":"var(--c-thesis)"
  },
  /** Categories treated as not-yet-published, hidden by the checkbox. */
  UNPUBLISHED: ["Preprint","Under review","In preparation"],

  FALLBACK: ["#1F7A6E","#3D5A6C","#5F7A3A","#2E6F8E","#93AC6E","#8C6D4F","#C9922F","#7A4A6B","#A85A3C"],

  catColor(cat){ return Util.CAT_COLOR[cat] || "#9DA79E"; },

  colorFor(key, keys){
    if (Util.CAT_COLOR[key]) return Util.CAT_COLOR[key];
    const i = keys.indexOf(key);
    return i < 0 ? "#9DA79E" : Util.FALLBACK[i % Util.FALLBACK.length];
  },

  num(v){ return (v === null || v === undefined || v === "") ? null : Number(v); },

  hIndex(counts){
    const c = counts.filter(x => x !== null).sort((a,b) => b - a);
    let h = 0; c.forEach((v,i) => { if (v >= i + 1) h = i + 1; });
    return h;
  },
  i10(counts){ return counts.filter(x => x !== null && x >= 10).length; },
  sum(counts){
    const k = counts.filter(x => x !== null);
    return k.length ? k.reduce((a,b) => a + b, 0) : null;
  },
  groupBy(items, keyFn){
    const m = new Map();
    items.forEach(it => { const k = keyFn(it); if (!m.has(k)) m.set(k, []); m.get(k).push(it); });
    return m;
  },
  uniq(a){ return Array.from(new Set(a)); },
  pairs(l){
    const o = [];
    for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) o.push([l[i], l[j]]);
    return o;
  },
  lastName(n){ const p = n.replace(/\s+/g," ").trim().split(" "); return p[p.length-1]; },
  esc(s){ return String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); },
  debounce(fn, ms){ let t; return function(...a){ clearTimeout(t); t = setTimeout(() => fn.apply(this,a), ms); }; }
};

/* ============================================================================
   3. STORE — single source of truth
   ========================================================================= */
class Store {
  constructor(seed){ this.listeners = []; this.load(seed); }

  load(data){
    this.data = JSON.parse(JSON.stringify(data));
    this.data.papers.forEach(p => {
      p.citations = Util.num(p.citations);
      // tolerate the older single-string `affil` field
      if (!Array.isArray(p.affils)) p.affils = p.affil ? String(p.affil).split(/\s*\/\s*/) : [];
    });
    this.filters = { year:null, topic:null, authors:[], cat:null, text:"", hideUnpub:false };
    this.view = { groupBy:"year", sortBy:"cites-desc",
                  netMode:"ego", netMin:1 };
    this.emit();
  }

  subscribe(fn){ this.listeners.push(fn); }
  emit(source){ this.listeners.forEach(fn => fn(this, source)); }
  set(path, value, source){ const [s,k] = path.split("."); this[s][k] = value; this.emit(source); }

  /** Add or remove one author from the selection. */
  toggleAuthor(name){
    const a = this.filters.authors;
    const i = a.indexOf(name);
    if (i === -1) a.push(name); else a.splice(i, 1);
    this.emit();
  }
  hasAuthor(name){ return this.filters.authors.includes(name); }
  get self(){ return this.data.profile.self; }
  get categories(){
    return this.data.profile.categories ||
           Util.uniq(this.data.papers.map(p => p.venueType));
  }
  /** Inferred gender of a co-author, for the graph's colouring. */
  genderOf(name){
    if (name === this.self) return "self";
    return (this.data.profile.coauthorGender || {})[name] || "U";
  }

  /** Citations for a work, counting any alternate versions of it. */
  citesOf(p){
    const own = p.citations || 0;
    return own + (p.versions || []).reduce((a,v) => a + (v.citations || 0), 0);
  }

  /** Primary affiliation — the first listed, per the CV convention. */
  primaryAffil(p){ return (p.affils && p.affils[0]) || "—"; }

  /** Country of the primary affiliation, via the lookup in the profile. */
  countryOf(p){
    const map = this.data.profile.affilCountry || {};
    return map[this.primaryAffil(p)] || "Unknown";
  }

  /** Where the author sits in the byline. */
  authorshipOf(p){
    const a = p.authors || [];
    if (a.length === 1) return "Sole author";
    if (a[0] === this.self) return "First author";
    if (a[a.length-1] === this.self) return "Last author";
    return "Elsewhere";
  }
  get authorshipOrder(){
    return this.data.profile.authorshipOrder ||
           ["First author","Last author","Elsewhere","Sole author"];
  }

  /** Filters shared by both scopes; the published-only rule is per-scope. */
  matches(p, hideUnpub){
    const f = this.filters, q = f.text.trim().toLowerCase();
    if (hideUnpub && Util.UNPUBLISHED.includes(p.venueType)) return false;
    if (f.year !== null && p.year !== f.year) return false;
    if (f.cat && p.venueType !== f.cat) return false;
    if (f.topic && p.topic !== f.topic) return false;
    // several authors narrow rather than replace: the paper must have them all
    if (f.authors.length && !f.authors.every(a => p.authors.includes(a))) return false;
    if (q){
      const hay = [p.title, p.venue, p.topic, p.year, p.venueType,
                   p.authors.join(" "), (p.affils||[]).join(" ")]
        .join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  /** The list (and the co-author graph) follow filters.hideUnpub. */
  get filtered(){ return this.data.papers.filter(p => this.matches(p, this.filters.hideUnpub)); }

  /** The charts read the same set as the list; the toggle is shared. */
  get chartPapers(){ return this.filtered; }

  /**
   * Three citation bands pinned to the h-index of whatever is currently shown:
   * at or above h, between 1 and h-1, and uncited. Empty bands are dropped.
   */
  tierBands(){
    const papers = this.filtered;
    if (!papers.length) return [];
    const counts = papers.map(p => this.citesOf(p));
    const hAll = this.data.profile.hIndex;
    const h = (hAll != null && papers.length === this.data.papers.length)
      ? hAll : Util.hIndex(counts);
    const hi = Math.max(1, h);

    const bands = [
      { min:hi,       max:Infinity, label:`h-index and above (${hi}+)` },
      { min:1,        max:hi - 1,   label: hi > 2 ? `Below h-index (1–${hi-1})` : `Below h-index (1)` },
      { min:0,        max:0,        label:"Uncited (0)" }
    ];
    return bands.filter(b => counts.some(v => v >= b.min && v <= b.max));
  }

  tierOf(p){
    const v = this.citesOf(p);
    const band = this.tierBands().find(b => v >= b.min && v <= b.max);
    return band ? band.label : "—";
  }

  /** Stacked series: one column per year, one layer per category. */
  stack(valueFn){
    const papers = this.filtered;
    const cats = this.categories;
    const byYear = Util.groupBy(papers, p => p.year);
    return Array.from(byYear, ([year, ps]) => {
      const parts = cats.map(c => {
        const inCat = ps.filter(p => p.venueType === c);
        return { cat:c, value: inCat.reduce((a,p) => a + valueFn(p), 0), papers: inCat };
      }).filter(s => s.value > 0);
      return { key:year, parts, total: parts.reduce((a,s) => a + s.value, 0) };
    }).sort((a,b) => a.key - b.key);
  }

  network(){
    const self = this.self, papers = this.filtered;
    const count = new Map(), linkW = new Map();
    papers.forEach(p => {
      const roster = this.view.netMode === "ego" ? p.authors : p.authors.filter(a => a !== self);
      roster.forEach(a => count.set(a, (count.get(a)||0) + 1));
      Util.pairs(roster).forEach(([a,b]) => {
        const k = [a,b].sort().join("||");
        linkW.set(k, (linkW.get(k)||0) + 1);
      });
    });
    // the threshold drops people from the graph entirely, so the gender key
    // and the counts describe exactly what is drawn
    const min = this.view.netMin || 1;
    const keep = new Set(Array.from(count)
      .filter(([id,papers]) => id === self || papers >= min)
      .map(([id]) => id));
    return {
      nodes: Array.from(count)
        .filter(([id]) => keep.has(id))
        .map(([id,papers]) => ({ id, papers, self:id === self })),
      links: Array.from(linkW)
        .map(([k,w]) => { const [source,target] = k.split("||"); return {source,target,w}; })
        .filter(l => keep.has(l.source) && keep.has(l.target))
    };
  }

}

/* ============================================================================
   4. VIEWS
   ========================================================================= */
class GlanceView {
  constructor(el){ this.el = el; }
  render(store){
    const ps = store.data.papers, prof = store.data.profile;
    const counts = ps.map(p => p.citations);
    const total = prof.citationsTotal != null ? prof.citationsTotal : Util.sum(counts);
    const years = ps.map(p => p.year);
    const peers = Util.uniq(ps.flatMap(p => p.authors).filter(a => a !== store.self)).length;
    const cells = [
      { n: ps.length, k:"works" },
      { n: total, k:"citations" },
      { n: prof.hIndex != null ? prof.hIndex : Util.hIndex(counts), k:"h-index" },
      { n: prof.i10Index != null ? prof.i10Index : Util.i10(counts), k:"i10-index" },
      { n: peers, k:"co-authors" },
      { n: prof.activeRange || `${d3.min(years)}–${d3.max(years)}`, k:"active" }
    ];
    this.el.innerHTML = cells.map(c => `
      <div><span class="n">${c.n === null ? "—" : c.n}</span>
      <span class="k">${c.k}</span></div>`).join("");
  }
}

/** Academic and social profile links, clustered by group. */
class ProfilesView {
  constructor(el){ this.el = el; }
  render(store){
    const list = store.data.profile.profiles || [];
    if (!list.length){ this.el.innerHTML = ""; return; }
    const groups = Util.groupBy(list, p => p.group || "Elsewhere");
    this.el.innerHTML = Array.from(groups, ([label, items]) => `
      <div class="pgroup">
        <span class="plabel">${Util.esc(label)}</span>
        ${items.map(i => `<a href="${Util.esc(i.url)}" target="_blank" rel="noopener">${Util.esc(i.name)}</a>`).join("")}
      </div>`).join("");
  }
}

class LegendView {
  constructor(el){ this.el = el; }
  render(store){
    const present = Util.uniq(store.data.papers.map(p => p.venueType));
    this.el.innerHTML = store.categories.filter(c => present.includes(c)).map(c =>
      `<span><i style="background:${Util.catColor(c)}"></i>${Util.esc(c)}</span>`).join("");
  }
}

/**
 * Stacked column chart. `interactive:true` attaches the venue popup;
 * `interactive:false` renders identical bars that ignore clicks.
 */
class StackedChartView {
  constructor(svgSel, wrapSel, opts){
    this.svg = d3.select(svgSel);
    this.wrap = document.querySelector(wrapSel);
    this.opts = opts;                       // { interactive, emptyText }
    this.popup = null;
    StackedChartView.instances.push(this);   // so one popup can dismiss the others
    if (opts.interactive){
      document.addEventListener("click", e => {
        if (this.popup && !this.popup.contains(e.target) && !this.svg.node().contains(e.target))
          this.closePopup();
      });
    }
  }

  closePopup(){ if (this.popup){ this.popup.remove(); this.popup = null; } }

  /** Only one segment popup should be open across all charts at a time. */
  closeOthers(){ StackedChartView.instances.forEach(v => { if (v !== this) v.closePopup(); }); }

  render(series, store){
    const W = 520, H = 200, M = { t:8, r:6, b:22, l:32 };
    const svg = this.svg.attr("viewBox", `0 0 ${W} ${H}`);
    svg.selectAll("*").remove();
    this.closePopup();

    if (!series.length || !series.some(s => s.total > 0)){
      svg.append("text").attr("x", M.l).attr("y", 44)
         .attr("class","empty-note").text(this.opts.emptyText || "Nothing to show.");
      return;
    }

    const x = d3.scaleBand().domain(series.map(d => d.key)).range([M.l, W-M.r]).padding(0.22);
    const y = d3.scaleLinear().domain([0, d3.max(series, d => d.total) || 1]).nice()
                .range([H-M.b, M.t]);

    // tick lines first, so the bars sit on top of them
    svg.append("g").attr("class","grid").selectAll("line")
      .data(y.ticks(4)).join("line")
      .attr("x1", M.l).attr("x2", W - M.r)
      .attr("y1", d => y(d)).attr("y2", d => y(d));

    svg.append("g").attr("class","axis").attr("transform",`translate(0,${H-M.b})`)
       .call(d3.axisBottom(x)
         .tickValues(x.domain().filter((d,i) => series.length < 13 || i % 2 === 0))
         .tickSizeOuter(0));
    svg.append("g").attr("class","axis").attr("transform",`translate(${M.l},0)`)
       .call(d3.axisLeft(y).ticks(4).tickSizeOuter(0));

    const col = svg.selectAll(".colgroup").data(series).join("g")
      .attr("class", d => "colgroup" + (String(d.key) === String(store.filters.year) ? " active" : ""));

    const self = this;
    col.each(function(d){
      let acc = 0;
      d3.select(this).selectAll("g").data(d.parts).join("g")
        .attr("class", "seg" + (self.opts.interactive ? "" : " flat"))
        .attr("tabindex", self.opts.interactive ? 0 : null)
        .attr("role", self.opts.interactive ? "button" : null)
        .attr("aria-label", s => `${d.key}, ${s.cat}: ${s.value}`)
        .each(function(s){
          const y0 = acc; acc += s.value;
          d3.select(this).append("rect")
            .attr("x", x(d.key)).attr("width", x.bandwidth())
            .attr("y", y(acc)).attr("height", Math.max(1, y(y0) - y(acc)))
            .attr("fill", Util.catColor(s.cat));
          d3.select(this).append("title").text(`${d.key} · ${s.cat}: ${s.value}`);
        })
        .on("click", function(e, s){
          if (!self.opts.interactive) return;
          e.stopPropagation();
          self.showPopup(e, d, s, store);
        })
        .on("keydown", function(e, s){
          if (self.opts.interactive && (e.key === "Enter" || e.key === " ")){
            e.preventDefault(); self.showPopup(e, d, s, store);
          }
        });
    });
  }

  showPopup(event, column, seg, store){
    this.closePopup();
    this.closeOthers();
    const papers = seg.papers.slice().sort((a,b) => store.citesOf(b) - store.citesOf(a));
    const cites = papers.reduce((a,p) => a + store.citesOf(p), 0);
    const self = store.self;

    const rows = papers.map(p => {
      const title = p.url
        ? `<a class="t" href="${Util.esc(p.url)}" target="_blank" rel="noopener">${Util.esc(p.title)}</a>`
        : `<span class="t">${Util.esc(p.title)}</span>`;
      const role = store.authorshipOf(p);
      const others = p.authors.filter(a => a !== self).length;
      const peers = `${others} co-author${others === 1 ? "" : "s"}`;
      // only first and last position are worth naming; middle authorship just shows the count
      const who = role === "Sole author" ? "sole author"
                : role === "Elsewhere"   ? peers
                : `${role.toLowerCase()}, ${peers}`;
      return `<li>
        ${title}
        <div class="m"><span>${Util.esc(p.venue)}</span>
          <span class="c">${store.citesOf(p)} cit.</span></div>
        <div class="au">${Util.esc(who)}</div>
      </li>`;
    }).join("");

    const box = document.createElement("div");
    box.className = "popup";
    box.innerHTML =
      `<div class="ph"><i style="background:${Util.catColor(seg.cat)}"></i>
         <span class="lab">${column.key} · ${Util.esc(seg.cat)}</span>
         <span class="sum">${papers.length} ${papers.length === 1 ? "work" : "works"} · ${cites} cit.</span>
       </div>
       <ul class="pl">${rows}</ul>
       <div class="pf"><button data-act="close">Close</button></div>`;

    const wrapBox = this.wrap.getBoundingClientRect();
    box.style.left = Math.max(6, Math.min(event.clientX - wrapBox.left + 8, wrapBox.width - 310)) + "px";
    box.style.top  = Math.max(6, event.clientY - wrapBox.top + 8) + "px";
    this.wrap.appendChild(box);
    this.popup = box;

    box.addEventListener("click", e => {
      if (e.target.closest('button[data-act="close"]')) this.closePopup();
    });
  }
}

StackedChartView.instances = [];

/** Plain (unstacked) columns — used for the Scholar received-per-year series. */
class SimpleChartView {
  constructor(svgSel, color){ this.svg = d3.select(svgSel); this.color = color; }
  render(series, emptyText){
    const W = 520, H = 200, M = { t:8, r:6, b:22, l:32 };
    const svg = this.svg.attr("viewBox", `0 0 ${W} ${H}`);
    svg.selectAll("*").remove();
    if (!series.length){
      svg.append("text").attr("x", M.l).attr("y", 44).attr("class","empty-note").text(emptyText);
      return;
    }
    const x = d3.scaleBand().domain(series.map(d => d.key)).range([M.l, W-M.r]).padding(0.22);
    const y = d3.scaleLinear().domain([0, d3.max(series, d => d.value) || 1]).nice().range([H-M.b, M.t]);
    // tick lines first, so the bars sit on top of them
    svg.append("g").attr("class","grid").selectAll("line")
      .data(y.ticks(4)).join("line")
      .attr("x1", M.l).attr("x2", W - M.r)
      .attr("y1", d => y(d)).attr("y2", d => y(d));

    svg.append("g").attr("class","axis").attr("transform",`translate(0,${H-M.b})`)
       .call(d3.axisBottom(x).tickValues(x.domain().filter((d,i) => series.length < 13 || i % 2 === 0)).tickSizeOuter(0));
    svg.append("g").attr("class","axis").attr("transform",`translate(${M.l},0)`)
       .call(d3.axisLeft(y).ticks(4).tickSizeOuter(0));
    const g = svg.selectAll(".seg").data(series).join("g").attr("class","seg flat");
    g.append("rect")
      .attr("x", d => x(d.key)).attr("width", x.bandwidth())
      .attr("y", d => y(d.value)).attr("height", d => y(0) - y(d.value))
      .attr("fill", this.color);
    g.append("title").text(d => `${d.key}: ${d.value}`);
  }
}

class PaperListView {
  constructor(el, store){
    this.el = el; this.store = store;
    el.addEventListener("click", e => {
      const b = e.target.closest("button[data-author]");
      if (b) this.store.toggleAuthor(b.dataset.author);
    });
  }

  keyFn(mode, store){
    switch(mode){
      case "year":      return p => p.year;
      case "topic":     return p => p.topic;
      case "venue":     return p => p.venue;
      case "venueType": return p => p.venueType;
      case "affil":     return p => store.primaryAffil(p);
      case "country":   return p => store.countryOf(p);
      case "authorship":return p => store.authorshipOf(p);
      case "citeTier":  return p => store.tierOf(p);
      default:          return () => "All works";
    }
  }
  sortFn(mode){
    switch(mode){
      case "year-asc":   return (a,b) => a.year - b.year || a.title.localeCompare(b.title);
      case "cites-desc": return (a,b) => this.store.citesOf(b) - this.store.citesOf(a);
      case "title":      return (a,b) => a.title.localeCompare(b.title);
      default:           return (a,b) => b.year - a.year || a.title.localeCompare(b.title);
    }
  }

  render(store){
    const papers = store.filtered.slice().sort(this.sortFn(store.view.sortBy));
    if (!papers.length){
      this.el.innerHTML = `<p class="empty-note">Nothing matches these filters.</p>`;
      return;
    }
    const groups = Util.groupBy(papers, this.keyFn(store.view.groupBy, store));
    let keys = Array.from(groups.keys());
    if (store.view.groupBy === "year")
      keys.sort((a,b) => store.view.sortBy === "year-asc" ? a - b : b - a);
    else if (store.view.groupBy === "venueType")
      keys.sort((a,b) => store.categories.indexOf(a) - store.categories.indexOf(b));
    else if (store.view.groupBy === "topic" && store.data.profile.topics){
      const ord = store.data.profile.topics;
      keys.sort((a,b) => ord.indexOf(a) - ord.indexOf(b));
    }
    else if (store.view.groupBy === "citeTier"){
      const ord = store.tierBands().map(b => b.label);
      keys.sort((a,b) => ord.indexOf(a) - ord.indexOf(b));
    }
    else if (store.view.groupBy === "authorship"){
      const ord = store.authorshipOrder;
      keys.sort((a,b) => ord.indexOf(a) - ord.indexOf(b));
    }
    else {
      // no intrinsic order for venue / affiliation / country: rank by weight —
      // citations first, then how many works, and only then the name
      const weight = new Map(keys.map(k => {
        const l = groups.get(k);
        return [k, [l.reduce((a,p) => a + (p.citations || 0), 0), l.length]];
      }));
      keys.sort((a,b) => {
        const wa = weight.get(a), wb = weight.get(b);
        return (wb[0] - wa[0]) || (wb[1] - wa[1]) || String(a).localeCompare(String(b));
      });
    }
    const palette = keys.map(String);

    this.el.innerHTML = keys.map(k => {
      const list = groups.get(k);
      const cites = list.reduce((a,p) => a + store.citesOf(p), 0);
      const sw = store.view.groupBy === "none" ? "" :
        `<span class="swatch" style="background:${Util.colorFor(String(k), palette)}"></span>`;
      return `<div class="group">
        <div class="group-head">${sw}<h3>${Util.esc(k)}</h3>
        <span class="count">${list.length} ${list.length === 1 ? "work" : "works"} · ${cites} ${cites === 1 ? "citation" : "citations"}</span></div>
        ${list.map(p => this.row(p, store)).join("")}
      </div>`;
    }).join("");
  }

  row(p, store){
    const authors = p.authors.map(a => a === store.self
      ? `<span class="self">${Util.esc(a)}</span>`
      : `<button data-author="${Util.esc(a)}" class="${store.hasAuthor(a) ? "on" : ""}"
             title="${store.hasAuthor(a) ? "Remove" : "Add"} ${Util.esc(a)} from the filter">${Util.esc(a)}</button>`
    ).join(", ");
    const title = p.url
      ? `<a href="${p.url}" target="_blank" rel="noopener">${Util.esc(p.title)}</a>`
      : Util.esc(p.title);
    const affils = (p.affils || []).join(" · ");
    return `<article class="paper">
      <div>
        <div class="t">${title}</div>
        <div class="meta">
          <span class="tag"><i style="background:${Util.catColor(p.venueType)}"></i>${Util.esc(p.venueType)}</span>
          <span>·</span><span>${Util.esc(p.venue)}</span>
          <span>·</span><span>${p.year}</span>
          <span>·</span><span>${Util.esc(p.topic)}</span>
          ${affils ? `<span>·</span><span>${Util.esc(affils)}</span>` : ""}
        </div>
        <div class="au">${authors}</div>
        ${p.ids ? `<div class="ids">${Util.esc(p.ids)}</div>` : ""}
      </div>
      <div class="cites">
        <span class="n">${p.citations === null ? "—" : p.citations}</span>
        <span class="cl">${p.citations === 1 ? "citation" : "citations"}</span>
      </div>
    </article>
    ${(p.versions || []).map(v => this.versionRow(v)).join("")}`;
  }

  /** An alternate version of the work above it — same shape, indented, joined
   *  by an elbow, with its own citation count so both remain visible. */
  versionRow(v){
    const title = v.url
      ? `<a href="${Util.esc(v.url)}" target="_blank" rel="noopener">${Util.esc(v.title)}</a>`
      : Util.esc(v.title);
    return `<article class="paper version">
      <div>
        <div class="vlabel">${Util.esc(v.label || "Version")}</div>
        <div class="t">${title}</div>
        ${v.venue ? `<div class="meta"><span>${Util.esc(v.venue)}</span></div>` : ""}
        ${v.ids ? `<div class="ids">${Util.esc(v.ids)}</div>` : ""}
      </div>
      <div class="cites">
        <span class="n">${v.citations === null ? "—" : v.citations}</span>
        <span class="cl">${v.citations === 1 ? "citation" : "citations"}</span>
      </div>
    </article>`;
  }
}

class NetworkView {
  constructor(svgSel, legendSel, store){
    this.svg = d3.select(svgSel); this.legend = d3.select(legendSel); this.store = store; this.sim = null;
  }
  render(store, reheat){
    const { nodes, links } = store.network();
    const el = this.svg.node();
    const W = el.clientWidth || 900, H = el.clientHeight || 560;
    this.svg.attr("viewBox", `0 0 ${W} ${H}`);
    if (!nodes.length){
      this.svg.selectAll("*").remove();
      this.legend.text("No co-authors in the current selection.");
      return;
    }
    const r  = d3.scaleSqrt().domain([1, d3.max(nodes, d => d.papers)]).range([4, 26]);
    const lw = d3.scaleLinear().domain([1, d3.max(links, d => d.w) || 1]).range([0.6, 4]);
    this.svg.selectAll("*").remove();
    const root = this.svg.append("g");

    const linkSel = root.append("g").selectAll("line").data(links).join("line")
      .attr("class","link").attr("stroke-width", d => lw(d.w));
    const nodeSel = root.append("g").selectAll("g").data(nodes, d => d.id).join("g")
      .attr("class","node").attr("tabindex",0)
      .attr("aria-label", d => `${d.id}, ${d.papers} papers`);

    const GENDER = { F:"var(--g-f)", M:"var(--g-m)", U:"var(--g-u)", self:"var(--ink)" };
    nodeSel.append("circle").attr("r", d => r(d.papers))
      .attr("fill", d => GENDER[store.genderOf(d.id)] || GENDER.U)
      .attr("stroke", d => store.hasAuthor(d.id) ? "var(--ink)" : "var(--panel)")
      .attr("stroke-width", d => store.hasAuthor(d.id) ? 3 : 1.5)
      .append("title").text(d => `${d.id} — ${d.papers} paper${d.papers === 1 ? "" : "s"}`);
    nodeSel.append("text").attr("dy", d => -r(d.papers) - 4).attr("text-anchor","middle")
      .text(d => Util.lastName(d.id));

    const act = d => store.toggleAuthor(d.id);
    nodeSel.on("click", (e,d) => act(d))
      .on("keydown", (e,d) => { if (e.key === "Enter") act(d); })
      .on("mouseenter", (e,d) => this.highlight(d, nodeSel, linkSel, links))
      .on("mouseleave", () => { nodeSel.classed("dim",false); linkSel.classed("dim",false).classed("hot",false); });

    this.sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(d => 70 - Math.min(d.w*6,40)).strength(.5))
      .force("charge", d3.forceManyBody().strength(-190))
      .force("center", d3.forceCenter(W/2, H/2))
      .force("collide", d3.forceCollide().radius(d => r(d.papers) + 12))
      // gentle pull to the middle so components with no links between them
      // do not drift off the canvas
      .force("x", d3.forceX(W/2).strength(.055))
      .force("y", d3.forceY(H/2).strength(.09))
      .alpha(reheat ? 1 : .7)
      .on("tick", () => {
        linkSel.attr("x1",d=>d.source.x).attr("y1",d=>d.source.y)
               .attr("x2",d=>d.target.x).attr("y2",d=>d.target.y);
        nodeSel.attr("transform", d => `translate(${d.x},${d.y})`);
      })
      .on("end", () => this.fit(nodes, r, W, H, root));

    nodeSel.call(d3.drag()
      .on("start",(e,d)=>{ if(!e.active) this.sim.alphaTarget(.25).restart(); d.fx=d.x; d.fy=d.y; })
      .on("drag",(e,d)=>{ d.fx=e.x; d.fy=e.y; })
      .on("end",(e,d)=>{ if(!e.active) this.sim.alphaTarget(0); d.fx=null; d.fy=null; }));
    this.zoom = d3.zoom().scaleExtent([.15,4]).on("zoom", e => root.attr("transform", e.transform));
    this.svg.call(this.zoom);

    // count and rank co-authors only: the ego is on every paper by definition,
    // so including it would make it the trivial winner and would not match the
    // gender key below, which is also about collaborators
    const peers = nodes.filter(n => !n.self);
    const top = peers.slice().sort((a,b) => b.papers - a.papers)[0];
    const who = `${peers.length} co-author${peers.length === 1 ? "" : "s"}`;
    const first = (store.data.profile.name || "").split(" ")[0];
    this.legend.text(
      `${nodes.length > peers.length && first ? first + " and " : ""}${who} · ${links.length} ties`
      + (top ? ` · most frequent: ${top.id} (${top.papers})` : ""));

    // colour key, with the share of each group in the current selection
    const labels = store.data.profile.genderLabels || { F:"Women", M:"Men", U:"Not recorded" };
    const tally = {};
    nodes.filter(n => !n.self).forEach(n => {
      const g = store.genderOf(n.id); tally[g] = (tally[g] || 0) + 1;
    });
    const key = document.getElementById("gender-legend");
    if (key) key.innerHTML = ["F","M","U"].filter(g => tally[g]).map(g =>
      `<span><i style="background:${GENDER[g]}"></i>${Util.esc(labels[g] || g)} ${tally[g]}</span>`).join("");
  }
  /** Zoom and pan so every node is inside the frame once the layout settles. */
  fit(nodes, r, W, H, root){
    if (!nodes.length || !this.zoom) return;
    const pad = 18;
    const x0 = d3.min(nodes, d => d.x - r(d.papers)) - pad;
    const x1 = d3.max(nodes, d => d.x + r(d.papers)) + pad;
    const y0 = d3.min(nodes, d => d.y - r(d.papers) - 12) - pad;
    const y1 = d3.max(nodes, d => d.y + r(d.papers)) + pad;
    const bw = x1 - x0, bh = y1 - y0;
    if (!(bw > 0 && bh > 0)) return;
    const k = Math.min(W / bw, H / bh, 1.25);
    const t = d3.zoomIdentity
      .translate(W/2 - k*(x0 + bw/2), H/2 - k*(y0 + bh/2))
      .scale(k);
    this.svg.transition().duration(400).call(this.zoom.transform, t);
  }

  highlight(d, nodeSel, linkSel, links){
    const nb = new Set([d.id]);
    links.forEach(l => {
      const s = l.source.id || l.source, t = l.target.id || l.target;
      if (s === d.id) nb.add(t); if (t === d.id) nb.add(s);
    });
    nodeSel.classed("dim", n => !nb.has(n.id));
    linkSel.classed("dim", l => {
      const s = l.source.id || l.source, t = l.target.id || l.target;
      return s !== d.id && t !== d.id;
    }).classed("hot", l => {
      const s = l.source.id || l.source, t = l.target.id || l.target;
      return s === d.id || t === d.id;
    });
  }
}

class ChipsView {
  constructor(els, store){
    this.els = Array.from(els); this.store = store;
    this.els.forEach(el => el.addEventListener("click", e => {
      const c = e.target.closest("button[data-clear]");
      if (!c) return;
      const k = c.dataset.clear;
      if (k.startsWith("author:")) { this.store.toggleAuthor(k.slice(7)); return; }
      this.store.set("filters." + k, k === "text" ? "" : (k === "hideUnpub" ? false : null));
      if (k === "hideUnpub") window.app.syncToggles();
    }));
  }
  render(store){
    const f = store.filters, out = [];
    if (f.year !== null) out.push(["year", `Year ${f.year}`]);
    if (f.cat) out.push(["cat", f.cat]);
    if (f.topic) out.push(["topic", f.topic]);
    f.authors.forEach(a => out.push(["author:" + a, a]));
    if (f.text) out.push(["text", `“${f.text}”`]);
    if (f.hideUnpub) out.push(["hideUnpub", "Published only"]);
    const html = out.length
      ? `<span class="chip-lead">Filtered by</span>` + out.map(([k,l]) =>
          `<button class="chip" data-clear="${k}" title="Remove this filter">${Util.esc(l)}<span class="x">✕</span></button>`).join("")
      : "";
    this.els.forEach(el => { el.innerHTML = html; });
  }
}

/** Appointments, education and research visits — three timelines sharing one shape. */
class TimelineView {
  constructor(store){
    this.store = store;
    this.els = {
      appointments: document.getElementById("tl-appointments"),
      education:    document.getElementById("tl-education"),
      visits:       document.getElementById("tl-visits")
    };
  }

  when(from, to){
    if (!to) return Util.esc(from);
    const cls = to === "Present" ? " now" : "";
    return `<span class="${cls.trim()}">${Util.esc(from)} – ${Util.esc(to)}</span>`;
  }

  appointment(a){
    const upcoming = a.note === "Upcoming";
    return `<li>
      <div class="when ${upcoming ? "soon" : ""}">${a.to === "Present"
        ? `${Util.esc(a.from)} – <span class="now">Present</span>`
        : `${Util.esc(a.from)} – ${Util.esc(a.to)}`}</div>
      <div>
        <div class="what">${Util.esc(a.role)}${upcoming ? ' <span class="soon">· upcoming</span>' : ""}</div>
        <div class="org">${Util.esc(a.org)}${a.place ? ` · ${Util.esc(a.place)}` : ""}</div>
        ${a.group ? `<div class="sub">${Util.esc(a.group)}</div>` : ""}
        ${a.note && !upcoming ? `<div class="sub">${Util.esc(a.note)}</div>` : ""}
      </div></li>`;
  }

  degree(e){
    const thesis = e.thesisUrl
      ? `<a href="${Util.esc(e.thesisUrl)}" target="_blank" rel="noopener">${Util.esc(e.thesis)}</a>`
      : Util.esc(e.thesis);
    return `<li>
      <div class="when">${Util.esc(e.from)} – ${Util.esc(e.to)}</div>
      <div>
        <div class="what">${Util.esc(e.degree)}</div>
        <div class="org">${Util.esc(e.org)}${e.place ? ` · ${Util.esc(e.place)}` : ""}</div>
        ${e.thesis ? `<div class="sub">Thesis <em>${thesis}</em></div>` : ""}
        ${(e.supervisors || []).length
          ? `<div class="sub">Supervised by ${e.supervisors.map(Util.esc).join(", ")}</div>` : ""}
      </div></li>`;
  }

  visit(v){
    const papers = (v.paperIds || []).map(id => {
      const p = this.store.data.papers.find(x => x.id === id);
      if (!p) return "";
      return p.url
        ? `<a href="${Util.esc(p.url)}" target="_blank" rel="noopener">${Util.esc(p.title)}</a>`
        : Util.esc(p.title);
    }).filter(Boolean).join("<br>");
    return `<li>
      <div class="when">${Util.esc(v.when)}${v.duration
        ? `<span class="dur">${Util.esc(v.duration)}</span>` : ""}</div>
      <div>
        <div class="what">${Util.esc(v.role)}</div>
        <div class="org">${Util.esc(v.org)}${v.place ? ` · ${Util.esc(v.place)}` : ""}</div>
        ${(v.hosts || []).length
          ? `<div class="sub">Hosted by ${v.hosts.map(Util.esc).join(", ")}</div>` : ""}
        ${papers ? `<div class="sub">${Util.esc(v.paperLabel || "Resulting paper")} <em>${papers}</em></div>` : ""}
      </div></li>`;
  }

  render(store){
    const prof = store.data.profile;
    if (this.els.appointments)
      this.els.appointments.innerHTML = (prof.appointments || []).map(a => this.appointment(a)).join("");
    if (this.els.education)
      this.els.education.innerHTML = (prof.education || []).map(e => this.degree(e)).join("");
    if (this.els.visits)
      this.els.visits.innerHTML = (prof.visits || []).map(v => this.visit(v)).join("");
  }
}

/** Tool cards. Uses a supplied screenshot when `image` is set, otherwise an
 *  abstract motif drawn in the page palette — a placeholder, not a mock-up. */
class ToolsView {
  constructor(el){ this.el = el; }

  motif(kind){
    const c = {
      llm:      ["var(--c-journal)","var(--c-review)"],
      planets:  ["var(--c-prep)","var(--c-review)"],
      map:      ["var(--c-workshop)","var(--c-journal)"],
      name:     ["var(--c-conference)","var(--c-workshop2)"],
      gender:   ["var(--c-thesis)","var(--c-prep)"],
      ranks:    ["var(--c-conference)","var(--c-review)"]
    }[kind] || ["var(--c-conference)","var(--c-journal)"];

    const shapes = {
      // ranked list, with one entry pulled out of place
      llm: `<g>${[0,1,2,3,4].map(i =>
              `<rect x="${28+ i*4}" y="${22+i*22}" width="${150-i*14}" height="11" fill="${i===1?c[1]:c[0]}" opacity="${i===1?.95:.45-i*.05}"/>`
            ).join("")}</g>`,
      // orbits of unequal radius
      planets: `<g fill="none" stroke="${c[0]}" opacity=".55">
            <ellipse cx="130" cy="75" rx="98" ry="34"/><ellipse cx="130" cy="75" rx="68" ry="23"/>
            <ellipse cx="130" cy="75" rx="38" ry="13"/></g>
          <circle cx="130" cy="75" r="12" fill="${c[1]}"/>
          <circle cx="228" cy="75" r="6" fill="${c[0]}"/><circle cx="62" cy="75" r="4" fill="${c[0]}"/>
          <circle cx="130" cy="52" r="3.5" fill="${c[0]}"/>`,
      // choropleth grid
      map: `<g>${Array.from({length:36},(_,i) => {
              const x = 40 + (i%9)*22, y = 20 + Math.floor(i/9)*28;
              const o = [.2,.35,.5,.65,.8,.95][(i*7)%6];
              return `<rect x="${x}" y="${y}" width="20" height="26" fill="${c[0]}" opacity="${o}"/>`;
            }).join("")}</g>`,
      // two records collapsing into one
      name: `<rect x="26" y="34" width="86" height="24" fill="${c[0]}" opacity=".75"/>
          <rect x="26" y="92" width="86" height="24" fill="${c[0]}" opacity=".75"/>
          <rect x="168" y="63" width="86" height="24" fill="${c[1]}"/>
          <path d="M116 46 L164 71 M116 104 L164 79" stroke="${c[0]}" stroke-width="2" fill="none" opacity=".6"/>`,
      // split distribution
      gender: `<g>${Array.from({length:12},(_,i) => {
              const h2 = [30,48,62,78,90,102,96,80,66,50,36,24][i];
              return `<rect x="${26+i*19}" y="${130-h2}" width="13" height="${h2}"
                       fill="${i>6?c[1]:c[0]}" opacity="${i>6?.9:.65}"/>`;
            }).join("")}</g>`
      ,
      // a ranked column where the top slots are taken by one group
      ranks: `<g>${Array.from({length:8},(_,i) => {
              const y = 14 + i*16, top = i < 3;
              return `<rect x="34" y="${y}" width="12" height="12" fill="${top?c[1]:c[0]}" opacity="${top?.95:.5}"/>
                      <rect x="52" y="${y}" width="${150 - i*11}" height="12"
                            fill="${top?c[1]:c[0]}" opacity="${top?.4:.18}"/>`;
            }).join("")}</g>
          <text x="212" y="26" font-size="11" fill="${c[1]}" opacity=".85">1</text>
          <text x="212" y="138" font-size="11" fill="${c[0]}" opacity=".6">n</text>`
    }[kind] || "";

    return `<svg viewBox="0 0 260 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
      <rect width="260" height="150" fill="var(--ground)"/>${shapes}</svg>`;
  }

  render(store){
    const tools = store.data.tools || [];
    if (!tools.length){ this.el.innerHTML = ""; return; }
    this.el.innerHTML = tools.map(t => {
      const shot = t.image
        ? `<img src="${Util.esc(t.image)}" alt="${Util.esc(t.name)}" loading="lazy">`
        : this.motif(t.motif);
      const rel = (t.paperIds || []).map(id => {
        const p = store.data.papers.find(x => x.id === id);
        if (!p) return "";
        return p.url
          ? `<span><a href="${Util.esc(p.url)}" target="_blank" rel="noopener">${Util.esc(p.title)}</a></span>`
          : `<span>${Util.esc(p.title)}</span>`;
      }).filter(Boolean).join("");
      return `<article class="tool">
        <a class="shot" href="${Util.esc(t.url)}" target="_blank" rel="noopener"
           aria-label="Open ${Util.esc(t.name)}">${shot}</a>
        <div class="body">
          <h3>${Util.esc(t.name)}</h3>
          <p>${Util.esc(t.blurb)}</p>
          ${rel ? `<div class="rel"><b>From</b>${rel}</div>` : ""}
          <a class="go" href="${Util.esc(t.url)}" target="_blank" rel="noopener">Open the tool →</a>
        </div>
      </article>`;
    }).join("");
  }
}

/* ============================================================================
   5. APP
   ========================================================================= */
class App {
  constructor(seed){
    this.store = new Store(seed);
    this.views = {
      glance: new GlanceView(document.getElementById("glance")),
      legend: new LegendView(document.getElementById("legend")),
      profiles: new ProfilesView(document.getElementById("hdr-profiles")),
      pubs: new StackedChartView("#chart-pubs", "#wrap-pubs", {
        interactive:true, emptyText:"No works in this selection."
      }),
      cbp: new StackedChartView("#chart-cbp", "#wrap-cbp", {
        interactive:true, emptyText:"No citations in this selection."
      }),
      recv: new SimpleChartView("#chart-recv", "var(--c-total)"),
      papers: new PaperListView(document.getElementById("paper-list"), this.store),
      network: new NetworkView("#network", "#net-legend", this.store),
      chips: new ChipsView(document.querySelectorAll("[data-chips]"), this.store),
      tools: new ToolsView(document.getElementById("tool-grid")),
      timeline: new TimelineView(this.store)
    };
    this.bindControls();
    this.store.subscribe((s, source) => this.render(s, source));
    this.render(this.store);
    this.views.network.render(this.store, true);
  }

  bindControls(){
    const on = (id,ev,fn) => document.getElementById(id).addEventListener(ev,fn);
    on("group-by","change", e => this.store.set("view.groupBy", e.target.value));
    on("sort-by","change",  e => this.store.set("view.sortBy", e.target.value));
    document.querySelectorAll(".pub-toggle").forEach(box =>
      box.addEventListener("change", e => this.store.set("filters.hideUnpub", e.target.checked)));
    on("search","input", Util.debounce(e => this.store.set("filters.text", e.target.value), 180));
    on("net-mode","change", e => { this.store.set("view.netMode", e.target.value); this.views.network.render(this.store,true); });
    on("net-min","input",   e => { this.store.set("view.netMin", Number(e.target.value)||1); this.views.network.render(this.store,false); });
    on("net-reheat","click", () => this.views.network.render(this.store,true));
    this.syncControls();

    let sig = "";
    this.store.subscribe(s => {
      const n = JSON.stringify([s.filters.year,s.filters.topic,s.filters.author,
                                s.filters.cat,s.filters.text,s.filters.hideUnpub,
                                s.filters.authors.join("|"),s.view.netMode]);
      if (n !== sig){ sig = n; this.views.network.render(s,false); }
    });
  }

  /** Keep the three "Published only" boxes showing the same state. */
  syncToggles(){
    document.querySelectorAll(".pub-toggle").forEach(b => { b.checked = this.store.filters.hideUnpub; });
  }

  syncControls(){
    this.syncToggles();
    document.getElementById("group-by").value = this.store.view.groupBy;
    document.getElementById("sort-by").value  = this.store.view.sortBy;
    document.getElementById("net-mode").value = this.store.view.netMode;
    document.getElementById("net-min").value  = this.store.view.netMin;
  }


  render(store, source){
    const prof = store.data.profile;
    document.getElementById("hdr-name").textContent = prof.name;
    document.getElementById("hdr-role").textContent = prof.role;
    document.getElementById("hdr-affils").textContent = (prof.affiliations || []).join(" · ");
    const ego = document.getElementById("opt-ego");
    if (ego) ego.textContent = `Include ${prof.name.split(" ")[0]} at the centre`;
    const photo = document.getElementById("hdr-photo");
    if (prof.headshot){
      if (!photo.firstChild)
        photo.innerHTML = `<img src="${prof.headshot}" alt="${Util.esc(prof.name)}">`;
      photo.hidden = false;
    } else photo.hidden = true;

    this.syncToggles();
    this.views.glance.render(store);
    this.views.legend.render(store);
    this.views.profiles.render(store);
    this.views.chips.render(store);
    this.views.papers.render(store);
    this.views.tools.render(store);
    this.views.timeline.render(store);

    const inCharts = store.filtered;
    const pubSeries = store.stack(() => 1);
    this.views.pubs.render(pubSeries, store);
    document.getElementById("pub-sub").textContent =
      `${inCharts.length} of ${store.data.papers.length} works`;
    document.getElementById("chart-scope").textContent = store.filters.hideUnpub
      ? "excluding preprints, under review and in preparation"
      : "including unpublished work";

    const cbpSeries = store.stack(p => store.citesOf(p));
    this.views.cbp.render(cbpSeries, store);
    const cbpTotal = cbpSeries.reduce((a,s) => a + s.total, 0);
    document.getElementById("cbp-sub").textContent =
      `${cbpTotal} citations, placed in the year the work appeared`;

    const cby = store.data.citationsByYear || {};
    const recv = Object.keys(cby).sort().map(k => ({ key:Number(k), value:Number(cby[k]) }));
    this.views.recv.render(recv, "No yearly histogram in the data.");
    document.getElementById("recv-sub").textContent = recv.length
      ? `${d3.sum(recv, d => d.value)} citations, in the year they arrived · not affected by filters`
      : "not filled in yet";

    document.getElementById("footer").textContent = prof.source
      ? prof.source + (prof.asOf ? ` Figures as of ${prof.asOf}.` : "")
      : "";
  }
}

/** Build the page from the record loaded by data/dashboard.js. */
function boot(){
  const data = window.DASHBOARD;
  const main = document.querySelector("main");
  if (!data || !Array.isArray(data.papers)){
    const err = window.__loadError;
    main.innerHTML = `<section><div class="loaderr">
      <h2>${err ? "data/dashboard.js could not be read" : "No data loaded"}</h2>
      ${err
        ? `<p><code>${Util.esc(err.message)}</code></p>
           <p>Line ${err.line}, column ${err.col} of <code>data/dashboard.js</code>.
              Fix that line and reload.</p>`
        : `<p><code>data/dashboard.js</code> should sit next to this file and set
             <code>window.DASHBOARD</code>. Check that the folder was copied whole.</p>`}
    </div></section>`;
    return;
  }
  window.app = new App(data);
}
document.addEventListener("DOMContentLoaded", boot);
window.addEventListener("resize", Util.debounce(() => {
  if (window.app) window.app.views.network.render(window.app.store, false);
}, 250));
