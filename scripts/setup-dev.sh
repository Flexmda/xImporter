#!/usr/bin/env bash
# Enable unsigned CEP panels for Premiere Pro 2022+ and link this repo's panel
# into the per-user extensions folder. Does not sign, notarize, or install a ZXP.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PANEL="$ROOT/panel"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "setup-dev.sh writes Premiere debug prefs on macOS."
  echo "This machine is $(uname -s). Nothing was changed."
  echo "On the Mac, run:"
  echo "  defaults write com.adobe.CSXS.11 PlayerDebugMode -string 1"
  echo "  defaults write com.adobe.CSXS.12 PlayerDebugMode -string 1"
  exit 0
fi

if [[ ! -f "$PANEL/CSXS/manifest.xml" ]]; then
  echo "missing $PANEL/CSXS/manifest.xml" >&2
  exit 1
fi

# CEP reads a string. An integer 1 is ignored by some Premiere versions.
defaults write com.adobe.CSXS.11 PlayerDebugMode -string 1
defaults write com.adobe.CSXS.12 PlayerDebugMode -string 1

EXT_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions"
mkdir -p "$EXT_DIR"
ln -sfn "$PANEL" "$EXT_DIR/xImporter"

echo "PlayerDebugMode=1 for com.adobe.CSXS.11 and com.adobe.CSXS.12."
echo "Panel linked at: $EXT_DIR/xImporter"
echo "Quit Premiere Pro completely, then open it again."
echo "Choose Window > Extensions > xImporter."
