export interface ImageAdjustments {
  brightness: number   // -100 .. +100   (0 = neutral)
  contrast: number     // -100 .. +100
  saturation: number   // -100 .. +100
  exposure: number     // -100 .. +100
  temperature: number  // -100 .. +100   (warm/cool)
  tint: number         // -100 .. +100   (green/magenta)
  highlights: number   // -100 .. +100
  shadows: number      // -100 .. +100
  sharpness: number    // 0 .. 200       (0 = neutral)
  vignette: number     // 0 .. 100
  grain: number        // 0 .. 100
}

export const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  exposure: 0,
  temperature: 0,
  tint: 0,
  highlights: 0,
  shadows: 0,
  sharpness: 0,
  vignette: 0,
  grain: 0,
}

export interface FacePlacement {
  scale: number      // 0.5 .. 2.5   (1.0 = default fit)
  offsetX: number    // -50 .. +50   (- = left, + = right)
  offsetY: number    // -50 .. +50   (- = down, + = up)
  rotation: number   // -180 .. +180 degrees
}

export const DEFAULT_FACE_PLACEMENT: FacePlacement = {
  scale: 1.0,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
}

export interface AvatarParams {
  headScale: number
  bodyWidth: number
  bodyHeight: number
  limbGirth: number
  skinColor: string
  eyeColor: string
  hairColor: string
  outfitColor: string
  accessory: 'none' | 'glasses' | 'cap' | 'headphones' | 'halo'
}

export const DEFAULT_AVATAR: AvatarParams = {
  headScale: 1.0,
  bodyWidth: 1.0,
  bodyHeight: 1.0,
  limbGirth: 1.0,
  skinColor: '#f2c7a1',
  eyeColor: '#3a2a1a',
  hairColor: '#2b1810',
  outfitColor: '#184054',
  accessory: 'none',
}

export const SKIN_TONES = [
  '#f8e6d4', '#f2c7a1', '#d4a87a', '#b87a4a', '#8b5530', '#5a3420', '#3a2012',
]
export const ACCESSORIES: AvatarParams['accessory'][] = ['none', 'glasses', 'cap', 'headphones', 'halo']
