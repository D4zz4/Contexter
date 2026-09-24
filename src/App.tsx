import { useEffect, useRef, useState } from 'react';
import { bundleMarkdown, bundleText, bundleZip, download, safeFilename } from './export';
import { extractActiveTab, extractFile, extractUrl } from './extract';
import { createNotebook, createSource, emptyLibrary, findDuplicate, INBOX_ID, metrics, type Library, type Source } from './model';
import { loadLibrary, saveLibrary } from './storage';
import './styles.css';

type Dialog = 'add' | 'export' | 'notebook' | null;
type AddTab = 'url' | 'text' | 'file';

const localeDate = (value?: string) => value ? new Date(value).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function App() {
  const [library, setLibrary] = useState<Library>(emptyLibrary);
  const libraryRef = useRef(library);
  const saveQueue = useRef(Promise.resolve());
  const [loaded, setLoaded] = useState(false);
  const [selectedNotebook, setSelectedNotebook] = useState(INBOX_ID);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [addTab, setAddTab] = useState<AddTab>('url');
  const [notebookName, setNotebookName] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [textTitle, setTextTitle] = useState('');
  const [textInput, setTextInput] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadLibrary().then(value => {
      libraryRef.current = value;
      setLibrary(value);
      setLoaded(true);
    }).catch(error => { setNotice(String(error)); setLoaded(true); });
  }, []);

  function commit(change: (value: Library) => Library) {
    const next = change(libraryRef.current);
    libraryRef.current = next;
    setLibrary(next);
    saveQueue.current = saveQueue.current.then(() => saveLibrary(next));
    saveQueue.current.catch(error => setNotice(`Speichern fehlgeschlagen: ${String(error)}`));
    return saveQueue.current;
  }

  function addSource(source: Source): boolean {
    const duplicate = findDuplicate(libraryRef.current, source);
    if (duplicate) {
      setNotice(`Bereits vorhanden: „${duplicate.title}“. Öffne die vorhandene Quelle oder füge eine andere hinzu.`);
      setSelectedSource(duplicate.id);
      return false;
    }
    void commit(value => ({ ...value, sources: [...value.sources, source] }));
    setSelectedSource(source.id);
    setNotice('Quelle hinzugefügt.');
    return true;
  }

  const notebook = library.notebooks.find(item => item.id === selectedNotebook) || library.notebooks[0];
  const allSources = library.sources.filter(item => item.notebookId === notebook?.id);
  const visibleSources = allSources.filter(item => `${item.title} ${item.originalUrl || ''}`.toLowerCase().includes(query.toLowerCase()));
  const activeSources = allSources.filter(item => item.enabled && (item.status === 'ready' || item.status === 'partial'));
  const tokenCount = activeSources.reduce((sum, item) => sum + metrics(item.body).tokens, 0);
  const source = library.sources.find(item => item.id === selectedSource && item.notebookId === notebook?.id);

  async function handleUrls() {
    const urls = urlInput.split(/\s+/).map(item => item.trim()).filter(Boolean);
    if (!urls.length) return;
    setBusy(true);
    let success = 0;
    const errors: string[] = [];
    for (const url of urls) {
      try {
        const extracted = await extractUrl(url);
        const added = addSource(createSource({ notebookId: notebook.id, kind: extracted.kind, title: extracted.title, body: extracted.body, originalUrl: url, author: extracted.author, warnings: extracted.warnings, status: extracted.warnings.length ? 'partial' : 'ready' }));
        if (added) success++;
      } catch (error) {
        errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    setBusy(false);
    setUrlInput('');
    setNotice(`${success} Quelle(n) hinzugefügt.${errors.length ? ` ${errors.join(' | ')}` : ''}`);
    if (success) setDialog(null);
  }

  async function handleCurrentTab() {
    setBusy(true);
    try {
      const extracted = await extractActiveTab();
      addSource(createSource({ notebookId: notebook.id, kind: 'web', title: extracted.title, body: extracted.body, originalUrl: extracted.url, author: extracted.author, warnings: extracted.warnings, status: extracted.warnings.length ? 'partial' : 'ready' }));
      setDialog(null);
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const errors: string[] = [];
    let count = 0;
    for (const file of Array.from(files)) {
      try {
        const extracted = await extractFile(file);
        if (addSource(createSource({ notebookId: notebook.id, kind: extracted.kind, title: extracted.title, body: extracted.body, originalFilename: file.name, warnings: extracted.warnings }))) count++;
      } catch (error) { errors.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    setBusy(false);
    setNotice(`${count} Datei(en) hinzugefügt.${errors.length ? ` ${errors.join(' | ')}` : ''}`);
    if (count) setDialog(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  function handleText() {
    if (!textInput.trim()) { setNotice('Bitte Text einfügen.'); return; }
    const added = addSource(createSource({ notebookId: notebook.id, kind: 'text', title: textTitle || 'Eingefügter Text', body: textInput }));
    if (added) { setTextInput(''); setTextTitle(''); setDialog(null); }
  }

  async function exportAs(format: 'md' | 'txt' | 'zip' | 'copy') {
    if (!activeSources.length) { setNotice('Keine aktiven, fertigen Quellen zum Exportieren.'); return; }
    const ordered = [...activeSources].sort((a, b) => a.importedAt.localeCompare(b.importedAt) || a.id.localeCompare(b.id));
    const name = safeFilename(notebook.title);
    try {
      if (format === 'md') download(new Blob([bundleMarkdown(notebook, ordered)], { type: 'text/markdown;charset=utf-8' }), `${name}.md`);
      if (format === 'txt') download(new Blob([bundleText(notebook, ordered)], { type: 'text/plain;charset=utf-8' }), `${name}.txt`);
      if (format === 'zip') download(await bundleZip(notebook, ordered), `${name}.zip`);
      if (format === 'copy') await navigator.clipboard.writeText(bundleMarkdown(notebook, ordered));
      setNotice(`${ordered.length} Quelle(n) ${format === 'copy' ? 'kopiert' : 'exportiert'}.`);
      setDialog(null);
    } catch (error) { setNotice(`Export fehlgeschlagen: ${String(error)}`); }
  }

  function startEdit(item: Source) { setEditing(true); setDraft(item.body); }
  function saveEdit(item: Source) {
    void commit(value => ({ ...value, sources: value.sources.map(current => current.id === item.id ? { ...current, body: draft, editedByUser: true, status: 'ready' } : current) }));
    setEditing(false);
    setNotice('Änderungen gespeichert.');
  }

  return <div className="shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => { setSelectedNotebook(INBOX_ID); setSelectedSource(null); }} aria-label="Contexter Startseite">
        <span className="brand-mark">C<span>.</span></span><span>Contexter<small>DEIN KONTEXT. DEINE WAHL.</small></span>
      </button>
      <div className="side-label">ARBEITSBEREICH</div>
      <button className={`nav-item ${selectedNotebook === INBOX_ID ? 'current' : ''}`} onClick={() => { setSelectedNotebook(INBOX_ID); setSelectedSource(null); }}><span className="nav-symbol">⌑</span> Inbox <span className="nav-count">{library.sources.filter(item => item.notebookId === INBOX_ID).length}</span></button>
      <div className="side-label side-label-row"><span>NOTEBOOKS</span><button className="icon-button" onClick={() => setDialog('notebook')} aria-label="Notebook erstellen">+</button></div>
      <nav className="notebook-nav">
        {library.notebooks.filter(item => item.id !== INBOX_ID && !item.archived).map(item => <button key={item.id} className={`nav-item ${selectedNotebook === item.id ? 'current' : ''}`} onClick={() => { setSelectedNotebook(item.id); setSelectedSource(null); }}><span className="nav-symbol">▤</span><span className="truncate">{item.title}</span><span className="nav-count">{library.sources.filter(source => source.notebookId === item.id).length}</span></button>)}
      </nav>
      <button className="side-new" onClick={() => setDialog('notebook')}>+ Neues Notebook</button>
      <div className="sidebar-bottom"><div className="privacy-dot" /> Lokal gespeichert <span className="beta-tag">ALPHA</span></div>
    </aside>

    <main className="main">
      <header className="topbar"><div className="breadcrumbs">LIBRARY <span>/</span> <strong>{notebook?.title}</strong></div><div className="top-actions"><span className="local-badge">● &nbsp;Auf diesem Gerät</span><button className="button subtle" onClick={() => setDialog('export')}>↗ &nbsp; Exportieren</button></div></header>
      <div className="workspace">
        <div className="page-heading"><div><div className="eyebrow">DEINE SAMMLUNG</div><h1>{notebook?.title}</h1><p>Quellen sammeln, prüfen und als portablen Kontext mitnehmen.</p></div><button className="button primary" onClick={() => setDialog('add')}>＋ &nbsp; Quelle hinzufügen</button></div>
        <div className="stat-grid"><div className="stat"><span>QUELLEN</span><strong>{allSources.length}</strong><small>{activeSources.length} aktiv für den Export</small></div><div className="stat"><span>GESCHÄTZTE TOKENS</span><strong>{new Intl.NumberFormat('de-DE').format(tokenCount)}</strong><small>Grobe Schätzung · ≈ 4 Zeichen/Token</small></div><div className="stat accent"><span>DEIN KONTEXT</span><strong>Bereit zum Export</strong><small>Markdown · Text · ZIP · Zwischenablage</small></div></div>
        <div className="content-card"><div className="list-head"><div><h2>Quellen <span className="heading-count">{allSources.length}</span></h2><p>Jede Quelle bleibt mit ihrem Ursprung verbunden.</p></div><div className="list-actions"><input className="search" type="search" placeholder="Quellen suchen …" value={query} onChange={event => setQuery(event.target.value)} aria-label="Quellen suchen" /><button className="button subtle" onClick={() => setDialog('add')}>+ Hinzufügen</button></div></div>
          {!loaded ? <div className="empty">Bibliothek wird geladen …</div> : visibleSources.length === 0 ? <div className="empty"><div className="empty-symbol">▣</div><h3>{query ? 'Keine passende Quelle' : 'Hier beginnt dein Kontext'}</h3><p>{query ? 'Versuche einen anderen Suchbegriff.' : 'Füge eine Webseite, eine Datei oder eigenen Text hinzu.'}</p>{!query && <button className="button primary" onClick={() => setDialog('add')}>Erste Quelle hinzufügen</button>}</div> : <div className="source-list">{visibleSources.map(item => <div key={item.id} className={`source-row ${selectedSource === item.id ? 'selected' : ''}`}><label className="checkbox-wrap" title="Für Export aktiv"><input type="checkbox" checked={item.enabled} onChange={() => void commit(value => ({ ...value, sources: value.sources.map(current => current.id === item.id ? { ...current, enabled: !current.enabled } : current) }))} aria-label={`${item.title} für Export aktiv`} /></label><button className="source-open" onClick={() => { setSelectedSource(item.id); setEditing(false); }}><span className={`type-icon type-${item.kind}`}>{item.kind === 'web' ? '◈' : item.kind === 'youtube' ? '▶' : '▤'}</span><span className="source-meta"><strong>{item.title}</strong><small>{item.originalUrl ? new URL(item.originalUrl).hostname : item.originalFilename || 'Eingefügter Text'} · {localeDate(item.importedAt)}</small></span></button><span className={`status ${item.status}`}>{item.status === 'partial' ? 'Hinweis' : item.status === 'failed' ? 'Fehler' : item.status === 'queued' ? 'Wartet' : 'Bereit'}</span><span className="row-tokens">~{new Intl.NumberFormat('de-DE').format(metrics(item.body).tokens)} Token</span></div>)}</div>}
        </div>
      </div>
    </main>

    {source && <div className="detail-backdrop" onClick={() => setSelectedSource(null)}><section className="detail-panel" onClick={event => event.stopPropagation()} aria-label="Quelle ansehen"><div className="detail-top"><span>QUELLENDETAIL</span><button className="icon-button" onClick={() => setSelectedSource(null)} aria-label="Schließen">×</button></div><div className="detail-scroll"><div className="detail-kicker">{source.kind.toUpperCase()} · {localeDate(source.importedAt)}</div><h2>{source.title}</h2>{source.originalUrl && <a className="original-link" href={source.originalUrl} target="_blank" rel="noreferrer">Original öffnen ↗</a>}{source.warnings.map((warning, index) => <div className="warning" key={index}>⚠ {warning}</div>)}<div className="detail-metrics">{metrics(source.body).words} Wörter <span>·</span> ~{metrics(source.body).tokens} Token <span>·</span> {source.editedByUser ? 'Manuell bearbeitet' : 'Extrahiert'}</div>{editing ? <textarea className="editor" value={draft} onChange={event => setDraft(event.target.value)} aria-label="Quelleninhalt bearbeiten" /> : <pre className="body-preview">{source.body}</pre>}</div><div className="detail-actions">{editing ? <><button className="button subtle" onClick={() => setEditing(false)}>Abbrechen</button><button className="button primary" onClick={() => saveEdit(source)}>Speichern</button></> : <><button className="button subtle" onClick={() => startEdit(source)}>Bearbeiten</button><button className="button primary" onClick={() => navigator.clipboard.writeText(source.body).then(() => setNotice('Inhalt kopiert.')).catch(() => setNotice('Kopieren fehlgeschlagen.'))}>Inhalt kopieren</button></>}</div></section></div>}

    {dialog && <div className="modal-backdrop" onClick={() => !busy && setDialog(null)}><section className="modal" onClick={event => event.stopPropagation()} aria-label="Dialog"><div className="modal-head"><div><div className="eyebrow">{notebook?.title}</div><h2>{dialog === 'add' ? 'Quelle hinzufügen' : dialog === 'export' ? 'Kontext exportieren' : 'Notebook erstellen'}</h2></div><button className="icon-button" onClick={() => setDialog(null)} aria-label="Schließen">×</button></div>
      {dialog === 'notebook' && <div className="modal-body"><label>NAME DES NOTEBOOKS<input autoFocus value={notebookName} placeholder="z. B. Context Engineering" onChange={event => setNotebookName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && notebookName.trim()) { const item = createNotebook(notebookName); void commit(value => ({ ...value, notebooks: [...value.notebooks, item] })); setSelectedNotebook(item.id); setNotebookName(''); setDialog(null); } }} /></label><button className="button primary wide" disabled={!notebookName.trim()} onClick={() => { const item = createNotebook(notebookName); void commit(value => ({ ...value, notebooks: [...value.notebooks, item] })); setSelectedNotebook(item.id); setNotebookName(''); setDialog(null); }}>Notebook erstellen</button></div>}
      {dialog === 'add' && <div className="modal-body"><div className="tabs"><button className={addTab === 'url' ? 'active' : ''} onClick={() => setAddTab('url')}>Website / URL</button><button className={addTab === 'file' ? 'active' : ''} onClick={() => setAddTab('file')}>Datei</button><button className={addTab === 'text' ? 'active' : ''} onClick={() => setAddTab('text')}>Text einfügen</button></div>{addTab === 'url' && <><p className="helper">Eine oder mehrere URLs eingeben. Jede URL wird als eigene Quelle gespeichert.</p><textarea rows={5} placeholder={'https://example.com/artikel\nhttps://example.org/guide'} value={urlInput} onChange={event => setUrlInput(event.target.value)} /><div className="modal-actions">{Boolean(globalThis.chrome?.tabs?.query) && <button className="button subtle" onClick={handleCurrentTab} disabled={busy}>Aktuellen Tab übernehmen</button>}<button className="button primary" onClick={handleUrls} disabled={busy || !urlInput.trim()}>{busy ? 'Lese Quellen …' : 'URLs hinzufügen'}</button></div></>}{addTab === 'file' && <><p className="helper">TXT, Markdown, HTML, PDF, DOCX, EPUB und CSV werden lokal verarbeitet.</p><input ref={fileInput} type="file" accept=".txt,.md,.markdown,.html,.htm,.pdf,.docx,.epub,.csv" multiple onChange={event => void handleFiles(event.target.files)} /><button className="button primary wide" disabled={busy} onClick={() => fileInput.current?.click()}>{busy ? 'Verarbeite Dateien …' : 'Dateien auswählen'}</button></>}{addTab === 'text' && <><label>TITEL<input placeholder="Titel deiner Quelle" value={textTitle} onChange={event => setTextTitle(event.target.value)} /></label><label>INHALT<textarea rows={7} placeholder="Text hier einfügen …" value={textInput} onChange={event => setTextInput(event.target.value)} /></label><button className="button primary wide" onClick={handleText}>Text hinzufügen</button></>}</div>}
      {dialog === 'export' && <div className="modal-body"><p className="helper">{activeSources.length} aktive Quellen · ungefähr {new Intl.NumberFormat('de-DE').format(tokenCount)} Tokens. Deaktivierte Quellen bleiben außerhalb des Exports.</p><div className="export-options"><button onClick={() => void exportAs('md')}><span>▤</span><strong>Eine Markdown-Datei</strong><small>Alle Quellen mit Herkunft und YAML-Manifest</small></button><button onClick={() => void exportAs('txt')}><span>≡</span><strong>Eine Textdatei</strong><small>Lesbarer Text mit Quellenangaben</small></button><button onClick={() => void exportAs('zip')}><span>▣</span><strong>ZIP mit Einzeldateien</strong><small>OKF-kompatibles Markdown-Bundle</small></button><button onClick={() => void exportAs('copy')}><span>⧉</span><strong>In Zwischenablage kopieren</strong><small>Markdown direkt weiterverwenden</small></button></div></div>}
    </section></div>}
    {notice && <div className="toast" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Meldung schließen">×</button></div>}
  </div>;
}
