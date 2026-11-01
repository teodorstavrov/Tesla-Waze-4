@echo off
REM Registers/updates the scheduled tasks. Run by double-clicking (as admin).
REM  - BG cities: run-chain.bat.  Every 2h at 07:00.  (Waze via Chrome CDP)
REM  - BG route : run-route.bat.  Every 4h at 08:00.  (teslanav.com HTTP -- no Chrome)
REM  - NL/BE    : run-chain-benl.bat.  Once a day at 04:00  (nl->be chain)
REM  - NL       : run-nl.bat.          Once a day at 16:00  (standalone, 2nd NL run → 12h cadence)
set "DIR=C:\Data\WWW\Tesla Waze 4\waze-police-sync"

echo Removing old/duplicate tasks...
schtasks /Delete /TN "WazeSync" /F 2>nul
schtasks /Delete /TN "TesRadar-WazeSync" /F 2>nul
schtasks /Delete /TN "TesRadar-WazeSync-Cities" /F 2>nul
schtasks /Delete /TN "TesRadar-WazeSync-NL" /F 2>nul
schtasks /Delete /TN "TesRadar-WazeSync-Route" /F 2>nul
schtasks /Delete /TN "TesRadar-WazeSync-Chain" /F 2>nul
schtasks /Delete /TN "TesRadar-WazeSync-BENL" /F 2>nul
schtasks /Delete /TN "TesRadar-TeslaNavSync-Chain" /F 2>nul
schtasks /Delete /TN "TesRadar-TeslaNavSync-Route" /F 2>nul
schtasks /Delete /TN "TesRadar-TeslaNavSync-BENL" /F 2>nul

echo Creating TesRadar-TeslaNavSync-Chain (BG cities: every 2h at 07:00)...
schtasks /Create /TN "TesRadar-TeslaNavSync-Chain" /TR "\"%DIR%\run-chain.bat\"" /SC DAILY /ST 07:00 /RI 120 /DU 0018:00 /F

echo Creating TesRadar-TeslaNavSync-Route (BG route via teslanav.com: every 4h at 08:00)...
schtasks /Create /TN "TesRadar-TeslaNavSync-Route" /TR "\"%DIR%\run-route.bat\"" /SC DAILY /ST 08:00 /RI 240 /DU 0016:00 /F

echo Creating TesRadar-TeslaNavSync-BENL (NL+BE chain: daily at 04:00, nl-^>be)...
schtasks /Create /TN "TesRadar-TeslaNavSync-BENL" /TR "\"%DIR%\run-chain-benl.bat\"" /SC DAILY /ST 04:00 /F

echo Creating TesRadar-TeslaNavSync-NL (NL standalone: daily at 16:00, 2nd of the day = 12h cadence)...
schtasks /Create /TN "TesRadar-TeslaNavSync-NL" /TR "\"%DIR%\run-nl.bat\"" /SC DAILY /ST 16:00 /F

echo Creating TesRadar-ChromeDebug (launches debug Chrome at every logon)...
schtasks /Delete /TN "TesRadar-ChromeDebug" /F 2>nul
schtasks /Create /TN "TesRadar-ChromeDebug" /TR "\"%DIR%\start-chrome-debug.bat\"" /SC ONLOGON /F

echo.
echo Done. Verifying:
schtasks /Query /TN "TesRadar-TeslaNavSync-Chain" /V /FO LIST | findstr /I "TaskName Next Schedule Repeat"
schtasks /Query /TN "TesRadar-TeslaNavSync-Route" /V /FO LIST | findstr /I "TaskName Next Schedule Repeat"
schtasks /Query /TN "TesRadar-TeslaNavSync-BENL"  /V /FO LIST | findstr /I "TaskName Next Schedule Repeat"
schtasks /Query /TN "TesRadar-TeslaNavSync-NL"    /V /FO LIST | findstr /I "TaskName Next Schedule Repeat"
schtasks /Query /TN "TesRadar-ChromeDebug"        /V /FO LIST | findstr /I "TaskName Schedule"
echo.
echo BG cities every 2h (07:00); BG route every 4h (08:00); NL every 12h (04:00+16:00); BE daily (04:00).
pause
