@echo off
cd /d "C:\TNVS-TEAM 8\TNVS-Team-8\backend"
set "JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot"
set "PATH=%JAVA_HOME%\bin;%PATH%"
java -jar target\facilities-management-1.0.0.jar --spring.profiles.active=test --spring.jpa.hibernate.ddl-auto=update > logs\backend.log 2>&1
