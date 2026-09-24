import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import YAML from 'yaml';
import { bundleMarkdown, bundleText, bundleZip, markdownToText, sourceMarkdown } from './export';
import { createSource, findDuplicate, sourceIdentity, type Library } from './model';

const notebook = { id: 'n-1', title: 'Recherche: Geräte', createdAt: '2026-09-24T12:00:00Z' };
const source = createSource({
  notebookId: notebook.id, kind: 'web', title: 'Artikel: „Daten“',
  originalUrl: 'https://example.com/a?x=1',
  body: '# Thema\n\n[Handbuch](https://example.com/manual)\n\n```js\nconst x = 42;\n```',
});

describe('portable exports', () => {
  it('keeps source provenance outside of the body', () => {
    const markdown = sourceMarkdown(source);
    const end = markdown.indexOf('\n---\n', 4);
    const frontmatter = YAML.parse(markdown.slice(4, end));
    expect(frontmatter.type).toBe('Reference');
    expect(frontmatter.title).toBe(source.title);
    expect(frontmatter.sources[0].resource).toBe(source.originalUrl);
    expect(markdown.slice(end)).toContain('const x = 42;');
  });

  it('exports a manifest plus distinct, traceable source sections', () => {
    const second = createSource({ notebookId: notebook.id, kind: 'text', title: 'Eigene Notiz', body: 'Zweiter Inhalt' });
    const markdown = bundleMarkdown(notebook, [source, second]);
    const end = markdown.indexOf('\n---\n', 4);
    const manifest = YAML.parse(markdown.slice(4, end));
    expect(manifest.source_count).toBe(2);
    expect(manifest.sources.map((item: { id: string }) => item.id)).toEqual([source.id, second.id]);
    expect(markdown).toContain(`cb:source-start ${second.id}`);
    expect(markdown).toContain('Zweiter Inhalt');
  });

  it('converts Markdown syntax to actual plain text', () => {
    expect(markdownToText(source.body)).not.toContain('```');
    expect(markdownToText(source.body)).toContain('Handbuch (https://example.com/manual)');
    expect(bundleText(notebook, [source])).toContain('ORIGINAL: https://example.com/a?x=1');
  });

  it('packages individual source files with an OKF root index', async () => {
    const zip = await JSZip.loadAsync(await bundleZip(notebook, [source]));
    const index = await zip.file('contexter/index.md')?.async('string');
    const article = await zip.file(`contexter/sources/${source.id}.md`)?.async('string');
    expect(index).toContain('okf_version: "0.2"');
    expect(index).toContain(`sources/${source.id}.md`);
    expect(article).toContain('https://example.com/a?x=1');
  });
});

describe('duplicate identity', () => {
  it('recognizes YouTube URL variants and strips only known trackers', () => {
    expect(sourceIdentity({ kind: 'youtube', originalUrl: 'https://youtu.be/abc123', body: '' }))
      .toBe(sourceIdentity({ kind: 'youtube', originalUrl: 'https://www.youtube.com/watch?v=abc123&utm_source=x', body: '' }));
    expect(sourceIdentity({ kind: 'web', originalUrl: 'https://example.com/a?token=one', body: '' }))
      .not.toBe(sourceIdentity({ kind: 'web', originalUrl: 'https://example.com/a?token=two', body: '' }));
    const library: Library = { schemaVersion: 1, notebooks: [notebook], sources: [source] };
    expect(findDuplicate(library, createSource({ notebookId: notebook.id, kind: 'web', title: 'Anderer Titel', originalUrl: 'https://example.com/a?x=1&utm_medium=email', body: 'Anderer Body' }))?.id).toBe(source.id);
  });
});
