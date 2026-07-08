<div align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&height=220&color=0:06131F,38:0B2330,72:184054,100:DB7E4A&text=Photo%20Melt%20Studio&fontColor=F4F7F9&fontAlignY=38&desc=JPG%20%2F%20PNG%20melts%20onto%20a%203D%20avatar%20%E2%80%94%20fully%20in%20your%20browser&descAlignY=60&descColor=D7E5EC" alt="Photo Melt Studio banner" />
</div>

<p align="center">
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=700&size=18&pause=1100&color=F0F4F6&center=true&vCenter=true&width=960&lines=Drop+in+a+JPG+or+PNG.;Tune+11+camera-style+sliders+live.;Watch+your+photo+melt+onto+a+3D+avatar.;Mutation+Madness+%F0%9F%8E%B2+randomizes+everything.;Export+a+ready-made+.glb." alt="Animated summary" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/JPG%20%2F%20PNG-06131F?style=for-the-badge&labelColor=DB7E4A&color=06131F" alt="JPG PNG" />
  <img src="https://img.shields.io/badge/Face%20Texture-0B2330?style=for-the-badge&labelColor=FFB36A&color=0B2330" alt="Face Texture" />
  <img src="https://img.shields.io/badge/Three.js-102D3C?style=for-the-badge&labelColor=DB7E4A&color=102D3C" alt="Three.js" />
  <img src="https://img.shields.io/badge/GLB-184054?style=for-the-badge&labelColor=FFB36A&color=184054" alt="GLB" />
  <img src="https://img.shields.io/badge/No%20Blender%20Required-27AE60?style=for-the-badge" alt="No Blender" />
</p>

## 🫠 Live Studio

**https://dacameragirl.github.io/photo-to-glb-auto/**

Fully browser-based. No installs. No server. No Blender.

---

## What It Is

**Photo Melt Studio v2** turns any JPG or PNG portrait into a stylized 3D avatar — entirely in your browser.

Your photo "melts" onto the avatar's face in real time, with 11 camera-style image controls, live Three.js preview, and a chaotic "Mutation Madness" randomizer for avatar features.

## What It Does

- Accepts any JPG / PNG portrait
- 11 real-time camera controls: brightness, contrast, saturation, exposure, temperature, tint, highlights, shadows, sharpness, vignette, grain — all via Canvas API, 100% client-side
- Live Three.js preview — your photo melts onto the avatar face instantly
- Mutation Madness 🎲 — randomize body proportions, skin tone, eye color, hair, outfit, and accessories in one click
- Manual avatar sculpting — head size, body width/height, limb thickness, all colors, 5 accessories
- Export standard `.glb` — works in Blender, Unity, Godot, Spline, WebXR, anywhere GLB is supported
- Zero backend. Zero uploads. Your photo never leaves your device.

## Tech Stack

- React + TypeScript + Vite
- Three.js + @react-three/fiber + drei
- Canvas API (image processing)
- GLTFExporter (GLB export)
- GitHub Pages (static deploy)

## Local Development

```bash
npm install
npm run dev
```

Open http://localhost:5173

Build:

```bash
npm run build
```

Output goes to `dist/`.

## Guided UI

The studio uses a verbose, beginner-friendly, step-by-step guided interface inspired by [Bettin2Win](https://github.com/DaCameraGirl/Bettin2Win) — collapsible explainer sections everywhere, plain-English labels, no jargon left unexplained. Every slider tells you what it does.

Four steps:

1. **📷 Upload** — Drag & drop a JPG/PNG
2. **🎨 Tune Image** — 11 camera-style controls, real-time
3. **🫠 Melt & Mutate** — Live 3D preview, Mutation Madness, manual sculpting
4. **⬇️ Export GLB** — One-click download

## Privacy

Everything runs 100% client-side. No server, no uploads, no tracking. Your photo stays on your machine.

## Legacy Blender Pipeline

The original Python + Blender headless pipeline is archived in `/legacy/`.

That version required:
- Windows
- Python 3.11
- Blender 5.1

If you want the old desktop pipeline with `.blend` output, check the `legacy/` folder.

## License

MIT
