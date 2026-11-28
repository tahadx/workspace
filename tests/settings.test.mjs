// Settings and the layout's look are one system.
//
// The failure this guards against: the layout stated `font_size: 16`,
// `ui_font: Geist` and `terminal_line_height: 1.15` while settings.json said
// `1`. The layout wins in Herdr, so the Settings screen showed a value the
// window never used — a setting that lies, and a change there did nothing.
//
// One owner: the person's settings own fonts and terminal metrics; the layout
// owns its geometry, theme and colours. A look field must not be stated in
// both, and the Settings screen must state every field the look depends on.
//
//   node tests/settings.test.mjs
//   SETTINGS_ROOT=/some/other/checkout node tests/settings.test.mjs

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.env.SETTINGS_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (name) => JSON.parse(readFileSync(join(root, name), "utf8"));

let failures = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok || !extra ? "" : ` — ${extra}`}`);
};

const layout = readJson("layouts/workspace.json");
const settingsPath = join(root, "settings.json");

// Fields settings.json owns. The layout leaving them unset is what lets the
// Settings screen change the window; stating one here would silently win.
const SETTINGS_KEYS = [
  "font", "font_size", "ui_font", "font_weight", "font_weight_bold",
  "terminal_line_height", "terminal_cell_width", "terminal_scroll_speed",
];

for (const key of SETTINGS_KEYS) {
  check(`the layout leaves ${key} to settings`, layout[key] === undefined,
    `layout states ${JSON.stringify(layout[key])}`);
}

// Themes and colours are the layout's own look; the person can still override
// through the theme picker. A colour stated in both places must be the same one.
for (const [name, value] of Object.entries(layout.colors ?? {})) {
  if (!existsSync(settingsPath)) break;
  const settings = readJson("settings.json");
  if (!(name in (settings.colors ?? {}))) continue;
  check(`settings.colors.${name} mirrors the layout`,
    JSON.stringify(value) === JSON.stringify(settings.colors[name]),
    `layout ${JSON.stringify(value)} vs settings ${JSON.stringify(settings.colors[name])}`);
}

if (!existsSync(settingsPath)) {
  // A fresh checkout carries no machine settings: Herdr's defaults stand, and
  // the layout must still load with no look fields of its own.
  console.log("ok   no settings.json (fresh checkout); Herdr's defaults apply");
} else {
  const settings = readJson("settings.json");

  // The look this layout is drawn for (RECIPE.md states the same values). A
  // missing one is not a crash, but it silently changes the window.
  const NEEDED = {
    font: "JetBrains Mono",
    font_size: 16,
    ui_font: "Geist",
    terminal_line_height: 1.15,
  };
  for (const [key, wanted] of Object.entries(NEEDED)) {
    check(`settings.${key} carries the intended look`, settings[key] === wanted,
      `settings ${JSON.stringify(settings[key])}, wanted ${JSON.stringify(wanted)}`);
  }

  check("settings zoom is in the app's range",
    settings.zoom === undefined || (settings.zoom >= 0.5 && settings.zoom <= 3),
    String(settings.zoom));
}

if (failures) {
  console.log(`\n${failures} failed`);
  process.exitCode = 1;
}
