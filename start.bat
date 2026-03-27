@echo off
echo Starting SmartMouse under watchdog supervision
echo ==============================================
echo.
echo Make sure you have configured your API key in config.json
echo SmartMouse API will be served on http://localhost:7901
echo.
echo Press Ctrl+C to stop the watchdog and the supervised service
echo.
npm run start:watchdog