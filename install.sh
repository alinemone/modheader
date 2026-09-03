#!/usr/bin/env sh
# OpenModHeader installer for macOS and Linux.
#
# Chrome does not allow an extension to be installed by a script — see the
# note at the bottom of this file. What this does is the tedious part:
# fetch the latest release, unpack it somewhere stable, and put that path on
# your clipboard so the final step is a paste.

set -eu

REPO="alinemone/modheader"
URL="https://github.com/$REPO/releases/latest/download/openmodheader.zip"
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/openmodheader"
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if [ -f "$HERE/manifest.json" ]; then
  # Running from a clone — install these files rather than downloading.
  echo "Installing from local checkout: $HERE"
  rm -rf "$DEST"
  mkdir -p "$DEST"
  cp -R "$HERE/manifest.json" "$HERE/src" "$HERE/icons" "$DEST/"
  if [ -f "$HERE/README.md" ]; then cp "$HERE/README.md" "$DEST/"; fi
  if [ -f "$HERE/LICENSE" ]; then cp "$HERE/LICENSE" "$DEST/"; fi
else
  command -v curl >/dev/null 2>&1 || { echo "Error: curl is required." >&2; exit 1; }
  command -v unzip >/dev/null 2>&1 || { echo "Error: unzip is required." >&2; exit 1; }

  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP"' EXIT

  echo "Downloading the latest release..."
  if ! curl -fsSL "$URL" -o "$TMP/openmodheader.zip"; then
    echo "Error: download failed. Check https://github.com/$REPO/releases" >&2
    exit 1
  fi

  rm -rf "$DEST"
  mkdir -p "$DEST"
  unzip -q "$TMP/openmodheader.zip" -d "$DEST"
fi

[ -f "$DEST/manifest.json" ] || { echo "Error: unpacked files look wrong." >&2; exit 1; }
VERSION=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$DEST/manifest.json" | head -1)

# Best effort — a machine with no clipboard tool must not fail the install.
COPIED=0
if command -v pbcopy >/dev/null 2>&1; then
  printf '%s' "$DEST" | pbcopy && COPIED=1 || true
elif command -v wl-copy >/dev/null 2>&1; then
  printf '%s' "$DEST" | wl-copy && COPIED=1 || true
elif command -v xclip >/dev/null 2>&1; then
  printf '%s' "$DEST" | xclip -selection clipboard && COPIED=1 || true
fi

cat <<EOF

  OpenModHeader $VERSION unpacked to:

      $DEST

  Chrome cannot be scripted into installing this, so three steps are left:

    1. Open  chrome://extensions
    2. Turn on "Developer mode" (top right)
    3. Click "Load unpacked" and choose the folder above
EOF

if [ "$COPIED" = "1" ]; then
  echo "       (the path is on your clipboard — just paste it)"
fi
echo
