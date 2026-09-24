# Produktumfang und Anforderungen

## Produktversprechen

„Collect anything. Turn it into clean context. Use it with any AI.“

Die App übernimmt das Einsammeln und Aufbereiten von Informationsquellen. Nutzer behalten den Text, die Herkunft und die Entscheidung, mit welchem Modell sie ihn anschließend verarbeiten. Ziel ist möglichst vollständiger relevanter Inhalt. Extraktion kann unvollständig sein; die App macht bekannte Lücken sichtbar und ergänzt keine erfundenen Inhalte.

## Zielperson und Hauptanwendungsfall

Zunächst ein einzelner Nutzer mit Android-Handy und Desktop-Browser. Er sammelt unterwegs Videos, Webseiten und Dokumente zu einem Thema, prüft die Sammlung am Desktop und exportiert sie als Kontext. Beispiel: ein Notebook „PROFIBUS“ mit Webartikeln, Handbuch-PDFs und Video-Transkripten. Keine Konten, Teamrollen, Bezahlung innerhalb der App oder eigene Cloudinfrastruktur in der persönlichen Version.

## Produktregeln

1. Quelltext wird strukturell bereinigt, nicht semantisch zusammengefasst. Keine automatische Übersetzung oder Umformulierung.
2. Quelltyp, Originalbezug und Verarbeitung bleiben nachvollziehbar. Manuelle Änderungen werden markiert.
3. Externe Such- und Verarbeitungsdienste sind standardmäßig deaktiviert. Ihre Aktivierung nennt Zweck, übertragenen Inhalt und mögliche Kosten.
4. Bereits gespeicherte Inhalte bleiben ohne Internet lesbar, editierbar und exportierbar.
5. Fehler einer Quelle blockieren weder andere Importe noch den Zugriff auf vorhandene Inhalte.
6. Export schneidet Inhalte nie unbemerkt ab. Fehlende Quellen und Umfang sind vor dem Export sichtbar.
7. Keine Abhängigkeit des Datenformats von einem LLM oder Suchanbieter.

## Begriffe

| Begriff | Bedeutung |
| --- | --- |
| Library | Alle lokalen Notebooks und die Inbox |
| Notebook | Thematische Sammlung von Quellen |
| Quelle / Source | Ein Artikel, ein Video-Transkript, eine Datei oder eingefügter Text |
| Inbox | Erfasste Quellen ohne thematische Zuordnung; intern reserviertes Notebook |
| Importauftrag | Nachvollziehbare Verarbeitung einer oder mehrerer Eingaben |
| Provider | Optionaler Dienst oder lokaler Adapter für eine bestimmte Fähigkeit |
| Kontext-Export | Ausgewählte verarbeitete Quellen mit Herkunftsinformationen |
| Backup | Vollständige Sicherung einschließlich nicht exportierter Quellen und Wiederherstellungsdaten |

Eine Quelle gehört zunächst genau zu einem Notebook. Verschieben behält ihre ID; Kopieren in ein anderes Notebook erzeugt eine neue ID und einen Herkunftsverweis. Geteilte, zentral verknüpfte Quellen zwischen Notebooks sind nicht Teil der ersten Version.

## Anforderungen und Prioritäten

Alle unten als 0.1–1.0 bezeichneten Funktionen sind Teil des vorgesehenen ersten Produktumfangs. Die Stufen bestimmen die Reihenfolge, nicht das Weglassen einer Nutzeranforderung.

| ID | Anforderung | Lieferung | Abnahme |
| --- | --- | --- | --- |
| F01 | Notebooks anlegen, umbenennen, archivieren, wiederherstellen; Inbox | 0.1 | Zwei getrennte Sammlungen bleiben nach Neustart erhalten |
| F02 | Android Share Target für URLs, Text und unterstützte Dateien | 0.1 | Cold Start und bereits geöffnete App speichern je einmal |
| F03 | Aktuelle Webseite per Extension aufnehmen | 0.1 | Sichtbarer Artikel samt Listen/Code wird lokal extrahiert |
| F04 | Eine oder mehrere URLs, Text, TXT, MD, HTML importieren | 0.1 | Jede Eingabe erhält ein separates Ergebnis oder einen erklärten Fehler |
| F05 | Quellen ansehen, bearbeiten, verschieben, erneut verarbeiten, deaktivieren und löschen | 0.1 | Bearbeitete Inhalte werden durch Reprocessing nicht still überschrieben |
| F06 | Titel, Typ, Originalbezug, verfügbare Autor-/Datumsdaten, Import/Extraktion, Umfang und Status | 0.1 | Unbekannte Werte bleiben unbekannt; keine erfundenen Datumsangaben |
| F07 | Duplikate erkennen | 0.1 | YouTube-ID, konservative URL-Identität und Datei-/Inhalts-Hash berücksichtigen |
| F08 | Zeichen, Wörter und geschätzte Tokens pro Quelle/Notebook | 0.1 | Schätzmethode erkennbar; deaktivierte Quellen getrennt zählen |
| F09 | Einzelfile MD/TXT, Dateien/ZIP und Zwischenablage | 0.1 | Herkunft jeder Quelle bleibt im Ergebnis erkennbar |
| F10 | YAML, relative Links, Obsidian-freundlich, OKF-Profil | 0.1 | Exportprüfung anhand des Datenvertrags besteht |
| F11 | Eigene Backups wieder einlesen | 0.1 | Notebook inklusive aktiver/inaktiver Quellen wiederherstellbar |
| F12 | PDF mit Textschicht | 0.2 | Seitenbezug erhalten; Scan/kompliziertes Layout als Einschränkung ausgewiesen |
| F13 | YouTube-Einzelvideo: bestehende Transkripte | 0.2 | Sprache und Zeitbezug vorhanden; fehlende Untertitel sauber gemeldet |
| F14 | Suchbegriff → Trefferliste → Checkboxen → Quellen importieren | 0.2 | Such-Snippets werden nicht als vollständige Quelle ausgegeben |
| F15 | Optionaler externer Web-Extractor | 0.2 | Deaktiviert erfolgt keinerlei Anfrage an ihn |
| F16 | DOCX, EPUB ohne DRM und CSV | 0.3 | Inhalte im Referenzkorpus erhalten; Formatgrenzen dokumentiert |
| F17 | YouTube-Kanal und Playlist als Sammlung importieren | 0.3 | Auswahl, letzte X, seit Datum, alle erreichbaren Einträge; Limits sichtbar |
| F18 | Wiederaufnahme von Batch-Aufträgen, Pause, Abbruch, Fortschritt | Grundgerüst 0.1, Batch 0.3 | Neustart erzeugt keine bereits abgeschlossenen Quellen doppelt |
| F19 | Lokale portable Dateistruktur | 0.1 | Notebook ohne App mit Texteditor lesbar; Index neu aufbaubar |
| F20 | Synchronisation ohne eigenen zentralen Server | 1.0 | Ein realer Gerätepfad und Konfliktfälle nachweislich getestet |
| F21 | Quellen lokal filtern/suchen und sortieren | 0.1 Metadaten, später Volltext | Suche verwechselt lokale Quellen nicht mit Websuche |

## Präzisierungen zu Quellen

**Webseiten:** Navigation, Banner und Werbung möglichst entfernen; Überschriften, Text, Listen, Tabellen, Code und Links bewahren. Die aktuelle Browserseite kann einen anderen Inhalt liefern als ein späterer URL-Abruf. Erfassungsart wird gespeichert. Foren und Reddit erhalten zunächst keine Zusage, versteckte oder paginierte Kommentare vollständig einzulesen. Geladene Beiträge sind erfassbar, Umfang wird angezeigt. Kein allgemeiner Website-Crawler in Version 1.0.

**YouTube:** Vorhandene manuelle und automatisch von YouTube erstellte Untertitel sind Quellen. Die App erzeugt selbst keine Ersatztranskripte. Sprachpräferenz initial Deutsch, dann Englisch, dann vorhandene Originalsprache; tatsächliche Sprache anzeigen. Keine stille Übersetzung. Kanal/Playlist ist ein übergeordneter Auftrag, jedes Video eine Quelle. „Alle“ bedeutet alle vom gewählten Adapter erreichbaren Einträge; private, gelöschte oder unzugängliche Videos bleiben im Abschlussbericht sichtbar, soweit bekannt. Erreichte Providergrenzen werden ausdrücklich genannt.

**Dateien:** TXT/MD sollen Text einschließlich Code unverändert bewahren, abgesehen von dokumentierter Zeichencodierung/Zeilenenden. HTML wird bereinigt. PDF-Textreihenfolge ist qualitativ zu prüfen; Scans werden ohne OCR nicht als erfolgreich extrahierter Volltext behandelt. DOCX-Layout und EPUB-Darstellung werden in lesbare Struktur übersetzt. DRM, Bild-OCR und Audio-Transkription sind spätere eigenständige Entscheidungen.

## Nicht vorgesehen

Zusammenfassungen, KI-Antworten, Chat, Lernkarten, FAQs, Audio Overviews, generierte Berichte oder semantische Anreicherung. Keine manuelle Quellenreihenfolge. Keine iOS-, Safari- oder Firefox-Zusage. Keine eigenen Windows/macOS/Linux-Programme zum Start. Keine Mehrbenutzer-Zusammenarbeit und kein eigener Syncserver.

## Vorgemerkte Erweiterungen

Modellspezifische Tokenizer, Aufteilung nach Tokenbudget, MCP-Server, lokale REST-API, CLI, Agent-Anbindung, Obsidian-Plugin, Git-Integration und lokale Volltextsuche. Weitere Eingabeformate wie PPTX/XLSX sowie Audio sind separat zu bewerten. Diese Erweiterungen werden nicht vorausgebaut; stabile Daten- und Adaptergrenzen halten sie möglich.

## Qualitätsziele

- Kein stiller Verlust bereits bestätigter Speichervorgänge bei Neustart oder Verarbeitungsfehlern.
- Eine verweigerte Berechtigung führt zu einer verständlichen nächsten Aktion.
- Auf einem festgehaltenen Referenzgerät öffnet ein Notebook mit 1.000 Quellen innerhalb von 2 Sekunden; nur Metadaten werden dafür geladen. Zielwert, noch nicht gemessen.
- URL-/Texteingang wird nach dem Bestätigen innerhalb von 2 Sekunden dauerhaft erfasst; Dateikopien zeigen Fortschritt. Zielwert, noch nicht gemessen.
- Deutsche Oberfläche, zugängliche Bedienung per Tastatur und TalkBack, Informationen nicht nur über Farbe.
- Kein externer Netzwerkverkehr für lokale Text-/Dateiverarbeitung, abgesehen von ausdrücklich gewählten Originalabrufen oder Providern.

## Abnahmeszenario für 1.0

Auf Android Quellen teilen, am Desktop weitere Artikel und Dateien ergänzen, Treffer über Websuche auswählen, eine Playlist importieren, Duplikate prüfen, einzelne Inhalte korrigieren, den getesteten Syncpfad benutzen und dieselbe Sammlung als MD, TXT und ZIP exportieren. Der Export enthält die gewählten verarbeiteten Quellen mit korrekter Herkunft. Fehler, Konflikte und unvollständige Extraktionen sind erkennbar. Ein Backup lässt sich in einer leeren Installation wiederherstellen.
