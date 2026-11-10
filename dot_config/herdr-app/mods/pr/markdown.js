// Prepares GitHub markdown for the tab: splits out ```mermaid blocks so they can be drawn,
// and rewrites the GitHub-only parts the markdown view would otherwise show raw.
// Pure: no Herdr or UI imports, so `node` can test it.

const ALERTS = { NOTE: "ℹ️ Note", TIP: "💡 Tip", IMPORTANT: "❗ Important", WARNING: "⚠️ Warning", CAUTION: "🛑 Caution" };

// Applied to text outside code fences only.
function githubish(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    // An alert's label becomes its own bold paragraph inside the quote.
    .replace(/^([ \t]*>[ \t]*)\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*$/gim, (_m, lead, kind) => `${lead}**${ALERTS[kind.toUpperCase()]}**\n${lead.trimEnd()}`)
    .replace(/<summary[^>]*>([\s\S]*?)<\/summary>/gi, (_m, inner) => `\n\n**▾ ${inner.trim()}**\n\n`)
    .replace(/<\/?details[^>]*>/gi, "\n")
    // The markdown view cannot load pictures: each becomes a link that says what it is.
    .replace(/<img\b[^>]*>/gi, (tag) => {
      const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
      const alt = /\balt\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
      return src ? `[🖼 ${alt || "image"}](${src})` : "";
    })
    .replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_m, alt, url) => `[🖼 ${alt || "image"}](${url})`)
    .replace(/<br\s*\/?>/gi, "  \n")
    .replace(/<\/?(?:sub|sup|kbd|picture|source|p|div|span|center)\b[^>]*>/gi, "");
}

// [{ type: "md", text } | { type: "mermaid", source }], in document order.
export function segments(body) {
  const out = [];
  let prose = [], code = [], fence = null;
  const flushProse = () => {
    if (!prose.length) return "";
    const text = githubish(prose.join("\n"));
    prose = [];
    return text;
  };
  let pending = "";
  const push = (text) => { pending += text; };
  const cut = () => { if (pending.trim()) out.push({ type: "md", text: pending.trim() }); pending = ""; };

  for (const line of String(body ?? "").replace(/\r/g, "").split("\n")) {
    if (!fence) {
      const m = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/.exec(line);
      if (m) {
        push(flushProse() + "\n");
        fence = { mark: m[1][0], size: m[1].length, lang: m[2].toLowerCase(), open: line };
        code = [];
      } else prose.push(line);
      continue;
    }
    const close = new RegExp(`^ {0,3}\\${fence.mark}{${fence.size},}\\s*$`).test(line);
    if (!close) { code.push(line); continue; }
    if (fence.lang === "mermaid") { cut(); out.push({ type: "mermaid", source: code.join("\n") }); }
    else push(`${fence.open}\n${code.join("\n")}\n${line}\n`);
    fence = null;
  }
  if (fence) push(`${fence.open}\n${code.join("\n")}\n`);
  else push(flushProse());
  cut();
  return out;
}
