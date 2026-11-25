// A removal keeps its row: "Removing…" until git agrees, the reason if it does
// not. The row must never disappear while the checkout is still on the machine.
//
// What this guards:
//   - the sheet and the sidebar draw a checkout on its way out instead of
//     filtering it from the list (the failure mode that read as "deleted" while
//     git still had the worktree);
//   - a failed removal leaves its reason on the row, not only in a toast;
//   - Enter/click and Ctrl+D do nothing on a row already on its way out, while a
//     failed row stays available to retry;
//   - the dialog never confirms before its git warnings are read, and never
//     returns silently when there is no repo or worktree;
//   - a job the dialog queued but no copy took is finished by the sidebar after
//     a grace, so a reload or layout switch cannot strand a row.
//
//   node tests/pending.test.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.env.PENDING_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(join(root, file), "utf8");
const core = read("mods/agents-list/workspace-engine.js");
const palette = read("mods/agents-list/palette.js");
const sidebar = read("mods/agents-list/sidebar.js");
const worktree = read("mods/worktrees/main.js");

let failures = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok || !extra ? "" : ` — ${extra}`}`);
};

// A balanced scan, as tests/pinned.test.mjs uses: `removalOf` spans lines.
const strip = (code) => code.replace(/^export\s+/gm, "");
function pick(src, needle) {
  const at = src.indexOf(needle);
  if (at < 0) return "";
  let depth = 0;
  for (let i = at; i < src.length; i++) {
    const c = src[i];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") depth--;
    else if (c === ";" && depth === 0) return src.slice(at, i + 1);
  }
  return src.slice(at);
}

// The shared rule, cut out and run. `removingList` is stubbed so the fifteen
// minute net is the only clock in the test.
const tidy = (p) => (p ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
const live = (list) => list.filter((r) => (r.at ?? 0) > Date.now() - 15 * 60_000);
const lift = (pending = [], failed = undefined) => new Function("removingList", "shared", "tidyPath",
  `${strip(pick(core, "export const removalOf ="))}
   return removalOf;`)(() => live(pending), (key) => (key === "worktree.removalFailed" ? failed : undefined), tidy);

const now = Date.now();
check("a checkout on its way out reads as removing",
  lift([{ path: "/w/", machine: null, at: now, state: "queued" }])("/w", null)?.status === "removing");
check("a removal on this computer says nothing about another machine",
  lift([{ path: "/w", machine: null, at: now }])("/w", "vps") === null);
check("a checkout with no removal and no failure is just a row",
  lift()("/w", null) === null);
check("a failed removal reads with its reason",
  (() => { const r = lift([], { "\u0000/w": { error: "still dirty", at: now } })("/w", null); return r?.status === "failed" && r.error === "still dirty"; })());
check("an entry nobody cleared stops reading as removing after fifteen minutes",
  lift([{ path: "/w", machine: null, at: now - 16 * 60_000 }])("/w", null) === null);

// Both views draw the row instead of filtering it out.
check("the sheet keeps a space while its checkout is removed",
  /const list = raw\.filter\(\(s\) => !this\.removedNow\.has\(s\.id\)\);/.test(palette));
check("the sheet keeps an unopened checkout while it is removed",
  /for \(const c of listedCheckouts\(\)\) \{\s*\n\s*if \(c\.main\) continue;/.test(palette));
check("the sidebar keeps a space while its checkout is removed",
  /const allSpaces = spaceList\.filter\(\(s\) => !removed\.has\(s\.id\)\);/.test(sidebar));
check("the sidebar keeps a checkout while it is removed",
  !/if \(isRemoving\(c\.path, c\.on\)\) continue;/.test(sidebar));
check("a pending row says what is happening in both views",
  /child\("Removing…"\)/.test(sidebar) && /child\("Removing…"\)/.test(palette));
check("a failed row keeps its reason in both views",
  /child\("Couldn't remove"\)/.test(sidebar) && /child\("Couldn't remove"\)/.test(palette)
  && /tooltip\(removal\.error\)/.test(sidebar) && /tooltip\(removal\.error\)/.test(palette));
check("the sheet and the sidebar read one removal rule",
  /removalForRow\(r\) \{[\s\S]{0,500}removalOf\(r\.c\?\.path, r\.on \?\? null\)/.test(core)
  && /removalOf\(rec\.root \?\? r\.s\.folder, r\.s\.machine \?\? null\)/.test(core));

// A row already on its way out is not a place to go, and not something to ask
// twice; a failed one stays available so Ctrl+D retries it.
check("opening a row on its way out does nothing",
  /if \(this\.removalForRow\(r\)\?\.status === "removing"\) return;\s*\n\s*this\.beforeOpen\(cx\);/.test(core));
check("closing a row on its way out does not queue a second removal",
  /if \(this\.removalForRow\(r\)\?\.status === "removing"\) return;\s*\n\s*if \(r\.kind === "agent"\)/.test(core));

// The dialog cannot confirm before its warnings are known, and never returns
// silently: a silent return is what let a removal read as asked when nothing ran.
check("the dialog asks the person to wait while it checks",
  /this\.repo === undefined[\s\S]{0,180}Still checking this checkout/.test(worktree));
check("the dialog says why it cannot remove a folder that is not a worktree",
  /not a linked git worktree any more/.test(worktree));

// The hand-off: the dialog writes enough for a watchdog, and the sidebar takes
// an entry nobody claimed after a grace, so a reload cannot strand the row.
check("the queued entry carries the job the watchdog needs",
  /state: "queued", error: ""[\s\S]{0,200}main: job\.main, force: job\.force, spaces: job\.spaces, pins: job\.pins/.test(worktree));
check("the sidebar finishes a queued removal nobody took",
  /r\.state === "running" \|\| !r\.main/.test(sidebar) && /r\.at \?\? 0\) < 4000/.test(sidebar)
  && /this\.jobs\.push\(\{\s*\n\s*at: r\.at, top: r\.path, main: r\.main/.test(sidebar));
check("a claimed removal is marked running so the watchdog leaves it alone",
  /state: "running", error: ""/.test(sidebar) && /state: "running", error: ""/.test(worktree));
check("a queued job and its watchdog entry share one tidied key",
  /tidyPath\(item\.top\)/.test(sidebar) && /tidyPath\(r\.path\)/.test(sidebar));
check("only a marked force flag forces a removal",
  /force: r\.force === true/.test(sidebar));
check("a failed removal writes the same reason the row reads",
  /setRemovalFailure\(path, on, error\)/.test(sidebar)
  && /markFailed\(job\.top, job\.on \?\? null, this\.error\)/.test(worktree));
check("a successful removal clears the old reason",
  /clearRemovalFailure\(path, on\)/.test(sidebar)
  && /clearFailed\(job\.top, job\.on \?\? null\)/.test(worktree));

if (failures) {
  console.error(`\n${failures} removal-row check(s) failed`);
  process.exit(1);
}
console.log("all removal-row checks passed");
