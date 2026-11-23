// Every key binding in one searchable list: Alt+F finds work, this finds what
// the keys do. Opened from the sidebar footer (or mod.open:shortcuts).
//
// One row per command, not per key: all of a command's keys sit together, so
// "Select a tab" reads once with Alt 1 … Alt 9 beside it instead of nine rows.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Scrollbar } from "gpui-base";
import { keys, commands, theme, props, closeOverlay } from "herdr";

const wash = (c, a = "14") => (/^#[0-9a-fA-F]{6}$/.test(c ?? "") ? c + a : c);

const keycap = (t, label) => div().flex_none().h(18).px(5).rounded(4)
  .bg(wash(t.foreground, "10")).border(1).border_color(wash(t.foreground, "1c"))
  .text_size(9.5).font_medium().text_color(t.muted).flex().items_center().child(label);

// A binding reads as caps: "ctrl-shift-j" -> Ctrl Shift J, "alt-1" -> Alt 1.
const NAMES = {
  escape: "Esc", enter: "Enter", space: "Space", tab: "Tab", backspace: "Backspace",
  pageup: "Page Up", pagedown: "Page Down", home: "Home", end: "End", delete: "Del",
  left: "\u2190", right: "\u2192", up: "\u2191", down: "\u2193",
};
function caps(binding) {
  const raw = String(binding ?? "").split("-");
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const part = raw[i];
    // "ctrl--" is Ctrl and the minus key: splitting leaves empty parts for it.
    if (part === "") { if (i === raw.length - 1) out.push("-"); continue; }
    out.push(NAMES[part] ?? (part.length === 1 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)));
  }
  return out;
}

// The sections in the order people think of them, and their heading.
const order = (section) =>
  section === "global" ? 0 : section.startsWith("layout:") ? 1 : section === "terminal" ? 2 : 3;
const heading = (section) =>
  section === "mod:agents-list" ? "Sidebar \u00b7 with its keyboard"
    : section === "global" ? "Global"
    : section.startsWith("layout:") ? `Herdr · ${section.slice("layout:".length)}`
      : section === "terminal" ? "Terminal has the keyboard"
        : section.startsWith("mod:") ? `Panel · ${section.slice("mod:".length)}`
          : section;

// Commands of this setup's own panels: their names are ours, so they get names a
// person reads, not `panel.command`.
const OURS = {
  "command-bar.dir_down": "Move down: a pane or the list with the keyboard",
  "command-bar.dir_up": "Move up: a pane or the list with the keyboard",
  "command-bar.flip_layout": "Flip the sidebar to the other side",
  "command-bar.worktree_new": "New worktree",
  "command-bar.close_pane": "Close this pane",
  "command-bar.close_tab": "Close this tab",
  "command-bar.focus_sidebar": "Move the keyboard into the sidebar (and back)",
  "command-bar.new_space": "New space",
  "command-bar.close_space": "Close the active space",
  "command-bar.worktree_open": "Open worktree",
  "command-bar.worktree_remove": "Remove worktree",
  // Still named, so a key rebound to the old panel or the footer keeps a label.
  "agents-list.dir_down": "Move down: a pane or the list with the keyboard",
  "agents-list.dir_up": "Move up: a pane or the list with the keyboard",
  "agents-list.flip_layout": "Flip the sidebar to the other side",
  "agents-list.worktree_new": "New worktree",
  "agents-list.close_pane": "Close this pane",
  "agents-list.close_tab": "Close this tab",
  "footer.dir_down": "Move down: a pane or the search list",
  "footer.dir_up": "Move up: a pane or the search list",
  "footer.flip_layout": "Flip the sidebar to the other side",
  "footer.worktree_new": "New worktree",
  "agents-list.focus_sidebar": "Move the keyboard into the sidebar (and back)",
  "agents-list.toggle_sidebar": "Collapse or expand the sidebar",
  "agents-list.new_space": "New space",
  "agents-list.close_space": "Close the active space",
  "agents-list.worktree_open": "Open worktree",
  "agents-list.worktree_remove": "Remove worktree",
  "terminals-list.close_pane": "Close this pane",
  "terminals-list.close_tab": "Close this tab",
};

// Keys a panel only takes while it has the keyboard, so they are not in
// keys.json (they would change meaning in a terminal). The sheet is where a
// person looks them up, so they are listed here, under that panel.
const PANEL_KEYS = [
  { action: "agents-list.walk", label: "Sidebar: walk the list",
    about: "Ctrl+J and Ctrl+K walk the sidebar's rows, as in the find sheet; Up and Down do the same.",
    keys: ["ctrl-j", "ctrl-k", "up", "down"] },
  { action: "agents-list.go", label: "Sidebar: go to the row",
    about: "Enter opens the space, focuses the agent, or opens the checkout.",
    keys: ["enter"] },
  { action: "agents-list.close", label: "Sidebar: close, stop or remove the row",
    about: "Ctrl+D asks first: closes a space, stops an agent, or removes a worktree.",
    keys: ["ctrl-d"] },
  { action: "agents-list.pin", label: "Sidebar: pin or unpin",
    about: "Ctrl+P pins the row's space to the top, or unpins it.", keys: ["ctrl-p"] },
  { action: "agents-list.rename", label: "Sidebar: rename the space",
    about: "Ctrl+R renames the row's space.", keys: ["ctrl-r"] },
  { action: "agents-list.new-worktree", label: "Sidebar: new worktree",
    about: "Ctrl+A starts a worktree of the row's repo.", keys: ["ctrl-a"] },
  { action: "agents-list.move", label: "Sidebar: move the space a row",
    about: "Ctrl+Shift+J moves the space down, Ctrl+Shift+K up, and holding the key keeps it moving.",
    keys: ["ctrl-shift-j", "ctrl-shift-k"] },
  { action: "agents-list.new-space", label: "Sidebar: new space (plain N)",
    about: "N starts a space in the current folder.", keys: ["n"] },
  { action: "agents-list.open-worktree", label: "Sidebar: open worktree (plain G)",
    about: "G opens one of the repo's checkouts as a space.", keys: ["g"] },
  { action: "agents-list.fold", label: "Sidebar: fold or unfold (plain F)",
    about: "F folds the space's or agent's children.", keys: ["f"] },
  { action: "agents-list.leave", label: "Sidebar: leave the sidebar",
    about: "Esc gives the keyboard back to the pane.", keys: ["escape"] },
];

// What a command is called when it has no description of its own.
const said = (action) => {
  if (action === "terminal") return "Keys the terminal keeps for itself";
  if (action.includes(".")) return action.replace(".", " \u00b7 ").replace(/:/g, " ");
  return action;
};

// A command's own description is written for the API: first clause only, without
// the argument lists and quoted values after it, and without the "Ctrl+V:" prefix
// some of them open with.
const short = (text, fallback) => {
  let cut = String(text ?? "").trim()
    .replace(/^[A-Za-z0-9+\u2190-\u21ff[\]-]{1,16}:\s+/, "")
    .split(" (")[0]
    .split("; ")[0]
    .split(", ")[0]
    .split(". ")[0]
    .split("\"")[0];
  const colon = cut.split(": ");
  if (colon.length > 1 && colon[0].split(" ").length >= 3) cut = colon[0];
  cut = cut.replace(/ to the\s*$/, "").replace(/[.,;:]\s*$/, "").trim();
  if (!cut) return fallback;
  return cut.charAt(0).toUpperCase() + cut.slice(1);
};

export default class Keys extends View {
  init(_props, cx) {
    this.filter = "";
    this.input = InputState.new({ value: "", placeholder: "Search a key, a command, a panel\u2026" });
    this.input.on("change", () => { this.filter = this.input.value(); cx.notify(); });
    this.input.focus();
    cx.timer.after(120, () => this.input.focus());
    this.handle = cx.focus_handle();
  }

  close() {
    closeOverlay(props()?.overlay);
  }

  key(e) {
    if (e.key === "escape" || (e.modifiers.control && e.key === "q") || e.key === "enter") {
      this.close();
      return true;
    }
    return false;
  }

  // Every command its keys belong to, grouped by section and filtered by
  // anything typed: a key, a command, a panel, or what the command does.
  sections() {
    const about = new Map(commands().map((c) => [c.name, c.about]));
    const q = this.filter.trim().toLowerCase();
    const bySection = new Map();
    // A binding in the layout's section repeats its global one when the setup
    // wants the same action anyway. Listing both would make the sheet read as
    // two rows for one command; the more specific section is the one in effect.
    const rank = (section) => section === "global" ? 0 : section.startsWith("layout:") ? 1 : section === "terminal" ? 2 : 3;
    const bindings = keys();
    // A layout section wins its keys. The global row for the same press
    // (tab.close on Ctrl+Shift+W, pane.close on Ctrl+Shift+X) is the binding
    // this layout replaced. Terminal bindings stay: Ctrl+Q types in a terminal
    // and closes a dialog everywhere else.
    const layoutKeys = new Set();
    for (const b of bindings) if (String(b.section ?? "").startsWith("layout:")) layoutKeys.add(b.keys);
    const best = new Map();
    for (const b of bindings) {
      if (b.action.startsWith("send:")) continue;
      const id = `${b.action}\u0000${b.keys}`;
      best.set(id, Math.max(best.get(id) ?? -1, rank(b.section)));
    }
    for (const b of bindings) {
      // Keys that just type bytes into the terminal ("send:...") are one line of
      // noise each and say nothing a person looks up here.
      if (b.action.startsWith("send:")) continue;
      if (b.section === "global" && layoutKeys.has(b.keys)) continue;
      if (best.get(`${b.action}\u0000${b.keys}`) > rank(b.section)) continue;
      const command = b.action.split(":")[0];
      const said_ = OURS[b.action] ?? about.get(command) ?? said(b.action);
      if (q && !`${b.keys} ${b.action} ${said_} ${heading(b.section)}`.toLowerCase().includes(q)) continue;
      if (!bySection.has(b.section)) bySection.set(b.section, new Map());
      const rows = bySection.get(b.section);
      const row = rows.get(command) ?? { action: command, label: short(said_, said(b.action)), about: about.get(command) ?? "", keys: [] };
      row.keys.push(b.keys);
      rows.set(command, row);
    }
    // The panels' own keys, listed under their panel.
    for (const r of PANEL_KEYS) {
      const line = `${r.label} ${r.about} ${r.keys.join(" ")} ${heading("mod:agents-list")}`;
      if (q && !line.toLowerCase().includes(q)) continue;
      if (!bySection.has("mod:agents-list")) bySection.set("mod:agents-list", new Map());
      bySection.get("mod:agents-list").set(r.action, { action: r.action, label: r.label, about: r.about, keys: r.keys });
    }
    return [...bySection.entries()]
      .sort((a, b) => order(a[0]) - order(b[0]))
      .map(([section, rows]) => ({
        section,
        rows: [...rows.values()].sort((a, b) => a.keys[0].localeCompare(b.keys[0])),
      }));
  }

  render(cx) {
    const t = theme();
    const groups = this.sections();
    const total = groups.reduce((n, g) => n + g.rows.length, 0);

    const head = (g) => h_flex().h(30).px(12).pt(12).pb(2).gap(7).items_center()
      .child(div().text_size(9.5).font_semibold().text_color(t.muted).child(heading(g.section).toUpperCase()))
      .child(div().min_w(15).h(15).px(4).rounded(4).bg(wash(t.foreground, "10"))
        .text_size(9).text_color(t.muted).flex().items_center().justify_center().child(String(g.rows.length)))
      .child(div().h(1).flex_1().bg(wash(t.foreground, "09")));

    // What it does on the left, the keys that do it on the right, in one
    // right-aligned column down the page. Past three bindings the rest fold into
    // +N; the tooltip still names every key.
    const row = (r) => {
      // Up to five caps in the column; the rest are counted, and the tooltip
      // still names every binding.
      const shown = [];
      let used = 0;
      for (const binding of r.keys) {
        const n = caps(binding).length;
        if (shown.length && used + n > 5) break;
        shown.push(binding);
        used += n;
      }
      const more = r.keys.length - shown.length;
      return h_flex().flex_none().h(32).mx(4).pl(12).pr(14).gap(12).items_center().rounded(8)
        .hover((s) => s.bg(wash(t.foreground, "0b")))
        .tooltip(`${r.about || r.label}\n${r.keys.join("   ")}`)
        .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(t.foreground).child(r.label))
        .child(h_flex().flex_none().gap(6).items_center()
          .children(shown.map((binding) => h_flex().flex_none().gap(3).items_center()
            .children(caps(binding).map((c) => keycap(t, c)))))
          .when(more > 0, (el) => el.child(div().flex_none().h(18).px(5).rounded(4)
            .bg(wash(t.foreground, "0a")).border(1).border_color(wash(t.foreground, "14"))
            .text_size(9.5).text_color(t.muted).flex().items_center().child(`+${more}`))));
    };

    return v_flex().id("keys").size_full().p(18).gap(12).bg(t.popover).text_size(13)
      .track_focus(this.handle)
      .on_key_down((e, cx) => { if (this.key(e)) cx.stop_propagation(); })
      .child(h_flex().gap(9).items_center()
        .child(div().size(26).flex_none().rounded(8).bg(wash(t.accent, "16")).flex().items_center().justify_center()
          .child(svg("mods/icons/keyboard.svg").size(14).text_color(t.accent)))
        .child(v_flex().flex_1().min_w(0).gap(1)
          .child(div().text_size(13.5).font_semibold().text_color(t.foreground).child("Keys"))
          .child(div().text_size(10).text_color(wash(t.muted, "cc")).child(`${total} commands · type to find one`)))
        .child(keycap(t, "esc")))
      .child(Input.new(this.input).h(42).px(12).items_center().rounded(10)
        .border(1).border_color(wash(t.accent, "44")).bg(t.background).text_color(t.foreground))
      .child(div().relative().flex_1().min_h(0)
        .child(v_flex().id("shortcuts").size_full().overflow_y_scrollbar().py(2)
          .children(groups.flatMap((g) => [head(g), ...g.rows.map(row)]))
          .when(!groups.length, (el) => el.child(v_flex().flex_1().gap(7).items_center().justify_center().pt(40)
            .child(div().size(34).rounded(10).bg(wash(t.foreground, "08")).border(1).border_color(wash(t.foreground, "0e"))
              .flex().items_center().justify_center()
              .child(svg("mods/workspace-chrome/search.svg").size(15).text_color(t.muted)))
            .child(div().text_size(12.5).font_medium().text_color(t.muted).child("No shortcut matches"))
            .child(div().text_size(10.5).text_color(wash(t.muted, "cc")).child("Try a key, a command or a panel.")))))
        .child(Scrollbar.vertical("shortcuts").absolute().inset_0()))
      .child(h_flex().justify_end().gap(11).items_center().pt(8).border_t(1).border_color(wash(t.foreground, "08"))
        .child(keycap(t, "esc"))
        .child(div().text_size(10).text_color(t.muted).child("close")));
  }
}
