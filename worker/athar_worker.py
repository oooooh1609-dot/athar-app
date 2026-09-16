#!/usr/bin/env python3
"""
Athar companion worker — self-hosted photogrammetry with Meshroom / AliceVision.

The worker makes only outbound HTTPS calls to your Athar app, so you never open
an inbound port. It authenticates with a scoped, revocable worker key issued by
the administrator in Athar (never the administrator password), claims one job at
a time, downloads that job's photographs with short-lived signed links, runs
Meshroom locally, converts the textured result to GLB, uploads it and reports
progress.

If reconstruction fails, the failure is reported honestly. The worker never
uploads a sample or generated stand-in model.

Usage:
    pip install -r requirements.txt
    cp .env.example .env      # then paste your worker key
    python athar_worker.py
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import zipfile
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()

BASE_URL = (os.environ.get("ATHAR_BASE_URL") or "").rstrip("/")
TOKEN = (os.environ.get("ATHAR_WORKER_TOKEN") or "").strip()
MESHROOM_BIN = os.environ.get("MESHROOM_BIN") or ""
BLENDER_BIN = os.environ.get("BLENDER_BIN") or ""
POLL_SECONDS = int(os.environ.get("POLL_SECONDS") or "10")
WORK_DIR = Path(os.environ.get("WORK_DIR") or (Path(tempfile.gettempdir()) / "athar-worker"))
KEEP_FAILED = (os.environ.get("KEEP_FAILED_JOBS") or "false").lower() == "true"

ENDPOINT = f"{BASE_URL}/api/public/worker"
SESSION = requests.Session()
SESSION.headers.update({"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})

# Meshroom's own pipeline node names, used to report a real stage to the app.
STAGE_PATTERN = re.compile(r"\[(\d+)/(\d+)\]\s+([A-Za-z]+)")


def fail(message: str) -> "None":
    print(f"error: {message}", file=sys.stderr)
    raise SystemExit(1)


def call(payload: dict) -> dict:
    """One authenticated request to the app. Never logs the worker key."""
    res = SESSION.post(ENDPOINT, json=payload, timeout=120)
    if res.status_code == 401:
        fail("the worker key was rejected or revoked. Ask the administrator for a new one.")
    try:
        return res.json()
    except ValueError:
        return {"ok": False, "error": f"unexpected response ({res.status_code})"}


# --------------------------------------------------------------------------- #
# Meshroom detection
# --------------------------------------------------------------------------- #

CANDIDATES = [
    "meshroom_batch",
    "meshroom_batch.exe",
    "/opt/Meshroom/meshroom_batch",
    "/usr/local/bin/meshroom_batch",
    str(Path.home() / "Meshroom" / "meshroom_batch"),
    r"C:\Program Files\Meshroom\meshroom_batch.exe",
    "/Applications/Meshroom.app/Contents/MacOS/meshroom_batch",
]


def find_meshroom() -> str:
    if MESHROOM_BIN:
        if Path(MESHROOM_BIN).exists() or shutil.which(MESHROOM_BIN):
            return MESHROOM_BIN
        fail(f"MESHROOM_BIN is set to '{MESHROOM_BIN}' but no such program was found.")
    for candidate in CANDIDATES:
        found = shutil.which(candidate) or (candidate if Path(candidate).exists() else None)
        if found:
            return found
    fail(
        "Meshroom (meshroom_batch) was not found.\n"
        "  Install Meshroom from https://alicevision.org/#meshroom (free, open source),\n"
        "  then set MESHROOM_BIN in .env to the full path of meshroom_batch.\n"
        "  Hardware: a 64-bit CPU, 16 GB RAM or more, 20+ GB free disk per job.\n"
        "  An NVIDIA CUDA GPU is required for Meshroom's dense depth maps; without one,\n"
        "  use the 'draft' pipeline (PIPELINE=draft) which is CPU-only and lower detail."
    )
    return ""


def meshroom_version(binary: str) -> str:
    try:
        out = subprocess.run(  # noqa: S603 - fixed argument list, no shell
            [binary, "--version"], capture_output=True, text=True, timeout=120
        )
        text = (out.stdout or out.stderr or "").strip().splitlines()
        return text[0][:80] if text else "unknown"
    except Exception:  # noqa: BLE001
        return "unknown"


def find_blender() -> str | None:
    if BLENDER_BIN:
        return BLENDER_BIN if (Path(BLENDER_BIN).exists() or shutil.which(BLENDER_BIN)) else None
    for candidate in [
        "blender",
        "/usr/bin/blender",
        r"C:\Program Files\Blender Foundation\Blender\blender.exe",
        "/Applications/Blender.app/Contents/MacOS/Blender",
    ]:
        found = shutil.which(candidate) or (candidate if Path(candidate).exists() else None)
        if found:
            return found
    return None


# --------------------------------------------------------------------------- #
# job handling
# --------------------------------------------------------------------------- #


class Canceled(Exception):
    pass


class Job:
    def __init__(self, data: dict) -> None:
        self.id: str = data["id"]
        self.photos: list[dict] = data.get("photos") or []
        self.name: str = data.get("projectName") or "athar-object"
        self.attempt: int = data.get("attempt") or 1
        self.canceled = threading.Event()

    def report(self, stage: str | None = None, progress: float | None = None, log: str | None = None) -> None:
        payload: dict = {"action": "progress", "jobId": self.id}
        if stage:
            payload["stage"] = stage[:200]
        if progress is not None:
            payload["progress"] = max(0, min(100, float(progress)))
        if log:
            payload["log"] = log[-20000:]
        res = call(payload)
        if res.get("canceled"):
            self.canceled.set()
            raise Canceled()

    def heartbeat_loop(self) -> None:
        while not self.canceled.is_set():
            time.sleep(20)
            if self.canceled.is_set():
                return
            try:
                res = call({"action": "progress", "jobId": self.id})
                if res.get("canceled"):
                    self.canceled.set()
            except Exception:  # noqa: BLE001 - a lost heartbeat must not kill the job
                pass


def download_photos(job: Job, images_dir: Path) -> int:
    images_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for index, photo in enumerate(job.photos, start=1):
        name = re.sub(r"[^A-Za-z0-9._-]", "_", photo.get("name") or f"{index:03d}.jpg")
        target = images_dir / name
        with requests.get(photo["url"], stream=True, timeout=300) as res:
            res.raise_for_status()
            with open(target, "wb") as handle:
                for chunk in res.iter_content(chunk_size=1 << 20):
                    handle.write(chunk)
        count += 1
        job.report(stage=f"Downloading photographs ({count}/{len(job.photos)})", progress=2 + 6 * count / max(1, len(job.photos)))
    return count


def run_meshroom(job: Job, binary: str, images_dir: Path, out_dir: Path, cache_dir: Path) -> str:
    out_dir.mkdir(parents=True, exist_ok=True)
    cache_dir.mkdir(parents=True, exist_ok=True)
    args = [
        binary,
        "--input",
        str(images_dir),
        "--output",
        str(out_dir),
        "--cache",
        str(cache_dir),
    ]
    pipeline = os.environ.get("PIPELINE")
    if pipeline:
        args += ["--pipeline", pipeline]

    # Fixed argument list, no shell interpolation.
    process = subprocess.Popen(  # noqa: S603
        args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1
    )
    tail: list[str] = []
    assert process.stdout is not None
    for line in process.stdout:
        tail.append(line.rstrip())
        tail = tail[-200:]
        match = STAGE_PATTERN.search(line)
        if match:
            done, total, node = int(match.group(1)), int(match.group(2)), match.group(3)
            progress = 10 + 80 * (done / max(1, total))
            try:
                job.report(stage=f"Meshroom: {node} ({done}/{total})", progress=progress)
            except Canceled:
                process.terminate()
                raise
        if job.canceled.is_set():
            process.terminate()
            raise Canceled()
    code = process.wait()
    log = "\n".join(tail)
    if code != 0:
        raise RuntimeError(f"Meshroom exited with code {code}.\n{log[-2000:]}")
    return log


def find_textured_mesh(out_dir: Path, cache_dir: Path) -> Path | None:
    for root in (out_dir, cache_dir):
        matches = sorted(root.rglob("texturedMesh.obj")) + sorted(root.rglob("*.obj"))
        if matches:
            return matches[0]
    return None


def convert_to_glb(job: Job, obj_path: Path, work: Path) -> Path | None:
    """Meshroom exports OBJ+MTL+textures; Blender converts it to GLB with textures."""
    blender = find_blender()
    if not blender:
        return None
    glb_path = work / "model.glb"
    script = work / "to_glb.py"
    script.write_text(
        "import bpy, sys\n"
        "obj, out = sys.argv[-2], sys.argv[-1]\n"
        "bpy.ops.wm.read_factory_settings(use_empty=True)\n"
        "try:\n"
        "    bpy.ops.wm.obj_import(filepath=obj)\n"
        "except AttributeError:\n"
        "    bpy.ops.import_scene.obj(filepath=obj)\n"
        "bpy.ops.export_scene.gltf(filepath=out, export_format='GLB')\n",
        encoding="utf-8",
    )
    job.report(stage="Converting the textured mesh to GLB", progress=92)
    result = subprocess.run(  # noqa: S603 - fixed argument list, no shell
        [blender, "-b", "--factory-startup", "-P", str(script), "--", str(obj_path), str(glb_path)],
        capture_output=True,
        text=True,
        timeout=3600,
    )
    if result.returncode != 0 or not glb_path.exists():
        print(result.stdout[-2000:], file=sys.stderr)
        return None
    return glb_path


def obj_to_glb(job: Job, obj_path: Path, work: Path) -> Path | None:
    """Pure-Python OBJ -> GLB, used when Blender is not installed.

    Reads the mesh Meshroom actually produced (vertices, texture coordinates,
    triangles) plus the first diffuse texture named in the MTL, and writes a
    minimal glTF binary. Nothing is generated or smoothed: unmapped or missing
    data is simply left out.
    """
    import base64  # noqa: F401 - kept local; only this function needs it
    import json
    import struct

    positions: list[tuple[float, float, float]] = []
    uvs: list[tuple[float, float]] = []
    faces: list[tuple[int, int]] = []  # (position index, uv index) pairs, triangulated
    mtl_name: str | None = None
    try:
        with open(obj_path, "r", encoding="utf-8", errors="replace") as handle:
            for raw in handle:
                if raw.startswith("v "):
                    x, y, z = raw.split()[1:4]
                    positions.append((float(x), float(y), float(z)))
                elif raw.startswith("vt "):
                    parts = raw.split()
                    uvs.append((float(parts[1]), float(parts[2])))
                elif raw.startswith("mtllib "):
                    mtl_name = raw.split(maxsplit=1)[1].strip()
                elif raw.startswith("f "):
                    corners = []
                    for token in raw.split()[1:]:
                        bits = token.split("/")
                        vi = int(bits[0])
                        ti = int(bits[1]) if len(bits) > 1 and bits[1] else 0
                        corners.append((vi, ti))
                    for i in range(1, len(corners) - 1):
                        faces.extend([corners[0], corners[i], corners[i + 1]])
    except OSError:
        return None
    if not positions or not faces:
        return None

    texture_file: Path | None = None
    if mtl_name:
        mtl_path = obj_path.parent / mtl_name
        if mtl_path.exists():
            for raw in mtl_path.read_text(encoding="utf-8", errors="replace").splitlines():
                if raw.strip().lower().startswith("map_kd"):
                    candidate = obj_path.parent / raw.split(maxsplit=1)[1].strip()
                    if candidate.exists() and candidate.suffix.lower() in {".png", ".jpg", ".jpeg"}:
                        texture_file = candidate
                    break

    has_uv = bool(uvs) and texture_file is not None
    order: dict[tuple[int, int], int] = {}
    out_pos: list[tuple[float, float, float]] = []
    out_uv: list[tuple[float, float]] = []
    indices: list[int] = []
    for vi, ti in faces:
        key = (vi, ti if has_uv else 0)
        idx = order.get(key)
        if idx is None:
            p = positions[vi - 1 if vi > 0 else len(positions) + vi]
            idx = len(out_pos)
            order[key] = idx
            out_pos.append(p)
            if has_uv:
                if ti:
                    u, v = uvs[ti - 1 if ti > 0 else len(uvs) + ti]
                else:
                    u, v = (0.0, 0.0)
                out_uv.append((u, 1.0 - v))  # glTF UV origin is top-left
        indices.append(idx)

    def pad(data: bytes) -> bytes:
        return data + b"\x00" * (-len(data) % 4)

    pos_bytes = pad(b"".join(struct.pack("<3f", *p) for p in out_pos))
    uv_bytes = pad(b"".join(struct.pack("<2f", *p) for p in out_uv)) if has_uv else b""
    idx_bytes = pad(struct.pack(f"<{len(indices)}I", *indices))
    img_bytes = pad(texture_file.read_bytes()) if texture_file else b""
    binary = pos_bytes + uv_bytes + idx_bytes + img_bytes

    views = [
        {"buffer": 0, "byteOffset": 0, "byteLength": len(pos_bytes)},
    ]
    offset = len(pos_bytes)
    uv_view = None
    if has_uv:
        uv_view = len(views)
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(uv_bytes)})
        offset += len(uv_bytes)
    idx_view = len(views)
    views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(idx_bytes)})
    offset += len(idx_bytes)
    img_view = None
    if texture_file:
        img_view = len(views)
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(img_bytes)})

    xs = [p[0] for p in out_pos]
    ys = [p[1] for p in out_pos]
    zs = [p[2] for p in out_pos]
    accessors = [
        {
            "bufferView": 0,
            "componentType": 5126,
            "count": len(out_pos),
            "type": "VEC3",
            "min": [min(xs), min(ys), min(zs)],
            "max": [max(xs), max(ys), max(zs)],
        }
    ]
    attributes = {"POSITION": 0}
    if has_uv and uv_view is not None:
        attributes["TEXCOORD_0"] = len(accessors)
        accessors.append(
            {"bufferView": uv_view, "componentType": 5126, "count": len(out_uv), "type": "VEC2"}
        )
    idx_accessor = len(accessors)
    accessors.append(
        {"bufferView": idx_view, "componentType": 5125, "count": len(indices), "type": "SCALAR"}
    )

    material: dict = {"pbrMetallicRoughness": {"metallicFactor": 0.0, "roughnessFactor": 0.9}}
    gltf: dict = {
        "asset": {"version": "2.0", "generator": "athar-worker obj2glb"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}],
        "meshes": [
            {"primitives": [{"attributes": attributes, "indices": idx_accessor, "material": 0}]}
        ],
        "materials": [material],
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": len(binary)}],
    }
    if texture_file and img_view is not None and has_uv:
        mime = "image/png" if texture_file.suffix.lower() == ".png" else "image/jpeg"
        gltf["images"] = [{"bufferView": img_view, "mimeType": mime}]
        gltf["samplers"] = [{}]
        gltf["textures"] = [{"sampler": 0, "source": 0}]
        material["pbrMetallicRoughness"]["baseColorTexture"] = {"index": 0}

    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    json_bytes += b" " * (-len(json_bytes) % 4)
    glb_path = work / "model.glb"
    total = 12 + 8 + len(json_bytes) + 8 + len(binary)
    with open(glb_path, "wb") as out:
        out.write(struct.pack("<III", 0x46546C67, 2, total))
        out.write(struct.pack("<II", len(json_bytes), 0x4E4F534A))
        out.write(json_bytes)
        out.write(struct.pack("<II", len(binary), 0x004E4942))
        out.write(binary)
    job.report(stage="Converted the mesh to GLB without Blender", progress=94)
    return glb_path


def zip_obj_bundle(obj_path: Path, work: Path) -> Path:
    bundle = work / "model.zip"
    folder = obj_path.parent
    with zipfile.ZipFile(bundle, "w", zipfile.ZIP_DEFLATED) as archive:
        for item in folder.rglob("*"):
            if item.is_file() and item.suffix.lower() in {".obj", ".mtl", ".png", ".jpg", ".jpeg", ".exr"}:
                archive.write(item, item.relative_to(folder))
    return bundle


def upload(job: Job, path: Path, ext: str) -> str:
    ticket = call({"action": "upload-url", "jobId": job.id, "ext": ext})
    if not ticket.get("ok"):
        raise RuntimeError(ticket.get("error") or "no upload ticket was issued")
    content_type = "model/gltf-binary" if ext == "glb" else "application/zip"
    with open(path, "rb") as handle:
        res = requests.put(
            ticket["uploadUrl"],
            data=handle,
            headers={"Content-Type": content_type, "x-upsert": "true"},
            timeout=3600,
        )
    if res.status_code >= 300:
        raise RuntimeError(f"upload failed ({res.status_code}) {res.text[:200]}")
    return ticket["path"]


def process(job: Job, binary: str) -> None:
    work = WORK_DIR / job.id
    heartbeat = threading.Thread(target=job.heartbeat_loop, daemon=True)
    heartbeat.start()
    try:
        shutil.rmtree(work, ignore_errors=True)
        images_dir, out_dir, cache_dir = work / "images", work / "out", work / "cache"
        job.report(stage="Preparing the job", progress=1)
        downloaded = download_photos(job, images_dir)
        if downloaded < 2:
            raise RuntimeError("fewer than two photographs could be downloaded")

        log = run_meshroom(job, binary, images_dir, out_dir, cache_dir)
        obj_path = find_textured_mesh(out_dir, cache_dir)
        if not obj_path:
            raise RuntimeError("Meshroom finished but produced no textured mesh")

        glb = convert_to_glb(job, obj_path, work)
        if not glb:
            # No Blender on this computer: convert the mesh here so the app can
            # still display it, instead of only offering a ZIP download.
            glb = obj_to_glb(job, obj_path, work)
        formats: dict[str, str] = {}
        if glb:
            model_path = upload(job, glb, "glb")
            bundle_path = upload(job, zip_obj_bundle(obj_path, work), "zip")
            formats["obj+textures (zip)"] = bundle_path
        else:
            job.report(
                stage="The mesh could not be converted to GLB — uploading the OBJ bundle",
                progress=94,
            )
            model_path = upload(job, zip_obj_bundle(obj_path, work), "zip")

        job.report(stage="Uploading finished model", progress=98)
        call(
            {
                "action": "complete",
                "jobId": job.id,
                "modelPath": model_path,
                "formats": formats,
                "log": log[-8000:],
            }
        )
        print(f"job {job.id}: completed")
        shutil.rmtree(work, ignore_errors=True)
    except Canceled:
        print(f"job {job.id}: canceled by the owner")
        shutil.rmtree(work, ignore_errors=True)
    except Exception as exc:  # noqa: BLE001
        message = str(exc)[:900] or "reconstruction failed"
        retry = job.attempt < 3 and not isinstance(exc, RuntimeError)
        call({"action": "fail", "jobId": job.id, "error": message, "retry": retry})
        print(f"job {job.id}: failed — {message}", file=sys.stderr)
        if not KEEP_FAILED:
            shutil.rmtree(work, ignore_errors=True)
    finally:
        job.canceled.set()


def main() -> None:
    if not BASE_URL or not TOKEN:
        fail("set ATHAR_BASE_URL and ATHAR_WORKER_TOKEN in .env first.")
    binary = find_meshroom()
    version = meshroom_version(binary)
    WORK_DIR.mkdir(parents=True, exist_ok=True)

    hello = call({"action": "hello", "host": os.uname().nodename if hasattr(os, "uname") else os.environ.get("COMPUTERNAME", "windows"), "meshroomVersion": version})
    if not hello.get("ok"):
        fail(hello.get("error") or "the app rejected this worker")
    print(f"connected as '{hello.get('label')}' · Meshroom: {version}")
    print(f"working directory: {WORK_DIR}")
    print("waiting for reconstruction jobs — press Ctrl+C to stop")

    while True:
        try:
            res = call({"action": "claim"})
            data = res.get("job")
            if data:
                print(f"claimed job {data['id']} ({len(data.get('photos') or [])} photographs)")
                process(Job(data), binary)
                continue
        except SystemExit:
            raise
        except Exception as exc:  # noqa: BLE001 - keep polling through network blips
            print(f"poll error: {exc}", file=sys.stderr)
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nstopped")
