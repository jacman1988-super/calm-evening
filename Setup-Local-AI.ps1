$ErrorActionPreference = 'Stop'
$localFolder = Join-Path $PSScriptRoot '.local-ai'
New-Item -ItemType Directory -Path $localFolder -Force | Out-Null
function Get-VerifiedFile($Url, $Name, $Sha256) {
  $destination = Join-Path $localFolder $Name
  if ((Test-Path -LiteralPath $destination) -and (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -eq $Sha256) { return $destination }
  $partial = "$destination.download"
  Write-Host "Downloading $Name"
  Invoke-WebRequest -Uri $Url -OutFile $partial
  if ((Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash -ne $Sha256) { throw 'Downloaded file checksum does not match its official source. Nothing was launched.' }
  Move-Item -LiteralPath $partial -Destination $destination -Force
  return $destination
}
$runtime = Get-VerifiedFile 'https://github.com/ggml-org/llama.cpp/releases/download/b11552/llama-b11552-bin-win-cpu-x64.zip' 'llama-b11552-bin-win-cpu-x64.zip' 'c00741179811ff903b515eae28bdeef1f47af6e81c49920c4e68b62954e056d6'
$model = Get-VerifiedFile 'https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q8_0.gguf' 'Qwen3-1.7B-Q8_0.gguf' '061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a'
$extractFolder = Join-Path $localFolder 'llama-b11552'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($runtime)
try {
  $prefix = [IO.Path]::GetFullPath($extractFolder) + [IO.Path]::DirectorySeparatorChar
  foreach ($entry in $zip.Entries) {
    $target = [IO.Path]::GetFullPath((Join-Path $extractFolder $entry.FullName))
    if (-not $target.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe archive entry.' }
  }
} finally { $zip.Dispose() }
Expand-Archive -LiteralPath $runtime -DestinationPath $extractFolder -Force
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/ggml-org/llama.cpp/b11552/LICENSE' -OutFile (Join-Path $localFolder 'llama-LICENSE.txt')
Invoke-WebRequest -Uri 'https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/main/LICENSE' -OutFile (Join-Path $localFolder 'Qwen-LICENSE.txt')
Write-Host 'Local runtime and model downloaded and checksum verified. No installer, account, payment or model execution.'
