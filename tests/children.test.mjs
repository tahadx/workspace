// An agent moved into a worktree is a child of that worktree.
//
// The failure this guards against: a newly made worktree is an unopened
// checkout row, and its agents were drawn at nest 1 — the checkout's own
// indent — so they read as rows at the bottom of the repo instead of as the
// worktree's children. An opened worktree always indented them one level
// deeper, so the same agent changed shape depending on whether its checkout
// was open.
//
//   node tests/children.test.mjs
//   CHILDREN_ROOT=/some/other/checkout node tests/children.test.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.env.CHILDREN_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (name, file = "main.js") => readFileSync(join(root, "mods", name, file), "utf8");
const sidebar = read("agents-list", "sidebar.js");
const palette = read("agents-list", "palette.js");

let failures = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok || !extra ? "" : ` — ${extra}`}`);
};

// The checkout row is pl 36 (one level in); nest 2 puts the agent at 6+2*29=64.
check("an agent under an unopened checkout is one level deeper",
  /const withCheckoutKids[\s\S]{0,700}withKids\(a, i, 2\)/.test(sidebar),
  "checkout agents must use nest 2, not the checkout row's own level");
check("an agent under an opened worktree space is one level deeper",
  /kids\.forEach\(\(a, i\) =>[\s\S]{0,160}withKids\(a, i, depth \+ 1\)/.test(sidebar));
check("the sheet nests an agent under a checkout row",
  /out\.push\(\{ kind: "worktree"[\s\S]{0,160}emitAgents\(keyOf\(w\), depth \+ 2\)/.test(palette));
check("the sheet nests an agent under a space",
  /emitAgents\(`space\\u0000\$\{s\.id\}`,\s*depth \+ 1\)/.test(palette));
check("the sheet's checkout rows nest their agents once",
  /pushWorktree[\s\S]{0,260}worktreeAgents\(w, depth \+ 1\)/.test(palette));

console.log(failures ? `\n${failures} child-row check(s) failed` : "all child-row checks passed");
process.exit(failures ? 1 : 0);
