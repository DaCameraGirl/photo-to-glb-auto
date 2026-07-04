# Photo To GLB Auto

Turn a single `.jpg` or `.png` into a `.glb` automatically.

This repo is built for the practical version of the problem:

- input: one photo
- output: one stylized 3D avatar `.glb`
- no manual Blender editing

It does **not** claim to reconstruct a perfect real 3D human scan from one image. From a single photo, that would be an approximation. This pipeline makes a clean automatic avatar by:

1. cropping the photo into a face texture
2. building a character in headless Blender
3. projecting the face onto the avatar head
4. exporting a `.glb`

## Requirements

- Windows
- Python `3.11`
- Blender `5.1` installed at:
  `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe`

If Blender lives somewhere else, pass `--blender-exe` or set `BLENDER_EXE`.

## Install

```powershell
py -3.11 -m pip install -r requirements.txt
```

## Usage

```powershell
py -3.11 -m photo_to_glb.cli `
  --input "C:\path\to\photo.png" `
  --output "C:\path\to\avatar.glb" `
  --name "Chase"
```

Or use the wrapper:

```powershell
.\convert.ps1 -InputPath "C:\path\to\photo.png" -OutputPath "C:\path\to\avatar.glb" -Name "Chase"
```

## Output

Each run also writes intermediates under `runs/`:

- `face_texture.png`
- `<name>.blend`

That keeps the workflow debuggable without requiring manual editing.

## Repo Layout

```text
photo_to_glb/
  cli.py
  image_prep.py
scripts/
  build_avatar_blender.py
runs/
```

## Current Limitation

The avatar body is procedural and stylized. The photo primarily drives the face texture, not a full geometry reconstruction. That keeps the pipeline automatic and reliable.
