# BlotOut payments & monetization

Hosting stays **GitHub Pages** (static, $0). No backend required for MVP.

Unlock is **license-key only**. There is no “I paid — unlock” honor button.

---

## 1. Sell $0.99 lifetime unlock (required)

Prefer **Stripe Payment Link** at $0.99 (~better net than Gumroad fees). Gumroad or Lemon Squeezy also work.

1. Create a product: **BlotOut Lifetime Unlock** — price **$0.99** (one-time).
2. Deliver **license keys** after purchase:
   - Upload codes from **`KEYS.PRIVATE.md` on the operator machine only** (never commit this file; never put it in the public repo).
   - Stripe: email a key manually or use a fulfillment integration / Zapier.
   - Gumroad: use license keys / unique codes feature, or email a key from the list.
   - Lemon Squeezy: use license keys / custom files / email delivery of a code.
3. Copy the product **checkout URL**.
4. Paste it into `config.js`:

```js
checkoutUrl: "https://your-store-link-here",
```

5. Commit and push to `main` so GitHub Pages redeploys.

Buyers pay → receive a key → paste it in BlotOut → `VALID_KEYS` validates → unlock (ads + export cap + watermark off).

### When keys run low

1. Generate more `IB-BLO-XXXX-XXXX` codes into **`KEYS.PRIVATE.md`** (local only).
2. Add the new codes to `VALID_KEYS` in `app.js`.
3. Upload the new codes to your store.
4. Redeploy (push to `main`).

The first **~15** sale keys from `KEYS.PRIVATE.md` are seeded in `app.js` so early sales work once the store is live.

---

## 2. Google AdSense (free-tier revenue)

1. Create / apply for [Google AdSense](https://www.google.com/adsense/).
2. When approved, paste your publisher id into `config.js`:

```js
adsenseClient: "ca-pub-XXXXXXXXXXXXXXXX",
adSlots: { top: "SLOT", mid: "SLOT", export: "SLOT", footer: "SLOT" },
```

3. Redeploy. Until AdSense is approved, the site shows **loud placeholder ads** so free users feel the free tier immediately.
4. Unlocked users: all `[data-ad]` regions are hidden.

---

## 3. Why PayPal.me alone cannot verify payment

PayPal.me is a simple payment link. It does **not**:

- Call back to your static site
- Prove who paid
- Issue a unique license automatically

Anyone could click “I paid” without paying. That honor path is **not** in BlotOut.

The **Buy** button uses `config.checkoutUrl` only, and unlock still requires a key from `VALID_KEYS`.

---

## 4. Redeploy checklist

After any `config.js` or `app.js` key change:

```bash
git add -A && git commit -m "Update BlotOut config / keys" && git push origin main
```

**Never** `git add KEYS.PRIVATE.md` or `KEYS.md`. Both are gitignored.

---

## Security note (MVP)

`VALID_KEYS` lives in `app.js` (client-side) — only the seeded batch, not the full stock.

- **Keys stock file:** `KEYS.PRIVATE.md` on the operator machine only. Never commit. Upload to store from that file.
- **Public key list:** do not put a full key list in HTML or a public repo file.
- **Rotation is the real fix** when keys leak: regenerate `KEYS.PRIVATE.md`, replace `VALID_KEYS`, redeploy. Old keys stop working immediately.
- For higher security later: signed tokens or a tiny paid key API — not required for MVP.
