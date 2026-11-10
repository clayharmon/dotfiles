// GitHub's GraphQL API: the queries this mod sends through `gh api graphql`, and the plain
// objects it turns the answers into. Pure: no Herdr or UI imports, so `node` can test it.

const ROW = `fragment row on PullRequest {
  number title isDraft updatedAt reviewDecision additions deletions changedFiles
  baseRefName headRefName headRefOid author { login } repository { nameWithOwner }
  reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } } } }
  commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
  reviewThreads(first: 60) { nodes { isResolved } }
}`;

// Open PRs of one repository.
export const LIST = `query($owner: String!, $name: String!) {
  viewer { login }
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, first: 50, orderBy: { field: UPDATED_AT, direction: DESC }) { nodes { ...row } }
  }
}
${ROW}`;

// Everything open that involves the account: reviews asked of it, and its own PRs.
export const INBOX = `query {
  viewer { login }
  asked: search(query: "is:open is:pr archived:false review-requested:@me", type: ISSUE, first: 30) { nodes { ... on PullRequest { ...row } } }
  mine: search(query: "is:open is:pr archived:false author:@me", type: ISSUE, first: 30) { nodes { ... on PullRequest { ...row } } }
}
${ROW}`;

export const PR = `query($owner: String!, $name: String!, $number: Int!) {
  viewer { login }
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      id number title body bodyHTML url state isDraft updatedAt
      author { login } baseRefName headRefName baseRefOid headRefOid
      additions deletions changedFiles reviewDecision mergeStateStatus viewerDidAuthor
      commits(last: 1) { nodes { commit { statusCheckRollup { state contexts(first: 60) { nodes {
        __typename ... on CheckRun { name status conclusion } ... on StatusContext { context state }
      } } } } } }
      comments(first: 60) { nodes { author { login } createdAt body } }
      reviews(first: 60) { nodes { author { login } state submittedAt body } }
      reviewThreads(first: 100) { nodes {
        id isResolved isOutdated path line originalLine startLine diffSide subjectType
        viewerCanResolve viewerCanUnresolve viewerCanReply resolvedBy { login }
        comments(first: 50) { nodes { author { login } createdAt body } }
      } }
    }
  }
}`;

// Every changed file with exact counts and this account's "viewed" mark. Paginated by gh.
export const FILES = `query($owner: String!, $name: String!, $number: Int!, $endCursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      files(first: 100, after: $endCursor) {
        pageInfo { hasNextPage endCursor }
        nodes { path additions deletions changeType viewerViewedState }
      }
    }
  }
}`;
export const FILES_JQ = ".data.repository.pullRequest.files.nodes[] | [.path, .additions, .deletions, .changeType, .viewerViewedState] | @json";
// One page of the REST files list: the text diff of each file, where GitHub includes it.
export const PATCH_JQ = ".[] | {f: .filename, p: .patch} | @json";

export const MARK = "mutation($pr: ID!, $path: String!) { markFileAsViewed(input: { pullRequestId: $pr, path: $path }) { clientMutationId } }";
export const UNMARK = "mutation($pr: ID!, $path: String!) { unmarkFileAsViewed(input: { pullRequestId: $pr, path: $path }) { clientMutationId } }";
export const REPLY = "mutation($thread: ID!, $body: String!) { addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $thread, body: $body }) { comment { id } } }";
export const RESOLVE = "mutation($thread: ID!) { resolveReviewThread(input: { threadId: $thread }) { thread { isResolved } } }";
export const UNRESOLVE = "mutation($thread: ID!) { unresolveReviewThread(input: { threadId: $thread }) { thread { isResolved } } }";

const ROLLUP = { SUCCESS: "pass", FAILURE: "fail", ERROR: "fail", PENDING: "pending", EXPECTED: "pending" };
const CHECK = {
  SUCCESS: "pass", NEUTRAL: "pass", SKIPPED: "skip", STALE: "skip",
  FAILURE: "fail", ERROR: "fail", TIMED_OUT: "fail", CANCELLED: "fail", ACTION_REQUIRED: "fail", STARTUP_FAILURE: "fail",
};
const STATUS = { ADDED: "A", DELETED: "D", RENAMED: "R", COPIED: "C", MODIFIED: "M", CHANGED: "M" };
const lower = (s) => String(s ?? "").toLowerCase();

function row(node, account, viewer, asked) {
  if (!node?.number) return null;
  const author = node.author?.login ?? "ghost";
  const requested = (node.reviewRequests?.nodes ?? []).some((r) => lower(r?.requestedReviewer?.login) === lower(viewer));
  return {
    repo: node.repository.nameWithOwner, account, number: node.number, title: node.title, author,
    mine: lower(author) === lower(viewer), asked: Boolean(asked) || requested,
    draft: node.isDraft, decision: node.reviewDecision, updatedAt: node.updatedAt,
    head: node.headRefName, base: node.baseRefName, sha: node.headRefOid, add: node.additions, del: node.deletions, files: node.changedFiles,
    checks: ROLLUP[node.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state] ?? null,
    unresolved: (node.reviewThreads?.nodes ?? []).filter((t) => !t.isResolved).length,
  };
}

// Reviews asked of you first, then other people's PRs, then your own; newest first in each.
export function sortRows(rows) {
  const rank = (r) => (r.asked ? 0 : r.mine ? 2 : 1);
  return [...rows].sort((a, b) => rank(a) - rank(b) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function shapeList(json, account) {
  const viewer = json?.data?.viewer?.login ?? account;
  return sortRows((json?.data?.repository?.pullRequests?.nodes ?? []).map((n) => row(n, account, viewer, false)).filter(Boolean));
}

export function shapeInbox(json, account) {
  const viewer = json?.data?.viewer?.login ?? account, seen = new Set(), rows = [];
  for (const [nodes, asked] of [[json?.data?.asked?.nodes, true], [json?.data?.mine?.nodes, false]]) {
    for (const n of nodes ?? []) {
      const r = row(n, account, viewer, asked);
      if (!r || seen.has(`${r.repo}#${r.number}`)) continue;
      seen.add(`${r.repo}#${r.number}`);
      rows.push(r);
    }
  }
  return sortRows(rows);
}

function checkOf(node) {
  if (node.__typename === "StatusContext") return { name: node.context, state: ROLLUP[node.state] ?? "pending" };
  const state = node.conclusion ? (CHECK[node.conclusion] ?? "pending") : "pending";
  return { name: node.name, state };
}

// { pr, threads } for one pull request, or null when GitHub returned none.
export function shapePr(json, repo, account) {
  const p = json?.data?.repository?.pullRequest;
  if (!p) return null;
  const rollup = p.commits?.nodes?.[0]?.commit?.statusCheckRollup;
  const talk = [
    ...(p.comments?.nodes ?? []).map((c) => ({ who: c.author?.login ?? "ghost", at: c.createdAt, body: c.body })),
    ...(p.reviews?.nodes ?? []).filter((r) => r.body || (r.state !== "COMMENTED" && r.state !== "PENDING"))
      .map((r) => ({ who: r.author?.login ?? "ghost", at: r.submittedAt, body: r.body, state: r.state })),
  ].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const threads = (p.reviewThreads?.nodes ?? []).map((t) => ({
    id: t.id, path: t.path, line: t.line, side: t.diffSide ?? "RIGHT", start: t.startLine, was: t.originalLine,
    resolved: t.isResolved, outdated: t.isOutdated, onFile: t.subjectType === "FILE", resolvedBy: t.resolvedBy?.login ?? null,
    canResolve: t.viewerCanResolve, canUnresolve: t.viewerCanUnresolve, canReply: t.viewerCanReply,
    comments: (t.comments?.nodes ?? []).map((c) => ({ user: c.author?.login ?? "ghost", at: c.createdAt, body: c.body })),
  })).filter((t) => t.comments.length);
  return {
    pr: {
      id: p.id, repo, account, viewer: json.data.viewer?.login ?? account,
      number: p.number, title: p.title, body: p.body ?? "", html: p.bodyHTML ?? "", url: p.url, state: p.state, draft: p.isDraft,
      author: p.author?.login ?? "ghost", mine: Boolean(p.viewerDidAuthor),
      head: p.headRefName, base: p.baseRefName, headOid: p.headRefOid, baseOid: p.baseRefOid,
      add: p.additions, del: p.deletions, changed: p.changedFiles,
      decision: p.reviewDecision, merge: p.mergeStateStatus,
      checks: ROLLUP[rollup?.state] ?? null, checkList: (rollup?.contexts?.nodes ?? []).filter(Boolean).map(checkOf),
      talk,
    },
    threads,
  };
}

// One line of FILES_JQ output.
export function shapeFile([path, add, del, change, viewed]) {
  return { path, add, del, status: STATUS[change] ?? "M", viewed: viewed ?? "UNVIEWED" };
}
