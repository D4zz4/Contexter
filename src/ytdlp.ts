import { registerPlugin } from '@capacitor/core';
import type { Extracted } from './extract';
import { videoId } from './providers';
import { subtitleToText } from './subtitles';

interface LocalYouTubeSubtitles {
  loadSubtitles(options: { videoId: string; language: 'de' | 'en' }): Promise<{ contents: string; language: string; title: string; author: string }>;
}

const plugin = registerPlugin<LocalYouTubeSubtitles>('LocalYouTubeSubtitles');

export async function youtubeTranscriptLocal(url: string, language: 'de' | 'en' = 'de'): Promise<Extracted & { language: string; provider: string }> {
  const id = videoId(url);
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error('Bitte einen Link zu einem einzelnen YouTube-Video eingeben.');
  let result: { contents: string; language: string; title: string; author: string };
  try { result = await plugin.loadSubtitles({ videoId: id, language }); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/HTTP Error 429/i.test(message)) throw new Error('YouTube begrenzt gerade Untertitelabrufe (HTTP 429). Bitte später noch einmal versuchen oder eine VTT/SRT-Datei importieren.');
    if (/HTTP Error 403/i.test(message)) throw new Error('YouTube hat diesen Untertitelabruf blockiert (HTTP 403). Bitte eine andere Sprache oder eine VTT/SRT-Datei versuchen.');
    throw error;
  }
  const { contents } = result;
  const body = subtitleToText(contents);
  return { kind: 'youtube', title: result.title || `YouTube-Video ${id}`, author: result.author || undefined, body, language: result.language, provider: 'yt-dlp-local', warnings: [] };
}
