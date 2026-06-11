param(
  [string]$SourceDir = (Get-Location).Path,
  [string]$SeedJson = (Join-Path (Get-Location).Path "membership13_researchlog.json"),
  [string]$OutDir = (Join-Path (Get-Location).Path "dist"),
  [string]$ZipName = "research-memory-guide-extension.zip"
)

$ErrorActionPreference = "Stop"

function Write-Step($Message) {
  Write-Host "==> $Message" -ForegroundColor Cyan
}

$required = @("manifest.json", "background.js", "content.js", "popup.html", "popup.js", "style.css", "icon128.png")
foreach ($file in $required) {
  $path = Join-Path $SourceDir $file
  if (-not (Test-Path $path)) { throw "Missing required extension file: $path" }
}
if (-not (Test-Path $SeedJson)) { throw "Missing seed JSON file: $SeedJson" }

Write-Step "Preparing clean build folder"
$buildDir = Join-Path $OutDir "research-memory-guide-build"
if (Test-Path $buildDir) { Remove-Item $buildDir -Recurse -Force }
New-Item -ItemType Directory -Path $buildDir -Force | Out-Null

Write-Step "Copying extension files"
foreach ($file in $required) {
  Copy-Item (Join-Path $SourceDir $file) (Join-Path $buildDir $file) -Force
}

Write-Step "Embedding stored research-log JSON"
$raw = Get-Content $SeedJson -Raw
$seedObject = $raw | ConvertFrom-Json
if (-not $seedObject.records) { throw "Seed JSON must contain records[]." }
$seedObject | ConvertTo-Json -Depth 100 | Set-Content -Path (Join-Path $buildDir "membership13_researchlog.json") -Encoding UTF8

Write-Step "Validating public extension manifest"
$manifestPath = Join-Path $buildDir "manifest.json"
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$manifest.name = "Research Memory Guide"
$manifest.version = "2.0.0"
$manifest.description = "A worldwide research-memory guide that helps users recognize useful pages, keep a local JSON log, copy shareable prompts, and track research completion."
$manifest | ConvertTo-Json -Depth 100 | Set-Content -Path $manifestPath -Encoding UTF8

Write-Step "Creating ZIP package"
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
$zipPath = Join-Path $OutDir $ZipName
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $buildDir "*") -DestinationPath $zipPath -Force

$hash = Get-FileHash $zipPath -Algorithm SHA256
Write-Host "Built: $zipPath" -ForegroundColor Green
Write-Host "SHA256: $($hash.Hash)" -ForegroundColor Green
Write-Host "Load unpacked folder for testing: $buildDir" -ForegroundColor Yellow
