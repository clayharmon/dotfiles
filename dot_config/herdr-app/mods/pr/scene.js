// Draws a mermaid.js scene with native elements: boxes and labels are divs, lines and
// arrowheads are painted paths. Colors come from the theme, so diagrams follow it.

import { div, PathBuilder } from "gpui-kit";
import { LH } from "./mermaid.js";

export function drawScene(id, scene, t, font, back) {
  const layer = (el) => el.absolute().left(0).top(0).w(scene.w).h(scene.h);
  const paint = (path, color) => layer(window.paint_path(path, color));
  const polygon = (builder, pts) => builder.add_polygon(pts.map(([x, y]) => [x, y]), true).build();

  const stroke = (p) => {
    let b = PathBuilder.stroke(p.wide ? 2.5 : 1.2);
    if (p.dashed) b = b.dash_array([4, 4]);
    b = b.move_to(p.pts[0][0], p.pts[0][1]);
    if (p.curve) b = b.cubic_bezier_to(p.pts[3][0], p.pts[3][1], p.pts[1][0], p.pts[1][1], p.pts[2][0], p.pts[2][1]);
    else for (const [x, y] of p.pts.slice(1)) b = b.line_to(x, y);
    return paint(b.build(), p.tone === "dim" ? t.dim : t.muted);
  };

  const words = (r, color) => div().absolute().left(r.x).top(r.y).w(r.w).h(r.h).flex().flex_col().justify_center()
    .when(r.align !== "left", (e) => e.items_center())
    .when(r.align === "left", (e) => e.pl(2))
    .text_color(color)
    .children(r.lines.map((l) => div().h(LH).flex_none().whitespace_nowrap().child(l || " ")));

  const frame = (r) => div().absolute().left(r.x).top(r.y).w(r.w).h(r.h).rounded(6).border_1().border_color(t.border).bg(t.foreground + "07");

  const box = (r) => {
    const note = r.kind === "note", color = note ? t.ansi3 : t.accent;
    if (r.shape === "diamond") {
      const pts = [[r.x + r.w / 2, r.y], [r.x + r.w, r.y + r.h / 2], [r.x + r.w / 2, r.y + r.h], [r.x, r.y + r.h / 2]];
      return [paint(polygon(PathBuilder.fill(), pts), back), paint(polygon(PathBuilder.fill(), pts), color + "22"), paint(polygon(PathBuilder.stroke(1.2), pts), color), words(r, t.foreground)];
    }
    const radius = r.shape === "pill" || r.shape === "circle" ? r.h / 2 : r.shape === "round" ? 10 : 5;
    return [
      div().absolute().left(r.x).top(r.y).w(r.w).h(r.h).rounded(radius).bg(back),
      div().absolute().left(r.x).top(r.y).w(r.w).h(r.h).rounded(radius).border_1().border_color(color).bg(color + "22"),
      words(r, t.foreground),
    ];
  };

  const label = (r) => {
    if (r.kind === "frame") return words(r, t.muted).bg(t.border).rounded(4);
    if (r.kind === "plain") return words(r, t.dim);
    return words(r, t.foreground).bg(back);
  };

  const solid = scene.rects.filter((r) => r.kind !== "group" && r.kind !== "frame");
  const picture = div().relative().flex_none().w(scene.w).h(scene.h).font_family(font).text_size(12)
    .children(scene.rects.filter((r) => r.kind === "group" || r.kind === "frame").map(frame))
    .children(scene.paths.map(stroke))
    .children(scene.heads.map((h) => paint(polygon(PathBuilder.fill(), h.pts), t.muted)))
    .children(solid.flatMap(box))
    .children(scene.texts.map(label));
  return div().id(id).w_full().overflow_x_scrollbar().rounded(8).border_1().border_color(t.border).bg(back).child(picture);
}
