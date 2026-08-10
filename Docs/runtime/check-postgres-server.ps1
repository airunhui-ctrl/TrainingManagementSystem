$ErrorActionPreference = 'SilentlyContinue'
Write-Output '=== system ==='
Get-ComputerInfo | Select-Object WindowsProductName,WindowsVersion,OsArchitecture
Write-Output '=== node ==='
node --version
Write-Output '=== postgres client ==='
psql --version
Write-Output '=== listening ports ==='
Get-NetTCPConnection -State Listen | Where-Object LocalPort -in 22,3100,5174,5185,5432 | Select-Object LocalAddress,LocalPort,OwningProcess
Write-Output '=== postgres service candidates ==='
Get-Service | Where-Object { $_.Name -match 'postgres' -or $_.DisplayName -match 'postgres' } | Select-Object Name,Status,DisplayName
