#!/usr/bin/env sh
# Install this layout into a Herdr home.
#
#   ./install.sh                      # into ~/.config/herdr-app
#   HERDR_APP_HOME=/path ./install.sh # into another home (a test one, say)
#
# Copies the layout, the mods it uses and its theme, then merges the keys the
# layout needs into keys.json. The old keys.json is kept beside it. Nothing else
# in your Herdr home is touched, and Herdr's own mods are never written to.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
home=${HERDR_APP_HOME:-${XDG_CONFIG_HOME:-$HOME/.config}/herdr-app}

if [ ! -d "$home" ]; then
  echo "No Herdr home at $home." >&2
  echo "Start Herdr once, or set HERDR_APP_HOME to the home you want." >&2
  exit 1
fi

# The nine mods of this bundle, by name: copying mods/ wholesale would take
# Herdr's own mods (and its scratch files) along with it. Every mod the layout
# names must be here: a missing one leaves an empty block on a fresh install.
BUNDLE="agents-list terminals-list footer icons shortcuts worktrees sidebar-menu command-bar glass-pane"

mkdir -p "$home/layouts" "$home/mods" "$home/themes"
cp "$here/layouts/workspace.json" "$home/layouts/"
cp "$here/layouts/workspace.svg" "$home/layouts/"
for mod in $BUNDLE; do
  if [ ! -d "$here/mods/$mod" ]; then
    echo "Missing mods/$mod in this bundle." >&2
    exit 1
  fi
  cp -R "$here/mods/$mod" "$home/mods/"
  # Herdr writes these into every mod folder; a copy from another version would
  # only mislead an editor. The app writes its own on the next start.
  rm -f "$home/mods/$mod/jsconfig.json" "$home/mods/$mod"/*.d.ts
done
[ -f "$here/themes/omarchy.json" ] && cp "$here/themes/omarchy.json" "$home/themes/"

# The keys this setup expects, taken from this repo's own keys.json so the file a
# person reads (and docs/bindings.md copies) is the file install.sh merges. The
# layout's own section is updated; a `global`/`terminal` binding is added only
# when the person's file has none and the layout section does not already carry
# it (that keeps a layout-only key out of other layouts). With no key file at
# all, the whole bundle is seeded, since the file is Herdr's complete keymap.
keys="$home/keys.json"
if [ -f "$keys" ]; then
  cp "$keys" "$keys.bak.$(date +%s)"
fi

if command -v python3 >/dev/null 2>&1; then
  python3 - "$keys" "$here/keys.json" <<'PY'
import json, pathlib, sys
path, ours_path = map(pathlib.Path, sys.argv[1:3])
data = json.loads(path.read_text()) if path.exists() else {}
bundle = json.loads(ours_path.read_text())
ours = bundle.get("layout:workspace", {})
# With no key file at all there is no person's set to keep: seed the whole file,
# or the other layouts would have no keys (the file is the complete map). A
# section that is missing or empty is seeded the same way.
seed = not data
section = data.setdefault("layout:workspace", {})
added = [k for k in ours if k not in section]
section.update(ours)
extra = []
for name in ("global", "terminal"):
    target = data.setdefault(name, {})
    fill = seed or not target
    for key, action in bundle.get(name, {}).items():
        if key in target or (not fill and key in ours):
            continue
        target[key] = action
        extra.append(f"{name} {key}")
path.write_text(json.dumps(data, indent=2) + "\n")
if added:
    print(f"keys.json: {len(added)} key(s) added to layout:workspace")
else:
    print("keys.json: already has this layout's keys")
if extra:
    print(f"keys.json: {len(extra)} app-wide key(s) added: {', '.join(extra)}")
PY
else
  cat <<EOF
python3 was not found, so keys.json was not merged. Add the "layout:workspace"
section of this bundle's keys.json to $keys by hand, and its "global" and
"terminal" keys your file does not already have:

  $here/keys.json
EOF
fi

cat <<EOF

Installed into $home

Next:
  herdr-app do layout.switch --name workspace
  (or Ctrl+Shift+L to cycle layouts)

The mods load on their own; "herdr-app check $home/mods/agents-list" proves one.
EOF
