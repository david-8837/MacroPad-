# ZERO Windows installer assets

The assisted NSIS installer uses a 164 × 314 px, 24-bit uncompressed BMP sidebar
on its welcome/finish pages and a 150 × 57 px, 24-bit uncompressed BMP header
on the other pages. `setup-icon.ico` is the download-arrow variant of the ZERO
mark for the installer executable; the app and uninstaller keep the standard
ZERO icon. Editable SVG artwork is included alongside the bitmaps and icon.

The small NSIS include adds the standard welcome page for new interactive
installs and skips it for updates. It customizes the progress page heading and
status, while retaining the native progress bar, and gives the stock finish
page clearer copy and its existing Launch ZERO checkbox. It leaves
electron-builder's installation, directory selection, launch implementation,
silent install and uninstall behavior in place. Rebuild
and test on Windows after changing the graphics or NSIS include; the preview is
not a screenshot of the real installer. The test installer is unsigned.
