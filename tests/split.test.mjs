// A split follows the agent, not its shell.
//
// The failure this guards against: an agent moves its session into a worktree
// while its shell stays in the repo's main checkout. `pane.split` opens in the
// pane's cwd, so Ctrl+Shift+O / E created the new terminal in main — the very
// place the agent had moved away from. `terminal.open` with the session folder
// puts it in the worktree.
//
//   node tests/split.test.mjs
//   SPLIT_ROOT=/some/other/checkout node tests/split.test.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.env.SPLIT_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (name, file = "main.js") => readFileSync(join(root, "mods", name, file), "utf8");

function lift(src, name) {
  const at = src.indexOf(`function ${name}(`);
  if (at < 0) throw new Error(`no function ${name}`);
  let depth = 0;
  for (let i = at; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`unbalanced ${name}`);
}

const bar = read("command-bar");
const makeSplit = new Function("focused", "shared", "run",
  `${lift(bar, "split")}; return split;`);

let failures = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok || !extra ? "" : ` — ${extra}`}`);
};

function attempt({ cwd, session }) {
  const calls = [];
  const focused = () => ({ terminal: "t1", pane: "p1", cwd });
  const shared = (key) => (key === "workspace.agentDirs" ? { t1: session } : undefined);
  const run = (name, args) => calls.push({ name, args });
  const split = makeSplit(focused, shared, run);
  split("right");
  return calls;
}

// The agent's session is in a worktree; the shell still reports the main repo.
{
  const calls = attempt({ cwd: "/repo", session: "/repo-hotfix" });
  check("a split in a moved agent opens the worktree",
    calls.length === 1 && calls[0].name === "terminal.open"
    && calls[0].args.folder === "/repo-hotfix" && calls[0].args.place === "right",
    JSON.stringify(calls));
}
// The shell already followed the session: a normal split keeps its place.
{
  const calls = attempt({ cwd: "/repo-hotfix", session: "/repo-hotfix/" });
  check("a shell already in the worktree splits normally",
    calls.length === 1 && calls[0].name === "pane.split" && calls[0].args.direction === "right",
    JSON.stringify(calls));
}
// No session folder: an ordinary terminal keeps Herdr's split.
{
  const calls = attempt({ cwd: "/repo", session: undefined });
  check("a terminal without a moved session splits normally",
    calls.length === 1 && calls[0].name === "pane.split",
    JSON.stringify(calls));
}
// A stale shared entry is still the agent's folder; only the folder decides.
{
  const calls = attempt({ cwd: "/repo", session: "/repo/../repo-hotfix" });
  check("the session folder wins over the shell's cwd",
    calls[0]?.name === "terminal.open" && calls[0].args.folder === "/repo/../repo-hotfix",
    JSON.stringify(calls));
}

// The layout must route every split key through the bar, never straight to
// pane.split (which would bypass the rule).
{
  const keys = JSON.parse(readFileSync(join(root, "keys.json"), "utf8"));
  const layout = keys["layout:workspace"] ?? {};
  check("Ctrl+Shift+O splits through the command bar", layout["ctrl-shift-o"] === "command-bar.split_right");
  check("Ctrl+Shift+E splits through the command bar", layout["ctrl-shift-e"] === "command-bar.split_down");
  check("Alt+Shift+Enter splits through the command bar", layout["alt-shift-enter"] === "command-bar.split_right");
  check("Alt+Enter splits through the command bar", layout["alt-enter"] === "command-bar.split_down");
  check("the command bar handles both split commands",
    /c === "split_right" \|\| c === "split_down"/.test(bar));
}

console.log(failures ? `\n${failures} split check(s) failed` : "all split checks passed");
process.exit(failures ? 1 : 0);
