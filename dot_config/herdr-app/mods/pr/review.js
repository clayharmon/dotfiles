// Background reviews: reads the report the /clays-review skill prints and turns it into
// data the tab can sort by and place on lines. Pure: no Herdr or UI imports.
//
// The skill's report is one headline, then per finding:
//   [P1] Imperative title
//   path/to/file.ext:42
//   One paragraph.
// and a last line "Verdict: safe to merge" or "Verdict: fix first", with the reason.

const HEAD = /^\s*(?:[-*]\s+)?[*_`]*\[P([0-3])\][*_`]*\s*(.+?)[*_`]*\s*$/;
const PLACE = /^\s*[*_`]*([^\s`*:]+):(\d+)(?:\s*[-–]\s*(\d+))?[*_`]*\s*$/;
const VERDICT = /^\s*[*_]*Verdict:?[*_]*\s*(safe to merge|fix first)\b[\s.,:;–—-]*(.*)$/i;

export function parseReport(text) {
  const lines = String(text ?? "").replace(/\r/g, "").split("\n").filter((l) => !/^\s*```/.test(l));
  const findings = [];
  let verdict = null, reason = "", headline = "", current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const v = VERDICT.exec(line);
    if (v) { verdict = v[1].toLowerCase(); reason = v[2].trim(); current = null; continue; }
    const h = HEAD.exec(line);
    if (h) {
      current = { level: Number(h[1]), title: h[2].trim(), path: null, line: null, body: [] };
      findings.push(current);
      continue;
    }
    if (!current) {
      // The headline says what was reviewed; a line of small talk before it is skipped.
      if (!findings.length && line.trim() && (!headline || (/^reviewed\b/i.test(line.trim()) && !/^reviewed\b/i.test(headline)))) headline = line.trim();
      continue;
    }
    if (current.path == null && !current.body.length) {
      const p = PLACE.exec(line);
      if (p) { current.path = p[1].replace(/^\.\//, ""); current.line = Number(p[3] ?? p[2]); current.from = p[3] ? Number(p[2]) : null; continue; }
    }
    current.body.push(line);
  }
  return {
    headline, verdict, reason,
    findings: findings.map((f) => ({ level: f.level, title: f.title, path: f.path, line: f.line, from: f.from ?? null, body: f.body.join("\n").trim() }))
      .sort((a, b) => a.level - b.level),
  };
}

// Which group a reviewed pull request sorts into.
export function bucket(review) {
  if (!review || review.state !== "done") return "none";
  if (review.verdict === "fix first" || review.findings.some((f) => f.level <= 1)) return "fix";
  return review.findings.length ? "notes" : "clean";
}
export const BUCKETS = [
  ["fix", "Fix first"],
  ["notes", "Has notes"],
  ["clean", "Clean"],
  ["none", "Not reviewed"],
];

// The text a finding becomes when it is taken as a draft comment.
export function commentOf(finding) {
  return [finding.title, finding.body].filter(Boolean).join("\n\n");
}

// The result of one headless run (`claude -p --output-format json`) as a stored review.
export function shapeReview(out, sha, started) {
  let run;
  try { run = JSON.parse(out); } catch { return { state: "failed", sha, at: Date.now(), error: "The review printed no result." }; }
  const text = typeof run.result === "string" ? run.result : "";
  if (run.is_error || !text.trim()) return { state: "failed", sha, at: Date.now(), error: (text || run.subtype || "The review failed.").split("\n")[0].slice(0, 300) };
  const report = parseReport(text);
  if (!report.verdict && !report.findings.length && !/no issues found/i.test(text)) {
    return { state: "failed", sha, at: Date.now(), error: "The review did not end in a verdict.", text: text.slice(0, 4000) };
  }
  return {
    state: "done", sha, at: Date.now(), secs: started ? Math.round((Date.now() - started) / 1000) : null,
    cost: typeof run.total_cost_usd === "number" ? run.total_cost_usd : null,
    headline: report.headline, verdict: report.verdict ?? (report.findings.length ? "fix first" : "safe to merge"), reason: report.reason,
    findings: report.findings,
  };
}
