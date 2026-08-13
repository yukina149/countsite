Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$publicDir = Join-Path $projectRoot "public"
$sourcePath = Join-Path $publicDir "brand_icon.png"

function New-AppIcon {
  param(
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [Parameter(Mandatory = $true)][int]$Size,
    [Parameter(Mandatory = $true)][double]$SubjectScale,
    [Parameter(Mandatory = $true)][bool]$UseBackground
  )

  $source = [System.Drawing.Image]::FromFile($sourcePath)
  $bitmap = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $bitmap.SetResolution(96, 96)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

  try {
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

    if ($UseBackground) {
      $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#F2F8F5"))
    } else {
      $graphics.Clear([System.Drawing.Color]::Transparent)
    }

    $subjectSize = [int][Math]::Round($Size * $SubjectScale)
    $offset = [int][Math]::Round(($Size - $subjectSize) / 2)
    $destination = New-Object System.Drawing.Rectangle($offset, $offset, $subjectSize, $subjectSize)
    $graphics.DrawImage($source, $destination)
    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
    $source.Dispose()
  }
}

# Transparent "any" icons retain generous padding for launchers that add their own tile.
New-AppIcon -OutputPath (Join-Path $publicDir "icon-192.png") -Size 192 -SubjectScale 0.68 -UseBackground $false
New-AppIcon -OutputPath (Join-Path $publicDir "icon-512.png") -Size 512 -SubjectScale 0.68 -UseBackground $false

# Maskable and Apple icons include a background and a smaller, centered safe-zone subject.
New-AppIcon -OutputPath (Join-Path $publicDir "icon-maskable-192.png") -Size 192 -SubjectScale 0.56 -UseBackground $true
New-AppIcon -OutputPath (Join-Path $publicDir "icon-maskable-512.png") -Size 512 -SubjectScale 0.56 -UseBackground $true
New-AppIcon -OutputPath (Join-Path $publicDir "apple-touch-icon.png") -Size 180 -SubjectScale 0.58 -UseBackground $true
