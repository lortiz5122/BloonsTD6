# AGENTS.md

## Cursor Cloud specific instructions

### What this is
`monkey-meadow/` is a self-contained, browser-based tower-defense game (a BTD6 "Monkey Meadow" recreation). It is pure static frontend: `index.html`, `style.css`, and `game.js` (vanilla ES2022 + HTML5 Canvas). There is no backend, no package manager, no build step, no automated tests, and no lint config.

### Running the game (the only "service")
Serve the folder over HTTP and open it in a browser — do not rely on `file://` (the `<script>`/asset loads are cleaner over HTTP):

```
cd monkey-meadow && python3 -m http.server 8000
```

Then open `http://localhost:8000/index.html`. Python 3 is preinstalled; any static file server works equally well.

### Build / test / lint
None exist. There is nothing to build, no test runner, and no linter configured. "Verifying" a change means loading the page in a browser and playing: dismiss the tutorial → press `Q` to pick a Dart Monkey → click grass near the path to place it → press `Space` to start the round → confirm towers auto-shoot and pop bloons.

### Gotchas
- Since there is no bundler, edits to `game.js`/`style.css` require a plain browser refresh to take effect (no hot reload).
- The canvas is fixed at 1280x720; gameplay logic assumes that coordinate space.
