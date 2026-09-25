# Contexter auf eigenen Geräten testen

## Android

Die bereitgestellte `contexter-android-0.9.0-test.6.apk` auf das Android-Gerät übertragen, öffnen und die Installation aus dieser Quelle für diesen Vorgang erlauben. Alternativ bei aktiviertem USB-Debugging: `adb install -r contexter-android-0.9.0-test.6.apk`. Die APK ist eine Debug-Version und nicht für den Store signiert. Vor einem späteren Signaturwechsel unbedingt die Sicherung außerhalb der App speichern.

1. Contexter öffnen und ein Notebook anlegen. Eine kurze Textquelle hinzufügen, bearbeiten und einmal deaktivieren.
2. Aus einer anderen App einen Weblink und eine TXT-/PDF-Datei über das Android-Teilen-Menü an Contexter senden. Die Eingänge sollten in der Inbox erscheinen. Bei nicht auslesbarer Datei erscheint ein erneut versuchbarer Eingang.
3. Im Notebook „Exportieren“ wählen und Markdown oder ZIP an „Dateien“, E-Mail, Telegram oder eine Cloud-App geben. Contexter wählt keinen Dienst automatisch.
4. Über „Exportieren → Sicherung speichern / teilen“ eine vollständige Contexter-Sicherungs-ZIP außerhalb der App ablegen. Auf dem zweiten Gerät dieselbe APK installieren und die ZIP dorthin übertragen. Tippe bei Notebooks auf „+“ und wähle „Sicherung importieren“ → „Alles als neues Notebook importieren“; gib im selben Fenster den Notebook-Namen ein. Alternativ die ZIP im Android-Dateimanager mit „Öffnen mit → Contexter“ öffnen. Die vorhandenen Notebooks sollen erhalten bleiben. Für den Geräteabgleich kannst du stattdessen „Mit bestehender Bibliothek zusammenführen“ wählen; dafür bleibt auch „Exportieren → Zusammenführen“ verfügbar. „Exportieren → Ersetzen“ überschreibt nach Bestätigung die gesamte Bibliothek. Der ZIP-Export eines einzelnen Notebooks ist keine vollständige Sicherung und kann hier nicht wiederhergestellt werden.
5. Nach App-Neustart prüfen, ob Notebooks und Texte erhalten geblieben sind. Zum Konflikttest dieselbe Quelle auf beiden Geräten verschieden bearbeiten, eine Sicherung übertragen und zusammenführen; beide Fassungen sollten sichtbar bleiben.
6. Ein Notebook lange drücken: Das Aktionsfenster sollte „In den Papierkorb“ anbieten. Nach Bestätigung über „Papierkorb“ wiederherstellen. Über das Griffsymbol ⋮⋮ kannst du ein Notebook auf ein anderes ziehen, um es zu sortieren, oder auf den Papierkorb, um es nach Bestätigung zu löschen. Die Quellen bleiben dabei erhalten.
7. Einen YouTube-Link kopieren und auf „Quelle hinzufügen“ tippen. Nur bei erkanntem YouTube-Link sollte die App fragen, ob sie ihn in den YouTube-Tab übernehmen soll. Ohne Link öffnet sich der normale Dialog.
8. Im YouTube-Tab zwei Video-URLs untereinander einfügen. „Originalsprache (falls erkennbar)“ ist vorausgewählt; bei nicht erkennbarer Originalsprache Deutsch oder Englisch manuell wählen. „Untertitel ohne API-Schlüssel laden“ zeigt den Fortschritt; vorhandene Videos werden übersprungen. Neue Transkripte sollen ohne Zeitstempel und ohne rollende Wiederholungen erscheinen.
9. Für eine ältere YouTube-Quelle mit Zeitstempeln oder wiederholten Satzanfängen im Quellendetail „Text bereinigen“ wählen. Vorher bei Bedarf eine Sicherung erstellen; manuell bearbeitete Quellen werden nicht automatisch überschrieben.
10. Meldet YouTube „Sign in to confirm you’re not a bot“, zunächst VPN ausschalten oder Netzwerk wechseln und erneut versuchen. Optional kannst du eine selbst exportierte Netscape-Cookie-Datei mit YouTube-Cookies im YouTube-Tab auswählen. Die App filtert andere Domains und hält die Cookies nur für die laufende Sitzung, nicht in der Sicherung. Verwende keine Cookie-Datei aus unsicherer Quelle und teile sie mit niemandem. Der Cookie-Ausweg ist noch nicht mit einem echten Konto live geprüft und garantiert keinen Erfolg.

## Chromium-Erweiterung

Die bereitgestellte `contexter-chrome-test.zip` zuerst entpacken. In `chrome://extensions` den Entwicklermodus einschalten und den entpackten Ordner als Erweiterung laden. Beim eigenen Build ist dies `.output/chrome-mv3`. Eine normale HTTP(S)-Webseite öffnen, dort auf das Contexter-Symbol klicken und im neu geöffneten Dashboard „Quelle hinzufügen → Website / URL → Vorherigen Tab übernehmen“ wählen. Systemseiten wie `chrome://` sind nicht erfassbar. Exporte landen über den Browser-Download an dessen eingestelltem Speicherort; die Browserbibliothek ist von der Android-Bibliothek getrennt, bis eine Sicherung übertragen wird.

## Bitte bei Fehlern notieren

Gerätemodell und Android-Version bzw. Chrome-Version; welche Eingabe geteilt oder importiert wurde (bei privaten Inhalten nur Dateityp/Größe nennen); erwartetes und tatsächliches Ergebnis; ob der Fehler nach Neustart wiederkehrt. API-Schlüssel niemals in Screenshots oder Fehlerberichte übernehmen.

Bekannte Grenzen: reine Bild-PDFs ohne OCR; manche Websites und YouTube blockieren automatisches Abrufen; DRM-EPUBs werden nicht unterstützt; normaler Dateieingang bis 25 MiB und Contexter-Sicherungs-ZIP bis 100 MiB; URL-Inhalt bis 10 MiB; kein automatischer Geräteabgleich. Der direkte yt-dlp-Abruf ist nur in der 64-Bit-Android-App integriert, nicht in der Chromium-Erweiterung. Optionale externe Anbieter sind ohne eigenen Schlüssel nicht live geprüft.

## YouTube ohne API-Schlüssel: Ausweichweg über Untertiteldatei

Falls ein direkter Abruf scheitert oder du die Chromium-Erweiterung verwendest, kannst du eine mit `yt-dlp` erzeugte `.vtt`- oder `.srt`-Datei in Contexter über „Quelle hinzufügen → Datei“ importieren oder auf Android an Contexter teilen. Zeitstempel und Text bleiben erhalten. `yt-dlp` unterstützt `--skip-download`, `--write-subs` und `--write-auto-subs`, um nur Untertitel zu speichern:

```sh
yt-dlp --skip-download --write-subs --write-auto-subs --sub-langs 'de.*,en.*' --sub-format vtt 'https://www.youtube.com/watch?v=VIDEO_ID'
```

Es werden nur Spuren ausgegeben, die für das Video tatsächlich erreichbar sind; es wird keine neue Transkription der Audiospur erzeugt.
