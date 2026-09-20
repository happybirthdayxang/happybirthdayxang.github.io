# 🎈 Birthday Balloon

A tiny birthday gift app: a balloon rises, you tap it, it pops into confetti,
photo balloons, and a letter. Made to be opened on a phone.

## Personalise it (no coding needed)

Everything you can change lives in **one file: `config.js`**. Open it in any
text editor (Notepad, TextEdit) and edit the words between the quotes:

| What | Where |
|---|---|
| Friend's name | `name: "Ana"` — the greeting updates automatically |
| Greeting line | `greeting: "Happy Birthday, {name}!"` (`{name}` becomes the name) |
| Letter title + paragraphs + signature | `letterTitle`, `letterParagraphs`, `signature` |
| Photos & videos | Number files `1.png`, `2.mp4`, … into `assets/memories/` (see below) and set `memoriesCount` |
| Letter delay | `letterDelayMs: 7000` = letter pops up 7 seconds after the pop |
| Background colours | `theme: { hueA: 335, hueB: 35 }` (any numbers 0–360; 335 = pink, 35 = gold) |
| Music | Leave `music: "assets/music.mp3"` and drop your song there — or set it to `""` for the built-in music box |

**Photos & videos (memories):** everything visual lives in `assets/memories/`.
Name your files by number: `1.png`, `2.mp4`, `3.jpg` … mixing photos and videos
freely (photos: `png`/`jpg`/`jpeg`/`gif`; videos: `mp4`/`webm`, H.264 recommended).
Set `memoriesCount` in `config.js` to how many numbers to try — missing numbers
are skipped silently. (Rising balloons during the celebration are solid
colour — pictures live only in the gallery.) Open the letter, tap **🎬 Open memories**, and flip through them
with the ‹ › arrows, arrow keys, or a finger swipe. With no files yet, the
button shows a friendly note instead of a broken player.

**Letter:** write it in the `LETTER` file (plain text, no code). The first line
is the card heading, the last line starting with `-` is the signature, and
every other line is its own paragraph. Blank lines are ignored. Example:

```
My heading here

First paragraph…
Second paragraph…

- Your name
```

`config.js` holds a backup copy of the same text (used when double-clicking
`index.html` with no server) — if you edit `LETTER`, copy the text across.

> Don't touch anything else. The name and letter text appear *only* in `config.js`,
> so the surprise is never spoiled by the browser tab (it just shows 🎈).

## Preview it

Double-click `index.html` — it works with no server and no internet (after the
Google Font loads once, it falls back to system fonts offline).

Flow: black screen → balloon rises → it glows (tap it!) → pop → confetti +
greeting → photo balloons → letter opens automatically (or tap ✉️).

## Deploy it

### Cloudflare Pages (easiest)
1. Go to the Cloudflare dashboard → **Pages** → **Create** → **Upload assets**.
2. Drag this whole folder in, name the project, click **Deploy**.
3. Share the `*.pages.dev` link.

### GitHub Pages
1. Create a new repository, upload this folder's contents to the repo root.
2. Repo **Settings** → **Pages** → Source: **Deploy from a branch**, Branch: `main`, folder `/ (root)`.
3. Share the `https://<you>.github.io/<repo>/` link.

## Notes for the technical

- Zero build: plain HTML/CSS/JS, one vendored dependency (`vendor/pixi.min.js`,
  PixiJS 7.4.2, MIT licence). No CDN at runtime, no service worker.
- If you ever need to re-download Pixi: `curl -L -o vendor/pixi.min.js https://cdn.jsdelivr.net/npm/pixi.js@7.4.2/dist/pixi.min.js`
- Sound is Web Audio only and starts on first tap (mobile rule). Mute persists in `localStorage`.
- Honours `prefers-reduced-motion`, pauses when the tab hides, and drops to a
  low-particle tier on weak devices.
