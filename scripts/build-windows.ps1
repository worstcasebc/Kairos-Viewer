# Baut den Kairos Viewer unter Windows (.msi und NSIS-.exe).
# Aufruf aus dem Projektordner:  powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

function Require-Command($name, $hint) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        Write-Host "FEHLT: $name. $hint" -ForegroundColor Red
        exit 1
    }
}

Require-Command node  'Node.js LTS installieren: https://nodejs.org'
Require-Command npm   'Wird mit Node.js installiert.'
Require-Command cargo 'Rust installieren: https://rustup.rs (Standard-Toolchain stable-msvc).'

$hostLine = (rustc -vV | Select-String '^host:').ToString()
if ($hostLine -notmatch 'msvc') {
    Write-Host "Rust-Toolchain muss MSVC sein ($hostLine). Ausführen: rustup default stable-msvc" -ForegroundColor Red
    exit 1
}

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$vcTools = if (Test-Path $vswhere) {
    & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
}
if (-not $vcTools) {
    Write-Host 'Visual Studio Build Tools mit C++-Workload fehlen: https://visualstudio.microsoft.com/visual-cpp-build-tools/' -ForegroundColor Red
    exit 1
}

npm ci;   if ($LASTEXITCODE) { exit $LASTEXITCODE }
npm test; if ($LASTEXITCODE) { exit $LASTEXITCODE }
npm run build; if ($LASTEXITCODE) { exit $LASTEXITCODE }
cargo test --manifest-path src-tauri\Cargo.toml; if ($LASTEXITCODE) { exit $LASTEXITCODE }
npm run tauri build; if ($LASTEXITCODE) { exit $LASTEXITCODE }

Get-ChildItem src-tauri\target\release\bundle -Recurse -Include *.msi, *-setup.exe |
    ForEach-Object { Write-Host "Erstellt: $($_.FullName)" -ForegroundColor Green }
