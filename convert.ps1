param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [string]$OutputPath = $(Join-Path (Get-Location) "output.glb"),

  [string]$Name = "Photo Avatar"
)

py -3.11 -m photo_to_glb.cli --input $InputPath --output $OutputPath --name $Name
