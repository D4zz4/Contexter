import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { backupLibrary, importLibraryAsNotebook, mergeLibraries, parseLibraryBackup } from './backup';
import { createSource, emptyLibrary, trashNotebook } from './model';

describe('library backup', () => {
  it('roundtrips the full library without dropping edited content', async () => {
    const library = emptyLibrary();
    library.sources.push(createSource({ notebookId: 'inbox', kind: 'text', title: 'Private Notiz', body: 'Eigener Inhalt', editedByUser: true }));
    const archive = await JSZip.loadAsync(await backupLibrary(library));
    const json = await archive.file('contexter-library.json')?.async('string');
    expect(json).toBeTruthy();
    expect(parseLibraryBackup(json!)).toEqual(library);
    expect(await archive.file(`notebooks/inbox/sources/${library.sources[0].id}.md`)?.async('string')).toContain('Eigener Inhalt');
  });

  it('retains deleted notebooks and their sources in the backup', async () => {
    const library = emptyLibrary();
    library.notebooks.push({ id: 'notes', title: 'Notizen', createdAt: '2026-09-24' });
    library.sources.push(createSource({ notebookId: 'notes', kind: 'text', title: 'Quelle', body: 'Bleibt erhalten' }));
    const deleted = trashNotebook(library, 'notes', '2026-09-24T01:00:00Z');
    const archive = await JSZip.loadAsync(await backupLibrary(deleted));
    const json = await archive.file('contexter-library.json')!.async('string');
    expect(parseLibraryBackup(json)).toEqual(deleted);
    expect(await archive.file('notebooks/notes/index.md')!.async('string')).toContain('Notebook im Papierkorb');
  });

  it('rejects a source pointing at an absent notebook', () => {
    const library = emptyLibrary();
    library.sources.push(createSource({ notebookId: 'missing', kind: 'text', title: 'Notiz', body: 'Text' }));
    expect(() => parseLibraryBackup(JSON.stringify({ format: 'contexter-backup', library }))).toThrow('ohne Notebook');
  });

  it('rejects unrelated JSON', () => {
    expect(() => parseLibraryBackup('{}')).toThrow('kein Contexter-Backup');
  });

  it('rejects archive path characters in backup IDs', () => {
    const library = emptyLibrary();
    library.notebooks.push({ id: '../outside', title: 'Unsafe', createdAt: new Date().toISOString() });
    expect(() => parseLibraryBackup(JSON.stringify({ format: 'contexter-backup', library }))).toThrow('unvollständige Daten');
  });

  it('preserves both versions when two devices edit the same source', () => {
    const first = emptyLibrary();
    first.sources.push(createSource({ notebookId: 'inbox', kind: 'text', title: 'Entwurf', body: 'Version A' }));
    const second = structuredClone(first);
    second.sources[0].body = 'Version B';
    const merged = mergeLibraries(first, second);
    expect(merged.added).toBe(1);
    expect(merged.conflicts).toBe(1);
    expect(merged.library.sources.map(item => item.body)).toEqual(['Version A', 'Version B']);
    expect(new Set(merged.library.sources.map(item => item.id)).size).toBe(2);
    expect(mergeLibraries(merged.library, second).added).toBe(0);
  });

  it('does not create a new notebook or source when the same conflicting backup is merged twice', () => {
    const local = emptyLibrary();
    local.notebooks.push({ id: 'shared-id', title: 'Umbenannt', createdAt: '2026-09-24T00:00:00Z' });
    const incoming = emptyLibrary();
    incoming.notebooks.push({ id: 'shared-id', title: 'Original', createdAt: '2026-09-24T00:00:00Z' });
    incoming.sources.push(createSource({ notebookId: 'shared-id', kind: 'text', title: 'Notiz', body: 'Inhalt' }));
    const once = mergeLibraries(local, incoming);
    const twice = mergeLibraries(once.library, incoming);
    expect(once.library.notebooks).toHaveLength(3);
    expect(once.added).toBe(1);
    expect(twice.added).toBe(0);
    expect(twice.library.notebooks).toHaveLength(3);
    expect(twice.library.sources).toHaveLength(1);
  });

  it('imports active sources from all backup notebooks into a separate new notebook', () => {
    const local = emptyLibrary();
    local.sources.push(createSource({ notebookId: 'inbox', kind: 'text', title: 'Vorhanden', body: 'Lokal' }));
    const incoming = emptyLibrary();
    incoming.notebooks.push({ id: 'other', title: 'Anderes Notebook', createdAt: '2026-09-24' });
    incoming.sources.push(createSource({ notebookId: 'inbox', kind: 'text', title: 'Inbox-Quelle', body: 'A' }));
    incoming.sources.push(createSource({ notebookId: 'other', kind: 'text', title: 'Notebook-Quelle', body: 'B' }));
    incoming.sources.push({ ...createSource({ notebookId: 'other', kind: 'text', title: 'Im Papierkorb', body: 'C' }), deletedAt: '2026-09-24' });
    const result = importLibraryAsNotebook(local, incoming, 'Mein Import');
    expect(result.added).toBe(2);
    expect(local.notebooks).toHaveLength(1);
    expect(local.sources).toHaveLength(1);
    expect(result.library.notebooks.at(-1)).toMatchObject({ id: result.notebookId, title: 'Mein Import' });
    expect(result.library.sources.slice(1).map(source => source.title)).toEqual(['Inbox-Quelle', 'Notebook-Quelle']);
    expect(result.library.sources.slice(1).every(source => source.notebookId === result.notebookId)).toBe(true);
    expect(new Set(result.library.sources.map(source => source.id)).size).toBe(3);
  });
});
