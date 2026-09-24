export type SourceKind = 'web' | 'youtube' | 'text' | 'markdown' | 'html' | 'pdf' | 'docx' | 'epub' | 'csv';
export type SourceStatus = 'ready' | 'partial' | 'failed' | 'queued';

export interface Notebook {
  id: string;
  title: string;
  createdAt: string;
  archived?: boolean;
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
  };
}

export function sourceIdentity(source: Pick<Source, 'kind' | 'originalUrl' | 'originalFilename' | 'body'>): string {
  if (source.originalUrl) {
    try {
      const url = new URL(source.originalUrl);
      if (/(^|\.)youtu(be\.com|\.be)$/.test(url.hostname)) {
        const id = url.hostname === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v');
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
  return library.sources.find(source => source.notebookId === candidate.notebookId && sourceIdentity(source) === identity);
}

export function metrics(body: string) {
  const characters = Array.from(body).length;
  const words = body.trim() ? body.trim().split(/\s+/u).length : 0;
  return { characters, words, tokens: Math.ceil(characters / 4) };
}
