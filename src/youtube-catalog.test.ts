import { describe, expect, it, vi } from 'vitest';
import { catalogSections, catalogUrl, parseCatalogContinuation, parseCatalogHtml, youtubeCatalogBrowser } from './youtube-catalog';

describe('keyless YouTube catalog', () => {
  it('normalizes channel, handle and playlist URLs without admitting other hosts', () => {
    expect(catalogSections('all')).toEqual(['video', 'short', 'live']);
    expect(catalogUrl('@Fireship', 'video')).toBe('https://www.youtube.com/@Fireship/videos');
    expect(catalogUrl('https://www.youtube.com/@Fireship/featured', 'short')).toBe('https://www.youtube.com/@Fireship/shorts');
    expect(catalogUrl('https://www.youtube.com/playlist?list=UUsBjURrPoezykLs9EqgamOA', 'live')).toBe('https://www.youtube.com/playlist?list=UUsBjURrPoezykLs9EqgamOA');
    expect(() => catalogUrl('https://evil.example/@Fireship', 'video')).toThrow();
  });

  it('reads modern channel video and Shorts tiles and their pagination token', () => {
    const initial = { contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: { selected: true, content: { richGridRenderer: { contents: [
      { richItemRenderer: { content: { lockupViewModel: { contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', contentId: 'jNQXAC9IVRw' } } } },
      { richItemRenderer: { content: { shortsLockupViewModel: { onTap: { innertubeCommand: { reelWatchEndpoint: { videoId: 'dQw4w9WgXcQ' } } } } } } },
      { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: 'NEXT' } } } },
    ] } } } }] } } };
    const html = `<script>var ytInitialData = ${JSON.stringify(initial)};</script><script>ytcfg.set({"INNERTUBE_CONTEXT_CLIENT_VERSION":"2.20260930.00.00"});</script>`;
    expect(parseCatalogHtml(html)).toEqual({ ids: ['jNQXAC9IVRw', 'dQw4w9WgXcQ'], continuation: 'NEXT', clientVersion: '2.20260930.00.00' });
  });

  it('reads continuation items and stops at a repeated token', async () => {
    const page = { onResponseReceivedActions: [{ appendContinuationItemsAction: { continuationItems: [
      { lockupViewModel: { contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', contentId: 'jNQXAC9IVRw' } },
      { continuationItemViewModel: { continuationCommand: { innertubeCommand: { continuationCommand: { token: 'SAME' } } } } },
    ] } }] };
    expect(parseCatalogContinuation(page)).toEqual({ ids: ['jNQXAC9IVRw'], continuation: 'SAME' });
    const sendMessage = vi.fn().mockResolvedValueOnce({ ids: ['jNQXAC9IVRw'], continuation: 'SAME', clientVersion: '2.20260930.00.00' }).mockResolvedValueOnce({ ids: ['dQw4w9WgXcQ'], continuation: 'SAME' });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    try {
      await expect(youtubeCatalogBrowser('@Fireship', 5000, 'video')).resolves.toEqual(['jNQXAC9IVRw', 'dQw4w9WgXcQ']);
      expect(sendMessage).toHaveBeenCalledTimes(2);
    } finally { vi.unstubAllGlobals(); }
  });
});
