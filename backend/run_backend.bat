@echo off
cd /d "C:\Users\Administrator\.gemini\antigravity\playground\photonic-omega\backend"
java -jar target\facilities-management-1.0.0.jar --spring.profiles.active=test --spring.jpa.hibernate.ddl-auto=update > logs\backend.log 2>&1
