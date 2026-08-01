$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$python = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path $python)) {
  throw "venv not found at $python - create it with: python -m venv .venv; .venv\Scripts\python.exe -m pip install -r requirements.txt"
}

# Console build on purpose: the exe is always spawned with windowsHide:true
# (CREATE_NO_WINDOW), so no window ever appears, while --noconsole would give
# the process unreliable std handles and a GUI crash dialog.
# --collect-data magika is mandatory: magika loads its ONNX model from package
# data that PyInstaller's static analysis cannot see.
$buildArgs = @(
  '-m', 'PyInstaller',
  '--noconfirm',
  '--clean',
  '--onedir',
  '--name', 'markitdown-bridge',
  '--collect-data', 'magika',
  '--collect-submodules', 'markitdown',
  '--collect-dynamic-libs', 'onnxruntime',
  '--exclude-module', 'tkinter',
  'bridge.py'
)
& $python @buildArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$dest = Join-Path (Split-Path $PSScriptRoot -Parent) 'resources\py\markitdown-bridge'
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
New-Item -ItemType Directory -Force (Split-Path $dest -Parent) | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'dist\markitdown-bridge') $dest -Recurse
Write-Host "Sidecar copied to $dest"
