# Athar 3D processing worker (self-hosted Meshroom / AliceVision)

This runs reconstruction on **your own computer**. There is no paid
reconstruction API and no licence fee — Meshroom, AliceVision and Blender are
free and open source. You do pay for your own electricity, internet connection,
disk space, and whatever hosting your Athar app already uses.

The worker only makes **outbound HTTPS** requests to your Athar app, so you do
not open any inbound port and you do not need a fixed IP address.

## 1. What to install

| Software                   | Why                                                              | Notes                                                                                                                                           |
| -------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Meshroom** (AliceVision) | the reconstruction itself                                        | Download from <https://alicevision.org/#meshroom>. Free, open source.                                                                           |
| **Python 3.10+**           | runs this worker                                                 | <https://python.org>                                                                                                                            |
| **Blender 3.6+**           | converts Meshroom's textured OBJ to GLB for the in-app 3D viewer | <https://blender.org>. Optional; without it the worker uploads an OBJ + textures ZIP instead of a GLB, and the in-app viewer cannot display it. |

### Hardware

- 64-bit CPU, **16 GB RAM minimum** (32 GB for large photo sets).
- **20+ GB free disk per job** for temporary files.
- **NVIDIA GPU with CUDA** for the default pipeline (dense depth maps).
  Without one, set `PIPELINE=draft` in `.env` — it runs on CPU only and gives a
  lower-detail mesh. AMD/Apple GPUs are not supported by AliceVision's CUDA
  depth-map step.

## 2. Get a worker key

In Athar, sign in as administrator, open the admin page, find
**“3D processing computer (self-hosted Meshroom)”**, enter a name for this
computer and choose **Issue worker key**. The key is shown once. It is scoped to
the worker endpoints only, it is not the administrator password, and it can be
revoked at any time — a revoked key stops claiming jobs on its next request.

## 3. Set the worker up

```bash
unzip athar-worker.zip
cd athar-worker
python -m pip install -r requirements.txt
cp .env.example .env        # Windows: copy .env.example .env
# paste ATHAR_WORKER_TOKEN and, if auto-detection fails, MESHROOM_BIN
python athar_worker.py
```

On start it prints the detected Meshroom version and the name the administrator
gave this computer. If Meshroom is not found it tells you exactly what to
install and which variable to set.

## 4. What it does per job

1. Claims **one** job at a time. Claims are atomic in the app's database, so two
   workers can never take the same job.
2. Downloads the job's photographs with short-lived signed links.
3. Runs `meshroom_batch --input <photos> --output <out> --cache <cache>`
   (fixed argument list, no shell interpolation) and reports the real Meshroom
   node names and step counts as processing stages.
4. Converts `texturedMesh.obj` to **GLB** with Blender, preserving geometry and
   textures, and also uploads the OBJ + textures bundle.
5. Uploads the result with a one-time signed upload link and marks the job
   completed.

Interruptions, retries and cancellation are handled: heartbeats keep the claim
alive, a job whose worker stops responding is returned to the queue (up to 3
attempts, then reported failed), cancelling in the app stops the local run, and
temporary files are cleaned up. A failed reconstruction is reported as failed —
**no sample or generated model is ever substituted.**

## 5. Keeping it running

- Leave the terminal open, or run it as a service (`systemd`, Windows Task
  Scheduler with “run whether user is logged on or not”, or `launchd`).
- While the worker is not running, jobs stay queued and the app shows
  “Processing computer offline”.
- The key lives only in `.env` on this computer. It never appears in the app's
  frontend code or in logs.

## Quick install (recommended)

The ZIP contains an installer that checks your machine and prepares the worker.

**Windows** — right-click `install.ps1` → _Run with PowerShell_, or in PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

**Linux / macOS**:

```bash
chmod +x install.sh && ./install.sh
```

The installer:

1. checks for Python 3.10+ and stops with a download link if it is missing;
2. creates a local `.venv` and installs `requirements.txt` into it;
3. looks for Meshroom (`meshroom_batch`) and Blender and prints the official free
   download pages if either is missing — it never downloads or installs them for you;
4. prints the recommended hardware (16 GB RAM, 20+ GB free disk per job, NVIDIA CUDA
   GPU for full detail; the `draft` pipeline works without a GPU);
5. copies `.env.example` to `.env` for you to paste the worker key into.

Then set `ATHAR_BASE_URL` and `ATHAR_WORKER_TOKEN` in `.env` (both are shown on the
app's Admin → _3D processing computer_ panel) and start the worker:

```bash
. .venv/bin/activate && python athar_worker.py     # Windows: .venv\Scripts\python.exe athar_worker.py
```

The worker only makes outbound HTTPS calls to your Athar app, so no inbound port
needs to be opened.
