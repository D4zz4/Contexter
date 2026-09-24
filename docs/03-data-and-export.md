# Datenformat, Export und Synchronisation

Die folgenden Regeln sind der projektspezifische Datenvertrag, Version 1. Er wird beim Implementieren in Schemas und aussagekräftige Testfälle übersetzt. Die Beispiele sind erfundene Demonstrationsdaten.

## Identität und Entitäten

IDs sind zufällige UUIDs. Titel und Dateipfade dienen nicht als Identität. Zeiten werden intern als ISO-8601-Zeitpunkte in UTC geschrieben; ein nur tagesgenau bekanntes Veröffentlichungsdatum bleibt ein Datum und erhält keine erfundene Uhrzeit.

| Entität | Pflichtdaten | Optionale Daten / Regeln |
| --- | --- | --- |
| Library | schema_version, library_id | Anzeigename; keine gerätebezogenen Pfade im portablen Teil |
| Notebook | id, title, created_at, updated_at, revision_id | Beschreibung vom Nutzer, Tags, archived; Inbox mit festem Systemtyp |
| Source | id, notebook_id, kind, title, input_ref, imported_at, enabled, revision_id | Original-URL/-Dateiname, canonical_url, author, published_date, language, tags |
| Source-Inhalt | Markdown, extracted_at, extractor_id/version, warnings, coverage | Bei noch nicht extrahierten Quellen fehlt der Inhalt ausdrücklich |
| Inhaltspflege | origin_body_hash, current_body_hash, edited_by_user | Letzte Bearbeitung und ursprüngliche Extraktionsrevision |
| Job | id, input_ref, source_id, state, stage, attempt, created_at | checkpoint, provider_job_id, retry_after, error; gerätespezifisch |
| Batch | id, type, origin, enumeration_state, selected_video_ids | Filter, Cursor, discovered/selected/ready/failed/skipped, known_limit |
| Revision | revision_id, entity_id, entity_kind, parent_ids, device_id, payload, checksum | Löschung als tombstone; keine wall-clock-basierte Konfliktentscheidung |

`kind`: `web`, `youtube`, `pdf`, `docx`, `epub`, `csv`, `html`, `markdown`, `text`. Playlist/Kanal ist ein Batch und kein künstlich zusammengefasster Quellentext. Beim Dateieingang wird ein SHA-256 der Originalbytes gespeichert; eine URL und eine Datei haben getrennte Identitätsregeln.

## Zustände nicht vermischen

Aufträge: `queued → running → succeeded`; von `running` außerdem `waiting_network`, `waiting_permission`, `waiting_provider`, `paused`, `needs_review`, `failed` oder `cancelled`. Nach Wiederstart wird ein verwaister `running`-Auftrag am letzten bestätigten Checkpoint neu aufgenommen. `failed` startet nur durch explizites Wiederholen; `cancelled` startet nicht automatisch neu.

Eine Source zeigt unabhängig davon `has_content`, `enabled`, `freshness` (`unknown`, `current`, `outdated`) und `coverage` (`unknown`, `complete_for_input`, `partial`, `empty`). `complete_for_input` bedeutet vollständig bezogen auf den tatsächlich verfügbaren Eingang, nicht auf eine gesamte Website oder einen vollständigen Kommentarbaum. Bekannte Lücken stehen in `warnings`.

UI-Status: „Wartet“, „Verarbeitung“, „Bereit“, „Bereit mit Hinweis“, „Aktion nötig“, „Fehlgeschlagen“, „Aktualisierung verfügbar“. Scheitert ein erneuter Abruf, bleibt der bisherige Text verfügbar und ein separater Aktualisierungsfehler sichtbar. Exportfähigkeit ergibt sich aus vorhandenem Inhalt und Konfliktstatus, nicht aus dem letzten Job allein.

## Dateistruktur

```text
ContextBuilder/
  library.json
  notebooks/
    <notebook-id>/
      notebook.json
      index.md
      sources/
        <source-id>.md
      assets/                        optional erhaltene Originale
  _history/
    <entity-id>/
      <revision-id>.json             unveränderliche vollständige Revision
  _trash/                           wiederherstellbare lokale Löschungen
```

Außerhalb dieses portablen Bereichs liegen pro Gerät: Index, Suchcache, Auftragsjournal, temporäre Eingänge, Handles, Einstellungen zu Berechtigungen und SecretStore. Im Dateivertrag sind Hashes und Revisionen von Anfang an vorgesehen; Synchronisationsverkehr kommt erst in 1.0 hinzu.

Die aktuellen Markdown-Dateien sind der direkt lesbare Arbeitsstand. Die Revisionsdateien sichern bestätigte Änderungen und erlauben seine Rekonstruktion. Sie enthalten vollständige Nutzdaten, keine bloßen Differenzen. Rohdateien werden standardmäßig nach erfolgreich bestätigter Extraktion und Abschluss der Wiederherstellungsfrist entfernt; „Original behalten“ ist optional. Solange ein Import nicht abgeschlossen ist, bleibt sein nötiger Eingang lokal verfügbar. Fehlende Originale erfordern beim erneuten Extrahieren einer Datei eine Neuauswahl.

## YAML und OKF-Profil

Ziel ist ein definierter OKF-v0.2-Export. Die geprüfte Spezifikation verlangt für Konzeptdateien YAML mit `type`; `index.md`/`log.md` haben besondere Regeln. Provenienz verwendet `sources[].resource`; `generated` beschreibt die Erstellung. Eigene Felder sind erlaubt. Der Root-Index darf `okf_version` tragen. [Offizielle Spezifikation](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md).

Unser Profil nutzt `type: Reference`, eigene `cb_`-Felder und den unveränderten extrahierten Body. `verified` wird nicht durch erfolgreiches Parsen gesetzt: Quellinhalt wurde dadurch nicht sachlich verifiziert. Das OKF-Lifecycle-Feld `status` wird nicht mit Importstatus belegt. Das ist unsere konkrete Anwendung der Spezifikation.

Beispiel einer exportierten Quelle:

```yaml
---
type: Reference
title: Beispielartikel
resource: https://example.com/article
tags:
  - context-engineering
sources:
  - id: original
    resource: https://example.com/article
    title: Beispielartikel
generated:
  by: context-builder/0.1
  at: "2026-09-24T12:00:00Z"
cb_schema: 1
cb_id: "f6ff2bd8-4b56-4cf3-9f1d-317f8045cc89"
cb_kind: web
cb_imported_at: "2026-09-24T11:59:00Z"
cb_extracted_at: "2026-09-24T12:00:00Z"
cb_capture_method: active_tab
cb_coverage: complete_for_input
cb_edited_by_user: false
---
```

Danach folgt der eigentliche Inhalt. Lokale Arbeitsdateien ergänzen `cb_notebook_id`, `cb_revision_id`, `cb_enabled`, Hashes und Extraktorversion; portable Kontext-Exporte lassen geräteinterne Details weg. Bekannte Autoren stehen in `cb_author`, Veröffentlichungsdaten in `cb_published_date`. Nicht vorhandene Werte werden ausgelassen. Originaldateien erhalten Dateiname/Hash und einen nachvollziehbaren Ursprungsbezeichner; kein absoluter privater Dateipfad wird automatisch exportiert.

Flache `cb_`-Properties sind für bequemes Bearbeiten in Obsidian vorgesehen. Verschachtelte Provenienz bleibt im YAML erhalten; nicht jede Struktur ist im Properties-Editor gleich komfortabel bearbeitbar. Vor Zusage wird ein echter Obsidian-Import geprüft. [Obsidian Properties](https://obsidian.md/help/properties).

Root-Index des Exportbundles:

```markdown
---
okf_version: "0.2"
---

# PROFIBUS

- [Beispielartikel](sources/f6ff2bd8-4b56-4cf3-9f1d-317f8045cc89.md)
```

Titel sind Nutzdaten und werden mit einem YAML-Serializer geschrieben, nicht per Stringverkettung. Unbekannte Metadaten bleiben beim Rückimport erhalten. Für unverständliche zukünftige `cb_schema`-Versionen gilt: lesbarer Import/Export soweit möglich, keine destruktive Migration.

## Exportvertrag

| Modus | Inhalt | Abgrenzung |
| --- | --- | --- |
| Markdown-Gesamtdatei | Manifest, Quellenverzeichnis, klar abgegrenzte Quellabschnitte | Praktischer Kontext-Export, kein vollständiges Notebook-Backup |
| Plain Text | Optional dasselbe YAML-Manifest, lesbare Quellenköpfe, Textinhalt | Markdown-Struktur kontrolliert zu Text umsetzen |
| Markdown-Dateien/ZIP | Root-index.md und sources/*.md, optionale mitgewählte Assets | OKF-Profil mit auflösbaren relativen Links |
| Zwischenablage | Wahlweise Gesamt-Markdown oder Text | Große Inhalte mit Größenhinweis und Dateioption |
| Backup-ZIP | Library, Notebooks, alle Revisionen, Originale und noch erforderliche Eingänge samt Wiederaufnahmeinformationen | Keine Schlüssel, Auth-Tokens oder absolute Gerätepfade |

Gesamtdatei: YAML nur am Dateianfang. Das Manifest enthält `type: context_bundle`, `cb_schema`, Notebooktitel, Exportzeit, Anzahl, `sources` als Liste mit ID, Titel, Typ und Originalbezug. Die Textinhalte stehen außerhalb des YAML. Jeder Quellabschnitt beginnt mit einer stabilen ID, sichtbarem Titel, Originalbezug und Verarbeitungsdaten. HTML-Kommentare wie `<!-- cb:source-start ID -->` ergänzen die Abgrenzung im MD-Export; die Nutzbarkeit hängt nicht von ihnen ab. Eingebettetes Quell-YAML wird als Inhalt behandelt, nicht als zweites globales Manifest.

Vor dem Export werden gewählte Quell-IDs und ihre Revisionen eingefroren. Ein parallel fertig werdender Import wird erst beim nächsten Export berücksichtigt. Während der Ausgabe dürfen keine Inhalte aus verschiedenen Revisionen gemischt werden. Prüfsummen und Dateizahl werden am Ende validiert. Stable Sort: Importzeit, dann ID. Keine Nutzerreihenfolge nötig.

Deaktivierte Quellen sind standardmäßig ausgeschlossen. Fehlende Inhalte oder ungelöste Konflikte stoppen die Standardaktion und verlangen „Nur verfügbare Quellen exportieren“ oder Konfliktlösung. Quellen mit Warnungen sind wählbar, ihre Warnungen bleiben sichtbar. Exportdialog zeigt: enthalten, deaktiviert, nicht bereit, konfliktig. Leere Auswahl führt zu keiner leeren Erfolgsmeldung.

Plain-Text-Konvertierung entfernt Formatzeichen über einen Markdown-Parser, nicht über beliebige reguläre Ausdrücke. Links werden als Bezeichnung plus URL ausgegeben, Tabellen als Zeilen/Zellen mit eindeutigem Trenner, Code bleibt wörtlich. Eine vorhandene Markdown-Datei nur in `.txt` umzubenennen erfüllt diesen Modus nicht.

## Umfangszählung

Zählen des Body-Inhalts; Metadaten werden separat berücksichtigt, wenn der konkrete Export geschätzt wird. Zeichen = Unicode-Codepoints; Wörter = sprachsensitives Segmentieren mit versionierter Fallback-Regel. Eine erste Tokenanzeige nutzt `ceil(Codepoints / 4)` und heißt ausdrücklich „grobe Schätzung“. Sie ist kein Modelltokenizer, insbesondere bei Code und anderen Schriftsystemen. Die Methode wird im Datensatz gespeichert. Spätere echte Tokenizer sind austauschbar. Gesamtwerte berücksichtigen die aktuelle Auswahl; Summen einzelner Schätzungen sind nicht automatisch die Länge des fertig gerenderten Exports.

## Duplikate und Aktualisierung

1. YouTube-Video-ID über URL-Varianten hinweg erkennen; Sprache/Transkriptvariante separat behandeln.
2. URL konservativ normalisieren: Host/Schema-Kleinschreibung, Standardport entfernen; bekannte Trackingparameter gezielt entfernen. Pfadgroßschreibung, unbekannte Parameter, signierte Querystrings und hashbasierte App-Routen nicht pauschal verändern.
3. Canonical-URL als Signal speichern, nicht blind als Beweis verwenden. Cross-Domain-Canonicals benötigen zusätzliche Übereinstimmung.
4. Datei-SHA-256 und danach normalisierten Body-Hash vergleichen. Unterschiedliche URLs mit gleichem Body bleiben zunächst Duplikatkandidaten.

Standardumfang ist das Zielnotebook. Aktionen: „Vorhandene öffnen“, „Neue Version abrufen“ oder „Trotzdem separat importieren“. Ein automatischer Import ersetzt keine Quelle. Ein Queue-Eintrag erhält vor Verarbeitung eine Source-ID, damit eine Wiederaufnahme dieselbe Quelle aktualisiert. Kopieren in andere Notebooks ist erlaubt und kein blockierendes Duplikat.

Reprocessing speichert eine neue Extraktionsrevision. Bei manuell verändertem Text erscheint Vergleich/Übernahme; die vorherige Fassung bleibt wiederherstellbar. Ein HTTP-Fehler oder leeres Ergebnis ersetzt keinen guten Body. Ein erneuter erfolgreicher identischer Abruf aktualisiert Abrufdaten, erzeugt aber keine vermeintliche inhaltliche Änderung.

## Sichere Speicherung und Wiederherstellung

Eine lokale Schreiboperation nimmt `expected_revision_id` entgegen. Pro Gerät gibt es genau einen Writer; mehrere Tabs koordinieren sich. Vor Bestätigung wird eine neue unveränderliche Revisionsdatei geschrieben, geschlossen, zurückgelesen und auf Prüfsumme geprüft. Erst danach wird der aktuelle Snapshot ersetzt und der Index aktualisiert. „Gespeichert“ setzt eine bestätigte Revision voraus. Ein Abbruch zwischen Revision und Snapshot ist durch Neuaufbau reparierbar.

Eine Revision enthält `payload` als vollständigen, schema-validierten Entity-Zustand, bei Quellen einschließlich Body. SHA-256 bezieht sich auf eine deterministische UTF-8-Serialisierung dieses Payloads mit sortierten Objektschlüsseln; Listenreihenfolge bleibt erhalten. Hashfeld und Revision-Umschlag sind nicht Teil des Hashinputs. Implementierung nutzt dafür eine festgelegte kanonische JSON-Serialisierung und gemeinsame Testvektoren.

Beschädigte oder unvollständige Dateien werden nicht übernommen. Existierende Inhalte bleiben erhalten; Quarantäne/Diagnose enthält keinen API-Schlüssel. Speicher voll, entzogene Schreibrechte und verlorene URI-Rechte sind eigenständige Fehler. Löschung erzeugt eine nachvollziehbare Löschrevision und verschiebt Inhalte in den Papierkorb. Endgültiges Bereinigen erst über eine eigene Nutzeraktion.

Externe Änderungen durch Texteditor/Obsidian werden beim Wiederöffnen erkannt und als neue Revision importiert, solange YAML/Identität gültig bleiben. Gleichzeitiges Schreiben durch App und fremde Editoren wird zum Start nicht unterstützt. Die App prüft vor dem Ersetzen den zuletzt gesehenen Snapshot-Hash; bei Abweichung hält sie an und sichert die fremde Fassung. Fehlendes YAML wird nicht still repariert oder überschrieben.

## Synchronisation: konkreter Vertrag für 1.0

Ein Cloudordner ist ein Transport, keine Transaktion. Deshalb bearbeiten Android und Desktop jeweils ihre lokale Arbeitskopie. Ein separater Austauschordner überträgt unveränderliche Revisionsdateien mit eindeutigen Namen; aktuelle Snapshots und Datenbankdateien werden nicht zwischen zwei Schreibern geteilt. Dieser Entwurf ist unsere technische Entscheidung, noch kein erprobtes Syncprodukt.

Der erste Syncadapter unterstützt einen tatsächlich zugänglichen Ordner auf beiden Geräten. Welcher bestehende Syncclient diesen transportiert, wird durch einen Gerätetest festgelegt. Google Drive ist ein gewünschter Kandidat, aber nicht automatisch auf Android als normaler beschreibbarer Ordner verfügbar. Falls der konkrete Drive-Pfad nicht trägt, erfordert Drive einen eigenen API-Adapter mit OAuth. Dieser Ersatz wird als separates Ticket behandelt. Die Drive-API stellt Dateiverwaltungsfunktionen bereit; die passende Berechtigungs- und Konfliktstrategie muss die App selbst implementieren. [Drive API](https://developers.google.com/workspace/drive/api/guides/about-sdk).

Abgleich in 1.0 beim Öffnen, manuell und periodisch solange die App offen ist:

1. Lokale bestätigte Revisionen unter einmaligem Namen in den Transport schreiben. Bestehende Revisionsdateien nie verändern.
2. Fremde Revisionen laden und Schema/Checksumme prüfen. Eltern können später eintreffen; bis dahin Revision zurückstellen.
3. Ist ein Zustand Nachfolger des lokalen Zustands, übernehmen. Unabhängige Quellen können getrennt übernommen werden.
4. Haben zwei Revisionen denselben Vorfahren, aber keinen gemeinsamen aktuellen Nachfolger, beide als Konflikt behalten. Keine Auswahl per jüngstem Zeitstempel.
5. Nutzer kann eine Fassung übernehmen oder beide zu einer neuen Revision zusammenführen; ihre `parent_ids` nennen alle gelösten Köpfe.
6. Löschung gegen Bearbeitung erzeugt ebenfalls einen Konflikt. Ein Tombstone wird nicht schon wegen einer älteren Geräteuhr überstimmt.

Notebooks werden als eigene Entitäten abgeglichen; der Notebookdatensatz enthält keine gemeinsam zu überschreibende Quellliste. Quellen tragen die Notebook-ID. Bei gelöschtem Notebook und neuer Quelle darin wird eine Wiederherstellungsaktion angeboten; kein stilles Verwerfen.

V1.0 führt keine automatische Historien-/Tombstone-Löschung durch, damit lange offline gebliebene Geräte keine Daten wiederbeleben. Speicherkosten werden sichtbar; ein sicheres Kompaktierungsverfahren ist später möglich. Ein fehlender Austauschordner blockiert den Sync, nicht die lokale Nutzung.

Export nach Google Drive und bidirektionaler Sync sind unterschiedliche Funktionen. Bis der echte Mehrgerätetest bestanden ist, heißt der verfügbare Weg „Export/Import“, nicht „Synchronisiert“.
