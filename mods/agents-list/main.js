// One mod, two views.
//
// The sidebar (the layout's block) and the find sheet (Alt+F, an overlay) are
// the same logic with two drawings. Herdr refuses imports outside a mod's own
// folder, so they live together here: workspace-engine.js is the one copy of the rules, and
// this root only chooses which view a copy is.
//
// The view is drawn inline, not handed to `cx.new`. A retained child is rebuilt
// when *it* is notified, and Herdr's live changes (a space selected, an agent's
// status, a terminal renamed) re-render only this root: the root returned the
// same entity and stopped there. The panel then kept the last picture it drew
// until one of its own timers happened to notify it — a sort chosen in the popup
// arrived up to a minute late, and a space selected from the keyboard stayed
// unhighlighted. Returning the child's own elements makes every root render a
// panel render, which is what the host's "mods re-render when their data
// changes" promise means.
import { View } from "gpui-kit";
import { props, shared, setShared, nextCommand } from "herdr";
import { Sidebar } from "./sidebar.js";
import { Palette } from "./palette.js";

export default class Workspace extends View {
  init(_initial, cx) {
    const p = props() ?? {};
    // A block with "sidebar": true is the panel. A menu and the sort menu are
    // the panel's own popups. Everything else — mod.open, Alt+F — is the sheet.
    this.mode = p.sidebar || p.menu || p.sortMenu ? "sidebar" : "palette";
    const Which = this.mode === "sidebar" ? Sidebar : Palette;
    this.inner = new Which();
    // The root's context, so the view's timers and tasks live as long as this
    // copy does and `cx.notify()` anywhere inside it redraws the panel.
    this.inner.init(p, cx);
    // `<mod>.<command>` is delivered to the copy whose root is listening, so the
    // loop lives here and forwards to the view's own command table. (Started on
    // the inner Sidebar before, every `agents-list.*` key resolved as an unknown
    // command while the copy was still showing.)
    cx.spawn(async (cx) => {
      for (;;) {
        try {
          const c = await nextCommand();
          this.inner.command?.(c, cx);
        } catch (e) {
          console.log(`agents-list: command failed: ${e}`);
        }
      }
    });
  }

  render(cx) {
    return this.inner.render(cx);
  }

  // The view's own teardown (the sheet clears the shared flag that routes
  // Ctrl+J/K to it), then this copy's: a sheet that closes must not leave keys
  // pointing at a sheet that is no longer there.
  close(cx) {
    this.inner.close?.(cx);
    if (this.mode === "palette" && shared("search.open")) setShared("search.open", false);
  }
}
