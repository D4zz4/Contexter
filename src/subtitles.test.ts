import { describe, expect, it } from 'vitest';
import { cleanTimestampedText, subtitleToText } from './subtitles';

describe('subtitle import', () => {
  it('keeps timing and spoken text from yt-dlp WebVTT', () => {
    const contents = 'WEBVTT\n\nNOTE source\nignore\n\n00:00:01.200 --> 00:00:03.000 align:start\n<v Anna>Hallo &amp; willkommen</v>\n\n00:01:02.900 --> 00:01:04.000\nZweite Zeile';
    expect(subtitleToText(contents)).toBe('[00:00:01] Hallo & willkommen\n[00:01:02] Zweite Zeile');
  });

  it('accepts SRT cues and rejects files without readable captions', () => {
    expect(subtitleToText('1\r\n00:00:04,500 --> 00:00:06,000\r\nErste Zeile\r\nzweite Zeile\r\n')).toBe('[00:00:04] Erste Zeile zweite Zeile');
    expect(() => subtitleToText('WEBVTT\n\nNOTE empty')).toThrow('keine lesbaren');
  });

  it('removes rolling YouTube caption overlap without removing new words', () => {
    const vtt = 'WEBVTT\n\n00:00:03.000 --> 00:00:04.000\nMost people are using AI coding tools\n\n00:00:03.500 --> 00:00:05.000\nMost people are using AI coding tools the wrong way. They\'re using it\n\n00:00:04.000 --> 00:00:06.000\nthe wrong way. They\'re using it\n\n00:00:04.500 --> 00:00:06.500\nthe wrong way. They\'re using it backwards.\n\n00:00:06.000 --> 00:00:08.000\nbackwards.\n\n00:00:06.500 --> 00:00:09.000\nbackwards. They\'ll open up Codex';
    expect(subtitleToText(vtt)).toBe('[00:00:03] Most people are using AI coding tools the wrong way. They\'re using it\n[00:00:04] backwards.\n[00:00:06] They\'ll open up Codex');
  });

  it('can clean an already imported timestamped transcript locally', () => {
    const duplicate = '[00:00:03] Most people are using AI coding tools\n[00:00:03] Most people are using AI coding tools the wrong way.\n[00:00:04] the wrong way. They\'re using it';
    expect(cleanTimestampedText(duplicate)).toBe('[00:00:03] Most people are using AI coding tools the wrong way.\n[00:00:04] They\'re using it');
    expect(cleanTimestampedText('A handwritten note\nwith two lines')).toBe('A handwritten note\nwith two lines');
    expect(cleanTimestampedText('[00:00:03] Hello.\n[00:00:03] Welcome.')).toBe('[00:00:03] Hello.\n[00:00:03] Welcome.');
  });

  it('keeps genuine repetition after a long pause', () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nThank you.\n\n00:00:20.000 --> 00:00:21.000\nThank you.';
    expect(subtitleToText(vtt)).toBe('[00:00:01] Thank you.\n[00:00:20] Thank you.');
  });

  it('keeps repeated words when the next cue is several seconds later', () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nThank you.\n\n00:00:06.000 --> 00:00:07.000\nThank you.';
    expect(subtitleToText(vtt)).toBe('[00:00:01] Thank you.\n[00:00:06] Thank you.');
  });

  it('leaves ordinary non-overlapping subtitles unchanged', () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello everyone.\n\n00:00:03.000 --> 00:00:05.000\nWelcome to the video.\n\n00:00:05.000 --> 00:00:07.000\nThis is a new sentence.';
    expect(subtitleToText(vtt)).toBe('[00:00:01] Hello everyone.\n[00:00:03] Welcome to the video.\n[00:00:05] This is a new sentence.');
  });

  it('joins rolling captions with four-second gaps and omits timestamps for YouTube', () => {
    const vtt = 'WEBVTT\n\n00:00:24.000 --> 00:00:28.000\ngetting fat laying eggs and if not\n\n00:00:28.100 --> 00:00:31.000\ngetting fat laying eggs and if not taking care of those eggs turn into\n\n00:00:35.000 --> 00:00:38.000\nfruit fly lives about 50 days lays eggs\n\n00:00:38.100 --> 00:00:41.000\nfruit fly lives about 50 days lays eggs every single day';
    expect(subtitleToText(vtt, false)).toBe('getting fat laying eggs and if not taking care of those eggs turn into fruit fly lives about 50 days lays eggs every single day');
    expect(cleanTimestampedText('[00:00:24] getting fat laying eggs and if not\n[00:00:28] getting fat laying eggs and if not taking care of those eggs turn into', true)).toBe('getting fat laying eggs and if not taking care of those eggs turn into');
  });
});
