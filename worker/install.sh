#!/usr/bin/env bash
# Athar companion worker installer (Linux / macOS).
# Installs the worker's Python dependencies, checks for Meshroom and Blender,
# and writes a .env file for you to paste the worker key into.
# It never downloads Meshroom for you — see the README for the download page.
set -euo pipefail

cd "$(dirname "$0")"
echo "== Athar worker setup =="

# --- Python ---------------------------------------------------------------
PY=""
for c in python3.12 python3.11 python3.10 python3 python; do
  if command -v "$c" >/dev/null 2>&1; then
    if "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)'; then PY="$c"; break; fi
  fi
done
if [ -z "$PY" ]; then
  echo "ERROR: Python 3.10 or newer was not found. Install it from https://www.python.org/downloads/ and run this script again."
  exit 1
fi
echo "Python: $("$PY" --version)"

# --- virtual environment + dependencies ----------------------------------
if [ ! -d .venv ]; then "$PY" -m venv .venv; fi
# shellcheck disable=SC1091
. .venv/bin/activate
python -m pip install --upgrade pip >/dev/null
python -m pip install -r requirements.txt
echo "Dependencies installed."

# --- Meshroom -------------------------------------------------------------
MESHROOM=""
for p in "$(command -v meshroom_batch 2>/dev/null || true)" \
         /opt/Meshroom/meshroom_batch \
         "$HOME/Meshroom/meshroom_batch" \
         /Applications/Meshroom.app/Contents/MacOS/meshroom_batch; do
  if [ -n "$p" ] && [ -x "$p" ]; then MESHROOM="$p"; break; fi
done
if [ -n "$MESHROOM" ]; then
  echo "Meshroom: $MESHROOM"
else
  echo "Meshroom was NOT found."
  echo "  Download the free AliceVision Meshroom release for your system: https://alicevision.org/#meshroom"
  echo "  Unzip it, then either add its folder to PATH or set MESHROOM_BIN in .env to the full path of meshroom_batch."
fi

# --- Blender (used to export GLB) ----------------------------------------
if command -v blender >/dev/null 2>&1; then
  echo "Blender: $(command -v blender)"
elif [ -x /Applications/Blender.app/Contents/MacOS/Blender ]; then
  echo "Blender: /Applications/Blender.app/Contents/MacOS/Blender"
else
  echo "Blender was NOT found. Without it the finished mesh is uploaded as a ZIP instead of a GLB the in-app 3D viewer can open."
  echo "  Free download: https://www.blender.org/download/"
fi

# --- hardware note -------------------------------------------------------
echo "Recommended: 16 GB RAM, 20+ GB free disk per job, and an NVIDIA CUDA GPU for full-detail meshes (draft pipeline works without one)."

# --- configuration -------------------------------------------------------
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env — open it and paste the worker key from Athar: Admin -> 3D processing computer -> Issue worker key."
else
  echo ".env already exists and was left untouched."
fi

echo
echo "Start the worker with:   . .venv/bin/activate && python athar_worker.py"
