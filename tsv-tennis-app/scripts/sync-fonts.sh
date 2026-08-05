#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# sync-fonts.sh — Fetch the self-hosted Archivo variable font from Google Fonts.
#
# The woff2 is deliberately NOT committed to the repo (binary asset); it is
# downloaded at build time (Docker) and during local development (predev).
#
# Usage:
#   ./sync-fonts.sh            # fetch into tsv-tennis-app/public/fonts/
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Script lives at tsv-tennis-app/scripts/, so public/fonts is one level up.
FONT_DIR="$SCRIPT_DIR/../public/fonts"
FONT_FILE="$FONT_DIR/archivo-latin.woff2"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
# Bound connection/total time and add a few retries so a stalled network
# cannot block predev or the Docker build indefinitely.
CURL_OPTS=(--connect-timeout 10 --max-time 60 --retry 3 --retry-delay 2)

mkdir -p "$FONT_DIR"

# Resolve the current latin-subset woff2 URL from the Google Fonts CSS API so
# we don't pin a hash URL that can rotate over time.
CSS_URL="https://fonts.googleapis.com/css2?family=Archivo:wght@400..800&display=swap"
CSS="$(curl -fsSL "${CURL_OPTS[@]}" -A "$UA" "$CSS_URL")"

FONT_URL="$(printf '%s' "$CSS" \
  | python3 -c '
import re, sys
css = sys.stdin.read()
for block in re.findall(r"@font-face\s*{(.*?)}", css, re.S):
    if "U+0000-00FF" in block:
        m = re.search(r"url\((https://[^)]+)\)", block)
        if m:
            print(m.group(1))
            break
')"

if [[ -z "$FONT_URL" ]]; then
  echo "sync-fonts: could not resolve Archivo latin woff2 URL" >&2
  exit 1
fi

echo "sync-fonts: downloading $FONT_URL"
curl -fsSL "${CURL_OPTS[@]}" "$FONT_URL" -o "$FONT_FILE"
echo "sync-fonts: wrote $FONT_FILE ($(du -h "$FONT_FILE" | cut -f1))"
