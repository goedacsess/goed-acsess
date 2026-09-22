!macro customInit
  nsExec::Exec 'taskkill /F /IM "Goed Access.exe" /T'
  nsExec::Exec 'taskkill /F /IM "iServis Pro.exe" /T'
!macroend
