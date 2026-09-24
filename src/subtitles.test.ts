import { describe, expect, it } from 'vitest';
import { subtitleToText } from './subtitles';

describe('subtitle import', () => {
  it('keeps timing and spoken text from yt-dlp WebVTT', () => {
    const contents = 'WEBVTT\n\nNOTE source\nignore\n\n00:00:01.200 --> 00:00:03.000 align:start\n<v Anna>Hallo &amp; willkommen</v>\n\n00:01:02.900 --> 00:01:04.000\nZweite Zeile';
    expect(subtitleToText(contents)).toBe('[00:00:01] Hallo & willkommen\n[00:01:02] Zweite Zeile');
  });

  it('accepts SRT cues and rejects files without readable captions', () => {
    expect(subtitleToText('1\r\n00:00:04,500 --> 00:00:06,000\r\nErste Zeile\r\nzweite Zeile\r\n')).toBe('[00:00:04] Erste Zeile zweite Zeile');
    expect(() => subtitleToText('WEBVTT\n\nNOTE empty')).toThrow('keine lesbaren');
  });
});
