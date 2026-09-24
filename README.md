# Contexter

Contexter sammelt Quellen, extrahiert ihren Text und exportiert ihn mit nachvollziehbarer Herkunft. Die App erzeugt keine Zusammenfassungen und enthält keinen KI-Chat.

Status: aktive Entwicklung, noch keine Version 1.0. Die Desktop-Oberfläche und die Chromium-Erweiterung können gebaut werden. Eine Android-Projekthülle ist angelegt; Share Target, native Dateispeicherung und Gerätetest stehen noch aus. Die vollständige Roadmap steht unter [docs/README.md](docs/README.md).

## Aktuell implementiert

- Notebooks und Inbox, lokale Speicherung in IndexedDB
- Aktuelle Browserseite per Erweiterung, Web-URL, eingefügter Text und mehrere URLs
- Dateieingang für TXT, Markdown, HTML, PDF mit Textschicht, DOCX, EPUB ohne DRM und CSV
- Quellenansicht, manuelle Textbearbeitung, Aktivierung für den Export, einfache Duplikaterkennung
- Export als einzelne Markdown- oder Textdatei, OKF-orientiertes ZIP und Zwischenablage

Die Dateiformat-Unterstützung ist noch nicht vollständig mit Referenzdokumenten validiert. Die Oberfläche und das Datenmodell werden schrittweise auf die geplante portable Dateistruktur umgestellt. Derzeit liegt der Arbeitsstand geräteintern im Browser-/WebView-Speicher; regelmäßige Exporte sind bis zur Backup-Funktion ratsam.

## Lokal starten

Node 22+ und npm werden benötigt.

```sh
npm ci
npm run dev
```

Weboberfläche unter `http://127.0.0.1:5173/`. Für die Erweiterung:

```sh
npm run build:extension
```

In Chrome `chrome://extensions` öffnen, Entwicklermodus einschalten und `.output/chrome-mv3` als entpackte Erweiterung laden. Das Erweiterungssymbol öffnet das Dashboard.

Für den Android-Build sind Android Studio und SDK nötig; die native Integration wird noch umgesetzt.

## Prüfen

```sh
npm test
npm run build
```
