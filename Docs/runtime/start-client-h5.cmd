@echo off
cd /d D:\Projects\TrainingManagementSystem
set LOG_DIR=D:\Projects\TrainingManagementSystem\Docs\runtime
echo [%date% %time%] starting client h5>>"%LOG_DIR%\client-h5.launch.log"
"C:\Users\EDY\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" "C:\Users\EDY\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\pnpm\bin\pnpm.mjs" --dir frontend/client-uni dev:h5 >>"%LOG_DIR%\client-h5.launch.log" 2>&1
echo [%date% %time%] exited with %errorlevel%>>"%LOG_DIR%\client-h5.launch.log"
