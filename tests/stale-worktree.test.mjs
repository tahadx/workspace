// A worktree deleted outside Herdr while no sidebar copy is running leaves a
// cached checkout row whose folder is gone. The removal dialog cannot name a
// repo for that folder, so the row has to be cleared from the shared picture
// instead — and the picture has to be pruned when a view starts.
//
//   node tests/stale-worktree.test.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.env.STALE_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const engine = readFileSync(join(root, "mods/agents-list/workspace-engine.js"), "utf8");
const dialog = readFileSync(join(root, "mods/worktrees/main.js"), "utf8");

let failures = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok || !extra ? "" : ` — ${extra}`}`);
};

const SEP = "\u001f";
const tidy = (p) => (p ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
const asObject = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);

// A function's body, from its opening brace to the matching close.
function body(src, marker) {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error(`no ${marker}`);
  const open = src.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open + 1, i);
  }
  throw new Error(`unbalanced ${marker}`);
}

const pruneBody = body(engine, "export async function pruneStaleCheckouts(");
const forgetBody = body(dialog, "const forgetCheckout = (path) =>");

function primer(fresh, marked = []) {
  let pruning = false;
  let gone = [];
  let cleared = [];
  let persisted = 0;
  const state = {
    trees: { [`${SEP}/repo`]: [{ path: "/repo/wt", branch: "feat" }, { path: "/repo/keep", branch: "keep" }] },
  };
  const workspace = {
    trees: JSON.parse(JSON.stringify(state.trees)),
    git: { [`${SEP}/repo/wt`]: { linked: true, root: "/repo/wt" }, [`${SEP}/repo`]: { linked: false, root: "/repo" } },
    spacePins: { s1: { isWorktree: true, worktreePath: "/repo/wt" }, s2: { isWorktree: true, worktreePath: "/repo/keep" } },
  };
  const prune = new Function(
    "pruning", "workspaceState", "asObject", "readCheckouts", "tidyPath", "markGoneCheckouts",
    "goneCheckouts", "clearGoneMarks", "workspace", "spaces", "dropGitCache", "persistWorkspace", "SEP",
    `return async function pruneStaleCheckouts() {${pruneBody}};`,
  )(pruning, () => state, asObject, async () => fresh, tidy,
    (paths) => { gone = [...paths]; }, () => new Set(marked), (paths) => { cleared = [...paths]; },
    workspace, () => [], () => {}, () => { persisted++; }, SEP);
  return { prune, workspace, gone: () => gone, clearedMarks: () => cleared, persisted: () => persisted };
}

const removed = primer([{ path: "/repo/keep" }]);
await removed.prune();
check("a checkout git no longer lists is pruned",
  JSON.stringify(removed.workspace.trees[`${SEP}/repo`]) === JSON.stringify([{ path: "/repo/keep", branch: "keep" }]));
check("the pruned path is marked gone so other copies cannot put it back",
  removed.gone().join() === "/repo/wt");
check("the stale git summary and sticky record go with it",
  !(`${SEP}/repo/wt` in removed.workspace.git) && !("s1" in removed.workspace.spacePins)
  && `${SEP}/repo` in removed.workspace.git && "s2" in removed.workspace.spacePins);
check("the cleaned picture is written back", removed.persisted() === 1);

const failed = primer(null);
await failed.prune();
check("a failed git read keeps the cached list",
  failed.workspace.trees[`${SEP}/repo`].length === 2 && failed.gone().length === 0 && failed.persisted() === 0);

const recreated = primer([{ path: "/repo/wt" }, { path: "/repo/keep" }], ["/repo/wt"]);
await recreated.prune();
check("a checkout made again at the same path clears its gone mark",
  recreated.clearedMarks().join() === "/repo/wt" && recreated.persisted() === 1
  && recreated.workspace.trees[`${SEP}/repo`].length === 2);

// ---- the dialog clears a row whose folder is gone --------------------------
let state = {
  trees: { [`${SEP}/repo`]: [{ path: "/repo/wt" }], [`${SEP}/other`]: [{ path: "/repo/keep" }] },
  git: { [`${SEP}/repo/wt`]: { linked: true, root: "/repo/wt" } },
  spaces: { s1: { isWorktree: true, worktreePath: "/repo/wt" }, s2: { isWorktree: true, worktreePath: "/repo/keep" } },
};
let cleared = 0;
const forget = new Function(
  "norm", "props", "shared", "setShared", "spaces", "clearFailed",
  `return function forgetCheckout(path) {${forgetBody}};`,
)(tidy, () => ({ machine: null }), () => state, (_k, v) => { state = v; }, () => [], () => { cleared++; });

check("forget removes the stale row from every repo's cached list", forget("/repo/wt") === true
  && state.trees[`${SEP}/repo`].length === 0 && state.trees[`${SEP}/other`].length === 1);
check("forget removes its git summary and sticky record, and keeps the others",
  !(`${SEP}/repo/wt` in state.git) && !("s1" in state.spaces) && "s2" in state.spaces && cleared === 1);
check("forget does nothing for a path that is not cached", forget("/repo/never") === false);

// The dialog must offer it as an action, not as a dead end.
const go = body(dialog, "  go(cx) {");
check("Enter clears a stale checkout instead of refusing it",
  /if \(!this\.repo && this\.staleCheckout\) \{[\s\S]{0,400}forgetCheckout\(/.test(go));
check("a stale checkout is detected when git finds no repo",
  /if \(!repo && props\(\)\?\.action === "remove"\) this\.staleCheckout = cachedCheckout\(this\.folder\);/.test(dialog));

console.log(failures ? `\n${failures} stale-worktree check(s) failed` : "\nAll stale-worktree checks passed.");
process.exitCode = failures ? 1 : 0;
