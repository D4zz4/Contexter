import { describe, expect, it } from 'vitest';
import { createSource } from './model';
import { parseEditedSourceMarkdown } from './notebook-folder';
import { sourceMarkdown } from './export';

describe('external notebook source edits', () => {
  it('imports edited Markdown body while preserving source metadata', () => {
    const source = createSource({ notebookId: 'n1', kind: 'web', title: 'A title', originalUrl: 'https://example.test', body: 'Original body' });
    const edited = sourceMarkdown(source).replace('Original body', 'Edited body\n\nA second paragraph.');
    const imported = parseEditedSourceMarkdown(source, edited);
    expect(imported?.body).toBe('Edited body\n\nA second paragraph.');
    expect(imported?.originalUrl).toBe(source.originalUrl);
    expect(imported?.editedByUser).toBe(true);
  });

  it('imports an updated YAML title and rejects malformed or unrelated Markdown', () => {
    const source = createSource({ notebookId: 'n1', kind: 'text', title: 'Before', body: 'Text' });
    const updated = sourceMarkdown(source).replace('title: Before', 'title: After').replace('Text', 'Changed');
    expect(parseEditedSourceMarkdown(source, updated)?.title).toBe('After');
    expect(parseEditedSourceMarkdown(source, '# no Contexter metadata')).toBeUndefined();
    expect(parseEditedSourceMarkdown(source, sourceMarkdown({ ...source, id: 'another-id' }))).toBeUndefined();
  });
});
