import type { Extracted } from './extract';

export function videoId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.hostname === 'youtu.be') return url.pathname.slice(1) || null;
    if (/(^|\.)youtube\.com$/.test(url.hostname)) {
      if (url.pathname === '/watch') return url.searchParams.get('v');
      if (url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/live/')) return url.pathname.split('/')[2] || null;
    }
  } catch { /* invalid URL */ }
  return null;
}

export function isYouTubeVideoUrl(value: string): boolean {
  return /^[A-Za-z0-9_-]{11}$/.test(videoId(value) || '');
}

function formatOffset(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

interface TranscriptResult {
  content?: string | Array<{ text: string; offset?: number }>;
  lang?: string;
  jobId?: string;
  status?: string;
  error?: string;
}

async function providerJson<T>(url: string, key: string): Promise<T> {
  const response = await fetch(url, { headers: { 'x-api-key': key, Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Supadata antwortet mit HTTP ${response.status}. Prüfe API-Schlüssel, Guthaben und URL.`);
  return response.json() as Promise<T>;
}

export async function youtubeTranscript(url: string, key: string): Promise<Extracted & { language?: string; provider: string }> {
  const id = videoId(url);
  if (!id) throw new Error('Bitte einen Link zu einem einzelnen YouTube-Video eingeben.');
  if (!key.trim()) throw new Error('Bitte erst einen Supadata-API-Schlüssel eingeben.');
  const canonical = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
  const endpoint = new URL('https://api.supadata.ai/v1/transcript');
  endpoint.searchParams.set('url', canonical);
  endpoint.searchParams.set('mode', 'native');
  let result = await providerJson<TranscriptResult>(endpoint.toString(), key.trim());
  if (result.jobId) {
    for (let attempt = 0; attempt < 30 && result.jobId; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const update = await providerJson<TranscriptResult>(`https://api.supadata.ai/v1/transcript/${encodeURIComponent(result.jobId)}`, key.trim());
      if (update.status === 'failed') throw new Error(update.error || 'Untertitel konnten nicht abgerufen werden.');
      if (update.status === 'completed' || update.content) { result = update; break; }
    }
  }
  if (!result.content) throw new Error('Noch keine Untertitel verfügbar. Bitte später erneut versuchen.');
  const body = typeof result.content === 'string' ? result.content : result.content.map(chunk => `${typeof chunk.offset === 'number' ? `[${formatOffset(chunk.offset)}] ` : ''}${chunk.text}`).join('\n');
  if (!body.trim()) throw new Error('Für dieses Video sind keine vorhandenen Untertitel abrufbar.');
  let title = `YouTube-Video ${id}`;
  let author: string | undefined;
  const warnings: string[] = [];
  try {
    const metadata = await providerJson<{ title?: string; author?: string; channel?: { name?: string } }>(`https://api.supadata.ai/v1/metadata?url=${encodeURIComponent(canonical)}`, key.trim());
    title = metadata.title || title;
    author = metadata.author || metadata.channel?.name;
  } catch { warnings.push('Videometadaten konnten nicht geladen werden; Untertitel sind vorhanden.'); }
  return { title, body, author, kind: 'youtube', warnings, language: result.lang, provider: 'supadata-native' };
}

export interface SearchResult { title: string; url: string; description: string }

export async function braveSearch(query: string, key: string): Promise<SearchResult[]> {
  if (!key.trim()) throw new Error('Bitte erst einen Brave-Search-API-Schlüssel eingeben.');
  if (!query.trim()) throw new Error('Bitte einen Suchbegriff eingeben.');
  const endpoint = new URL('https://api.search.brave.com/res/v1/web/search');
  endpoint.searchParams.set('q', query.trim());
  endpoint.searchParams.set('count', '10');
  const response = await fetch(endpoint, { headers: { 'X-Subscription-Token': key.trim(), Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Brave Search antwortet mit HTTP ${response.status}. Prüfe API-Schlüssel und Guthaben.`);
  const data = await response.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
  return (data.web?.results || []).filter((item): item is { title: string; url: string; description?: string } => Boolean(item.title && item.url && /^https?:\/\//i.test(item.url))).map(item => ({ title: item.title, url: item.url, description: item.description || '' }));
}

export async function youtubeCatalog(input: string, key: string, limit: number, type: 'video' | 'short' | 'live'): Promise<string[]> {
  if (!key.trim()) throw new Error('Bitte erst einen Supadata-API-Schlüssel eingeben.');
  const value = input.trim();
  let path = 'channel';
  if (/^https?:/i.test(value)) {
    const url = new URL(value);
    if (!/(^|\.)youtube\.com$/.test(url.hostname)) throw new Error('Bitte einen YouTube-Kanal oder eine Playlist eingeben.');
    if (url.pathname === '/playlist' || url.searchParams.has('list')) path = 'playlist';
  } else if (/^(PL|UU|LL|FL|OL)[A-Za-z0-9_-]+$/.test(value)) path = 'playlist';
  const endpoint = new URL(`https://api.supadata.ai/v1/youtube/${path}/videos`);
  endpoint.searchParams.set('id', value);
  endpoint.searchParams.set('limit', String(Math.max(1, Math.min(5000, Math.floor(limit)))));
  if (path === 'channel') endpoint.searchParams.set('type', type);
  const result = await providerJson<{ videoIds?: string[]; shortIds?: string[]; liveIds?: string[] }>(endpoint.toString(), key.trim());
  const ids = path === 'channel' ? type === 'short' ? result.shortIds : type === 'live' ? result.liveIds : result.videoIds : result.videoIds;
  return Array.from(new Set((ids || []).filter(id => /^[A-Za-z0-9_-]{11}$/.test(id))));
}
