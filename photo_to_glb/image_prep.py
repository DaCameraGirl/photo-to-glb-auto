from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageOps


TARGET_SIZE = (1024, 1280)


def _portrait_crop_box(width: int, height: int, target_ratio: float) -> tuple[int, int, int, int]:
    source_ratio = width / height
    if source_ratio > target_ratio:
        crop_height = height
        crop_width = int(height * target_ratio)
    else:
        crop_width = width
        crop_height = int(width / target_ratio)

    left = max(0, (width - crop_width) // 2)
    # Bias upward so the face lands closer to the center of the avatar head.
    top = max(0, min(height - crop_height, int(height * 0.12)))
    if height > crop_height:
        centered_top = (height - crop_height) // 2
        top = min(top, centered_top)
    return (left, top, left + crop_width, top + crop_height)


def build_face_texture(input_path: Path, output_path: Path) -> Path:
    image = Image.open(input_path)
    image = ImageOps.exif_transpose(image).convert("RGB")

    crop_box = _portrait_crop_box(
        width=image.width,
        height=image.height,
        target_ratio=TARGET_SIZE[0] / TARGET_SIZE[1],
    )
    face = image.crop(crop_box).resize(TARGET_SIZE, Image.Resampling.LANCZOS)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    face.save(output_path, format="PNG", optimize=True)
    return output_path

