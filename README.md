<div align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&height=220&color=0:06131F,38:0B2330,72:184054,100:DB7E4A&text=Photo%20To%20GLB%20Studio&fontColor=F4F7F9&fontAlignY=38&desc=Automatic%20portrait%20to%20stylized%203D%20avatar%20pipeline&descAlignY=60&descColor=D7E5EC" alt="Photo To GLB Studio banner" />
</div>

<p align="center">
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=700&size=18&pause=1100&color=F0F4F6&center=true&vCenter=true&width=960&lines=Drop+in+a+single+JPG+or+PNG.;Build+a+face+texture+automatically.;Run+Blender+headless.;Export+a+ready-made+GLB." alt="Animated summary" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/JPG%20%2F%20PNG-06131F?style=for-the-badge&labelColor=DB7E4A&color=06131F" alt="JPG PNG" />
  <img src="https://img.shields.io/badge/Face%20Texture-0B2330?style=for-the-badge&labelColor=FFB36A&color=0B2330" alt="Face Texture" />
  <img src="https://img.shields.io/badge/Blender-102D3C?style=for-the-badge&labelColor=DB7E4A&color=102D3C" alt="Blender" />
  <img src="https://img.shields.io/badge/GLB-184054?style=for-the-badge&labelColor=FFB36A&color=184054" alt="GLB" />
</p>

## What It Is

`Photo To GLB Studio` turns a single `.jpg` or `.png` into a stylized `.glb` avatar automatically.

The visual language of the app is built around one thick studio bar:

- `JPG / PNG`
- `FACE TEXTURE`
- `BLENDER`
- `GLB`

That same sequence drives both the UI and this README.

## What It Does

- accepts one portrait image
- crops and normalizes a face texture automatically
- runs Blender in background mode
- projects the face texture onto a generated avatar head
- exports a `.glb` and keeps the `.blend` source for inspection

## Important Truth

This repo does **not** claim to reconstruct a perfect real-world 3D scan from one photo.

From a single image, the reliable automatic result is:

- photo-informed face texture
- stylized procedural body and head geometry
- zero manual Blender editing required

## Local Studio UI

Run the browser app:

```powershell
.\run-ui.ps1
```

Then open:

```text
http://127.0.0.1:8787
```

The UI gives you:

- drag and drop upload
- animated pipeline status
- conversion logs
- download links for the `.glb`, face texture, and `.blend`

## CLI Usage

Install dependencies:

```powershell
py -3.11 -m pip install -r requirements.txt
```

Run the CLI directly:

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

## Requirements

- Windows
- Python `3.11`
- Blender `5.1`
- Blender at `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe`

If Blender is somewhere else, pass `--blender-exe` or set `BLENDER_EXE`.

## Repo Layout

```text
photo_to_glb/
  app.py
  cli.py
  image_prep.py
scripts/
  build_avatar_blender.py
ui/
  index.html
  styles.css
  app.js
runs/
```

## Output

Every run keeps artifacts under `runs/`:

- uploaded source image
- `work/face_texture.png`
- `work/<name>.blend`
- final `<name>.glb`

## Current Limitation

The body is still procedural and stylized. The current likeness comes mostly from the photo projection, not custom reconstructed geometry.
