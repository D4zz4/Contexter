import JSZip from 'jszip';
import YAML from 'yaml';
import { marked } from 'marked';
import type { Notebook, Source } from './model';
import { Capacitor } from '@capacitor/core';

function metadata(source: Source) {
  return {
    type: 'Reference',
    title: source.title,
    ...(source.originalUrl ? { resource: source.originalUrl, sources: [{ id: 'original', resource: source.originalUrl, title: source.title }] } : {}),
    generated: { by: 'contexter/0.9.0-test.2', at: source.extractedAt || source.importedAt },
    cb_schema: 1,
    cb_id: source.id,
    cb_kind: source.kind,
    cb_imported_at: source.importedAt,
    ...(source.originalFilename ? { cb_original_filename: source.originalFilename } : {}),
    ...(source.author ? { cb_author: source.author } : {}),
    ...(source.publishedAt ? { cb_published_date: source.publishedAt } : {}),
    ...(source.language ? { cb_language: source.language } : {}),
    cb_edited_by_user: source.editedByUser,
    ...(source.conflictOf ? { cb_conflict_of: source.conflictOf } : {}),
    ...(source.warnings.length ? { cb_warnings: source.warnings } : {}),
  };
}

export function sourceMarkdown(source: Source): string {
  return `---\n${YAML.stringify(metadata(source)).trimEnd()}\n---\n\n${source.body.trim()}\n`;
}

export function bundleMarkdown(notebook: Notebook, sources: Source[]): string {
  const manifest = {
    type: 'context_bundle',
    title: notebook.title,
    cb_schema: 1,
    source_count: sources.length,
    sources: sources.map(source => ({
      id: source.id,
      title: source.title,
      type: source.kind,
      ...(source.originalUrl ? { url: source.originalUrl } : {}),
      ...(source.originalFilename ? { filename: source.originalFilename } : {}),
    })),
  };
  const sections = sources.map(source => [
    `<!-- cb:source-start ${source.id} -->`,
    `# Quelle: ${source.title}`,
    `ID: ${source.id}`,
    `Typ: ${source.kind}`,
    source.originalUrl ? `Original: ${source.originalUrl}` : source.originalFilename ? `Datei: ${source.originalFilename}` : 'Original: eingefügter Text',
    `Importiert: ${source.importedAt}`,
    source.warnings.length ? `Hinweise: ${source.warnings.join('; ')}` : '',
    '',
    source.body.trim(),
    `<!-- cb:source-end ${source.id} -->`,
  ].filter(Boolean).join('\n\n'));
  return `---\n${YAML.stringify(manifest).trimEnd()}\n---\n\n${sections.join('\n\n---\n\n')}\n`;
}

export function bundleText(notebook: Notebook, sources: Source[]): string {
  const manifest = {
    type: 'context_bundle', title: notebook.title, cb_schema: 1, source_count: sources.length,
    sources: sources.map(source => ({ id: source.id, title: source.title, type: source.kind, url: source.originalUrl || null })),
  };
  return `---\n${YAML.stringify(manifest).trimEnd()}\n---\n\n${sources.map(source => [
    `QUELLE: ${source.title}`,
    `ID: ${source.id}`,
    `TYP: ${source.kind}`,
    `ORIGINAL: ${source.originalUrl || source.originalFilename || 'eingefügter Text'}`,
    `IMPORTIERT: ${source.importedAt}`,
    '',
    markdownToText(source.body),
  ].join('\n')).join('\n\n==========\n\n')}\n`;
}

interface PlainToken {
  type: string;
  text?: string;
  href?: string;
  tokens?: PlainToken[];
  items?: PlainToken[];
  header?: Array<{ text: string }>;
  rows?: Array<Array<{ text: string }>>;
}

function inlineText(tokens: PlainToken[] | undefined, fallback = ''): string {
  if (!tokens) return fallback;
  return tokens.map(token => {
    if (token.type === 'link') return `${inlineText(token.tokens, token.text)} (${token.href || ''})`;
    if (token.type === 'image') return token.text || '';
    if (token.type === 'br') return '\n';
    return inlineText(token.tokens, token.text || '');
  }).join('');
}

export function markdownToText(markdown: string): string {
  const tokens = marked.lexer(markdown) as unknown as PlainToken[];
  const output: string[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case 'heading':
      case 'paragraph':
      case 'text':
        output.push(inlineText(token.tokens, token.text || ''));
        break;
      case 'code':
        output.push(token.text || '');
        break;
      case 'list':
        output.push((token.items || []).map((item, index) => `${index + 1}. ${inlineText(item.tokens, item.text || '').trim()}`).join('\n'));
        break;
      case 'table':
        output.push([...(token.header || []).map(cell => cell.text)].join('\t'));
        for (const row of token.rows || []) output.push(row.map(cell => cell.text).join('\t'));
        break;
      case 'blockquote':
        output.push(inlineText(token.tokens, token.text || ''));
        break;
      case 'hr':
        output.push('----------------');
        break;
      case 'html':
        output.push((token.text || '').replace(/<[^>]+>/g, ''));
        break;
    }
  }
  return output.filter(Boolean).join('\n\n').trim();
}

export async function bundleZip(notebook: Notebook, sources: Source[]): Promise<Blob> {
  const zip = new JSZip();
  const root = zip.folder('contexter')!;
  root.file('index.md', `---\nokf_version: "0.2"\n---\n\n# ${notebook.title}\n\n${sources.map(source => `- [${source.title.replaceAll(']', '\\]')}](sources/${source.id}.md)`).join('\n')}\n`);
  const folder = root.folder('sources')!;
  for (const source of sources) folder.file(`${source.id}.md`, sourceMarkdown(source));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function deliverFile(blob: Blob, filename: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) { download(blob, filename); return; }
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(blob);
  });
  const saved = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
  await Share.share({ title: filename, files: [saved.uri], dialogTitle: 'Contexter-Datei speichern oder teilen' });
}

export function safeFilename(name: string): string {
  return name.normalize('NFKD').replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'notebook';
}
