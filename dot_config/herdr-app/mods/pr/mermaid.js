// Mermaid without a browser: parses a sequence diagram or a flowchart and lays it out as a
// "scene" of rectangles, lines, arrowheads and labels in pixels. scene.js draws a scene.
// Pure: no Herdr or UI imports, so `node` can test it.
//
// Drawn: sequenceDiagram (participants, actors, messages, self-messages, notes, and the
// loop / alt / opt / par / critical / break / rect frames) and flowchart / graph in TD, BT,
// LR and RL (node shapes, edge labels, dotted and thick edges, chains, `&`, subgraphs).
// Anything else returns null and the caller shows the source instead.

export const CH = 7.25; // width of one monospace character at 12px
export const LH = 17;   // line height

function tidy(text) {
  return String(text ?? "").trim()
    .replace(/^"([\s\S]*)"$/, "$1").replace(/^`([\s\S]*)`$/, "$1")
    .replace(/<br\s*\/?>/gi, "\n").replace(/\\n/g, "\n")
    .replace(/#quot;/g, '"').replace(/#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/<\/?(?:b|i|em|strong|code|sub|sup)>/gi, "").replace(/\*\*(.+?)\*\*/g, "$1");
}

function wrapLines(text, max) {
  const out = [];
  for (const para of tidy(text).split("\n")) {
    let line = "";
    for (const word of para.trim().split(/\s+/)) {
      if (line && line.length + 1 + word.length > max) { out.push(line); line = word; }
      else line = line ? `${line} ${word}` : word;
    }
    out.push(line);
  }
  return out.length ? out : [""];
}

const textW = (lines) => Math.max(1, ...lines.map((l) => l.length)) * CH;
const textH = (lines) => lines.length * LH;
const mean = (list) => list.reduce((a, b) => a + b, 0) / (list.length || 1);

function emptyScene() { return { w: 0, h: 0, rects: [], paths: [], heads: [], texts: [] }; }

// A filled arrowhead with its tip at (x, y), pointing along (dx, dy).
function arrowhead(s, x, y, dx, dy) {
  const bx = x - dx * 9, by = y - dy * 9, px = -dy * 4.5, py = dx * 4.5;
  s.heads.push({ pts: [[x, y], [bx + px, by + py], [bx - px, by - py]] });
}

// Moves everything so the drawing starts at `pad`, and records its size.
function finish(s, pad = 14) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const see = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const r of [...s.rects, ...s.texts]) { see(r.x, r.y); see(r.x + r.w, r.y + r.h); }
  for (const p of [...s.paths, ...s.heads]) for (const [x, y] of p.pts) see(x, y);
  if (!Number.isFinite(x0)) return null;
  const dx = pad - x0, dy = pad - y0;
  for (const r of [...s.rects, ...s.texts]) { r.x += dx; r.y += dy; }
  for (const p of [...s.paths, ...s.heads]) p.pts = p.pts.map(([x, y]) => [x + dx, y + dy]);
  s.w = Math.ceil(x1 - x0 + pad * 2); s.h = Math.ceil(y1 - y0 + pad * 2);
  return s;
}

function mirror(s, axis) {
  const size = axis === 0 ? s.w : s.h, at = axis === 0 ? "x" : "y", span = axis === 0 ? "w" : "h";
  for (const r of [...s.rects, ...s.texts]) r[at] = size - r[at] - r[span];
  for (const p of [...s.paths, ...s.heads]) p.pts = p.pts.map((pt) => (axis === 0 ? [size - pt[0], pt[1]] : [pt[0], size - pt[1]]));
}

// ---- sequence diagrams ----

const MESSAGE = /^(.+?)\s*(<<-->>|<<->>|-->>|->>|--x|-x|--\)|-\)|-->|->)\s*[+-]?\s*([^:]+?)\s*(?::\s*(.*))?$/;

function sequence(lines) {
  const order = [], byId = new Map(), events = [], blocks = [];
  let numbered = false, count = 0;
  const who = (raw, label) => {
    const id = raw.trim();
    if (!byId.has(id)) { byId.set(id, { id, lines: wrapLines(label ?? id, 22) }); order.push(id); }
    else if (label) byId.get(id).lines = wrapLines(label, 22);
    return id;
  };
  for (const raw of lines) {
    const line = raw.trim();
    let m;
    if ((m = /^(?:create\s+)?(?:participant|actor)\s+(.+?)(?:\s+as\s+(.+))?$/i.exec(line))) who(m[1], m[2]);
    else if (/^autonumber\b/i.test(line)) numbered = true;
    else if ((m = /^note\s+(over|left of|right of)\s+([^:]+?)\s*:\s*(.*)$/i.exec(line))) {
      const ids = m[2].split(",").map((p) => who(p));
      events.push({ type: "note", place: m[1].toLowerCase().split(" ")[0], a: ids[0], b: ids[ids.length - 1], lines: wrapLines(m[3], 44) });
    } else if ((m = /^(loop|alt|opt|par|critical|break|rect|box)\b\s*(.*)$/i.exec(line))) {
      const kind = m[1].toLowerCase();
      blocks.push(kind);
      if (kind !== "box") events.push({ type: "open", kind, text: kind === "rect" ? "" : tidy(m[2]) });
    } else if ((m = /^(else|and|option)\b\s*(.*)$/i.exec(line))) events.push({ type: "else", text: tidy(m[2]) });
    else if (/^end\b/i.test(line)) { if (blocks.length && blocks.pop() !== "box") events.push({ type: "close" }); }
    else if (/^(activate|deactivate|destroy|title|links?|properties|accTitle|accDescr)\b/i.test(line)) continue;
    else if ((m = MESSAGE.exec(line))) {
      const arrow = m[2];
      events.push({
        type: "msg", from: who(m[1]), to: who(m[3]),
        lines: wrapLines((numbered ? `${++count}. ` : "") + (m[4] ?? ""), 46),
        dashed: arrow.includes("--"), both: arrow.startsWith("<<"),
        end: arrow.endsWith(">>") ? "fill" : arrow.endsWith("x") ? "cross" : arrow.endsWith(")") ? "open" : "none",
      });
    }
  }
  const P = order.map((id) => byId.get(id));
  if (!P.length) return null;
  const at = new Map(order.map((id, i) => [id, i]));
  for (const p of P) p.w = Math.max(64, textW(p.lines) + 24);
  const boxH = Math.max(...P.map((p) => textH(p.lines))) + 14;

  // need[i] is the distance between lifelines i and i+1; labels and notes widen it.
  const need = P.slice(0, -1).map((p, i) => (p.w + P[i + 1].w) / 2 + 28);
  const spread = (a, b, wanted) => {
    let have = 0;
    for (let i = a; i < b; i++) have += need[i];
    if (have < wanted) for (let i = a; i < b; i++) need[i] += (wanted - have) / (b - a);
  };
  const last = P.length - 1;
  for (const e of events) {
    if (e.type === "msg") {
      const a = at.get(e.from), b = at.get(e.to), w = textW(e.lines);
      if (a !== b) spread(Math.min(a, b), Math.max(a, b), w + 30);
      else if (a < last) spread(a, a + 1, w + 62);
    } else if (e.type === "note") {
      const a = Math.min(at.get(e.a), at.get(e.b)), b = Math.max(at.get(e.a), at.get(e.b)), w = textW(e.lines) + 20;
      if (e.place === "over" && a !== b) spread(a, b, w - 24);
      else if (e.place === "over") { if (a > 0) spread(a - 1, a, w / 2 + 16); if (a < last) spread(a, a + 1, w / 2 + 16); }
      else if (e.place === "left") { if (a > 0) spread(a - 1, a, w + 28); }
      else if (a < last) spread(a, a + 1, w + 28);
    }
  }
  P[0].x = 0;
  for (let i = 0; i < last; i++) P[i + 1].x = P[i].x + need[i];

  const s = emptyScene(), frames = [], open = [];
  let y = boxH + 18;
  for (const e of events) {
    if (e.type === "msg") {
      const a = P[at.get(e.from)].x, b = P[at.get(e.to)].x, h = textH(e.lines), w = textW(e.lines);
      if (a === b) {
        const tall = Math.max(22, h), bottom = y + tall - 2;
        s.paths.push({ pts: [[a, y + 2], [a + 34, y + 2], [a + 34, bottom], [a + 8, bottom]], dashed: e.dashed });
        arrowhead(s, a, bottom, -1, 0);
        s.texts.push({ x: a + 44, y: y + (tall - h) / 2, w, h, lines: e.lines, kind: "msg", align: "left" });
        y += tall + 14;
      } else {
        const line = y + h + 3, dir = b > a ? 1 : -1;
        s.texts.push({ x: (a + b) / 2 - w / 2 - 4, y, w: w + 8, h, lines: e.lines, kind: "msg" });
        s.paths.push({ pts: [[a + (e.both ? dir * 8 : 0), line], [b - (e.end === "fill" ? dir * 8 : 0), line]], dashed: e.dashed });
        if (e.end === "fill") arrowhead(s, b, line, dir, 0);
        if (e.both) arrowhead(s, a, line, -dir, 0);
        if (e.end === "open") s.paths.push({ pts: [[b - dir * 9, line - 5], [b, line], [b - dir * 9, line + 5]] });
        if (e.end === "cross") {
          s.paths.push({ pts: [[b - dir * 10, line - 5], [b - dir * 2, line + 5]] });
          s.paths.push({ pts: [[b - dir * 10, line + 5], [b - dir * 2, line - 5]] });
        }
        y = line + 16;
      }
    } else if (e.type === "note") {
      const a = P[at.get(e.a)].x, b = P[at.get(e.b)].x;
      let w = textW(e.lines) + 20;
      const h = textH(e.lines) + 10;
      if (e.place === "over" && a !== b) w = Math.max(w, Math.abs(b - a) + 24);
      const x = e.place === "left" ? Math.min(a, b) - 12 - w : e.place === "right" ? Math.max(a, b) + 12 : (a + b) / 2 - w / 2;
      s.rects.push({ x, y, w, h, lines: e.lines, kind: "note" });
      y += h + 12;
    } else if (e.type === "open") {
      const frame = { kind: e.kind, text: e.text, y0: y, depth: open.length, splits: [] };
      frames.push(frame); open.push(frame);
      y += 28;
    } else if (e.type === "else") {
      if (open.length) open[open.length - 1].splits.push({ y: y - 2, text: e.text });
      y += 24;
    } else if (e.type === "close") {
      const frame = open.pop();
      if (frame) { frame.y1 = y; y += 12; }
    }
  }
  while (open.length) open.pop().y1 = y;
  const bottom = y + 4;

  // Frames span everything drawn so far, inset a little per level of nesting.
  let left = Math.min(...P.map((p) => p.x - p.w / 2)), right = Math.max(...P.map((p) => p.x + p.w / 2));
  for (const r of [...s.rects, ...s.texts]) { left = Math.min(left, r.x); right = Math.max(right, r.x + r.w); }
  for (const f of frames) {
    const label = [f.kind, f.text].filter(Boolean).join("  ");
    const x0 = left - 14 + f.depth * 8;
    const x1 = Math.max(right + 14 - f.depth * 8, x0 + label.length * CH + 20);
    s.rects.unshift({ x: x0, y: f.y0, w: x1 - x0, h: f.y1 - f.y0, lines: [], kind: "frame" });
    if (label) s.texts.push({ x: x0 + 1, y: f.y0 + 1, w: label.length * CH + 12, h: LH + 2, lines: [label], kind: "frame" });
    for (const split of f.splits) {
      s.paths.push({ pts: [[x0, split.y], [x1, split.y]], dashed: true, tone: "dim" });
      if (split.text) s.texts.push({ x: x0 + 6, y: split.y + 3, w: (split.text.length + 2) * CH, h: LH, lines: [`[${split.text}]`], kind: "plain", align: "left" });
    }
  }
  for (const p of P) {
    s.paths.unshift({ pts: [[p.x, boxH], [p.x, bottom]], dashed: true, tone: "dim" });
    s.rects.push({ x: p.x - p.w / 2, y: 0, w: p.w, h: boxH, lines: p.lines, kind: "actor" });
    s.rects.push({ x: p.x - p.w / 2, y: bottom, w: p.w, h: boxH, lines: p.lines, kind: "actor" });
  }
  return finish(s);
}

// ---- flowcharts ----

// [opener, closer, shape], longest openers first.
const SHAPES = [
  ["(((", ")))", "circle"], ["((", "))", "circle"], ["([", "])", "pill"], ["[[", "]]", "rect"], ["[(", ")]", "round"],
  ["{{", "}}", "round"], ["[/", "]", "rect"], ["[\\", "]", "rect"], [">", "]", "rect"], ["[", "]", "rect"], ["(", ")", "round"], ["{", "}", "diamond"],
];
const SHAPE_NAMES = { rounded: "round", stadium: "pill", pill: "pill", circle: "circle", circ: "circle", diamond: "diamond", diam: "diamond", decision: "diamond", cyl: "round", cylinder: "round", database: "round" };
const ID = /^[A-Za-z0-9_À-￿]+(?:[-.][A-Za-z0-9_À-￿]+)*/;
const LINKS = [
  [/^([<ox])?--\s+([^|]+?)\s+-{2,}([>ox])?/, "solid"],
  [/^([<ox])?-\.\s+([^|]+?)\s+\.-+([>ox])?/, "dotted"],
  [/^([<ox])?==\s+([^|]+?)\s+={2,}([>ox])?/, "thick"],
];
const PLAIN_LINK = /^([<ox])?(-{2,}|={2,}|-\.+-|~{3,})([>ox])?/;

function flowchart(lines, dir) {
  const nodes = new Map(), edges = [], groups = [], open = [];
  const node = (id, text, shape) => {
    let n = nodes.get(id);
    if (!n) { n = { id, text: id, shape: "rect", group: null, named: false }; nodes.set(id, n); }
    if (open.length) n.group = open[open.length - 1];
    if (text != null) { n.text = text; n.shape = shape ?? "rect"; n.named = true; }
    return n;
  };

  const statement = (s) => {
    let i = 0;
    const blank = () => { while (s[i] === " " || s[i] === "\t") i++; };
    const readNode = () => {
      blank();
      const m = ID.exec(s.slice(i));
      if (!m) return null;
      i += m[0].length;
      let text = null, shape = null;
      if (s.startsWith("@{", i)) {
        const end = s.indexOf("}", i), body = s.slice(i + 2, end < 0 ? s.length : end);
        i = end < 0 ? s.length : end + 1;
        const label = /label:\s*"([^"]*)"|label:\s*([^,}]+)/.exec(body);
        text = label ? (label[1] ?? label[2]) : m[0];
        shape = SHAPE_NAMES[/shape:\s*([\w-]+)/.exec(body)?.[1]] ?? "rect";
      } else {
        for (const [opener, closer, kind] of SHAPES) {
          if (!s.startsWith(opener, i)) continue;
          let j = i + opener.length, end;
          while (s[j] === " ") j++;
          if (s[j] === '"') {
            const quote = s.indexOf('"', j + 1);
            end = quote < 0 ? -1 : s.indexOf(closer, quote + 1);
            text = quote < 0 ? s.slice(j + 1) : s.slice(j + 1, quote);
          } else {
            end = s.indexOf(closer, j);
            text = (end < 0 ? s.slice(j) : s.slice(j, end)).replace(/[/\\]$/, "");
          }
          i = end < 0 ? s.length : end + closer.length;
          shape = kind;
          break;
        }
      }
      const cls = /^:::[\w-]+/.exec(s.slice(i));
      if (cls) i += cls[0].length;
      return node(m[0], text == null ? null : tidy(text), shape).id;
    };
    const readGroup = () => {
      const ids = [];
      for (;;) {
        const id = readNode();
        if (id == null) break;
        ids.push(id);
        blank();
        if (s[i] !== "&") break;
        i++;
      }
      return ids.length ? ids : null;
    };
    const readLink = () => {
      blank();
      const rest = s.slice(i);
      for (const [pattern, style] of LINKS) {
        const m = pattern.exec(rest);
        if (m) { i += m[0].length; return { text: tidy(m[2]), style, tail: m[1] === "<", head: m[3] === ">" }; }
      }
      const m = PLAIN_LINK.exec(rest);
      if (!m) return null;
      i += m[0].length;
      const link = { text: null, style: m[2][0] === "=" ? "thick" : m[2].includes(".") ? "dotted" : m[2][0] === "~" ? "hidden" : "solid", tail: m[1] === "<", head: m[3] === ">" };
      const label = /^\s*\|([^|]*)\|/.exec(s.slice(i));
      if (label) { i += label[0].length; link.text = tidy(label[1]); }
      return link;
    };
    let left = readGroup();
    while (left) {
      const link = readLink();
      if (!link) break;
      const right = readGroup();
      if (!right) break;
      for (const a of left) for (const b of right) edges.push({ from: a, to: b, ...link });
      left = right;
    }
  };

  for (const raw of lines) {
    const line = raw.trim().replace(/;$/, "").trim();
    let m;
    if (!line || /^(classDef|class|style|linkStyle|click|direction|accTitle|accDescr|title)\b/.test(line)) continue;
    if ((m = /^subgraph\b\s*(.*)$/.exec(line))) {
      const rest = m[1].trim(), titled = /^([\w-]+)\s*\[(.+)\]$/.exec(rest);
      const group = { id: titled ? titled[1] : rest, title: tidy(titled ? titled[2] : rest), parent: open[open.length - 1] ?? null };
      groups.push(group); open.push(group);
    } else if (line === "end") open.pop();
    else statement(line);
  }

  const within = (n, g) => { for (let x = n.group; x; x = x.parent) if (x === g) return true; return false; };
  // An edge that names a subgraph goes to the subgraph's first node.
  for (const g of groups) {
    const stand = nodes.get(g.id);
    if (!stand || stand.named) continue;
    const first = [...nodes.values()].find((n) => n !== stand && within(n, g));
    nodes.delete(g.id);
    for (const e of edges) { if (e.from === g.id) e.from = first?.id; if (e.to === g.id) e.to = first?.id; }
  }

  const N = [...nodes.values()];
  if (!N.length) return null;
  const horizontal = dir === "LR" || dir === "RL";
  for (const n of N) {
    n.lines = wrapLines(n.text, 30);
    n.w = Math.max(48, textW(n.lines) + 28); n.h = textH(n.lines) + 16;
    if (n.shape === "diamond") { n.w += 40; n.h += 22; }
    if (n.shape === "circle") n.w = n.h = Math.max(n.w, n.h);
    n.out = []; n.in = [];
  }
  const E = edges.filter((e) => e.from !== e.to && nodes.has(e.from) && nodes.has(e.to))
    .map((e) => ({ ...e, a: nodes.get(e.from), b: nodes.get(e.to), lines: e.text ? wrapLines(e.text, 26) : null }));

  // Edges that close a cycle are laid out backwards, so every edge points down the ranks.
  const outs = new Map(N.map((n) => [n, []])), seen = new Map();
  for (const e of E) outs.get(e.a).push(e);
  const walk = (n) => {
    seen.set(n, 1);
    for (const e of outs.get(n)) {
      if (seen.get(e.b) === 1) e.flip = true;
      else if (!seen.get(e.b)) walk(e.b);
    }
    seen.set(n, 2);
  };
  for (const n of N) if (!seen.get(n)) walk(n);
  for (const e of E) { e.u = e.flip ? e.b : e.a; e.v = e.flip ? e.a : e.b; e.u.out.push(e); e.v.in.push(e); }

  // Rank: the longest path from a node with nothing above it.
  const waiting = new Map(N.map((n) => [n, n.in.length])), ready = N.filter((n) => !n.in.length);
  for (const n of N) n.rank = 0;
  for (let q = 0; q < ready.length; q++) {
    for (const e of ready[q].out) {
      e.v.rank = Math.max(e.v.rank, ready[q].rank + 1);
      waiting.set(e.v, waiting.get(e.v) - 1);
      if (!waiting.get(e.v)) ready.push(e.v);
    }
  }
  // An edge that skips ranks gets a waypoint in each rank it crosses, so it is routed
  // between the nodes there instead of through them.
  const L = [...N];
  for (const n of N) { n.up = []; n.down = []; }
  for (const e of E) {
    e.chain = [e.u];
    for (let r = e.u.rank + 1; r < e.v.rank; r++) {
      const way = { way: true, rank: r, w: horizontal ? 0 : 14, h: horizontal ? 14 : 0, up: [], down: [] };
      L.push(way); e.chain.push(way);
    }
    e.chain.push(e.v);
    for (let k = 1; k < e.chain.length; k++) { e.chain[k - 1].down.push(e.chain[k]); e.chain[k].up.push(e.chain[k - 1]); }
  }
  const ranks = [];
  for (const n of L) (ranks[n.rank] ??= []).push(n);
  for (let r = 0; r < ranks.length; r++) ranks[r] ??= [];

  // Order inside a rank: toward the average position of the nodes it connects to.
  const number = (row) => row.forEach((n, i) => { n.order = row.length > 1 ? i / (row.length - 1) : 0.5; });
  const sortRow = (row, want) => {
    const keyed = row.map((n, i) => ({ n, i, k: want(n) }));
    keyed.sort((x, y) => x.k - y.k || x.i - y.i);
    keyed.forEach((item, i) => { row[i] = item.n; });
    number(row);
  };
  ranks.forEach(number);
  for (let pass = 0; pass < 4; pass++) {
    for (let r = 1; r < ranks.length; r++) sortRow(ranks[r], (n) => (n.up.length ? mean(n.up.map((x) => x.order)) : n.order));
    for (let r = ranks.length - 2; r >= 0; r--) sortRow(ranks[r], (n) => (n.down.length ? mean(n.down.map((x) => x.order)) : n.order));
  }

  // Positions. "main" runs along the ranks, "cross" runs inside a rank.
  const thick = (n) => (horizontal ? n.w : n.h), wide = (n) => (horizontal ? n.h : n.w);
  const gap = horizontal ? 16 : 26, between = (horizontal ? 52 : 44) + (groups.length ? 22 : 0);
  const bands = [];
  let main = 0;
  ranks.forEach((row, r) => {
    const band = Math.max(0, ...row.map(thick));
    let label = 0;
    for (const n of row) for (const e of n.out ?? []) if (e.lines) label = Math.max(label, horizontal ? textW(e.lines) + 16 : textH(e.lines) + 10);
    for (const n of row) n.main = main + (band - thick(n)) / 2;
    bands[r] = [main, main + band];
    main += band + Math.max(between, label + 36);
  });
  for (const row of ranks) {
    let c = 0;
    for (const n of row) { n.c = c + wide(n) / 2; c += wide(n) + gap; }
    row.extent = c - gap;
  }
  const widest = Math.max(...ranks.map((row) => row.extent));
  for (const row of ranks) for (const n of row) n.c += (widest - row.extent) / 2;
  const settle = (row, want) => {
    if (!row.length) return;
    const target = row.map(want);
    row.forEach((n, i) => { n.c = i ? Math.max(target[i], row[i - 1].c + (wide(row[i - 1]) + wide(n)) / 2 + gap) : target[i]; });
    const over = mean(row.map((n, i) => n.c - target[i]));
    for (const n of row) n.c -= over;
  };
  for (let pass = 0; pass < 3; pass++) {
    for (let r = 1; r < ranks.length; r++) settle(ranks[r], (n) => (n.up.length ? mean(n.up.map((x) => x.c)) : n.c));
    for (let r = ranks.length - 2; r >= 0; r--) settle(ranks[r], (n) => (n.down.length ? mean(n.down.map((x) => x.c)) : n.c));
  }
  for (const n of N) { n.x = horizontal ? n.main : n.c - n.w / 2; n.y = horizontal ? n.c - n.h / 2 : n.main; }

  const s = emptyScene();
  const depth = (g) => (g.parent ? depth(g.parent) + 1 : 0);
  for (const g of [...groups].sort((x, y) => depth(y) - depth(x))) {
    const boxes = [...N.filter((n) => within(n, g)), ...groups.filter((k) => k.parent === g && k.box).map((k) => k.box)];
    if (!boxes.length) continue;
    const x0 = Math.min(...boxes.map((box) => box.x)) - 12, y0 = Math.min(...boxes.map((box) => box.y)) - 28;
    const x1 = Math.max(...boxes.map((box) => box.x + box.w)) + 12, y1 = Math.max(...boxes.map((box) => box.y + box.h)) + 12;
    g.box = { x: x0, y: y0, w: Math.max(x1 - x0, g.title.length * CH + 20), h: y1 - y0 };
    s.rects.unshift({ ...g.box, lines: [], kind: "group" });
    if (g.title) s.texts.push({ x: x0 + 1, y: y0 + 1, w: g.title.length * CH + 12, h: LH + 2, lines: [g.title], kind: "frame" });
  }
  const point = (m, c) => (horizontal ? [m, c] : [c, m]);
  const axis = horizontal ? [1, 0] : [0, 1];
  for (const e of E) {
    // The stops along the edge: out of the first node, through each waypoint's band, into the last node.
    const first = e.chain[0], end = e.chain[e.chain.length - 1];
    const stops = [[first.main + thick(first), first.c]];
    for (const way of e.chain.slice(1, -1)) stops.push([bands[way.rank][0], way.c], [bands[way.rank][1], way.c]);
    stops.push([end.main, end.c]);
    const atEnd = e.flip ? e.tail : e.head, atStart = e.flip ? e.head : e.tail;
    if (e.lines) {
      const w = textW(e.lines) + 10, h = textH(e.lines) + 2, mid = point((stops[0][0] + stops[1][0]) / 2, (stops[0][1] + stops[1][1]) / 2);
      s.texts.push({ x: mid[0] - w / 2, y: mid[1] - h / 2, w, h, lines: e.lines, kind: "edge" });
    }
    if (e.style === "hidden") continue;
    if (atEnd) { const tip = point(...stops[stops.length - 1]); arrowhead(s, tip[0], tip[1], axis[0], axis[1]); stops[stops.length - 1][0] -= 8; }
    if (atStart) { const tip = point(...stops[0]); arrowhead(s, tip[0], tip[1], -axis[0], -axis[1]); stops[0][0] += 8; }
    for (let k = 1; k < stops.length; k++) {
      const [m0, c0] = stops[k - 1], [m1, c1] = stops[k];
      const style = { dashed: e.style === "dotted", wide: e.style === "thick" };
      if (c0 === c1) s.paths.push({ pts: [point(m0, c0), point(m1, c1)], ...style });
      else s.paths.push({ pts: [point(m0, c0), point((m0 + m1) / 2, c0), point((m0 + m1) / 2, c1), point(m1, c1)], curve: true, ...style });
    }
  }
  for (const n of N) s.rects.push({ x: n.x, y: n.y, w: n.w, h: n.h, lines: n.lines, kind: "node", shape: n.shape });
  if (!finish(s)) return null;
  if (dir === "BT") mirror(s, 1);
  if (dir === "RL") mirror(s, 0);
  return s;
}

// A scene for the diagram, or null when its type is not drawn here or nothing could be read.
export function mermaid(source) {
  try {
    const lines = [];
    let front = false;
    for (const raw of String(source ?? "").replace(/\r/g, "").split("\n")) {
      const line = raw.replace(/%%.*$/, "");
      if (!lines.length && line.trim() === "---") { front = !front; continue; }
      if (front || !line.trim()) continue;
      lines.push(line);
    }
    const head = (lines[0] ?? "").trim();
    if (/^sequenceDiagram\b/.test(head)) return sequence(lines.slice(1));
    const flow = /^(?:flowchart|graph)(?:\s+(TB|TD|BT|LR|RL))?\s*;?\s*$/.exec(head);
    if (flow) return flowchart(lines.slice(1), flow[1] === "TB" || !flow[1] ? "TD" : flow[1]);
    return null;
  } catch {
    return null;
  }
}

// The first word of a diagram, for the "not drawn" label.
export function mermaidKind(source) {
  for (const raw of String(source ?? "").split("\n")) {
    const line = raw.replace(/%%.*$/, "").trim();
    if (line && line !== "---" && !/^\w+:/.test(line)) return line.split(/\s+/)[0];
  }
  return "diagram";
}
