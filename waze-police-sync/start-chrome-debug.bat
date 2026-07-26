@echo off
REM Launches a dedicated Chrome with a remote-debugging port so sync.mjs can
REM attach to it (CDP). This Chrome is separate from your normal browsing.
REM Leave this window/Chrome open while the sync runs.

set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

start "" "%CHROME%" --remote-debugging-port=9222 --incognito --user-data-dir="C:\Data\WWW\Tesla Waze 4\WazeSync\chrome-profile" "https://www.waze.com/bg/live-map"
