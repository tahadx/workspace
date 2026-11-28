# Workspace: the rules this setup must keep

This file is the behaviour contract for this Herdr setup: read it before changing the
layout, the sidebar, the find sheet, or their keys. `mods/agents-list/workspace-engine.js`
is the mechanics. If the code and this file disagree, stop and ask — do not pick one.

## 1. The window

- It is **one layout** (`layouts/workspace.json`), not three layouts. What changes is the
  sidebar's mode: **full**, **compact**, **hidden**. Same layout, same keys, same state;
  switching modes must never restart a mod, reset a list, or lose a selection.
- **full** — the sidebar (223 px by default) plus the 40 px command bar.
- **compact** — a 44 px rail (76 px on macOS) plus the command bar. Any sidebar width
  below 160 px counts as compact; the rail's avatars are in the list's own order.
- **hidden** — the command bar only. Every layout key still works from the bar
  (it stays mounted); the sidebar being gone must not disable a command.
- `Ctrl+Shift+B` cycles full → compact → hidden. The command bar's three segments pick a
  mode directly. `Alt+B` puts the keyboard in the sidebar and takes it back.
- The **find sheet** (`Alt+F`) exists in all three modes. It must never depend on the
  sidebar being visible, wide, or focused.

Terminology used in this file:

| Word | Means |
| --- | --- |
| space | A Herdr space, live or pinned |
| place | A space, or a pin whose space is gone |
| worktree | A git checkout, nested under its repo |
| pin | A place kept on purpose (see §3) |
| agent | A live agent terminal; sub-agents nest under their starter |
| row | One line in the sidebar or the sheet |
| the views | The sidebar and the find sheet together |

## 2. Two views, one logic — non-negotiable

- The sidebar and the find sheet are **the same list drawn twice**. They live in one mod,
  `agents-list`: `workspace-engine.js` decides, `sidebar.js` and `palette.js` only draw
  and walk their own rows.
- They must agree on **everything**: membership, tree shape, ordering, pins, worktrees,
  agents, icons and colours, add/remove/rename, and the keys that act on a row.
- **Never implement a rule in one view.** Put it in the engine, cover it with a test, and
  let both views render it. A change that exists only in `palette.js` or only in
  `sidebar.js` is a bug.
- A narrow view may abbreviate *presentation* (an avatar instead of a name); it may never
  change *which rows exist*, their order, or what an action does.
- When the person says "update the view", they mean **both**.

## 3. Pins

- Why pins exist: in stock Herdr a space disappears when its shell exits. Some projects
  must stay available. A pin keeps the place in the list even when no live space backs it.
- **Unpinned is the default**: exited means gone. A pin is the deliberate exception, not
  a second kind of space.
- `Ctrl+P` toggles a pin on the row under the keyboard (both views). Pinned places sit in
  their own block **first**, in their own order, above the rest.
- A pin is a **place**, not a folder label: its name survives a `cd`, and a shell started
  from it opens in its folder. A pin keeps its slot; reopening it comes back to that slot.
  If its space is gone, open by folder; otherwise open the space by id.
- A pin that is gone still counts as a place (§10). A pinned worktree is a checkout, not an
  extra place — never count it twice.

## 4. Ordering

- Order is changed **one step at a time, up or down** (`Ctrl+Shift+K` / `Ctrl+Shift+J`),
  the same in both views. No drag-only path, no jump commands that skip rows.
- It applies to pinned places, plain spaces, and worktree siblings under their repo, per
  machine. Reordering inside a repo's worktrees moves that checkout among its siblings,
  not the top-level spaces.
- Holding the key repeats the step; the order persists (the `order` map inside
  `workspace.state` for checkouts, `space.move` for spaces).
- The selected row moves with the item and stays selected. Ordering must not rebuild the
  list or flash another row.

## 5. Search (`Alt+F`)

- The sheet searches **everything**: spaces, pins, worktrees, branches, folders, agent
  names and tab titles. Terms are ANDed (`web hotfix`).
- **A matched space brings its family**: the space, all its worktrees, and their agents.
- **A matched worktree or agent is highlighted, never shown bare**: its space (or its
  repo/pin family), the sibling worktrees and the agents stay visible around it, so the
  result reads as the place it belongs to.
- `Enter` acts on the highlighted row: a space is shown, an agent is focused, a worktree
  is opened, a pin opens its place. `Esc` or `Alt+F` closes and returns the keyboard.
- Opening the sheet must show the current truth on the first frame — same live data as the
  sidebar, no stale snapshot, no git call of its own before the first paint.

## 6. Worktrees

- A worktree made or removed **shows immediately in both views**, with no manual refresh,
  no reopening the sheet, and no app restart.
- "Immediately" is driven by watching the **repo's git directory** (HEAD, refs, worktree
  records), not the working tree, because agents write source files constantly. A burst
  of events is read once after it settles; one scan feeds both views.
- A worktree created by an agent while working counts exactly like one created by hand.
- The row appears in its repo's group, in order, with its branch, ahead/behind and
  uncommitted marks once git answers; until then it may show as pending, never missing.

## 7. Agents

- Agents are **live, derived from terminals** — never a saved copy or a configured list.
  One row per session; a sub-agent nests under the agent that started it.
- Placement follows where the agent is **active**:
  - working on the repo's main checkout → under the space, **above that space's
    worktrees**;
  - working in a checkout → under **that worktree**;
  - never both, never duplicated, never left on the old place.
- **Follow moves automatically.** When an agent's space/cwd moves to another worktree —
  including one it just created — both views move its row at once: the new place shows it,
  the old place loses it. The person must not have to open the worktree or open the agent
  by hand, and must not see it in two places in between.
- This is a watcher/live-data concern, not a refresh button. The sheet and sidebar read the
  same resolved picture.

## 8. Add, remove, rename

- All three are **optimistic and in place**: the row appears, changes, or leaves at once;
  the list is keyed by identity and updated in place, never rebuilt (no flicker, scroll
  jump, or lost selection).
- **Remove** (space or worktree): the row stays where it is, dims, shows a spinner and
  "Removing…"; `Enter` and clicks do nothing on it while it is going. On success it leaves
  once; on failure it stays with the reason. Never remove it before git confirms, and never
  show it twice.
- **Rename** applies at once through Herdr's prompt and keeps the row in place. If a rename
  ever becomes slow, give it the same dim-and-block treatment as removal.
- **New space / new worktree** appears in its place immediately. When the sheet made it,
  the sheet closes onto the new place instead of hovering over it with an old list.

## 9. Terminal hover

- Hovering a terminal **focuses** it (the same `pane.focus` a click runs), so the focus and
  active look follow the pointer like a tiling window manager.
- Only when the window is active, and only for terminal panes. Leaving does not unfocus —
  hover moves focus in, it does not fight the keyboard.
- Clicks and text selection must still reach the program underneath.

## 10. The space count

- There is **one number**, the same in the sidebar header and the sheet header, derived from
  places: live spaces **plus** pins whose space is gone, with worktree spaces counted as
  checkouts rather than extra places, and pins deduplicated.
- It is not `spaces().length`. A pinned space whose shell exits must not drop the number,
  because its row is still there.
- It updates with the list, from the same derivation — no separate timer, no cached header.

## 11. Settings

- **One set of settings for the whole window.** Fonts, font sizes, the UI font, zoom,
  theme and appearance, terminal line height / cell width / scroll speed, sounds and the
  worktree directory come from the same source everywhere. No mod keeps its own copy of a
  setting — no duplicated font, text size or theme colour. The only fixed colours are
  identity marks (a place's avatar, a program's tile), which look the same in both views.
- **A settings change must land across the whole setup at once** — sidebar, find sheet,
  command bar, pane chrome, terminals, dialogs and overlays — with no restart and no
  layout switch. Changing the font size must not leave one panel at the old size.
- Read colours from `theme()`, write sizes in px at **zoom 1** (the app scales them), and
  take fonts and terminal metrics from the layout/settings. Never hardcode a font family,
  a hex colour, or a window-pixel size that assumes the current zoom.
- **A value has one owner: never state it twice.** Fonts and terminal metrics belong to
  `settings.json`; the layout leaves those fields **unset** so the Settings screen can
  change the window. The layout owns its geometry, theme and colours. Stating a
  settings-owned field in the layout silently shadows the setting — that is how the
  screen came to promise `terminal_line_height: 1` while the window drew `1.15`.
- Settings Herdr applies itself — zoom, the theme picker, fonts, sounds, the worktree
  directory — must land live everywhere. Nothing may keep a second copy or ignore one.
- Dialogs and menus follow the same rules: no separate text scale, no fixed widths that
  only fit one font size.

## 12. No duplication

- **Every thing appears exactly once**: one row per space, one per worktree, one per agent
  session. No view may show the same thing twice — not inside one view, not between the
  sidebar and the sheet, not across machines.
- A worktree is either **nested under its repo** (as a checkout row) or **open as its own
  space** under that repo — never both. Opening a checkout moves the row; it does not add
  one, and closing it puts the checkout row back.
- A **pinned place that still has its live space** is one row, not a pin row plus a space
  row. A pin whose space is gone still appears once.
- An **agent is one row per session**, even when two terminals report the same session id.
  When a terminal reports no session record at all (opencode `--auto` does this), the same
  program + title + the folder its TUI published still count as one session — two folders
  or two programs keep two rows. A sub-agent stays under the agent that started it and is
  not also listed on its own.
- De-duplication lives in the engine and both views consume it. When two sources can
  describe the same thing (`spaces()`, the checkout list, agent terminals, pins), the
  engine resolves them to **one identity**.
- Identity is id / path / machine, **not name**: two different branches with the same title
  are two rows; one checkout seen through two sources is one.

## 13. Where this lives

| Piece | File |
| --- | --- |
| Window, sidebar block, command bar, pane chrome | `layouts/workspace.json` |
| Shared rules, tree, pins, ordering, removals, git, agent placement | `mods/agents-list/workspace-engine.js` |
| Sidebar drawing and its keyboard | `mods/agents-list/sidebar.js` |
| Find sheet drawing and its keyboard | `mods/agents-list/palette.js` |
| Sidebar modes and their controls | `mods/command-bar/main.js` |
| Hover-to-focus and the pane header | `mods/glass-pane/main.js` |
| Settings and look | `settings.json`, the layout root's look fields, `themes/` |
| Bindings | `keys.json`, `docs/bindings.md` |
| Shared state keys | `spaces.pinned`, `workspace.state` (its `git`, `trees`, `spacePins` and `order`), `worktree.removing`, `worktree.removalFailed`, `space.closing`, `sidebar.width` |

Verify a change with:

```sh
node tests/*.test.mjs
herdr-app check mods/agents-list
herdr-app check mods/command-bar
herdr-app check mods/glass-pane
herdr-app check mods/worktrees
```

The tests named `search`, `count`, `pins`, `pinned`, `reorder`, `removed`, `pending`,
`sessions`, `worktree` and `stale-worktree` guard the rules above. If a rule here has no
test, add one before changing the behaviour.
