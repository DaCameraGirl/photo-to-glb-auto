import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { AvatarParams } from './types'

interface Props {
  params: AvatarParams
  faceTextureUrl: string | null
}

export function MeltAvatar({ params, faceTextureUrl }: Props) {
  const groupRef = useRef<THREE.Group>(null)

  useFrame((_state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.18
    }
  })

  const faceTexture = useMemo(() => {
    if (!faceTextureUrl) return null
    const t = new THREE.TextureLoader().load(faceTextureUrl)
    t.colorSpace = THREE.SRGBColorSpace
    t.flipY = true
    return t
  }, [faceTextureUrl])

  const skinMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: params.skinColor,
    roughness: 0.55,
  }), [params.skinColor])

  const faceMat = useMemo(() => {
    if (!faceTexture) return skinMat
    return new THREE.MeshStandardMaterial({
      map: faceTexture,
      roughness: 0.45,
    })
  }, [faceTexture, skinMat])

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
      {/* head */}
      <mesh position={[0, 1.52 * bh, 0]} material={faceMat} castShadow>
        <sphereGeometry args={[0.32 * hs, 48, 32]} />
      </mesh>

      {/* hair cap */}
      <mesh position={[0, 1.62 * bh, 0]} material={hairMat}>
        <sphereGeometry args={[0.335 * hs, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.56]} />
      </mesh>

      {/* eyes */}
      <mesh position={[-0.1 * hs, 1.55 * bh, 0.26 * hs]} material={eyeMat}>
        <sphereGeometry args={[0.035, 16, 12]} />
      </mesh>
      <mesh position={[0.1 * hs, 1.55 * bh, 0.26 * hs]} material={eyeMat}>
        <sphereGeometry args={[0.035, 16, 12]} />
      </mesh>

      {/* neck */}
      <mesh position={[0, 1.22 * bh, 0]} material={skinMat} castShadow>
        <cylinderGeometry args={[0.1, 0.12, 0.16, 24]} />
      </mesh>

      {/* torso */}
      <mesh position={[0, 0.68 * bh, 0]} material={outfitMat} castShadow>
        <boxGeometry args={[0.52 * bw, 0.72 * bh, 0.26 * bw]} />
      </mesh>

      {/* arms */}
      <mesh position={[-0.34 * bw, 0.68 * bh, 0]} rotation={[0, 0, 0.14]} material={skinMat} castShadow>
        <cylinderGeometry args={[0.07 * lg, 0.06 * lg, 0.56, 16]} />
      </mesh>
      <mesh position={[0.34 * bw, 0.68 * bh, 0]} rotation={[0, 0, -0.14]} material={skinMat} castShadow>
        <cylinderGeometry args={[0.07 * lg, 0.06 * lg, 0.56, 16]} />
      </mesh>

      {/* legs */}
      <mesh position={[-0.13 * bw, 0.06 * bh, 0]} material={outfitMat} castShadow>
        <cylinderGeometry args={[0.09 * lg, 0.08 * lg, 0.7 * bh, 16]} />
      </mesh>
      <mesh position={[0.13 * bw, 0.06 * bh, 0]} material={outfitMat} castShadow>
        <cylinderGeometry args={[0.09 * lg, 0.08 * lg, 0.7 * bh, 16]} />
      </mesh>

      {/* feet */}
      <mesh position={[-0.13 * bw, -0.32 * bh, 0.05]} material={outfitMat}>
        <boxGeometry args={[0.13, 0.08, 0.22]} />
      </mesh>
      <mesh position={[0.13 * bw, -0.32 * bh, 0.05]} material={outfitMat}>
        <boxGeometry args={[0.13, 0.08, 0.22]} />
      </mesh>

      {/* accessories */}
      {params.accessory === 'glasses' && (
        <group position={[0, 1.55 * bh, 0.28 * hs]}>
          <mesh position={[-0.1 * hs, 0, 0]}>
            <torusGeometry args={[0.052, 0.006, 8, 24]} />
            <meshStandardMaterial color="#222" roughness={0.3} metalness={0.5} />
          </mesh>
          <mesh position={[0.1 * hs, 0, 0]}>
            <torusGeometry args={[0.052, 0.006, 8, 24]} />
            <meshStandardMaterial color="#222" roughness={0.3} metalness={0.5} />
          </mesh>
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[0.095, 0.006, 0.006]} />
            <meshStandardMaterial color="#222" roughness={0.3} metalness={0.5} />
          </mesh>
        </group>
      )}

      {params.accessory === 'cap' && (
        <group position={[0, 1.70 * bh, 0]}>
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
