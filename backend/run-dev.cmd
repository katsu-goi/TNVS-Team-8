@echo off
REM ---------------------------------------------------------------------------
REM Zero-configuration backend launcher.
REM
REM Path-independent: derives every path from this script's own location
REM (%~dp0) instead of hardcoding a checkout, so it works from a clone, a
REM worktree, or a copied folder. Builds the jar if it is missing rather than
REM failing with "Unable to access jarfile".
REM
REM Uses the `dev` profile: file-backed H2, no external database, no
REM credentials. Override with:  run-dev.cmd local
REM ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0"

set "PROFILE=%~1"
if "%PROFILE%"=="" set "PROFILE=dev"

if not defined JAVA_HOME (
  if exist "C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot\bin\java.exe" (
    set "JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot"
  )
)
if defined JAVA_HOME set "PATH=%JAVA_HOME%\bin;%PATH%"

java -version >nul 2>&1
if errorlevel 1 (
  echo [FAIL] No Java on PATH and JAVA_HOME is not set to a JDK 21 install.
  echo        Install JDK 21, or set JAVA_HOME and re-run.
  exit /b 1
)

set "JAR=target\facilities-management-1.0.0.jar"
if not exist "%JAR%" (
  echo [build] %JAR% missing - building it first...
  call mvnw.cmd -B -DskipTests package
  if errorlevel 1 (
    echo [FAIL] Build failed. The Maven output above names the cause.
    exit /b 1
  )
)

if not exist logs mkdir logs

echo [run] profile=%PROFILE%  port=8080  context-path=/api
echo [run] health: http://localhost:8080/api/actuator/health
java -jar "%JAR%" --spring.profiles.active=%PROFILE%
endlocal
