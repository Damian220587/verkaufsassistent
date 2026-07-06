// ebay.js – KA Manager
// Läuft auf ebay.de/sell und füllt das Formular mit gespeicherten Daten aus

(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // React-kompatibler Value-Setter
  function setVal(el, val) {
    if (!el) return;
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, val);
    else el.value = val;
    ['input', 'change', 'blur'].forEach(e => el.dispatchEvent(new Event(e, { bubbles: true })));
  }

  function waitFor(sel, ms = 15000) {
    return new Promise((res, rej) => {
      const el = document.querySelector(sel);
      if (el) return res(el);
      const o = new MutationObserver(() => {
        const f = document.querySelector(sel);
        if (f) { o.disconnect(); res(f); }
      });
      o.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { o.disconnect(); rej(new Error('Timeout: ' + sel)); }, ms);
    });
  }

  function toast(msg, ok = true) {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;top:20px;right:20px;z-index:999999;
      background:${ok ? '#059669' : '#dc2626'};color:#fff;padding:12px 18px;
      border-radius:8px;font:600 13px system-ui;box-shadow:0 4px 16px rgba(0,0,0,.2);
      max-width:320px;line-height:1.5;`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 6000);
  }

  // Daten aus Storage laden
  const result = await chrome.storage.local.get('ka_ebay_transfer');
  const ad = result?.ka_ebay_transfer;
  if (!ad) return; // Kein Transfer ausstehend

  // Daten sofort löschen (einmalig verwenden)
  await chrome.storage.local.remove('ka_ebay_transfer');

  console.log('[KA→eBay] Starte Transfer:', ad.title);

  // Warte bis Seite geladen ist
  await sleep(3000);

  try {
    // ── TITEL ─────────────────────────────────────────────────────────────
    const titleEl = await waitFor(
      'input[id*="title"], input[name="title"], input[placeholder*="Titel"], input[placeholder*="title"], input[aria-label*="Titel"], input[aria-label*="title"]',
      15000
    );
    setVal(titleEl, (ad.title || '').slice(0, 80)); // eBay: max 80 Zeichen
    await sleep(300);

    // ── BESCHREIBUNG ──────────────────────────────────────────────────────
    const descEl = document.querySelector(
      'textarea[id*="desc"], textarea[name="description"], textarea[aria-label*="eschr"], textarea[placeholder*="eschr"], iframe[id*="desc"]'
    );
    if (descEl && descEl.tagName === 'TEXTAREA') {
      setVal(descEl, (ad.description || '').slice(0, 4000));
      await sleep(300);
    }

    // ── PREIS ─────────────────────────────────────────────────────────────
    const priceEl = document.querySelector(
      'input[id*="price"], input[name*="price"], input[aria-label*="reis"], input[placeholder*="reis"]'
    );
    if (priceEl && ad.price) {
      const priceNum = parseFloat(ad.price);
      if (!isNaN(priceNum) && priceNum > 0) {
        priceEl.focus();
        await sleep(200);
        priceEl.value = '';
        priceEl.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(100);
        // Zeichenweise eingeben wie echter User
        const priceStr = priceNum.toFixed(2).replace('.', ',');
        for (const char of priceStr) {
          priceEl.value += char;
          priceEl.dispatchEvent(new Event('input', { bubbles: true }));
          priceEl.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: char }));
          await sleep(50);
        }
        priceEl.dispatchEvent(new Event('change', { bubbles: true }));
        priceEl.blur();
        await sleep(300);
      }
    }

    // ── BILDER ────────────────────────────────────────────────────────────
    if (ad.imageData?.length) {
      const uploadInput = await waitFor(
        'input[type="file"][accept*="image"], input[type="file"]',
        8000
      ).catch(() => null);

      if (uploadInput) {
        const dt = new DataTransfer();
        for (let i = 0; i < ad.imageData.length && i < 12; i++) {
          try {
            const item = ad.imageData[i];
            const bin = atob(item.base64);
            const arr = new Uint8Array(bin.length);
            for (let j = 0; j < bin.length; j++) arr[j] = bin.charCodeAt(j);
            const file = new File([arr], item.name || `foto${i+1}.jpg`, { type: item.mimeType || 'image/jpeg' });
            dt.items.add(file);
          } catch(e) { console.warn('[KA→eBay] Bild-Fehler:', e.message); }
        }
        if (dt.files.length) {
          uploadInput.files = dt.files;
          ['change', 'input'].forEach(e => uploadInput.dispatchEvent(new Event(e, { bubbles: true })));
          await sleep(1500);
        }
      }
    }

    toast(`✅ KA Manager: "${ad.title?.slice(0,40)}" übertragen!\nBitte Kategorie und Zustand manuell auswählen.`);
    console.log('[KA→eBay] Transfer abgeschlossen');

  } catch(e) {
    console.error('[KA→eBay] Fehler:', e.message);
    toast('❌ KA Manager: Fehler beim Ausfüllen – ' + e.message, false);
  }
})();
