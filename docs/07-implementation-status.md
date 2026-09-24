# Implementierungsstand und geänderte Entscheidung

Stand: 24. September 2026 · 0.9.0-test.2

Die Dokumente 01–06 sind die historische Planungsbaseline vor dem Coding. Ihre Aussagen „noch nicht implementiert“ und die dortige automatische Synchronisationsarchitektur beschreiben nicht mehr den aktuellen Stand. Die laufende Implementierung ist im Root-README beschrieben.

Die spätere Entscheidung des Nutzers für 1.0 lautet: lokal speichern, Dateien über andere Apps weiterreichen können und eine Sicherung auf einem anderen Gerät bewusst importieren. Automatischer Ordner-/Cloud-Abgleich ist für 1.0 nicht nötig. Deshalb ist die umgesetzte Mehrgerätefunktion eine exportierte Sicherungs-ZIP mit manuellem Zusammenführen und erhaltener Konfliktkopie. Dropbox, Google Drive, E-Mail oder Telegram sind mögliche Ziele des Android-Teilen-Menüs, keine integrierten Sync-Provider.

## Bereits implementiert

Gemeinsame React/TypeScript-Oberfläche für Android und Chromium-Erweiterung; IndexedDB-Bibliothek; lokale Quellverwaltung und Papierkorb; TXT/MD/HTML/PDF/DOCX/EPUB/CSV/VTT/SRT-Adapter; Web- und Erweiterungs-Tab-Erfassung; optionale Supadata- und Brave-Adapter; MD/TXT/ZIP-Export; vollständige Sicherung und Merge; Android-Share-Target mit persistierter Eingangsqueue. Unit- und Contract-Tests sowie Web-/Extension-/Android-Build laufen. Der Android-Emulator bestätigte den Empfang von Text und einer über `content://` freigegebenen CSV sowie die Quittierung nach Verarbeitung.

## Vor einer öffentlichen 1.0 noch zu belegen

- Installation und komplette Teilen-/Export-/Wiederherstellungsrunde auf einem echten Android-Gerät. Der bisherige Android-Nachweis stammt aus einem Emulator.
- Inhaltstreue der Parser an schwierigeren PDF-, DOCX-, EPUB- und Webseiten-Beispielen. OCR für reine Bild-PDFs ist nicht enthalten.
- Live-Verhalten der optionalen Anbieter mit vom Nutzer bewusst eingegebenen API-Schlüsseln und realen Limits/Kosten. Die Tests verwenden nur synthetische Antworten.
- Prüfung der Erweiterung im tatsächlichen Chrome-UI, einschließlich Berechtigung für den zuvor geöffneten Tab.
- Vor einer Veröffentlichung: eigenständige Signierung, Updatepfad, Datenschutz- und Lizenzprüfung. Die Debug-APK ist keine Store-Version.

## Bewusste Abweichungen von der frühen Architektur

Die Bibliothek ist aktuell in IndexedDB statt als lose Markdown-Quelldateien gespeichert. Die Sicherungs-ZIP enthält ein vollständiges JSON und menschenlesbare Markdown-Kopien; nur das JSON wird wiederhergestellt. Eine Änderung an einer Markdown-Kopie in der ZIP wird beim Import nicht übernommen. Exporte öffnen auf Android das System-Teilen-Menü, statt automatisch in einen gewählten Ordner zu schreiben. API-Schlüssel existieren nur während der laufenden Sitzung im Speicher, nicht in einem persistenten SecretStore.
