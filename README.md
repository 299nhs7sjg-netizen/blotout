# BlotOut

**Permanent screenshot scrubber.** Black out emails, names, API keys, and faces — solid fill, not reversible blur. Private, offline-capable static site. Price: **$2.99 lifetime unlock**.

Your screenshots never leave the device — all processing uses Canvas / browser APIs.

## Open locally

**Option A — double-click**

Open `index.html` in Chrome, Edge, Firefox, or Safari.

**Option B — local server (recommended if a browser blocks `file://`)**

```bash
cd /path/to/blotout
python3 -m http.server 8766
```

Then visit: http://localhost:8766/

No build step. No Node. No paid APIs.

## Features

- Drag/drop or file picker (PNG, JPG, WebP)
- Canvas editor: draw rectangles to redact
- Default redact = **solid black** (permanent burn-in)
- Optional mosaic pixelate (secondary; prefer black for secrets)
- Auto-detect hints (client-side OCR when network available): emails, phones, `sk-` keys, JWTs — accept as blots
- Export PNG with blots burned in; EXIF stripped via re-encode
- Free tier: “BlotOut” watermark + 2 exports, then unlock nag
- Unlock $2.99 via license key only (no honor-system button)
- Ad placeholders on free tier (`data-ad` regions); hidden when unlocked

## Unlock for testing

1. Open the unlock modal → paste a key from `VALID_KEYS` in `app.js`
2. Or open with `?demo=1` and use the demo key (see `KEYS.PRIVATE.md` locally)

Operator keys live in **`KEYS.PRIVATE.md`** (gitignored — never commit).

## Config

Edit `config.js`:

```js
checkoutUrl: "https://your-stripe-or-store-link",
adsenseClient: "", // optional
```

See `PAYMENTS.md` for store + AdSense setup.

## Deploy

Static site → GitHub Pages from `main`.

```bash
git add -A && git commit -m "Update BlotOut" && git push origin main
```

**Never** `git add KEYS.PRIVATE.md`.
