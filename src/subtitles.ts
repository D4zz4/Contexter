function clock(value: string): string {
  const parts = value.replace(',', '.').split(':');
  const seconds = Math.floor(Number(parts.pop()));
  const minutes = Number(parts.pop());
  const hours = Number(parts.pop() || 0);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
    if (entity.startsWith('#x')) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(parseInt(entity.slice(1), 10));
    return named[entity.toLowerCase()] || match;
  });
}

export function subtitleToText(contents: string): string {
  const blocks = contents.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  const cues: string[] = [];
  const time = /^((?:\d{2}:)?\d{2}:\d{2}[.,]\d{3})\s+-->\s+(?:\d{2}:)?\d{2}:\d{2}[.,]\d{3}(?:\s|$)/;
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (/^(WEBVTT|NOTE|STYLE|REGION)(\s|$)/.test(lines[0])) continue;
    const index = lines.findIndex(line => time.test(line.trim()));
    if (index < 0) continue;
    const start = time.exec(lines[index].trim())![1];
    const text = decodeEntities(lines.slice(index + 1).join(' ').replace(/<[^>]*>/g, '').trim());
    if (text) cues.push(`[${clock(start)}] ${text}`);
  }
  if (!cues.length) throw new Error('Die Untertiteldatei enthält keine lesbaren Zeitstempel und Textzeilen.');
  return cues.join('\n');
}
