@echo off
setlocal
set "Path="
set "PATH=C:\Windows\System32;C:\Windows;D:\Environment\nodejs;C:\Users\EDY\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
cd /d D:\Projects\TrainingManagementSystem
"C:\Users\EDY\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" "C:\Users\EDY\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\pnpm\bin\pnpm.mjs" --dir frontend\admin-react dev >>"D:\Projects\TrainingManagementSystem\Docs\runtime\admin.stdout.log" 2>>"D:\Projects\TrainingManagementSystem\Docs\runtime\admin.stderr.log"
