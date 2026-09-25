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

type Cue = { start: string; text: string };

function milliseconds(value: string): number {
  const parts = value.replace(',', '.').split(':');
  const seconds = Number(parts.pop());
  const minutes = Number(parts.pop());
  const hours = Number(parts.pop() || 0);
  return ((hours * 60 + minutes) * 60 + seconds) * 1000;
}

function words(value: string): string[] {
  return value.split(/\s+/u).filter(Boolean);
}

function comparable(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function overlap(previous: string[], current: string[]): number {
  const left = previous.map(comparable);
  const right = current.map(comparable);
  for (let size = Math.min(left.length, right.length); size > 0; size--) {
    if (size < 3 && size !== right.length && !(size === 1 && left.length === 1)) continue;
    if (left.slice(-size).every((item, index) => item && item === right[index])) return size;
  }
  return 0;
}

function cleanCues(cues: Cue[]): string {
  const lines: Array<{ time: string; text: string }> = [];
  let previous: string[] = [];
  let previousTime = -Infinity;
  for (const cue of cues) {
    const time = milliseconds(cue.start);
    const current = words(cue.text);
    const shared = time - previousTime <= 3_000 ? overlap(previous, current) : 0;
    const fresh = current.slice(shared).join(' ');
    if (fresh) {
      const stamp = clock(cue.start);
      const last = lines.at(-1);
      if (last?.time === stamp) last.text += ` ${fresh}`;
      else lines.push({ time: stamp, text: fresh });
    }
    previous = current;
    previousTime = time;
  }
  return lines.map(line => `[${line.time}] ${line.text}`).join('\n');
}

export function cleanTimestampedText(body: string): string {
  const lines = body.split(/\r?\n/u).filter(line => line.trim());
  const cues: Cue[] = [];
  for (const line of lines) {
    const match = /^\[(\d{2}:\d{2}:\d{2})\]\s+(.+)$/u.exec(line);
    if (!match) return body;
    cues.push({ start: match[1], text: match[2] });
  }
  const hasOverlap = cues.some((cue, index) => index > 0 && milliseconds(cue.start) - milliseconds(cues[index - 1].start) <= 3_000 && overlap(words(cues[index - 1].text), words(cue.text)) > 0);
  return hasOverlap ? cleanCues(cues) : body;
}

export function subtitleToText(contents: string): string {
  const blocks = contents.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  const cues: Cue[] = [];
  const time = /^((?:\d{2}:)?\d{2}:\d{2}[.,]\d{3})\s+-->\s+(?:\d{2}:)?\d{2}:\d{2}[.,]\d{3}(?:\s|$)/;
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (/^(WEBVTT|NOTE|STYLE|REGION)(\s|$)/.test(lines[0])) continue;
    const index = lines.findIndex(line => time.test(line.trim()));
    if (index < 0) continue;
    const start = time.exec(lines[index].trim())![1];
    const text = decodeEntities(lines.slice(index + 1).join(' ').replace(/<[^>]*>/g, '').trim());
    if (text) cues.push({ start, text });
  }
  if (!cues.length) throw new Error('Die Untertiteldatei enthält keine lesbaren Zeitstempel und Textzeilen.');
  return cleanCues(cues);
}
