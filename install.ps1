# Install the aecdo CLI on Windows from GitHub Releases.
#
#   irm https://raw.githubusercontent.com/jeff-carmichael/aecdo/main/install.ps1 | iex
#
# Environment overrides:
#   AECDO_VERSION      release tag to install, e.g. v0.4.6 (default: latest)
#   AECDO_INSTALL_DIR  destination folder (default: %LOCALAPPDATA%\Programs\aecdo)
#   AECDO_EXAMPLES     1 to download the example drawing sets without asking,
#                      0 to skip them (default: ask in an interactive window)
#   AECDO_EXAMPLES_DIR where to put the examples (default: %USERPROFILE%\aecdo-examples)
#
# Files downloaded this way carry no "downloaded from the internet" mark, so
# Windows SmartScreen does not block the unsigned aecdo.exe.

# Wrapped in a function so `iex` leaves no variables behind, and so errors
# return instead of calling `exit`, which would close the user's window.
function Install-Aecdo {
  # Runs after the install so the new aecdo.exe does the download (see `aecdo examples`).
  function Request-AecdoExamples([string]$exe) {
    $choice = $env:AECDO_EXAMPLES
    $dir = if ($env:AECDO_EXAMPLES_DIR) { $env:AECDO_EXAMPLES_DIR } else { Join-Path $HOME 'aecdo-examples' }

    if ($choice -match '^(0|n|no|false)$') { return }
    # Releases before 0.4.7 have no `examples` command.
    if (-not (& $exe --help | Select-String -Quiet -Pattern '^  examples')) { return }
    if (-not $choice) {
      if ($env:CI -or -not [Environment]::UserInteractive -or [Console]::IsInputRedirected) { return }
      try {
        Write-Host ''
        $answer = Read-Host 'Download the example drawing sets (about 3 MB) to try aecdo? [Y/n]'
        if ($answer -match '^\s*n') { return }
        $answer = Read-Host "Folder [$dir]"
        if ($answer -and $answer.Trim()) { $dir = $answer.Trim() }
      } catch {
        return
      }
    }

    & $exe examples $dir --no-update-check
    if ($LASTEXITCODE -ne 0) {
      Write-Warning 'Could not download the examples. Run "aecdo examples" later to try again.'
    }
  }

  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'

  $repo = 'jeff-carmichael/aecdo'
  $asset = 'aecdo-windows-x64.zip'
  $version = if ($env:AECDO_VERSION) { $env:AECDO_VERSION } else { 'latest' }
  $installDir = if ($env:AECDO_INSTALL_DIR) { $env:AECDO_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'Programs\aecdo' }

  if (-not [Environment]::Is64BitOperatingSystem) {
    Write-Error 'aecdo needs 64-bit Windows.'
    return
  }

  # Windows PowerShell 5.1 may default to TLS 1.0, which GitHub rejects.
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

  if ($version -eq 'latest') {
    $base = "https://github.com/$repo/releases/latest/download"
  } else {
    $base = "https://github.com/$repo/releases/download/$version"
  }

  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("aecdo-install-" + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    $zip = Join-Path $tmp $asset
    $sums = Join-Path $tmp 'checksums.txt'

    Write-Host "Downloading $asset ($version)..."
    Invoke-WebRequest -UseBasicParsing -Uri "$base/$asset" -OutFile $zip
    Invoke-WebRequest -UseBasicParsing -Uri "$base/checksums.txt" -OutFile $sums

    $line = Get-Content $sums | Where-Object { $_ -match "\s\*?$([regex]::Escape($asset))$" } | Select-Object -First 1
    if (-not $line) { throw "No checksum listed for $asset" }
    $expected = ($line -split '\s+')[0].ToLower()
    $actual = (Get-FileHash -Algorithm SHA256 -Path $zip).Hash.ToLower()
    if ($expected -ne $actual) { throw "Checksum mismatch for $asset (expected $expected, got $actual)" }

    $unpacked = Join-Path $tmp 'unpacked'
    Expand-Archive -Path $zip -DestinationPath $unpacked
    $exe = Join-Path $unpacked 'aecdo.exe'
    if (-not (Test-Path $exe)) { throw "The archive did not contain aecdo.exe" }

    New-Item -ItemType Directory -Force -Path $installDir | Out-Null
    $target = Join-Path $installDir 'aecdo.exe'
    Copy-Item -Force -Path $exe -Destination $target
    Unblock-File -Path $target
  } finally {
    Remove-Item -Recurse -Force -Path $tmp -ErrorAction SilentlyContinue
  }

  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $entries = @($userPath -split ';' | Where-Object { $_ })
  if ($entries -notcontains $installDir) {
    [Environment]::SetEnvironmentVariable('Path', (($entries + $installDir) -join ';'), 'User')
    Write-Host "Added $installDir to your PATH. Open a new terminal for other windows to pick it up."
  }
  if (($env:Path -split ';') -notcontains $installDir) {
    $env:Path = "$env:Path;$installDir"
  }

  Write-Host "Installed aecdo to $target"
  & $target --version

  Request-AecdoExamples $target
}

Install-Aecdo
