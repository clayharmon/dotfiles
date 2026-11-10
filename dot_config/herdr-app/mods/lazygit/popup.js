// A program in a dialog over the window, started in the focused terminal's folder.
//
// keys.json binds a key to `mod.open:<name>`, which opens this mod as a 1px runner
// (mod.json). The runner starts the program, opens the dialog and closes itself.
// The same key again, a click beside the dialog, or the program exiting closes the
// dialog, and closing ends the program.
//
// This file is identical in mods/lazygit and mods/bdi: change both.

import { View, div } from "gpui-kit";
import { exec, hc, focused, spaces, run, openOverlay, closeOverlay, notify, props } from "herdr";

// The dialog closes when its program ends. A program that fails at once (bdi outside a beads
// project exits 1) would flash and vanish, so a nonzero exit holds the dialog open on the
// program's own error until Enter. Unix machines only: it runs through sh.
const HOLD = `"$@"; code=$?; [ "$code" -eq 0 ] || { printf '\\n%s exited with code %s. Press enter to close.' "$0" "$code"; read -r _; }`;

// A runner lives for one key press, so the open dialog is remembered here.
function dialogs() {
  return (globalThis.__popup_dialogs ??= {});
}

async function toggle(name, argv) {
  const open = dialogs();
  const shown = open[name];
  if (shown) {
    delete open[name];
    closeOverlay(shown.overlay);
    if (shown.pane) run("pane.focus", { pane: shown.pane });
    return;
  }

  const now = focused();
  const space = spaces().find((s) => s.id === now?.space);
  const cwd = now?.cwd || space?.folder;
  if (!cwd) throw new Error("Focus a terminal first.");
  const on = space?.machine ?? null;

  // A runner closed mid-start can leave a copy running without a dialog: end those.
  const strays = await hc(["ls", "--json", "--label", `herdr.mod=${name}`]);
  if (strays.code === 0) {
    for (const t of JSON.parse(strays.stdout).terminals ?? []) hc(["kill", t.address]);
  }

  // Look the binary up in the shell's PATH so a missing program gets a clear message.
  const found = await exec("sh", ["-c", `command -v ${argv[0]}`], { on }).catch(() => null);
  const path = found?.code === 0 ? found.stdout.split("\n")[0].trim() : "";
  if (!path) throw new Error(`${argv[0]} was not found on ${on ?? "this computer"}.`);

  const started = await hc([
    "run", "--json", "--bg", "--rm", "--no-parent",
    ...(on ? ["--on", on] : []),
    "--cwd", cwd,
    "--label", `herdr.mod=${name}`,
    "--", "sh", "-c", HOLD, name, path, ...argv.slice(1),
  ]);
  if (started.code !== 0) throw new Error(started.stderr.trim() || `hc run exited ${started.code}`);
  const terminal = JSON.parse(started.stdout).address;

  const overlay = openOverlay({
    kind: "dialog",
    width: 0.9,
    height: 0.9,
    layout: {
      type: "column",
      children: [
        // A 0px copy of this mod. Its close() runs when the dialog goes.
        { type: "block", size: { px: 0 }, content: { mod: name, props: { role: "sentinel", terminal } } },
        { type: "block", content: { terminal } },
      ],
    },
  });
  open[name] = { overlay, terminal, pane: now?.pane ?? null };
}

export function popup({ name, argv }) {
  return class Popup extends View {
    init(_props, cx) {
      this.copy = props() ?? {};
      if (this.copy.role === "sentinel") return;
      // Only a copy opened by mod.open acts. `herdr-app check` loads one without an overlay.
      const runner = this.copy.overlay;
      if (!runner) return;
      cx.spawn(async () => {
        try {
          await toggle(name, argv);
        } catch (error) {
          notify({ title: name, body: String(error?.message ?? error), level: "error" });
        } finally {
          closeOverlay(runner);
        }
      });
    }

    // The dialog went: the key, a click beside it, a layout switch, or the program exited.
    async close() {
      if (this.copy?.role !== "sentinel") return;
      const open = dialogs();
      if (open[name]?.terminal === this.copy.terminal) delete open[name];
      await hc(["kill", this.copy.terminal]).catch(() => null);
    }

    render() {
      return div();
    }
  };
}
