import { describe, expect, it } from 'vitest';
import { createSource, emptyLibrary, INBOX_ID, reorderNotebook, restoreNotebook, trashNotebook } from './model';

describe('notebook lifecycle', () => {
  it('moves a notebook with its sources to trash and restores both', () => {
    const library = emptyLibrary();
    library.notebooks.push({ id: 'a', title: 'A', createdAt: '2026-01-01' });
    library.sources.push(createSource({ notebookId: 'a', kind: 'text', title: 'Quelle', body: 'Text' }));
    expect(trashNotebook(library, INBOX_ID)).toBe(library);
    const trashed = trashNotebook(library, 'a', '2026-01-02');
    expect(trashed.notebooks[1].deletedAt).toBe('2026-01-02');
    expect(trashed.sources).toEqual(library.sources);
    const restored = restoreNotebook(trashed, 'a');
    expect(restored.notebooks[1].deletedAt).toBeUndefined();
    expect(restored.sources).toEqual(library.sources);
  });

  it('reorders visible notebooks while leaving Inbox and hidden notebooks in place', () => {
    const library = emptyLibrary();
    library.notebooks.push(
      { id: 'a', title: 'A', createdAt: '' },
      { id: 'hidden', title: 'Hidden', createdAt: '', archived: true },
      { id: 'b', title: 'B', createdAt: '' },
      { id: 'c', title: 'C', createdAt: '' },
    );
    expect(reorderNotebook(library, 'c', 'a').notebooks.map(item => item.id)).toEqual(['inbox', 'c', 'hidden', 'a', 'b']);
    expect(reorderNotebook(library, 'c', INBOX_ID)).toBe(library);
    expect(reorderNotebook(library, 'hidden', 'a')).toBe(library);
  });
});
