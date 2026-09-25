const MAX_COOKIE_BYTES = 1024 * 1024;

export function prepareYouTubeCookies(contents: string): string {
  if (new TextEncoder().encode(contents).length > MAX_COOKIE_BYTES) throw new Error('Cookie-Datei ist größer als 1 MiB. Bitte nur YouTube-Cookies exportieren.');
  const lines = contents.replace(/\r\n?/gu, '\n').split('\n');
  if (!/^# (?:Netscape )?HTTP Cookie File/u.test(lines[0])) throw new Error('Bitte eine Cookie-Datei im Netscape-Format (.txt) auswählen.');
  const youtubeLines = lines.filter(line => {
    const fields = line.replace(/^#HttpOnly_/u, '').split('\t');
    if (fields.length < 7) return false;
    const domain = fields[0].replace(/^\./u, '').toLowerCase();
    return domain === 'youtube.com' || domain.endsWith('.youtube.com') || domain === 'youtu.be';
  });
  if (!youtubeLines.length) throw new Error('Die Datei enthält keine YouTube-Cookies.');
  return `# Netscape HTTP Cookie File\n${youtubeLines.join('\n')}\n`;
}
