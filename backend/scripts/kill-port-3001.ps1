# Libera a porta 3001 encerrando o processo que a usa
$found = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($found) {
  Stop-Process -Id $found.OwningProcess -Force
  Write-Host "Processo $($found.OwningProcess) encerrado. Porta 3001 liberada."
} else {
  Write-Host "Nenhum processo encontrado na porta 3001."
}
