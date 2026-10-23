$projectDir = "C:\Users\HP\Desktop\Projects\Digital Twin"
$desktopDir = [System.Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopDir "AI Fire Evacuation Digital Twin.lnk"
$exePath = Join-Path $projectDir "dist\win-unpacked\AI Fire Evacuation Digital Twin.exe"
$fallbackVbs = Join-Path $projectDir "Launch-Desktop-App-Silent.vbs"
$iconPath = Join-Path $projectDir "build\icon.ico"

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)

if (Test-Path $exePath) {
    $shortcut.TargetPath = $exePath
    $shortcut.WorkingDirectory = Split-Path $exePath
    $shortcut.IconLocation = "$exePath,0"
} else {
    $shortcut.TargetPath = "wscript.exe"
    $shortcut.Arguments = "`"$fallbackVbs`""
    $shortcut.WorkingDirectory = $projectDir
    $shortcut.IconLocation = "$iconPath,0"
}

$shortcut.Description = "AI-Driven Fire Evacuation Digital Twin Windows Desktop App"
$shortcut.Save()

Write-Host "Desktop shortcut created successfully at: $shortcutPath"
Write-Host "Points to: $($shortcut.TargetPath)"
