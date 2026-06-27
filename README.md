# maxims

*pinterest, but for words.*

A quiet, account-free place to collect the maxims, lines, and quotes you want to
keep -- and to organize them into boards. No login, no backend, nothing sent
anywhere: everything lives in your browser's `localStorage`. A sandbox.

## what it does

- **keep** a quote (with an optional attribution)
- everything you keep lives in your **profile** (the `all` view)
- make **boards** and save quotes to them -- a quote can live in your profile
  only, or in any number of boards
- a calm masonry **wall**, newest first
- copy any maxim to your clipboard

## stack

Plain HTML, CSS, and a single ES module -- no framework, no build step. The only
external asset is the [Newsreader](https://fonts.google.com/specimen/Newsreader)
typeface, used for the words themselves.

## run it

It's static. Open `index.html`, or serve the folder:

```bash
python3 -m http.server 8080   # then visit http://localhost:8080
```

## deploy

Static site -- point Vercel at this repo (Framework Preset: **Other**, no build
command, output directory `.`). Done.
