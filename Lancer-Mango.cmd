@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Installe Node.js 22.18 ou plus recent, puis relance ce fichier.
  pause
  exit /b 1
)
if not exist "server\node_modules\tsx\package.json" (
  echo Premiere installation : npm run setup puis npx --prefix server playwright install chromium
  pause
  exit /b 1
)
echo Ouvre http://127.0.0.1:3000 apres le message Mango pret.
call npm start
pause
