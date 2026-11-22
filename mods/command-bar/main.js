// A quiet command strip above the workspace: where you are, one way to find
// anything, and what your agents need. It is a bar, not a tab strip — the
// workspace stays keyboard-driven and its search sheet stays the way in.
// Every colour is read from theme(), so this follows the Omarchy theme.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { agents, spaces, theme, run, shared, setShared, layout, window, nextCommand } from "herdr";

// The palette and the sidebar both resolve a place's stored colour through
// this table (workspace-engine.js's MARK), not through theme().ansiN — keep
// the exact same tile in the bar.
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };
const FALLBACK = "ansi6";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The three sidebar states, read from the live layout: hidden wins, then the
// width decides wide/compact exactly the way the sidebar mod folds to its rail.
function sidebarMode() {
  const node = find(layout(), "sidebar");
  if (!node || node.hidden) return "hidden";
  const px = node.size?.px ?? 0;
  return px > 0 && px < 160 ? "compact" : "wide";
}

// One source of truth for the top-bar control. Wide always returns at the last
// wide width, so hiding from the rail never strands the sidebar at 44px.
function setSidebarMode(mode) {
  const node = find(layout(), "sidebar");
  if (!node) return;
  const now = sidebarMode();
  if (now === mode) return;
  if (now === "wide") setShared("sidebar.width", node.size?.px ?? 223);
  if (mode === "hidden") {
    run("layout.hide", { id: "sidebar" });
    return;
  }
  if (node.hidden) run("layout.show", { id: "sidebar" });
  if (mode === "compact") {
    setShared("sidebar.collapsed", true);
    run("layout.resize", { id: "sidebar", px: window()?.platform === "macos" ? 76 : 44 });
    return;
  }
  setShared("sidebar.collapsed", false);
  run("layout.resize", { id: "sidebar", px: shared("sidebar.width") ?? 223 });
}

// One key walks the three states in the same order the segments read. The bar
// owns it because it stays mounted while the sidebar is hidden, so the key can
// always get back.
const SIDEBAR_MODES = ["wide", "compact", "hidden"];
function cycleSidebar() {
  const next = SIDEBAR_MODES[(SIDEBAR_MODES.indexOf(sidebarMode()) + 1) % SIDEBAR_MODES.length];
  setSidebarMode(next);
}

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
  init(_props, cx) {
    // Keys bound to `command-bar.<command>` arrive here even while the sidebar
    // block is hidden, which `agents-list.*` commands do not.
    cx.spawn(async (cx) => {
      for (;;) {
        try {
          const c = await nextCommand();
          if (c === "cycle_sidebar") {
            cycleSidebar();
            cx.notify();
          }
          // Alt+B always asks for the list. Open a folded sidebar in this same
          // turn so its copy can answer the token on the next frame, instead of
          // waiting for its scan timer.
          if (c === "focus_sidebar") {
            if (!shared("sidebar.kb")) setSidebarMode("wide");
            setShared("sidebar.focus", Date.now());
          }
        } catch (e) {
          console.log(`command-bar: command failed: ${e}`);
        }
      }
    });
  }

  button(id, label, action) {
    const t = theme();
    return div()
      .id(id)
      .h(26)
      .px(7)
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

  modeSegment(t, mode, icon, label, active) {
    return div()
      .id(`sb-${mode}`)
      .size(22)
      .flex_none()
      .flex()
      .items_center()
      .justify_center()
      .rounded(5)
      .bg(active ? t.selected : t.surface)
      .text_color(active ? t.foreground : t.dim)
      .hover((s) => s.bg(active ? t.selected : t.hover).text_color(t.foreground))
      .tooltip(active ? `${label} · current` : `Sidebar: ${label}`)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => {
        cx.stop_propagation();
        setSidebarMode(mode);
      })
      .child(svg(`mods/command-bar/${icon}.svg`).size(13));
  }

  render() {
    const t = theme();
    const mode = sidebarMode();
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

      // Sidebar: wide, compact rail, or gone. Visible in every state, so the
      // hidden one is never a dead end.
      .child(
        h_flex()
          .id("cb-sidebar-modes")
          .h(27)
          .p(2)
          .gap(1)
          .flex_none()
          .items_center()
          .rounded(8)
          .bg(t.surface)
          .border(1)
          .border_color(t.border)
          .child(this.modeSegment(t, "wide", "sidebar-wide", "Full sidebar", mode === "wide"))
          .child(this.modeSegment(t, "compact", "sidebar-rail", "Compact rail", mode === "compact"))
          .child(this.modeSegment(t, "hidden", "sidebar-off", "Hidden", mode === "hidden"))
      )

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

      // Activity, its hairline and the actions read as one cluster: the line
      // stays, the air around it does not.
      .child(
        h_flex()
          .id("cb-right")
          .gap(6)
          .items_center()
          .flex_none()
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
          .child(
            h_flex()
              .id("cb-actions")
              .gap(2)
              .items_center()
              .flex_none()
              .child(this.button("cb-commands", svg("mods/workspace-chrome/layers.svg").size(14), () => run("app.palette")))
              .child(this.button("cb-new", svg("mods/workspace-chrome/plus.svg").size(14), () => run("space.new")))
          )
      );
  }
}
