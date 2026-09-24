import { useEffect, useRef, useState } from 'react';
import { bundleMarkdown, bundleText, bundleZip, deliverFile, safeFilename } from './export';
import { extractActiveTab, extractFile, extractUrl } from './extract';
import { createNotebook, createSource, emptyLibrary, findDuplicate, INBOX_ID, metrics, type Library, type Source } from './model';
import { loadLibrary, saveLibrary } from './storage';
import { isNative, shareInbox, sharedFile, sharedText } from './share-inbox';
import { backupLibrary, mergeLibraries, readLibraryBackup } from './backup';
import { braveSearch, isYouTubeVideoUrl, youtubeCatalog, youtubeTranscript, type SearchResult } from './providers';
import './styles.css';

type Dialog = 'add' | 'export' | 'notebook' | 'trash' | 'manage' | 'shares' | null;
type AddTab = 'url' | 'text' | 'file' | 'youtube' | 'search';

const localeDate = (value?: string) => value ? new Date(value).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const originLabel = (value?: string) => { try { return value ? new URL(value).hostname : ''; } catch { return 'Ungültige URL'; } };
function loadCatalogDraft(): { url: string; type: 'video' | 'short' | 'live'; ids: string[]; selected: string[]; limit: number } {
  try {
    const value = JSON.parse(localStorage.getItem('contexter-catalog-draft') || '{}');
    return { url: typeof value.url === 'string' ? value.url : '', type: ['video', 'short', 'live'].includes(value.type) ? value.type : 'video', ids: Array.isArray(value.ids) ? value.ids.filter((id: unknown) => typeof id === 'string') : [], selected: Array.isArray(value.selected) ? value.selected.filter((id: unknown) => typeof id === 'string') : [], limit: Number.isInteger(value.limit) && value.limit >= 1 && value.limit <= 5000 ? value.limit : 20 };
  } catch { return { url: '', type: 'video', ids: [], selected: [], limit: 20 }; }
}

export default function App() {
  const [catalogDraft] = useState(loadCatalogDraft);
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
  const [sort, setSort] = useState<'newest' | 'oldest' | 'title'>('newest');
  const [supadataKey, setSupadataKey] = useState('');
  const [braveKey, setBraveKey] = useState('');
  const [discoveryQuery, setDiscoveryQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [shareErrors, setShareErrors] = useState<Array<{ id: string; title: string; message: string }>>([]);
  const [shareRetry, setShareRetry] = useState(0);
  const [catalogUrl, setCatalogUrl] = useState(catalogDraft.url);
  const [catalogType, setCatalogType] = useState<'video' | 'short' | 'live'>(catalogDraft.type);
  const [catalogLimit, setCatalogLimit] = useState(catalogDraft.limit);
  const [catalogIds, setCatalogIds] = useState<string[]>(catalogDraft.ids);
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<string[]>(catalogDraft.selected);
  const [visibleCatalogCount, setVisibleCatalogCount] = useState(100);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const restoreMode = useRef<'replace' | 'merge'>('merge');

  useEffect(() => {
    loadLibrary().then(value => {
      libraryRef.current = value;
      setLibrary(value);
      setLoaded(true);
    }).catch(error => { setNotice(String(error)); setLoaded(true); });
  }, []);

  useEffect(() => {
    try { localStorage.setItem('contexter-catalog-draft', JSON.stringify({ url: catalogUrl, type: catalogType, ids: catalogIds, selected: selectedCatalogIds, limit: catalogLimit })); }
    catch { /* A failed draft save must not block local source storage. */ }
  }, [catalogUrl, catalogType, catalogIds, selectedCatalogIds, catalogLimit]);

  function commit(change: (value: Library) => Library) {
    saveQueue.current = saveQueue.current.catch(() => undefined).then(async () => {
      const next = change(libraryRef.current);
      if (next === libraryRef.current) return;
      await saveLibrary(next);
      libraryRef.current = next;
      setLibrary(next);
    });
    saveQueue.current.catch(error => setNotice(`Speichern fehlgeschlagen: ${String(error)}`));
    return saveQueue.current;
  }

  async function addSource(source: Source): Promise<boolean> {
    let duplicate: Source | undefined;
    await commit(value => {
      duplicate = findDuplicate(value, source);
      return duplicate ? value : { ...value, sources: [...value.sources, source] };
    });
    if (duplicate) {
      setNotice(`Bereits vorhanden: „${duplicate.title}“. Öffne die vorhandene Quelle oder füge eine andere hinzu.`);
      setSelectedSource(duplicate.id);
      return false;
    }
    setSelectedSource(source.id);
    setNotice('Quelle hinzugefügt.');
    return true;
  }

  const notebook = library.notebooks.find(item => item.id === selectedNotebook) || library.notebooks[0];
  const allSources = library.sources.filter(item => !item.deletedAt && item.notebookId === notebook?.id);
  const visibleSources = allSources.filter(item => `${item.title} ${item.originalUrl || ''} ${item.body}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, 'de') : sort === 'oldest' ? a.importedAt.localeCompare(b.importedAt) : b.importedAt.localeCompare(a.importedAt));
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
        if (isYouTubeVideoUrl(url)) throw new Error('Für YouTube-Untertitel bitte den Tab „YouTube“ mit eigenem API-Schlüssel verwenden.');
        const extracted = await extractUrl(url);
        const added = await addSource(createSource({ notebookId: notebook.id, kind: extracted.kind, title: extracted.title, body: extracted.body, originalUrl: url, author: extracted.author, warnings: extracted.warnings, status: extracted.warnings.length ? 'partial' : 'ready' }));
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
      await addSource(createSource({ notebookId: notebook.id, kind: 'web', title: extracted.title, body: extracted.body, originalUrl: extracted.url, author: extracted.author, warnings: extracted.warnings, status: extracted.warnings.length ? 'partial' : 'ready' }));
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
        if (await addSource(createSource({ notebookId: notebook.id, kind: extracted.kind, title: extracted.title, body: extracted.body, originalFilename: file.name, warnings: extracted.warnings }))) count++;
      } catch (error) { errors.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    setBusy(false);
    setNotice(`${count} Datei(en) hinzugefügt.${errors.length ? ` ${errors.join(' | ')}` : ''}`);
    if (count) setDialog(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function handleText() {
    if (!textInput.trim()) { setNotice('Bitte Text einfügen.'); return; }
    const added = await addSource(createSource({ notebookId: notebook.id, kind: 'text', title: textTitle || 'Eingefügter Text', body: textInput }));
    if (added) { setTextInput(''); setTextTitle(''); setDialog(null); }
  }

  async function handleYouTube() {
    if (!urlInput.trim()) return;
    setBusy(true);
    try {
      const result = await youtubeTranscript(urlInput.trim(), supadataKey);
      await addSource(createSource({ notebookId: notebook.id, kind: 'youtube', title: result.title, body: result.body, originalUrl: urlInput.trim(), author: result.author, language: result.language, provider: result.provider, warnings: result.warnings, status: result.warnings.length ? 'partial' : 'ready' }));
      setUrlInput('');
      setDialog(null);
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function loadCatalog() {
    setBusy(true);
    try {
      const ids = await youtubeCatalog(catalogUrl, supadataKey, catalogLimit, catalogType);
      setCatalogIds(ids);
      setSelectedCatalogIds([]);
      setVisibleCatalogCount(100);
      if (!ids.length) setNotice('Keine passenden Videos gefunden.');
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function importCatalogSelection() {
    if (!selectedCatalogIds.length) return;
    if (!window.confirm(`${selectedCatalogIds.length} Videos über Supadata abrufen? Jeder Abruf kann Kosten verursachen.`)) return;
    setBusy(true);
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (const id of selectedCatalogIds) {
      const url = `https://www.youtube.com/watch?v=${id}`;
      if (findDuplicate(libraryRef.current, createSource({ notebookId: notebook.id, kind: 'youtube', title: id, body: '', originalUrl: url }))) { skipped++; setSelectedCatalogIds(current => current.filter(item => item !== id)); continue; }
      try {
        const result = await youtubeTranscript(url, supadataKey);
        if (await addSource(createSource({ notebookId: notebook.id, kind: 'youtube', title: result.title, body: result.body, originalUrl: url, author: result.author, language: result.language, provider: result.provider, warnings: result.warnings, status: result.warnings.length ? 'partial' : 'ready' }))) imported++;
        setSelectedCatalogIds(current => current.filter(item => item !== id));
      } catch (error) { errors.push(`${id}: ${String(error)}`); }
    }
    setBusy(false);
    setNotice(`${imported} Video(s) hinzugefügt, ${skipped} bereits vorhanden.${errors.length ? ` Fehler: ${errors.join(' | ')}` : ''}`);
    if (imported) setDialog(null);
  }

  async function handleSearch() {
    setBusy(true);
    try { setSearchResults(await braveSearch(discoveryQuery, braveKey)); }
    catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function importSearchResult(result: SearchResult) {
    setBusy(true);
    try {
      const extracted = await extractUrl(result.url);
      await addSource(createSource({ notebookId: notebook.id, kind: extracted.kind, title: extracted.title || result.title, body: extracted.body, originalUrl: result.url, author: extracted.author, warnings: extracted.warnings, status: extracted.warnings.length ? 'partial' : 'ready' }));
    } catch (error) { setNotice(`${result.url}: ${String(error)}`); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!isNative || !loaded) return;
    const inbox = shareInbox();
    let stopped = false;
    let draining = false;
    let listener: { remove(): Promise<void> } | undefined;

    async function drain() {
      if (draining || stopped) return;
      draining = true;
      try {
        const pending = await inbox.getPending();
        if (pending.error) {
          setNotice(`Teilen fehlgeschlagen: ${pending.error}`);
          await inbox.clearError();
        }
        for (const summary of pending.items) {
          if (stopped) break;
          try {
            const item = await inbox.readItem({ id: summary.id });
            if (item.kind === 'file') {
              const file = await sharedFile(item);
              const extracted = await extractFile(file);
              await addSource(createSource({ notebookId: INBOX_ID, kind: extracted.kind, title: extracted.title, body: extracted.body, originalFilename: file.name, warnings: extracted.warnings, status: extracted.warnings.length ? 'partial' : 'ready' }));
            } else {
              const value = (await sharedText(item)).trim();
              if (!value) throw new Error('Geteilter Text ist leer.');
              if (/^https?:\/\/\S+$/i.test(value)) {
                if (isYouTubeVideoUrl(value)) {
                  await addSource(createSource({ notebookId: INBOX_ID, kind: 'youtube', title: `YouTube-Video ${new URL(value).searchParams.get('v') || new URL(value).pathname.split('/').filter(Boolean).at(-1)}`, body: value, originalUrl: value, warnings: ['Video-Link gespeichert. Für Untertitel im Quellen-Detail „Erneut lesen“ mit Supadata-Schlüssel verwenden.'], status: 'partial' }));
                } else {
                  try {
                    const extracted = await extractUrl(value);
                    await addSource(createSource({ notebookId: INBOX_ID, kind: extracted.kind, title: extracted.title, body: extracted.body, originalUrl: value, author: extracted.author, warnings: extracted.warnings, status: extracted.warnings.length ? 'partial' : 'ready' }));
                  } catch (error) {
                    await addSource(createSource({ notebookId: INBOX_ID, kind: 'web', title: new URL(value).hostname, body: value, originalUrl: value, warnings: [`Inhalt konnte noch nicht geladen werden: ${String(error)}`], status: 'partial' }));
                  }
                }
              } else {
                await addSource(createSource({ notebookId: INBOX_ID, kind: 'text', title: value.slice(0, 70), body: value }));
              }
            }
            await inbox.ackItem({ id: item.id });
            setShareErrors(current => current.filter(error => error.id !== item.id));
            setSelectedNotebook(INBOX_ID);
          } catch (error) {
            const failure = { id: summary.id, title: summary.filename || 'Geteilter Text', message: String(error) };
            setShareErrors(current => [...current.filter(item => item.id !== summary.id), failure]);
            setNotice(`Geteilte Quelle wartet auf Bearbeitung: ${failure.title}`);
          }
        }
      } catch (error) {
        setNotice(`Geteilte Quelle konnte nicht verarbeitet werden: ${String(error)}`);
      } finally { draining = false; }
    }

    void inbox.addListener('pending', () => void drain()).then(handle => {
      listener = handle;
      if (stopped) void listener.remove();
    });
    const onVisible = () => { if (document.visibilityState === 'visible') void drain(); };
    document.addEventListener('visibilitychange', onVisible);
    void drain();
    return () => { stopped = true; document.removeEventListener('visibilitychange', onVisible); if (listener) void listener.remove(); };
  }, [loaded, shareRetry]);

  async function exportAs(format: 'md' | 'txt' | 'zip' | 'copy') {
    if (!activeSources.length) { setNotice('Keine aktiven, fertigen Quellen zum Exportieren.'); return; }
    const ordered = [...activeSources].sort((a, b) => a.importedAt.localeCompare(b.importedAt) || a.id.localeCompare(b.id));
    const name = safeFilename(notebook.title);
    try {
      if (format === 'md') await deliverFile(new Blob([bundleMarkdown(notebook, ordered)], { type: 'text/markdown;charset=utf-8' }), `${name}.md`);
      if (format === 'txt') await deliverFile(new Blob([bundleText(notebook, ordered)], { type: 'text/plain;charset=utf-8' }), `${name}.txt`);
      if (format === 'zip') await deliverFile(await bundleZip(notebook, ordered), `${name}.zip`);
      if (format === 'copy') await navigator.clipboard.writeText(bundleMarkdown(notebook, ordered));
      setNotice(`${ordered.length} Quelle(n) ${format === 'copy' ? 'kopiert' : 'exportiert'}.`);
      setDialog(null);
    } catch (error) { setNotice(`Export fehlgeschlagen: ${String(error)}`); }
  }

  async function saveBackup() {
    try {
      await saveQueue.current;
      await deliverFile(await backupLibrary(libraryRef.current), `contexter-backup-${new Date().toISOString().slice(0, 10)}.zip`);
      setNotice('Vollständige Bibliothekssicherung ausgegeben.');
      setDialog(null);
    } catch (error) { setNotice(`Sicherung fehlgeschlagen: ${String(error)}`); }
  }

  async function restoreBackup(file: File | undefined) {
    if (!file) return;
    try {
      const restored = await readLibraryBackup(file);
      await saveQueue.current;
      if (restoreMode.current === 'replace') {
        if (!window.confirm(`Diese Sicherung enthält ${restored.notebooks.length} Notebooks und ${restored.sources.length} Quellen. Die aktuelle Bibliothek wird vollständig ersetzt. Fortfahren?`)) return;
        await commit(() => restored);
        setSelectedNotebook(INBOX_ID);
        setNotice('Bibliothek aus Sicherung ersetzt.');
      } else {
        const result = mergeLibraries(libraryRef.current, restored);
        if (!window.confirm(`${result.added} Quellen ergänzen, davon ${result.conflicts} abweichende Versionen als Konfliktkopie behalten?`)) return;
        await commit(() => result.library);
        setNotice(`Sicherung zusammengeführt: ${result.added} neue Quellen, ${result.conflicts} Konfliktkopien.`);
      }
      setSelectedSource(null);
      setDialog(null);
    } catch (error) { setNotice(`Wiederherstellung fehlgeschlagen: ${String(error)}`); }
    finally { if (backupInput.current) backupInput.current.value = ''; }
  }

  async function deleteSource(item: Source) {
    if (!window.confirm(`Quelle „${item.title}“ in den Papierkorb verschieben?`)) return;
    try {
      await commit(value => ({ ...value, sources: value.sources.map(current => current.id === item.id ? { ...current, deletedAt: new Date().toISOString() } : current) }));
      setSelectedSource(null);
      setNotice('Quelle im Papierkorb.');
    } catch (error) { setNotice(`Löschen fehlgeschlagen: ${String(error)}`); }
  }

  async function restoreSource(item: Source) {
    await commit(value => ({ ...value, sources: value.sources.map(current => current.id === item.id ? { ...current, deletedAt: undefined } : current) }));
    setDialog(null);
    setSelectedNotebook(item.notebookId);
    setSelectedSource(item.id);
    setNotice('Quelle wiederhergestellt.');
  }

  async function discardSharedItem(id: string) {
    if (!window.confirm('Diesen geteilten Eingang verwerfen? Er wurde noch nicht in der Bibliothek gespeichert.')) return;
    try {
      await shareInbox().ackItem({ id });
      setShareErrors(current => current.filter(item => item.id !== id));
    } catch (error) { setNotice(`Eingang konnte nicht verworfen werden: ${String(error)}`); }
  }

  async function renameNotebook() {
    if (!notebookName.trim() || notebook.id === INBOX_ID) return;
    await commit(value => ({ ...value, notebooks: value.notebooks.map(item => item.id === notebook.id ? { ...item, title: notebookName.trim() } : item) }));
    setDialog(null);
    setNotice('Notebook umbenannt.');
  }

  async function archiveNotebook() {
    if (notebook.id === INBOX_ID) return;
    if (!window.confirm(`Notebook „${notebook.title}“ archivieren? Die Quellen bleiben erhalten.`)) return;
    await commit(value => ({ ...value, notebooks: value.notebooks.map(item => item.id === notebook.id ? { ...item, archived: true } : item) }));
    setSelectedNotebook(INBOX_ID);
    setDialog(null);
    setNotice('Notebook archiviert.');
  }

  async function unarchiveNotebook(id: string) {
    await commit(value => ({ ...value, notebooks: value.notebooks.map(item => item.id === id ? { ...item, archived: false } : item) }));
    setSelectedNotebook(id);
    setDialog(null);
    setNotice('Notebook wiederhergestellt.');
  }

  async function reprocessSource(item: Source) {
    if (!item.originalUrl) return;
    setBusy(true);
    try {
      const extracted = item.kind === 'youtube' ? await youtubeTranscript(item.originalUrl, supadataKey) : await extractUrl(item.originalUrl);
      if (item.editedByUser) {
        const copy = createSource({ notebookId: item.notebookId, kind: extracted.kind, title: `${extracted.title} (Neu extrahiert)`, body: extracted.body, originalUrl: item.originalUrl, author: extracted.author, conflictOf: item.id, warnings: [...extracted.warnings, 'Manuell bearbeitete Fassung wurde nicht überschrieben.'], status: 'partial' });
        await commit(value => ({ ...value, sources: [...value.sources, copy] }));
        setSelectedSource(copy.id);
        setNotice('Neue Fassung erstellt; manuelle Bearbeitung blieb erhalten.');
      } else {
        await commit(value => ({ ...value, sources: value.sources.map(current => current.id === item.id ? { ...current, title: extracted.title, body: extracted.body, author: extracted.author, extractedAt: new Date().toISOString(), warnings: extracted.warnings, status: extracted.warnings.length ? 'partial' : 'ready' } : current) }));
        setNotice('Quelle erneut verarbeitet.');
      }
    } catch (error) { setNotice(`Erneut verarbeiten fehlgeschlagen: ${String(error)}`); }
    finally { setBusy(false); }
  }

  async function moveSource(item: Source, notebookId: string) {
    try {
      await commit(value => ({ ...value, sources: value.sources.map(current => current.id === item.id ? { ...current, notebookId } : current) }));
      setSelectedSource(null);
      setNotice('Quelle verschoben.');
    } catch (error) { setNotice(`Verschieben fehlgeschlagen: ${String(error)}`); }
  }

  function startEdit(item: Source) { setEditing(true); setDraft(item.body); }
  async function saveEdit(item: Source) {
    try {
      await commit(value => ({ ...value, sources: value.sources.map(current => current.id === item.id ? { ...current, body: draft, editedByUser: true, status: 'ready' } : current) }));
      setEditing(false);
      setNotice('Änderungen gespeichert.');
    } catch (error) { setNotice(`Änderungen konnten nicht gespeichert werden: ${String(error)}`); }
  }

  return <div className="shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => { setSelectedNotebook(INBOX_ID); setSelectedSource(null); }} aria-label="Contexter Startseite">
        <span className="brand-mark">C<span>.</span></span><span>Contexter<small>DEIN KONTEXT. DEINE WAHL.</small></span>
      </button>
      <div className="side-label">ARBEITSBEREICH</div>
      <button className={`nav-item ${selectedNotebook === INBOX_ID ? 'current' : ''}`} onClick={() => { setSelectedNotebook(INBOX_ID); setSelectedSource(null); }}><span className="nav-symbol">⌑</span> Inbox <span className="nav-count">{library.sources.filter(item => !item.deletedAt && item.notebookId === INBOX_ID).length}</span></button>
      <div className="side-label side-label-row"><span>NOTEBOOKS</span><button className="icon-button" onClick={() => setDialog('notebook')} aria-label="Notebook erstellen">+</button></div>
      <nav className="notebook-nav">
        {library.notebooks.filter(item => item.id !== INBOX_ID && !item.archived).map(item => <button key={item.id} className={`nav-item ${selectedNotebook === item.id ? 'current' : ''}`} onClick={() => { setSelectedNotebook(item.id); setSelectedSource(null); }}><span className="nav-symbol">▤</span><span className="truncate">{item.title}</span><span className="nav-count">{library.sources.filter(source => !source.deletedAt && source.notebookId === item.id).length}</span></button>)}
      </nav>
      <button className="side-new" onClick={() => setDialog('notebook')}>+ Neues Notebook</button>
      <button className="side-new" onClick={() => { setNotebookName(notebook.title); setDialog('manage'); }}>Notebooks verwalten</button>
      <button className="side-new" onClick={() => setDialog('trash')}>Papierkorb · {library.sources.filter(item => item.deletedAt).length}</button>
      {shareErrors.length > 0 && <button className="side-new" onClick={() => setDialog('shares')}>Geteilte Eingänge · {shareErrors.length} Fehler</button>}
      <div className="sidebar-bottom"><div className="privacy-dot" /> Lokal gespeichert <span className="beta-tag">TEST</span></div>
    </aside>

    <main className="main">
      <header className="topbar"><div className="breadcrumbs">LIBRARY <span>/</span> <strong>{notebook?.title}</strong></div><div className="top-actions"><span className="local-badge">● &nbsp;Auf diesem Gerät</span><button className="button subtle" onClick={() => setDialog('export')}>↗ &nbsp; Exportieren</button></div></header>
      <div className="workspace">
        <div className="page-heading"><div><div className="eyebrow">DEINE SAMMLUNG</div><h1>{notebook?.title}</h1><p>Quellen sammeln, prüfen und als portablen Kontext mitnehmen.</p></div><button className="button primary" onClick={() => setDialog('add')}>＋ &nbsp; Quelle hinzufügen</button></div>
        <div className="stat-grid"><div className="stat"><span>QUELLEN</span><strong>{allSources.length}</strong><small>{activeSources.length} aktiv für den Export</small></div><div className="stat"><span>GESCHÄTZTE TOKENS</span><strong>{new Intl.NumberFormat('de-DE').format(tokenCount)}</strong><small>Grobe Schätzung · ≈ 4 Zeichen/Token</small></div><div className="stat accent"><span>DEIN KONTEXT</span><strong>Bereit zum Export</strong><small>Markdown · Text · ZIP · Zwischenablage</small></div></div>
        <div className="content-card"><div className="list-head"><div><h2>Quellen <span className="heading-count">{allSources.length}</span></h2><p>Jede Quelle bleibt mit ihrem Ursprung verbunden.</p></div><div className="list-actions"><input className="search" type="search" placeholder="Quellen suchen …" value={query} onChange={event => setQuery(event.target.value)} aria-label="Quellen suchen" /><select className="sort-select" aria-label="Quellen sortieren" value={sort} onChange={event => setSort(event.target.value as typeof sort)}><option value="newest">Neueste</option><option value="oldest">Älteste</option><option value="title">Titel A–Z</option></select><button className="button subtle" onClick={() => setDialog('add')}>+ Hinzufügen</button></div></div>
          {!loaded ? <div className="empty">Bibliothek wird geladen …</div> : visibleSources.length === 0 ? <div className="empty"><div className="empty-symbol">▣</div><h3>{query ? 'Keine passende Quelle' : 'Hier beginnt dein Kontext'}</h3><p>{query ? 'Versuche einen anderen Suchbegriff.' : 'Füge eine Webseite, eine Datei oder eigenen Text hinzu.'}</p>{!query && <button className="button primary" onClick={() => setDialog('add')}>Erste Quelle hinzufügen</button>}</div> : <div className="source-list">{visibleSources.map(item => <div key={item.id} className={`source-row ${selectedSource === item.id ? 'selected' : ''}`}><label className="checkbox-wrap" title="Für Export aktiv"><input type="checkbox" checked={item.enabled} onChange={() => void commit(value => ({ ...value, sources: value.sources.map(current => current.id === item.id ? { ...current, enabled: !current.enabled } : current) }))} aria-label={`${item.title} für Export aktiv`} /></label><button className="source-open" onClick={() => { setSelectedSource(item.id); setEditing(false); }}><span className={`type-icon type-${item.kind}`}>{item.kind === 'web' ? '◈' : item.kind === 'youtube' ? '▶' : '▤'}</span><span className="source-meta"><strong>{item.title}</strong><small>{originLabel(item.originalUrl) || item.originalFilename || 'Eingefügter Text'} · {localeDate(item.importedAt)}</small></span></button><span className={`status ${item.status}`}>{item.status === 'partial' ? 'Hinweis' : item.status === 'failed' ? 'Fehler' : item.status === 'queued' ? 'Wartet' : 'Bereit'}</span><span className="row-tokens">~{new Intl.NumberFormat('de-DE').format(metrics(item.body).tokens)} Token</span></div>)}</div>}
        </div>
      </div>
    </main>

    {source && <div className="detail-backdrop" onClick={() => setSelectedSource(null)}><section className="detail-panel" onClick={event => event.stopPropagation()} aria-label="Quelle ansehen">
      <div className="detail-top"><span>QUELLENDETAIL</span><button className="icon-button" onClick={() => setSelectedSource(null)} aria-label="Schließen">×</button></div>
      <div className="detail-scroll"><div className="detail-kicker">{source.kind.toUpperCase()} · {localeDate(source.importedAt)}</div><h2>{source.title}</h2>{source.originalUrl && <a className="original-link" href={source.originalUrl} target="_blank" rel="noreferrer">Original öffnen ↗</a>}{source.warnings.map((warning, index) => <div className="warning" key={index}>⚠ {warning}</div>)}<div className="detail-metrics">{metrics(source.body).words} Wörter <span>·</span> ~{metrics(source.body).tokens} Token <span>·</span> {source.editedByUser ? 'Manuell bearbeitet' : 'Extrahiert'}</div>{editing ? <textarea className="editor" value={draft} onChange={event => setDraft(event.target.value)} aria-label="Quelleninhalt bearbeiten" /> : <pre className="body-preview">{source.body}</pre>}</div>
      <div className="detail-actions">{editing ? <><button className="button subtle" onClick={() => setEditing(false)}>Abbrechen</button><button className="button primary" onClick={() => void saveEdit(source)}>Speichern</button></> : <><button className="button danger" onClick={() => void deleteSource(source)}>Löschen</button><select className="move-select" aria-label="Quelle in Notebook verschieben" value={source.notebookId} onChange={event => void moveSource(source, event.target.value)}>{library.notebooks.filter(item => !item.archived).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>{source.originalUrl && <button className="button subtle" disabled={busy} onClick={() => void reprocessSource(source)}>Erneut lesen</button>}<button className="button subtle" onClick={() => startEdit(source)}>Bearbeiten</button><button className="button primary" onClick={() => navigator.clipboard.writeText(source.body).then(() => setNotice('Inhalt kopiert.')).catch(() => setNotice('Kopieren fehlgeschlagen.'))}>Inhalt kopieren</button></>}</div>
    </section></div>}

    {dialog && <div className="modal-backdrop" onClick={() => !busy && setDialog(null)}><section className="modal" onClick={event => event.stopPropagation()} aria-label="Dialog"><div className="modal-head"><div><div className="eyebrow">{notebook?.title}</div><h2>{dialog === 'add' ? 'Quelle hinzufügen' : dialog === 'export' ? 'Kontext exportieren' : dialog === 'trash' ? 'Papierkorb' : dialog === 'manage' ? 'Notebook verwalten' : dialog === 'shares' ? 'Geteilte Eingänge' : 'Notebook erstellen'}</h2></div><button className="icon-button" onClick={() => setDialog(null)} aria-label="Schließen">×</button></div>
      {dialog === 'shares' && <div className="modal-body"><p className="helper">Diese Eingänge bleiben erhalten, bis der Import gelingt oder du sie ausdrücklich verwirfst. Spätere Eingänge werden trotzdem weiterverarbeitet.</p><div className="trash-list">{shareErrors.map(item => <div key={item.id}><span><strong>{item.title}</strong><small>{item.message}</small></span><button className="button danger" onClick={() => void discardSharedItem(item.id)}>Verwerfen</button></div>)}</div><button className="button primary wide" onClick={() => setShareRetry(value => value + 1)}>Erneut versuchen</button></div>}
      {dialog === 'trash' && <div className="modal-body"><p className="helper">Gelöschte Quellen bleiben in Sicherungen erhalten und können hier wiederhergestellt werden.</p>{library.sources.filter(item => item.deletedAt).length === 0 ? <p className="helper">Der Papierkorb ist leer.</p> : <div className="trash-list">{library.sources.filter(item => item.deletedAt).map(item => <div key={item.id}><span><strong>{item.title}</strong><small>{library.notebooks.find(book => book.id === item.notebookId)?.title || 'Unbekanntes Notebook'}</small></span><button className="button subtle" onClick={() => void restoreSource(item)}>Wiederherstellen</button></div>)}</div>}</div>}
      {dialog === 'manage' && <div className="modal-body">{notebook.id !== INBOX_ID && <><label>AKTUELLES NOTEBOOK<input value={notebookName} onChange={event => setNotebookName(event.target.value)} /></label><div className="modal-actions"><button className="button danger" onClick={() => void archiveNotebook()}>Archivieren</button><button className="button primary" disabled={!notebookName.trim()} onClick={() => void renameNotebook()}>Umbenennen</button></div></>}<div className="backup-section"><h3>Archivierte Notebooks</h3>{library.notebooks.filter(item => item.archived).length === 0 ? <p>Keine archivierten Notebooks.</p> : <div className="trash-list">{library.notebooks.filter(item => item.archived).map(item => <div key={item.id}><span><strong>{item.title}</strong><small>{library.sources.filter(source => source.notebookId === item.id && !source.deletedAt).length} Quellen</small></span><button className="button subtle" onClick={() => void unarchiveNotebook(item.id)}>Wiederherstellen</button></div>)}</div>}</div></div>}
      {dialog === 'notebook' && <div className="modal-body"><label>NAME DES NOTEBOOKS<input autoFocus value={notebookName} placeholder="z. B. Context Engineering" onChange={event => setNotebookName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && notebookName.trim()) { const item = createNotebook(notebookName); void commit(value => ({ ...value, notebooks: [...value.notebooks, item] })); setSelectedNotebook(item.id); setNotebookName(''); setDialog(null); } }} /></label><button className="button primary wide" disabled={!notebookName.trim()} onClick={() => { const item = createNotebook(notebookName); void commit(value => ({ ...value, notebooks: [...value.notebooks, item] })); setSelectedNotebook(item.id); setNotebookName(''); setDialog(null); }}>Notebook erstellen</button></div>}
      {dialog === 'add' && <div className="modal-body">
        <div className="tabs">
          <button className={addTab === 'url' ? 'active' : ''} onClick={() => setAddTab('url')}>Website / URL</button>
          <button className={addTab === 'file' ? 'active' : ''} onClick={() => setAddTab('file')}>Datei</button>
          <button className={addTab === 'text' ? 'active' : ''} onClick={() => setAddTab('text')}>Text</button>
          <button className={addTab === 'youtube' ? 'active' : ''} onClick={() => setAddTab('youtube')}>YouTube</button>
          <button className={addTab === 'search' ? 'active' : ''} onClick={() => setAddTab('search')}>Websuche</button>
        </div>
        {addTab === 'url' && <><p className="helper">Eine oder mehrere URLs eingeben. Jede URL wird als eigene Quelle gespeichert.</p><textarea rows={5} placeholder={'https://example.com/artikel\nhttps://example.org/guide'} value={urlInput} onChange={event => setUrlInput(event.target.value)} /><div className="modal-actions">{Boolean(globalThis.chrome?.runtime?.sendMessage) && <button className="button subtle" onClick={handleCurrentTab} disabled={busy}>Vorherigen Tab übernehmen</button>}<button className="button primary" onClick={handleUrls} disabled={busy || !urlInput.trim()}>{busy ? 'Lese Quellen …' : 'URLs hinzufügen'}</button></div></>}
        {addTab === 'file' && <><p className="helper">TXT, Markdown, HTML, PDF, DOCX, EPUB, CSV sowie Untertiteldateien (VTT/SRT) werden lokal verarbeitet.</p><input ref={fileInput} type="file" accept=".txt,.md,.markdown,.html,.htm,.pdf,.docx,.epub,.csv,.vtt,.srt" multiple onChange={event => void handleFiles(event.target.files)} /><button className="button primary wide" disabled={busy} onClick={() => fileInput.current?.click()}>{busy ? 'Verarbeite Dateien …' : 'Dateien auswählen'}</button></>}
        {addTab === 'text' && <><label>TITEL<input placeholder="Titel deiner Quelle" value={textTitle} onChange={event => setTextTitle(event.target.value)} /></label><label>INHALT<textarea rows={7} placeholder="Text hier einfügen …" value={textInput} onChange={event => setTextInput(event.target.value)} /></label><button className="button primary wide" onClick={() => void handleText()}>Text hinzufügen</button></>}
        {addTab === 'youtube' && <>
          <p className="helper">Optionaler externer Dienst: Erst nach Klick werden Links an Supadata übertragen. Nur vorhandene Untertitel, keine KI-Transkription. Abrufe können Kosten verursachen. Der Schlüssel bleibt nur im Arbeitsspeicher.</p>
          <label>SUPADATA API-SCHLÜSSEL<input type="password" autoComplete="off" value={supadataKey} onChange={event => setSupadataKey(event.target.value)} /></label>
          <label>VIDEO-URL<input placeholder="https://www.youtube.com/watch?v=…" value={urlInput} onChange={event => setUrlInput(event.target.value)} /></label>
          <button className="button primary wide" disabled={busy || !urlInput.trim() || !supadataKey.trim()} onClick={() => void handleYouTube()}>{busy ? 'Lade Untertitel …' : 'Untertitel laden'}</button>
          <div className="backup-section"><h3>Kanal oder Playlist</h3><p>Die Liste und deine Auswahl bleiben lokal gespeichert. Bereits importierte Videos werden vor kostenpflichtigen Abrufen übersprungen.</p>
            <label>KANAL- ODER PLAYLIST-URL<input placeholder="https://www.youtube.com/playlist?list=…" value={catalogUrl} onChange={event => setCatalogUrl(event.target.value)} /></label>
            <label>MAXIMAL ANZEIGEN (1–5000)<input type="number" min={1} max={5000} value={catalogLimit} onChange={event => setCatalogLimit(Math.max(1, Math.min(5000, Number(event.target.value) || 1)))} /></label>
            <label>KANAL-TYP<select value={catalogType} onChange={event => setCatalogType(event.target.value as 'video' | 'short' | 'live')}><option value="video">Normale Videos</option><option value="short">Shorts</option><option value="live">Live-Videos</option></select></label>
            <button className="button subtle wide" disabled={busy || !catalogUrl.trim() || !supadataKey.trim()} onClick={() => void loadCatalog()}>Video-Liste laden</button>
            {catalogIds.length > 0 && <div className="catalog-list"><p className="helper">{catalogIds.length} Video-IDs gefunden{catalogIds.length >= catalogLimit ? '; das gewählte Limit ist erreicht, weitere Videos sind möglich' : ''}.</p><div className="modal-actions"><button className="button subtle" onClick={() => setSelectedCatalogIds(catalogIds)}>Alle auswählen</button><button className="button subtle" onClick={() => setSelectedCatalogIds([])}>Auswahl aufheben</button></div>{catalogIds.slice(0, visibleCatalogCount).map(id => <label key={id}><input type="checkbox" checked={selectedCatalogIds.includes(id)} onChange={event => setSelectedCatalogIds(current => event.target.checked ? [...current, id] : current.filter(item => item !== id))} /><span>youtube.com/watch?v={id}</span></label>)}{catalogIds.length > visibleCatalogCount && <button className="button subtle wide" onClick={() => setVisibleCatalogCount(count => count + 100)}>Weitere 100 anzeigen</button>}<button className="button primary wide" disabled={busy || !selectedCatalogIds.length || !supadataKey.trim()} onClick={() => void importCatalogSelection()}>{selectedCatalogIds.length} ausgewählte Videos importieren</button></div>}
          </div>
        </>}
        {addTab === 'search' && <><p className="helper">Optionaler externer Dienst: Erst mit Klick auf „Suchen“ wird deine Anfrage an Brave Search gesendet. Kosten können entstehen. Ergebnisse werden erst durch deinen Klick importiert. Der Schlüssel bleibt nur im Arbeitsspeicher.</p><label>SUCHBEGRIFF<input placeholder="Wonach suchst du?" value={discoveryQuery} onChange={event => setDiscoveryQuery(event.target.value)} /></label><label>BRAVE SEARCH API-SCHLÜSSEL<input type="password" autoComplete="off" value={braveKey} onChange={event => setBraveKey(event.target.value)} /></label><button className="button primary wide" disabled={busy || !discoveryQuery.trim() || !braveKey.trim()} onClick={() => void handleSearch()}>{busy ? 'Suche …' : 'Suchen'}</button><div className="discovery-results">{searchResults.map(result => <div className="discovery-result" key={result.url}><strong>{result.title}</strong><small>{result.url}</small><p>{result.description}</p><button className="button subtle" disabled={busy} onClick={() => void importSearchResult(result)}>Importieren</button></div>)}</div></>}
      </div>}
      {dialog === 'export' && <div className="modal-body"><p className="helper">{activeSources.length} aktive Quellen · ungefähr {new Intl.NumberFormat('de-DE').format(tokenCount)} Tokens. Deaktivierte Quellen bleiben außerhalb des Exports.</p><div className="export-options"><button onClick={() => void exportAs('md')}><span>▤</span><strong>Eine Markdown-Datei</strong><small>Alle Quellen mit Herkunft und YAML-Manifest</small></button><button onClick={() => void exportAs('txt')}><span>≡</span><strong>Eine Textdatei</strong><small>Lesbarer Text mit Quellenangaben</small></button><button onClick={() => void exportAs('zip')}><span>▣</span><strong>ZIP mit Einzeldateien</strong><small>OKF-orientiertes Markdown-Bundle</small></button><button onClick={() => void exportAs('copy')}><span>⧉</span><strong>In Zwischenablage kopieren</strong><small>Markdown direkt weiterverwenden</small></button></div><div className="backup-section"><h3>Bibliothek sichern und abgleichen</h3><p>Alle Notebooks und Quellen als ZIP sichern. Auf einem anderen Gerät kannst du die Datei zusammenführen; abweichende Versionen bleiben als Konfliktkopien erhalten.</p><input ref={backupInput} type="file" accept=".zip,.json" aria-label="Sicherung auswählen" onChange={event => void restoreBackup(event.target.files?.[0])} /><div className="modal-actions"><button className="button subtle" onClick={() => { restoreMode.current = 'merge'; backupInput.current?.click(); }}>Zusammenführen</button><button className="button danger" onClick={() => { restoreMode.current = 'replace'; backupInput.current?.click(); }}>Ersetzen</button><button className="button primary" onClick={() => void saveBackup()}>Sicherung speichern / teilen</button></div></div></div>}
    </section></div>}
    {notice && <div className="toast" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Meldung schließen">×</button></div>}
  </div>;
}
