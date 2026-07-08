import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment } from '@react-three/drei'
import { MeltAvatar } from './Avatar'
import { processImage } from './imageProcess'
import { exportGLB } from './exportGLB'
import { DEFAULT_ADJUSTMENTS, DEFAULT_AVATAR, ImageAdjustments, AvatarParams, SKIN_TONES, ACCESSORIES } from './types'

type Step = 1 | 2 | 3 | 4

const ADJUSTMENT_CONTROLS: [keyof ImageAdjustments, string, string, number, number][] = [
  ['brightness', '☀️ Brightness', 'Makes the whole photo lighter or darker. Think of it like turning a lamp up or down.', -100, 100],
  ['contrast', '⚡ Contrast', 'Difference between bright and dark areas. High = punchy, dramatic. Low = soft, flat.', -100, 100],
  ['saturation', '🎨 Saturation', 'How intense the colors are. High = vibrant. Low = grayscale.', -100, 100],
  ['exposure', '📷 Exposure', 'Camera-style brightness. Affects the overall light captured, like a camera shutter.', -100, 100],
  ['temperature', '🌡️ Temperature', 'Warm (orange) vs cool (blue). Slide right for golden sunset, left for icy blue.', -100, 100],
  ['tint', '🟢 Tint', 'Green vs magenta shift. Fixes skin tones that look too green or too pink.', -100, 100],
  ['highlights', '✨ Highlights', 'Controls only the brightest parts of the image. Recover blown-out skies.', -100, 100],
  ['shadows', '🌑 Shadows', 'Controls only the darkest parts. Lift shadows to reveal hidden detail.', -100, 100],
  ['sharpness', '🔍 Sharpness', 'Edge detail enhancement. Makes the photo crisper and more defined.', 0, 200],
  ['vignette', '🕳️ Vignette', 'Darkens the edges of the photo, drawing focus to the center.', 0, 100],
  ['grain', '🎞️ Grain', 'Film-style noise. Adds a gritty, analog texture for character.', 0, 100],
]

function randomAvatar(_base: AvatarParams): AvatarParams {
  const cols = ['#184054', '#c0392b', '#27ae60', '#8e44ad', '#e67e22', '#2c3e50', '#e91e63', '#00bcd4', '#ffaa00']
  return {
    headScale: 0.82 + Math.random() * 0.42,
    bodyWidth: 0.78 + Math.random() * 0.55,
    bodyHeight: 0.82 + Math.random() * 0.45,
    limbGirth: 0.72 + Math.random() * 0.65,
    skinColor: SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)]!,
    eyeColor: ['#3a2a1a', '#5b3c1a', '#1a5b3a', '#2a4a8a', '#6a3a5a'][Math.floor(Math.random() * 5)]!,
    hairColor: ['#2b1810', '#1a0f08', '#aa6733', '#1a1a1a', '#c0392b', '#e67e22', '#8e44ad', '#00bcd4'][Math.floor(Math.random() * 8)]!,
    outfitColor: cols[Math.floor(Math.random() * cols.length)]!,
    accessory: ACCESSORIES[Math.floor(Math.random() * ACCESSORIES.length)]!,
  }
}

export default function App() {
  const [step, setStep] = useState<Step>(1)
  const [rawImage, setRawImage] = useState<string | null>(null)
  const [adj, setAdj] = useState<ImageAdjustments>({ ...DEFAULT_ADJUSTMENTS })
  const [processedImage, setProcessedImage] = useState<string | null>(null)
  const [avatar, setAvatar] = useState<AvatarParams>({ ...DEFAULT_AVATAR })
  const [isProcessing, setIsProcessing] = useState(false)
  const [exporting, setExporting] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Debounced image processing
  useEffect(() => {
    if (!rawImage) { setProcessedImage(null); return }
    setIsProcessing(true)
    const t = setTimeout(async () => {
      try {
        const out = await processImage(rawImage, adj)
        setProcessedImage(out)
      } catch (e) {
        console.error(e)
      } finally {
        setIsProcessing(false)
      }
    }, 80)
    return () => clearTimeout(t)
  }, [rawImage, adj])

  const handleFile = (file: File) => {
    const r = new FileReader()
    r.onload = () => setRawImage(r.result as string)
    r.readAsDataURL(file)
    setStep(2)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f && f.type.startsWith('image/')) handleFile(f)
  }

  const doExport = async () => {
    setExporting(true)
    try {
      const blob = await exportGLB(avatar, processedImage)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'melt-avatar.glb'
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) {
      console.error(e)
      alert('Export failed: ' + e)
    } finally {
      setExporting(false)
    }
  }

  const canAdvance = useMemo(() => ({
    s1: !!rawImage,
    s2: !!processedImage,
    s3: true,
    s4: true,
  }), [rawImage, processedImage])

  return (
    <div className="app-root">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">🫠</span>
          <div>
            <h1>Photo Melt Studio</h1>
            <p className="brand-tagline">JPG / PNG melts onto a 3D avatar — fully in your browser, no Blender needed.</p>
          </div>
        </div>
        <div className="topbar-right">
          <a href="https://github.com/DaCameraGirl/photo-to-glb-auto" target="_blank" rel="noreferrer" className="gh-link">⭐ GitHub</a>
        </div>
      </header>

      <BeginnerGuide />

      {/* Stepper */}
      <nav className="stepper">
        {([
          [1, '📷 Upload'],
          [2, '🎨 Tune Image'],
          [3, '🫠 Melt & Mutate'],
          [4, '⬇️ Export GLB'],
        ] as const).map(([n, label]) => (
          <button
            key={n}
            className={`step-btn ${step === n ? 'active' : ''} ${n === 1 || canAdvance[`s${n-1}` as keyof typeof canAdvance] ? '' : 'locked'}`}
            onClick={() => { if (n === 1 || canAdvance[`s${n-1}` as keyof typeof canAdvance]) setStep(n as Step) }}
          >
            <span className="step-num">{n}</span>
            <span className="step-label">{label}</span>
          </button>
        ))}
      </nav>

      <main className="main-grid">
        {/* Left: step content */}
        <section className="step-panel">
          {step === 1 && (
            <div>
              <h2>Step 1 — Drop in your photo</h2>
              <details open className="guide-box">
                <summary>📖 How does this work? (click to collapse)</summary>
                <div className="guide-inner">
                  <p><strong>Photo Melt Studio</strong> takes any JPG or PNG portrait and "melts" it onto a stylized 3D avatar in real time, right in your browser. No Python, no Blender, no installs — just a modern browser.</p>
                  <p>Here's the full pipeline, start to finish:</p>
                  <ol>
                    <li><strong>Upload</strong> — Drop a JPG or PNG. Any size works, square-ish portraits work best for the face texture.</li>
                    <li><strong>Camera-tune</strong> — 11 real-time image controls (brightness, contrast, saturation, exposure, temperature, tint, highlights, shadows, sharpness, vignette, grain) run on the Canvas API. Your photo is processed locally, nothing uploads to a server.</li>
                    <li><strong>Melt</strong> — Your tuned photo becomes a face texture that wraps onto a Three.js avatar mesh. You see it live, spinning, updating as you tweak sliders.</li>
                    <li><strong>Mutate</strong> — Hit the "🎲 Mutation Madness" button to randomize body proportions, skin tone, eye color, hair color, outfit, and accessories. Chaotic and fun. You can also fine-tune manually.</li>
                    <li><strong>Export</strong> — Click export and you get a standard <code>.glb</code> file you can drop into Blender, Unity, Godot, Spline, or anywhere GLB is supported.</li>
                  </ol>
                  <p><strong>Privacy note:</strong> Everything runs 100% client-side. Your photo never leaves your computer. No server, no tracking, no uploads.</p>
                </div>
              </details>

              <div
                className="dropzone"
                onDragOver={e => e.preventDefault()}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                {rawImage ? (
                  <img src={rawImage} alt="uploaded" className="drop-preview" />
                ) : (
                  <div className="drop-prompt">
                    <div className="drop-icon">📷</div>
                    <p><strong>Drag & drop a JPG or PNG here</strong></p>
                    <p className="muted">or click to browse</p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/jpg"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />
              <div className="step-nav">
                <button disabled={!canAdvance.s1} className="btn primary" onClick={() => setStep(2)}>
                  Next: Tune your image →
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2>Step 2 — Camera-style image controls</h2>
              <details className="guide-box">
                <summary>🎨 What do all these sliders do?</summary>
                <div className="guide-inner">
                  <p>These are the same kinds of controls you'd find in Lightroom, Snapseed, or a DSLR camera. Every slider updates your photo in real time using the browser's Canvas API — no server round-trips, instant feedback.</p>
                  <ul>
                    {ADJUSTMENT_CONTROLS.map(([, label, desc]) => (
                      <li key={label}><strong>{label}</strong> — {desc}</li>
                    ))}
                  </ul>
                  <p><strong>Tip:</strong> Start with exposure and temperature to get the overall feel right, then dial in contrast and saturation, then finish with sharpness, vignette, and grain for that final polish.</p>
                </div>
              </details>

              <div className="adjust-grid">
                {ADJUSTMENT_CONTROLS.map(([key, label, desc, min, max]) => (
                  <div className="adjust-row" key={key}>
                    <div className="adjust-label">
                      <strong>{label}</strong>
                      <span className="adjust-hint">{desc}</span>
                    </div>
                    <input
                      type="range"
                      min={min} max={max}
                      value={adj[key]}
                      onChange={e => setAdj(a => ({ ...a, [key]: Number(e.target.value) }))}
                    />
                    <span className="adjust-val">{adj[key]}</span>
                    <button className="reset-mini" onClick={() => setAdj(a => ({ ...a, [key]: DEFAULT_ADJUSTMENTS[key] }))}>↺</button>
                  </div>
                ))}
              </div>
              <div className="step-nav">
                <button className="btn" onClick={() => setStep(1)}>← Back</button>
                <button className="btn" onClick={() => setAdj({ ...DEFAULT_ADJUSTMENTS })}>Reset all sliders</button>
                <button disabled={!canAdvance.s2} className="btn primary" onClick={() => setStep(3)}>
                  Next: Melt onto avatar →
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2>Step 3 — Melt &amp; Mutate</h2>
              <details className="guide-box">
                <summary>🫠 How does the "melting" actually work?</summary>
                <div className="guide-inner">
                  <p>Your tuned photo is loaded as a Three.js texture and applied to the face sphere of a procedural avatar mesh. The avatar is built from primitives (spheres, cylinders, boxes) — a clean, stylized look that works great for games, VR, social profiles, and 3D scenes.</p>
                  <p><strong>Mutation Madness 🎲</strong> randomizes every avatar property at once: head size, body width/height, limb thickness, skin tone, eye color, hair color, outfit color, and accessories (glasses, cap, headphones, halo). Hit it as many times as you want — it's pure chaos energy.</p>
                  <p>You can also tweak everything manually with the sliders below. All changes are live — the 3D preview updates instantly.</p>
                </div>
              </details>

              <button className="btn mutate-btn" onClick={() => setAvatar(randomAvatar(avatar))}>
                🎲 Mutation Madness — Randomize Everything!
              </button>

              <div className="avatar-controls">
                <div className="ctrl-group">
                  <label>Head Size <span>{avatar.headScale.toFixed(2)}</span></label>
                  <input type="range" min="0.75" max="1.35" step="0.01"
                    value={avatar.headScale}
                    onChange={e => setAvatar(a => ({ ...a, headScale: Number(e.target.value) }))} />
                </div>
                <div className="ctrl-group">
                  <label>Body Width <span>{avatar.bodyWidth.toFixed(2)}</span></label>
                  <input type="range" min="0.7" max="1.5" step="0.01"
                    value={avatar.bodyWidth}
                    onChange={e => setAvatar(a => ({ ...a, bodyWidth: Number(e.target.value) }))} />
                </div>
                <div className="ctrl-group">
                  <label>Body Height <span>{avatar.bodyHeight.toFixed(2)}</span></label>
                  <input type="range" min="0.75" max="1.4" step="0.01"
                    value={avatar.bodyHeight}
                    onChange={e => setAvatar(a => ({ ...a, bodyHeight: Number(e.target.value) }))} />
                </div>
                <div className="ctrl-group">
                  <label>Limb Thickness <span>{avatar.limbGirth.toFixed(2)}</span></label>
                  <input type="range" min="0.6" max="1.5" step="0.01"
                    value={avatar.limbGirth}
                    onChange={e => setAvatar(a => ({ ...a, limbGirth: Number(e.target.value) }))} />
                </div>

                <div className="ctrl-group full">
                  <label>Skin Tone</label>
                  <div className="swatches">
                    {SKIN_TONES.map(c => (
                      <button key={c} className={`swatch ${avatar.skinColor === c ? 'active' : ''}`}
                        style={{ background: c }}
                        onClick={() => setAvatar(a => ({ ...a, skinColor: c }))} />
                    ))}
                  </div>
                </div>

                <div className="color-row">
                  <label>Eye <input type="color" value={avatar.eyeColor}
                    onChange={e => setAvatar(a => ({ ...a, eyeColor: e.target.value }))} /></label>
                  <label>Hair <input type="color" value={avatar.hairColor}
                    onChange={e => setAvatar(a => ({ ...a, hairColor: e.target.value }))} /></label>
                  <label>Outfit <input type="color" value={avatar.outfitColor}
                    onChange={e => setAvatar(a => ({ ...a, outfitColor: e.target.value }))} /></label>
                </div>

                <div className="ctrl-group full">
                  <label>Accessory</label>
                  <div className="acc-chips">
                    {ACCESSORIES.map(acc => (
                      <button key={acc} className={`chip ${avatar.accessory === acc ? 'active' : ''}`}
                        onClick={() => setAvatar(a => ({ ...a, accessory: acc }))}>
                        {acc === 'none' ? '∅ none' : acc === 'glasses' ? '👓 glasses' : acc === 'cap' ? '🧢 cap' : acc === 'headphones' ? '🎧 headphones' : '😇 halo'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="step-nav">
                <button className="btn" onClick={() => setStep(2)}>← Back</button>
                <button className="btn primary" onClick={() => setStep(4)}>Next: Export GLB →</button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h2>Step 4 — Export your avatar</h2>
              <details className="guide-box" open>
                <summary>📦 What is a .GLB file?</summary>
                <div className="guide-inner">
                  <p><strong>GLB</strong> (GL Transmission Format, binary) is the standard 3D file format for the web. Think of it as the "JPEG of 3D". One file contains the mesh, materials, and textures all together.</p>
                  <p><strong>Where you can use your exported .glb:</strong></p>
                  <ul>
                    <li>🎮 <strong>Game engines</strong> — Unity, Godot, Unreal</li>
                    <li>🎨 <strong>3D editors</strong> — Blender, Spline, Cinema 4D</li>
                    <li>🌐 <strong>Web viewers</strong> — model-viewer, Babylon.js, Three.js</li>
                    <li>🥽 <strong>VR / AR</strong> — most WebXR pipelines accept GLB directly</li>
                  </ul>
                  <p>Your face texture is baked into the exported file, so the avatar looks the same everywhere.</p>
                </div>
              </details>

              <div className="export-card">
                <p>Your avatar is ready! The export includes the full mesh, materials, and your melted face texture.</p>
                <button className="btn primary xl" onClick={doExport} disabled={exporting || !processedImage}>
                  {exporting ? '⏳ Exporting…' : '⬇️ Download melt-avatar.glb'}
                </button>
                {!processedImage && <p className="muted">Upload a photo first to enable export.</p>}
              </div>

              <div className="step-nav">
                <button className="btn" onClick={() => setStep(3)}>← Back to editing</button>
              </div>
            </div>
          )}
        </section>

        {/* Right: live 3D preview */}
        <aside className="preview-panel">
          <div className="preview-head">
            <h3>🔴 Live Preview</h3>
            {isProcessing && <span className="processing-badge">processing…</span>}
          </div>
          <div className="canvas-wrap">
            <Canvas camera={{ position: [0, 0.6, 2.8], fov: 45 }} shadows>
              <ambientLight intensity={0.7} />
              <directionalLight position={[3, 4, 2]} intensity={1.2} castShadow />
              <directionalLight position={[-2, 2, -2]} intensity={0.4} />
              <MeltAvatar params={avatar} faceTextureUrl={processedImage} />
              <Environment preset="studio" />
              <OrbitControls enablePan={false} minDistance={1.5} maxDistance={5} />
              <gridHelper args={[6, 12]} position={[0, -1.4, 0]} />
            </Canvas>
          </div>
          <div className="preview-foot muted">
            Drag to orbit · Scroll to zoom · Right-click to pan
          </div>
          {processedImage && (
            <div className="texture-thumb">
              <span>Active face texture:</span>
              <img src={processedImage} alt="face texture" />
            </div>
          )}
        </aside>
      </main>

      <footer className="footer">
        <p>Photo Melt Studio v2 · Browser-only, no Blender required · Built with React + Three.js · <a href="https://github.com/DaCameraGirl/photo-to-glb-auto">GitHub</a> · Legacy Blender pipeline archived in <code>/legacy</code></p>
      </footer>
    </div>
  )
}

function BeginnerGuide() {
  return (
    <details className="guide big-guide">
      <summary>🎀 New here? Start here — the 2-minute melt studio guide</summary>
      <div className="guide-body">
        <div className="guide-card">
          <h4>💡 What even is this?</h4>
          <p>
            Photo Melt Studio turns <strong>any JPG or PNG portrait</strong> into a stylized 3D avatar — entirely in your browser. Your photo gets "melted" onto the face of a customizable 3D character. Then you can tweak body proportions, skin tones, colors, accessories, and export the whole thing as a <code>.glb</code> file.
          </p>
          <p>No Python. No Blender. No server. No account. Just a browser tab.</p>
        </div>
        <div className="guide-card">
          <h4>🪜 The 4-step walkthrough</h4>
          <ol>
            <li><strong>📷 Upload</strong> — Drag a JPG or PNG. Face-forward portraits work best, but go wild.</li>
            <li><strong>🎨 Tune</strong> — 11 camera-style sliders: brightness, contrast, saturation, exposure, temperature, tint, highlights, shadows, sharpness, vignette, grain. Everything is real-time, Canvas API, local-only.</li>
            <li><strong>🫠 Melt &amp; Mutate</strong> — Your photo wraps onto the avatar face in the live 3D preview. Hit <strong>🎲 Mutation Madness</strong> to randomize every body feature at once — chaotic fun. Or tweak manually.</li>
            <li><strong>⬇️ Export</strong> — Download a standard <code>.glb</code> file. Works in Blender, Unity, Godot, Spline, WebXR, and anywhere else GLB is supported.</li>
          </ol>
        </div>
        <div className="guide-card">
          <h4>🔒 Privacy</h4>
          <p>
            Every step runs <strong>100% client-side</strong>. Your photo never leaves your device. There is no backend, no upload, no tracking, no analytics cookie nonsense. The entire app is a static site.
          </p>
        </div>
        <div className="guide-card guide-card--warn">
          <h4>⚠️ What this is NOT</h4>
          <p>
            This is <strong>not</strong> a photorealistic 3D face scan. It is a stylized, procedural avatar with your photo projected onto the face. It looks cool, it is fun, it is useful for games and profiles — but it is not a VFX-grade likeness reconstruction. That's a feature, not a bug. 😄
          </p>
        </div>
      </div>
    </details>
  )
}
