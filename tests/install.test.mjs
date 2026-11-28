// What a fresh install actually writes.
//
// The failures this guards against:
//   1. install.sh merged only layout:workspace, so a fresh Herdr home never got
//      Alt+F (it lived in global) — the bundle's headline feature was unbound;
//   2. the CI scratch install still looked for the deleted `search` mod;
//   3. a person's own global/terminal bindings were replaced by the bundle's.
//
//   node tests/install.test.mjs

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.env.INSTALL_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok || !extra ? "" : ` — ${extra}`}`);
};

if (spawnSync("python3", ["--version"]).status !== 0) {
  console.log("skip: python3 is needed for the keys merge");
  process.exit(0);
}

const home = mkdtempSync(join(tmpdir(), "herdr-install-"));
try {
  // A person's file: a custom global key, a key the bundle also knows (which
  // must keep the person's action), and a terminal key. No layout section yet.
  writeFileSync(join(home, "keys.json"), JSON.stringify({
    global: { "my-key": "space.new", "ctrl-shift-t": "tab.new" },
    terminal: { "ctrl-shift-c": "terminal.copy" },
  }, null, 2) + "\n");

  execFileSync("sh", [join(root, "install.sh")], {
    cwd: root,
    env: { ...process.env, HERDR_APP_HOME: home },
    stdio: "pipe",
  });

  const keys = JSON.parse(readFileSync(join(home, "keys.json"), "utf8"));
  const layout = keys["layout:workspace"] ?? {};

  check("install.sh copies the layout", existsSync(join(home, "layouts", "workspace.json")));
  check("install.sh copies the theme", existsSync(join(home, "themes", "omarchy.json")));
  check("install.sh copies the sidebar mod", existsSync(join(home, "mods", "agents-list", "main.js")));
  check("install.sh does not copy the removed search mod", !existsSync(join(home, "mods", "search")));
  check("install.sh does not copy the removed handle mod", !existsSync(join(home, "mods", "handle")));

  // Every mod the layout names has to be installed, or a fresh home opens an
  // empty block (the command bar and pane headers were missing exactly this way).
  const modsIn = (node, out = new Set()) => {
    if (node && typeof node === "object") {
      if (typeof node.mod === "string") out.add(node.mod);
      for (const value of Object.values(node)) modsIn(value, out);
    }
    return out;
  };
  const installedLayout = JSON.parse(readFileSync(join(home, "layouts", "workspace.json"), "utf8"));
  const wanted = modsIn(installedLayout);
  // `files` and `changes` are Herdr's own panels, not this bundle's.
  const shipped = new Set(["files", "changes"]);
  const missing = [...wanted].filter((name) => !shipped.has(name) && !existsSync(join(home, "mods", name, "main.js")));
  check("install.sh copies every mod the layout names", missing.length === 0, missing.join(", "));

  check("Alt+F is installed in the layout's own section",
    layout["alt-f"] === "mod.open:agents-list", JSON.stringify(layout["alt-f"]));
  check("the tab and space numbers are installed",
    layout["alt-1"] === "tab.select:1" && layout["ctrl-1"] === "space.select:1");
  check("the walk is installed on the always-mounted command bar",
    layout["ctrl-j"] === "command-bar.dir_down" && layout["ctrl-k"] === "command-bar.dir_up");
  check("Ctrl+Shift+B cycles the sidebar in this layout",
    layout["ctrl-shift-b"] === "command-bar.cycle_sidebar"
    && keys.global?.["ctrl-shift-b"] === undefined);

  check("the person's own global key is kept",
    keys.global["my-key"] === "space.new" && keys.global["ctrl-shift-t"] === "tab.new");
  check("a layout-only key stays out of global",
    keys.global["alt-f"] === undefined && keys.global["alt-1"] === undefined,
    "other layouts would inherit the workspace's keys");
  check("a missing app-wide key is added",
    keys.global["ctrl-q"] === "overlay.close", JSON.stringify(keys.global["ctrl-q"]));
  check("the person's terminal key is kept",
    keys.terminal["ctrl-shift-c"] === "terminal.copy");
  check("the terminal's Ctrl+Q is added",
    keys.terminal["ctrl-q"] === "send:\u0011", JSON.stringify(keys.terminal["ctrl-q"]));
} finally {
  rmSync(home, { recursive: true, force: true });
}

// No key file at all: the install has to leave a complete map, not a layout
// section that would make every other layout's keys disappear.
const empty = mkdtempSync(join(tmpdir(), "herdr-install-empty-"));
try {
  execFileSync("sh", [join(root, "install.sh")], {
    cwd: root,
    env: { ...process.env, HERDR_APP_HOME: empty },
    stdio: "pipe",
  });
  const keys = JSON.parse(readFileSync(join(empty, "keys.json"), "utf8"));
  check("a fresh install seeds the complete global map",
    keys.global?.["alt-h"] === "pane.go:left" && keys.global?.["ctrl-shift-t"] === "tab.new");
  check("a fresh install seeds the terminal map",
    keys.terminal?.["ctrl-shift-c"] === "terminal.copy");
  check("a fresh install still has the layout's own keys",
    keys["layout:workspace"]?.["alt-f"] === "mod.open:agents-list");
} finally {
  rmSync(empty, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} install check(s) failed` : "all install checks passed");
process.exit(failures ? 1 : 0);
