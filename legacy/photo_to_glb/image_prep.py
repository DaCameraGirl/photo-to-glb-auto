from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageOps
import numpy as np

try:
    import rembg
    REMBG_AVAILABLE = True
except ImportError:
    REMBG_AVAILABLE = False


TARGET_SIZE = 1024  # square input for 3D model


def remove_background(img: Image.Image) -> Image.Image:
    if not REMBG_AVAILABLE:
        return img
    print("Removing background...")
    return rembg.remove(img)


def center_subject(img: Image.Image) -> Image.Image:
    arr = np.array(img)
    alpha = arr[..., 3] if arr.shape[-1] == 4 else None
    if alpha is None:
        return img

    ys, xs = np.where(alpha > 10)
    if len(xs) == 0 or len(ys) == 0:
        return img

    left, right = xs.min(), xs.max()
    top, bottom = ys.min(), ys.max()
    return img.crop((left, top, right, bottom))


def resize_for_model(img: Image.Image) -> Image.Image:
    print("Resizing image for 3D model input...")
    img = ImageOps.exif_transpose(img).convert("RGB")
    img.thumbnail((TARGET_SIZE, TARGET_SIZE), Image.Resampling.LANCZOS)

    w, h = img.size
    size = max(w, h)
    square = Image.new("RGB", (size, size), (255, 255, 255))
    square.paste(img, ((size - w) // 2, (size - h) // 2))
    return square


def prepare_image(input_path: Path, output_path: Path) -> Path:
    print(f"Preparing image: {input_path}")
    img = Image.open(input_path)

    img = remove_background(img)
    img = center_subject(img)
    img = resize_for_model(img)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path, format="PNG", optimize=True)
    print(f"Prepared image saved to: {output_path}")
    return output_path



