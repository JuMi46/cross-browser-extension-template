# Cross browser extension template

## Build browser-specific packages

This project uses source files in `extension/` and generates browser-specific output in `dist/`.

Source JavaScript uses `browser.*` APIs.
During Chrome builds, generated JS is rewritten to `chrome.*` APIs.

Build-time configuration is loaded from `.env` in the project root.


Setup:

1. Copy `.env.example` to `.env`

- Chrome build: `npm run build:chrome`
- Firefox build: `npm run build:firefox`
- Both builds: `npm run build`

`npm run build` and `npm run build:chrome` also create `dist/Mealie import chrome extension.zip` from `dist/chrome`.

`npm run build` and `npm run build:firefox` also create `dist/Mealie import firefox extension.xpi` from `dist/firefox`.

## Load extension for testing

- Chrome: load unpacked from `dist/chrome`
- Firefox temporary add-on: load from `dist/firefox/manifest.json`

Do not load the workspace root when testing both browsers, because each browser has different background requirements.
