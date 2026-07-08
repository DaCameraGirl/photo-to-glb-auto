import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { AvatarParams } from './types'

/**
 * Build an avatar Group (non-animated, no auto-rotate)
 * for GLB export, optionally with a face texture.
 */
export function buildExportAvatar(params: AvatarParams, faceTextureUrl: string | null): THREE.Group {
  const group = new THREE.Group()

  let faceTexture: THREE.Texture | null = null
  if (faceTextureUrl) {
    const loader = new THREE.TextureLoader()
    faceTexture = loader.load(faceTextureUrl)
    faceTexture.colorSpace = THREE.SRGBColorSpace
  }

  const skinMat = new THREE.MeshStandardMaterial({ color: params.skinColor, roughness: 0.55 })
  const faceMat = faceTexture
    ? new THREE.MeshStandardMaterial({ map: faceTexture, roughness: 0.45 })
    : skinMat
  const eyeMat = new THREE.MeshStandardMaterial({ color: params.eyeColor, roughness: 0.1 })
  const hairMat = new THREE.MeshStandardMaterial({ color: params.hairColor, roughness: 0.7 })
  const outfitMat = new THREE.MeshStandardMaterial({ color: params.outfitColor, roughness: 0.6 })

  const hs = params.headScale
  const bw = params.bodyWidth
  const bh = params.bodyHeight
  const lg = params.limbGirth

  function addMesh(geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number,number,number], rot?: [number,number,number]) {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(...pos)
    if (rot) m.rotation.set(...rot)
    group.add(m)
    return m
  }

  addMesh(new THREE.SphereGeometry(0.32 * hs, 40, 24), faceMat, [0, 1.52 * bh, 0])
  addMesh(new THREE.SphereGeometry(0.335 * hs, 28, 12, 0, Math.PI*2, 0, Math.PI*0.56), hairMat, [0, 1.62 * bh, 0])
  addMesh(new THREE.SphereGeometry(0.035, 12, 8), eyeMat, [-0.1*hs, 1.55*bh, 0.26*hs])
  addMesh(new THREE.SphereGeometry(0.035, 12, 8), eyeMat, [0.1*hs, 1.55*bh, 0.26*hs])
  addMesh(new THREE.CylinderGeometry(0.1, 0.12, 0.16, 20), skinMat, [0, 1.22*bh, 0])
  addMesh(new THREE.BoxGeometry(0.52*bw, 0.72*bh, 0.26*bw), outfitMat, [0, 0.68*bh, 0])
  addMesh(new THREE.CylinderGeometry(0.07*lg, 0.06*lg, 0.56, 14), skinMat, [-0.34*bw, 0.68*bh, 0], [0, 0, 0.14])
  addMesh(new THREE.CylinderGeometry(0.07*lg, 0.06*lg, 0.56, 14), skinMat, [0.34*bw, 0.68*bh, 0], [0, 0, -0.14])
  addMesh(new THREE.CylinderGeometry(0.09*lg, 0.08*lg, 0.7*bh, 14), outfitMat, [-0.13*bw, 0.06*bh, 0])
  addMesh(new THREE.CylinderGeometry(0.09*lg, 0.08*lg, 0.7*bh, 14), outfitMat, [0.13*bw, 0.06*bh, 0])

  return group
}

export async function exportGLB(params: AvatarParams, faceTextureUrl: string | null): Promise<Blob> {
  // Wait for texture to load if present
  if (faceTextureUrl) {
    await new Promise<void>((res, rej) => {
      const img = new Image()
      img.onload = () => res()
      img.onerror = () => rej(new Error('texture load'))
      img.src = faceTextureUrl
    })
  }

  const avatar = buildExportAvatar(params, faceTextureUrl)

  const exporter = new GLTFExporter()
  const glb = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      avatar,
      (result) => resolve(result as ArrayBuffer),
      (err) => reject(err),
      { binary: true }
    )
  })
  return new Blob([glb], { type: 'model/gltf-binary' })
}
