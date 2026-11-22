// A pane header for the keyboard-driven workspace: a quiet chrome strip that
// surfaces on hover with the program, its place, its state and its controls.
// The root stays pane-sized and transparent so focus still follows the pointer
// (the job the old hoverfocus mod did); only the 30px strip at the top draws.
// Every colour comes from theme(), so the strip follows the Omarchy theme.

import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, theme, home, window } from "herdr";

function programIcon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint
    ? svg(p.icon).size(size).flex_none().text_color(color)
    : image(p.icon).w(size).h(size).flex_none().rounded(4);
}

function folder(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

export default class GlassPane extends View {
  me() {
    return panes().find((p) => p.pane === props()?.pane);
  }

  button(t, id, name, command, args) {
    return div()
      .id(id)
      .size(24)
      .flex_none()
      .flex()
      .items_center()
      .justify_center()
      .rounded(6)
      .text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .tooltip(name)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(svg(`mods/pane/${name}.svg`).size(13));
  }

  render() {
    const t = theme();
    const p = this.me();
    // Mod panes have no terminal; leave them completely alone.
    if (!p?.terminal) return div();

    const pane = p.pane;
    const st = p.status;
    const name = ((p.program?.agent || p.program?.shell) && p.program?.name) || p.title || p.program?.name || "shell";
    const pic = programIcon(p.program, 15, t.muted);
    const place = folder(p.cwd);

    return div()
      .id(`glass-pane-${pane}`)
      .size_full()
      .on_hover((hovered) => {
        if (!hovered || p.focused || !window().active) return;
        run("pane.focus", { pane });
      })
      .child(
        h_flex()
          .id(`glass-strip-${pane}`)
          .h(30)
          .w_full()
          .px(10)
          .gap(9)
          .items_center()
          .rounded_t(11)
          .bg(t.surface)
          .border_b(1)
          .border_color(t.border)
          .text_size(11.5)
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_click((_e, cx) => {
            cx.stop_propagation();
            run("pane.focus", { pane });
          })
          .when(Boolean(pic), (el) => el.child(pic))
          .child(div().flex_none().truncate().max_w(220).font_medium().text_color(t.foreground).child(name))
          .when(Boolean(place), (el) =>
            el.child(div().flex_1().truncate().text_color(t.dim).child(place)))
          .when(!Boolean(place), (el) => el.child(div().flex_1()))
          .when(st === "working", (el) =>
            el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
          .when(st === "blocked", (el) =>
            el.child(div().flex_none().px(7).h(18).flex().items_center().rounded(5).bg(t.blocked + "26").text_size(10).font_semibold().text_color(t.blocked).child("Needs you")))
          .when(st === "done", (el) => el.child(div().size(7).flex_none().rounded_full().bg(t.done)))
          .child(this.button(t, `gs-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
          .child(this.button(t, `gs-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
          .child(this.button(t, `gs-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
          .child(this.button(t, `gs-x-${pane}`, "close", "pane.close", { pane }))
      );
  }
}
