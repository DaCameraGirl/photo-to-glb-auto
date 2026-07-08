param(
  [int]$Port = 8787
)

$env:PHOTO_TO_GLB_PORT = "$Port"
py -3.11 -m photo_to_glb.app
