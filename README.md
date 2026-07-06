# Verkaufsassistent 🏷️

KI-gestützter Anzeigen-Generator als Web-App (PWA): Fotos vom Produkt machen,
ein paar Angaben eintragen – Claude erstellt automatisch Titel, Beschreibung
und Preisvorschlag für **Kleinanzeigen.de** und **eBay.de**. Per Kopieren/Teilen
in wenigen Klicks einstellen.

## Funktionen

- 📸 Bis zu 10 Produktfotos (Kamera oder Galerie), automatisch verkleinert für die KI
- 💾 Original-Fotos werden pro Anzeige gespeichert (IndexedDB) – per „Fotos teilen"
  in die Galerie sichern oder direkt an die Kleinanzeigen-App senden
- 🤖 Claude KI erkennt Produkt, Marke, Zustand und erstellt ehrliche Anzeigentexte
- ⚠️ Zeigt an, was die KI **nicht** sicher erkennen konnte – zum Gegenprüfen
- 💶 Unverbindlicher KI-Preisvorschlag
- ✏️ Vorschau mit Bearbeitung, Zeichenzähler (65 Zeichen Kleinanzeigen / 80 eBay)
- ⚖️ Privatverkaufs-Hinweis per Checkbox (Text in den Einstellungen änderbar)
- 📋 Kopieren-Buttons je Feld, 📤 Teilen direkt in die Kleinanzeigen-App
- 🗂 Verlauf aller erstellten Anzeigen mit „eingestellt"-Häkchen
- 📱 Als App aufs Handy installierbar (PWA), Daten bleiben lokal auf dem Gerät

## Einrichtung

### 1. GitHub Pages aktivieren (einmalig)

1. In diesem Repository: **Settings → Pages**
2. Unter „Build and deployment": Source = **Deploy from a branch**, Branch = **main**, Ordner **/ (root)** → **Save**
3. Nach 1–2 Minuten ist die App unter `https://<username>.github.io/verkaufsassistent/` erreichbar

### 2. Aufs Handy holen

1. Die Adresse im Handy-Browser öffnen (Chrome/Safari)
2. Menü → **„Zum Startbildschirm hinzufügen"**

### 3. Claude API Key eintragen

1. Auf [console.anthropic.com](https://console.anthropic.com/settings/keys) anmelden
2. **API Keys → Create Key**, Key kopieren
3. In der App: **⚙ Einstellungen** → Key einfügen → Speichern

Kosten: ca. 1–2 Cent pro erstellter Anzeige. Der Key wird nur lokal auf dem
Gerät gespeichert (localStorage) und direkt an die Anthropic-API gesendet.

## Chrome-Erweiterung für den PC (Autofill für Kleinanzeigen)

Im Ordner [`extension/`](extension/) liegt eine Chrome-Erweiterung, die auf
kleinanzeigen.de → „Anzeige aufgeben" ein kleines Panel einblendet und das
Formular mit deinen Entwürfen ausfüllt (Titel, Beschreibung inkl. Rechtshinweis,
Preis, VB, Fotos). **Sie sendet nie automatisch ab** – der „Anzeige
aufgeben"-Klick bleibt bei dir.

### Installation (einmalig)

1. Dieses Repository als ZIP herunterladen (grüner **Code**-Button → *Download ZIP*) und entpacken
2. In Chrome `chrome://extensions` öffnen
3. Oben rechts **Entwicklermodus** aktivieren
4. **„Entpackte Erweiterung laden"** → den entpackten Ordner `extension/` auswählen

### Nutzung

1. Verkaufsassistent-App **im selben Chrome** öffnen (dort synchronisiert die
   Erweiterung deine Entwürfe automatisch, inkl. Fotos)
2. kleinanzeigen.de → „Anzeige aufgeben" öffnen
3. Unten rechts im Panel den Entwurf anklicken → Formular wird ausgefüllt
4. Kategorie/Details prüfen, selbst auf „Anzeige aufgeben" klicken

Falls Kleinanzeigen sein Formular umbaut und Felder nicht mehr gefüllt werden,
zeigt das Panel das an (✗) und bietet Kopieren-Buttons als Fallback; die
Selektoren stehen oben in `extension/content-ka.js` und lassen sich leicht
nachpflegen.

## Hinweise

- **Kleinanzeigen & eBay:** Kleinanzeigen bietet keine öffentliche API. Die
  Chrome-Erweiterung füllt nur aus und sendet nie automatisch ab – trotzdem
  bewegt sich automatisches Befüllen in einer Grauzone der
  Kleinanzeigen-Nutzungsbedingungen; Nutzung auf eigenes Risiko, sparsam und
  nur für eigene, geprüfte Anzeigen. Eine echte eBay-API-Anbindung
  (automatisches Einstellen) ist als Phase 2 geplant.
- Der KI-Preisvorschlag ist eine grobe Schätzung, kein Marktgutachten.
- Der Privatverkaufs-Standardtext ist gängige Praxis, aber keine Rechtsberatung.
