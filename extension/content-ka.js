// Verkaufsassistent Autofill – läuft auf kleinanzeigen.de.
// Zeigt auf der "Anzeige aufgeben"-Seite ein Panel mit den Entwürfen aus der
// Verkaufsassistent-App und füllt das Formular aus. Es wird NIE automatisch
// abgesendet – der "Anzeige aufgeben"-Klick bleibt beim Nutzer.
'use strict';
(function() {
  if (typeof chrome === 'undefined' || !chrome.storage) return;
  if (location.pathname.indexOf('anzeige-aufgeben') === -1) return;
  if (document.getElementById('va-ext-panel')) return;

  // Selektor-Kandidaten (Reihenfolge = Priorität). Kleinanzeigen ändert die
  // Seite gelegentlich – dann hier nachpflegen.
  var SEL = {
    title: ['#postad-title', 'input[name="title"]', 'input[id*="title" i]'],
    desc:  ['#pstad-descrptn', 'textarea[name="description"]', 'textarea[id*="descr" i]', 'textarea'],
    price: ['#pstad-price', 'input[name="priceAmount"]', 'input[name*="price" i]', 'input[id*="price" i]'],
    vb:    ['input[name="priceType"][value="NEGOTIABLE"]', 'input[type="radio"][value="NEGOTIABLE"]'],
    fixed: ['input[name="priceType"][value="FIXED"]', 'input[type="radio"][value="FIXED"]'],
    file:  ['#pictureupload-pickfiles input[type="file"]', '.pictureupload input[type="file"]',
            'input[type="file"][accept*="image" i]', 'input[type="file"]']
  };

  function q(list) {
    for (var i = 0; i < list.length; i++) {
      var el = document.querySelector(list[i]);
      if (el) return el;
    }
    return null;
  }

  // Wert so setzen, dass auch React/Vue-Formulare ihn mitbekommen
  function setVal(el, value) {
    var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var d = Object.getOwnPropertyDescriptor(proto, 'value');
    if (d && d.set) d.set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fullDesc(listing, legal) {
    var d = (listing.desc || '').trim();
    if (listing.legal !== false && legal) d += '\n\n' + legal;
    return d;
  }

  function dataUrlToFile(u, name) {
    var arr = u.split(',');
    var mime = (arr[0].match(/:(.*?);/) || [,'image/jpeg'])[1];
    var bin = atob(arr[1]);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], name, { type: mime });
  }

  function attachPhotos(urls) {
    var input = q(SEL.file);
    if (!input || !urls || !urls.length) return false;
    try {
      var dt = new DataTransfer();
      urls.forEach(function(u, i) { dt.items.add(dataUrlToFile(u, 'foto-' + (i+1) + '.jpg')); });
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } catch(e) { return false; }
  }

  function fill(listing, photos, legal, report) {
    var lines = [];
    var el = q(SEL.title);
    if (el) { setVal(el, listing.tka || ''); lines.push('✓ Titel'); } else lines.push('✗ Titel – bitte manuell');

    el = q(SEL.desc);
    if (el) { setVal(el, fullDesc(listing, legal)); lines.push('✓ Beschreibung'); } else lines.push('✗ Beschreibung – bitte manuell');

    el = q(SEL.price);
    if (el && listing.preis) { setVal(el, String(listing.preis)); lines.push('✓ Preis'); }
    else if (listing.preis) lines.push('✗ Preis – bitte manuell');

    el = listing.vb ? q(SEL.vb) : q(SEL.fixed);
    if (el) { el.click(); lines.push('✓ ' + (listing.vb ? 'VB' : 'Festpreis')); }

    if (photos && photos.length) {
      lines.push(attachPhotos(photos)
        ? '✓ ' + photos.length + ' Foto(s) angehängt'
        : '✗ Fotos – bitte über „Bilder hinzufügen“ hochladen');
    }
    lines.push('');
    lines.push('Kategorie & Details bitte prüfen,');
    lines.push('dann selbst auf „Anzeige aufgeben“ klicken.');
    report.innerHTML = lines.map(function(l){ return '<div>' + l + '</div>'; }).join('');
  }

  function copyBtn(label, getText) {
    var b = document.createElement('button');
    b.className = 'va-ext-copy';
    b.textContent = label;
    b.addEventListener('click', function() {
      navigator.clipboard.writeText(getText()).then(function() {
        b.textContent = '✓ kopiert';
        setTimeout(function(){ b.textContent = label; }, 1500);
      });
    });
    return b;
  }

  function build(data) {
    var old = document.getElementById('va-ext-panel');
    if (old) old.remove();
    var listings = data.va_listings || [];
    var panel = document.createElement('div');
    panel.id = 'va-ext-panel';

    var head = document.createElement('div');
    head.id = 'va-ext-head';
    head.innerHTML = '<span>🏷️ Verkaufsassistent</span>';
    var toggle = document.createElement('button');
    toggle.id = 'va-ext-toggle';
    toggle.textContent = '—';
    head.appendChild(toggle);
    panel.appendChild(head);

    var body = document.createElement('div');
    body.id = 'va-ext-body';

    if (!listings.length) {
      body.innerHTML = '<div class="va-ext-empty">Keine Entwürfe gefunden.<br>' +
        'Öffne einmal die Verkaufsassistent-App in diesem Browser, dann erscheinen deine Anzeigen hier.</div>';
    } else {
      var report = document.createElement('div');
      report.id = 'va-ext-report';
      listings.forEach(function(l) {
        var item = document.createElement('div');
        item.className = 'va-ext-item';
        var date = new Date(l.ts).toLocaleDateString('de-DE');
        var fillB = document.createElement('button');
        fillB.className = 'va-ext-fill';
        fillB.innerHTML = '<b>' + (l.tka || '(ohne Titel)').replace(/</g,'&lt;') + '</b><small>' +
          date + (l.preis ? ' · ' + l.preis + ' €' + (l.vb ? ' VB' : '') : '') + '</small>';
        fillB.addEventListener('click', function() {
          fill(l, (data.va_photos || {})[l.id] || [], data.va_legal || '', report);
        });
        item.appendChild(fillB);
        var row = document.createElement('div');
        row.className = 'va-ext-row';
        row.appendChild(copyBtn('Titel', function(){ return l.tka || ''; }));
        row.appendChild(copyBtn('Text', function(){ return fullDesc(l, data.va_legal || ''); }));
        item.appendChild(row);
        body.appendChild(item);
      });
      body.appendChild(report);
    }

    panel.appendChild(body);
    document.body.appendChild(panel);
    toggle.addEventListener('click', function() {
      var hidden = body.style.display === 'none';
      body.style.display = hidden ? '' : 'none';
      toggle.textContent = hidden ? '—' : '+';
    });
  }

  function refresh() {
    chrome.storage.local.get(['va_listings', 'va_photos', 'va_legal'], build);
  }
  refresh();

  // Panel automatisch aktualisieren, sobald die App neue Entwürfe synct
  chrome.storage.onChanged.addListener(function(changes, area) {
    if (area === 'local' && (changes.va_listings || changes.va_photos || changes.va_legal)) refresh();
  });
})();
