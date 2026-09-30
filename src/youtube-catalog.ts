import { objectsAfterMarker, youtubeClientVersion, requestBrowserYouTubeAccess } from './youtube-browser';

export type CatalogType = 'all' | 'video' | 'short' | 'live';
export type CatalogSection = Exclude<CatalogType, 'all'>;

const MAX_CATALOG_ITEMS = 5000;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function catalogSections(type: CatalogType): CatalogSection[] {
  return type === 'all' ? ['video', 'short', 'live'] : [type];
}

export function catalogUrl(input: string, section: CatalogSection): string {
  const value = input.trim();
  const rawPlaylist = /^(?:PL|UU|LL|FL|OL)[A-Za-z0-9_-]+$/.test(value);
  const rawChannel = /^@[A-Za-z0-9._-]+$/.test(value) ? `https://www.youtube.com/${value}` : /^UC[A-Za-z0-9_-]{22}$/.test(value) ? `https://www.youtube.com/channel/${value}` : value;
  const parsed = new URL(rawPlaylist ? `https://www.youtube.com/playlist?list=${value}` : rawChannel);
  if (parsed.protocol !== 'https:' || !/^(?:www\.|m\.)?youtube\.com$/i.test(parsed.hostname)) {
    throw new Error('Bitte einen HTTPS-Link zu einem YouTube-Kanal oder einer Playlist eingeben.');
  }
  const playlistId = parsed.searchParams.get('list');
  if (playlistId && /^[A-Za-z0-9_-]{10,}$/.test(playlistId)) {
    return `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;
  }
  const parts = parsed.pathname.split('/').filter(Boolean);
  const isChannel = parts[0]?.startsWith('@') || ['channel', 'c', 'user'].includes(parts[0]);
  if (!isChannel || (parts[0] === 'channel' && !/^UC[A-Za-z0-9_-]{22}$/.test(parts[1] || '')) || (parts[0] === 'c' || parts[0] === 'user') && !parts[1]) {
    throw new Error('Bitte einen YouTube-Kanal oder eine Playlist eingeben.');
  }
  const channelParts = parts[0].startsWith('@') ? parts.slice(0, 1) : parts.slice(0, 2);
  const tab = section === 'video' ? 'videos' : section === 'short' ? 'shorts' : 'streams';
  return `https://www.youtube.com/${channelParts.map((part, index) => index === 0 && part.startsWith('@') ? `@${encodeURIComponent(part.slice(1))}` : encodeURIComponent(part)).join('/')}/${tab}`;
}

interface CatalogPage {
  ids: string[];
  continuation?: string;
  clientVersion?: string;
}

function catalogItems(value: unknown): CatalogPage {
  const ids: string[] = [];
  let continuation: string | undefined;
  let nodes = 0;
  const visit = (node: unknown, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 50 || ++nodes > 500_000) return;
    if (Array.isArray(node)) { for (const item of node) visit(item, depth + 1); return; }
    const object = node as Record<string, any>;
    if (object.continuationItemRenderer) {
      continuation ||= object.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token;
      return;
    }
    if (object.continuationItemViewModel) {
      continuation ||= object.continuationItemViewModel.continuationCommand?.innertubeCommand?.continuationCommand?.token;
      return;
    }
    const lockup = object.lockupViewModel;
    if (lockup) {
      if (lockup.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' && VIDEO_ID.test(lockup.contentId || '')) ids.push(lockup.contentId);
      return;
    }
    const shorts = object.shortsLockupViewModel;
    if (shorts) {
      const id = shorts.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId;
      if (VIDEO_ID.test(id || '')) ids.push(id);
      return;
    }
    for (const name of ['videoRenderer', 'playlistVideoRenderer', 'gridVideoRenderer', 'reelItemRenderer']) {
      const id = object[name]?.videoId;
      if (VIDEO_ID.test(id || '')) { ids.push(id); return; }
    }
    for (const child of Object.values(object)) visit(child, depth + 1);
  };
  visit(value, 0);
  return { ids: [...new Set(ids)], continuation };
}

export function parseCatalogHtml(html: string): CatalogPage {
  const initial = objectsAfterMarker(html, 'ytInitialData =')[0] as any;
  const tabs = initial?.contents?.twoColumnBrowseResultsRenderer?.tabs || initial?.contents?.singleColumnBrowseResultsRenderer?.tabs;
  const selected = tabs?.find((tab: any) => tab.tabRenderer?.selected) || tabs?.[0];
  const content = selected?.tabRenderer?.content;
  if (!content) throw new Error('YouTube hat keine lesbare Kanalliste geliefert. Prüfe den Link oder öffne die Seite im Browser.');
  return { ...catalogItems(content), clientVersion: youtubeClientVersion(html) };
}

export function parseCatalogContinuation(value: unknown): CatalogPage {
  const response = value as any;
  const actions = [...(response?.onResponseReceivedActions || []), ...(response?.onResponseReceivedEndpoints || [])];
  const contents = actions.flatMap((action: any) => action.appendContinuationItemsAction?.continuationItems || []);
  const fallback = response?.continuationContents?.richGridContinuation?.contents || response?.continuationContents?.playlistVideoListContinuation?.contents || [];
  return catalogItems(contents.length ? contents : fallback);
}

export async function fetchBrowserCatalogPage(url: string, continuation?: string, clientVersion?: string): Promise<CatalogPage> {
  // Validate the URL again in the worker, which receives untrusted messages.
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'www.youtube.com' || !/^\/(?:@|channel\/|c\/|user\/|playlist$)/.test(parsed.pathname)) {
    throw new Error('Ungültige YouTube-Kanaladresse.');
  }
  if (!continuation) {
    const response = await fetch(parsed.toString(), { credentials: 'include', redirect: 'follow' });
    if (!response.ok) throw new Error(`YouTube-Kanal antwortet mit HTTP ${response.status}.`);
    return parseCatalogHtml(await response.text());
  }
  if (continuation.length > 20_000 || !clientVersion || !/^[\w.-]{1,40}$/.test(clientVersion)) throw new Error('Ungültige YouTube-Fortsetzung.');
  const response = await fetch('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion, hl: 'en', gl: 'US' } }, continuation }),
  });
  if (!response.ok) throw new Error(`YouTube-Kanalseite antwortet mit HTTP ${response.status}.`);
  return parseCatalogContinuation(await response.json());
}

export async function requestBrowserCatalogAccess(): Promise<void> {
  await requestBrowserYouTubeAccess();
}

export async function youtubeCatalogBrowser(input: string, limit: number, section: CatalogSection, onProgress?: (count: number) => void, shouldStop?: () => boolean): Promise<string[]> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) throw new Error('Der direkte Kanalabruf ist nur in der Chrome-Erweiterung verfügbar.');
  const url = catalogUrl(input, section);
  const ids = new Set<string>();
  const seenContinuations = new Set<string>();
  let continuation: string | undefined;
  let clientVersion: string | undefined;
  for (let page = 0; page < 300 && ids.size < Math.min(MAX_CATALOG_ITEMS, limit); page++) {
    if (shouldStop?.()) break;
    const result = await chrome.runtime.sendMessage({ type: 'contexter:youtube-catalog-page', url, continuation, clientVersion }) as CatalogPage & { error?: string };
    if (result?.error) throw new Error(result.error);
    if (!result || !Array.isArray(result.ids)) throw new Error('YouTube hat keine gültige Videoliste geliefert.');
    for (const id of result.ids) if (VIDEO_ID.test(id)) ids.add(id);
    onProgress?.(ids.size);
    if (!result.continuation || seenContinuations.has(result.continuation)) break;
    seenContinuations.add(result.continuation);
    continuation = result.continuation;
    clientVersion = result.clientVersion || clientVersion;
  }
  return [...ids].slice(0, Math.min(MAX_CATALOG_ITEMS, limit));
}
