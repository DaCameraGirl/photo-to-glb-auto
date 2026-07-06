from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image
from tsr.system import TSR
from .image_prep import prepare_image


def _slugify(value: str) -> str:
    import re
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "avatar"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Turn a single JPG or PNG into a REAL 3D GLB model automatically."
    )
    parser.add_argument("--input", required=True, help="Source JPG or PNG")
    parser.add_argument("--output", required=True, help="Destination .glb path")
    parser.add_argument("--name", default="Photo Avatar", help="Model name")
    return parser.parse_args()


def _validate_paths(input_path: Path, output_path: Path) -> bool:
    if not input_path.exists():
        print(f"Input image not found: {input_path}", file=sys.stderr)
        return False
    if input_path.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
        print("Input must be a .jpg, .jpeg, or .png file.", file=sys.stderr)
        return False
    if output_path.suffix.lower() != ".glb":
        print("Output path must end with .glb", file=sys.stderr)
        return False
    output_path.parent.mkdir(parents=True, exist_ok=True)
    return True


def _load_model() -> TSR:
    print("Loading TripoSR model (stabilityai/TripoSR)...")
    model = TSR.from_pretrained("stabilityai/TripoSR")
    print("Model loaded.")
    return model


def main() -> int:
    args = parse_args()
    input_path = Path(args.input).expanduser().resolve()
    output_path = Path(args.output).expanduser().resolve()
    name = args.name

    if not _validate_paths(input_path, output_path):
        return 1

    try:
        # 1. Preprocess image for 3D model
        prep_path = output_path.with_suffix(".prep.png")
        prepared = prepare_image(input_path, prep_path)

        # 2. Load model
        model = _load_model()

        # 3. Load prepared image
        img = Image.open(prepared).convert("RGB")

        # 4. Reconstruct 3D mesh
        print(f"Reconstructing 3D mesh for '{name}'...")
        mesh = model.reconstruct(img, has_texture=True)
        print("3D reconstruction complete.")

        # 5. Export GLB
        print(f"Exporting GLB to: {output_path}")
        mesh.export(str(output_path))
        print("GLB export complete.")
    except Exception as exc:
        print(f"Error during 3D generation: {exc}", file=sys.stderr)
        return 1

    print()
    print("=== Photo To GLB Studio ===")
    print(f"Input image:   {input_path}")
    print(f"Character:     {name} (slug: {_slugify(name)})")
    print(f"GLB exported:  {output_path}")
    print("Mode:          REAL 3D reconstruction (TripoSR)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
))

