import { registerPlugin } from '@capacitor/core';
import type { Extracted } from './extract';
import { videoId } from './providers';
import { subtitleToText } from './subtitles';

interface LocalYouTubeSubtitles {
  loadSubtitles(options: { videoId: string; language: 'original' | 'de' | 'en'; cookies?: string }): Promise<{ contents: string; language: string; title: string; author: string }>;
}

const plugin = registerPlugin<LocalYouTubeSubtitles>('LocalYouTubeSubtitles');

export function explainLocalYouTubeError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/sign in to confirm|not a bot|LOGIN_REQUIRED/iu.test(message)) return new Error('YouTube blockiert den Abruf über diese Verbindung als möglichen Bot. Falls du ein VPN nutzt, schalte es aus oder wechsle das Netzwerk und versuche es erneut. Optional kannst du eine YouTube-Cookie-Datei nur für diese Sitzung laden. Eine Anmeldung im externen Browser allein wird nicht automatisch an Contexter weitergegeben.');
  if (/HTTP Error 429/i.test(message)) return new Error('YouTube begrenzt gerade Untertitelabrufe (HTTP 429). Bitte später noch einmal versuchen oder eine VTT/SRT-Datei importieren.');
  if (/HTTP Error 403/i.test(message)) return new Error('YouTube hat diesen Untertitelabruf blockiert (HTTP 403). Bitte eine andere Sprache oder eine VTT/SRT-Datei versuchen.');
  return error instanceof Error ? error : new Error(message);
}

export async function youtubeTranscriptLocal(url: string, language: 'original' | 'de' | 'en' = 'original', cookies?: string): Promise<Extracted & { language: string; provider: string }> {
  const id = videoId(url);
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error('Bitte einen Link zu einem einzelnen YouTube-Video eingeben.');
  let result: { contents: string; language: string; title: string; author: string };
  try { result = await plugin.loadSubtitles({ videoId: id, language, cookies }); }
  catch (error) { throw explainLocalYouTubeError(error); }
  const { contents } = result;
  const body = subtitleToText(contents, false);
  return { kind: 'youtube', title: result.title || `YouTube-Video ${id}`, author: result.author || undefined, body, language: result.language, provider: 'yt-dlp-local', warnings: [] };
}
