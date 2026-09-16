# Athar companion worker installer (Windows PowerShell).
# Installs the worker's Python dependencies, checks for Meshroom and Blender,
# and creates a .env file for you to paste the worker key into.
# It never downloads Meshroom for you - see the README for the download page.
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot
Write-Host "== Athar worker setup =="

# --- Python ---------------------------------------------------------------
$py = $null
foreach ($c in @("python", "python3", "py")) {
  $cmd = Get-Command $c -ErrorAction SilentlyContinue
  if ($cmd) {
    & $c -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" 2>$null
    if ($LASTEXITCODE -eq 0) { $py = $c; break }
  }
}
if (-not $py) {
  Write-Host "ERROR: Python 3.10 or newer was not found. Install it from https://www.python.org/downloads/ (tick 'Add python.exe to PATH') and run this script again."
  exit 1
}
Write-Host ("Python: " + (& $py --version))

# --- virtual environment + dependencies ----------------------------------
if (-not (Test-Path ".venv")) { & $py -m venv .venv }
& ".venv\Scripts\python.exe" -m pip install --upgrade pip | Out-Null
& ".venv\Scripts\python.exe" -m pip install -r requirements.txt
Write-Host "Dependencies installed."

# --- Meshroom -------------------------------------------------------------
$meshroom = $null
$candidates = @(
  "C:\Program Files\Meshroom\meshroom_batch.exe",
  "$env:LOCALAPPDATA\Programs\Meshroom\meshroom_batch.exe",
  "$env:USERPROFILE\Meshroom\meshroom_batch.exe"
)
$onPath = Get-Command "meshroom_batch.exe" -ErrorAction SilentlyContinue
if ($onPath) { $meshroom = $onPath.Source }
if (-not $meshroom) { foreach ($c in $candidates) { if (Test-Path $c) { $meshroom = $c; break } } }
if ($meshroom) {
  Write-Host "Meshroom: $meshroom"
} else {
  Write-Host "Meshroom was NOT found."
  Write-Host "  Download the free AliceVision Meshroom release: https://alicevision.org/#meshroom"
  Write-Host "  Unzip it, then set MESHROOM_BIN in .env to the full path of meshroom_batch.exe."
}

# --- Blender (used to export GLB) ----------------------------------------
$blender = Get-Command "blender.exe" -ErrorAction SilentlyContinue
if (-not $blender -and (Test-Path "C:\Program Files\Blender Foundation")) {
  $blender = Get-ChildItem "C:\Program Files\Blender Foundation" -Recurse -Filter "blender.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
}
if ($blender) {
  Write-Host ("Blender: " + $(if ($blender.Source) { $blender.Source } else { $blender.FullName }))
} else {
  Write-Host "Blender was NOT found. Without it the finished mesh is uploaded as a ZIP instead of a GLB the in-app 3D viewer can open."
  Write-Host "  Free download: https://www.blender.org/download/"
}

Write-Host "Recommended: 16 GB RAM, 20+ GB free disk per job, and an NVIDIA CUDA GPU for full-detail meshes (draft pipeline works without one)."

# --- configuration -------------------------------------------------------
if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env - open it and paste the worker key from Athar: Admin -> 3D processing computer -> Issue worker key."
} else {
  Write-Host ".env already exists and was left untouched."
}

Write-Host ""
Write-Host "Start the worker with:   .venv\Scripts\python.exe athar_worker.py"
