# Desktop app icons

`icon-source.png` is the master image. To regenerate the PNG sizes, macOS ICNS,
Windows ICO, and runtime `resources/app-icon.png` used by the window, Dock, and Windows/Linux tray, run on macOS:

```sh
npm run --workspace=packages/electron generate:icons
```

The generator uses the macOS `sips` and `iconutil` utilities. Generated assets are
checked in, so packaging on Windows and Linux does not need those utilities.

The macOS menu bar uses a separate monochrome checkmark with a transparent background.
Electron marks it as a template image so macOS adapts its color to the menu bar.
Regenerate its standard and Retina PNGs with `npm run --workspace=packages/electron generate:tray-icon`
on macOS. Its vector source is `scripts/generate-tray-icon.swift`; both generated PNGs are checked in.
