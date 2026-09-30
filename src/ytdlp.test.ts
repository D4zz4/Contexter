import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadSubtitles, listVideos } = vi.hoisted(() => ({ loadSubtitles: vi.fn(), listVideos: vi.fn() }));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ loadSubtitles, listVideos }) }));

import { explainLocalYouTubeError, youtubeCatalogLocal, youtubeTranscriptLocal } from './ytdlp';

beforeEach(() => { loadSubtitles.mockReset(); listVideos.mockReset(); });

describe('Android YouTube import', () => {
  it('requests original-language captions by default and returns text without timestamps', async () => {
    loadSubtitles.mockResolvedValue({ contents: 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello world.', language: 'en', title: 'Example', author: 'Creator' });
    const result = await youtubeTranscriptLocal('https://youtu.be/jNQXAC9IVRw');
    expect(loadSubtitles).toHaveBeenCalledWith({ videoId: 'jNQXAC9IVRw', language: 'original', cookies: undefined });
    expect(result.body).toBe('Hello world.');
    expect(result.language).toBe('en');
  });

  it('explains YouTube anti-bot blocking without exposing the raw yt-dlp error', async () => {
    const result = explainLocalYouTubeError(new Error('DownloadError: Sign in to confirm you\'re not a bot. Use --cookies'));
    expect(result.message).toContain('VPN');
    expect(result.message).not.toContain('DownloadError');
  });

  it('lists a channel via local yt-dlp and filters invalid IDs', async () => {
    listVideos.mockResolvedValue({ ids: ['jNQXAC9IVRw', 'bad'] });
    await expect(youtubeCatalogLocal('https://www.youtube.com/@Fireship/videos', 5000)).resolves.toEqual(['jNQXAC9IVRw']);
    expect(listVideos).toHaveBeenCalledWith({ url: 'https://www.youtube.com/@Fireship/videos', limit: 5000, cookies: undefined });
  });
});
