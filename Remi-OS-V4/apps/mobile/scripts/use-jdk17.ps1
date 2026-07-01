# Point this terminal session at JDK 17 for Android/Gradle builds.
$jdk17 = "C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot"
if (-not (Test-Path "$jdk17\bin\java.exe")) {
  $alt = Get-ChildItem "C:\Program Files\Microsoft\jdk-17*" -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($alt) { $jdk17 = $alt.FullName }
  else {
    Write-Error "JDK 17 not found. Install: winget install Microsoft.OpenJDK.17"
    exit 1
  }
}
$env:JAVA_HOME = $jdk17
$env:Path = "$jdk17\bin;" + ($env:Path -split ';' | Where-Object { $_ -notmatch 'Java\\jdk-26' }) -join ';'
Write-Host "JAVA_HOME=$env:JAVA_HOME"
& "$jdk17\bin\java.exe" -version
