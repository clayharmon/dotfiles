// Pure helpers for the PR review mod: no Herdr or UI imports, so `node` can test them.

export const ROW_HEIGHT = 20;
export const NOTE_LINE = 18;
// A draft note's fixed part: 6 outer padding, 12 inner padding, 2 border, 18 header.
export const NOTE_BASE = 38;
// A thread's fixed part: 6 outer padding, 12 inner padding, 2 border, 22 header.
export const THREAD_BASE = 42;
// Per comment in a thread: an 18px author line and a 6px gap under the text.
export const COMMENT_BASE = 24;
export const THREAD_SHUT = 32;
export const NOTE_WIDTH = 760;

// Splits a unified diff (`git diff`, `gh pr diff`) into files. Each row carries its old
// line (o) and new line (n).
export function parseDiff(text) {
  const files = [];
  let file = null, inHunk = false, o = 0, n = 0;
  for (const line of String(text ?? "").split("\n")) {
    if (line.startsWith("diff --git ")) {
      const m = /^diff --git a\/(.*) b\/(.*)$/.exec(line);
      file = { path: m ? m[2] : line.slice(11), status: "M", add: 0, del: 0, binary: false, rows: [] };
      files.push(file);
      inHunk = false;
      continue;
    }
    if (!file) continue;
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
    if (hunk) {
      inHunk = true; o = +hunk[1]; n = +hunk[2];
      file.rows.push({ kind: "@", text: line });
      continue;
    }
    if (!inHunk) {
      if (line.startsWith("new file")) file.status = "A";
      else if (line.startsWith("deleted file")) file.status = "D";
      else if (line.startsWith("rename from")) file.status = "R";
      else if (line.startsWith("Binary files") || line.startsWith("GIT binary patch")) file.binary = true;
      // The +++ / --- lines hold the path unquoted even when it has spaces.
      else if (line.startsWith("+++ b/")) file.path = line.slice(6);
      else if (line.startsWith("--- a/") && file.status === "D") file.path = line.slice(6);
      continue;
    }
    const kind = line[0];
    const text = line.length > 4000 ? line.slice(1, 4000) + "… (line truncated)" : line.slice(1);
    if (kind === "+") { file.rows.push({ kind, o: null, n: n++, text }); file.add++; }
    else if (kind === "-") { file.rows.push({ kind, o: o++, n: null, text }); file.del++; }
    else if (kind === " ") file.rows.push({ kind, o: o++, n: n++, text });
    // "\ No newline at end of file" and the final empty line are dropped.
  }
  return files;
}

// The rows of one file's `patch` from the REST files list: hunks only, no file header.
export function parsePatch(patch) {
  return parseDiff(`diff --git a/x b/x\n${patch ?? ""}`)[0].rows;
}

// Where GitHub anchors a comment on this row: deletions on the old side, the rest on the new.
export function anchor(row) {
  return row.kind === "-" ? { line: row.o, side: "LEFT" } : { line: row.n, side: "RIGHT" };
}

// Hard-wraps comment text so a note's height is known before it is drawn.
export function wrap(text, width = 96) {
  const out = [];
  for (const para of String(text ?? "").replace(/\r/g, "").split("\n")) {
    let line = para;
    while (line.length > width) {
      let cut = line.lastIndexOf(" ", width);
      if (cut < width / 2) cut = width;
      out.push(line.slice(0, cut));
      line = line.slice(cut).replace(/^ /, "");
    }
    out.push(line);
  }
  return out.length > 40 ? [...out.slice(0, 39), "… (cut here; the full text is kept)"] : out;
}

// The diff as list items, each with a known height:
//   { type: "row", row }
//   { type: "thread", thread, open, parts: [{ user, at, lines, draft }], where }
//   { type: "draft", draft, lines }      a new line comment that is not posted yet
//   { type: "suggest", finding, lines, anchored }   a finding from the background review
// threads: this file's review threads. drafts: this file's drafts, each with `i`, its
// position in the pull request's draft list. isOpen(thread) says whether to show it in full.
// findings: the background review's findings for this file, each with `i`.
export function buildItems(rows, threads, drafts, isOpen, findings = []) {
  const items = [], sizes = [];
  let width = 300;
  const add = (item, size) => { items.push(item); sizes.push(size); };
  const replies = new Map(), fresh = new Map();
  for (const d of drafts) {
    const key = d.thread ? d.thread : `${d.side ?? "RIGHT"}:${d.line}`, into = d.thread ? replies : fresh;
    into.set(key, [...(into.get(key) ?? []), d]);
  }
  const addThread = (thread, where) => {
    const mine = replies.get(thread.id) ?? [];
    const open = isOpen(thread) || mine.length > 0;
    if (!open) return add({ type: "thread", thread, open, parts: [], where }, THREAD_SHUT);
    const parts = [
      ...thread.comments.map((c) => ({ user: c.user, at: c.at, lines: wrap(c.body) })),
      ...mine.map((d) => ({ draft: d, lines: wrap(d.body) })),
    ];
    add({ type: "thread", thread, open, parts, where }, THREAD_BASE + parts.reduce((sum, p) => sum + COMMENT_BASE + NOTE_LINE * p.lines.length, 0));
  };
  const addDrafts = (key) => {
    for (const draft of fresh.get(key) ?? []) {
      const lines = wrap(draft.body);
      add({ type: "draft", draft, lines }, NOTE_BASE + NOTE_LINE * lines.length);
    }
  };

  const lineOf = new Set((rows ?? []).filter((r) => r.kind === "+" || r.kind === " ").map((r) => r.n));
  const hints = new Map();
  const addHint = (finding, anchored) => {
    const lines = wrap(finding.body);
    add({ type: "suggest", finding, lines, anchored }, NOTE_BASE + NOTE_LINE * lines.length);
  };
  for (const f of findings) {
    // A finding on a line outside the diff cannot be a line comment: it shows above the diff.
    if (f.line == null || !lineOf.has(f.line)) addHint(f, false);
    else hints.set(f.line, [...(hints.get(f.line) ?? []), f]);
  }

  const at = new Map(), loose = [];
  for (const t of threads) {
    if (t.line == null || t.onFile) { loose.push(t); continue; }
    const key = `${t.side}:${t.line}`;
    at.set(key, [...(at.get(key) ?? []), t]);
  }
  // Threads with no line in this diff: on the file itself, or on lines a later push changed.
  for (const t of loose) addThread(t, t.onFile ? "on the file" : t.was ? `outdated, was line ${t.was}` : "outdated");

  const placed = new Set();
  for (const row of rows ?? []) {
    add({ type: "row", row }, ROW_HEIGHT);
    width = Math.max(width, row.text.length * 7.25 + 150);
    if (row.kind === "@") continue;
    const keys = row.kind === "-" ? [`LEFT:${row.o}`] : row.kind === "+" ? [`RIGHT:${row.n}`] : [`RIGHT:${row.n}`, `LEFT:${row.o}`];
    for (const key of keys) {
      for (const t of at.get(key) ?? []) { addThread(t, t.start && t.start !== t.line ? `lines ${t.start}–${t.line}` : `line ${t.line}`); placed.add(t); }
      addDrafts(key);
    }
    if (row.kind !== "-") for (const f of hints.get(row.n) ?? []) addHint(f, true);
  }
  // A thread whose line is outside the hunks GitHub returned still shows, at the end.
  for (const list of at.values()) for (const t of list) if (!placed.has(t)) addThread(t, `line ${t.line}, outside the diff shown`);
  if (items.some((it) => it.type !== "row")) width = Math.max(width, NOTE_WIDTH + 130);
  return { items, sizes, width: Math.min(Math.ceil(width), 8000) };
}

export function ago(iso) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (!Number.isFinite(s)) return "";
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
