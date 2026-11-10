// cmd-g: lazygit in a dialog over the window, in the focused terminal's folder.
import { popup } from "./popup.js";

export default popup({ name: "lazygit", argv: ["lazygit"] });
