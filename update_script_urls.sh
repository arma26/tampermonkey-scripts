#!/usr/bin/env bash

set -euo pipefail

SCRIPT_FILE="$1"

if [[ ! -f "$SCRIPT_FILE" ]]; then
    echo "File does not exist: $SCRIPT_FILE"
    exit 1
fi

SCRIPT_NAME="$(basename "$SCRIPT_FILE")"
BASE_URL="https://raw.github.com/arma26/tampermonkey-scripts/blob/master/${SCRIPT_NAME}"

HAS_DOWNLOAD=$(grep -E '^\s*//\s*@downloadURL' "$SCRIPT_FILE" || true)
HAS_UPDATE=$(grep -E '^\s*//\s*@updateURL' "$SCRIPT_FILE" || true)

TMP_FILE="$(mktemp)"

# Build insertion block
INSERT_BLOCK=""
if [[ -z "$HAS_DOWNLOAD" ]]; then
    INSERT_BLOCK+="// @downloadURL   ${BASE_URL}\n"
fi
if [[ -z "$HAS_UPDATE" ]]; then
    INSERT_BLOCK+="// @updateURL     ${BASE_URL}\n"
fi

if [[ -z "$INSERT_BLOCK" ]]; then
    echo "Nothing to update; both fields already exist."
    exit 0
fi

# Insert before the ==/UserScript== line
awk -v insert="$INSERT_BLOCK" '
    /\/\/ ==\/UserScript==/ {
        printf("%s", insert);
    }
    { print }
' "$SCRIPT_FILE" > "$TMP_FILE"

mv "$TMP_FILE" "$SCRIPT_FILE"

echo "Metadata updated for: $SCRIPT_FILE"
