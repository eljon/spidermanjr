# Spider-Man Jr.

A mobile-first web app: take a photo or video, it pops up on screen, and two seconds later a web shoots in from the right edge, grabs it, and swings it onto the collection shelf behind it.

## Features

- One **Take Photo / Video** button in the middle of the screen opens the phone camera in photo or video mode.
- Videos play inside the polaroid while the web grabs them, and play back when tapped on the shelf.
- Spidey sense warning, "THWIP!" web shot, splat impact, swing and landing animation.
- Collection shelf persists in the browser (thumbnails in `localStorage`, video files in IndexedDB), with tap to view or remove.
- Synthesized sound effects (toggle in the header) and haptics on supported devices.
- No build step and no dependencies: plain HTML, CSS and JavaScript.

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy

Served by GitHub Pages straight from the branch root (`index.html`). The `.nojekyll` file tells Pages to serve the files as is.

When you change `styles.css` or `app.js`, bump the `?v=` number on their links in `index.html` so browsers don't mix a new page with a cached old stylesheet or script.
