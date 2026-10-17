@echo off
title Jadwal Harian Muslim
echo ========================================================
echo   Menjalankan Jadwal Harian Muslim (Port 3000)...
echo ========================================================
echo.

start "Server Lokal" cmd /c "python -m http.server 3000 --directory ""d:\VIBE CODE\jadwal sholat"""
timeout /t 1 /nobreak >nul

echo Membuka website di Brave Browser...
start "" "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" "http://localhost:3000"

echo.
echo [OK] Website berhasil dibuka di Brave Browser!
echo.
echo --------------------------------------------------------
echo Tips: Untuk membuka di HP / orang lain, buka
echo terminal baru dan jalankan:
echo d:\tools\cloudflared.exe tunnel --url http://localhost:3000
echo --------------------------------------------------------
echo.
pause