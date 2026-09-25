import { afterEach, describe, expect, it, vi } from 'vitest';
import { braveSearch, parseYouTubeLinks, youtubeCatalog, youtubeTranscript } from './providers';

afterEach(() => vi.unstubAllGlobals());

describe('optional providers', () => {
  it('accepts newline-separated videos and deduplicates URL variants before any provider call', () => {
    expect(parseYouTubeLinks('https://youtu.be/dQw4w9WgXcQ\nhttps://www.youtube.com/watch?v=jNQXAC9IVRw\nhttps://www.youtube.com/shorts/dQw4w9WgXcQ bad')).toEqual({
      urls: ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=jNQXAC9IVRw'],
      invalid: ['bad'], repeats: 1,
    });
  });
  it('never sends a request before an explicit key is supplied', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(youtubeTranscript('https://youtu.be/dQw4w9WgXcQ', '')).rejects.toThrow('API-Schlüssel');
    await expect(braveSearch('test', '')).rejects.toThrow('API-Schlüssel');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses native subtitles and retains timestamp and actual language', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ content: [{ text: 'Hallo', offset: 3000 }, { text: 'Welt', offset: 62000 }], lang: 'de' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ title: 'Beispielvideo', author: 'Kanal' }) });
    vi.stubGlobal('fetch', fetchMock);
    const result = await youtubeTranscript('https://youtu.be/dQw4w9WgXcQ', 'private-key');
    expect(fetchMock.mock.calls[0][0]).toContain('mode=native');
    expect(fetchMock.mock.calls[0][1].headers['x-api-key']).toBe('private-key');
    expect(result.body).toContain('[00:00:03] Hallo');
    expect(result.body).toContain('[00:01:02] Welt');
    expect(result.language).toBe('de');
    expect(result.title).toBe('Beispielvideo');
  });

  it('filters malformed catalog IDs and returns selected search metadata only', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ videoIds: ['dQw4w9WgXcQ', 'bad', 'dQw4w9WgXcQ'] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ web: { results: [{ title: 'Artikel', url: 'https://example.com/a', description: 'Snippet' }, { title: 'Bad', url: 'javascript:alert(1)' }] } }) });
    vi.stubGlobal('fetch', fetchMock);
    expect(await youtubeCatalog('https://www.youtube.com/playlist?list=PLtest', 'key', 20, 'video')).toEqual(['dQw4w9WgXcQ']);
    expect(await braveSearch('thema', 'key')).toEqual([{ title: 'Artikel', url: 'https://example.com/a', description: 'Snippet' }]);
    expect(fetchMock.mock.calls[1][0].toString()).toContain('api.search.brave.com');
  });
});
