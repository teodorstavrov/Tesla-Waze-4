@echo off
setlocal EnableExtensions EnableDelayedExpansion
REM ============================================================
REM  BULGARIA CITIES sync. Runs CITIES ONCE (sync.mjs does its own per-tile
REM  retry); a partial miss is accepted -- missing cities fill on the next cycle.
REM  ROUTE runs on its OWN offset task (run-route.bat). NL+BE: run-chain-benl.bat.
REM  Markers are posted to TesRadar at the end of the run.
REM
REM  Live status: shown in THIS window + written to run-chain.current.log.
REM  History: prepended (NEWEST ON TOP) into run-chain.log, last 30 runs.
REM ============================================================

set "DIR=C:\Data\WWW\Tesla Waze 4\waze-police-sync"
cd /d "%DIR%"
set "CHAINLOG=run-chain.log"
set "CHAINCUR=run-chain.current.log"

set "WAZE_JITTER_MIN=0"
set "END_HOLD=30"
set "START_JITTER_MAX_MIN=8"

REM Fresh "current run" file with a column-0 marker header for newest-on-top.
for /f "tokens=1,2" %%a in ('powershell -NoProfile -Command "Get-Date -Format \"yyyy-MM-dd HH:mm:ss\""') do set "TS_START=%%a %%b"
> "%CHAINCUR%" echo ##### CHAIN %TS_START% =====================================

call :log "================ CHAIN START ================"

REM Make sure the debug Chrome is up (launch it if the port is dead).
call :ensure_chrome

if %START_JITTER_MAX_MIN% EQU 0 goto after_jitter
set /a _jmax=%START_JITTER_MAX_MIN%*60+1
set /a _js=!RANDOM! %% !_jmax!
call :log "Start jitter: waiting !_js!s before run..."
set /a _w=!_js!+1
ping -n !_w! 127.0.0.1 >nul
:after_jitter

call :log "PHASE: CITIES  -- START"
call "%DIR%\waze-sync.bat" cities
set "RC=!ERRORLEVEL!"
call :log "PHASE: CITIES  -- END (exit !RC!)"
if "!RC!"=="0" goto :cities_ok
if "!RC!"=="4" goto :cities_partial
call :log "CITIES hard-blocked/failed (exit !RC!) -- next scheduled cycle will retry."
goto :cities_done
:cities_ok
call :log "CITIES passed cleanly."
goto :cities_done
:cities_partial
call :log "CITIES partially incomplete (exit 4) -- good enough; missing cities fill next cycle."
:cities_done

call :log "================ CHAIN COMPLETE ================"

REM Prepend this run to the TOP of run-chain.log; keep the last 30.
powershell -NoProfile -ExecutionPolicy Bypass -File "rotate-log.ps1" -Log "%CHAINLOG%" -Tmp "%CHAINCUR%" -Keep 30 -Marker "##### CHAIN "

echo.
echo Logs (newest on top): run-chain.log (phases) + sync-cities.log (details).
echo This window will close in %END_HOLD%s...
set /a _w=%END_HOLD%+1
ping -n !_w! 127.0.0.1 >nul
endlocal
exit /b 0

REM ---- helper: ensure the debug Chrome (CDP port 9222) is running ----
:ensure_chrome
powershell -NoProfile -Command "try{$c=New-Object Net.Sockets.TcpClient;$c.Connect('127.0.0.1',9222);$c.Close();exit 0}catch{exit 1}"
if %ERRORLEVEL% EQU 0 ( call :log "Debug Chrome already running on :9222." & goto :eof )
call :log "Debug Chrome not running -- launching start-chrome-debug.bat and waiting 20s..."
call "%DIR%\start-chrome-debug.bat"
ping -n 21 127.0.0.1 >nul
goto :eof

REM ---- helper: timestamped line to console AND the current-run file ----
:log
for /f "tokens=1,2" %%a in ('powershell -NoProfile -Command "Get-Date -Format \"yyyy-MM-dd HH:mm:ss\""') do set "TS=%%a %%b"
echo [!TS!] %~1
>>"%CHAINCUR%" echo [!TS!] %~1
goto :eof
