@echo off
rem Jalankan backend + landing + app. Bisa diklik dua kali atau diketik di cmd / PowerShell: start-dev.cmd
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dev.ps1"
pause
