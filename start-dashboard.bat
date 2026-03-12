@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "MAX_ATTEMPTS=3"
set "HEALTH_CHECK_RETRIES=6"
set "ATTEMPT=0"

set "PYTHON_OK="
where python >nul 2>nul && set "PYTHON_OK=1"
if not defined PYTHON_OK where py >nul 2>nul && set "PYTHON_OK=1"
if not defined PYTHON_OK goto :python_missing

:retry_start
set /a ATTEMPT+=1
call :pick_port
if not defined PORT goto :pick_port_failed

echo [INFO] Attempt !ATTEMPT!/%MAX_ATTEMPTS% - starting dashboard server on port !PORT!...
start "IG Dashboard Server :!PORT!" cmd /k ""%~dp0run-server.bat" !PORT!"

set "CHECK=0"
:health_loop
set /a CHECK+=1
powershell -NoProfile -Command "Start-Sleep -Seconds 1" >nul 2>nul
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:!PORT!/index.html' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 goto :startup_ok
if !CHECK! lss %HEALTH_CHECK_RETRIES% goto :health_loop

if !ATTEMPT! lss %MAX_ATTEMPTS% (
  echo [WARN] Attempt !ATTEMPT! failed health check. Retrying...
  goto :retry_start
)

goto :startup_failed

:startup_ok
echo [OK] Dashboard is ready: http://127.0.0.1:!PORT!/index.html
start "" "http://127.0.0.1:!PORT!/index.html"
exit /b 0

:python_missing
echo [ERROR] Python 3 was not found. Install Python and try again.
powershell -NoProfile -Command "try { Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('Cannot start dashboard because Python 3 is not installed.','IG Dashboard','OK','Error') | Out-Null } catch {}" >nul 2>nul
pause
exit /b 1

:pick_port_failed
echo [ERROR] Failed to allocate a local port.
powershell -NoProfile -Command "try { Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('Cannot allocate an available local port for dashboard startup.','IG Dashboard','OK','Error') | Out-Null } catch {}" >nul 2>nul
pause
exit /b 1

:startup_failed
echo [ERROR] Dashboard did not respond after %MAX_ATTEMPTS% attempts.
echo [ERROR] Please check server windows named "IG Dashboard Server :PORT" for details.
powershell -NoProfile -Command "try { Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('Dashboard startup failed after multiple retries. Check server windows for details.','IG Dashboard','OK','Error') | Out-Null } catch {}" >nul 2>nul
pause
exit /b 1

:pick_port
set "PORT="
for /f %%P in ('powershell -NoProfile -Command "$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0); $listener.Start(); $p = $listener.LocalEndpoint.Port; $listener.Stop(); Write-Output $p"') do set "PORT=%%P"
exit /b 0
