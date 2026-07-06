// vinted.js – KA Manager
// Läuft auf vinted.de/items/new und füllt das Formular mit gespeicherten Daten aus

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
  const result = await chrome.storage.local.get('ka_vinted_transfer');
  const ad = result?.ka_vinted_transfer;
  if (!ad) return; // Kein Transfer ausstehend

  // Daten sofort löschen (einmalig verwenden)
  await chrome.storage.local.remove('ka_vinted_transfer');

  console.log('[KA→Vinted] Starte Transfer:', ad.title);

  // Warte bis Seite geladen ist
  await sleep(2500);

  try {
    // ── TITEL ─────────────────────────────────────────────────────────────
    const titleEl = await waitFor('#title, input[name="title"], input[placeholder*="Titel"], input[placeholder*="title"]', 12000);
    setVal(titleEl, (ad.title || '').slice(0, 80)); // Vinted: max 80 Zeichen
    await sleep(300);

    // ── BESCHREIBUNG ──────────────────────────────────────────────────────
    const descEl = document.querySelector('textarea#description, textarea[name="description"], textarea[placeholder*="eschr"], textarea[placeholder*="desc"]');
    if (descEl) {
      setVal(descEl, (ad.description || '').slice(0, 5000));
      await sleep(300);
    }

    // ── PREIS ─────────────────────────────────────────────────────────────
    const priceEl = document.querySelector('#price, input[name="price"], input[placeholder*="reis"], input[placeholder*="price"]');
    if (priceEl && ad.price) {
      const priceNum = Math.floor(parseFloat(ad.price));
      if (!isNaN(priceNum) && priceNum > 0) {
        priceEl.focus();
        await sleep(200);
        // Feld leeren
        priceEl.value = '';
        priceEl.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(100);
        // Zeichenweise eingeben wie echter User
        for (const char of priceNum.toString()) {
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
      // Warte auf Upload-Button
      const uploadInput = await waitFor(
        'input[type="file"][accept*="image"], input[data-testid="add-photos-input"], input[type="file"]',
        8000
      ).catch(() => null);

      if (uploadInput) {
        const dt = new DataTransfer();
        for (let i = 0; i < ad.imageData.length && i < 20; i++) {
          try {
            const item = ad.imageData[i];
            const bin = atob(item.base64);
            const arr = new Uint8Array(bin.length);
            for (let j = 0; j < bin.length; j++) arr[j] = bin.charCodeAt(j);
            const file = new File([arr], item.name || `foto${i+1}.jpg`, { type: item.mimeType || 'image/jpeg' });
            dt.items.add(file);
          } catch(e) { console.warn('[KA→Vinted] Bild-Fehler:', e.message); }
        }
        if (dt.files.length) {
          uploadInput.files = dt.files;
          ['change', 'input'].forEach(e => uploadInput.dispatchEvent(new Event(e, { bubbles: true })));
          await sleep(1500);
        }
      }
    }

    toast(`✅ KA Manager: "${ad.title?.slice(0,40)}" übertragen!\nBitte Kategorie und Zustand manuell auswählen.`);
    console.log('[KA→Vinted] Transfer abgeschlossen');

  } catch(e) {
    console.error('[KA→Vinted] Fehler:', e.message);
    toast('❌ KA Manager: Fehler beim Ausfüllen – ' + e.message, false);
  }
})();
