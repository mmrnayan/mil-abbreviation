param([ValidateSet('Debug','Release')][string]$Configuration = 'Debug')
$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$nativeRoot = Join-Path $appRoot 'platforms\capacitor-mobile\android'
if (-not $env:JAVA_HOME) {
  $localJdk = Get-ChildItem -LiteralPath (Join-Path $appRoot '.tooling\jdk21') -Directory -ErrorAction SilentlyContinue | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin\java.exe') } | Select-Object -First 1
  if (-not $localJdk) { throw 'Set JAVA_HOME to a JDK 21 installation.' }
  $env:JAVA_HOME = $localJdk.FullName
}
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not (Test-Path -LiteralPath $env:ANDROID_HOME)) { throw 'Set ANDROID_HOME to an Android SDK installation containing API 36.' }
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
Push-Location -LiteralPath $nativeRoot
try {
  & '.\gradlew.bat' "assemble$Configuration" --no-daemon
  if ($LASTEXITCODE -ne 0) { throw 'Android build failed.' }
} finally { Pop-Location }
