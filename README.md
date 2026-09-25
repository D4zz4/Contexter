# Contexter

Contexter sammelt Quellen lokal, extrahiert ihren vorhandenen Text und exportiert ihn mit Herkunftsangaben als Markdown, Klartext oder ZIP. Die App enthält keinen KI-Chat und erzeugt keine Zusammenfassungen.

**Stand: 0.9.0-test.5.** Eine persönlich testbare Android-APK und eine Chromium-Erweiterung sind vorhanden. Die Android-App wurde auf einem echten Gerät mit YouTube-Untertiteln getestet. Dies ist noch keine öffentlich freigegebene 1.0: schwierige Referenzdateien und Live-Tests der optionalen Anbieter mit eigenen API-Schlüsseln stehen aus. Die ursprüngliche Planungsbaseline steht unter [docs/README.md](docs/README.md); [docs/07-implementation-status.md](docs/07-implementation-status.md) hält den aktuellen Stand und spätere Produktentscheidungen fest.

## Was die Testversion kann

- Inbox als Eingangskorb für geteilte Inhalte; Notebooks erstellen, umbenennen, archivieren, sortieren, in den Papierkorb legen und wiederherstellen. Langes Drücken öffnet Aktionen; das Griffsymbol zieht ein Notebook auf ein anderes oder auf den Papierkorb. Quellen lassen sich suchen, bearbeiten, verschieben und deaktivieren.
- Text und mehrere URLs importieren; TXT, Markdown, HTML, PDF mit Textschicht, DOCX, EPUB ohne DRM, CSV sowie VTT/SRT-Untertitel lokal verarbeiten. Nicht auslesbare oder gescannte PDF-Seiten brauchen später OCR.
- Auf Android Text, Links und unterstützte Dateien aus anderen Apps über das Teilen-Menü empfangen. Eingänge werden vor der Verarbeitung app-intern zwischengespeichert und nach erfolgreichem Speichern quittiert.
- In der Chromium-Erweiterung die Webseite übernehmen, von der aus das Erweiterungssymbol geöffnet wurde. Für beliebige URLs wird die jeweilige Website-Berechtigung angefragt.
- Auf Android vorhandene YouTube-Untertitel direkt mit eingebettetem `yt-dlp` ohne API-Schlüssel abrufen; standardmäßig die erkannte Originalsprache, alternativ Deutsch oder Englisch. Mehrere Video-Links lassen sich auf einmal einfügen und nacheinander importieren. Neue YouTube-Transkripte enthalten keine Zeitstempel; rollende Zeilen werden zusammengeführt. Ältere Quellen lassen sich lokal im Detail bereinigen. Beim Öffnen von „Quelle hinzufügen“ kann die App einen YouTube-Link aus der Zwischenablage zur Übernahme anbieten. YouTube kann Abrufe je nach Netzwerk oder VPN blockieren; eine Fehlermeldung erklärt das. Optional lassen sich zuvor selbst exportierte YouTube-Cookies nur für die laufende App-Sitzung verwenden. Es gibt keinen direkten Zugriff auf Cookies anderer Android-Browser und keine eingebettete Google-Anmeldung. Im Browser oder als Ausweichweg lassen sich `.vtt`- oder `.srt`-Dateien importieren.
- Optional nach eigener Eingabe eines API-Schlüssels: YouTube-Untertitel über Supadata, Kanal-/Playlist-Video-IDs und Websuche über Brave Search. Diese Dienste können Kosten verursachen; ohne bewussten Klick wird nichts an sie gesendet. Schlüssel werden nicht in Bibliothek oder Sicherung gespeichert.
- Aktive Quellen als eine `.md`, `.txt` oder ZIP mit Markdown-Einzeldateien ausgeben oder Markdown in die Zwischenablage kopieren. Auf Android öffnet sich für Dateien das Teilen-Menü: dort kannst du z. B. „Dateien“, E-Mail, Telegram oder eine Cloud-App wählen.
- Die gesamte lokale Bibliothek als Sicherungs-ZIP ausgeben und auf einem anderen Gerät **manuell** zusammenführen oder ersetzen. Abweichende Fassungen bleiben beim Zusammenführen als Konfliktkopien erhalten. Es gibt keinen automatischen Cloud-Abgleich.

## Testen

Die [Testanleitung](docs/08-test-guide.md) enthält Installation, einen kurzen Durchlauf und die bekannten Grenzen. Vor einer Deinstallation bitte eine Sicherungs-ZIP erstellen und außerhalb der App speichern: Bibliothek und Eingangsqueue liegen im lokalen App-/Browserprofil.

## Lokal entwickeln

Node.js 22+ und npm:

```sh
npm ci
npm test
npm run build
npm run dev
```

Die Weboberfläche läuft unter `http://127.0.0.1:5173/`. Für Chrome unter `chrome://extensions` den Entwicklermodus aktivieren und `.output/chrome-mv3` als entpackte Erweiterung laden. Für Android werden zusätzlich Android Studio, das Android SDK und JDK 21 benötigt:

```sh
npx cap sync android
cd android
./gradlew assembleDebug
```

Die Debug-APK liegt dann unter `android/app/build/outputs/apk/debug/app-debug.apk`. Sie ist nur zum lokalen Testen gedacht, nicht als signierte Store-Version. Beim Wechsel zu einer anderen Signatur kann Android eine Neuinstallation verlangen; vorher sichern.

## Datenschutz und Grenzen

Bibliotheken liegen pro Plattform lokal in IndexedDB; es gibt weder Benutzerkonten noch einen Server von Contexter. Android nutzt zusätzlich app-internen Speicher für noch nicht bestätigte Teileingänge. Ein Export, ein direkter YouTube-Abruf oder eine bewusst gestartete Anbieterabfrage verlässt das Gerät nur durch deine Aktion. Webseiten und YouTube können beim Abruf ihre eigenen Zugriffsprotokolle führen. Der Sicherungs- und Exportweg ist zugleich der portable Dateipfad; die ursprüngliche Idee, jede Quelle als direkt editierbare Datei im Geräteordner zu führen, ist in dieser Testversion nicht umgesetzt.
