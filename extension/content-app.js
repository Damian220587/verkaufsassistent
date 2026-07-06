// Verkaufsassistent Autofill – läuft auf der App-Seite.
// Synchronisiert Anzeigen-Entwürfe (localStorage) und Fotos (IndexedDB)
// in chrome.storage.local, damit das Kleinanzeigen-Content-Script sie lesen kann.
'use strict';
(function() {
  if (typeof chrome === 'undefined' || !chrome.storage) return;

  var MAX_LISTINGS = 10;   // neueste Anzeigen
  var MAX_PHOTO_SETS = 5;  // Fotos nur für die neuesten Anzeigen (Speicher)
  var lastHash = '';

  function idbLoadPhotos(id) {
    return new Promise(function(res) {
      try {
        var rq = indexedDB.open('va', 1);
        rq.onupgradeneeded = function(){ rq.result.createObjectStore('photos'); };
        rq.onerror = function(){ res([]); };
        rq.onsuccess = function() {
          try {
            var g = rq.result.transaction('photos').objectStore('photos').get(id);
            g.onsuccess = function(){ res(g.result || []); };
            g.onerror = function(){ res([]); };
          } catch(e) { res([]); }
        };
      } catch(e) { res([]); }
    });
  }

  function blobToDataUrl(blob) {
    return new Promise(function(res) {
      // Fürs Hochladen leicht verkleinern (1600px reicht Kleinanzeigen locker)
      createImageBitmap(blob).then(function(bmp) {
        var MAX = 1600, w = bmp.width, h = bmp.height;
        if (Math.max(w, h) > MAX) {
          var s = MAX / Math.max(w, h);
          w = Math.round(w * s); h = Math.round(h * s);
        }
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(bmp, 0, 0, w, h);
        res(c.toDataURL('image/jpeg', .9));
      }).catch(function() {
        var r = new FileReader();
        r.onload = function(){ res(r.result); };
        r.onerror = function(){ res(null); };
        r.readAsDataURL(blob);
      });
    });
  }

  async function sync() {
    var raw = localStorage.getItem('listings') || '[]';
    var legal = localStorage.getItem('legal') || '';
    if (raw + '|' + legal === lastHash) return;

    var listings;
    try { listings = JSON.parse(raw); } catch(e) { return; }
    if (!Array.isArray(listings)) return;
    listings = listings.slice(0, MAX_LISTINGS);

    var photoMap = {};
    var withPhotos = listings.slice(0, MAX_PHOTO_SETS);
    for (var i = 0; i < withPhotos.length; i++) {
      var blobs = await idbLoadPhotos(withPhotos[i].id);
      var urls = [];
      for (var j = 0; j < blobs.length; j++) {
        var u = await blobToDataUrl(blobs[j]);
        if (u) urls.push(u);
      }
      photoMap[withPhotos[i].id] = urls;
    }

    chrome.storage.local.set({
      va_listings: listings,
      va_photos: photoMap,
      va_legal: legal,
      va_synced: Date.now()
    }, function() {
      lastHash = raw + '|' + legal;
      console.log('[Verkaufsassistent] ' + listings.length + ' Anzeigen mit Chrome-Erweiterung synchronisiert');
    });
  }

  sync();
  setInterval(sync, 4000);
})();
