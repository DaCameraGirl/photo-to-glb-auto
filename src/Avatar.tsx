import { useMemo, useRef, useEffect } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { AvatarParams } from './types'

interface Props {
  params: AvatarParams
  faceTextureUrl: string | null
  meltTrigger?: number  // increment to re-trigger melt animation
}

// Melt shader – photo dissolves/goos onto the face with a wavy melt edge
const meltVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const meltFragmentShader = `
  uniform sampler2D faceTex;
  uniform vec3 skinColor;
  uniform float melt;        // 0.0 = fully skin, 1.0 = fully photo
  uniform float time;
  varying vec2 vUv;

  // 2D noise
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    // Flip UV Y so photo appears right-side-up on the sphere
    vec2 uv = vec2(vUv.x, 1.0 - vUv.y);

    // Only show photo on the front-facing hemisphere of the head
    // Sphere UVs: u = longitude (0=back, 0.25=right, 0.5=front, 0.75=left), v = latitude (0=bottom, 0.5=equator, 1=top)
    // We want the face centered on the front, covering roughly the front 50% of the sphere horizontally
    // and the middle 60% vertically (forehead to chin)
    float faceU = fract(uv.x + 0.0); // 0.5 = front center in default sphere UVs, but three.js orients differently, tune below
    // Actually three.js sphere UVs: u=0 at +X, wraps CCW looking down +Y, so front (+Z) is at u=0.25
    // Let's remap so the photo centers on the front face
    float u = fract(uv.x + 0.25); // shift so front faces forward
    float faceMaskU = smoothstep(0.72, 0.68, abs(u - 0.5)) * 2.0; // fade at sides, keep center sharp
    faceMaskU = clamp(faceMaskU, 0.0, 1.0);
    float faceMaskV = smoothstep(0.08, 0.18, uv.y) * smoothstep(0.92, 0.72, uv.y);
    float faceMask = faceMaskU * faceMaskV;

    // Sample the face texture – crop to face region and scale to fit the masked area
    // Map the face-masked UV region back to 0-1 texture space
    vec2 texUv = vec2(
      clamp((u - 0.28) / 0.44, 0.0, 1.0),
      clamp((uv.y - 0.18) / 0.54, 0.0, 1.0)
    );
    vec3 photoColor = texture2D(faceTex, texUv).rgb;

    // Melt / dissolve effect – gooey dripping edge that sweeps top-to-bottom
    float n = fbm(uv * 8.0 + time * 0.15);
    float meltEdge = melt * 1.35 - 0.18 + n * 0.12;
    // Melt direction: top to bottom, with wavy gooey edge
    float dissolve = smoothstep(meltEdge - 0.06, meltEdge + 0.06, uv.y);

    // Gooey glow at the melt front
    float goo = smoothstep(meltEdge - 0.1, meltEdge, uv.y) * smoothstep(meltEdge + 0.08, meltEdge, uv.y);
    vec3 meltGlow = vec3(1.0, 0.78, 0.42) * goo * 0.55;

    // Blend: skin → photo, masked to face region, with melt wipe
    float t = dissolve * faceMask * melt;
    vec3 color = mix(skinColor, photoColor, t) + meltGlow;

    // Slight darkening at the edges of the face mask for a natural blend
    float edgeFade = pow(faceMask, 1.4);
    color = mix(skinColor * 0.92, color, edgeFade);

    gl_FragColor = vec4(color, 1.0);
  }
`

export function MeltAvatar({ params, faceTextureUrl, meltTrigger = 0 }: Props) {
  const groupRef = useRef<THREE.Group>(null)

  // Gentle idle sway – faces the camera, no constant spin
  useFrame((state) => {
    if (groupRef.current) {
      const t = state.clock.elapsedTime
      groupRef.current.rotation.y = Math.sin(t * 0.35) * 0.18
      groupRef.current.position.y = -1.05 + Math.sin(t * 1.1) * 0.018
    }
  })

  // Load face texture
  const faceTexture = useMemo(() => {
    if (!faceTextureUrl) return null
    const t = new THREE.TextureLoader().load(faceTextureUrl)
    t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = THREE.ClampToEdgeWrapping
    t.wrapT = THREE.ClampToEdgeWrapping
    t.minFilter = THREE.LinearMipmapLinearFilter
    t.magFilter = THREE.LinearFilter
    t.flipY = true
    return t
  }, [faceTextureUrl])

  // Melt progress – animates 0 → 1 whenever texture or trigger changes
  const meltRef = useRef({ value: 0, target: 0, lastTex: '' as string | null })
  useFrame((_, delta) => {
    const target = faceTexture ? 1 : 0
    // if texture just changed, snap melt back to 0 and animate in
    const texKey = faceTexture?.uuid || null
    if (texKey !== meltRef.current.lastTex) {
      meltRef.current.value = 0
      meltRef.current.lastTex = texKey
    }
    // also re-trigger on explicit meltTrigger bump
    if (meltTrigger > 0) {
      meltRef.current.value = 0
    }
    meltRef.current.target = target
    // ease toward target – fast melt in, slower fade out
    const speed = target > meltRef.current.value ? 1.35 : 2.2
    meltRef.current.value += (target - meltRef.current.value) * Math.min(1, delta * speed)
  })

  const skinMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: params.skinColor,
    roughness: 0.55,
  }), [params.skinColor])

  // Face melt material – shader that dissolves the photo onto the head
  const faceMeltMat = useMemo(() => {
    if (!faceTexture) return skinMat
    return new THREE.ShaderMaterial({
      uniforms: {
        faceTex: { value: faceTexture },
        skinColor: { value: new THREE.Color(params.skinColor) },
        melt: { value: 0 },
        time: { value: 0 },
      },
      vertexShader: meltVertexShader,
      fragmentShader: meltFragmentShader,
    })
  }, [faceTexture, params.skinColor, skinMat])

  // keep skinColor uniform in sync when skin tone changes
  useEffect(() => {
    const m = faceMeltMat as any
    if (m.uniforms?.skinColor) {
      m.uniforms.skinColor.value.set(params.skinColor)
    }
  }, [params.skinColor, faceMeltMat])

  // drive melt + time uniforms every frame
  useFrame((state) => {
    const m = faceMeltMat as any
    if (m.uniforms) {
      m.uniforms.melt.value = meltRef.current.value
      m.uniforms.time.value = state.clock.elapsedTime
    }
  })

  const eyeMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: params.eyeColor,
    roughness: 0.1,
  }), [params.eyeColor])

  const hairMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: params.hairColor,
    roughness: 0.7,
  }), [params.hairColor])

  const outfitMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: params.outfitColor,
    roughness: 0.6,
  }), [params.outfitColor])

  const hs = params.headScale
  const bw = params.bodyWidth
  const bh = params.bodyHeight
  const lg = params.limbGirth

  return (
    <group ref={groupRef} position={[0, -1.05, 0]}>
      {/* head – face texture melts on via shader */}
      <mesh position={[0, 1.52 * bh, 0]} material={faceTexture ? faceMeltMat : skinMat} castShadow>
        <sphereGeometry args={[0.32 * hs, 48, 32]} />
      </mesh>

      {/* hair cap – sits flush on top of head, no gap */}
      <mesh position={[0, 1.6 * bh, 0]} material={hairMat}>
        <sphereGeometry args={[0.335 * hs, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
      </mesh>

      {/* eyes – sit on the surface of the face */}
      <mesh position={[-0.09 * hs, 1.55 * bh, 0.27 * hs]} material={eyeMat}>
        <sphereGeometry args={[0.032, 16, 12]} />
      </mesh>
      <mesh position={[0.09 * hs, 1.55 * bh, 0.27 * hs]} material={eyeMat}>
        <sphereGeometry args={[0.032, 16, 12]} />
      </mesh>

      {/* neck – overlaps head and torso slightly so no visible gap */}
      <mesh position={[0, 1.24 * bh, 0]} material={skinMat} castShadow>
        <cylinderGeometry args={[0.11, 0.13, 0.2, 24]} />
      </mesh>

      {/* torso – overlaps neck at top, legs at bottom */}
      <mesh position={[0, 0.68 * bh, 0]} material={outfitMat} castShadow>
        <boxGeometry args={[0.52 * bw, 0.74 * bh, 0.26 * bw]} />
      </mesh>

      {/* arms – attached flush to torso sides */}
      <mesh position={[-0.295 * bw, 0.68 * bh, 0]} rotation={[0, 0, 0.12]} material={skinMat} castShadow>
        <cylinderGeometry args={[0.07 * lg, 0.06 * lg, 0.56, 16]} />
      </mesh>
      <mesh position={[0.295 * bw, 0.68 * bh, 0]} rotation={[0, 0, -0.12]} material={skinMat} castShadow>
        <cylinderGeometry args={[0.07 * lg, 0.06 * lg, 0.56, 16]} />
      </mesh>

      {/* legs – overlap torso bottom */}
      <mesh position={[-0.13 * bw, 0.14 * bh, 0]} material={outfitMat} castShadow>
        <cylinderGeometry args={[0.09 * lg, 0.08 * lg, 0.62 * bh, 16]} />
      </mesh>
      <mesh position={[0.13 * bw, 0.14 * bh, 0]} material={outfitMat} castShadow>
        <cylinderGeometry args={[0.09 * lg, 0.08 * lg, 0.62 * bh, 16]} />
      </mesh>

      {/* feet – tucked under legs, slight forward offset */}
      <mesh position={[-0.13 * bw, -0.22 * bh, 0.05]} material={outfitMat}>
        <boxGeometry args={[0.13, 0.08, 0.22]} />
      </mesh>
      <mesh position={[0.13 * bw, -0.22 * bh, 0.05]} material={outfitMat}>
        <boxGeometry args={[0.13, 0.08, 0.22]} />
      </mesh>

      {/* accessories */}
      {params.accessory === 'glasses' && (
        <group position={[0, 1.55 * bh, 0.28 * hs]}>
          <mesh position={[-0.09 * hs, 0, 0]}>
            <torusGeometry args={[0.048, 0.006, 8, 24]} />
            <meshStandardMaterial color="#222" roughness={0.3} metalness={0.5} />
          </mesh>
          <mesh position={[0.09 * hs, 0, 0]}>
            <torusGeometry args={[0.048, 0.006, 8, 24]} />
            <meshStandardMaterial color="#222" roughness={0.3} metalness={0.5} />
          </mesh>
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[0.088, 0.006, 0.006]} />
            <meshStandardMaterial color="#222" roughness={0.3} metalness={0.5} />
          </mesh>
        </group>
      )}

      {params.accessory === 'cap' && (
        <group position={[0, 1.72 * bh, 0]}>
          <mesh>
            <sphereGeometry args={[0.33 * hs, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
            <meshStandardMaterial color="#c0392b" roughness={0.65} />
          </mesh>
          <mesh position={[0, 0.02, 0.25 * hs]} rotation={[Math.PI / 10, 0, 0]}>
            <boxGeometry args={[0.42 * hs, 0.015, 0.18]} />
            <meshStandardMaterial color="#c0392b" roughness={0.65} />
          </mesh>
        </group>
      )}

      {params.accessory === 'headphones' && (
        <group position={[0, 1.52 * bh, 0]}>
          <mesh position={[-0.32 * hs, 0, 0]}>
            <sphereGeometry args={[0.07, 16, 12]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
          <mesh position={[0.32 * hs, 0, 0]}>
            <sphereGeometry args={[0.07, 16, 12]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
          <mesh position={[0, 0.24, 0]}>
            <torusGeometry args={[0.31 * hs, 0.015, 8, 32, Math.PI]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
        </group>
      )}

      {params.accessory === 'halo' && (
        <mesh position={[0, 1.92 * bh, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.22, 0.018, 12, 48]} />
          <meshStandardMaterial color="#ffd86b" emissive="#ffcf45" emissiveIntensity={0.6} />
        </mesh>
      )}
    </group>
  )
}
