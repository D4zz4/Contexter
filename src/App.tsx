import { useEffect, useRef, useState } from 'react';
import { bundleMarkdown, bundleText, bundleZip, deliverFile, safeFilename } from './export';
import { extractActiveTab, extractFile, extractUrl } from './extract';
import { createNotebook, createSource, emptyLibrary, emptyTrash, findDuplicate, INBOX_ID, metrics, reorderNotebook, restoreNotebook, trashNotebook, type Library, type Source } from './model';
import { loadLibrary, saveLibrary } from './storage';
import { isNative, shareInbox, sharedFile, sharedText } from './share-inbox';
import { backupLibrary, importLibraryAsNotebook, mergeLibraries, readLibraryBackup } from './backup';
import { braveSearch, isYouTubeVideoUrl, parseYouTubeLinks, youtubeCatalog, youtubeTranscript, type SearchResult } from './providers';
import { youtubeTranscriptLocal } from './ytdlp';
import { cleanTimestampedText } from './subtitles';
import { prepareYouTubeCookies } from './youtube-cookies';
import { loadLanguage, loadTheme, translateUi, type Language, type Theme } from './i18n';
import './styles.css';

type Dialog = 'add' | 'export' | 'notebook' | 'notebookActions' | 'trash' | 'manage' | 'shares' | 'settings' | null;
type AddTab = 'url' | 'text' | 'file' | 'youtube' | 'search';

const localeDate = (value: string | undefined, language: Language) => value ? new Date(value).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const originLabel = (value?: string) => { try { return value ? new URL(value).hostname : ''; } catch { return 'Ungültige URL'; } };
function loadCatalogDraft(): { url: string; type: 'video' | 'short' | 'live'; ids: string[]; selected: string[]; limit: number } {
  try {
    const value = JSON.parse(localStorage.getItem('contexter-catalog-draft') || '{}');
    return { url: typeof value.url === 'string' ? value.url : '', type: ['video', 'short', 'live'].includes(value.type) ? value.type : 'video', ids: Array.isArray(value.ids) ? value.ids.filter((id: unknown) => typeof id === 'string') : [], selected: Array.isArray(value.selected) ? value.selected.filter((id: unknown) => typeof id === 'string') : [], limit: Number.isInteger(value.limit) && value.limit >= 1 && value.limit <= 5000 ? value.limit : 20 };
  } catch { return { url: '', type: 'video', ids: [], selected: [], limit: 20 }; }
}

export default function App() {
  const [language, setLanguage] = useState<Language>(loadLanguage);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const t = (value: string) => translateUi(value, language);
  const message = (de: string, en: string) => language === 'de' ? de : en;
  const [catalogDraft] = useState(loadCatalogDraft);
  const [library, setLibrary] = useState<Library>(emptyLibrary);
  const libraryRef = useRef(library);
  const saveQueue = useRef(Promise.resolve());
  const [loaded, setLoaded] = useState(false);
  const [selectedNotebook, setSelectedNotebook] = useState(INBOX_ID);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [contextNotebookId, setContextNotebookId] = useState<string | null>(null);
  const [draggedNotebookId, setDraggedNotebookId] = useState<string | null>(null);
  const [dragHover, setDragHover] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const notebookPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressNotebookClick = useRef(false);
  const [addTab, setAddTab] = useState<AddTab>('url');
  const [notebookName, setNotebookName] = useState('');
  const [notebookStep, setNotebookStep] = useState<'choice' | 'create' | 'import'>('choice');
  const [archiveAction, setArchiveAction] = useState<'new' | 'merge'>('new');
  const [archiveFile, setArchiveFile] = useState<File | null>(null);
  const [archiveError, setArchiveError] = useState('');
  const incomingArchiveId = useRef<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [youtubeBatchProgress, setYoutubeBatchProgress] = useState('');
  const [youtubeBatchErrors, setYoutubeBatchErrors] = useState<Array<{ url: string; message: string }>>([]);
  const [textTitle, setTextTitle] = useState('');
  const [textInput, setTextInput] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'title'>('newest');
  const [supadataKey, setSupadataKey] = useState('');
  const [subtitleLanguage, setSubtitleLanguage] = useState<'original' | 'de' | 'en'>('original');
  const [youtubeCookies, setYoutubeCookies] = useState('');
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
  const archiveInput = useRef<HTMLInputElement>(null);
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
    document.documentElement.lang = language;
    try { localStorage.setItem('contexter-language', language); }
    catch { /* Language selection remains available for this session. */ }
  }, [language]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('contexter-theme', theme); }
    catch { /* Theme selection remains available for this session. */ }
  }, [theme]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (window.matchMedia('(max-width: 720px)').matches) {
      document.querySelector(`[data-notebook-id="${selectedNotebook}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [selectedNotebook, library.notebooks.length]);

  function openNotebookDialog() {
    setNotebookStep(incomingArchiveId.current ? 'import' : 'choice');
    if (!incomingArchiveId.current) {
      setNotebookName('');
      setArchiveAction('new');
      setArchiveFile(null);
    }
    setArchiveError('');
    setDialog('notebook');
  }

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
    saveQueue.current.catch(error => setNotice(message(`Speichern fehlgeschlagen: ${String(error)}`, `Save failed: ${String(error)}`)));
    return saveQueue.current;
  }

  async function addSource(source: Source, options: { open?: boolean; silent?: boolean } = {}): Promise<boolean> {
    let duplicate: Source | undefined;
    await commit(value => {
      duplicate = findDuplicate(value, source);
      return duplicate ? value : { ...value, sources: [...value.sources, source] };
    });
    if (duplicate) {
      if (!options.silent) setNotice(message(`Bereits vorhanden: „${duplicate.title}“. Öffne die vorhandene Quelle oder füge eine andere hinzu.`, `Already present: “${duplicate.title}”. Open the existing source or add another.`));
      if (options.open !== false) setSelectedSource(duplicate.id);
      return false;
    }
    if (options.open !== false) setSelectedSource(source.id);
    if (!options.silent) setNotice(t('Quelle hinzugefügt.'));
    return true;
  }

  async function openAddDialog() {
    setDialog('add');
    if (!isNative) return;
    try {
      const { text } = await shareInbox().readClipboard();
      const { urls } = parseYouTubeLinks(text);
      if (urls.length && window.confirm(message(`${urls.length} YouTube-Link(s) in der Zwischenablage gefunden. Als YouTube-Quelle übernehmen?`, `${urls.length} YouTube link(s) found in the clipboard. Import as YouTube sources?`))) {
        setAddTab('youtube');
        setUrlInput(current => [current.trim(), ...urls].filter(Boolean).join('\n'));
      }
    } catch { /* The add dialog remains usable without clipboard access. */ }
  }

  async function handleCookieFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error(message('Cookie-Datei ist größer als 1 MiB. Bitte nur YouTube-Cookies exportieren.', 'Cookie file exceeds 1 MiB. Please export YouTube cookies only.'));
      setYoutubeCookies(prepareYouTubeCookies(await file.text()));
      setNotice(t('YouTube-Cookies nur für diese App-Sitzung geladen. Sie werden nicht gesichert.'));
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
  }

  const notebook = library.notebooks.find(item => item.id === selectedNotebook) || library.notebooks[0];
  const allSources = library.sources.filter(item => !item.deletedAt && item.notebookId === notebook?.id);
  const visibleSources = allSources.filter(item => `${item.title} ${item.originalUrl || ''} ${item.body}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, 'de') : sort === 'oldest' ? a.importedAt.localeCompare(b.importedAt) : b.importedAt.localeCompare(a.importedAt));
  const activeSources = allSources.filter(item => item.enabled && (item.status === 'ready' || item.status === 'partial'));
  const tokenCount = activeSources.reduce((sum, item) => sum + metrics(item.body).tokens, 0);
  const source = library.sources.find(item => item.id === selectedSource && item.notebookId === notebook?.id);
  const contextNotebook = library.notebooks.find(item => item.id === contextNotebookId && !item.deletedAt);
  const deletedNotebooks = library.notebooks.filter(item => item.deletedAt);
  const deletedSources = library.sources.filter(item => item.deletedAt);

  function cancelNotebookPress() {
    if (notebookPressTimer.current) clearTimeout(notebookPressTimer.current);
    notebookPressTimer.current = null;
  }

  function openNotebookActions(id: string) {
    cancelNotebookPress();
    suppressNotebookClick.current = true;
    setTimeout(() => { suppressNotebookClick.current = false; }, 1000);
    setContextNotebookId(id);
    setDialog('notebookActions');
  }

  function startNotebookPress(id: string) {
    cancelNotebookPress();
    notebookPressTimer.current = setTimeout(() => openNotebookActions(id), 550);
  }

  function dropTarget(x: number, y: number): string | null {
    const element = document.elementFromPoint(x, y);
    if (element?.closest('[data-drop-trash]')) return 'trash';
    return element?.closest('[data-notebook-id]')?.getAttribute('data-notebook-id') || null;
  }

  function endNotebookDrag(id: string, x: number, y: number) {
    const target = dropTarget(x, y);
    setDraggedNotebookId(null);
    setDragHover(null);
    setDragPosition(null);
    if (target === 'trash') void deleteNotebook(id);
    else if (target && target !== id) void commit(value => reorderNotebook(value, id, target));
  }

  async function handleUrls() {
    const urls = urlInput.split(/\s+/).map(item => item.trim()).filter(Boolean);
    if (!urls.length) return;
    setBusy(true);
    let success = 0;
    const errors: string[] = [];
    for (const url of urls) {
      try {
        if (isYouTubeVideoUrl(url)) throw new Error(t('Für YouTube-Untertitel bitte den Tab „YouTube“ verwenden.'));
        const extracted = await extractUrl(url);
        const added = await addSource(createSource({ notebookId: notebook.id, kind: extracted.kind, title: extracted.title, body: extracted.body, originalUrl: url, author: extracted.author, warnings: extracted.warnings, status: extracted.warnings.length ? 'partial' : 'ready' }));
        if (added) success++;
      } catch (error) {
        errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    setBusy(false);
    setUrlInput('');
    setNotice(message(`${success} Quelle(n) hinzugefügt.`, `${success} source(s) added.`) + (errors.length ? ` ${errors.join(' | ')}` : ''));
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
    setNotice(message(`${count} Datei(en) hinzugefügt.`, `${count} file(s) added.`) + (errors.length ? ` ${errors.join(' | ')}` : ''));
    if (count) setDialog(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function handleText() {
    if (!textInput.trim()) { setNotice(t('Bitte Text einfügen.')); return; }
    const added = await addSource(createSource({ notebookId: notebook.id, kind: 'text', title: textTitle || 'Eingefügter Text', body: textInput }));
    if (added) { setTextInput(''); setTextTitle(''); setDialog(null); }
  }

  async function handleYouTube(method: 'local' | 'supadata') {
    const { urls, invalid, repeats } = parseYouTubeLinks(urlInput);
    if (!urls.length) { setNotice(t('Bitte mindestens einen gültigen YouTube-Video-Link eingeben.')); return; }
    if (urls.length > 100) { setNotice(t('Bitte höchstens 100 unterschiedliche Video-Links pro Durchlauf eingeben.')); return; }
    const notebookId = notebook.id;
    const pending = urls.filter(url => !findDuplicate(libraryRef.current, createSource({ notebookId, kind: 'youtube', title: url, body: '', originalUrl: url })));
    if (method === 'supadata' && pending.length && !window.confirm(message(`${pending.length} Video(s) über Supadata abrufen? Jeder Abruf kann Kosten verursachen.`, `Fetch ${pending.length} video(s) via Supadata? Each request may incur costs.`))) return;
    setBusy(true);
    setYoutubeBatchErrors([]);
    let imported = 0;
    let skipped = urls.length - pending.length + repeats;
    const errors = invalid.map(url => ({ url, message: t('Kein gültiger YouTube-Video-Link.') }));
    for (const [index, url] of pending.entries()) {
      setYoutubeBatchProgress(message(`Video ${index + 1} von ${pending.length} wird geladen …`, `Loading video ${index + 1} of ${pending.length}…`));
      try {
        const result = method === 'local' ? await youtubeTranscriptLocal(url, subtitleLanguage, youtubeCookies || undefined) : await youtubeTranscript(url, supadataKey);
        const added = await addSource(createSource({ notebookId, kind: 'youtube', title: result.title, body: cleanTimestampedText(result.body, true), originalUrl: url, author: result.author, language: result.language, provider: result.provider, warnings: result.warnings, status: result.warnings.length ? 'partial' : 'ready' }), { open: false, silent: true });
        if (added) imported++; else skipped++;
      } catch (error) { errors.push({ url, message: error instanceof Error ? error.message : String(error) }); }
    }
    setBusy(false);
    setYoutubeBatchProgress('');
    setYoutubeBatchErrors(errors);
    setUrlInput(errors.map(item => item.url).join('\n'));
    setNotice(message(`${imported} Video(s) hinzugefügt, ${skipped} doppelte oder bereits vorhandene übersprungen.`, `${imported} video(s) added, ${skipped} duplicate or existing video(s) skipped.`) + (errors.length ? message(` ${errors.length} Link(s) konnten nicht geladen werden.`, ` ${errors.length} link(s) could not be loaded.`) : ''));
    if (!errors.length) setDialog(null);
  }

  async function loadCatalog() {
    setBusy(true);
    try {
      const ids = await youtubeCatalog(catalogUrl, supadataKey, catalogLimit, catalogType);
      setCatalogIds(ids);
      setSelectedCatalogIds([]);
      setVisibleCatalogCount(100);
      if (!ids.length) setNotice(t('Keine passenden Videos gefunden.'));
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function importCatalogSelection() {
    if (!selectedCatalogIds.length) return;
    if (!window.confirm(message(`${selectedCatalogIds.length} Videos über Supadata abrufen? Jeder Abruf kann Kosten verursachen.`, `Fetch ${selectedCatalogIds.length} videos via Supadata? Each request may incur costs.`))) return;
    setBusy(true);
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (const id of selectedCatalogIds) {
      const url = `https://www.youtube.com/watch?v=${id}`;
      if (findDuplicate(libraryRef.current, createSource({ notebookId: notebook.id, kind: 'youtube', title: id, body: '', originalUrl: url }))) { skipped++; setSelectedCatalogIds(current => current.filter(item => item !== id)); continue; }
      try {
        const result = await youtubeTranscript(url, supadataKey);
        if (await addSource(createSource({ notebookId: notebook.id, kind: 'youtube', title: result.title, body: cleanTimestampedText(result.body, true), originalUrl: url, author: result.author, language: result.language, provider: result.provider, warnings: result.warnings, status: result.warnings.length ? 'partial' : 'ready' }))) imported++;
        setSelectedCatalogIds(current => current.filter(item => item !== id));
      } catch (error) { errors.push(`${id}: ${String(error)}`); }
    }
    setBusy(false);
    setNotice(message(`${imported} Video(s) hinzugefügt, ${skipped} bereits vorhanden.`, `${imported} video(s) added, ${skipped} already present.`) + (errors.length ? message(` Fehler: ${errors.join(' | ')}`, ` Errors: ${errors.join(' | ')}`) : ''));
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
          setNotice(message(`Teilen fehlgeschlagen: ${pending.error}`, `Sharing failed: ${pending.error}`));
          await inbox.clearError();
        }
        for (const summary of pending.items) {
          if (stopped) break;
          try {
            const item = await inbox.readItem({ id: summary.id });
            if (item.kind === 'backup') {
              if (!incomingArchiveId.current) {
                const file = await sharedFile(item);
                incomingArchiveId.current = item.id;
                setArchiveFile(file);
                setNotebookName(file.name.replace(/\.zip$/i, '').replace(/^contexter-backup-?/i, '') || 'Importiertes Notebook');
                setArchiveAction('new');
                setArchiveError('');
                setNotebookStep('import');
                setDialog('notebook');
              }
              continue;
            }
            if (item.kind === 'file') {
              const file = await sharedFile(item);
              const extracted = await extractFile(file);
              await addSource(createSource({ notebookId: INBOX_ID, kind: extracted.kind, title: extracted.title, body: extracted.body, originalFilename: file.name, warnings: extracted.warnings, status: extracted.warnings.length ? 'partial' : 'ready' }));
            } else {
              const value = (await sharedText(item)).trim();
              if (!value) throw new Error('Geteilter Text ist leer.');
              if (/^https?:\/\/\S+$/i.test(value)) {
                if (isYouTubeVideoUrl(value)) {
                  await addSource(createSource({ notebookId: INBOX_ID, kind: 'youtube', title: `YouTube-Video ${new URL(value).searchParams.get('v') || new URL(value).pathname.split('/').filter(Boolean).at(-1)}`, body: value, originalUrl: value, warnings: ['Video-Link gespeichert. Für Untertitel im Quellen-Detail „Erneut lesen“ wählen. Auf Android geht das ohne API-Schlüssel.'], status: 'partial' }));
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
            setNotice(message(`Geteilte Quelle wartet auf Bearbeitung: ${failure.title}`, `Shared source needs attention: ${failure.title}`));
          }
        }
      } catch (error) {
        setNotice(message(`Geteilte Quelle konnte nicht verarbeitet werden: ${String(error)}`, `Shared source could not be processed: ${String(error)}`));
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
  }, [loaded, shareRetry, language]);

  async function exportAs(format: 'md' | 'txt' | 'zip' | 'copy') {
    if (!activeSources.length) { setNotice(t('Keine aktiven, fertigen Quellen zum Exportieren.')); return; }
    const ordered = [...activeSources].sort((a, b) => a.importedAt.localeCompare(b.importedAt) || a.id.localeCompare(b.id));
    const name = safeFilename(notebook.title);
    try {
      if (format === 'md') await deliverFile(new Blob([bundleMarkdown(notebook, ordered)], { type: 'text/markdown;charset=utf-8' }), `${name}.md`);
      if (format === 'txt') await deliverFile(new Blob([bundleText(notebook, ordered)], { type: 'text/plain;charset=utf-8' }), `${name}.txt`);
      if (format === 'zip') await deliverFile(await bundleZip(notebook, ordered), `${name}.zip`);
      if (format === 'copy') await navigator.clipboard.writeText(bundleMarkdown(notebook, ordered));
      setNotice(message(`${ordered.length} Quelle(n) ${format === 'copy' ? 'kopiert' : 'exportiert'}.`, `${ordered.length} source(s) ${format === 'copy' ? 'copied' : 'exported'}.`));
      setDialog(null);
    } catch (error) { setNotice(message(`Export fehlgeschlagen: ${String(error)}`, `Export failed: ${String(error)}`)); }
  }

  async function saveBackup() {
    try {
      await saveQueue.current;
      await deliverFile(await backupLibrary(libraryRef.current), `contexter-backup-${new Date().toISOString().slice(0, 10)}.zip`);
      setNotice(t('Vollständige Bibliothekssicherung ausgegeben.'));
      setDialog(null);
    } catch (error) { setNotice(message(`Sicherung fehlgeschlagen: ${String(error)}`, `Backup failed: ${String(error)}`)); }
  }

  async function restoreBackup(file: File | undefined) {
    if (!file) return;
    try {
      const restored = await readLibraryBackup(file);
      await saveQueue.current;
      if (restoreMode.current === 'replace') {
        if (!window.confirm(message(`Diese Sicherung enthält ${restored.notebooks.length} Notebooks und ${restored.sources.length} Quellen. Die aktuelle Bibliothek wird vollständig ersetzt. Fortfahren?`, `This backup contains ${restored.notebooks.length} notebooks and ${restored.sources.length} sources. The current library will be replaced completely. Continue?`))) return;
        await commit(() => restored);
        setSelectedNotebook(INBOX_ID);
        setNotice(t('Bibliothek aus Sicherung ersetzt.'));
      } else {
        const result = mergeLibraries(libraryRef.current, restored);
        if (!window.confirm(message(`${result.added} Quellen ergänzen, davon ${result.conflicts} abweichende Versionen als Konfliktkopie behalten?`, `Add ${result.added} sources, including ${result.conflicts} differing versions kept as conflict copies?`))) return;
        await commit(() => result.library);
        setNotice(message(`Sicherung zusammengeführt: ${result.added} neue Quellen, ${result.conflicts} Konfliktkopien.`, `Backup merged: ${result.added} new sources, ${result.conflicts} conflict copies.`));
      }
      setSelectedSource(null);
      setDialog(null);
    } catch (error) { setNotice(message(`Wiederherstellung fehlgeschlagen: ${String(error)}`, `Restore failed: ${String(error)}`)); }
    finally { if (backupInput.current) backupInput.current.value = ''; }
  }

  async function createNewNotebook() {
    if (!notebookName.trim()) return;
    const item = createNotebook(notebookName);
    try {
      await commit(value => ({ ...value, notebooks: [...value.notebooks, item] }));
      setSelectedNotebook(item.id);
      setNotebookName('');
      setDialog(null);
      setNotice(t('Notebook erstellt.'));
    } catch (error) { setArchiveError(message(`Notebook konnte nicht erstellt werden: ${String(error)}`, `Could not create notebook: ${String(error)}`)); }
  }

  async function importNotebookArchive() {
    if (!archiveFile) { setArchiveError(t('Bitte eine Contexter-Sicherung als ZIP oder JSON auswählen.')); return; }
    if (archiveAction === 'new' && !notebookName.trim()) { setArchiveError(t('Bitte einen Namen für das neue Notebook eingeben.')); return; }
    setBusy(true);
    setArchiveError('');
    try {
      const incoming = await readLibraryBackup(archiveFile);
      await saveQueue.current;
      if (archiveAction === 'new') {
        const result = importLibraryAsNotebook(libraryRef.current, incoming, notebookName);
        await commit(() => result.library);
        setSelectedNotebook(result.notebookId);
        setNotice(message(`Neues Notebook mit ${result.added} Quelle(n) importiert.`, `New notebook imported with ${result.added} source(s).`));
      } else {
        const result = mergeLibraries(libraryRef.current, incoming);
        if (!window.confirm(message(`Diese Sicherung mit deiner Bibliothek zusammenführen? ${result.added} Quelle(n) kommen hinzu; ${result.conflicts} abweichende Version(en) bleiben als Konfliktkopie erhalten.`, `Merge this backup with your library? ${result.added} source(s) will be added; ${result.conflicts} differing version(s) will remain as conflict copies.`))) return;
        await commit(() => result.library);
        setNotice(message(`Sicherung zusammengeführt: ${result.added} neue Quellen, ${result.conflicts} Konfliktkopien.`, `Backup merged: ${result.added} new sources, ${result.conflicts} conflict copies.`));
      }
      if (incomingArchiveId.current) {
        await shareInbox().ackItem({ id: incomingArchiveId.current });
        incomingArchiveId.current = null;
        setShareRetry(value => value + 1);
      }
      setArchiveFile(null);
      setSelectedSource(null);
      setDialog(null);
    } catch (error) { setArchiveError(message(`Import fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`, `Import failed: ${error instanceof Error ? error.message : String(error)}`)); }
    finally { setBusy(false); }
  }

  async function discardIncomingArchive() {
    const id = incomingArchiveId.current;
    if (!id || !window.confirm(t('Diese empfangene ZIP verwerfen? Sie wurde noch nicht importiert. Die ursprüngliche Datei in deiner Dateien-App bleibt erhalten.'))) return;
    try {
      await shareInbox().ackItem({ id });
      incomingArchiveId.current = null;
      setArchiveFile(null);
      setDialog(null);
      setShareRetry(value => value + 1);
    } catch (error) { setArchiveError(message(`ZIP konnte nicht verworfen werden: ${String(error)}`, `Could not discard ZIP: ${String(error)}`)); }
  }

  async function deleteSource(item: Source) {
    if (!window.confirm(message(`Quelle „${item.title}“ in den Papierkorb verschieben?`, `Move source “${item.title}” to the trash?`))) return;
    try {
      await commit(value => ({ ...value, sources: value.sources.map(current => current.id === item.id ? { ...current, deletedAt: new Date().toISOString() } : current) }));
      setSelectedSource(null);
      setNotice(t('Quelle im Papierkorb.'));
    } catch (error) { setNotice(message(`Löschen fehlgeschlagen: ${String(error)}`, `Delete failed: ${String(error)}`)); }
  }

  async function restoreSource(item: Source) {
    await commit(value => {
      const restored = restoreNotebook(value, item.notebookId);
      return { ...restored, notebooks: restored.notebooks.map(current => current.id === item.notebookId ? { ...current, archived: false } : current), sources: value.sources.map(current => current.id === item.id ? { ...current, deletedAt: undefined } : current) };
    });
    setDialog(null);
    setSelectedNotebook(item.notebookId);
    setSelectedSource(item.id);
    setNotice(t('Quelle wiederhergestellt.'));
  }

  async function discardSharedItem(id: string) {
    if (!window.confirm(t('Diesen geteilten Eingang verwerfen? Er wurde noch nicht in der Bibliothek gespeichert.'))) return;
    try {
      await shareInbox().ackItem({ id });
      setShareErrors(current => current.filter(item => item.id !== id));
    } catch (error) { setNotice(message(`Eingang konnte nicht verworfen werden: ${String(error)}`, `Could not discard shared item: ${String(error)}`)); }
  }

  async function renameNotebook() {
    if (!notebookName.trim() || notebook.id === INBOX_ID) return;
    await commit(value => ({ ...value, notebooks: value.notebooks.map(item => item.id === notebook.id ? { ...item, title: notebookName.trim() } : item) }));
    setDialog(null);
    setNotice(t('Notebook umbenannt.'));
  }

  async function archiveNotebook() {
    if (notebook.id === INBOX_ID) return;
    if (!window.confirm(message(`Notebook „${notebook.title}“ archivieren? Die Quellen bleiben erhalten.`, `Archive notebook “${notebook.title}”? Its sources will be kept.`))) return;
    await commit(value => ({ ...value, notebooks: value.notebooks.map(item => item.id === notebook.id ? { ...item, archived: true } : item) }));
    setSelectedNotebook(INBOX_ID);
    setDialog(null);
    setNotice(t('Notebook archiviert.'));
  }

  async function unarchiveNotebook(id: string) {
    await commit(value => ({ ...value, notebooks: value.notebooks.map(item => item.id === id ? { ...item, archived: false } : item) }));
    setSelectedNotebook(id);
    setDialog(null);
    setNotice(t('Notebook wiederhergestellt.'));
  }

  async function deleteNotebook(id: string) {
    const item = libraryRef.current.notebooks.find(current => current.id === id);
    if (!item || item.id === INBOX_ID || item.deletedAt) return;
    const count = libraryRef.current.sources.filter(source => source.notebookId === id && !source.deletedAt).length;
    if (!window.confirm(message(`Notebook „${item.title}“ mit ${count} Quelle(n) in den Papierkorb verschieben? Alles kann dort wiederhergestellt werden.`, `Move notebook “${item.title}” and its ${count} source(s) to the trash? You can restore everything from there.`))) return;
    await commit(value => trashNotebook(value, id));
    if (selectedNotebook === id) setSelectedNotebook(INBOX_ID);
    setSelectedSource(null);
    setDialog(null);
    setNotice(t('Notebook mit seinen Quellen im Papierkorb.'));
  }

  async function undeleteNotebook(id: string) {
    await commit(value => restoreNotebook(value, id));
    setSelectedNotebook(id);
    setDialog(null);
    setNotice(t('Notebook mit seinen Quellen wiederhergestellt.'));
  }

  async function permanentlyEmptyTrash() {
    const notebookCount = libraryRef.current.notebooks.filter(item => item.deletedAt).length;
    const sourceCount = libraryRef.current.sources.filter(item => item.deletedAt || libraryRef.current.notebooks.some(book => book.id === item.notebookId && book.deletedAt)).length;
    if (!notebookCount && !sourceCount) return;
    if (!window.confirm(message(`Papierkorb endgültig leeren? ${notebookCount} Notebook(s) und ${sourceCount} Quelle(n) werden von diesem Gerät gelöscht und können in der App nicht wiederhergestellt werden. Bereits exportierte Sicherungen bleiben unverändert.`, `Empty trash permanently? ${notebookCount} notebook(s) and ${sourceCount} source(s) will be deleted from this device and cannot be restored in the app. Previously exported backups are unchanged.`))) return;
    try {
      await commit(value => emptyTrash(value));
      setSelectedSource(null);
      setNotice(t('Papierkorb endgültig geleert.'));
    } catch (error) { setNotice(message(`Papierkorb konnte nicht geleert werden: ${String(error)}`, `Could not empty trash: ${String(error)}`)); }
  }

  async function reprocessSource(item: Source) {
    if (!item.originalUrl) return;
    setBusy(true);
    try {
      const extracted = item.kind === 'youtube' ? isNative && item.provider !== 'supadata-native' ? await youtubeTranscriptLocal(item.originalUrl, item.language === 'en' ? 'en' : item.language === 'de' ? 'de' : 'original', youtubeCookies || undefined) : await youtubeTranscript(item.originalUrl, supadataKey) : await extractUrl(item.originalUrl);
      if (item.editedByUser) {
        const copy = createSource({ notebookId: item.notebookId, kind: extracted.kind, title: `${extracted.title} (Neu extrahiert)`, body: item.kind === 'youtube' ? cleanTimestampedText(extracted.body, true) : extracted.body, originalUrl: item.originalUrl, author: extracted.author, conflictOf: item.id, warnings: [...extracted.warnings, 'Manuell bearbeitete Fassung wurde nicht überschrieben.'], status: 'partial' });
        await commit(value => ({ ...value, sources: [...value.sources, copy] }));
        setSelectedSource(copy.id);
        setNotice(t('Neue Fassung erstellt; manuelle Bearbeitung blieb erhalten.'));
      } else {
        await commit(value => ({ ...value, sources: value.sources.map(current => current.id === item.id ? { ...current, title: extracted.title, body: item.kind === 'youtube' ? cleanTimestampedText(extracted.body, true) : extracted.body, author: extracted.author, extractedAt: new Date().toISOString(), warnings: extracted.warnings, status: extracted.warnings.length ? 'partial' : 'ready' } : current) }));
        setNotice(t('Quelle erneut verarbeitet.'));
      }
    } catch (error) { setNotice(message(`Erneut verarbeiten fehlgeschlagen: ${String(error)}`, `Reprocessing failed: ${String(error)}`)); }
    finally { setBusy(false); }
  }

  async function cleanSource(item: Source) {
    const cleaned = cleanTimestampedText(item.body, true);
    if (cleaned === item.body) return;
    if (!window.confirm(t('Wiederholte Untertitel-Zeilen und Zeitstempel in dieser Quelle entfernen? Der bisherige Text wird ersetzt. Wenn du ihn behalten möchtest, erstelle vorher eine Sicherung.'))) return;
    try {
      await commit(value => ({ ...value, sources: value.sources.map(current => current.id === item.id ? { ...current, body: cleaned } : current) }));
      setNotice(t('Untertitel-Text ohne wiederholte Zeilen und Zeitstempel gespeichert.'));
    } catch (error) { setNotice(message(`Bereinigung fehlgeschlagen: ${String(error)}`, `Cleanup failed: ${String(error)}`)); }
  }

  async function moveSource(item: Source, notebookId: string) {
    try {
      await commit(value => ({ ...value, sources: value.sources.map(current => current.id === item.id ? { ...current, notebookId } : current) }));
      setSelectedSource(null);
      setNotice(t('Quelle verschoben.'));
    } catch (error) { setNotice(message(`Verschieben fehlgeschlagen: ${String(error)}`, `Move failed: ${String(error)}`)); }
  }

  function startEdit(item: Source) { setEditing(true); setDraft(item.body); }
  async function saveEdit(item: Source) {
    try {
      await commit(value => ({ ...value, sources: value.sources.map(current => current.id === item.id ? { ...current, body: draft, editedByUser: true, status: 'ready' } : current) }));
      setEditing(false);
      setNotice(t('Änderungen gespeichert.'));
    } catch (error) { setNotice(message(`Änderungen konnten nicht gespeichert werden: ${String(error)}`, `Could not save changes: ${String(error)}`)); }
  }

  return <div className="shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => { setSelectedNotebook(INBOX_ID); setSelectedSource(null); }} aria-label={t("Contexter Startseite")}>
        <span className="brand-mark">{t("C")}<span>.</span></span><span>{t("Contexter")}<small>{t("DEIN KONTEXT. DEINE WAHL.")}</small></span>
      </button>
      <button className="button subtle settings-button mobile-settings-button" onClick={() => setDialog('settings')} aria-label={language === 'de' ? 'Einstellungen' : 'Settings'} title={language === 'de' ? 'Einstellungen' : 'Settings'}>⚙</button>
      <div className="side-label">{t("ARBEITSBEREICH")}</div>
      <button className={`nav-item ${selectedNotebook === INBOX_ID ? 'current' : ''}`} onClick={() => { setSelectedNotebook(INBOX_ID); setSelectedSource(null); }}><span className="nav-symbol">⌑</span>{t(" Inbox ")}<span className="nav-count">{library.sources.filter(item => !item.deletedAt && item.notebookId === INBOX_ID).length}</span></button>
      <div className="side-label side-label-row"><span>{t("NOTEBOOKS")}</span><button className="icon-button" onClick={openNotebookDialog} aria-label={t("Notebook erstellen oder importieren")}>+</button></div>
      <nav className="notebook-nav" aria-label={t("Notebooks")}>
        {library.notebooks.filter(item => item.id !== INBOX_ID && !item.archived && !item.deletedAt).map(item => <div key={item.id} data-notebook-id={item.id} className={`notebook-row ${draggedNotebookId === item.id ? 'dragging' : ''} ${dragHover === item.id && draggedNotebookId !== item.id ? 'drop-hover' : ''}`}>
          <button className={`nav-item ${selectedNotebook === item.id ? 'current' : ''}`} onClick={() => { if (suppressNotebookClick.current) { suppressNotebookClick.current = false; return; } setSelectedNotebook(item.id); setSelectedSource(null); }} onPointerDown={() => startNotebookPress(item.id)} onPointerUp={cancelNotebookPress} onPointerLeave={cancelNotebookPress} onPointerCancel={cancelNotebookPress} onContextMenu={event => { event.preventDefault(); openNotebookActions(item.id); }} title={t("Öffnen; lange drücken für Aktionen")}><span className="nav-symbol">▤</span><span className="truncate">{item.title}</span><span className="nav-count">{library.sources.filter(source => !source.deletedAt && source.notebookId === item.id).length}</span></button>
          <button className="notebook-grip" aria-label={`${item.title} ziehen und sortieren`} title={t("Zum Sortieren oder in den Papierkorb ziehen")} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setDraggedNotebookId(item.id); setDragPosition({ x: event.clientX, y: event.clientY }); }} onPointerMove={event => { if (draggedNotebookId !== item.id) return; setDragPosition({ x: event.clientX, y: event.clientY }); setDragHover(dropTarget(event.clientX, event.clientY)); }} onPointerUp={event => { if (draggedNotebookId === item.id) endNotebookDrag(item.id, event.clientX, event.clientY); }} onPointerCancel={() => { setDraggedNotebookId(null); setDragHover(null); setDragPosition(null); }}>⋮⋮</button>
        </div>)}
      </nav>
      <button className="side-new" onClick={openNotebookDialog}>{t("+ Notebook erstellen / importieren")}</button>
      {incomingArchiveId.current && <button className="side-new" onClick={() => { setNotebookStep('import'); setDialog('notebook'); }}>{t("ZIP-Import fortsetzen")}</button>}
      <button className="side-new" onClick={() => { setNotebookName(notebook.title); setDialog('manage'); }}>{t("Notebooks verwalten")}</button>
      <button className={`side-new trash-drop ${dragHover === 'trash' ? 'drop-hover' : ''}`} data-drop-trash onClick={() => setDialog('trash')}>{t("Papierkorb · ")}{deletedSources.length + deletedNotebooks.length}</button>
      {shareErrors.length > 0 && <button className="side-new" onClick={() => setDialog('shares')}>{t("Geteilte Eingänge · ")}{shareErrors.length}{t(" Fehler")}</button>}
      <div className="sidebar-bottom"><div className="privacy-dot" />{t(" Lokal gespeichert ")}<span className="beta-tag">{t("TEST")}</span></div>
    </aside>

    <main className="main">
      <header className="topbar"><div className="breadcrumbs">{t("LIBRARY ")}<span>/</span> <strong>{notebook?.title}</strong></div><div className="top-actions"><span className="local-badge">{t("●  Auf diesem Gerät")}</span><button className="button subtle" onClick={() => setDialog('export')}>{t("↗   Exportieren")}</button><button className="button subtle settings-button" onClick={() => setDialog('settings')} aria-label={language === 'de' ? 'Einstellungen' : 'Settings'} title={language === 'de' ? 'Einstellungen' : 'Settings'}>⚙</button></div></header>
      <div className="workspace">
        <div className="page-heading"><div><div className="eyebrow">{t("DEINE SAMMLUNG")}</div><h1>{notebook?.title}</h1><p>{notebook?.id === INBOX_ID ? t('Eingangskorb für geteilte Links, Texte und Dateien. Öffne eine Quelle und verschiebe sie bei Bedarf in ein Notebook.') : t('Quellen sammeln, prüfen und als portablen Kontext mitnehmen.')}</p></div><button className="button primary" onClick={() => void openAddDialog()}>{t("＋   Quelle hinzufügen")}</button></div>
        <div className="stat-grid"><div className="stat"><span>{t("QUELLEN")}</span><strong>{allSources.length}</strong><small>{activeSources.length}{t(" aktiv für den Export")}</small></div><div className="stat"><span>{t("GESCHÄTZTE TOKENS")}</span><strong>{new Intl.NumberFormat(language === 'de' ? 'de-DE' : 'en-US').format(tokenCount)}</strong><small>{t("Grobe Schätzung · ≈ 4 Zeichen/Token")}</small></div><div className="stat accent"><span>{t("DEIN KONTEXT")}</span><strong>{t("Bereit zum Export")}</strong><small>{t("Markdown · Text · ZIP · Zwischenablage")}</small></div></div>
        <div className="content-card"><div className="list-head"><div><h2>{t("Quellen ")}<span className="heading-count">{allSources.length}</span></h2><p>{t("Jede Quelle bleibt mit ihrem Ursprung verbunden.")}</p></div><div className="list-actions"><input className="search" type="search" placeholder={t("Quellen suchen …")} value={query} onChange={event => setQuery(event.target.value)} aria-label={t("Quellen suchen")} /><select className="sort-select" aria-label={t("Quellen sortieren")} value={sort} onChange={event => setSort(event.target.value as typeof sort)}><option value="newest">{t("Neueste")}</option><option value="oldest">{t("Älteste")}</option><option value="title">{t("Titel A–Z")}</option></select><button className="button subtle" onClick={() => void openAddDialog()}>{t("+ Hinzufügen")}</button></div></div>
          {!loaded ? <div className="empty">{t("Bibliothek wird geladen …")}</div> : visibleSources.length === 0 ? <div className="empty"><div className="empty-symbol">▣</div><h3>{query ? t('Keine passende Quelle') : t('Hier beginnt dein Kontext')}</h3><p>{query ? t('Versuche einen anderen Suchbegriff.') : t('Füge eine Webseite, eine Datei oder eigenen Text hinzu.')}</p>{!query && <button className="button primary" onClick={() => void openAddDialog()}>{t("Erste Quelle hinzufügen")}</button>}</div> : <div className="source-list">{visibleSources.map(item => <div key={item.id} className={`source-row ${selectedSource === item.id ? 'selected' : ''}`}><label className="checkbox-wrap" title={t("Für Export aktiv")}><input type="checkbox" checked={item.enabled} onChange={() => void commit(value => ({ ...value, sources: value.sources.map(current => current.id === item.id ? { ...current, enabled: !current.enabled } : current) }))} aria-label={`${item.title} ${t('für Export aktiv')}`} /></label><button className="source-open" onClick={() => { setSelectedSource(item.id); setEditing(false); }}><span className={`type-icon type-${item.kind}`}>{item.kind === 'web' ? '◈' : item.kind === 'youtube' ? '▶' : '▤'}</span><span className="source-meta"><strong>{item.title}</strong><small>{originLabel(item.originalUrl) || item.originalFilename || t('Eingefügter Text')} · {localeDate(item.importedAt, language)}</small></span></button><span className={`status ${item.status}`}>{item.status === 'partial' ? t('Hinweis') : item.status === 'failed' ? t('Fehler') : item.status === 'queued' ? t('Wartet') : t('Bereit')}</span><span className="row-tokens">~{new Intl.NumberFormat(language === 'de' ? 'de-DE' : 'en-US').format(metrics(item.body).tokens)}{t(" Token")}</span></div>)}</div>}
        </div>
      </div>
    </main>

    {source && <div className="detail-backdrop" onClick={() => setSelectedSource(null)}><section className="detail-panel" onClick={event => event.stopPropagation()} aria-label={t("Quelle ansehen")}>
      <div className="detail-top"><span>{t("QUELLENDETAIL")}</span><button className="icon-button" onClick={() => setSelectedSource(null)} aria-label={t("Schließen")}>×</button></div>
      <div className="detail-scroll"><div className="detail-kicker">{source.kind.toUpperCase()} · {localeDate(source.importedAt, language)}</div><h2>{source.title}</h2>{source.originalUrl && <a className="original-link" href={source.originalUrl} target="_blank" rel="noreferrer">{t("Original öffnen ↗")}</a>}{source.warnings.map((warning, index) => <div className="warning" key={index}>⚠ {warning}</div>)}<div className="detail-metrics">{metrics(source.body).words}{t(" Wörter ")}<span>·</span> ~{metrics(source.body).tokens}{t(" Token ")}<span>·</span> {source.editedByUser ? t('Manuell bearbeitet') : t('Extrahiert')}</div>{editing ? <textarea className="editor" value={draft} onChange={event => setDraft(event.target.value)} aria-label={t("Quelleninhalt bearbeiten")} /> : <pre className="body-preview">{source.body}</pre>}</div>
      <div className="detail-actions">{editing ? <><button className="button subtle" onClick={() => setEditing(false)}>{t("Abbrechen")}</button><button className="button primary" onClick={() => void saveEdit(source)}>{t("Speichern")}</button></> : <><button className="button danger" onClick={() => void deleteSource(source)}>{t("Löschen")}</button><select className="move-select" aria-label={t("Quelle in Notebook verschieben")} value={source.notebookId} onChange={event => void moveSource(source, event.target.value)}>{library.notebooks.filter(item => !item.archived && !item.deletedAt).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>{source.originalUrl && <button className="button subtle" disabled={busy} onClick={() => void reprocessSource(source)}>{t("Erneut lesen")}</button>}{source.kind === 'youtube' && !source.editedByUser && cleanTimestampedText(source.body, true) !== source.body && <button className="button subtle" disabled={busy} onClick={() => void cleanSource(source)}>{t("Text bereinigen")}</button>}<button className="button subtle" onClick={() => startEdit(source)}>{t("Bearbeiten")}</button><button className="button primary" onClick={() => navigator.clipboard.writeText(source.body).then(() => setNotice('Inhalt kopiert.')).catch(() => setNotice('Kopieren fehlgeschlagen.'))}>{t("Inhalt kopieren")}</button></>}</div>
    </section></div>}

    {dialog && <div className="modal-backdrop" onClick={() => !busy && setDialog(null)}><section className="modal" onClick={event => event.stopPropagation()} aria-label={t("Dialog")}><div className="modal-head"><div><div className="eyebrow">{dialog === 'settings' ? 'Contexter' : notebook?.title}</div><h2>{t(dialog === 'add' ? 'Quelle hinzufügen' : dialog === 'export' ? 'Kontext exportieren' : dialog === 'trash' ? 'Papierkorb' : dialog === 'manage' ? 'Notebook verwalten' : dialog === 'notebookActions' ? 'Notebook-Aktionen' : dialog === 'shares' ? 'Geteilte Eingänge' : dialog === 'settings' ? 'Einstellungen' : 'Notebook erstellen oder importieren')}</h2></div><button className="icon-button" disabled={busy} onClick={() => setDialog(null)} aria-label={t("Schließen")}>×</button></div>
      {dialog === 'settings' && <div className="modal-body"><label>{t('SPRACHE')}<select value={language} onChange={event => setLanguage(event.target.value as Language)}><option value="de">Deutsch</option><option value="en">English</option></select></label><p className="helper">{t('Die Spracheinstellung wird nur auf diesem Gerät gespeichert. Quelleninhalte werden nicht übersetzt.')}</p><label>{t('FARBTHEMA')}<select value={theme} onChange={event => setTheme(event.target.value as Theme)}><option value="light">{t('Hell')}</option><option value="dark">{t('Dunkel')}</option></select></label><p className="helper">{t('Das Design wird nur auf diesem Gerät gespeichert.')}</p><p className="helper">{t('Weitere Einstellungen können später hier ergänzt werden.')}</p></div>}
      {dialog === 'notebookActions' && contextNotebook && <div className="modal-body"><p className="helper">{contextNotebook.title} · {library.sources.filter(item => item.notebookId === contextNotebook.id && !item.deletedAt).length}{t(" Quellen")}</p><div className="notebook-action-list"><button className="button subtle" onClick={() => { setSelectedNotebook(contextNotebook.id); setDialog(null); }}>{t("Öffnen")}</button><button className="button subtle" onClick={() => { setSelectedNotebook(contextNotebook.id); setNotebookName(contextNotebook.title); setDialog('manage'); }}>{t("Umbenennen / archivieren")}</button><button className="button danger" onClick={() => void deleteNotebook(contextNotebook.id)}>{t("In den Papierkorb")}</button></div><p className="helper">{t("Zum Sortieren oder Löschen kannst du das Griffsymbol ⋮⋮ neben dem Notebook ziehen.")}</p></div>}
      {dialog === 'shares' && <div className="modal-body"><p className="helper">{t("Diese Eingänge bleiben erhalten, bis der Import gelingt oder du sie ausdrücklich verwirfst. Spätere Eingänge werden trotzdem weiterverarbeitet.")}</p><div className="trash-list">{shareErrors.map(item => <div key={item.id}><span><strong>{item.title}</strong><small>{item.message}</small></span><button className="button danger" onClick={() => void discardSharedItem(item.id)}>{t("Verwerfen")}</button></div>)}</div><button className="button primary wide" onClick={() => setShareRetry(value => value + 1)}>{t("Erneut versuchen")}</button></div>}
      {dialog === 'trash' && <div className="modal-body"><p className="helper">{t("Notebooks und Quellen bleiben lokal erhalten, bis du sie wiederherstellst oder den Papierkorb endgültig leerst. Bereits exportierte Sicherungen ändern sich dadurch nicht.")}</p>{deletedNotebooks.length + deletedSources.length === 0 ? <p className="helper">{t("Der Papierkorb ist leer.")}</p> : <><div className="trash-list">{deletedNotebooks.map(item => <div key={item.id}><span><strong>▤ {item.title}</strong><small>{t("Notebook · ")}{library.sources.filter(source => source.notebookId === item.id && !source.deletedAt).length}{t(" Quellen")}</small></span><button className="button subtle" onClick={() => void undeleteNotebook(item.id)}>{t("Wiederherstellen")}</button></div>)}{deletedSources.map(item => <div key={item.id}><span><strong>{item.title}</strong><small>{t("Quelle · ")}{library.notebooks.find(book => book.id === item.notebookId)?.title || 'Unbekanntes Notebook'}</small></span><button className="button subtle" onClick={() => void restoreSource(item)}>{t("Wiederherstellen")}</button></div>)}</div><div className="modal-actions"><button className="button danger" onClick={() => void permanentlyEmptyTrash()}>{t("Papierkorb endgültig leeren")}</button></div></>}</div>}
      {dialog === 'manage' && <div className="modal-body">{notebook.id !== INBOX_ID && <><label>{t("AKTUELLES NOTEBOOK")}<input value={notebookName} onChange={event => setNotebookName(event.target.value)} /></label><div className="modal-actions"><button className="button danger" onClick={() => void deleteNotebook(notebook.id)}>{t("Löschen")}</button><button className="button subtle" onClick={() => void archiveNotebook()}>{t("Archivieren")}</button><button className="button primary" disabled={!notebookName.trim()} onClick={() => void renameNotebook()}>{t("Umbenennen")}</button></div></>}<div className="backup-section"><h3>{t("Archivierte Notebooks")}</h3>{library.notebooks.filter(item => item.archived && !item.deletedAt).length === 0 ? <p>{t("Keine archivierten Notebooks.")}</p> : <div className="trash-list">{library.notebooks.filter(item => item.archived && !item.deletedAt).map(item => <div key={item.id}><span><strong>{item.title}</strong><small>{library.sources.filter(source => source.notebookId === item.id && !source.deletedAt).length}{t(" Quellen")}</small></span><button className="button subtle" onClick={() => void unarchiveNotebook(item.id)}>{t("Wiederherstellen")}</button></div>)}</div>}</div></div>}
      {dialog === 'notebook' && <div className="modal-body">
        <div className="modal-actions"><button className={`button ${notebookStep === 'create' ? 'primary' : 'subtle'}`} disabled={busy} onClick={() => { setNotebookStep('create'); setArchiveError(''); }}>{t("Neues Notebook erstellen")}</button><button className={`button ${notebookStep === 'import' ? 'primary' : 'subtle'}`} disabled={busy} onClick={() => { setNotebookStep('import'); setArchiveError(''); }}>{t("Sicherung importieren")}</button></div>
        {notebookStep === 'choice' && <p className="helper">{t("Erstelle ein leeres Notebook oder importiere eine Contexter-Bibliothekssicherung als neues Notebook. Deine vorhandenen Notebooks bleiben dabei erhalten.")}</p>}
        {notebookStep === 'create' && <><label>{t("NAME DES NOTEBOOKS")}<input autoFocus value={notebookName} placeholder={t("z. B. Context Engineering")} onChange={event => setNotebookName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void createNewNotebook(); }} /></label><button className="button primary wide" disabled={!notebookName.trim() || busy} onClick={() => void createNewNotebook()}>{t("Notebook erstellen")}</button></>}
        {notebookStep === 'import' && <><p className="helper">{t("Wähle eine vollständige Contexter-Sicherung (.zip oder .json). „Als neues Notebook“ kopiert alle nicht gelöschten Quellen aus der Sicherung in ein eigenes Notebook. „Zusammenführen“ gleicht Notebooks und Quellen mit deiner Bibliothek ab und behält abweichende Versionen als Konfliktkopien.")}</p>{!incomingArchiveId.current && <><input ref={archiveInput} type="file" accept=".zip,.json,application/zip,application/json" disabled={busy} aria-label={t("Sicherungsdatei auswählen")} onChange={event => { const file = event.target.files?.[0] || null; setArchiveFile(file); setArchiveError(''); if (file && !notebookName.trim()) setNotebookName(file.name.replace(/\.(zip|json)$/i, '') || 'Importiertes Notebook'); }} /><button className="button subtle wide" disabled={busy} onClick={() => archiveInput.current?.click()}>{t("Sicherungsdatei auswählen")}</button></>}{archiveFile && <p className="helper">{t("Ausgewählt: ")}{archiveFile.name}</p>}<label>{t("IMPORTART")}<select value={archiveAction} disabled={busy} onChange={event => setArchiveAction(event.target.value as 'new' | 'merge')}><option value="new">{t("Alles als neues Notebook importieren")}</option><option value="merge">{t("Mit bestehender Bibliothek zusammenführen")}</option></select></label>{archiveAction === 'new' && <label>{t("NAME DES NEUEN NOTEBOOKS")}<input value={notebookName} placeholder={t("z. B. Import vom Handy")} onChange={event => setNotebookName(event.target.value)} /></label>}<button className="button primary wide" disabled={busy || !archiveFile || archiveAction === 'new' && !notebookName.trim()} onClick={() => void importNotebookArchive()}>{busy ? t('Importiere …') : archiveAction === 'new' ? t('Als neues Notebook importieren') : t('Sicherung zusammenführen')}</button>{incomingArchiveId.current && <button className="button subtle wide" disabled={busy} onClick={() => void discardIncomingArchive()}>{t("Empfangene ZIP verwerfen")}</button>}</>}
        {archiveError && <div className="warning" role="alert">{archiveError}</div>}
      </div>}
      {dialog === 'add' && <div className="modal-body">
        <div className="tabs">
          <button className={addTab === 'url' ? 'active' : ''} disabled={busy} onClick={() => setAddTab('url')}>{t("Website / URL")}</button>
          <button className={addTab === 'file' ? 'active' : ''} disabled={busy} onClick={() => setAddTab('file')}>{t("Datei")}</button>
          <button className={addTab === 'text' ? 'active' : ''} disabled={busy} onClick={() => setAddTab('text')}>{t("Text")}</button>
          <button className={addTab === 'youtube' ? 'active' : ''} disabled={busy} onClick={() => setAddTab('youtube')}>{t("YouTube")}</button>
          <button className={addTab === 'search' ? 'active' : ''} disabled={busy} onClick={() => setAddTab('search')}>{t("Websuche")}</button>
        </div>
        {addTab === 'url' && <><p className="helper">{t("Eine oder mehrere URLs eingeben. Jede URL wird als eigene Quelle gespeichert.")}</p><textarea rows={5} placeholder={'https://example.com/artikel\nhttps://example.org/guide'} value={urlInput} onChange={event => setUrlInput(event.target.value)} /><div className="modal-actions">{Boolean(globalThis.chrome?.runtime?.sendMessage) && <button className="button subtle" onClick={handleCurrentTab} disabled={busy}>{t("Vorherigen Tab übernehmen")}</button>}<button className="button primary" onClick={handleUrls} disabled={busy || !urlInput.trim()}>{busy ? t('Lese Quellen …') : t('URLs hinzufügen')}</button></div></>}
        {addTab === 'file' && <><p className="helper">{t("TXT, Markdown, HTML, PDF, DOCX, EPUB, CSV sowie Untertiteldateien (VTT/SRT) werden lokal verarbeitet.")}</p><input ref={fileInput} type="file" accept=".txt,.md,.markdown,.html,.htm,.pdf,.docx,.epub,.csv,.vtt,.srt" multiple onChange={event => void handleFiles(event.target.files)} /><button className="button primary wide" disabled={busy} onClick={() => fileInput.current?.click()}>{busy ? t('Verarbeite Dateien …') : t('Dateien auswählen')}</button></>}
        {addTab === 'text' && <><label>{t("TITEL")}<input placeholder={t("Titel deiner Quelle")} value={textTitle} onChange={event => setTextTitle(event.target.value)} /></label><label>{t("INHALT")}<textarea rows={7} placeholder={t("Text hier einfügen …")} value={textInput} onChange={event => setTextInput(event.target.value)} /></label><button className="button primary wide" onClick={() => void handleText()}>{t("Text hinzufügen")}</button></>}
        {addTab === 'youtube' && <>
          <label>{t("VIDEO-URLS (EINE PRO ZEILE)")}<textarea rows={5} placeholder={'https://www.youtube.com/watch?v=…\nhttps://youtu.be/…'} value={urlInput} disabled={busy} onChange={event => { setUrlInput(event.target.value); setYoutubeBatchErrors([]); }} /></label>
          <p className="helper">{t("Du kannst mehrere Video-Links einfügen. Sie werden nacheinander geladen; doppelte und bereits vorhandene Videos werden übersprungen. Maximal 100 unterschiedliche Videos pro Durchlauf.")}</p>
          {youtubeBatchProgress && <p className="helper" role="status">{youtubeBatchProgress}</p>}
          {youtubeBatchErrors.length > 0 && <div className="warning" role="alert"><strong>{youtubeBatchErrors.length}{t(" Link(s) nicht geladen; sie bleiben oben für einen erneuten Versuch:")}</strong>{youtubeBatchErrors.slice(0, 10).map((item, index) => <div key={`${item.url}-${index}`}>{item.url}: {item.message}{isYouTubeVideoUrl(item.url) && <div><a href={item.url} target="_blank" rel="noreferrer">{t("Video im Browser öffnen ↗")}</a></div>}</div>)}{youtubeBatchErrors.length > 10 && <div>{t("… und ")}{youtubeBatchErrors.length - 10}{t(" weitere.")}</div>}</div>}
          {isNative && <><p className="helper">{t("Direkt auf diesem Android-Gerät mit yt-dlp laden – ohne API-Schlüssel. Neue YouTube-Transkripte enthalten keine Zeitstempel. YouTube kann Abrufe je nach Netzwerk oder VPN blockieren; ein Browserbesuch kann helfen, seine Anmeldung wird aber nicht automatisch an Contexter übertragen.")}</p><label>{t("UNTERTITELSPRACHE")}<select value={subtitleLanguage} disabled={busy} onChange={event => setSubtitleLanguage(event.target.value as 'original' | 'de' | 'en')}><option value="original">{t("Originalsprache (falls erkennbar)")}</option><option value="de">{t("Deutsch")}</option><option value="en">{t("Englisch")}</option></select></label><button className="button primary wide" disabled={busy || !urlInput.trim()} onClick={() => void handleYouTube('local')}>{busy ? t('Lade Untertitel …') : t('Untertitel ohne API-Schlüssel laden')}</button><div className="backup-section"><h3>{t("Optional: YouTube-Cookies")}</h3><p>{t("Wenn YouTube den Abruf als Bot blockiert, kannst du eine selbst exportierte Netscape-Cookie-Datei auswählen. Contexter übernimmt daraus nur YouTube-Einträge. Cookies sind sensible Anmeldedaten: Die Auswahl bleibt nur für diese App-Sitzung im Speicher und wird nicht gesichert. Während des Abrufs liegt eine temporäre Datei im privaten App-Cache; sie wird danach oder spätestens beim nächsten App-Start gelöscht. Ein Erfolg ist nicht garantiert; die App kann Cookies aus anderen Android-Browsern nicht direkt lesen und bietet keine eingebettete Google-Anmeldung.")}</p><input type="file" accept=".txt,text/plain" disabled={busy} aria-label={t("YouTube-Cookie-Datei auswählen")} onChange={event => { void handleCookieFile(event.target.files?.[0]); event.target.value = ''; }} />{youtubeCookies && <div className="modal-actions"><span className="helper">{t("YouTube-Cookies für diese Sitzung geladen.")}</span><button className="button subtle" disabled={busy} onClick={() => { setYoutubeCookies(''); setNotice(t('YouTube-Cookies aus der App-Sitzung entfernt.')); }}>{t("Cookies vergessen")}</button></div>}</div></>}
          {!isNative && <p className="helper">{t("Im Browser kannst du Untertiteldateien (VTT/SRT) ohne Schlüssel im Tab „Datei“ importieren. Der direkte yt-dlp-Abruf ist nur in der Android-App möglich.")}</p>}
          <div className="backup-section"><h3>{t("Optional: Supadata")}</h3><p>{t("Nur wenn du den folgenden Schlüssel eingibst und „Über Supadata laden“ wählst, wird der Link an diesen externen Dienst übertragen. Abrufe können Kosten verursachen. Der Schlüssel bleibt nur im Arbeitsspeicher.")}</p>
          <label>{t("SUPADATA API-SCHLÜSSEL")}<input type="password" autoComplete="off" value={supadataKey} onChange={event => setSupadataKey(event.target.value)} /></label>
          <button className="button subtle wide" disabled={busy || !urlInput.trim() || !supadataKey.trim()} onClick={() => void handleYouTube('supadata')}>{t("Über Supadata laden")}</button></div>
          <div className="backup-section"><h3>{t("Kanal oder Playlist")}</h3><p>{t("Die Liste und deine Auswahl bleiben lokal gespeichert. Bereits importierte Videos werden vor kostenpflichtigen Abrufen übersprungen.")}</p>
            <label>{t("KANAL- ODER PLAYLIST-URL")}<input placeholder={t("https://www.youtube.com/playlist?list=…")} value={catalogUrl} onChange={event => setCatalogUrl(event.target.value)} /></label>
            <label>{t("MAXIMAL ANZEIGEN (1–5000)")}<input type="number" min={1} max={5000} value={catalogLimit} onChange={event => setCatalogLimit(Math.max(1, Math.min(5000, Number(event.target.value) || 1)))} /></label>
            <label>{t("KANAL-TYP")}<select value={catalogType} onChange={event => setCatalogType(event.target.value as 'video' | 'short' | 'live')}><option value="video">{t("Normale Videos")}</option><option value="short">{t("Shorts")}</option><option value="live">{t("Live-Videos")}</option></select></label>
            <button className="button subtle wide" disabled={busy || !catalogUrl.trim() || !supadataKey.trim()} onClick={() => void loadCatalog()}>{t("Video-Liste laden")}</button>
            {catalogIds.length > 0 && <div className="catalog-list"><p className="helper">{catalogIds.length}{t(" Video-IDs gefunden")}{catalogIds.length >= catalogLimit ? t('; das gewählte Limit ist erreicht, weitere Videos sind möglich') : ''}.</p><div className="modal-actions"><button className="button subtle" onClick={() => setSelectedCatalogIds(catalogIds)}>{t("Alle auswählen")}</button><button className="button subtle" onClick={() => setSelectedCatalogIds([])}>{t("Auswahl aufheben")}</button></div>{catalogIds.slice(0, visibleCatalogCount).map(id => <label key={id}><input type="checkbox" checked={selectedCatalogIds.includes(id)} onChange={event => setSelectedCatalogIds(current => event.target.checked ? [...current, id] : current.filter(item => item !== id))} /><span>{t("youtube.com/watch?v=")}{id}</span></label>)}{catalogIds.length > visibleCatalogCount && <button className="button subtle wide" onClick={() => setVisibleCatalogCount(count => count + 100)}>{t("Weitere 100 anzeigen")}</button>}<button className="button primary wide" disabled={busy || !selectedCatalogIds.length || !supadataKey.trim()} onClick={() => void importCatalogSelection()}>{selectedCatalogIds.length}{t(" ausgewählte Videos importieren")}</button></div>}
          </div>
        </>}
        {addTab === 'search' && <><p className="helper">{t("Optionaler externer Dienst: Erst mit Klick auf „Suchen“ wird deine Anfrage an Brave Search gesendet. Kosten können entstehen. Ergebnisse werden erst durch deinen Klick importiert. Der Schlüssel bleibt nur im Arbeitsspeicher.")}</p><label>{t("SUCHBEGRIFF")}<input placeholder={t("Wonach suchst du?")} value={discoveryQuery} onChange={event => setDiscoveryQuery(event.target.value)} /></label><label>{t("BRAVE SEARCH API-SCHLÜSSEL")}<input type="password" autoComplete="off" value={braveKey} onChange={event => setBraveKey(event.target.value)} /></label><button className="button primary wide" disabled={busy || !discoveryQuery.trim() || !braveKey.trim()} onClick={() => void handleSearch()}>{busy ? t('Suche …') : t('Suchen')}</button><div className="discovery-results">{searchResults.map(result => <div className="discovery-result" key={result.url}><strong>{result.title}</strong><small>{result.url}</small><p>{result.description}</p><button className="button subtle" disabled={busy} onClick={() => void importSearchResult(result)}>{t("Importieren")}</button></div>)}</div></>}
      </div>}
      {dialog === 'export' && <div className="modal-body"><p className="helper">{activeSources.length}{t(" aktive Quellen · ungefähr ")}{new Intl.NumberFormat('de-DE').format(tokenCount)}{t(" Tokens. Deaktivierte Quellen bleiben außerhalb des Exports.")}</p><div className="export-options"><button onClick={() => void exportAs('md')}><span>▤</span><strong>{t("Eine Markdown-Datei")}</strong><small>{t("Alle Quellen mit Herkunft und YAML-Manifest")}</small></button><button onClick={() => void exportAs('txt')}><span>≡</span><strong>{t("Eine Textdatei")}</strong><small>{t("Lesbarer Text mit Quellenangaben")}</small></button><button onClick={() => void exportAs('zip')}><span>▣</span><strong>{t("ZIP mit Einzeldateien")}</strong><small>{t("OKF-orientiertes Markdown-Bundle")}</small></button><button onClick={() => void exportAs('copy')}><span>⧉</span><strong>{t("In Zwischenablage kopieren")}</strong><small>{t("Markdown direkt weiterverwenden")}</small></button></div><div className="backup-section"><h3>{t("Bibliothek sichern und abgleichen")}</h3><p>{t("Alle Notebooks und Quellen als ZIP sichern. Auf einem anderen Gerät kannst du die Datei zusammenführen; abweichende Versionen bleiben als Konfliktkopien erhalten.")}</p><input ref={backupInput} type="file" accept=".zip,.json" aria-label={t("Sicherung auswählen")} onChange={event => void restoreBackup(event.target.files?.[0])} /><div className="modal-actions"><button className="button subtle" onClick={() => { restoreMode.current = 'merge'; backupInput.current?.click(); }}>{t("Zusammenführen")}</button><button className="button danger" onClick={() => { restoreMode.current = 'replace'; backupInput.current?.click(); }}>{t("Ersetzen")}</button><button className="button primary" onClick={() => void saveBackup()}>{t("Sicherung speichern / teilen")}</button></div></div></div>}
    </section></div>}
    {draggedNotebookId && dragPosition && <div className="notebook-drag-ghost" style={{ left: dragPosition.x + 12, top: dragPosition.y + 12 }}>{library.notebooks.find(item => item.id === draggedNotebookId)?.title}</div>}
    {notice && <div className="toast" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label={t("Meldung schließen")}>×</button></div>}
  </div>;
}
