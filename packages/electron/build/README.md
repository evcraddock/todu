# Desktop app icons

`icon-source.png` is the master image. To regenerate the PNG sizes, macOS ICNS,
Windows ICO, and runtime `resources/app-icon.png` used by the window, Dock, and menu bar/tray, run on macOS:

```sh
npm run --workspace=packages/electron generate:icons
```

The generator uses the macOS `sips` and `iconutil` utilities. Generated assets are
checked in, so packaging on Windows and Linux does not need those utilities.
