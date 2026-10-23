Add-Type -AssemblyName System.Drawing

$size = 256
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

# Clear with transparent
$g.Clear([System.Drawing.Color]::Transparent)

# Background rounded rectangle
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$r = 28
$rect = New-Object System.Drawing.Rectangle 12, 12, ($size - 24), ($size - 24)
$path.AddArc($rect.X, $rect.Y, $r, $r, 180, 90)
$path.AddArc($rect.Right - $r, $rect.Y, $r, $r, 270, 90)
$path.AddArc($rect.Right - $r, $rect.Bottom - $r, $r, $r, 0, 90)
$path.AddArc($rect.X, $rect.Bottom - $r, $r, $r, 90, 90)
$path.CloseFigure()

# Background gradient fill (Slate / Deep Cyber Navy)
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
    New-Object System.Drawing.Point 0, 0),
    (New-Object System.Drawing.Point 0, $size),
    ([System.Drawing.Color]::FromArgb(255, 15, 23, 42)),
    ([System.Drawing.Color]::FromArgb(255, 2, 6, 23))
$g.FillPath($bgBrush, $path)

# Subtle Cyan/Emerald border
$borderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(180, 56, 189, 248)), 3
$g.DrawPath($borderPen, $path)

# Draw digital twin building wireframe in background
$cyanPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(90, 14, 165, 233)), 2
$g.DrawRectangle($cyanPen, 50, 80, 60, 110)
$g.DrawRectangle($cyanPen, 130, 60, 76, 130)
# Wireframe floor lines
$g.DrawLine($cyanPen, 50, 115, 110, 115)
$g.DrawLine($cyanPen, 50, 150, 110, 150)
$g.DrawLine($cyanPen, 130, 100, 206, 100)
$g.DrawLine($cyanPen, 130, 140, 206, 140)

# Draw Flame in Foreground center
$flamePath = New-Object System.Drawing.Drawing2D.GraphicsPath
$flamePath.StartFigure()
$flamePath.AddBezier(128, 70, 175, 110, 180, 175, 145, 195)
$flamePath.AddBezier(145, 195, 128, 205, 105, 195, 85, 170)
$flamePath.AddBezier(85, 170, 75, 135, 100, 110, 108, 125)
$flamePath.AddBezier(108, 125, 112, 100, 120, 85, 128, 70)
$flamePath.CloseFigure()

$flameBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
    New-Object System.Drawing.Point 0, 70),
    (New-Object System.Drawing.Point 0, 205),
    ([System.Drawing.Color]::FromArgb(240, 251, 146, 60)),
    ([System.Drawing.Color]::FromArgb(245, 225, 29, 72))
$g.FillPath($flameBrush, $flamePath)

# Inner Flame Core (Bright Yellow)
$corePath = New-Object System.Drawing.Drawing2D.GraphicsPath
$corePath.StartFigure()
$corePath.AddBezier(128, 125, 150, 150, 145, 185, 130, 192)
$corePath.AddBezier(130, 192, 120, 195, 112, 185, 112, 165)
$corePath.AddBezier(112, 165, 112, 145, 122, 135, 128, 125)
$corePath.CloseFigure()

$coreBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
    New-Object System.Drawing.Point 0, 125),
    (New-Object System.Drawing.Point 0, 195),
    ([System.Drawing.Color]::FromArgb(250, 254, 240, 138)),
    ([System.Drawing.Color]::FromArgb(250, 249, 115, 22))
$g.FillPath($coreBrush, $corePath)

# Digital Network Nodes (Glowing Dots and Edges)
$nodeBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 34, 197, 94))
$g.FillEllipse($nodeBrush, 45, 75, 10, 10)
$g.FillEllipse($nodeBrush, 105, 110, 10, 10)
$g.FillEllipse($nodeBrush, 201, 55, 10, 10)
$g.FillEllipse($nodeBrush, 125, 55, 10, 10)
$g.FillEllipse($nodeBrush, 180, 185, 10, 10)

$g.Dispose()

$pngPath = "C:\Users\HP\Desktop\Projects\Digital Twin\build\icon.png"
$bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Saved PNG icon to $pngPath"

# Save as ICO (Single-resolution 256x256 or multi-res standard)
$hIcon = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$icoPath = "C:\Users\HP\Desktop\Projects\Digital Twin\build\icon.ico"
$stream = New-Object System.IO.FileStream $icoPath, ([System.IO.FileMode]::Create)
$icon.Save($stream)
$stream.Close()
$icon.Dispose()
$bmp.Dispose()

Write-Host "Saved ICO icon to $icoPath"
