@echo off
setlocal
cd /d "%~dp0"
if not exist reports mkdir reports

python scripts/preflight_import.py
set import_code=%errorlevel%
python scripts/reconcile_import.py
set reconcile_code=%errorlevel%
python scripts/preflight_media.py
set media_code=%errorlevel%

echo.
echo === Preflight Result ===
if %import_code%==0 (echo Import: GO) else (echo Import: NO-GO)
if %reconcile_code%==0 (echo Reconcile: GO) else (echo Reconcile: NO-GO)
if %media_code%==0 (echo Media: GO) else (echo Media: NO-GO)

echo.
echo Reports:
echo - reports/preflight_summary.txt
echo - reports/reconciliation_report.txt
echo - reports/media_preflight_report.txt

if %import_code%==0 if %reconcile_code%==0 if %media_code%==0 (
  echo.
  echo FINAL: GO
  exit /b 0
)

echo.
echo FINAL: NO-GO
exit /b 2