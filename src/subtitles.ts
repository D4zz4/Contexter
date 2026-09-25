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
    if (left.slice(-size).every((item, index) => item && item === right[index])) return size;
  }
  return 0;
}

function sharedWords(previous: string[], current: string[], elapsed: number): number {
  if (elapsed < 0 || elapsed > 8_000) return 0;
  const size = overlap(previous, current);
  if (size >= 3) return size;
  if (size === current.length && elapsed <= 3_000) return size;
  if (size === 2 && elapsed <= 3_000) return size;
  if (size === 1 && elapsed <= 1_000) return size;
  return 0;
}

function cleanCues(cues: Cue[], timestamps = true): string {
  const lines: Array<{ time: string; text: string }> = [];
  const emitted: string[] = [];
  let previousTime = -Infinity;
  for (const cue of cues) {
    const time = milliseconds(cue.start);
    const current = words(cue.text);
    const shared = sharedWords(emitted.slice(-80), current, time - previousTime);
    const fresh = current.slice(shared);
    if (fresh.length) {
      const stamp = clock(cue.start);
      const last = lines.at(-1);
      if (last?.time === stamp) last.text += ` ${fresh.join(' ')}`;
      else lines.push({ time: stamp, text: fresh.join(' ') });
      emitted.push(...fresh);
    }
    previousTime = time;
  }
  if (timestamps) return lines.map(line => `[${line.time}] ${line.text}`).join('\n');
  const paragraphs: string[] = [];
  let paragraph = '';
  for (const line of lines) {
    paragraph += `${paragraph ? ' ' : ''}${line.text}`;
    if (/[.!?][”"']?$/u.test(line.text) || words(paragraph).length >= 60) {
      paragraphs.push(paragraph);
      paragraph = '';
    }
  }
  if (paragraph) paragraphs.push(paragraph);
  return paragraphs.join('\n\n');
}

export function cleanTimestampedText(body: string, removeTimestamps = false): string {
  const lines = body.split(/\r?\n/u).filter(line => line.trim());
  const cues: Cue[] = [];
  for (const line of lines) {
    const match = /^\[(\d{2}:\d{2}:\d{2})\]\s+(.+)$/u.exec(line);
    if (!match) return body;
    cues.push({ start: match[1], text: match[2] });
  }
  const hasOverlap = cues.some((cue, index) => index > 0 && sharedWords(words(cues[index - 1].text), words(cue.text), milliseconds(cue.start) - milliseconds(cues[index - 1].start)) > 0);
  return hasOverlap || removeTimestamps ? cleanCues(cues, !removeTimestamps) : body;
}

export function subtitleToText(contents: string, timestamps = true): string {
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
  return cleanCues(cues, timestamps);
}
