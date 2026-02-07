# Quick optimization script for Windows PowerShell
# Optimizes background.jpg and audio files

Write-Host "🚀 Quick Asset Optimization" -ForegroundColor Green
Write-Host ""

# Check if background.jpg exists
$bgPath = "src\assets\background.jpg"
if (Test-Path $bgPath) {
    $size = (Get-Item $bgPath).Length / 1MB
    Write-Host "📊 Current background.jpg size: $([math]::Round($size, 2)) MB" -ForegroundColor Yellow
    
    if ($size -gt 1) {
        Write-Host "⚠️  WARNING: background.jpg is too large! (>1 MB)" -ForegroundColor Red
        Write-Host ""
        Write-Host "Please optimize background.jpg manually:" -ForegroundColor Yellow
        Write-Host "1. Go to https://tinypng.com/ or https://squoosh.app/" -ForegroundColor Cyan
        Write-Host "2. Upload src/assets/background.jpg" -ForegroundColor Cyan
        Write-Host "3. Resize to 1080x1920 pixels" -ForegroundColor Cyan
        Write-Host "4. Set quality to 75% or lower" -ForegroundColor Cyan
        Write-Host "5. Download and replace the original" -ForegroundColor Cyan
        Write-Host ""
    }
}

# Check audio files
Write-Host "🎵 Checking audio files..." -ForegroundColor Green
$audioFiles = Get-ChildItem "src\assets\*.mp3"
$totalAudioSize = ($audioFiles | Measure-Object -Property Length -Sum).Sum / 1KB

Write-Host "   Total audio size: $([math]::Round($totalAudioSize, 2)) KB" -ForegroundColor Yellow

if ($totalAudioSize -gt 200) {
    Write-Host "⚠️  Audio files can be optimized!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Optimize using:" -ForegroundColor Cyan
    Write-Host "  - https://www.freeconvert.com/mp3-compressor" -ForegroundColor Cyan
    Write-Host "  - Set to: Mono, 32kbps (48kbps for bg_music)" -ForegroundColor Cyan
    Write-Host ""
}

Write-Host "📋 Summary of large files:" -ForegroundColor Green
Get-ChildItem "src\assets" | Where-Object { $_.Length -gt 100KB } | ForEach-Object { 
    $sizeKB = [math]::Round($_.Length / 1KB, 2)
    $color = if ($sizeKB -gt 500) { "Red" } else { "Yellow" }
    Write-Host "   $($_.Name): $sizeKB KB" -ForegroundColor $color
}

Write-Host ""
Write-Host "✅ After optimization, run: npm run build" -ForegroundColor Green
