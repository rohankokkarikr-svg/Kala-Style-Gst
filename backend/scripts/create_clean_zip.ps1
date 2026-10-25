Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$sourceDir = (Get-Location).Path
$zipPath = Join-Path $sourceDir "KalaStyle_Updated_Complete.zip"

if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

Write-Host "Creating clean zip archive at: $zipPath"

$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)

$excludeFolders = @('node_modules', '.git', 'build', '.cache', '.system_generated')
$excludeExtensions = @('.zip')

$fileCount = 0

Get-ChildItem -Path $sourceDir -Recurse -File | ForEach-Object {
    $file = $_
    $relPath = $file.FullName.Substring($sourceDir.Length + 1)
    
    $skip = $false
    foreach ($part in $relPath.Split([System.IO.Path]::DirectorySeparatorChar)) {
        if ($excludeFolders -contains $part) {
            $skip = $true
            break
        }
    }
    if ($excludeExtensions -contains $file.Extension.ToLower()) {
        $skip = $true
    }
    
    if (-not $skip) {
        $entryName = $relPath.Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        $fileCount++
    }
}

$zip.Dispose()
$zipSize = (Get-Item $zipPath).Length / 1MB
Write-Host "Successfully packaged $fileCount files into $zipPath ($([Math]::Round($zipSize, 2)) MB)"
