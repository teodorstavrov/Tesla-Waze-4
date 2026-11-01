@echo off
setlocal EnableExtensions EnableDelayedExpansion
REM ============================================================
REM  Netherlands standalone run via teslanav.com — second daily run (16:00).
REM  The first NL run is handled by run-chain-benl.bat at 04:00.
REM  Together they give a 12-hour cadence for NL.
REM ============================================================

set "DIR=C:\Data\WWW\Tesla Waze 4\waze-police-sync"
cd /d "%DIR%"

set "CHAINCUR=run-nl.current.log"
set "CHAINLOG=run-nl.log"
set "END_HOLD=15"

for /f "tokens=1,2" %%a in ('powershell -NoProfile -Command "Get-Date -Format \"yyyy-MM-dd HH:mm:ss\""') do set "TS_START=%%a %%b"
> "%CHAINCUR%" echo ##### NL-STANDALONE %TS_START% =====================================

call :log "================ NL STANDALONE START ================"
call "%DIR%\waze-sync.bat" nl
set "RC=!ERRORLEVEL!"
call :log "================ NL STANDALONE END (exit !RC!) ================"

powershell -NoProfile -ExecutionPolicy Bypass -File "rotate-log.ps1" -Log "%CHAINLOG%" -Tmp "%CHAINCUR%" -Keep 15 -Marker "##### NL-STANDALONE "

echo.
echo Log: run-nl.log + sync-nl.log
echo This window will close in %END_HOLD%s...
set /a _w=%END_HOLD%+1
ping -n !_w! 127.0.0.1 >nul
endlocal
exit /b 0

:log
for /f "tokens=1,2" %%a in ('powershell -NoProfile -Command "Get-Date -Format \"yyyy-MM-dd HH:mm:ss\""') do set "TS=%%a %%b"
echo [!TS!] %~1
>>"%CHAINCUR%" echo [!TS!] %~1
goto :eof
