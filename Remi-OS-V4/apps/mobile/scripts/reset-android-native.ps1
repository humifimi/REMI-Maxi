# Reset Android native build after a failed `gradlew clean` (missing codegen/jni dirs).
# Usage (from repo root or apps/mobile):
#   .\scripts\reset-android-native.ps1
# Then rebuild (do NOT run `gradlew clean` first):
#   npx expo run:android
#   # or: cd android; .\gradlew.bat :app:assembleDebug

$ErrorActionPreference = "Stop"
$mobileRoot = Split-Path $PSScriptRoot -Parent
Set-Location $mobileRoot

# Gradle invokes `node` from settings.gradle — ensure it is on PATH
$nodeDir = "C:\Program Files\nodejs"
if (Test-Path "$nodeDir\node.exe") {
  $env:Path = "$nodeDir;" + $env:Path
}

Write-Host "Stopping Gradle daemons..."
Set-Location android
& .\gradlew.bat --stop 2>$null
Set-Location $mobileRoot

Write-Host "Removing stale Android caches (not node_modules codegen)..."
$toRemove = @(
  "android\app\build",
  "android\build",
  "android\.gradle"
)
foreach ($rel in $toRemove) {
  if (Test-Path $rel) {
    Remove-Item -Recurse -Force $rel -ErrorAction SilentlyContinue
    Write-Host "  removed $rel"
  }
}

# .cxx often has long paths on Windows; rename so CMake starts fresh
if (Test-Path "android\app\.cxx") {
  $bak = "android\app\.cxx.bak.$([DateTime]::Now.ToString('yyyyMMddHHmmss'))"
  try {
    Rename-Item "android\app\.cxx" $bak -Force
    Write-Host "  renamed android\app\.cxx -> $(Split-Path $bak -Leaf)"
  } catch {
    Write-Host "  WARN: could not rename .cxx (close Android Studio / emulator / Metro, then delete android\app\.cxx manually)"
  }
}

if (Test-Path ".\scripts\use-jdk17.ps1") {
  . .\scripts\use-jdk17.ps1
}

Write-Host ""
Write-Host "Next: from apps/mobile run:"
Write-Host "  npx expo run:android"
Write-Host ""
Write-Host "Avoid `gradlew clean` alone — it removes codegen JNI folders and breaks CMake until a full assembleDebug."
