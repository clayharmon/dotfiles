// Pull request review in a tab, on `gh`, without a browser.
//
// keys.json binds a key to `mod.open:pr`. That opens this mod as a 1px runner (mod.json),
// which shows the space's PRs tab, or makes one for the focused terminal's folder, and
// closes itself. The tab's copy gets props { view: "tab", cwd, on, pr?, file?, scope? }.
//
// What it does:
// - Lists open PRs of the folder's repository, or an inbox across every logged-in gh
//   account. Every gh call names its account through GH_TOKEN; `gh auth switch` never runs.
// - Opens a PR from GitHub's GraphQL API: description (mermaid drawn), checks, review
//   threads with their resolved state, and every changed file with your "viewed" mark.
// - Reads diffs from the REST files list, 100 files a call, so PRs over 300 files open.
//   Files GitHub leaves out of that list are diffed from the local clone when it has the commits.
// - Runs the /clays-review skill on each PR in the background (`claude -p`, restricted, no
//   MCP servers), sorts the list by its verdict, and shows its findings on their lines.
//
// What reaches GitHub, and when:
// - "Viewed" marks, at once. Only your account sees them.
// - Line comments, replies and the review, only from Comment / Approve / Request changes,
//   each pressed twice. Resolving a thread is also pressed twice.
// - A finding from the background review is never posted. Taking it makes it a draft.
// Drafts live in Herdr's shared state ("pr.drafts"), reviews in "pr.reviews".

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea, TextView, Scrollbar, v_virtual_list, VirtualListScrollHandle } from "gpui-base";
import { exec, run, spaces, panes, focused, theme, settings, props, closeOverlay, shared, setShared, home } from "herdr";
import { parseDiff, parsePatch, buildItems, anchor, ago, NOTE_WIDTH } from "./diff.js";
import * as api from "./data.js";
import { segments } from "./markdown.js";
import { mermaid, mermaidKind } from "./mermaid.js";
import { drawScene } from "./scene.js";
import { shapeReview, bucket, BUCKETS, commentOf } from "./review.js";

const OVERVIEW = "::overview";
const DECISION = { APPROVED: ["approved", "ansi2"], CHANGES_REQUESTED: ["changes requested", "ansi1"], REVIEW_REQUIRED: ["review required", "ansi3"] };
const MERGE = { DIRTY: ["conflicts", "ansi1"], BEHIND: ["behind base", "ansi3"], BLOCKED: ["merge blocked", "ansi3"], UNSTABLE: ["checks failing", "ansi3"] };
const EVENTS = { COMMENT: "Comment", APPROVE: "Approve", REQUEST_CHANGES: "Request changes" };
const MAX_REVIEWS = 2;      // background reviews running at once, across every PRs tab
const AUTO_PER_LOAD = 6;    // background reviews one tab starts by itself per list load
const SLUG = /^[\w.-]+\/[\w.-]+$/;

// Every gh call names its account. A missing token stops the call (exit 3) instead of
// letting gh fall back to whichever account is active.
const AS = 't="$(gh auth token --user "$0")" || exit 3; [ -n "$t" ] || exit 3; ';
const GH = AS + 'GH_PROMPT_DISABLED=1 GH_TOKEN="$t" exec gh "$@"';
const POST = AS + 'printf %s "$1" | GH_PROMPT_DISABLED=1 GH_TOKEN="$t" gh api --method POST "repos/$2/pulls/$3/reviews" --input -';

// One background review. It reads the /clays-review skill file when it runs, so the skill
// stays the one place that says how to review: its text is the prompt, with the pull
// request's URL as the argument, on the model, effort and tool list its header names.
// Restricted mode adds: no user hooks, no MCP servers, file tools held to the working folder.
// Arguments: 1 folder for results, 2 job name, 3 clone (or the results folder), 4 gh account, 5 URL.
const JOB = String.raw`skill="$HOME/.claude/skills/clays-review/SKILL.md"
[ -r "$skill" ] || { echo "The clays-review skill was not found at $skill." > "$1/$2.err"; echo 4 > "$1/$2.done"; exit 0; }
cd "$3" 2> /dev/null || cd "$1"
t="$(gh auth token --user "$4")" && [ -n "$t" ] || { echo "gh has no token for $4." > "$1/$2.err"; echo 3 > "$1/$2.done"; exit 0; }
front() { awk -v k="$1" '/^---[[:space:]]*$/ { n++; next } n == 1 && index($0, k ":") == 1 { sub(/^[^:]*:[[:space:]]*/, ""); gsub(/"/, ""); print; exit }' "$skill"; }
allowed="$(awk '/^---[[:space:]]*$/ { n++; next } n != 1 { next } /^allowed-tools:/ { f = 1; next } f && /^[[:space:]]*-[[:space:]]/ { sub(/^[[:space:]]*-[[:space:]]*/, ""); printf "%s%s", sep, $0; sep = ","; next } { f = 0 }' "$skill")"
awk -v url="$5" 'n >= 2 { gsub(/\$ARGUMENTS/, url); print; next } /^---[[:space:]]*$/ { n++ }' "$skill" > "$1/$2.prompt"
model="$(front model)"; [ -n "$model" ] || model=sonnet
effort="$(front effort)"; [ -n "$effort" ] || effort=high
GH_PROMPT_DISABLED=1 GH_TOKEN="$t" claude -p --restricted --tools "Bash,Read,Grep,Glob" --allowedTools "$allowed" --strict-mcp-config --no-session-persistence --disable-slash-commands --model "$model" --effort "$effort" --max-budget-usd 1 --output-format json < "$1/$2.prompt" > "$1/$2.out" 2> "$1/$2.err"
echo $? > "$1/$2.done"
rm -f "$1/$2.prompt"`;
const LAUNCH = 'mkdir -p "$1" && cd "$1" && (nohup sh -c "$6" job "$1" "$2" "$3" "$4" "$5" > /dev/null 2>&1 &)';
// Takes a finished job's files, so two tabs never read the same result.
const TAKE = 'cd "$1" && mv "$2.done" "$2.take" 2> /dev/null || exit 9; cat "$2.out" 2> /dev/null; printf "\\n\\001\\n"; cat "$2.take"; head -c 600 "$2.err" 2> /dev/null; rm -f "$2.out" "$2.err" "$2.take"';

const reviewsDir = () => `${home()}/.config/herdr-app/data/pr/reviews`;
const keyOf = (repo, number) => `${repo}#${number}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function failure(r) {
  if (r.code === 3) return "gh has no token for that account.";
  return (r.stderr || r.stdout).trim().split("\n")[0] || `gh exited ${r.code}`;
}

async function gh(account, args) {
  const r = await exec("sh", ["-c", GH, account, ...args], { cwd: home() });
  if (r.code !== 0) throw new Error(failure(r));
  return r.stdout;
}

// Strings go in with -f, which gh never reads as a file or a number; numbers with -F.
function gql(account, query, vars = {}, extra = []) {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [k, v] of Object.entries(vars)) args.push(typeof v === "number" ? "-F" : "-f", `${k}=${v}`);
  return gh(account, [...args, ...extra]);
}

export default class Pr extends View {
  init(_props, cx) {
    this.copy = props() ?? {};
    // Opened by mod.open: go to the PRs tab and leave.
    if (this.copy.overlay && this.copy.view !== "tab") {
      this.runner = true;
      cx.spawn(async () => {
        const now = focused();
        const space = spaces().find((s) => s.active);
        const mine = panes().find((p) => p.mod === "pr" && space?.tabs.some((t) => t.id === p.tab));
        if (mine) run("tab.select", { id: mine.tab });
        else run("tab.new", { name: "PRs", mod: "pr", props: { view: "tab", cwd: now?.cwd || space?.folder || "", on: space?.machine ?? null } });
        closeOverlay(this.copy.overlay);
      });
      return;
    }

    this.handle = cx.focus_handle();
    this.scroll = VirtualListScrollHandle.new();
    this.fileScroll = VirtualListScrollHandle.new();
    this.accounts = []; this.here = null; this.scope = "repo";
    this.rows = []; this.failed = []; this.sel = 0; this.mode = "list";
    this.pr = null; this.files = []; this.threads = []; this.open = OVERVIEW; this.parts = [];
    this.patches = new Map(); this.patchesDone = false; this.cache = new Map();
    this.items = []; this.sizes = []; this.width = 300; this.state = null; this.marks = new Map();
    this.pick = null; this.confirm = null; this.typing = false; this.query = "";
    this.loadId = 0; this.queue = []; this.autoLeft = AUTO_PER_LOAD;
    this.summary = InputState.new({ placeholder: "Review summary (optional)" });
    this.filter = InputState.new({ placeholder: "Filter files" });
    this.comment = TextareaState.new({ placeholder: "Comment", rows: 2 });
    this.comment.set_auto_grow(2, 8);
    for (const field of [this.summary, this.comment, this.filter]) {
      field.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
      field.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
    }
    this.filter.on("change", (_e, cx) => { this.query = this.filter.value().trim().toLowerCase(); cx.notify(); });
    // Background reviews finish on their own time: collect them and start the next.
    cx.timer.every(4000, (cx) => this.tick(cx));
    this.work(cx, async (cx) => {
      await this.findAccounts();
      try { await this.locate(); this.hereAccount = await this.pickAccount(this.here.repo); }
      catch (e) { this.here = null; this.hereNote = String(e?.message ?? e); this.scope = "inbox"; }
      if (this.copy.scope === "inbox") this.scope = "inbox";
      await this.loadRows();
      if (this.copy.pr && this.here) await this.loadPr({ repo: this.here.repo, account: this.hereAccount, number: Number(this.copy.pr) }, cx);
    });
  }

  // One job at a time: shows "Loading…" while it runs and its error if it throws.
  work(cx, job) {
    if (this.loading) return;
    this.loading = true; this.error = null;
    cx.notify();
    cx.spawn(async (cx) => {
      try { await job(cx); }
      catch (e) { this.error = String(e?.message ?? e); }
      finally { this.loading = false; cx.notify(); }
    });
  }

  // ---- accounts and the repository ----

  async findAccounts() {
    const status = await exec("gh", ["auth", "status", "--json", "hosts"], { cwd: home() });
    let found = [];
    try { found = (JSON.parse(status.stdout).hosts?.["github.com"] ?? []).filter((a) => a.state === "success"); } catch { /* not JSON */ }
    if (!found.length) throw new Error("gh has no github.com account. Run `gh auth login`.");
    this.accounts = found.map((a) => a.login);
    this.active = found.find((a) => a.active)?.login;
  }

  async locate() {
    const { cwd, on } = this.copy;
    if (!cwd) throw new Error("No folder was given.");
    const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
    if (top.code !== 0) throw new Error(`${cwd} is not inside a git repository.`);
    const root = top.stdout.trim();
    const url = await exec("git", ["remote", "get-url", "origin"], { cwd: root, on });
    const m = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\s*$/.exec(url.stdout);
    if (url.code !== 0 || !m) throw new Error(`${root} has no github.com origin.`);
    this.here = { root, on: on ?? null, repo: `${m[1]}/${m[2]}` };
    // Background reviews run in the clone, so they can read the code around a change.
    if (!on) { const clones = shared("pr.clones") ?? {}; if (clones[this.here.repo] !== root) setShared("pr.clones", { ...clones, [this.here.repo]: root }); }
  }

  async pickAccount(repo) {
    const lower = (s) => String(s ?? "").toLowerCase();
    const cached = (shared("pr.accounts") ?? {})[repo];
    // Last used for this repo, then the account named like the owner, then gh's active one.
    const order = [cached, this.accounts.find((l) => lower(l) === lower(repo.split("/")[0])), this.active, ...this.accounts];
    for (const login of [...new Set(order.filter((l) => this.accounts.includes(l)))]) {
      try {
        await gh(login, ["api", `repos/${repo}`, "--jq", ".full_name"]);
        if (cached !== login) setShared("pr.accounts", { ...(shared("pr.accounts") ?? {}), [repo]: login });
        return login;
      } catch { /* this account cannot read it */ }
    }
    throw new Error(`None of your gh accounts (${this.accounts.join(", ")}) can read ${repo}.`);
  }

  // ---- the list ----

  async loadRows() {
    if (this.scope === "repo" && this.here) {
      const [owner, name] = this.here.repo.split("/");
      this.rows = api.shapeList(JSON.parse(await gql(this.hereAccount, api.LIST, { owner, name })), this.hereAccount);
      this.failed = [];
    } else {
      const each = await Promise.all(this.accounts.map((a) => gql(a, api.INBOX).then(
        (out) => api.shapeInbox(JSON.parse(out), a),
        (e) => ({ account: a, error: String(e?.message ?? e) }),
      )));
      this.rows = api.sortRows(each.filter(Array.isArray).flat());
      this.failed = each.filter((r) => !Array.isArray(r));
    }
    this.sel = Math.min(this.sel, Math.max(0, this.rows.length - 1));
    if (shared("pr.auto") !== false) {
      const fresh = this.rows.filter((r) => !r.draft && this.needsReview(r)).slice(0, this.autoLeft);
      this.autoLeft -= fresh.length;
      this.queue.push(...fresh);
    }
    await this.pump();
  }

  // Rows in the order they are drawn: grouped by the background review's verdict.
  ordered() {
    const reviews = shared("pr.reviews") ?? {};
    const of = (r) => { const rv = reviews[keyOf(r.repo, r.number)]; return rv && rv.sha === r.sha ? bucket(rv) : "none"; };
    const groups = BUCKETS.map(([id, label]) => ({ id, label, rows: this.rows.filter((r) => of(r) === id) })).filter((g) => g.rows.length);
    return { groups, flat: groups.flatMap((g) => g.rows) };
  }

  setScope(scope, cx) {
    if (scope === this.scope || (scope === "repo" && !this.here)) return;
    this.scope = scope; this.rows = []; this.sel = 0;
    this.work(cx, () => this.loadRows());
  }

  cycleAccount(cx) {
    if (this.scope !== "repo" || !this.here || this.accounts.length < 2 || this.loading) return;
    this.hereAccount = this.accounts[(this.accounts.indexOf(this.hereAccount) + 1) % this.accounts.length];
    this.rows = []; this.mode = "list";
    this.work(cx, () => this.loadRows());
  }

  refresh(cx) {
    this.autoLeft = AUTO_PER_LOAD;
    if (this.mode === "review" && this.pr) this.work(cx, (cx) => this.loadPr(this.pr, cx));
    else this.work(cx, () => this.loadRows());
  }

  // ---- one pull request ----

  async loadPr(target, cx) {
    const { repo, account, number } = target;
    const [owner, name] = repo.split("/");
    const id = ++this.loadId;
    const page = (n) => gh(account, ["api", `repos/${repo}/pulls/${number}/files?per_page=100&page=${n}`, "--jq", api.PATCH_JQ]);
    const first = page(1);
    first.catch(() => {});
    const [meta, list] = await Promise.all([
      gql(account, api.PR, { owner, name, number }),
      gql(account, api.FILES, { owner, name, number }, ["--paginate", "--jq", api.FILES_JQ]),
    ]);
    if (id !== this.loadId) return;
    const shaped = api.shapePr(JSON.parse(meta), repo, account);
    if (!shaped) throw new Error(`#${number} was not found in ${repo}.`);
    const same = this.pr && keyOf(this.pr.repo, this.pr.number) === keyOf(repo, number);
    this.pr = shaped.pr; this.threads = shaped.threads;
    this.files = list.split("\n").filter(Boolean).map((l) => api.shapeFile(JSON.parse(l)));
    this.parts = segments(this.pr.body).map((p) => (p.type === "mermaid" ? { ...p, scene: mermaid(p.source) } : p));
    this.patches = new Map(); this.patchesDone = false; this.cache = new Map(); this.base = null;
    this.mode = "review"; this.pick = null; this.confirm = null;
    if (this.copy.file && this.files.some((f) => f.path === this.copy.file)) { this.open = this.copy.file; this.copy.file = null; }
    else if (!same || (this.open !== OVERVIEW && !this.files.some((f) => f.path === this.open))) this.open = OVERVIEW;
    this.index(); this.rebuild();
    this.loading = false;
    cx.notify();

    // Queue the background review of this commit if there is none yet.
    const row = { repo, account, number, sha: this.pr.headOid, draft: this.pr.draft };
    if (shared("pr.auto") !== false && !row.draft && this.needsReview(row)) { this.queue.unshift(row); await this.pump(); }

    // The diffs, 100 files a call. Rows appear as their page arrives.
    const take = (out) => {
      if (id !== this.loadId) return;
      for (const line of out.split("\n")) { if (line) { const f = JSON.parse(line); this.patches.set(f.f, f.p ?? null); } }
      this.rebuild(); cx.notify();
    };
    const pages = Math.min(30, Math.ceil(this.files.length / 100));
    const jobs = [first.then(take)];
    for (let n = 2; n <= pages; n++) jobs.push(page(n).then(take));
    const results = await Promise.allSettled(jobs);
    if (id !== this.loadId) return;
    this.patchesDone = true;
    const bad = results.find((r) => r.status === "rejected");
    if (bad) this.note = `Some diffs did not load: ${bad.reason?.message ?? bad.reason}`;
    await this.fill(this.open);
    this.rebuild();
  }

  fileAt(path) { return this.files.find((f) => f.path === path); }
  shown() { return this.query ? this.files.filter((f) => f.path.toLowerCase().includes(this.query)) : this.files; }

  // What to draw for a file: { rows } once its diff is known, { wait } until then.
  rowsFor(file) {
    const hit = this.cache.get(file.path);
    if (hit) return hit;
    const patch = this.patches.get(file.path);
    let got = null;
    if (patch != null) got = { rows: parsePatch(patch) };
    else if (!this.patchesDone && !this.patches.has(file.path)) return { rows: [], wait: "Loading diff…" };
    else if (file.add + file.del === 0) got = { rows: [], say: file.status === "R" ? "Renamed, with no change to its text." : "Binary file, or no change to its text." };
    else return { rows: [], wait: "Reading this file's diff from the local clone…", local: true };
    this.cache.set(file.path, got);
    return got;
  }

  // GitHub leaves a file's diff out of its files list once a pull request passes about
  // 1.5 MB of diff. The local clone has it when it has both commits.
  async fill(path) {
    const file = this.fileAt(path);
    if (!file || this.cache.has(path) || !this.rowsFor(file).local) return;
    const pr = this.pr;
    let got;
    if (!this.here || this.here.repo.toLowerCase() !== pr.repo.toLowerCase()) {
      got = { rows: [], say: "GitHub leaves this file's diff out of its API for a pull request this large. Open PRs from a terminal inside a clone of this repository to read it from local git." };
    } else {
      const git = (args) => exec("git", args, { cwd: this.here.root, on: this.here.on });
      this.base ??= git(["merge-base", pr.baseOid, pr.headOid]).then((r) => (r.code === 0 ? r.stdout.trim() : null));
      const base = await this.base;
      if (!base) got = { rows: [], say: "GitHub leaves this file's diff out of its API, and the local clone does not have this pull request's commits.", fetch: true };
      else {
        const out = await git(["diff", "--no-color", "--no-ext-diff", "--no-textconv", "--src-prefix=a/", "--dst-prefix=b/", "-M", base, pr.headOid, "--", path]);
        const parsed = out.code === 0 ? parseDiff(out.stdout)[0] : null;
        got = out.code !== 0 ? { rows: [], say: `git diff failed: ${failure(out)}` }
          : { rows: parsed?.rows ?? [], local: true, say: parsed?.binary ? "Binary file." : "No change to its text." };
      }
    }
    if (this.pr === pr) { this.cache.set(path, got); if (this.open === path) this.rebuild(); }
  }

  fetchCommits(cx) {
    const pr = this.pr;
    this.work(cx, async () => {
      const r = await exec("git", ["fetch", "--no-tags", "--no-write-fetch-head", "origin", `refs/pull/${pr.number}/head`, `refs/heads/${pr.base}`], { cwd: this.here.root, on: this.here.on });
      if (r.code !== 0) throw new Error(`git fetch failed: ${failure(r)}`);
      this.base = null;
      for (const [path, got] of this.cache) if (got.fetch) this.cache.delete(path);
      await this.fill(this.open);
      this.rebuild();
    });
  }

  // ---- drafts, kept in Herdr's shared state ----

  key() { return keyOf(this.pr?.repo, this.pr?.number); }
  drafts() { return (shared("pr.drafts") ?? {})[this.key()] ?? []; }

  setDrafts(list) {
    const all = { ...(shared("pr.drafts") ?? {}) };
    if (list.length) all[this.key()] = list; else delete all[this.key()];
    setShared("pr.drafts", all);
    this.index(); this.rebuild();
  }

  // ---- background reviews ----

  review() {
    const rv = this.pr ? (shared("pr.reviews") ?? {})[this.key()] : null;
    return rv ? { ...rv, stale: rv.sha !== this.pr.headOid } : null;
  }

  findings(path) {
    const rv = this.review();
    if (!rv || rv.state !== "done" || rv.stale) return [];
    return rv.findings.map((f, i) => ({ ...f, i })).filter((f) => !f.state && (path == null || f.path === path));
  }

  setFinding(i, state) {
    const all = { ...(shared("pr.reviews") ?? {}) }, rv = all[this.key()];
    if (!rv) return;
    all[this.key()] = { ...rv, findings: rv.findings.map((f, k) => (k === i ? { ...f, state } : f)) };
    setShared("pr.reviews", all);
    this.index(); this.rebuild();
  }

  needsReview(row) {
    const key = keyOf(row.repo, row.number), rv = (shared("pr.reviews") ?? {})[key];
    return SLUG.test(row.repo) && Boolean(row.sha) && !(rv && rv.sha === row.sha) && !(shared("pr.jobs") ?? {})[key];
  }

  // Starts queued reviews while fewer than MAX_REVIEWS are running, in any tab.
  async pump() {
    while (this.queue.length && Object.keys(shared("pr.jobs") ?? {}).length < MAX_REVIEWS) {
      const row = this.queue.shift();
      if (this.needsReview(row)) await this.startReview(row);
    }
  }

  async startReview(row) {
    const key = keyOf(row.repo, row.number), dir = reviewsDir();
    const name = `${row.repo.replace(/[^\w.-]+/g, "_")}_${row.number}_${String(row.sha).slice(0, 10)}`;
    const clone = (shared("pr.clones") ?? {})[row.repo] ?? dir;
    setShared("pr.jobs", { ...(shared("pr.jobs") ?? {}), [key]: { name, sha: row.sha, started: Date.now() } });
    const r = await exec("sh", ["-c", LAUNCH, "sh", dir, name, clone, row.account, `https://github.com/${row.repo}/pull/${row.number}`, JOB]);
    if (r.code !== 0) this.endJob(key, { state: "failed", sha: row.sha, at: Date.now(), error: `The review did not start: ${failure(r)}` });
  }

  endJob(key, review) {
    const jobs = { ...(shared("pr.jobs") ?? {}) };
    delete jobs[key];
    setShared("pr.jobs", jobs);
    setShared("pr.reviews", { ...(shared("pr.reviews") ?? {}), [key]: review });
  }

  tick(cx) {
    if (this.ticking || !(Object.keys(shared("pr.jobs") ?? {}).length || this.queue.length)) return;
    this.ticking = true;
    cx.spawn(async (cx) => {
      try {
        for (const [key, job] of Object.entries(shared("pr.jobs") ?? {})) {
          const r = await exec("sh", ["-c", TAKE, "sh", reviewsDir(), job.name]);
          if (r.code === 0) {
            const [out, rest = ""] = r.stdout.split("\n\u0001\n");
            const code = rest.split("\n")[0].trim(), err = rest.split("\n").slice(1).join("\n").trim();
            let review = shapeReview(out, job.sha, job.started);
            if (review.state === "failed" && code !== "0") review = { ...review, error: (err.split("\n")[0] || review.error).slice(0, 300) };
            this.endJob(key, review);
          } else if (Date.now() - job.started > 20 * 60000) {
            this.endJob(key, { state: "failed", sha: job.sha, at: Date.now(), error: "The review did not finish in 20 minutes." });
          }
        }
        await this.pump();
        if (this.mode === "review") { this.index(); this.rebuild(); }
      } catch { /* the next tick tries again */ } finally { this.ticking = false; cx.notify(); }
    });
  }

  rerun(cx) {
    const pr = this.pr, all = { ...(shared("pr.reviews") ?? {}) };
    delete all[this.key()];
    setShared("pr.reviews", all);
    this.queue.unshift({ repo: pr.repo, account: pr.account, number: pr.number, sha: pr.headOid });
    this.index(); this.rebuild();
    cx.spawn(async (cx) => { await this.pump(); cx.notify(); });
    cx.notify();
  }

  takeAll(cx) {
    const added = [];
    for (const f of this.findings(null)) {
      const file = f.path ? this.fileAt(f.path) : null;
      if (f.line == null || !file || !this.rowsFor(file).rows.some((r) => r.kind !== "-" && r.n === f.line)) continue;
      added.push({ path: f.path, line: f.line, side: "RIGHT", body: commentOf(f), from: "claude" });
      this.setFinding(f.i, "taken");
    }
    if (added.length) this.setDrafts([...this.drafts(), ...added]);
    this.note = added.length ? `${plural(added.length, "finding")} taken as drafts. A finding on a line outside the diff stays in the list.` : "No finding is on a line of the diff, so none can be a line comment.";
    cx.notify();
  }

  // ---- what the file list and the diff show ----

  index() {
    const marks = new Map();
    const at = (path) => { if (!marks.has(path)) marks.set(path, { notes: 0, finds: 0, worst: 9 }); return marks.get(path); };
    for (const t of this.threads) if (!t.resolved) at(t.path).notes++;
    for (const d of this.pr ? this.drafts() : []) at(d.path).notes++;
    for (const f of this.pr ? this.findings(null) : []) { if (f.path) { const m = at(f.path); m.finds++; m.worst = Math.min(m.worst, f.level); } }
    this.marks = marks;
  }

  rebuild() {
    const file = this.fileAt(this.open);
    if (!file) { this.items = []; this.sizes = []; this.width = 300; this.state = null; return; }
    const got = this.rowsFor(file);
    const drafts = this.drafts().map((d, i) => ({ ...d, i })).filter((d) => d.path === file.path);
    const built = buildItems(got.rows, this.threads.filter((t) => t.path === file.path), drafts,
      (t) => !t.resolved || (this.pick?.kind === "thread" && this.pick.id === t.id), this.findings(file.path));
    this.items = built.items; this.sizes = built.sizes; this.width = built.width; this.state = got;
    if (this.jump && !got.wait) {
      const j = this.jump;
      const i = this.items.findIndex((it) => (j.thread ? it.type === "thread" && it.thread.id === j.thread
        : j.finding != null ? it.type === "suggest" && it.finding.i === j.finding
          : it.type === "row" && it.row.kind !== "-" && it.row.n === j.line));
      if (i >= 0) this.scroll.scroll_to_item(i, "center");
      this.jump = null;
    }
  }

  // ---- actions ----

  openPr(row, cx) {
    this.open = OVERVIEW; this.note = null;
    this.work(cx, (cx) => this.loadPr(row, cx));
  }

  back(cx) {
    this.mode = "list"; this.pick = null; this.confirm = null; this.note = null; this.loadId++;
    cx.notify();
  }

  show(path, cx, jump) {
    const moved = path !== this.open;
    this.open = path; this.pick = null; this.jump = jump ?? null;
    this.rebuild();
    if (path !== OVERVIEW && moved && !jump) this.scroll.scroll_to_item(0, "top");
    if (path !== OVERVIEW && this.rowsFor(this.fileAt(path)).local) cx.spawn(async (cx) => { await this.fill(path); cx.notify(); });
    cx.notify();
  }

  step(by, cx) {
    const order = [OVERVIEW, ...this.shown().map((f) => f.path)];
    const i = Math.min(order.length - 1, Math.max(0, Math.max(0, order.indexOf(this.open)) + by));
    if (order[i] !== this.open) { this.show(order[i], cx); this.fileScroll.scroll_to_item(i, "center"); }
  }

  // The next thread that is not resolved, in file order, after the open file.
  nextOpenThread(cx) {
    const open = this.threads.filter((t) => !t.resolved);
    if (!open.length) { this.note = "No unresolved threads."; cx.notify(); return; }
    const paths = this.files.map((f) => f.path);
    open.sort((a, b) => paths.indexOf(a.path) - paths.indexOf(b.path) || (a.line ?? 0) - (b.line ?? 0));
    const at = open.findIndex((t) => t.id === this.lastThread);
    const next = open[(at + 1) % open.length];
    this.lastThread = next.id;
    this.show(next.path, cx, { thread: next.id });
  }

  toggleViewed(path, cx) {
    const file = this.fileAt(path), pr = this.pr;
    if (!file) return;
    const was = file.viewed, now = was === "VIEWED" ? "UNVIEWED" : "VIEWED";
    file.viewed = now;
    cx.notify();
    cx.spawn(async (cx) => {
      try { await gql(pr.account, now === "VIEWED" ? api.MARK : api.UNMARK, { pr: pr.id, path }); }
      catch (e) { file.viewed = was; this.note = `Viewed mark not saved: ${e?.message ?? e}`; cx.notify(); }
    });
  }

  // A click in the diff picks what the bar under it acts on.
  pickItem(index, cx) {
    const it = this.items[index];
    if (!it) return;
    this.confirm = null;
    if (it.type === "row") {
      if (it.row.kind === "@") return;
      this.pick = { kind: "line", index, path: this.open, ...anchor(it.row) };
      this.comment.set_value("");
    } else if (it.type === "draft") {
      this.pick = { kind: "draft", i: it.draft.i };
      this.comment.set_value(it.draft.body);
    } else if (it.type === "suggest") {
      this.pick = { kind: "suggest", i: it.finding.i, anchored: it.anchored };
      this.comment.set_value(commentOf(it.finding));
    } else if (this.pick?.kind === "thread" && this.pick.id === it.thread.id) {
      this.pick = null;
    } else {
      this.pick = { kind: "thread", id: it.thread.id };
      this.comment.set_value("");
    }
    this.rebuild();
    if (this.pick && this.pick.kind !== "thread") this.comment.focus();
    cx.notify();
  }

  unpick(cx) { this.pick = null; this.confirm = null; this.rebuild(); this.handle.focus(); cx.notify(); }

  // Saves what is in the box as a draft: a new line comment, an edit, a reply, or a finding taken.
  saveDraft(cx) {
    const body = this.comment.value().trim(), p = this.pick, drafts = this.drafts();
    if (!body || !p) return;
    if (p.kind === "line") this.setDrafts([...drafts, { path: p.path, line: p.line, side: p.side, body }]);
    else if (p.kind === "draft") this.setDrafts(drafts.map((d, i) => (i === p.i ? { ...d, body } : d)));
    else if (p.kind === "thread") this.setDrafts([...drafts, { thread: p.id, path: this.open, body }]);
    else if (p.kind === "suggest") {
      const f = this.review()?.findings[p.i];
      if (!f) return;
      if (p.anchored) this.setDrafts([...drafts, { path: f.path, line: f.line, side: "RIGHT", body, from: "claude" }]);
      else this.summary.set_value([this.summary.value().trim(), `${f.path ?? ""}${f.line ? `:${f.line}` : ""} ${body}`.trim()].filter(Boolean).join("\n\n"));
      this.setFinding(p.i, "taken");
    }
    this.comment.set_value("");
    this.unpick(cx);
  }

  dropPicked(cx) {
    const p = this.pick;
    if (p?.kind === "draft") this.setDrafts(this.drafts().filter((_d, i) => i !== p.i));
    else if (p?.kind === "suggest") this.setFinding(p.i, "dismissed");
    this.comment.set_value("");
    this.unpick(cx);
  }

  // First press arms a button for five seconds, second press does it.
  armed(what, cx) {
    if (this.confirm === what) { this.confirm = null; return true; }
    this.confirm = what; this.note = null;
    cx.timer.after(5000, (cx) => { if (this.confirm === what) { this.confirm = null; cx.notify(); } });
    cx.notify();
    return false;
  }

  resolve(thread, cx) {
    if (this.busy || !this.armed(`resolve:${thread.id}`, cx)) return;
    const pr = this.pr, undo = thread.resolved;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        await gql(pr.account, undo ? api.UNRESOLVE : api.RESOLVE, { thread: thread.id });
        thread.resolved = !undo; thread.canResolve = undo; thread.canUnresolve = !undo;
        this.pick = null; this.index(); this.rebuild();
        this.note = `Thread ${undo ? "reopened" : "resolved"} as ${pr.account}.`;
      } catch (e) { this.note = `Not changed: ${e?.message ?? e}`; }
      finally { this.busy = false; cx.notify(); }
    });
    cx.notify();
  }

  submit(event, cx) {
    if (this.busy) return;
    const all = this.drafts(), lines = all.filter((d) => !d.thread), replies = all.filter((d) => d.thread), body = this.summary.value().trim();
    const asReview = event !== "COMMENT" || Boolean(body) || lines.length > 0;
    if (!asReview && !replies.length) { this.note = "Nothing to post: write a summary, draft a line comment, or draft a reply."; cx.notify(); return; }
    if (!this.armed(`post:${event}`, cx)) return;
    this.busy = true; this.note = null;
    const pr = this.pr;
    cx.spawn(async (cx) => {
      let posted = 0;
      try {
        if (asReview) {
          const payload = JSON.stringify({ commit_id: pr.headOid, event, body, comments: lines.map(({ path, line, side, body }) => ({ path, line, side, body })) });
          const r = await exec("sh", ["-c", POST, pr.account, payload, pr.repo, String(pr.number)], { cwd: home() });
          if (r.code !== 0) throw new Error(failure(r));
          this.setDrafts(this.drafts().filter((d) => d.thread));
          this.summary.set_value("");
        }
        for (const reply of replies) {
          await gql(pr.account, api.REPLY, { thread: reply.thread, body: reply.body });
          posted++;
          this.setDrafts(this.drafts().filter((d) => !(d.thread === reply.thread && d.body === reply.body)));
        }
        this.note = `Posted as ${pr.account}: ${[asReview ? `${EVENTS[event].toLowerCase()} with ${plural(lines.length, "line comment")}` : null, replies.length ? plural(replies.length, "reply").replace("replys", "replies") : null].filter(Boolean).join(", ")}.`;
        await this.loadPr(pr, cx);
      } catch (e) {
        this.note = `Not posted${posted ? ` (after ${posted} of ${replies.length} replies)` : ""}: ${e?.message ?? e}`;
      } finally { this.busy = false; cx.notify(); }
    });
    cx.notify();
  }

  askClaude() {
    const p = this.pr, local = this.here && this.here.repo.toLowerCase() === p.repo.toLowerCase();
    run("tab.new", {
      folder: local ? this.here.root : (this.copy.cwd || home()),
      argv: ["claude"],
      task: `Review pull request #${p.number} of ${p.repo} (${p.head} into ${p.base}): "${p.title}". `
        + `Read the diff with: GH_TOKEN="$(gh auth token --user ${p.account})" gh pr diff ${p.number} --repo ${p.repo} . `
        + `If that reports more than 300 files, page through: gh api "repos/${p.repo}/pulls/${p.number}/files?per_page=100&page=1" . `
        + "Report bugs and risks as path:line notes, most severe first. Do not post anything to GitHub.",
    });
  }

  keys(e, cx) {
    if (this.typing) {
      if (e.key === "escape") { if (this.pick) this.unpick(cx); else { this.handle.focus(); cx.notify(); } cx.stop_propagation(); }
      return;
    }
    const m = e.modifiers ?? {};
    if (m.control || m.alt || m.platform) return;
    const k = e.key;
    if (k === "r") return this.refresh(cx);
    if (this.mode === "list" || !this.pr) {
      const flat = this.ordered().flat;
      if (k === "j" || k === "down") { this.sel = Math.min(flat.length - 1, this.sel + 1); cx.notify(); }
      else if (k === "k" || k === "up") { this.sel = Math.max(0, this.sel - 1); cx.notify(); }
      else if (k === "enter" && flat[this.sel]) this.openPr(flat[this.sel], cx);
      else if (k === "i") this.setScope(this.scope === "inbox" ? "repo" : "inbox", cx);
      return;
    }
    if (k === "escape") { if (this.pick) this.unpick(cx); else this.back(cx); }
    else if (k === "n" || k === "]" || k === "j") this.step(1, cx);
    else if (k === "p" || k === "[" || k === "k") this.step(-1, cx);
    else if (k === "v" && this.open !== OVERVIEW) { this.toggleViewed(this.open, cx); this.step(1, cx); }
    else if (k === "u") this.nextOpenThread(cx);
    else if (k === "o") this.show(OVERVIEW, cx);
  }

  // ---- drawing ----

  render() {
    if (this.runner) return div();
    const t = theme();
    const stop = (_e, cx) => cx.stop_propagation();
    const chip = (text, color) => div().px(6).py(1).rounded(4).border_1().border_color(color ?? t.border).text_size(10.5).text_color(color ?? t.muted).flex_none().whitespace_nowrap().child(text);
    const button = (id, label, action, solid) => div().id(id).h(28).px(10).flex().flex_none().items_center().rounded(7).text_size(12).cursor_pointer().whitespace_nowrap()
      .bg(solid ? t.solid : t.raised).text_color(solid ? t.solid_foreground : t.muted)
      .hover((s) => (solid ? s : s.bg(t.hover).text_color(t.foreground)))
      .on_mouse_down("left", stop).on_click(action).child(label);
    const checks = (state) => chip(`checks ${state}`, state === "fail" ? t.ansi1 : state === "pass" ? t.ansi2 : t.ansi3);
    const decision = (d) => chip(DECISION[d][0], t[DECISION[d][1]]);
    const level = (n) => (n <= 1 ? t.ansi1 : n === 2 ? t.ansi3 : t.ansi4);
    const jobs = shared("pr.jobs") ?? {}, reviews = shared("pr.reviews") ?? {};
    const auto = shared("pr.auto") !== false;
    const banner = this.error ? div().flex_none().px(14).py(8).text_color(t.ansi1).child(this.error) : null;

    // What the background review says about a PR, as chips.
    const verdict = (repo, number, sha) => {
      const key = keyOf(repo, number), rv = reviews[key];
      if (jobs[key]) return [chip("reviewing…", t.accent).loop("opacity", { from: 0.4, to: 1, period: 800 })];
      if (!rv || rv.sha !== sha) return [];
      if (rv.state !== "done") return [chip("review failed", t.dim)];
      const counts = [0, 1, 2, 3].map((n) => rv.findings.filter((f) => f.level === n).length);
      return [
        chip(rv.verdict === "fix first" ? "fix first" : "safe to merge", rv.verdict === "fix first" ? t.ansi1 : t.ansi2),
        ...counts.map((c, n) => (c ? chip(`P${n}${c > 1 ? ` ×${c}` : ""}`, level(n)) : null)).filter(Boolean),
      ];
    };

    const frame = v_flex().id("pr").size_full().min_h(0).bg(t.background).text_color(t.foreground).text_size(13)
      .track_focus(this.handle)
      .on_mouse_down("left", () => { if (!this.typing) this.handle.focus(); })
      .on_key_down((e, cx) => this.keys(e, cx));

    if (this.mode === "list" || !this.pr) {
      const { groups, flat } = this.ordered();
      const inbox = this.scope === "inbox";
      const tab = (id, label, on, action) => div().id(id).h(26).px(10).flex().flex_none().items_center().rounded(6).text_size(12).cursor_pointer()
        .when(on, (e) => e.bg(t.selected).text_color(t.foreground)).when(!on, (e) => e.text_color(t.muted).hover((s) => s.bg(t.hover)))
        .on_mouse_down("left", stop).on_click(action).child(label);
      const row = (p) => {
        const i = flat.indexOf(p), rv = reviews[keyOf(p.repo, p.number)];
        const top = rv && rv.sha === p.sha && rv.state === "done" ? rv.findings.find((f) => !f.state) : null;
        return v_flex().id(`pr-${p.repo}-${p.number}`).px(14).py(9).gap(4).flex_none().rounded(8).cursor_pointer()
          .when(i === this.sel, (e) => e.bg(t.selected)).hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => { this.sel = i; this.openPr(p, cx); })
          .child(h_flex().gap(8).items_center()
            .child(div().flex_none().text_color(t.dim).child(`#${p.number}`))
            .child(div().flex_1().min_w(0).truncate().font_semibold().child(p.title))
            .children(verdict(p.repo, p.number, p.sha))
            .when(p.asked, (e) => e.child(chip("review requested", t.blocked)))
            .when(p.mine, (e) => e.child(chip("yours")))
            .when(p.draft, (e) => e.child(chip("draft")))
            .when(p.unresolved > 0, (e) => e.child(chip(`${p.unresolved} unresolved`, t.ansi3)))
            .when(Boolean(p.checks), (e) => e.child(checks(p.checks)))
            .when(Boolean(DECISION[p.decision]), (e) => e.child(decision(p.decision))))
          .child(h_flex().gap(10).text_size(11.5).text_color(t.dim)
            .when(inbox, (e) => e.child(div().text_color(t.muted).child(p.repo)))
            .child(p.author)
            .child(`${p.head} → ${p.base}`)
            .child(div().text_color(t.ansi2).child(`+${p.add}`))
            .child(div().text_color(t.ansi1).child(`−${p.del}`))
            .child(plural(p.files, "file"))
            .child(`updated ${ago(p.updatedAt)}`)
            .when(inbox, (e) => e.child(div().text_color(t.accent).child(`as ${p.account}`))))
          .when(Boolean(top), (e) => e.child(h_flex().gap(8).text_size(11.5).items_center()
            .child(div().flex_none().text_color(level(top.level)).child(`P${top.level}`))
            .child(div().min_w(0).truncate().text_color(t.muted).child(top.title))
            .child(div().flex_none().text_color(t.dim).child(top.path ? `${top.path.split("/").pop()}:${top.line}` : ""))));
      };
      const running = Object.keys(jobs).length;
      return frame
        .child(h_flex().h(44).flex_none().px(14).gap(10).items_center().border_b(1).border_color(t.border)
          .child(div().font_semibold().flex_none().child("Pull requests"))
          .child(h_flex().gap(2).p(2).rounded(8).bg(t.surface)
            .when(Boolean(this.here), (e) => e.child(tab("pr-scope-repo", this.here.repo, !inbox, (_e, cx) => this.setScope("repo", cx))))
            .child(tab("pr-scope-inbox", "Inbox, all accounts", inbox, (_e, cx) => this.setScope("inbox", cx))))
          .child(chip(`${this.rows.length} open`))
          .when(running > 0, (e) => e.child(chip(`${running} reviewing`, t.accent).loop("opacity", { from: 0.4, to: 1, period: 800 })))
          .child(div().flex_1())
          .child(button("pr-auto", auto ? "Auto-review on" : "Auto-review off", (_e, cx) => { setShared("pr.auto", !auto); cx.notify(); }))
          .when(!inbox && Boolean(this.hereAccount), (e) => e.child(div().id("pr-account").h(24).px(8).flex().flex_none().items_center().rounded(12).border_1().border_color(t.accent).text_size(11.5).text_color(t.accent)
            .when(this.accounts.length > 1, (a) => a.cursor_pointer().hover((s) => s.bg(t.hover)))
            .on_mouse_down("left", stop).on_click((_e, cx) => this.cycleAccount(cx)).child(`as ${this.hereAccount}`)))
          .child(button("pr-refresh", this.loading ? "Loading…" : "Refresh", (_e, cx) => this.refresh(cx))))
        .when(Boolean(banner), (e) => e.child(banner))
        .when(inbox && Boolean(this.hereNote) && !this.here, (e) => e.child(div().flex_none().px(14).py(6).text_size(11.5).text_color(t.dim).child(`${this.hereNote} Showing the inbox.`)))
        .children(this.failed.map((f) => div().flex_none().px(14).py(4).text_size(11.5).text_color(t.ansi3).child(`${f.account}: ${f.error}`)))
        .child(v_flex().id("pr-list").flex_1().min_h(0).overflow_y_scrollbar().p(8).gap(2)
          .children(groups.flatMap((g) => [
            ...(groups.length > 1 || g.id !== "none" ? [h_flex().flex_none().px(14).pt(10).pb(4).gap(8).items_center().text_size(11).text_color(g.id === "fix" ? t.ansi1 : g.id === "notes" ? t.ansi3 : g.id === "clean" ? t.ansi2 : t.dim)
              .child(div().font_semibold().child(g.label.toUpperCase())).child(div().text_color(t.dim).child(String(g.rows.length)))] : []),
            ...g.rows.map(row),
          ]))
          .when(!this.rows.length && !this.error, (e) => e.child(div().p(10).text_color(t.dim).child(this.loading ? "Loading pull requests…" : "No open pull requests."))))
        .child(div().flex_none().px(14).py(6).border_t(1).border_color(t.border).text_size(11).text_color(t.dim)
          .child("j / k move · enter open · i inbox · r refresh · reviews run /clays-review in the background, 2 at a time"));
    }

    const pr = this.pr, drafts = this.drafts(), rv = this.review();
    const file = this.fileAt(this.open), shown = this.shown();
    const seen = this.files.filter((f) => f.viewed === "VIEWED").length;
    const mono = settings().font_family ?? "JetBrains Mono";
    const openThreads = this.threads.filter((x) => !x.resolved);
    const pending = this.findings(null);

    const fileRow = (f) => {
      const parts = f.path.split("/"), name = parts.pop(), mark = this.marks.get(f.path);
      return h_flex().h(26).w_full().flex_none().px(8).gap(7).items_center().rounded(6).cursor_pointer()
        .when(this.open === f.path, (e) => e.bg(t.selected))
        .child(div().w(12).flex_none().text_size(11).text_color(f.viewed === "VIEWED" ? t.ansi2 : f.viewed === "DISMISSED" ? t.ansi3 : t.border)
          .child(f.viewed === "VIEWED" ? "✓" : f.viewed === "DISMISSED" ? "↻" : "·"))
        .child(div().w(10).flex_none().text_size(11).text_color(f.status === "A" ? t.ansi2 : f.status === "D" ? t.ansi1 : t.ansi3).child(f.status))
        .child(h_flex().flex_1().min_w(0).gap(6).when(f.viewed === "VIEWED", (e) => e.opacity(0.55))
          .child(div().min_w(0).truncate().child(name))
          .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(parts.join("/"))))
        .when(Boolean(mark?.finds), (e) => e.child(div().flex_none().px(5).rounded(8).text_size(10).border_1().border_color(level(mark.worst)).text_color(level(mark.worst)).child(`P${mark.worst}`)))
        .when(Boolean(mark?.notes), (e) => e.child(div().flex_none().px(5).rounded(8).bg(t.accent).text_color(t.accent_foreground).text_size(10).child(String(mark.notes))))
        .child(div().flex_none().text_size(11).text_color(t.ansi2).child(`+${f.add}`))
        .child(div().flex_none().text_size(11).text_color(t.ansi1).child(`−${f.del}`));
    };
    const overviewRow = () => h_flex().h(26).w_full().flex_none().px(8).gap(8).items_center().rounded(6).cursor_pointer()
      .when(this.open === OVERVIEW, (e) => e.bg(t.selected))
      .child(div().flex_1().child("Overview"))
      .when(pending.length > 0, (e) => e.child(div().flex_none().text_size(11).text_color(level(Math.min(...pending.map((f) => f.level)))).child(plural(pending.length, "finding"))))
      .when(openThreads.length > 0, (e) => e.child(div().flex_none().text_size(11).text_color(t.ansi3).child(`${openThreads.length} open`)));

    // Rows of the diff list. A virtual list's renderer may not register handlers, so each
    // item is one click target, reported through on_item_click.
    const note = (color, head, lines, picked) => div().w_full().flex_none().pl(106).py(3).child(
      v_flex().w(NOTE_WIDTH).h_full().px(10).py(6).rounded(6).border_1().border_color(picked ? t.foreground : color).bg(t.raised).cursor_pointer()
        .child(head)
        .children(lines.map((l) => div().h(18).flex_none().truncate().child(l || " "))));
    const item = (it, i) => {
      if (it.type === "row") {
        const r = it.row;
        if (r.kind === "@") return div().w_full().h(20).flex_none().px(12).truncate().bg(t.raised).text_color(t.dim).child(r.text);
        return h_flex().w_full().h(20).flex_none().cursor_pointer()
          .when(r.kind === "+", (e) => e.bg(t.ansi2 + "18")).when(r.kind === "-", (e) => e.bg(t.ansi1 + "18"))
          .when(this.pick?.kind === "line" && this.pick.index === i && this.pick.path === this.open, (e) => e.bg(t.selected))
          .child(div().w(44).flex_none().text_right().text_color(t.dim).child(r.o == null ? "" : String(r.o)))
          .child(div().w(44).flex_none().text_right().text_color(t.dim).child(r.n == null ? "" : String(r.n)))
          .child(div().w(22).flex_none().pl(9).text_color(r.kind === "+" ? t.ansi2 : r.kind === "-" ? t.ansi1 : t.dim).child(r.kind))
          .child(div().flex_1().min_w(0).truncate().child(r.text || " "));
      }
      if (it.type === "draft") {
        return note(t.accent, h_flex().h(18).flex_none().gap(8).items_center().text_color(t.dim)
          .child(div().font_semibold().text_color(t.accent).child(it.draft.from === "claude" ? "Your draft, from the review. Not posted" : "Your draft. Not posted"))
          .child(div().flex_1()).child("click to edit"), it.lines, this.pick?.kind === "draft" && this.pick.i === it.draft.i).h(this.sizes[i]);
      }
      if (it.type === "suggest") {
        const f = it.finding;
        return note(level(f.level), h_flex().h(18).flex_none().gap(8).items_center().text_color(t.dim)
          .child(div().flex_none().font_semibold().text_color(level(f.level)).child(`/clays-review P${f.level}`))
          .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child(f.title))
          .child(div().flex_none().child(it.anchored ? "not a draft yet · click" : `line ${f.line ?? "?"} is outside the diff · click`)), it.lines,
        this.pick?.kind === "suggest" && this.pick.i === f.i).h(this.sizes[i]);
      }
      const th = it.thread, picked = this.pick?.kind === "thread" && this.pick.id === th.id;
      const head = h_flex().h(22).flex_none().gap(8).items_center().text_color(t.dim)
        .child(div().flex_none().font_semibold().text_color(th.resolved ? t.ansi2 : t.ansi3).child(th.resolved ? "Resolved" : "Open thread"))
        .child(div().flex_none().child(it.where))
        .when(th.outdated && th.line != null, (e) => e.child(div().flex_none().child("outdated")))
        .when(!it.open, (e) => e.child(div().flex_1().min_w(0).truncate().child(`@${th.comments[0].user}: ${th.comments[0].body.split("\n")[0]}`)))
        .when(it.open, (e) => e.child(div().flex_1()))
        .child(div().flex_none().child(it.open ? (picked ? "click to close" : "click to reply or resolve") : `${plural(th.comments.length, "comment")} · click to open`));
      return div().w_full().h(this.sizes[i]).flex_none().pl(106).py(3).child(
        v_flex().w(NOTE_WIDTH).h_full().px(10).py(6).rounded(6).border_1().border_color(picked ? t.foreground : th.resolved ? t.border : t.ansi3).bg(t.raised).cursor_pointer()
          .child(head)
          .children(it.parts.flatMap((part) => [
            h_flex().h(18).flex_none().gap(8).text_color(t.dim)
              .child(div().font_semibold().text_color(part.draft ? t.accent : t.muted).child(part.draft ? "Your reply. Not posted" : `@${part.user}`))
              .when(!part.draft, (e) => e.child(ago(part.at))),
            ...part.lines.map((l) => div().h(18).flex_none().truncate().child(l || " ")),
            div().h(6).flex_none(),
          ])));
    };

    // The background review, at the top of the Overview.
    const reviewCard = () => {
      const job = jobs[this.key()];
      const card = v_flex().gap(8).p(12).rounded(8).border_1().border_color(rv?.state === "done" && !rv.stale ? (rv.verdict === "fix first" ? t.ansi1 : t.ansi2) : t.border).bg(t.surface);
      const title = h_flex().gap(8).items_center().child(div().font_semibold().child("/clays-review"));
      if (job) return card.child(title.child(chip("reviewing…", t.accent).loop("opacity", { from: 0.4, to: 1, period: 800 })).child(div().text_size(11.5).text_color(t.dim).child(`started ${ago(new Date(job.started).toISOString())}, in the background`)));
      if (!rv || rv.stale) {
        return card.child(title
          .child(div().flex_1().text_size(11.5).text_color(t.dim).child(rv ? "The review on file is for an older commit." : pr.draft ? "Drafts are not reviewed automatically." : "Not reviewed yet."))
          .child(button("pr-review-run", "Review now", (_e, cx) => this.rerun(cx))));
      }
      if (rv.state !== "done") {
        return card.child(title.child(chip("failed", t.ansi1)).child(div().flex_1().min_w(0).text_size(11.5).text_color(t.muted).child(rv.error ?? "The review failed."))
          .child(button("pr-review-run", "Try again", (_e, cx) => this.rerun(cx))));
      }
      return card
        .child(title
          .child(chip(rv.verdict, rv.verdict === "fix first" ? t.ansi1 : t.ansi2))
          .child(div().flex_1().min_w(0).text_size(11.5).text_color(t.muted).child(rv.reason || ""))
          .when(pending.length > 0, (e) => e.child(button("pr-take-all", "Take all as drafts", (_e, cx) => this.takeAll(cx))))
          .child(button("pr-review-run", "Review again", (_e, cx) => this.rerun(cx))))
        .when(Boolean(rv.headline), (e) => e.child(div().text_size(11.5).text_color(t.dim).child(rv.headline)))
        .when(!rv.findings.length, (e) => e.child(div().text_color(t.muted).child("No issues found.")))
        .children(rv.findings.map((f, i) => v_flex().id(`pr-finding-${i}`).gap(3).px(8).py(6).rounded(6).cursor_pointer().hover((s) => s.bg(t.hover))
          .when(Boolean(f.state), (e) => e.opacity(0.5))
          .on_click((_e, cx) => { if (f.path && this.fileAt(f.path)) this.show(f.path, cx, f.state ? { line: f.line } : { finding: i }); })
          .child(h_flex().gap(8).items_center()
            .child(div().flex_none().font_semibold().text_color(level(f.level)).child(`P${f.level}`))
            .child(div().flex_1().min_w(0).font_semibold().child(f.title))
            .when(Boolean(f.state), (e) => e.child(chip(f.state)))
            .child(div().flex_none().text_size(11.5).text_color(t.accent).child(f.path ? `${f.path}:${f.line}` : "")))
          .child(div().text_size(12).text_color(t.muted).child(f.body))))
        .child(div().text_size(11).text_color(t.dim).child([`reviewed ${ago(new Date(rv.at).toISOString())}`, rv.secs ? `${rv.secs} s` : null, rv.cost != null ? `$${rv.cost.toFixed(2)}` : null, "findings are never posted; taking one makes it your draft"].filter(Boolean).join(" · ")));
    };

    const overview = () => div().id("pr-overview").flex_1().min_w(0).min_h(0).h_full().overflow_y_scrollbar().p(18).child(
      v_flex().gap(14).max_w(940)
        .child(reviewCard())
        .children(this.parts.length ? this.parts.map((p, i) => {
          if (p.type === "md") return TextView.markdown(`pr-body-${i}`, p.text);
          if (p.scene) return drawScene(`pr-diagram-${i}`, p.scene, t, mono, t.surface);
          return v_flex().gap(4)
            .child(div().text_size(11).text_color(t.dim).child(`A ${mermaidKind(p.source)} diagram: only sequence diagrams and flowcharts are drawn here.`))
            .child(TextView.markdown(`pr-body-${i}`, "```\n" + p.source + "\n```"));
        }) : [div().text_color(t.dim).child("No description.")])
        .when(pr.checkList.length > 0, (e) => e.child(v_flex().gap(4).p(12).rounded(8).border_1().border_color(t.border)
          .child(div().font_semibold().pb(2).child("Checks"))
          .children(pr.checkList.map((c) => h_flex().gap(8).text_size(12)
            .child(div().w(52).flex_none().text_color(c.state === "fail" ? t.ansi1 : c.state === "pass" ? t.ansi2 : c.state === "skip" ? t.dim : t.ansi3).child(c.state))
            .child(div().min_w(0).truncate().child(c.name))))))
        .when(openThreads.length > 0, (e) => e.child(v_flex().gap(2).p(12).rounded(8).border_1().border_color(t.ansi3)
          .child(div().font_semibold().pb(2).child(`${plural(openThreads.length, "unresolved thread")} of ${this.threads.length}`))
          .children(openThreads.map((th, i) => h_flex().id(`pr-open-thread-${i}`).gap(8).px(6).py(3).rounded(6).text_size(12).cursor_pointer().hover((s) => s.bg(t.hover))
            .on_click((_e, cx) => this.show(th.path, cx, { thread: th.id }))
            .child(div().flex_none().text_color(t.accent).child(`${th.path.split("/").pop()}${th.line ? `:${th.line}` : ""}`))
            .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(`@${th.comments[0].user}: ${th.comments[0].body.split("\n")[0]}`))))))
        .children(pr.talk.map((c, i) => v_flex().gap(6).p(10).rounded(8).border_1().border_color(t.border)
          .child(h_flex().gap(8).items_center().text_size(11.5).text_color(t.dim)
            .child(div().font_semibold().text_color(t.muted).child(`@${c.who}`))
            .when(Boolean(c.state), (e) => e.child(chip(String(c.state).toLowerCase().replace(/_/g, " "), c.state === "APPROVED" ? t.ansi2 : c.state === "CHANGES_REQUESTED" ? t.ansi1 : undefined)))
            .child(ago(c.at)))
          .when(Boolean(c.body), (e) => e.child(TextView.markdown(`pr-talk-${i}`, c.body))))));

    // The bar under the diff: what a click picked, and what to do with it.
    const bar = () => {
      const p = this.pick;
      const th = p.kind === "thread" ? this.threads.find((x) => x.id === p.id) : null;
      const f = p.kind === "suggest" ? rv?.findings[p.i] : null;
      const d = p.kind === "draft" ? drafts[p.i] : null;
      const label = p.kind === "line" ? `New comment on ${p.path}:${p.line}${p.side === "LEFT" ? " (removed line)" : ""}`
        : p.kind === "draft" ? `Your draft on ${d?.thread ? "a thread" : `${d?.path}:${d?.line}`}`
          : p.kind === "suggest" ? `Finding on ${f?.path}:${f?.line}. Edit it, then take it as your draft`
            : `Reply in the thread on ${th?.path}${th?.line ? `:${th.line}` : ""}`;
      const resolving = th && this.confirm === `resolve:${th.id}`;
      return h_flex().flex_none().p(10).gap(8).border_t(1).border_color(t.border).bg(t.surface)
        .child(v_flex().flex_1().min_w(0).gap(5)
          .child(div().text_size(11).text_color(t.dim).child(label))
          .child(div().id("pr-comment").px(10).py(6).rounded(8).border_1().border_color(this.typing ? t.accent : t.border).cursor_text()
            .on_mouse_down("left", stop).child(Textarea.new(this.comment).text_size(12).text_color(t.foreground))))
        .child(v_flex().flex_none().gap(6)
          .child(button("pr-save-draft", p.kind === "draft" ? "Save draft" : p.kind === "thread" ? "Add reply draft" : p.kind === "suggest" ? (p.anchored ? "Take as draft" : "Add to summary") : "Add draft", (_e, cx) => this.saveDraft(cx), true))
          .when(p.kind === "draft", (e) => e.child(button("pr-drop", "Delete draft", (_e, cx) => this.dropPicked(cx))))
          .when(p.kind === "suggest", (e) => e.child(button("pr-drop", "Dismiss", (_e, cx) => this.dropPicked(cx))))
          .when(Boolean(th) && (th.resolved ? th.canUnresolve : th.canResolve), (e) => e.child(button("pr-resolve", resolving ? `${th.resolved ? "Reopen" : "Resolve"} as ${pr.account}?` : th.resolved ? "Reopen thread" : "Resolve thread", (_e, cx) => this.resolve(th, cx), resolving)))
          .child(button("pr-cancel", "Cancel", (_e, cx) => this.unpick(cx))));
    };

    const diff = () => v_flex().flex_1().min_w(0).min_h(0).h_full()
      .child(h_flex().h(34).flex_none().px(12).gap(10).items_center().border_b(1).border_color(t.border).text_size(12)
        .child(div().flex_1().min_w(0).truncate().child(this.open))
        .when(Boolean(this.state?.local) && !this.state.wait, (e) => e.child(chip("from local git")))
        .child(div().flex_none().text_color(t.ansi2).child(`+${file?.add ?? 0}`))
        .child(div().flex_none().text_color(t.ansi1).child(`−${file?.del ?? 0}`))
        .when(Boolean(this.state?.fetch), (e) => e.child(button("pr-fetch", `git fetch origin pull/${pr.number}/head`, (_e, cx) => this.fetchCommits(cx))))
        .child(button("pr-viewed", file?.viewed === "VIEWED" ? "✓ Viewed" : file?.viewed === "DISMISSED" ? "↻ Changed since viewed" : "Mark viewed", (_e, cx) => this.toggleViewed(this.open, cx))))
      .child(div().flex_1().min_h(0).relative().font_family(mono).text_size(12)
        .child(div().id("pr-diff-x").size_full().overflow_x_scrollbar()
          .child(div().w_full().min_w(this.width).h_full().child(
            v_virtual_list("pr-diff", this.items.length, this.sizes, (i) => String(i),
              (range) => this.items.slice(range.start, range.end).map((it, k) => item(it, range.start + k)))
              .on_item_click((key, cx) => this.pickItem(Number(key), cx))
              .track_scroll(this.scroll).size_full())))
        .child(Scrollbar.vertical("pr-diff").viewport_from_layout().absolute().inset_0())
        .when(!this.state?.rows?.length && Boolean(this.state?.wait || this.state?.say), (e) => e.child(div().absolute().top(8).px(12).max_w(760).text_color(t.dim).child(this.state.wait ?? this.state.say))))
      .when(Boolean(this.pick), (e) => e.child(bar()));

    const post = (event) => {
      const armed = this.confirm === `post:${event}`;
      return button(`pr-post-${event}`, this.busy ? "Working…" : armed ? `Post as ${pr.account}?` : EVENTS[event], (_e, cx) => this.submit(event, cx), armed);
    };
    const rows = [null, ...shown];

    return frame
      .child(h_flex().h(44).flex_none().px(12).gap(10).items_center().border_b(1).border_color(t.border)
        .child(button("pr-back", "← PRs", (_e, cx) => this.back(cx)))
        .child(div().flex_none().text_color(t.dim).child(`#${pr.number}`))
        .child(div().flex_1().min_w(0).truncate().font_semibold().child(pr.title))
        .child(div().flex_none().text_size(11.5).text_color(t.dim).child(`${pr.repo} · ${pr.author} · ${pr.head} → ${pr.base}`))
        .when(pr.state !== "OPEN", (e) => e.child(chip(pr.state.toLowerCase(), t.accent)))
        .when(pr.draft, (e) => e.child(chip("draft")))
        .children(verdict(pr.repo, pr.number, pr.headOid).slice(0, 1))
        .when(Boolean(pr.checks), (e) => e.child(checks(pr.checks)))
        .when(Boolean(DECISION[pr.decision]), (e) => e.child(decision(pr.decision)))
        .when(Boolean(MERGE[pr.merge]), (e) => e.child(chip(MERGE[pr.merge][0], t[MERGE[pr.merge][1]])))
        .child(button("pr-ask", "Ask Claude", () => this.askClaude()))
        .child(chip(`as ${pr.account}`, t.accent))
        .child(button("pr-refresh", this.loading ? "Loading…" : "Refresh", (_e, cx) => this.refresh(cx))))
      .when(Boolean(banner), (e) => e.child(banner))
      .child(h_flex().flex_1().min_h(0).items_stretch()
        .child(v_flex().w(340).flex_none().h_full().border_r(1).border_color(t.border).bg(t.surface)
          .child(h_flex().h(34).flex_none().px(12).items_center().justify_between().border_b(1).border_color(t.border).text_size(12)
            .child(div().font_semibold().child(`${plural(this.files.length, "file")}  +${pr.add} −${pr.del}`))
            .child(div().text_color(seen === this.files.length && seen > 0 ? t.ansi2 : t.dim).child(`${seen}/${this.files.length} viewed`)))
          .when(this.files.length > 12, (e) => e.child(div().id("pr-filter").flex_none().mx(8).mt(8).h(28).px(8).flex().items_center().rounded(7).border_1().border_color(t.border).cursor_text()
            .on_mouse_down("left", stop).child(Input.new(this.filter).h_full().text_size(12).text_color(t.foreground))))
          .child(div().flex_1().min_h(0).relative().p(6)
            .child(v_virtual_list("pr-files", rows.length, 26, (i) => (i === 0 ? OVERVIEW : rows[i].path),
              (range) => rows.slice(range.start, range.end).map((f) => (f ? fileRow(f) : overviewRow())))
              .on_item_click((key, cx) => this.show(key, cx))
              .track_scroll(this.fileScroll).size_full())
            .child(Scrollbar.vertical("pr-files").absolute().inset_0())))
        .child(this.open === OVERVIEW ? overview() : diff()))
      .when(Boolean(this.note), (e) => e.child(div().flex_none().px(14).py(6).text_size(11.5).text_color(this.note.startsWith("Posted") || this.note.startsWith("Thread") ? t.ansi2 : t.ansi3).child(this.note)))
      .child(h_flex().h(52).flex_none().px(12).gap(8).items_center().border_t(1).border_color(t.border)
        .child(div().flex_none().text_size(11.5).text_color(drafts.length ? t.accent : t.dim).child(plural(drafts.length, "draft")))
        .child(div().id("pr-summary").flex_1().min_w(0).h(32).px(10).flex().items_center().rounded(8).border_1().border_color(t.border).cursor_text()
          .on_mouse_down("left", stop).child(Input.new(this.summary).h_full().text_size(12).text_color(t.foreground)))
        .child(post("COMMENT"))
        .when(!pr.mine, (e) => e.child(post("APPROVE")).child(post("REQUEST_CHANGES")))
        .child(div().flex_none().text_size(11).text_color(t.dim).child("n / p file · v viewed · u next thread · o overview · esc back")));
  }
}
