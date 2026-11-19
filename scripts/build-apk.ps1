param(
  [ValidateSet('arm64-v8a', 'arm64-v8a,x86_64')]
  [string]$Architectures = 'arm64-v8a'
)
$ErrorActionPreference = 'Stop'
$taskProjectDirectory = Split-Path -Parent $PSScriptRoot
$taskPreviousNodeEnvironment = $env:NODE_ENV
$env:NODE_ENV = 'production'
$taskVersion = (Get-Content -Raw -LiteralPath (Join-Path $taskProjectDirectory 'app.json') | ConvertFrom-Json).expo.version
$taskKeyPath = Join-Path $taskProjectDirectory 'android/app/debug.keystore'
$taskKeyBackup = Join-Path $taskProjectDirectory 'credentials/development.keystore'
if (Test-Path -LiteralPath $taskKeyPath) {
  New-Item -ItemType Directory -Path (Split-Path -Parent $taskKeyBackup) -Force | Out-Null
  Copy-Item -LiteralPath $taskKeyPath -Destination $taskKeyBackup -Force
}
Push-Location -LiteralPath $taskProjectDirectory
try {
  try {
    & npx.cmd expo prebuild --platform android --no-install
    if ($LASTEXITCODE -ne 0) { throw 'Expo Android generation failed.' }
  } finally {
    if ((Test-Path -LiteralPath $taskKeyBackup) -and (Test-Path -LiteralPath (Split-Path -Parent $taskKeyPath))) {
      Copy-Item -LiteralPath $taskKeyBackup -Destination $taskKeyPath -Force
    }
  }
  Push-Location -LiteralPath (Join-Path $taskProjectDirectory 'android')
  try {
    # Expo's default release variant uses its development key; this APK is for personal testing.
    & .\gradlew.bat :app:assembleRelease "-PreactNativeArchitectures=$Architectures" "-Dorg.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=1024m" --max-workers=2 --no-daemon --console=plain
    if ($LASTEXITCODE -ne 0) { throw 'Android APK compilation failed.' }
  } finally { Pop-Location }
  $taskArtifactDirectory = Join-Path $taskProjectDirectory 'artifacts'
  New-Item -ItemType Directory -Path $taskArtifactDirectory -Force | Out-Null
  $taskApkPath = Join-Path $taskArtifactDirectory "flick-v$taskVersion.apk"
  Copy-Item -LiteralPath (Join-Path $taskProjectDirectory 'android/app/build/outputs/apk/release/app-release.apk') -Destination $taskApkPath -Force
  Write-Output "Personal testing APK: $taskApkPath"
  Get-FileHash -LiteralPath $taskApkPath -Algorithm SHA256
} finally {
  Pop-Location
  $env:NODE_ENV = $taskPreviousNodeEnvironment
}
