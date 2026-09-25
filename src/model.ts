export type SourceKind = 'web' | 'youtube' | 'subtitle' | 'text' | 'markdown' | 'html' | 'pdf' | 'docx' | 'epub' | 'csv';
export type SourceStatus = 'ready' | 'partial' | 'failed' | 'queued';

export interface Notebook {
  id: string;
  title: string;
  createdAt: string;
  archived?: boolean;
  conflictOf?: string;
  deletedAt?: string;
}

export interface Source {
  id: string;
  notebookId: string;
  kind: SourceKind;
  title: string;
  originalUrl?: string;
  originalFilename?: string;
  author?: string;
  publishedAt?: string;
  importedAt: string;
  extractedAt?: string;
  body: string;
  enabled: boolean;
  status: SourceStatus;
  warnings: string[];
  editedByUser: boolean;
  language?: string;
  provider?: string;
  conflictOf?: string;
  deletedAt?: string;
}

export interface Library {
  schemaVersion: 1;
  notebooks: Notebook[];
  sources: Source[];
}

export const INBOX_ID = 'inbox';

export function emptyLibrary(): Library {
  return {
    schemaVersion: 1,
    notebooks: [{ id: INBOX_ID, title: 'Inbox', createdAt: new Date().toISOString() }],
    sources: [],
  };
}

export function createNotebook(title: string): Notebook {
  return { id: crypto.randomUUID(), title: title.trim(), createdAt: new Date().toISOString() };
}

export function trashNotebook(library: Library, id: string, deletedAt = new Date().toISOString()): Library {
  if (id === INBOX_ID || !library.notebooks.some(item => item.id === id && !item.deletedAt)) return library;
  return { ...library, notebooks: library.notebooks.map(item => item.id === id ? { ...item, deletedAt } : item) };
}

export function restoreNotebook(library: Library, id: string): Library {
  if (id === INBOX_ID || !library.notebooks.some(item => item.id === id && item.deletedAt)) return library;
  return { ...library, notebooks: library.notebooks.map(item => item.id === id ? { ...item, deletedAt: undefined, archived: false } : item) };
}

export function emptyTrash(library: Library): Library {
  const deletedNotebooks = new Set(library.notebooks.filter(item => item.deletedAt).map(item => item.id));
  if (!deletedNotebooks.size && !library.sources.some(item => item.deletedAt)) return library;
  return {
    ...library,
    notebooks: library.notebooks.filter(item => !item.deletedAt),
    sources: library.sources.filter(item => !item.deletedAt && !deletedNotebooks.has(item.notebookId)),
  };
}

export function reorderNotebook(library: Library, fromId: string, beforeId: string): Library {
  if (fromId === INBOX_ID || beforeId === INBOX_ID || fromId === beforeId) return library;
  const visible = library.notebooks.filter(item => item.id !== INBOX_ID && !item.deletedAt && !item.archived);
  const from = visible.findIndex(item => item.id === fromId);
  const to = visible.findIndex(item => item.id === beforeId);
  if (from < 0 || to < 0) return library;
  const [moving] = visible.splice(from, 1);
  visible.splice(to, 0, moving);
  let index = 0;
  return { ...library, notebooks: library.notebooks.map(item => item.id !== INBOX_ID && !item.deletedAt && !item.archived ? visible[index++] : item) };
}

export function createSource(input: Pick<Source, 'notebookId' | 'kind' | 'title' | 'body'> & Partial<Source>): Source {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    notebookId: input.notebookId,
    kind: input.kind,
    title: input.title.trim() || 'Unbenannte Quelle',
    body: input.body,
    originalUrl: input.originalUrl,
    originalFilename: input.originalFilename,
    author: input.author,
    publishedAt: input.publishedAt,
    importedAt: input.importedAt || now,
    extractedAt: input.extractedAt || now,
    enabled: input.enabled ?? true,
    status: input.status || 'ready',
    warnings: input.warnings || [],
    editedByUser: input.editedByUser ?? false,
    language: input.language,
    provider: input.provider,
    conflictOf: input.conflictOf,
    deletedAt: input.deletedAt,
  };
}

export function sourceIdentity(source: Pick<Source, 'kind' | 'originalUrl' | 'originalFilename' | 'body'>): string {
  if (source.originalUrl) {
    try {
      const url = new URL(source.originalUrl);
      if (/(^|\.)youtu(be\.com|\.be)$/.test(url.hostname)) {
        const id = url.hostname === 'youtu.be' ? url.pathname.slice(1) : url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/live/') ? url.pathname.split('/')[2] : url.searchParams.get('v');
        if (id) return `youtube:${id}`;
      }
      url.hash = '';
      url.hostname = url.hostname.toLowerCase();
      for (const key of [...url.searchParams.keys()]) {
        if (/^(utm_.+|fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
      }
      return `url:${url.toString()}`;
    } catch { /* use body below */ }
  }
  return `${source.kind}:${source.originalFilename || ''}:${source.body.trim()}`;
}

export function findDuplicate(library: Library, candidate: Source): Source | undefined {
  const identity = sourceIdentity(candidate);
  return library.sources.find(source => !source.deletedAt && source.notebookId === candidate.notebookId && sourceIdentity(source) === identity);
}

export function metrics(body: string) {
  const characters = Array.from(body).length;
  const words = body.trim() ? body.trim().split(/\s+/u).length : 0;
  return { characters, words, tokens: Math.ceil(characters / 4) };
}
