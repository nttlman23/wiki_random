Add-Type -AssemblyName System.Drawing

function Save-Icon {
  param([string]$Path, [int]$Size)

  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::FromArgb(29, 78, 216))

  $orange = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(249, 115, 22))
  $dot = [int][Math]::Max(6, $Size * 0.34)
  $g.FillEllipse($orange, $Size - $dot - 2, 2, $dot, $dot)

  $fontSize = [int][Math]::Max(9, $Size * 0.56)
  $font = New-Object System.Drawing.Font("Arial", $fontSize, [System.Drawing.FontStyle]::Bold)
  $rect = New-Object System.Drawing.RectangleF(
    0.0,
    [single]($Size * 0.08),
    [single]$Size,
    [single]($Size * 0.88)
  )
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $g.DrawString("W", $font, [System.Drawing.Brushes]::White, $rect, $sf)

  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  $orange.Dispose()
  $font.Dispose()
}

$root = Split-Path -Parent $PSScriptRoot
Save-Icon (Join-Path $root "favicon-16.png") 16
Save-Icon (Join-Path $root "favicon-32.png") 32
Save-Icon (Join-Path $root "favicon-48.png") 48
Save-Icon (Join-Path $root "apple-touch-icon.png") 180
Write-Host "Icons saved to $root"
