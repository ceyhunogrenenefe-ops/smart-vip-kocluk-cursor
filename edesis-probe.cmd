@echo off
cd /d "%~dp0"

if "%EDESIS_API_KEY%"=="" (
  set /p EDEESIS_API_KEY=Edesis API key: 
)

if "%EDESIS_INSTITUTION_CODE%"=="" set "EDESIS_INSTITUTION_CODE=onlinevipdershane"
if "%EDESIS_AUTH_MODE%"=="" set "EDESIS_AUTH_MODE=x-api-key"
if "%EDESIS_API_BASE_URL%"=="" set "EDESIS_API_BASE_URL=https://onlinevipdershane.api.edesis.com"
if "%EDESIS_RESULTS_PATH%"=="" set "EDESIS_RESULTS_PATH=/api/external/sinav-sonuclari"

echo Proje: %CD%
node "%~dp0scripts\edesis-probe-once.mjs"
