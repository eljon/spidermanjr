# Spider-Man Jr.

A mobile-first web app: take or choose a photo, it pops up on screen, and two seconds later a web shoots in from the right edge, grabs the photo, and swings it onto the collection shelf behind it.

## Features

- **Take Photo** opens the camera on phones; **Choose Photo** opens the photo library.
- Spidey sense warning, "THWIP!" web shot, splat impact, swing and landing animation.
- Collection shelf persists in the browser (`localStorage`), with tap to view or remove.
- Synthesized sound effects (toggle in the header) and haptics on supported devices.
- No build step and no dependencies: plain HTML, CSS and JavaScript.

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy

Served by GitHub Pages straight from the branch root (`index.html`). The `.nojekyll` file tells Pages to serve the files as is.
