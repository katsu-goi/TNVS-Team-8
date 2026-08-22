@echo off
REM ---------------------------------------------------------------------------
REM One-command verification runner.
REM
REM Why this file exists: the assistant's shell access has been unavailable, so
REM the build must be run by hand. Rather than ask an operator to reproduce a
REM long command line in PowerShell -- where && is not a statement separator and
REM ./mvnw is the bash script, not the Windows one -- this batch file does the
REM whole thing and writes the full output to ..\.diag\verify.log so the log can
REM be read back directly.
REM
REM Usage, from PowerShell or cmd, in this directory:
REM     .\verify.cmd
REM
REM Exit code 0 = compiled AND the targeted tests passed.
REM ---------------------------------------------------------------------------
REM DELIBERATE STYLE RULE - PLEASE DO NOT UNDO IT.
REM This script uses `if ... goto :label` and contains no parenthesised if-blocks
REM and no round brackets in any echoed text.
REM
REM Run 2 died with "--- was unexpected at this time." *after a clean compile*,
REM having never run a test. The cause was this line, which sat inside an
REM `if errorlevel 1 ( ... )` block:
REM
REM     echo --- test-compile (online retry) --- >> "%LOG%"
REM
REM cmd.exe does not track bracket nesting inside a block, so the bracket after
REM "retry" closed the block early and the leftover `---` was parsed as a
REM command, which aborts the whole batch file. The same text at the top level
REM is harmless, which is why the offline compile logged fine one line earlier.
REM Labels cannot fail that way, so the failure class is gone rather than patched.
REM ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0"

REM --- Java: same fallback as run-dev.cmd, so this works with a bare PATH. ----
if defined JAVA_HOME goto :java_ready
if exist "C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot\bin\java.exe" set "JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot"
:java_ready
if defined JAVA_HOME set "PATH=%JAVA_HOME%\bin;%PATH%"

java -version >nul 2>&1
if errorlevel 1 goto :no_java

REM --- Maven wrapper: called by absolute path. -------------------------------
REM Run 1 failed with "'mvnw.cmd' is not recognized as an internal or external
REM command" even though backend\mvnw.cmd exists and this script had already cd'd
REM here, because cmd.exe on this machine does not search the current directory
REM for commands. %~dp0 is this file's own directory and already ends in a
REM backslash. Proven working in run 2.
set "MVNW=%~dp0mvnw.cmd"
if not exist "%MVNW%" goto :no_wrapper

set "LOGDIR=%~dp0..\.diag"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
set "LOG=%LOGDIR%\verify.log"

echo [verify] full output goes to: %LOG%
echo === verify.cmd run === > "%LOG%"
echo wrapper: %MVNW% >> "%LOG%"
java -version >> "%LOG%" 2>&1

REM --- Step 1: compile main + test sources. -----------------------------------
REM Proven clean in run 2: 253 main sources and 10 test sources, BUILD SUCCESS in
REM 2m02s offline. Kept in place because it is now the fast incremental path and
REM because a test run against stale classes would be worthless.
echo.
echo [1/2] Compiling main + test sources...
echo --- test-compile offline --- >> "%LOG%"
call "%MVNW%" -B -o test-compile >> "%LOG%" 2>&1
if not errorlevel 1 goto :compiled
echo       offline compile failed - retrying with network access...
echo --- test-compile online retry --- >> "%LOG%"
call "%MVNW%" -B test-compile >> "%LOG%" 2>&1
if errorlevel 1 goto :compile_failed
:compiled
echo       [ok] compiled clean.

REM --- Step 2: run the checks that were written before their fixes. ------------
REM ApprovalStateTransitionTest is deliberately NOT @Transactional - it commits,
REM because the REQUIRES_NEW writes it verifies are invisible to a test-managed
REM transaction that never commits. It cleans up after itself in @AfterEach.
REM failIfNoSpecifiedTests=false so a renamed or missing class reports as "not
REM run" instead of a hard build failure that hides the other classes' results.
echo.
echo [2/2] Running the approval-gate, state-transition and error-mapping checks...
echo --- surefire --- >> "%LOG%"
call "%MVNW%" -B -o test -Dtest=ApprovalGateTest,ApprovalStateTransitionTest,ClientErrorMappingTest -DfailIfNoSpecifiedTests=false >> "%LOG%" 2>&1
set "TESTRC=%ERRORLEVEL%"

echo.
echo ------------------------------ summary ---------------------------
findstr /C:"Tests run:" "%LOG%"
findstr /C:"BUILD" "%LOG%"
echo -----------------------------------------------------------------

if not "%TESTRC%"=="0" goto :tests_failed

echo.
echo [PASS] Compiled clean and the targeted tests passed.
echo        Full log: %LOG%
exit /b 0

REM --------------------------- failure exits ---------------------------------

:no_java
echo [FAIL] No Java on PATH and JAVA_HOME is not set to a JDK 21 install.
echo        Install JDK 21, or set JAVA_HOME, then re-run.
exit /b 1

:no_wrapper
echo [FAIL] Maven wrapper not found at:
echo        %MVNW%
echo        Run this script from inside the backend directory of the worktree:
echo        C:\TNVS-TEAM 8\TNVS-Team-8\.claude\worktrees\nice-euclid-9c747a\backend
exit /b 1

:compile_failed
echo.
echo [FAIL] The compile step failed. Errors below, and in full in %LOG%.
echo        If these mention downloading rather than source code, the Maven
echo        distribution itself could not be fetched - check network access.
echo ------------------------------------------------------------------
findstr /C:"[ERROR]" "%LOG%"
echo ------------------------------------------------------------------
exit /b 1

:tests_failed
echo.
echo [FAIL] Tests did not pass. Failures below and in full in %LOG%.
echo        Per-test detail with stack traces: target\surefire-reports\
echo ------------------------------------------------------------------
findstr /C:"[ERROR]" "%LOG%"
echo ------------------------------------------------------------------
exit /b 1
