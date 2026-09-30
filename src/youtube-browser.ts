import type { Extracted } from './extract';
import { cleanTimestampedText, subtitleToText } from './subtitles';
import { videoId } from './providers';

type SubtitleLanguage = 'original' | 'de' | 'en';

interface CaptionTrack {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
  isTranslatable?: boolean;
}

interface PlayerResponse {
  playabilityStatus?: { status?: string; reason?: string };
  videoDetails?: { title?: string; author?: string };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[];
      audioTracks?: Array<{ defaultCaptionTrackIndex?: number }>;
      defaultAudioTrackIndex?: number;
    };
  };
}

export interface BrowserYouTubeResult extends Extracted {
  language?: string;
  provider: 'youtube-browser';
}

function balancedObject(source: string, start: number): string | null {
  const first = source.indexOf('{', start);
  if (first < 0) return null;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = first; index < source.length; index++) {
    const character = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{') depth++;
    else if (character === '}' && --depth === 0) return source.slice(first, index + 1);
  }
  return null;
}

function objectsAfterMarker(html: string, marker: string): unknown[] {
  const values: unknown[] = [];
  let offset = 0;
  while (offset < html.length) {
    const position = html.indexOf(marker, offset);
    if (position < 0) break;
    const object = balancedObject(html, position + marker.length);
    if (object) {
      try { values.push(JSON.parse(object)); }
      catch { /* Try the next occurrence. */ }
    }
    offset = position + marker.length;
  }
  return values;
}

export function playerResponseFromHtml(html: string): PlayerResponse {
  for (const marker of ['ytInitialPlayerResponse =', 'ytInitialPlayerResponse":', 'window["ytInitialPlayerResponse"] =']) {
    for (const value of objectsAfterMarker(html, marker)) {
      const parsed = value as PlayerResponse;
      if (parsed.videoDetails || parsed.captions || parsed.playabilityStatus) return parsed;
    }
  }
  throw new Error('YouTube hat keine lesbaren Videodaten geliefert. Öffne das Video einmal in Chrome und versuche es erneut.');
}

function collectNamed(value: unknown, name: string, output: unknown[]): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (key === name) output.push(child);
    collectNamed(child, name, output);
  }
}

function youtubeClientVersion(html: string): string {
  const configurations = objectsAfterMarker(html, 'ytcfg.set(') as Array<Record<string, unknown>>;
  const combined = Object.assign({}, ...configurations);
  return String(combined.INNERTUBE_CONTEXT_CLIENT_VERSION || '2.20260729.00.00');
}

export function transcriptPanelParams(id: string): string {
  if (!/^[\w-]{11}$/.test(id)) throw new Error('Ungültige YouTube-Video-ID.');
  const bytes = [0xaa, 0x09, id.length + 4, 0x0a, id.length, ...Array.from(id, character => character.charCodeAt(0) & 0xff), 0x18, 0x01];
  return btoa(String.fromCharCode(...bytes));
}

function transcriptPanelText(value: unknown): string {
  const segments: unknown[] = [];
  collectNamed(value, 'transcriptSegmentRenderer', segments);
  const modernSegments: unknown[] = [];
  collectNamed(value, 'transcriptSegmentViewModel', modernSegments);
  const legacyLines = segments.flatMap(segment => {
    const item = segment as { startMs?: string; startTimeText?: { simpleText?: string }; snippet?: { runs?: Array<{ text?: string }> } };
    const text = (item.snippet?.runs || []).map(run => run.text || '').join('').replace(/\s+/gu, ' ').trim();
    if (!text) return [];
    const milliseconds = Number(item.startMs);
    const time = Number.isFinite(milliseconds) ? clock(milliseconds) : item.startTimeText?.simpleText?.split(':').map(part => part.padStart(2, '0')).join(':').padStart(8, '00:');
    return [`[${time || '00:00:00'}] ${text}`];
  });
  const modernLines = modernSegments.flatMap(segment => {
    const item = segment as { simpleText?: string; timestamp?: string };
    const text = (item.simpleText || '').replace(/\s+/gu, ' ').trim();
    const parts = (item.timestamp || '').trim().split(':').map(Number);
    if (!text || parts.length < 2 || parts.some(part => !Number.isFinite(part))) return [];
    let seconds = 0;
    for (const part of parts) seconds = seconds * 60 + part;
    return [`[${clock(seconds * 1000)}] ${text}`];
  });
  const lines = modernLines.length ? modernLines : legacyLines;
  if (!lines.length) throw new Error('Die YouTube-Transkriptansicht enthält keinen lesbaren Text.');
  return cleanTimestampedText(lines.join('\n'), true);
}

async function transcriptPanelBody(html: string, id: string): Promise<string> {
  const endpoint = new URL('https://www.youtube.com/youtubei/v1/get_panel');
  endpoint.searchParams.set('prettyPrint', 'false');
  const response = await fetch(endpoint.toString(), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context: { client: { clientName: 'WEB', clientVersion: youtubeClientVersion(html), hl: 'en', gl: 'US' } },
      panelId: 'PAmodern_transcript_view',
      params: transcriptPanelParams(id),
    }),
  });
  if (!response.ok) throw new Error(`YouTube-Transkript antwortet mit HTTP ${response.status}.`);
  return transcriptPanelText(await response.json());
}

function selectCaptionTrack(player: PlayerResponse, language: SubtitleLanguage): { track: CaptionTrack; translated: boolean } {
  const renderer = player.captions?.playerCaptionsTracklistRenderer;
  const tracks = renderer?.captionTracks || [];
  if (!tracks.length) throw new Error('Für dieses Video sind keine vorhandenen Untertitel verfügbar.');

  if (language !== 'original') {
    const exact = tracks.find(track => track.languageCode?.toLowerCase() === language);
    const regional = tracks.find(track => track.languageCode?.toLowerCase().startsWith(`${language}-`));
    const matching = exact || regional;
    if (matching) return { track: matching, translated: false };
    const translatable = tracks.find(track => track.isTranslatable);
    if (translatable) return { track: translatable, translated: true };
    throw new Error(`Für dieses Video sind keine Untertitel auf „${language}“ verfügbar.`);
  }

  const audioIndex = renderer?.defaultAudioTrackIndex ?? 0;
  const captionIndex = renderer?.audioTracks?.[audioIndex]?.defaultCaptionTrackIndex;
  const preferred = typeof captionIndex === 'number' ? tracks[captionIndex] : undefined;
  return { track: preferred || tracks.find(track => track.kind !== 'asr') || tracks[0], translated: false };
}

function clock(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function json3ToTimestampedText(value: unknown): string {
  const events = (value as { events?: Array<{ tStartMs?: number; segs?: Array<{ utf8?: string }> }> })?.events || [];
  const lines = events.flatMap(event => {
    const text = (event.segs || []).map(segment => segment.utf8 || '').join('').replace(/\s+/gu, ' ').trim();
    return text ? [`[${clock(event.tStartMs || 0)}] ${text}`] : [];
  });
  if (!lines.length) throw new Error('YouTube hat eine leere Untertiteldatei geliefert.');
  return lines.join('\n');
}

async function captionBody(baseUrl: string, language: SubtitleLanguage, translated: boolean): Promise<string> {
  const endpoint = new URL(baseUrl);
  endpoint.searchParams.set('fmt', 'json3');
  if (translated && language !== 'original') endpoint.searchParams.set('tlang', language);
  const response = await fetch(endpoint.toString(), { credentials: 'include', redirect: 'follow' });
  if (!response.ok) throw new Error(`YouTube-Untertitel antworten mit HTTP ${response.status}.`);
  const contents = await response.text();
  if (!contents.trim()) throw new Error('YouTube hat für diese Untertiteladresse keine Daten geliefert.');
  try {
    return cleanTimestampedText(json3ToTimestampedText(JSON.parse(contents)), true);
  } catch (jsonError) {
    try { return subtitleToText(contents, false); }
    catch { throw jsonError; }
  }
}

export async function fetchBrowserYouTubeTranscript(url: string, language: SubtitleLanguage): Promise<BrowserYouTubeResult> {
  const id = videoId(url);
  if (!id) throw new Error('Bitte einen Link zu einem einzelnen YouTube-Video eingeben.');
  const canonical = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
  const response = await fetch(canonical, { credentials: 'include', redirect: 'follow' });
  if (!response.ok) throw new Error(`YouTube antwortet mit HTTP ${response.status}.`);
  const html = await response.text();
  const player = playerResponseFromHtml(html);
  const availability = player.playabilityStatus;
  if (availability?.status && availability.status !== 'OK') {
    throw new Error(availability.reason || 'YouTube verlangt eine Bestätigung oder Anmeldung. Öffne das Video in Chrome, bestätige dich dort und versuche es erneut.');
  }
  const selected = selectCaptionTrack(player, language);
  if (!selected.track.baseUrl) throw new Error('YouTube hat keine abrufbare Untertiteladresse geliefert.');
  let body: string;
  const warnings: string[] = [];
  try { body = await captionBody(selected.track.baseUrl, language, selected.translated); }
  catch (error) {
    const requestedTrack = language === 'original' || selected.track.languageCode?.toLowerCase().split('-')[0] === language;
    if (!requestedTrack || selected.translated) throw new Error(`Die gewünschte Untertitelsprache konnte direkt nicht geladen werden: ${error instanceof Error ? error.message : String(error)}`);
    try { body = await transcriptPanelBody(html, id); }
    catch (panelError) {
      throw new Error(`YouTube hat keine Untertiteldaten geliefert und die Transkriptansicht war nicht abrufbar (${panelError instanceof Error ? panelError.message : String(panelError)}). Öffne das Video in Chrome, bestätige gegebenenfalls deine Anmeldung und versuche es erneut.`);
    }
    warnings.push('Untertitel wurden über die YouTube-Transkriptansicht geladen.');
  }
  return {
    title: player.videoDetails?.title || `YouTube-Video ${id}`,
    author: player.videoDetails?.author,
    body,
    kind: 'youtube',
    warnings,
    language: selected.translated ? language : selected.track.languageCode,
    provider: 'youtube-browser',
  };
}

export async function requestBrowserYouTubeAccess(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage || !chrome.permissions?.request) {
    throw new Error('Der direkte Browser-Abruf ist nur in der Chrome-Erweiterung verfügbar.');
  }
  const allowed = await chrome.permissions.request({ origins: ['https://www.youtube.com/*'] });
  if (!allowed) throw new Error('Der Zugriff auf youtube.com wurde nicht erlaubt. Ohne diese Freigabe kann Contexter keine Untertitel direkt laden.');
}

export async function youtubeTranscriptBrowser(url: string, language: SubtitleLanguage = 'original'): Promise<BrowserYouTubeResult> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage || !chrome.permissions?.contains) {
    throw new Error('Der direkte Browser-Abruf ist nur in der Chrome-Erweiterung verfügbar.');
  }
  if (!await chrome.permissions.contains({ origins: ['https://www.youtube.com/*'] })) {
    throw new Error('Contexter hat noch keinen Zugriff auf youtube.com. Starte den Abruf erneut und bestätige die Chrome-Freigabe.');
  }
  const result = await chrome.runtime.sendMessage({ type: 'contexter:youtube-transcript', url, language }) as BrowserYouTubeResult & { error?: string };
  if (result?.error) throw new Error(result.error);
  if (!result?.body) throw new Error('Die Erweiterung hat keine Untertitel zurückgegeben.');
  return result;
}
