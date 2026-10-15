@echo off
rem Jalankan backend. Bisa diklik dua kali atau diketik di cmd / PowerShell: run-dev.cmd
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-dev.ps1" %*
pause
