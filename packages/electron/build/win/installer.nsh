!macro customInstall
  ; Add CLI directory to PATH
  nsExec::ExecToLog 'setx PATH "%PATH%;$INSTDIR\resources\cli"'
!macroend

!macro customUnInstall
  ; PATH cleanup is not straightforward in NSIS
  ; Users may need to manually remove from PATH
!macroend
