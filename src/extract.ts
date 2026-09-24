import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import JSZip from 'jszip';
import * as pdfjs from 'pdfjs-dist';
import mammoth from 'mammoth';
import Papa from 'papaparse';
import type { SourceKind } from './model';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

export interface Extracted {
  title: string;
  body: string;
  author?: string;
  kind: SourceKind;
  warnings: string[];
}

function htmlToMarkdown(html: string, baseUrl?: string): Extracted {
  const document = new DOMParser().parseFromString(html, 'text/html');
  document.querySelectorAll('script, style, iframe, noscript, form, nav, footer, aside, [aria-hidden="true"]').forEach(element => element.remove());
  if (baseUrl) {
    document.querySelectorAll('a[href], img[src]').forEach(element => {
      const attribute = element.tagName === 'A' ? 'href' : 'src';
      const value = element.getAttribute(attribute);
      if (value) {
        try { element.setAttribute(attribute, new URL(value, baseUrl).toString()); } catch { /* leave original */ }
      }
    });
  }
  const article = new Readability(document.cloneNode(true) as Document).parse();
  const selectedHtml = article?.content || document.body.innerHTML;
  const converter = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
  converter.remove(['script', 'style', 'iframe', 'noscript', 'form']);
  const body = converter.turndown(selectedHtml).trim();
  if (!body) throw new Error('Auf dieser Seite wurde kein auslesbarer Text gefunden.');
  return {
    title: article?.title || document.title || baseUrl || 'Webseite',
    body,
    author: article?.byline || undefined,
    kind: 'web',
    warnings: article ? [] : ['Artikelerkennung nicht möglich. Bitte den übernommenen Seiteninhalt prüfen.'],
  };
}

export function extractHtml(html: string, url?: string): Extracted {
  return htmlToMarkdown(html, url);
}

export async function extractFile(file: File): Promise<Extracted> {
  const filename = file.name;
  const extension = filename.split('.').pop()?.toLowerCase();
  if (!['txt', 'md', 'markdown', 'html', 'htm', 'pdf', 'docx', 'epub', 'csv'].includes(extension || '')) {
    throw new Error(`Das Format .${extension || '?'} wird in dieser Entwicklungsstufe noch nicht unterstützt.`);
  }
  if (file.size > 25 * 1024 * 1024) throw new Error('Datei ist größer als das aktuelle Limit von 25 MiB.');
  if (extension === 'pdf') {
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const document = await task.promise;
    const pages: string[] = [];
    let emptyPages = 0;
    try {
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        const parts = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '');
        const text = parts.join('').replace(/[ \t]+\n/g, '\n').trim();
        if (!text) emptyPages++;
        pages.push(`## Seite ${pageNumber}\n\n${text || '[Kein auslesbarer Text auf dieser Seite]'}`);
      }
    } finally { await task.destroy(); }
    if (emptyPages === pages.length) throw new Error('Diese PDF enthält keinen auslesbaren Text. Für gescannte Seiten ist später OCR nötig.');
    return { title: filename, kind: 'pdf', body: pages.join('\n\n'), warnings: emptyPages ? [`${emptyPages} Seite(n) ohne auslesbaren Text.`] : [] };
  }
  if (extension === 'docx') {
    const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    const extracted = htmlToMarkdown(result.value);
    return { ...extracted, title: filename, kind: 'docx', warnings: result.messages.map(message => message.message).concat(extracted.warnings) };
  }
  if (extension === 'epub') return extractEpub(file);
  if (extension === 'csv') {
    const parsed = Papa.parse<string[]>(await file.text(), { skipEmptyLines: false });
    if (parsed.errors.length) throw new Error(`CSV konnte nicht vollständig gelesen werden: ${parsed.errors[0].message}`);
    const rows = parsed.data;
    while (rows.length && rows[rows.length - 1].every(cell => cell === '')) rows.pop();
    if (!rows.length) throw new Error('CSV ist leer.');
    const width = Math.max(...rows.map(row => row.length));
    const cell = (value: string | undefined) => (value || '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
    const line = (row: string[]) => `| ${Array.from({ length: width }, (_, i) => cell(row[i])).join(' | ')} |`;
    const body = [line(rows[0]), `| ${Array(width).fill('---').join(' | ')} |`, ...rows.slice(1).map(line)].join('\n');
    return { title: filename, kind: 'csv', body, warnings: [] };
  }
  const contents = await file.text();
  if (extension === 'html' || extension === 'htm') {
    const result = htmlToMarkdown(contents);
    return { ...result, title: result.title === 'Webseite' ? filename : result.title, kind: 'html' };
  }
  return { title: filename, body: contents, kind: extension === 'txt' ? 'text' : 'markdown', warnings: [] };
}

async function extractEpub(file: File): Promise<Extracted> {
  const archive = await JSZip.loadAsync(await file.arrayBuffer());
  const entries = Object.values(archive.files);
  if (entries.length > 10_000) throw new Error('EPUB enthält zu viele Dateien.');
  const container = await archive.file('META-INF/container.xml')?.async('string');
  if (!container) throw new Error('EPUB enthält keinen gültigen Container.');
  const root = new DOMParser().parseFromString(container, 'application/xml');
  const opfPath = root.querySelector('rootfile')?.getAttribute('full-path');
  if (!opfPath || opfPath.includes('..')) throw new Error('EPUB enthält keinen sicheren Buchindex.');
  const opf = await archive.file(opfPath)?.async('string');
  if (!opf) throw new Error('EPUB-Buchindex fehlt.');
  const book = new DOMParser().parseFromString(opf, 'application/xml');
  const directory = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const items = new Map(Array.from(book.querySelectorAll('manifest > item')).map(item => [item.getAttribute('id'), item.getAttribute('href')]));
  const chapters: string[] = [];
  let totalBytes = 0;
  for (const entry of Array.from(book.querySelectorAll('spine > itemref'))) {
    const href = items.get(entry.getAttribute('idref'));
    if (!href) continue;
    const path = resolveArchivePath(directory, href.split('#')[0]);
    const chapter = await archive.file(path)?.async('string');
    if (!chapter) continue;
    totalBytes += chapter.length;
    if (totalBytes > 200 * 1024 * 1024) throw new Error('EPUB entpackt mehr als 200 MiB Text.');
    const document = new DOMParser().parseFromString(chapter, 'application/xhtml+xml');
    const body = document.querySelector('body');
    if (body) {
      const converted = htmlToMarkdown(body.innerHTML);
      chapters.push(converted.body);
    }
  }
  if (!chapters.length) throw new Error('EPUB enthält keine lesbaren Kapitel.');
  return { title: file.name, kind: 'epub', body: chapters.join('\n\n---\n\n'), warnings: [] };
}

function resolveArchivePath(directory: string, relative: string): string {
  const parts: string[] = [];
  for (const part of `${directory}${decodeURIComponent(relative)}`.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) throw new Error('EPUB-Pfad verlässt das Archiv.');
      parts.pop();
    } else parts.push(part);
  }
  return parts.join('/');
}

export async function extractUrl(url: string): Promise<Extracted> {
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Nur HTTP- und HTTPS-Links sind möglich.');
  if (typeof chrome !== 'undefined' && chrome.permissions?.request) {
    const origin = `${parsed.origin}/*`;
    const allowed = await chrome.permissions.request({ origins: [origin] });
    if (!allowed) throw new Error('Zugriff auf diese Website wurde nicht erlaubt.');
  }
  const response = await fetch(parsed.toString(), { redirect: 'follow' });
  if (!response.ok) throw new Error(`Website antwortet mit HTTP ${response.status}.`);
  const type = response.headers.get('content-type') || '';
  if (type && !type.includes('html') && !type.startsWith('text/')) throw new Error('Die URL liefert kein unterstütztes Text- oder HTML-Dokument.');
  const length = Number(response.headers.get('content-length'));
  if (length > 10 * 1024 * 1024) throw new Error('Website ist größer als das aktuelle Limit von 10 MiB.');
  const html = await response.text();
  if (html.length > 10 * 1024 * 1024) throw new Error('Website ist größer als das aktuelle Limit von 10 MiB.');
  if (type.startsWith('text/plain')) return { title: parsed.hostname, body: html, kind: 'text', warnings: [] };
  return htmlToMarkdown(html, response.url || url);
}

export async function extractActiveTab(): Promise<Extracted & { url: string }> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    throw new Error('Diese Aktion ist in der Browser-Erweiterung verfügbar.');
  }
  const result = await chrome.runtime.sendMessage({ type: 'contexter:capture-activated-tab' }) as { url?: string; html?: string; error?: string };
  if (result.error) throw new Error(result.error);
  if (!result.url || !result.html) throw new Error('Der vorherige Tab enthält keinen lesbaren Inhalt.');
  return { ...htmlToMarkdown(result.html, result.url), url: result.url };
}
