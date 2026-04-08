@echo off
cd /d C:\Users\15193\Desktop\lexself\lexself-shared-backend\lexself-shared
echo.
echo === ClearStand Auto Push ===
echo.
git add -A
git commit -m "ClearStand update"
git push origin master
echo.
echo === Done! ===
pause
