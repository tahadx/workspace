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

## 11. Where this lives

| Piece | File |
| --- | --- |
| Window, sidebar block, command bar, pane chrome | `layouts/workspace.json` |
| Shared rules, tree, pins, ordering, removals, git, agent placement | `mods/agents-list/workspace-engine.js` |
| Sidebar drawing and its keyboard | `mods/agents-list/sidebar.js` |
| Find sheet drawing and its keyboard | `mods/agents-list/palette.js` |
| Sidebar modes and their controls | `mods/command-bar/main.js` |
| Hover-to-focus | `mods/hoverfocus/main.js` |
| Bindings | `keys.json`, `docs/bindings.md` |
| Shared state keys | `spaces.pinned`, `workspace.state` (its `git`, `trees`, `spacePins` and `order`), `worktree.removing`, `worktree.removalFailed`, `space.closing`, `sidebar.width` |

Verify a change with:

```sh
node tests/*.test.mjs
herdr-app check mods/agents-list
herdr-app check mods/command-bar
herdr-app check mods/hoverfocus
```

The tests named `search`, `count`, `pins`, `pinned`, `reorder`, `removed`, `pending`,
`sessions`, `worktree` and `stale-worktree` guard the rules above. If a rule here has no
test, add one before changing the behaviour.
