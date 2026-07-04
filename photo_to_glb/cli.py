from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from .image_prep import build_face_texture


ROOT = Path(__file__).resolve().parents[1]
BLENDER_SCRIPT = ROOT / "scripts" / "build_avatar_blender.py"
DEFAULT_BLENDER = Path(r"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe")


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "avatar"


def _default_run_dir(name: str) -> Path:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return ROOT / "runs" / f"{stamp}_{_slugify(name)}"


def _resolve_blender(explicit: str | None) -> Path:
    if explicit:
        candidate = Path(explicit)
        if candidate.exists():
            return candidate
        raise FileNotFoundError(f"Blender not found at {candidate}")

    env_value = os.getenv("BLENDER_EXE")
    if env_value:
        candidate = Path(env_value)
        if candidate.exists():
            return candidate

    if DEFAULT_BLENDER.exists():
        return DEFAULT_BLENDER

    raise FileNotFoundError(
        "Blender executable not found. Set BLENDER_EXE or pass --blender-exe."
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Turn a single JPG or PNG into a stylized GLB avatar automatically."
    )
    parser.add_argument("--input", required=True, help="Source JPG or PNG")
    parser.add_argument("--output", required=True, help="Destination .glb path")
    parser.add_argument("--name", default="Photo Avatar", help="Character name")
    parser.add_argument(
        "--work-dir",
        help="Optional folder for intermediate files like the cropped texture and .blend",
    )
    parser.add_argument("--blender-exe", help="Optional path to blender.exe")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    input_path = Path(args.input).expanduser().resolve()
    output_path = Path(args.output).expanduser().resolve()

    if not input_path.exists():
        print(f"Input image not found: {input_path}", file=sys.stderr)
        return 1
    if input_path.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
        print("Input must be a .jpg, .jpeg, or .png file.", file=sys.stderr)
        return 1
    if output_path.suffix.lower() != ".glb":
        print("Output path must end with .glb", file=sys.stderr)
        return 1

    blender_exe = _resolve_blender(args.blender_exe)
    work_dir = Path(args.work_dir).expanduser().resolve() if args.work_dir else _default_run_dir(args.name)
    work_dir.mkdir(parents=True, exist_ok=True)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    face_texture_path = work_dir / "face_texture.png"
    blend_path = work_dir / f"{_slugify(args.name)}.blend"
    build_face_texture(input_path, face_texture_path)

    command = [
        str(blender_exe),
        "--background",
        "--python",
        str(BLENDER_SCRIPT),
        "--",
        "--face-texture",
        str(face_texture_path),
        "--output-glb",
        str(output_path),
        "--output-blend",
        str(blend_path),
        "--character-name",
        args.name,
    ]

    result = subprocess.run(command, check=False)
    if result.returncode != 0:
        print("Blender export failed.", file=sys.stderr)
        return result.returncode

    print(f"Input image:   {input_path}")
    print(f"Face texture:  {face_texture_path}")
    print(f"Blend file:    {blend_path}")
    print(f"GLB exported:  {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
