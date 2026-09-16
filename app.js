/**
 * BlotOut — permanent screenshot redaction (client-side only)
 * Unlock ONLY via valid license key (no honor / "I paid" path).
 * VALID_KEYS: seed from KEYS.PRIVATE.md (operator machine only; never commit).
 */
(function () {
  "use strict";

  const STORAGE_KEY = "blotout_unlocked_v1";
  const EXPORT_COUNT_KEY = "blotout_export_count_v1";
  const DEMO_KEY = "IB-BLO-DEMO-TEST";
  const FREE_EXPORT_LIMIT = 2;

  /* First ~15 sale keys from KEYS.PRIVATE.md + demo (?demo=1 only). */
  const VALID_KEYS = new Set([
    DEMO_KEY,
    "IB-BLO-3DG9-AYCM",
    "IB-BLO-PZP5-B4Z2",
    "IB-BLO-EENP-HDAS",
    "IB-BLO-PVB5-UENZ",
    "IB-BLO-58FH-C5QU",
    "IB-BLO-KRE2-P2YC",
    "IB-BLO-AZRJ-B2QB",
    "IB-BLO-CWUN-H8E4",
    "IB-BLO-PBFQ-6SR4",
    "IB-BLO-Q4PP-KRDG",
    "IB-BLO-J9Z3-XE68",
    "IB-BLO-B8SU-FSGK",
    "IB-BLO-M82J-QUWA",
    "IB-BLO-NTHW-M6YV",
    "IB-BLO-PQXP-4J9T",
  ]);

  const CFG = window.BLOTOUT_CONFIG || {};

  const AD_COPY = {
    top: "<strong>Sponsored</strong> — Redact without ads. Unlock BlotOut lifetime for $0.99 → no watermark, unlimited exports.",
    mid: "<strong>FakeSponsor Cloud</strong> — Upload your screenshots to “scrub” them. Or stay private with BlotOut Unlock ($0.99).",
    export: "<strong>Export faster — Unlock BlotOut $0.99</strong><br />No watermark. Unlimited exports. One license key after checkout.",
    footer: "<strong>Sponsored · BlotOut Unlock</strong> — Kill ads + watermark with one $0.99 license key from the store.",
  };

  const PATTERNS = [
    { kind: "email", re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
    { kind: "phone", re: /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g },
    { kind: "sk-key", re: /\bsk-(?:live|test|proj)?[-_]?[A-Za-z0-9]{16,}\b/g },
    { kind: "jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
    { kind: "bearer", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g },
  ];

  let unlocked = false;
  let mode = "black"; // black | mosaic
  let sourceImage = null;
  let sourceName = "screenshot.png";
  let blots = []; // {x,y,w,h,mode}
  let suggestions = []; // {text,kind,x,y,w,h,accepted}
  let drawing = false;
  let dragStart = null;
  let currentRect = null;
  let scale = 1; // canvas display scale vs image pixels
  let tesseractLoading = false;

  const $ = (id) => document.getElementById(id);
  const els = {
    dropZone: $("dropZone"),
    fileInput: $("fileInput"),
    dropEmpty: $("dropEmpty"),
    canvasWrap: $("canvasWrap"),
    canvas: $("editor"),
    pickBtn: $("pickBtn"),
    modeBlack: $("modeBlack"),
    modeMosaic: $("modeMosaic"),
    modeHint: $("modeHint"),
    freeNote: $("freeNote"),
    exportsLeft: $("exportsLeft"),
    unlockBtn: $("unlockBtn"),
    unlockLink: $("unlockLink"),
    footerUnlock: $("footerUnlock"),
    unlockBadge: $("unlockBadge"),
    undoBtn: $("undoBtn"),
    clearBtn: $("clearBtn"),
    detectBtn: $("detectBtn"),
    exportBtn: $("exportBtn"),
    resetBtn: $("resetBtn"),
    suggestions: $("suggestions"),
    suggestList: $("suggestList"),
    detectStatus: $("detectStatus"),
    acceptAllBtn: $("acceptAllBtn"),
    imageMeta: $("imageMeta"),
    unlockModal: $("unlockModal"),
    modalClose: $("modalClose"),
    licenseKey: $("licenseKey"),
    applyKeyBtn: $("applyKeyBtn"),
    buyBtn: $("buyBtn"),
    checkoutHint: $("checkoutHint"),
    unlockError: $("unlockError"),
    demoUnlockBtn: $("demoUnlockBtn"),
    nagModal: $("nagModal"),
    nagClose: $("nagClose"),
    nagUnlockBtn: $("nagUnlockBtn"),
    nagDismiss: $("nagDismiss"),
  };

  const ctx = els.canvas.getContext("2d");

  function normalizeKey(k) {
    return String(k || "").trim().toUpperCase().replace(/\s+/g, "");
  }

  function isUnlocked() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return !!(v && VALID_KEYS.has(normalizeKey(v)));
    } catch (_) {
      return false;
    }
  }

  function persistUnlock(key) {
    const k = normalizeKey(key);
    if (!VALID_KEYS.has(k)) return false;
    unlocked = true;
    try {
      localStorage.setItem(STORAGE_KEY, k);
    } catch (_) {}
    return true;
  }

  function getExportCount() {
    try {
      return parseInt(localStorage.getItem(EXPORT_COUNT_KEY) || "0", 10) || 0;
    } catch (_) {
      return 0;
    }
  }

  function bumpExportCount() {
    const n = getExportCount() + 1;
    try {
      localStorage.setItem(EXPORT_COUNT_KEY, String(n));
    } catch (_) {}
    return n;
  }

  function exportsRemaining() {
    if (unlocked) return Infinity;
    return Math.max(0, FREE_EXPORT_LIMIT - getExportCount());
  }

  function hideAds() {
    document.querySelectorAll("[data-ad]").forEach(function (el) {
      el.hidden = true;
    });
  }

  function showAds() {
    document.querySelectorAll("[data-ad]").forEach(function (el) {
      el.hidden = false;
    });
  }

  function fillAdPlaceholders() {
    document.querySelectorAll("[data-ad]").forEach(function (region) {
      const kind = region.getAttribute("data-ad") || "";
      const slotKey = region.getAttribute("data-ad-slot") || kind;
      const creative = region.querySelector("[data-ad-creative]");
      const client = (CFG.adsenseClient || "").trim();
      const slots = CFG.adSlots || {};
      const slotId = (slots[slotKey] || "").trim();

      if (client && slotId && creative) {
        creative.innerHTML = "";
        const ins = document.createElement("ins");
        ins.className = "adsbygoogle";
        ins.style.display = "block";
        ins.setAttribute("data-ad-client", client);
        ins.setAttribute("data-ad-slot", slotId);
        ins.setAttribute("data-ad-format", "auto");
        ins.setAttribute("data-full-width-responsive", "true");
        creative.appendChild(ins);
        try {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch (_) {}
      } else if (creative && AD_COPY[kind]) {
        creative.innerHTML = AD_COPY[kind];
      }
    });
  }

  function updateCheckoutLink() {
    const url = (CFG.checkoutUrl || "").trim();
    const hint = els.checkoutHint;
    if (url) {
      els.buyBtn.href = url;
      els.buyBtn.removeAttribute("aria-disabled");
      if (hint) {
        hint.hidden = false;
        hint.style.color = "var(--muted)";
        hint.textContent = "After checkout, your store email includes a license key. Paste it below.";
      }
    } else {
      els.buyBtn.href = "#";
      els.buyBtn.addEventListener("click", function onBuy(e) {
        if (!(CFG.checkoutUrl || "").trim()) {
          e.preventDefault();
          if (els.unlockError) {
            els.unlockError.textContent =
              "Checkout URL not set. Create a Stripe / Gumroad / Lemon product ($0.99) and paste the URL into config.js.";
            els.unlockError.hidden = false;
          }
        }
      });
      if (hint) {
        hint.hidden = false;
        hint.style.color = "var(--danger)";
        hint.textContent =
          "Checkout URL not set — Wes: paste your Stripe Payment Link, Gumroad, or Lemon Squeezy product URL into config.js → checkoutUrl, then redeploy.";
      }
    }
  }

  function updateUI() {
    unlocked = isUnlocked();
    if (unlocked) {
      els.unlockBadge.textContent = "Unlocked";
      els.unlockBadge.className = "badge pro";
      els.unlockBtn.textContent = "Unlocked ✓";
      els.unlockBtn.disabled = true;
      els.freeNote.hidden = true;
      hideAds();
    } else {
      els.unlockBadge.textContent = "Free";
      els.unlockBadge.className = "badge free";
      els.unlockBtn.textContent = "Unlock $0.99";
      els.unlockBtn.disabled = false;
      els.freeNote.hidden = false;
      const left = exportsRemaining();
      els.exportsLeft.textContent =
        left === 1 ? "1 export left" : left + " exports left";
      showAds();
      fillAdPlaceholders();
    }
    updateToolbar();
  }

  function updateToolbar() {
    const has = !!sourceImage;
    els.undoBtn.disabled = !has || blots.length === 0;
    els.clearBtn.disabled = !has || blots.length === 0;
    els.detectBtn.disabled = !has || tesseractLoading;
    els.exportBtn.disabled = !has;
    els.resetBtn.disabled = !has;
  }

  function openModal() {
    els.unlockError.hidden = true;
    if (els.licenseKey) els.licenseKey.value = "";
    updateCheckoutLink();
    const params = new URLSearchParams(location.search);
    els.demoUnlockBtn.hidden = params.get("demo") !== "1";
    els.unlockModal.hidden = false;
    if (els.licenseKey) els.licenseKey.focus();
  }

  function closeModal() {
    els.unlockModal.hidden = true;
  }

  function tryUnlock(raw) {
    const k = normalizeKey(raw);
    if (!k) {
      els.unlockError.textContent =
        "Paste your license key from the store receipt, then tap Apply.";
      els.unlockError.hidden = false;
      return;
    }
    if (VALID_KEYS.has(k)) {
      if (k === DEMO_KEY) {
        const params = new URLSearchParams(location.search);
        if (params.get("demo") !== "1") {
          els.unlockError.textContent =
            "Demo key only works with ?demo=1 in the URL.";
          els.unlockError.hidden = false;
          return;
        }
      }
      persistUnlock(k);
      updateUI();
      closeModal();
      return;
    }
    els.unlockError.textContent =
      "Invalid key. Buy from the store to receive a license key, then paste it here.";
    els.unlockError.hidden = false;
  }

  /* ——— Canvas / image ——— */

  function loadFile(file) {
    if (!file || !/^image\/(png|jpeg|webp)$/i.test(file.type)) {
      alert("Please choose a PNG, JPG, or WebP image.");
      return;
    }
    sourceName = (file.name || "screenshot").replace(/\.[^.]+$/, "") + "-blotout.png";
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      sourceImage = img;
      blots = [];
      suggestions = [];
      els.suggestions.hidden = true;
      els.dropEmpty.hidden = true;
      els.canvasWrap.hidden = false;
      fitCanvas();
      redraw();
      els.imageMeta.innerHTML =
        '<p class="preview-meta">' +
        escapeHtml(file.name || "image") +
        " · " +
        img.naturalWidth +
        "×" +
        img.naturalHeight +
        " · draw rectangles to redact</p>";
      updateToolbar();
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      alert("Could not load that image.");
    };
    img.src = url;
  }

  function fitCanvas() {
    if (!sourceImage) return;
    const maxW = els.canvasWrap.clientWidth - 24 || 800;
    const maxH = Math.min(window.innerHeight * 0.7, 720);
    const iw = sourceImage.naturalWidth;
    const ih = sourceImage.naturalHeight;
    scale = Math.min(1, maxW / iw, maxH / ih);
    els.canvas.width = Math.round(iw * scale);
    els.canvas.height = Math.round(ih * scale);
  }

  function canvasToImage(pt) {
    return { x: pt.x / scale, y: pt.y / scale };
  }

  function getCanvasPoint(e) {
    const rect = els.canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * els.canvas.width,
      y: ((clientY - rect.top) / rect.height) * els.canvas.height,
    };
  }

  function normalizeRect(x0, y0, x1, y1) {
    const x = Math.min(x0, x1);
    const y = Math.min(y0, y1);
    const w = Math.abs(x1 - x0);
    const h = Math.abs(y1 - y0);
    return { x: x, y: y, w: w, h: h };
  }

  function applyBlot(c, blot, imgScale) {
    const s = imgScale == null ? 1 : imgScale;
    const x = blot.x * s;
    const y = blot.y * s;
    const w = blot.w * s;
    const h = blot.h * s;
    if (w < 1 || h < 1) return;
    if (blot.mode === "mosaic") {
      drawMosaic(c, x, y, w, h);
    } else {
      c.fillStyle = "#000000";
      c.fillRect(x, y, w, h);
    }
  }

  function drawMosaic(c, x, y, w, h) {
    const block = Math.max(6, Math.round(Math.min(w, h) / 8));
    const sx = Math.floor(x);
    const sy = Math.floor(y);
    const sw = Math.ceil(w);
    const sh = Math.ceil(h);
    try {
      const data = c.getImageData(sx, sy, sw, sh);
      const d = data.data;
      for (let by = 0; by < sh; by += block) {
        for (let bx = 0; bx < sw; bx += block) {
          let r = 0, g = 0, b = 0, n = 0;
          const bh = Math.min(block, sh - by);
          const bw = Math.min(block, sw - bx);
          for (let py = 0; py < bh; py++) {
            for (let px = 0; px < bw; px++) {
              const i = ((by + py) * sw + (bx + px)) * 4;
              r += d[i];
              g += d[i + 1];
              b += d[i + 2];
              n++;
            }
          }
          r = (r / n) | 0;
          g = (g / n) | 0;
          b = (b / n) | 0;
          for (let py = 0; py < bh; py++) {
            for (let px = 0; px < bw; px++) {
              const i = ((by + py) * sw + (bx + px)) * 4;
              d[i] = r;
              d[i + 1] = g;
              d[i + 2] = b;
            }
          }
        }
      }
      c.putImageData(data, sx, sy);
    } catch (_) {
      c.fillStyle = "#111";
      c.fillRect(x, y, w, h);
    }
  }

  function redraw() {
    if (!sourceImage) return;
    ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
    ctx.drawImage(sourceImage, 0, 0, els.canvas.width, els.canvas.height);
    blots.forEach(function (b) {
      applyBlot(ctx, b, scale);
    });
    // suggestion outlines (not yet accepted)
    suggestions.forEach(function (s) {
      if (s.accepted) return;
      ctx.save();
      ctx.strokeStyle = "rgba(61,214,198,.9)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(s.x * scale, s.y * scale, s.w * scale, s.h * scale);
      ctx.restore();
    });
    if (currentRect && currentRect.w > 0 && currentRect.h > 0) {
      ctx.save();
      ctx.strokeStyle = "rgba(139,92,255,.95)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(
        currentRect.x * scale,
        currentRect.y * scale,
        currentRect.w * scale,
        currentRect.h * scale
      );
      ctx.fillStyle = "rgba(0,0,0,.35)";
      ctx.fillRect(
        currentRect.x * scale,
        currentRect.y * scale,
        currentRect.w * scale,
        currentRect.h * scale
      );
      ctx.restore();
    }
  }

  function setMode(m) {
    mode = m;
    els.modeBlack.classList.toggle("active", m === "black");
    els.modeMosaic.classList.toggle("active", m === "mosaic");
    els.modeHint.textContent =
      m === "black"
        ? "Solid black burns in permanently — blur is reversible; black is not."
        : "Mosaic pixelates the region. Prefer solid black for secrets (mosaic can sometimes be reversed).";
  }

  /* ——— Pointer draw ——— */

  function onPointerDown(e) {
    if (!sourceImage) return;
    e.preventDefault();
    drawing = true;
    const pt = canvasToImage(getCanvasPoint(e));
    dragStart = pt;
    currentRect = { x: pt.x, y: pt.y, w: 0, h: 0 };
  }

  function onPointerMove(e) {
    if (!drawing || !dragStart) return;
    e.preventDefault();
    const pt = canvasToImage(getCanvasPoint(e));
    currentRect = normalizeRect(dragStart.x, dragStart.y, pt.x, pt.y);
    redraw();
  }

  function onPointerUp(e) {
    if (!drawing) return;
    drawing = false;
    if (currentRect && currentRect.w >= 3 && currentRect.h >= 3) {
      blots.push({
        x: currentRect.x,
        y: currentRect.y,
        w: currentRect.w,
        h: currentRect.h,
        mode: mode,
      });
    }
    currentRect = null;
    dragStart = null;
    redraw();
    updateToolbar();
  }

  /* ——— Auto-detect (optional OCR via Tesseract CDN) ——— */

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loadTesseract() {
    return new Promise(function (resolve, reject) {
      if (window.Tesseract) {
        resolve(window.Tesseract);
        return;
      }
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
      s.onload = function () {
        if (window.Tesseract) resolve(window.Tesseract);
        else reject(new Error("Tesseract failed to load"));
      };
      s.onerror = function () {
        reject(new Error("Could not load OCR library (need network once)"));
      };
      document.head.appendChild(s);
    });
  }

  function findPatternsInText(ocrData) {
    const found = [];
    const words = (ocrData && ocrData.words) || [];
    const fullText = (ocrData && ocrData.text) || "";

    // Prefer word-level boxes when available
    const lines = (ocrData && ocrData.lines) || [];
    const searchUnits = lines.length
      ? lines.map(function (line) {
          return {
            text: line.text || "",
            bbox: line.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 },
          };
        })
      : words.map(function (w) {
          return {
            text: w.text || "",
            bbox: w.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 },
          };
        });

    // Also scan full text for patterns spanning tokens; map approx via lines
    searchUnits.forEach(function (unit) {
      const text = unit.text;
      if (!text) return;
      PATTERNS.forEach(function (p) {
        p.re.lastIndex = 0;
        let m;
        while ((m = p.re.exec(text)) !== null) {
          const bbox = unit.bbox;
          const pad = 4;
          found.push({
            text: m[0],
            kind: p.kind,
            x: Math.max(0, (bbox.x0 || 0) - pad),
            y: Math.max(0, (bbox.y0 || 0) - pad),
            w: Math.max(8, (bbox.x1 || 0) - (bbox.x0 || 0) + pad * 2),
            h: Math.max(8, (bbox.y1 || 0) - (bbox.y0 || 0) + pad * 2),
            accepted: false,
          });
        }
      });
    });

    // Deduplicate overlapping similar
    const deduped = [];
    found.forEach(function (f) {
      const dup = deduped.some(function (d) {
        return (
          d.kind === f.kind &&
          Math.abs(d.x - f.x) < 8 &&
          Math.abs(d.y - f.y) < 8 &&
          d.text === f.text
        );
      });
      if (!dup) deduped.push(f);
    });

    // Fallback: if OCR words empty but full text has patterns, place at top
    if (!deduped.length && fullText) {
      PATTERNS.forEach(function (p) {
        p.re.lastIndex = 0;
        let m;
        while ((m = p.re.exec(fullText)) !== null) {
          deduped.push({
            text: m[0],
            kind: p.kind,
            x: 8,
            y: 8 + deduped.length * 28,
            w: Math.min(sourceImage.naturalWidth - 16, m[0].length * 10),
            h: 24,
            accepted: false,
          });
        }
      });
    }
    return deduped;
  }

  async function runDetect() {
    if (!sourceImage || tesseractLoading) return;
    tesseractLoading = true;
    updateToolbar();
    els.suggestions.hidden = false;
    els.detectStatus.textContent = "Loading OCR (first time may take a moment)…";
    els.suggestList.innerHTML = "";
    els.acceptAllBtn.hidden = true;
    try {
      const Tesseract = await loadTesseract();
      els.detectStatus.textContent = "Scanning for emails, phones, API keys…";
      // Render full-res for OCR
      const off = document.createElement("canvas");
      off.width = sourceImage.naturalWidth;
      off.height = sourceImage.naturalHeight;
      off.getContext("2d").drawImage(sourceImage, 0, 0);
      const result = await Tesseract.recognize(off, "eng", {
        logger: function () {},
      });
      suggestions = findPatternsInText(result.data);
      renderSuggestions();
      redraw();
      if (!suggestions.length) {
        els.detectStatus.textContent =
          "No email / phone / sk- / JWT patterns found. Draw rectangles manually.";
      } else {
        els.detectStatus.textContent =
          "Found " + suggestions.length + " suggestion(s). Accept to blot.";
      }
    } catch (err) {
      els.detectStatus.textContent =
        (err && err.message) ||
        "Auto-detect unavailable. Draw rectangles manually — that always works.";
    } finally {
      tesseractLoading = false;
      updateToolbar();
    }
  }

  function renderSuggestions() {
    els.suggestList.innerHTML = "";
    const pending = suggestions.filter(function (s) {
      return !s.accepted;
    });
    els.acceptAllBtn.hidden = pending.length === 0;
    pending.forEach(function (s, idx) {
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.className = "suggest-label";
      label.innerHTML =
        '<span class="suggest-kind">' +
        escapeHtml(s.kind) +
        "</span>" +
        escapeHtml(s.text);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn ghost";
      btn.textContent = "Blot";
      btn.addEventListener("click", function () {
        acceptSuggestion(s);
      });
      li.appendChild(label);
      li.appendChild(btn);
      els.suggestList.appendChild(li);
    });
  }

  function acceptSuggestion(s) {
    if (s.accepted) return;
    s.accepted = true;
    blots.push({
      x: s.x,
      y: s.y,
      w: s.w,
      h: s.h,
      mode: mode,
    });
    renderSuggestions();
    redraw();
    updateToolbar();
  }

  function acceptAllSuggestions() {
    suggestions.forEach(function (s) {
      if (!s.accepted) {
        s.accepted = true;
        blots.push({ x: s.x, y: s.y, w: s.w, h: s.h, mode: mode });
      }
    });
    renderSuggestions();
    redraw();
    updateToolbar();
  }

  /* ——— Export (PNG via canvas → strips EXIF) ——— */

  function buildExportCanvas() {
    const out = document.createElement("canvas");
    out.width = sourceImage.naturalWidth;
    out.height = sourceImage.naturalHeight;
    const c = out.getContext("2d");
    c.drawImage(sourceImage, 0, 0);
    blots.forEach(function (b) {
      applyBlot(c, b, 1);
    });
    if (!unlocked) {
      // Watermark
      const label = "BlotOut";
      c.save();
      c.font =
        "bold " +
        Math.max(18, Math.round(out.width / 28)) +
        "px Segoe UI, system-ui, sans-serif";
      c.fillStyle = "rgba(255,255,255,.55)";
      c.strokeStyle = "rgba(0,0,0,.45)";
      c.lineWidth = 3;
      c.textAlign = "right";
      c.textBaseline = "bottom";
      const pad = Math.round(out.width * 0.02);
      c.strokeText(label, out.width - pad, out.height - pad);
      c.fillText(label, out.width - pad, out.height - pad);
      c.restore();
    }
    return out;
  }

  function doExport() {
    if (!sourceImage) return;
    if (!unlocked && exportsRemaining() <= 0) {
      els.nagModal.hidden = false;
      return;
    }
    const out = buildExportCanvas();
    out.toBlob(
      function (blob) {
        if (!blob) {
          alert("Export failed.");
          return;
        }
        if (!unlocked) bumpExportCount();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = sourceName;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
          URL.revokeObjectURL(a.href);
          a.remove();
        }, 1500);
        updateUI();
        if (!unlocked && exportsRemaining() <= 0) {
          setTimeout(function () {
            els.nagModal.hidden = false;
          }, 400);
        }
      },
      "image/png"
    );
  }

  function resetImage() {
    sourceImage = null;
    blots = [];
    suggestions = [];
    currentRect = null;
    els.dropEmpty.hidden = false;
    els.canvasWrap.hidden = true;
    els.suggestions.hidden = true;
    els.fileInput.value = "";
    els.imageMeta.innerHTML = '<p class="preview-meta">No image loaded</p>';
    updateToolbar();
  }

  /* ——— Events ——— */

  els.pickBtn.addEventListener("click", function () {
    els.fileInput.click();
  });
  els.fileInput.addEventListener("change", function () {
    if (els.fileInput.files && els.fileInput.files[0]) {
      loadFile(els.fileInput.files[0]);
    }
  });

  ["dragenter", "dragover"].forEach(function (ev) {
    els.dropZone.addEventListener(ev, function (e) {
      e.preventDefault();
      els.dropZone.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    els.dropZone.addEventListener(ev, function (e) {
      e.preventDefault();
      els.dropZone.classList.remove("dragover");
    });
  });
  els.dropZone.addEventListener("drop", function (e) {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadFile(f);
  });
  els.dropZone.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      els.fileInput.click();
    }
  });

  els.canvas.addEventListener("mousedown", onPointerDown);
  window.addEventListener("mousemove", onPointerMove);
  window.addEventListener("mouseup", onPointerUp);
  els.canvas.addEventListener(
    "touchstart",
    onPointerDown,
    { passive: false }
  );
  els.canvas.addEventListener(
    "touchmove",
    onPointerMove,
    { passive: false }
  );
  els.canvas.addEventListener("touchend", onPointerUp);

  els.modeBlack.addEventListener("click", function () {
    setMode("black");
  });
  els.modeMosaic.addEventListener("click", function () {
    setMode("mosaic");
  });

  els.undoBtn.addEventListener("click", function () {
    blots.pop();
    redraw();
    updateToolbar();
  });
  els.clearBtn.addEventListener("click", function () {
    blots = [];
    redraw();
    updateToolbar();
  });
  els.detectBtn.addEventListener("click", runDetect);
  els.acceptAllBtn.addEventListener("click", acceptAllSuggestions);
  els.exportBtn.addEventListener("click", doExport);
  els.resetBtn.addEventListener("click", resetImage);

  els.unlockBtn.addEventListener("click", openModal);
  els.unlockLink.addEventListener("click", openModal);
  els.footerUnlock.addEventListener("click", openModal);
  els.modalClose.addEventListener("click", closeModal);
  els.unlockModal.addEventListener("click", function (e) {
    if (e.target === els.unlockModal) closeModal();
  });
  els.applyKeyBtn.addEventListener("click", function () {
    tryUnlock(els.licenseKey && els.licenseKey.value);
  });
  els.licenseKey.addEventListener("keydown", function (e) {
    if (e.key === "Enter") tryUnlock(els.licenseKey.value);
  });
  els.demoUnlockBtn.addEventListener("click", function () {
    tryUnlock(DEMO_KEY);
  });

  els.nagClose.addEventListener("click", function () {
    els.nagModal.hidden = true;
  });
  els.nagDismiss.addEventListener("click", function () {
    els.nagModal.hidden = true;
  });
  els.nagUnlockBtn.addEventListener("click", function () {
    els.nagModal.hidden = true;
    openModal();
  });
  els.nagModal.addEventListener("click", function (e) {
    if (e.target === els.nagModal) els.nagModal.hidden = true;
  });

  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (!els.unlockModal.hidden) closeModal();
      if (!els.nagModal.hidden) els.nagModal.hidden = true;
    }
  });

  window.addEventListener("resize", function () {
    if (!sourceImage) return;
    fitCanvas();
    redraw();
  });

  /* Clear legacy / invalid stored keys */
  try {
    const legacy = localStorage.getItem(STORAGE_KEY);
    if (
      legacy === "1" ||
      (legacy && !VALID_KEYS.has(normalizeKey(legacy)))
    ) {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (_) {}

  updateCheckoutLink();
  updateUI();
  setMode("black");
})();
