import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBrowserYouTubeTranscript, json3ToTimestampedText, playerResponseFromHtml } from './youtube-browser';

afterEach(() => vi.unstubAllGlobals());

describe('Chrome YouTube import', () => {
  it('reads the player response embedded in a YouTube watch page', () => {
    const response = playerResponseFromHtml('<script>var ytInitialPlayerResponse = {"videoDetails":{"title":"Example"},"playabilityStatus":{"status":"OK"}};</script>');
    expect(response.videoDetails?.title).toBe('Example');
  });

  it('converts json3 caption events into timestamped source text', () => {
    expect(json3ToTimestampedText({ events: [
      { tStartMs: 1200, segs: [{ utf8: 'Hello ' }, { utf8: 'world.' }] },
      { tStartMs: 4100, segs: [{ utf8: 'Next sentence.' }] },
    ] })).toBe('[00:00:01] Hello world.\n[00:00:04] Next sentence.');
  });

  it('fetches original-language captions without an API key', async () => {
    const html = '<script>ytInitialPlayerResponse = {"playabilityStatus":{"status":"OK"},"videoDetails":{"title":"Demo","author":"Creator"},"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=jNQXAC9IVRw","languageCode":"en"}]}}};</script>';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(html, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ events: [{ tStartMs: 1000, segs: [{ utf8: 'Hello world.' }] }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchBrowserYouTubeTranscript('https://youtu.be/jNQXAC9IVRw', 'original');

    expect(result.title).toBe('Demo');
    expect(result.author).toBe('Creator');
    expect(result.body).toBe('Hello world.');
    expect(result.language).toBe('en');
    expect(result.provider).toBe('youtube-browser');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to the modern YouTube transcript panel when timedtext is empty', async () => {
    const html = '<script>ytcfg.set({"INNERTUBE_CONTEXT_CLIENT_VERSION":"2.20260928.03.00"});ytInitialPlayerResponse = {"playabilityStatus":{"status":"OK"},"videoDetails":{"title":"Demo"},"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=jNQXAC9IVRw","languageCode":"en"}]}}};</script>';
    const panel = { content: [{ transcriptSegmentViewModel: { timestamp: '0:01', simpleText: 'Hello world.' } }, { transcriptSegmentViewModel: { timestamp: '0:04', simpleText: 'Next sentence.' } }] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(html, { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(panel), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchBrowserYouTubeTranscript('https://youtu.be/jNQXAC9IVRw', 'original');

    expect(result.body).toBe('Hello world.\n\nNext sentence.');
    expect(result.warnings).toContain('Untertitel wurden über die YouTube-Transkriptansicht geladen.');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[2][1]?.body as string)).toMatchObject({ panelId: 'PAmodern_transcript_view' });
  });

  it('returns an actionable message when YouTube requires confirmation', async () => {
    const html = '<script>ytInitialPlayerResponse = {"playabilityStatus":{"status":"LOGIN_REQUIRED","reason":"Sign in to confirm you are not a bot"},"videoDetails":{"title":"Demo"}};</script>';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(html, { status: 200 })));
    await expect(fetchBrowserYouTubeTranscript('https://youtu.be/jNQXAC9IVRw', 'original')).rejects.toThrow('not a bot');
  });
});
