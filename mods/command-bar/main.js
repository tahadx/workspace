// A quiet command strip above the workspace: where you are, one way to find
// anything, and what your agents need. It is a bar, not a tab strip — the
// workspace stays keyboard-driven and its search sheet stays the way in.
// Every colour is read from theme(), so this follows the Omarchy theme.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { agents, spaces, theme, run, shared } from "herdr";

// The palette and the sidebar both resolve a place's stored colour through
// this table (workspace-engine.js's MARK), not through theme().ansiN — keep
// the exact same tile in the bar.
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };
const FALLBACK = "ansi6";

function keycap(t, label) {
  return div()
    .flex_none()
    .h(16)
    .px(5)
    .flex()
    .items_center()
    .rounded(4)
    .bg(t.raised)
    .border(1)
    .border_color(t.border)
    .text_size(9.5)
    .text_color(t.dim)
    .child(label);
}

export default class CommandBar extends View {
  button(id, label, action) {
    const t = theme();
    return div()
      .id(id)
      .h(26)
      .px(9)
      .flex_none()
      .flex()
      .items_center()
      .gap(6)
      .rounded(7)
      .text_color(t.muted)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => {
        cx.stop_propagation();
        action();
      })
      .child(label);
  }

  render() {
    const t = theme();
    const here = spaces().find((s) => s.active);
    // The sidebar keeps each place's avatar colour by space id; use the same one
    // so the bar's tile is the space's icon, not the app's.
    const rawFill = here?.name === "~" ? null : (shared("space.colors") ?? {})[here?.id] ?? FALLBACK;
    const fill = !rawFill ? t.dim : rawFill.startsWith("#") ? rawFill : MARK[rawFill] ?? t[rawFill] ?? t.accent;
    const initial = [...(here?.name ?? "")][0]?.toUpperCase() ?? "?";
    const all = agents();
    const blocked = all.filter((a) => a.status === "blocked").length;
    const working = all.filter((a) => a.status === "working").length;
    const done = all.filter((a) => a.status === "done").length;

    return h_flex()
      .id("command-bar")
      .h(40)
      .w_full()
      .px(12)
      .gap(12)
      .items_center()
      .bg(t.chrome)
      .border_b(1)
      .border_color(t.border)
      .text_size(12)

      // Where you are.
      .child(
        h_flex()
          .id("cb-identity")
          .gap(8)
          .items_center()
          .flex_none()
          .child(
            div()
              .size(20)
              .flex_none()
              .rounded(6)
              .bg(fill)
              .flex()
              .items_center()
              .justify_center()
              .border(1)
              .border_color(t.foreground + "14")
              .text_size(10.5)
              .font_bold()
              .text_color("#ffffff")
              .child(initial)
          )
          .child(div().max_w(180).truncate().font_medium().text_color(t.foreground).child(here?.name ?? "Workspace"))
      )

      // The one way in: the same sheet Alt+F opens.
      .child(
        h_flex()
          .id("cb-search")
          .h(27)
          .w(340)
          .flex_none()
          .px(9)
          .gap(8)
          .items_center()
          .rounded(8)
          .bg(t.surface)
          .border(1)
          .border_color(t.border)
          .text_color(t.muted)
          .hover((s) => s.bg(t.hover).border_color(t.input).text_color(t.foreground))
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_click((_e, cx) => {
            cx.stop_propagation();
            run("mod.open", { name: "agents-list" });
          })
          .child(svg("mods/workspace-chrome/search.svg").size(13).flex_none().text_color(t.dim))
          .child(div().flex_1().truncate().child("Search spaces, agents, worktrees"))
          .child(keycap(t, "alt F"))
      )

      .child(div().flex_1())

      // What needs you, in the theme's own status colours.
      .child(
        h_flex()
          .id("cb-activity")
          .gap(9)
          .items_center()
          .flex_none()
          .when(blocked > 0, (el) =>
            el.child(
              div()
                .h(22)
                .px(8)
                .flex()
                .items_center()
                .gap(6)
                .rounded(6)
                .bg(t.blocked + "26")
                .text_size(10.5)
                .font_semibold()
                .text_color(t.blocked)
                .child(`!  ${blocked} need${blocked === 1 ? "s" : ""} you`)
            ))
          .when(working > 0, (el) =>
            el.child(
              h_flex()
                .gap(5)
                .items_center()
                .text_size(11)
                .text_color(t.working)
                .child(svg("mods/workspace-chrome/spinner.svg").size(11).spin(900))
                .child(String(working))
            ))
          .when(done > 0, (el) =>
            el.child(
              h_flex()
                .gap(5)
                .items_center()
                .text_size(11)
                .text_color(t.done)
                .child(div().size(6).rounded_full().bg(t.done))
                .child(String(done))
            ))
          .when(blocked === 0 && working === 0 && done === 0, (el) =>
            el.child(
              h_flex()
                .gap(5)
                .items_center()
                .text_size(11)
                .text_color(t.dim)
                .child(svg("mods/workspace-chrome/circle-check.svg").size(12))
                .child("All clear")
            ))
      )

      .child(div().h(16).w(1).flex_none().bg(t.border))
      .child(this.button("cb-commands", svg("mods/workspace-chrome/layers.svg").size(14), () => run("app.palette")))
      .child(this.button("cb-new", svg("mods/workspace-chrome/plus.svg").size(14), () => run("space.new")));
  }
}
