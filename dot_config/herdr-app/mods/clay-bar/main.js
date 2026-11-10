// The one bar of the "clay" layout.
//
// Left to right: every space as a pill, the shown space's tabs (only when it has more than
// one), a count of agent turns finished today, a + menu, and the PRs, Files and Changes
// buttons.
//
// A pill is: the number ctrl-<n> selects on a tile in the space's color, the space's animal,
// its name, its machine when it is not this computer, and its most urgent agent status.
// working = the animal bobs. blocked = red border and a pulsing "!". done = a check.
// idle or no agent = the animal is dimmed.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, agents, run, openOverlay, theme, window, layout, settings, shared, setShared } from "herdr";

const ANIMALS = ["🐑", "🦊", "🐙", "🦉", "🐢", "🐝", "🦀", "🐧", "🦔", "🐸"];
// The shipped picker and spaces mods keep space colors the same way, in the same order,
// so `clay` and `main` show a space in one color.
const COLORS = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// Gives each id the least-used value from `pool`, keeps what it already has, drops ids that are gone.
function assign(kept, ids, pool) {
  const next = Object.fromEntries(Object.entries(kept).filter(([id]) => ids.includes(id)));
  let changed = Object.keys(next).length !== Object.keys(kept).length;
  for (const id of ids) {
    if (next[id]) continue;
    const uses = (v) => Object.values(next).filter((x) => x === v).length;
    next[id] = pool.reduce((best, v) => (uses(v) < uses(best) ? v : best));
    changed = true;
  }
  return { next, changed };
}

export default class ClayBar extends View {
  init() {
    this.animals = JSON.parse(localStorage.getItem("animals") ?? "{}");
    this.done = JSON.parse(localStorage.getItem("done") ?? "null") ?? { day: today(), n: 0 };
    this.last = {};
  }

  // A turn is finished when an agent goes from working to done or idle.
  countFinished() {
    const day = today();
    if (this.done.day !== day) this.done = { day, n: 0 };
    const now = {};
    let finished = 0;
    for (const a of agents()) {
      if (this.last[a.address] === "working" && (a.status === "done" || a.status === "idle")) finished++;
      now[a.address] = a.status;
    }
    this.last = now;
    if (finished) {
      this.done = { day, n: this.done.n + finished };
      localStorage.setItem("done", JSON.stringify(this.done));
    }
    return this.done.n;
  }

  render() {
    const t = theme();
    const all = spaces();
    const ids = all.map((s) => s.id);
    const tabs = all.find((s) => s.active)?.tabs ?? [];
    // The bar drags the window; a press on a control must not.
    const stop = (_e, cx) => cx.stop_propagation();

    const colors = assign(shared("space.colors") ?? {}, all.filter((s) => s.name !== "~").map((s) => s.id), COLORS);
    if (colors.changed) setShared("space.colors", colors.next);
    const animals = assign(this.animals, ids, ANIMALS);
    if (animals.changed) {
      this.animals = animals.next;
      localStorage.setItem("animals", JSON.stringify(this.animals));
    }
    const finished = this.countFinished();

    const pill = (s, i) => {
      const color = colors.next[s.id];
      const tile = !color ? t.dim : color.startsWith("#") ? color : t[color];
      const quiet = !s.status || s.status === "idle";
      const animal = div().absolute().left(0).text_size(13).child(this.animals[s.id] ?? "");
      return h_flex().id(`space-${s.id}`).h(26).pl(5).pr(9).gap(6).rounded(7).items_center().flex_none().text_size(12.5)
        .border(1).border_color(s.status === "blocked" ? t.blocked : s.active ? t.border : t.chrome)
        .bg(s.active ? t.raised : t.chrome)
        .text_color(s.active ? t.foreground : t.muted)
        .hover((el) => el.bg(t.hover))
        .on_mouse_down("left", (e, cx) => {
          cx.stop_propagation();
          if (e.click_count === 2) run("space.rename", { id: s.id });
        })
        .on_mouse_down("right", (_e, cx) => {
          cx.stop_propagation();
          openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: s.id } } });
        })
        .on_click(() => run("space.select", { id: s.id }))
        .child(div().w(16).h(16).rounded(4).flex().flex_none().items_center().justify_center()
          .bg(tile).text_color(t.background).text_size(10.5).font_semibold().child(String(i + 1)))
        .child(div().relative().w(18).h(18).flex_none().child(
          s.status === "working" ? animal.loop("top", { from: 2, to: -3, period: 420 })
            : quiet ? animal.top(0).opacity(0.5) : animal.top(0)))
        .child(div().max_w(180).truncate().child(s.name))
        .when(Boolean(s.machine), (el) => el.child(div().text_size(11).text_color(t.dim).child(s.machine)))
        .when(s.status === "blocked", (el) => el.child(
          div().font_semibold().text_color(t.blocked).loop("opacity", { from: 0.35, to: 1, period: 700 }).child("!")))
        .when(s.status === "done", (el) => el.child(div().font_semibold().text_color(t.done).child("✓")));
    };

    // A tab nobody named is called after its agent, else its first program ("Claude Code", "fish").
    const label = (c) => {
      if (c.named) return c.name;
      const inTab = panes().filter((p) => p.tab === c.id);
      return (inTab.find((p) => p.program?.agent) ?? inTab[0])?.program?.name ?? c.name;
    };

    const tab = (c) => h_flex().id(`tab-${c.id}`).h(24).px(8).gap(6).rounded(6).items_center().flex_none().text_size(12)
      .bg(c.active ? t.selected : t.chrome)
      .text_color(c.active ? t.foreground : t.muted)
      .hover((el) => el.bg(t.hover))
      .on_mouse_down("left", stop)
      .on_click(() => run("tab.select", { id: c.id }))
      .child(div().max_w(140).truncate().child(label(c)))
      .when(c.status === "working", (el) => el.child(svg("mods/clay-bar/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
      .when(c.status === "blocked" || c.status === "done", (el) => el.child(div().size(7).rounded(4).flex_none().bg(t[c.status])));

    const button = (id, label, on, action) => h_flex().id(`bar-${id}`).h(26).px(8).flex_none().items_center().rounded(6).text_size(12)
      .bg(on ? t.selected : t.chrome)
      .text_color(on ? t.foreground : t.muted)
      .hover((el) => el.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop)
      .on_click(action)
      .child(label);

    const root = layout();
    const panel = find(root, "panel");
    const body = find(root, "panel-body");
    const panelButton = (id, label) => {
      const on = Boolean(panel) && !panel.hidden && body?.active === id;
      return button(id, label, on, () => {
        if (on) run("layout.hide", { id: "panel" });
        else {
          run("layout.select", { stack: "panel-body", child: id });
          run("layout.show", { id: "panel" });
        }
      });
    };

    // macOS keeps its window buttons over the layout: leave them room.
    const w = window();
    const lights = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? (root.traffic_lights[0] + 64) / (settings().zoom || 1)
      : 10;

    const items = all.map(pill);
    if (tabs.length > 1) {
      items.push(h_flex().px(6).flex_none().child(div().w(1).h(16).bg(t.border)));
      items.push(...tabs.map(tab));
    }

    return h_flex().size_full().min_w(0).px(10).pl(lights).gap(4).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().id("clay-bar-scroll").flex_1().min_w(0).h_full().items_center().gap(4).overflow_x_scrollbar().children(items))
      .when(finished > 0, (el) => el.child(
        h_flex().flex_none().px(6).gap(5).items_center().text_size(11.5).text_color(t.dim)
          .child(div().text_size(12).child(finished >= 10 ? "🚀" : finished >= 5 ? "🔥" : "🌱"))
          .child(`${finished} done today`)))
      .child(button("new", "+", false, () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })))
      .child(button("prs", "PRs", false, () => run("mod.open", { name: "pr" })))
      .child(panelButton("files", "Files"))
      .child(panelButton("changes", "Changes"));
  }
}
