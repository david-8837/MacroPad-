# Keep electron-builder's native, accessible installation flow. Fresh
# interactive installs get a branded welcome; updates skip the extra page.
!macro customWelcomePage
  !insertmacro skipPageIfUpdated
  !insertmacro MUI_PAGE_WELCOME

  # The stock finish page owns the launch checkbox and its StartApp function.
  # Only change its text, so silent installs, updates and launch behavior stay
  # under electron-builder's control. These defines are consumed by that page.
  !define MUI_FINISHPAGE_TITLE "ZERO is installed"
  !define MUI_FINISHPAGE_TEXT "ZERO Deck Studio has been installed. Click Finish to close setup."
  !define MUI_FINISHPAGE_RUN_TEXT "Launch ZERO Deck Studio"
!macroend

# This hook is inserted immediately before the stock install-files page. The
# real NSIS progress bar remains in control; no simulated percentage or extra
# installation operations are introduced.
!macro customPageAfterChangeDir
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW zeroProgressShow
  Function zeroProgressShow
    !insertmacro MUI_HEADER_TEXT "Installing ZERO" "Please wait while setup installs ZERO Deck Studio."
    FindWindow $0 "#32770" "" $HWNDPARENT
    GetDlgItem $0 $0 1006
    SendMessage $0 0x000C 0 "STR:Installing ZERO Deck Studio. This may take a moment."
  FunctionEnd
!macroend
