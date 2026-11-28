// A quiet command strip above the workspace: where you are, one way to find
// anything, and what your agents need. It is a bar, not a tab strip — the
// workspace stays keyboard-driven and its search sheet stays the way in.
// Every colour is read from theme(), so this follows the Omarchy theme.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { agents, spaces, panes, focused, theme, run, shared, setShared, layout, window, nextCommand } from "herdr";

// The palette and the sidebar both resolve a place's stored colour through
// this table (workspace-engine.js's MARK), not through theme().ansiN — keep
// the exact same tile in the bar.
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };
const FALLBACK = "ansi6";

// A theme colour with alpha; an eight-digit or named colour is already opaque,
// so it is left as it is instead of gaining a suffix that would invalidate it.
const wash = (c, a = "14") => (/^#[0-9a-fA-F]{6}$/.test(c ?? "") ? c + a : c);

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

// Keys that belong to the sidebar but must keep working while its block is
// hidden. Herdr delivers `<mod>.<command>` to shown copies only, and this bar
// is the copy that stays mounted, so the layout binds these to `command-bar.*`
// and the sidebar takes them from the shared relay on its timer. The frequent
// walk stays here, so a held Ctrl+J/K does not wait for that timer.
const RELAYED = new Set(["new_space", "worktree_new", "worktree_open", "worktree_remove", "close_space"]);

let steps = 0;

function walk(direction) {
  const token = `${direction}:${++steps}`;
  if (shared("search.open")) return setShared("search.move", token);
  if (shared("sidebar.kb")) return setShared("sidebar.move", token);
  run("pane.go", { direction });
}

// The sidebar's close rule: the last tab of a space is replaced by a fresh
// shell in the same space, so closing never jumps to another space's terminal.
function closeFocused(name) {
  const f = focused();
  const tabId = f?.tab;
  if (!tabId) return;
  const space = spaces().find((s) => s.tabs.some((t) => t.id === tabId));
  if (!space) return;
  if (name === "close_pane" && f.pane && panes().filter((p) => p.tab === tabId).length > 1) return run("pane.close", { pane: f.pane });
  if (space.tabs.length > 1) return run("tab.close", { id: tabId });
  run("tab.new", { space: space.id });
  run("tab.close", { id: tabId });
}

// A split follows the agent, not its shell. An agent can move its session into
// a worktree while the shell stays in the repo's main checkout, so `pane.split`
// would open the new terminal in main. `terminal.open` with the session folder
// opens it in the worktree the agent is actually working in.
function split(direction) {
  const f = focused();
  const dirs = shared("workspace.agentDirs") ?? {};
  const clean = (p) => String(p ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
  const there = f?.terminal ? clean(dirs[f.terminal]) : "";
  if (there && there !== clean(f?.cwd)) {
    return run("terminal.open", { folder: there, place: direction });
  }
  run("pane.split", { direction });
}

// The sidebar's layout flip, with the same remembered panel width.
function flipLayout() {
  const tree = JSON.parse(JSON.stringify(layout() ?? {}));
  if (!Array.isArray(tree.children) || tree.children.length < 2) return;
  tree.children.reverse();
  const body = find(tree, "work-body");
  if (body?.type === "row" && Array.isArray(body.children) && body.children.length > 1) body.children.reverse();
  const panel = find(tree, "panel");
  if (panel) {
    if (!panel.hidden && (panel.size?.px ?? 0) >= (panel.min ?? 0)) setShared("panel.width", panel.size.px);
    else if ((panel.size?.px ?? 0) < (panel.min ?? 0)) panel.size.px = shared("panel.width") ?? 368;
  }
  run("layout.set", { layout: tree });
}

// Leave a command for the sidebar copy. A panel that has never been shown has
// no copy to take it, so only new_space gets an app fallback when the relay is
// not acknowledged.
function relay(command) {
  const n = (shared("agents.command")?.n ?? 0) + 1;
  setShared("agents.command", { c: command, n, at: Date.now() });
  return n;
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
            // A panel that has never been shown starts on this press. Hand it
            // the token after it has started, or the new copy records the token
            // as its baseline and the first Alt+B only opens the column.
            const wasHidden = !shared("sidebar.kb");
            if (wasHidden) setSidebarMode("wide");
            const ask = () => setShared("sidebar.focus", Date.now());
            if (wasHidden) cx.timer.after(120, ask); else ask();
          }
          if (c === "dir_down" || c === "dir_up") walk(c === "dir_down" ? "down" : "up");
          else if (c === "close_pane" || c === "close_tab") closeFocused(c);
          else if (c === "split_right" || c === "split_down") split(c === "split_right" ? "right" : "down");
          else if (c === "flip_layout") flipLayout();
          else if (RELAYED.has(c)) {
            const n = relay(c);
            if (c === "new_space") {
              // No sidebar copy yet (it has never been shown this launch): the
              // app command still makes the space instead of losing the key.
              // One second leaves the panel's 200 ms timer room to ack first.
              cx.timer.after(1000, () => {
                if (shared("agents.command.ack")?.n !== n) run("space.new");
              });
            } else {
              // Same start-hidden case for the worktree and close keys: open the
              // panel that owns them, then hand the command to the new copy.
              // A running copy acks within its 200 ms tick, so this never fires
              // in the normal hidden case.
              cx.timer.after(1000, () => {
                if (shared("agents.command.ack")?.n === n) return;
                setSidebarMode("wide");
                cx.timer.after(250, () => relay(c));
              });
            }
          }
        } catch (e) {
          console.log(`command-bar: command failed: ${e}`);
        }
      }
    });
  }

  button(id, label, action, tip) {
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
      .when(tip, (el) => el.tooltip(tip))
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
              .border_color(wash(t.foreground, "14"))
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
                    .bg(wash(t.blocked, "26"))
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
          // Sidebar: wide, compact rail, or gone. A view control, so it sits
          // with the other chrome actions instead of opening the bar.
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
          .child(
            h_flex()
              .id("cb-actions")
              .gap(2)
              .items_center()
              .flex_none()
              .child(this.button("cb-commands", svg("mods/command-bar/list.svg").size(14), () => run("app.palette"), "Command palette"))
              .child(this.button("cb-new", svg("mods/workspace-chrome/plus.svg").size(14), () => run("space.new"), "New space"))
          )
      );
  }
}
