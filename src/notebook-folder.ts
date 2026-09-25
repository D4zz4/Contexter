import { Capacitor, registerPlugin } from '@capacitor/core';
import YAML from 'yaml';
import { notebookFolderFiles, sourceMarkdown } from './export';
import { loadFolderHandle, saveFolderHandle } from './storage';
import type { Library, Source } from './model';

interface StoredFile { path: string; content: string; }
interface FolderPlugin {
  chooseFolder(): Promise<{ name: string }>;
  getFolder(): Promise<{ name?: string }>;
  forgetFolder(): Promise<void>;
  listMarkdown(): Promise<{ files: StoredFile[] }>;
  writeMarkdown(options: { files: StoredFile[] }): Promise<void>;
}
const nativePlugin = registerPlugin<FolderPlugin>('NotebookFolder');
const native = Capacitor.isNativePlatform();
const BASELINE_KEY = 'contexter-folder-baselines-v1';

interface DirectoryHandle extends FileSystemDirectoryHandle {
  queryPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
}

export async function chooseNotebookFolder(): Promise<string> {
  if (native) {
    const name = (await nativePlugin.chooseFolder()).name;
    localStorage.removeItem(BASELINE_KEY);
    return name;
  }
  const picker = (window as Window & { showDirectoryPicker?: (options?: { mode: 'readwrite' }) => Promise<DirectoryHandle> }).showDirectoryPicker;
  if (!picker) throw new Error('Dein Browser unterstützt keine lokale Ordnerfreigabe. Bitte verwende die Android-App oder Chrome.');
  const handle = await picker({ mode: 'readwrite' });
  await saveFolderHandle(handle);
  localStorage.removeItem(BASELINE_KEY);
  return handle.name;
}

export async function notebookFolderName(): Promise<string | undefined> {
  if (native) return (await nativePlugin.getFolder()).name;
  return (await loadFolderHandle())?.name;
}

export async function disconnectNotebookFolder(): Promise<void> {
  if (native) await nativePlugin.forgetFolder();
  else await saveFolderHandle(undefined);
  localStorage.removeItem(BASELINE_KEY);
}

function safeSegment(value: string): string {
  let result = value.normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').replace(/\.{2,}/g, '.').replace(/^[. ]+|[. ]+$/g, '').slice(0, 70);
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(result)) result += ' Notebook';
  return result || 'Notebook';
}

function baselineMap(): Record<string, string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(BASELINE_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, string> : {};
  } catch { return {}; }
}

function storeBaselines(value: Record<string, string>) {
  try { localStorage.setItem(BASELINE_KEY, JSON.stringify(value)); } catch { /* A failed baseline save must not block notebook storage. */ }
}

async function hash(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), item => item.toString(16).padStart(2, '0')).join('');
}

async function browserFiles(): Promise<StoredFile[]> {
  const root = await loadFolderHandle() as DirectoryHandle | undefined;
  if (!root) return [];
  let permission = await root.queryPermission({ mode: 'readwrite' });
  if (permission !== 'granted') permission = await root.requestPermission({ mode: 'readwrite' });
  if (permission !== 'granted') throw new Error('Ordnerzugriff fehlt. Öffne die Einstellungen und verbinde den Ordner erneut.');
  const output: StoredFile[] = [];
  async function walk(dir: FileSystemDirectoryHandle, prefix: string) {
    for await (const [name, entry] of dir.entries()) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (entry.kind === 'directory') await walk(entry as FileSystemDirectoryHandle, path);
      else if (name.toLowerCase().endsWith('.md')) {
        const file = await (entry as FileSystemFileHandle).getFile();
        if (file.size <= 8 * 1024 * 1024) output.push({ path, content: await file.text() });
      }
    }
  }
  await walk(root, '');
  return output;
}

async function writeBrowserFiles(files: StoredFile[]) {
  const root = await loadFolderHandle() as DirectoryHandle | undefined;
  if (!root) return;
  for (const file of files) {
    const parts = file.path.split('/');
    let directory = root;
    for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part, { create: true }) as DirectoryHandle;
    const handle = await directory.getFileHandle(parts.at(-1)!, { create: true });
    const writer = await handle.createWritable();
    await writer.write(file.content);
    await writer.close();
  }
}

export function parseEditedSourceMarkdown(source: Source, markdown: string): Source | undefined {
  const match = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (!match) return undefined;
  let metadata: Record<string, unknown>;
  try {
    const parsed: unknown = YAML.parse(match[1]);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    metadata = parsed as Record<string, unknown>;
  }
  catch { return undefined; }
  if (metadata.cb_id !== source.id) return undefined;
  let body = markdown.slice(match[0].length).replace(/^\s*#\s+[^\r\n]+\s*(?:\r?\n|$)/, '');
  const origin = source.originalUrl ? `Original: ${source.originalUrl}` : source.originalFilename ? `Originaldatei: ${source.originalFilename}` : '';
  if (origin) body = body.replace(new RegExp(`^${origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?:\\r?\\n){2}`), '');
  const title = typeof metadata.title === 'string' && metadata.title.trim() ? metadata.title.trim() : source.title;
  body = body.trim();
  if (title === source.title && body === source.body.trim()) return source;
  return { ...source, title, body, editedByUser: true };
}

function conflictCopy(source: Source): Source {
  return {
    ...source,
    id: crypto.randomUUID(),
    title: `${source.title} (Contexter-Konflikt ${new Date().toLocaleString()})`,
    importedAt: new Date().toISOString(),
    conflictOf: source.id,
    editedByUser: true,
  };
}

interface SyncResult { library: Library; changed: string[]; conflicts: string[]; }

export async function syncNotebookFolder(library: Library): Promise<SyncResult> {
  const folderName = await notebookFolderName();
  if (!folderName) return { library, changed: [], conflicts: [] };
  const externalFiles = native ? (await nativePlugin.listMarkdown()).files : await browserFiles();
  const filesById = new Map<string, StoredFile[]>();
  for (const file of externalFiles) {
    const match = file.content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
    if (!match) continue;
    try {
      const parsed: unknown = YAML.parse(match[1]);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      const metadata = parsed as Record<string, unknown>;
      if (typeof metadata.cb_id === 'string') filesById.set(metadata.cb_id, [...(filesById.get(metadata.cb_id) || []), file]);
    } catch { /* Non-Contexter Markdown is left alone. */ }
  }

  let next = library;
  const changed: string[] = [];
  const conflicts: string[] = [];
  const protectedIds = new Set<string>();
  const baselines = baselineMap();
  const rewritten: StoredFile[] = [];
  const notebooks = library.notebooks.filter(book => book.id !== 'inbox' && !book.deletedAt);
  const usedFolderNames = new Set<string>();
  for (const notebook of notebooks) {
    const currentNotebook = next.notebooks.find(item => item.id === notebook.id) || notebook;
    const sources = next.sources.filter(source => source.notebookId === notebook.id && !source.deletedAt && source.status !== 'failed' && source.status !== 'queued');
    const exportFiles = notebookFolderFiles(currentNotebook, sources);
    const baseDirName = safeSegment(currentNotebook.title);
    let dirName = baseDirName;
    for (let copy = 2; usedFolderNames.has(dirName.toLocaleLowerCase()); copy++) dirName = `${baseDirName} (${copy})`;
    usedFolderNames.add(dirName.toLocaleLowerCase());
    rewritten.push(...exportFiles.map(file => ({ path: `${dirName}/${file.path}`, content: file.content })));
    for (const source of sources) {
      const key = `${notebook.id}:${source.id}`;
      const prior = baselines[key];
      const candidate = (filesById.get(source.id) || []).find(file => file.path.startsWith(`${dirName}/sources/`));
      const currentMarkdown = sourceMarkdown(source);
      if (candidate) {
        const onDiskHash = await hash(candidate.content);
        const appHash = await hash(currentMarkdown);
        if (!prior || onDiskHash !== prior) {
          const edited = parseEditedSourceMarkdown(source, candidate.content);
          if (!edited) {
            conflicts.push(source.title);
            protectedIds.add(source.id);
            continue;
          }
          if (prior && appHash !== prior && onDiskHash !== appHash) {
            next = { ...next, sources: [...next.sources, conflictCopy(source)] };
            conflicts.push(source.title);
            protectedIds.add(source.id);
          }
          if (edited !== source) {
            if (!prior) {
              next = { ...next, sources: [...next.sources, conflictCopy(source)] };
              conflicts.push(source.title);
              protectedIds.add(source.id);
            }
            next = { ...next, sources: next.sources.map(item => item.id === source.id ? edited : item) };
            changed.push(source.title);
            const newMarkdown = sourceMarkdown(edited);
            rewritten.push({ path: candidate.path, content: newMarkdown });
            baselines[key] = await hash(newMarkdown);
          } else {
            baselines[key] = onDiskHash;
          }
        } else {
          const assigned = exportFiles.find(item => item.path.startsWith('sources/') && item.content.includes(`cb_id: ${source.id}`));
          if (assigned) rewritten.push({ path: candidate.path, content: assigned.content });
          baselines[key] = await hash(candidate.content);
        }
      } else {
        const assigned = exportFiles.find(item => item.path.startsWith('sources/') && item.content.includes(`cb_id: ${source.id}`));
        if (assigned) baselines[key] = await hash(assigned.content);
      }
    }
  }
  // Do not replace a source file when it could not be parsed safely; all other mirrored files are refreshed.
  const safeWrites = rewritten.filter(file => {
    if (!file.path.includes('/sources/')) return true;
    const original = externalFiles.find(existing => existing.path === file.path);
    if (!original) return true;
    const match = original.content.match(/\bcb_id:\s*([^\r\n]+)/);
    if (!match) return false;
    return !protectedIds.has(match[1].trim());
  });
  if (native) await nativePlugin.writeMarkdown({ files: safeWrites });
  else await writeBrowserFiles(safeWrites);
  storeBaselines(baselines);
  return { library: next, changed, conflicts };
}
