import JSZip from 'jszip';
import type { Library, Source } from './model';
import { sourceIdentity } from './model';
import { sourceMarkdown } from './export';

const MAX_BACKUP_BYTES = 100 * 1024 * 1024;
const validId = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);

export async function backupLibrary(library: Library): Promise<Blob> {
  const archive = new JSZip();
  archive.file('contexter-library.json', JSON.stringify({ format: 'contexter-backup', exportedAt: new Date().toISOString(), library }, null, 2));
  archive.file('README.md', '# Contexter-Sicherung\n\n`contexter-library.json` ist der vollständige Wiederherstellungsstand. Die Markdown-Dateien sind lesbare Kopien aller Quellen, auch der gelöschten. Änderungen an diesen Kopien werden beim Wiederherstellen nicht übernommen.\n');
  for (const notebook of library.notebooks) {
    const path = `notebooks/${notebook.id}`;
    const sources = library.sources.filter(source => source.notebookId === notebook.id);
    archive.file(`${path}/index.md`, `# ${notebook.title}\n\n${notebook.archived ? '> Archiviertes Notebook\n\n' : ''}${sources.map(source => `- [${source.title.replaceAll(']', '\\]')}](sources/${source.id}.md)${source.deletedAt ? ' · im Papierkorb' : ''}`).join('\n')}\n`);
    for (const source of sources) archive.file(`${path}/sources/${source.id}.md`, sourceMarkdown(source));
  }
  return archive.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

function validSource(value: unknown): value is Source {
  if (!value || typeof value !== 'object') return false;
  const source = value as Record<string, unknown>;
  return validId(source.id) && validId(source.notebookId) &&
    ['web', 'youtube', 'subtitle', 'text', 'markdown', 'html', 'pdf', 'docx', 'epub', 'csv'].includes(String(source.kind)) && typeof source.title === 'string' &&
    typeof source.body === 'string' && typeof source.importedAt === 'string' &&
    typeof source.enabled === 'boolean' && ['ready', 'partial', 'failed', 'queued'].includes(String(source.status)) &&
    Array.isArray(source.warnings) && source.warnings.every(item => typeof item === 'string') &&
    typeof source.editedByUser === 'boolean' &&
    (source.originalUrl === undefined || typeof source.originalUrl === 'string' && /^https?:\/\//i.test(source.originalUrl)) &&
    (source.deletedAt === undefined || typeof source.deletedAt === 'string') &&
    (source.conflictOf === undefined || validId(source.conflictOf));
}

export function parseLibraryBackup(contents: string): Library {
  const parsed: unknown = JSON.parse(contents);
  if (!parsed || typeof parsed !== 'object') throw new Error('Die Sicherung ist kein Contexter-Backup.');
  const envelope = parsed as Record<string, unknown>;
  if (envelope.format !== 'contexter-backup') throw new Error('Die Sicherung ist kein Contexter-Backup.');
  const library = envelope.library as Library;
  if (!library || library.schemaVersion !== 1 || !Array.isArray(library.notebooks) || !Array.isArray(library.sources)) {
    throw new Error('Unbekannte Version der Contexter-Sicherung.');
  }
  if (!library.notebooks.every(notebook => notebook && validId(notebook.id) && typeof notebook.title === 'string' && typeof notebook.createdAt === 'string' && (notebook.conflictOf === undefined || validId(notebook.conflictOf))) ||
      !library.sources.every(validSource)) throw new Error('Die Sicherung enthält unvollständige Daten.');
  const ids = new Set(library.notebooks.map(notebook => notebook.id));
  if (!ids.has('inbox') || library.sources.some(source => !ids.has(source.notebookId))) throw new Error('Die Sicherung enthält Quellen ohne Notebook.');
  if (new Set(library.notebooks.map(notebook => notebook.id)).size !== library.notebooks.length ||
      new Set(library.sources.map(source => source.id)).size !== library.sources.length) throw new Error('Die Sicherung enthält doppelte IDs.');
  return library;
}

export async function readLibraryBackup(file: File): Promise<Library> {
  if (file.size > MAX_BACKUP_BYTES) throw new Error('Sicherung ist größer als 100 MiB.');
  if (file.name.toLowerCase().endsWith('.json')) return parseLibraryBackup(await file.text());
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  if (Object.keys(zip.files).length > 20_000) throw new Error('Sicherung enthält zu viele Dateien.');
  const entry = zip.file('contexter-library.json');
  if (!entry) throw new Error('contexter-library.json fehlt in der Sicherung.');
  const contents = await entry.async('string');
  if (contents.length > MAX_BACKUP_BYTES) throw new Error('Entpackte Sicherung ist größer als 100 MiB.');
  return parseLibraryBackup(contents);
}

export function mergeLibraries(local: Library, incoming: Library): { library: Library; added: number; conflicts: number } {
  const notebooks = [...local.notebooks];
  const notebookMap = new Map<string, string>();
  for (const candidate of incoming.notebooks) {
    const existing = notebooks.find(item => item.id === candidate.id);
    if (!existing) {
      notebooks.push(candidate);
      notebookMap.set(candidate.id, candidate.id);
    } else if (existing.title === candidate.title) notebookMap.set(candidate.id, candidate.id);
    else {
      const priorImport = notebooks.find(item => item.conflictOf === candidate.id);
      if (priorImport) notebookMap.set(candidate.id, priorImport.id);
      else {
        const id = crypto.randomUUID();
        notebooks.push({ ...candidate, id, conflictOf: candidate.id, title: `${candidate.title} (Import)` });
        notebookMap.set(candidate.id, id);
      }
    }
  }
  const sources = [...local.sources];
  let added = 0;
  let conflicts = 0;
  for (const candidate of incoming.sources) {
    const notebookId = notebookMap.get(candidate.notebookId)!;
    const matchingId = sources.find(source => source.id === candidate.id);
    if (matchingId && JSON.stringify(matchingId) === JSON.stringify({ ...candidate, notebookId })) continue;
    if (matchingId && sources.some(source => source.conflictOf === candidate.id && source.notebookId === notebookId && source.body === candidate.body)) continue;
    const matchingContent = sources.find(source => source.notebookId === notebookId && sourceIdentity(source) === sourceIdentity(candidate) && source.body === candidate.body);
    if (!matchingId && matchingContent) continue;
    const collision = matchingId || sources.some(source => source.notebookId === notebookId && sourceIdentity(source) === sourceIdentity(candidate));
    sources.push(collision ? { ...candidate, id: crypto.randomUUID(), notebookId, conflictOf: candidate.id, title: `${candidate.title} (Konfliktimport)`, warnings: [...candidate.warnings, 'Abweichende Version beim Zusammenführen der Sicherung erhalten.'] } : { ...candidate, notebookId });
    added++;
    if (collision) conflicts++;
  }
  return { library: { schemaVersion: 1, notebooks, sources }, added, conflicts };
}
