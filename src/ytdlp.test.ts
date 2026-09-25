import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadSubtitles } = vi.hoisted(() => ({ loadSubtitles: vi.fn() }));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ loadSubtitles }) }));

import { explainLocalYouTubeError, youtubeTranscriptLocal } from './ytdlp';

beforeEach(() => loadSubtitles.mockReset());

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
});
