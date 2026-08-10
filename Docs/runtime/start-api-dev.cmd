@echo off
setlocal
set "Path="
set "PATH=C:\Windows\System32;C:\Windows;D:\Environment\nodejs;C:\Users\EDY\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
set "PORT=3100"
cd /d D:\Projects\TrainingManagementSystem
"C:\Users\EDY\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" "C:\Users\EDY\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\pnpm\bin\pnpm.mjs" --dir backend\api start:dev >>"D:\Projects\TrainingManagementSystem\Docs\runtime\api.stdout.log" 2>>"D:\Projects\TrainingManagementSystem\Docs\runtime\api.stderr.log"
