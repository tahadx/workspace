// One agent, shown once.
//
// The failure this guards against: opencode resumed a session in a new terminal
// and left the old view running. Both terminals report the same session id, so
// the sidebar drew two identical rows under one worktree and the sheet drew one
// under the repo and one under the checkout. They are one agent.
//
//   node tests/sessions.test.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.env.SESSIONS_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "mods/agents-list/workspace-engine.js"), "utf8");

function lift(name) {
  const at = src.indexOf(`export function ${name}(`);
  if (at < 0) throw new Error(`no function ${name}`);
  let depth = 0;
  for (let i = at; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(at, i + 1).replace(/^export /, "");
  }
  throw new Error(`unbalanced ${name}`);
}

// The engine reads terminals once per paint; the test hands its own list over,
// so the frame cache never runs.
const dedupeSessions = new Function("frameCache", `${lift("dedupeSessions")}; return dedupeSessions;`)((_key, read) => read());

let failures = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok || !extra ? "" : ` — ${extra}`}`);
};
const agent = (o) => ({ address: "t", title: "OC | Same session", seq: 1, pinned: false, focused: false, ...o });
const term = (address, ...sessions) => ({
  address,
  records: Object.fromEntries(sessions.map((s) => [s, { app: "opencode", state: "working" }])),
});
const kept = (list, all) => dedupeSessions(list, all).map((a) => a.address);

// ---- the same session in two terminals is one row ---------------------------
{
  const list = [agent({ address: "t1kn", seq: 15 }), agent({ address: "t1m7", seq: 17 })];
  const all = [term("t1kn", "ses_abc"), term("t1m7", "ses_abc")];
  check("two views of one session draw one row", JSON.stringify(kept(list, all)) === '["t1m7"]', JSON.stringify(kept(list, all)));
}

// ---- the row that stays is the one the person is looking at ------------------
{
  const list = [agent({ address: "old", seq: 15, focused: true }), agent({ address: "new", seq: 17 })];
  const all = [term("old", "ses_abc"), term("new", "ses_abc")];
  check("the focused view is the one kept", JSON.stringify(kept(list, all)) === '["old"]', JSON.stringify(kept(list, all)));
}
{
  const list = [agent({ address: "pinned", seq: 15, pinned: true }), agent({ address: "new", seq: 17 })];
  const all = [term("pinned", "ses_abc"), term("new", "ses_abc")];
  check("a pinned view is kept over a newer one", JSON.stringify(kept(list, all)) === '["pinned"]', JSON.stringify(kept(list, all)));
}

// ---- no record at all: the same app, title and folder is still one row ------
{
  const list = [agent({ address: "old", seq: 15, app: "opencode" }), agent({ address: "new", seq: 17, app: "opencode" })];
  const at = (address) => ({ address, labels: { "herdr.cwd": "/repo/wt" } });
  const all = [at("old"), at("new")];
  check("two views of a session with no record are one row",
    JSON.stringify(kept(list, all)) === '["new"]', JSON.stringify(kept(list, all)));
}
{
  const list = [agent({ address: "here", seq: 15, app: "opencode" }), agent({ address: "there", seq: 17, app: "opencode" })];
  const all = [
    { address: "here", labels: { "herdr.cwd": "/repo/wt" } },
    { address: "there", labels: { "herdr.cwd": "/repo/other" } },
  ];
  check("the same title in another folder stays a second agent",
    JSON.stringify(kept(list, all)) === '["here","there"]', JSON.stringify(kept(list, all)));
}

// ---- nothing is hidden on a guess -------------------------------------------
{
  const list = [agent({ address: "a", seq: 15 }), agent({ address: "b", seq: 17 })];
  const all = [term("a", "ses_a"), term("b", "ses_b")];
  check("different sessions both stay", JSON.stringify(kept(list, all)) === '["a","b"]', JSON.stringify(kept(list, all)));
}
{
  const list = [agent({ address: "a", seq: 15 }), agent({ address: "b", seq: 17 })];
  const all = [term("a"), term("b")];
  check("a terminal with no reported session is never merged", JSON.stringify(kept(list, all)) === '["a","b"]', JSON.stringify(kept(list, all)));
}
{
  const list = [agent({ address: "a" }), agent({ address: "b" })];
  const all = [term("a", "ses_a")];
  check("a terminal missing from the list is never merged", JSON.stringify(kept(list, all)) === '["a","b"]', JSON.stringify(kept(list, all)));
}

console.log(failures ? `\n${failures} session check(s) failed` : "all session checks passed");
process.exit(failures ? 1 : 0);
