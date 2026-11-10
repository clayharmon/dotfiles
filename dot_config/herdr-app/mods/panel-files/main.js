// cmd-shift-e: show the Files side panel, or hide the panel when Files is already showing.
//
// keys.json binds the key to `mod.open:panel-files`, which opens this mod as a 1px runner
// (mod.json). It runs the layout commands and closes itself. It works in any layout that
// has a "panel" column holding a "panel-body" stack (main, clay).
//
// mods/panel-changes is the same file with CHILD and TITLE changed.

import { View, div } from "gpui-kit";
import { layout, run, props, closeOverlay, notify } from "herdr";

const CHILD = "files";
const TITLE = "Files panel";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export default class PanelKey extends View {
  init(_props, cx) {
    // Only a copy opened by mod.open acts. `herdr-app check` loads one without an overlay.
    const runner = props()?.overlay;
    if (!runner) return;
    cx.spawn(async () => {
      const root = layout();
      const panel = find(root, "panel");
      const body = find(root, "panel-body");
      if (!panel || !find(body, CHILD)) {
        notify({ title: TITLE, body: "This layout has no such panel.", level: "warning" });
      } else if (!panel.hidden && body.active === CHILD) {
        run("layout.hide", { id: "panel" });
      } else {
        run("layout.select", { stack: "panel-body", child: CHILD });
        run("layout.show", { id: "panel" });
      }
      closeOverlay(runner);
    });
  }

  render() {
    return div();
  }
}
