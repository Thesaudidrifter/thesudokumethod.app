# thesudokumethod.app

The website for The Sudoku Method. Plain HTML, CSS and JavaScript, with no build step. Everything in `docs/` is the
site, ready for GitHub Pages (branch `main`, folder `/docs`). `CNAME` holds the domain.

## On launch day
Open `docs/assets/page.js` and set `PLAY_URL` to the Play Store address. Every "Coming soon to Google Play" on the
home page becomes a "Get it on Google Play" link.

## When AdMob is set up
Add `docs/app-ads.txt` with the line AdMob gives you. It must sit at the root of the site.

## How the page works
- `assets/solve.js` is a real puzzle and its real solve, exported from the app's own grader (`expert-03`).
- `assets/board.js` draws the board. It only shows what it is told.
- `assets/page.js` turns the scroll position into a scene. Rewinding the scroll rewinds the solve.
- `engine/` is scroll-craft's engine, unmodified (MIT, see `engine/LICENSE.txt`).
- Fonts are subsets of the ones the app ships (SIL OFL, licences in `assets/fonts/`).

## For the ad
`SudokuFilm.seek(p)` in the browser console jumps the whole story to any point from 0 to 1 and holds it there, so the
same scenes can be stepped through frame by frame and rendered to video.

`BRIEF.md` records the design decisions.
