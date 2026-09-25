import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

interface SharedItem {
  id: string;
  kind: 'text' | 'file' | 'backup';
  uri: string;
  filename?: string;
  mime?: string;
}

interface ShareInboxPlugin {
  readClipboard(): Promise<{ text: string }>;
  getPending(): Promise<{ items: Array<Pick<SharedItem, 'id' | 'kind' | 'filename'>>; error?: string }>;
  readItem(options: { id: string }): Promise<SharedItem>;
  ackItem(options: { id: string }): Promise<void>;
  clearError(): Promise<void>;
  addListener(eventName: 'pending', listener: () => void): Promise<PluginListenerHandle>;
}

export const isNative = Capacitor.isNativePlatform();
const plugin = registerPlugin<ShareInboxPlugin>('ShareInbox');

export function shareInbox() {
  return plugin;
}

async function readShared(item: SharedItem): Promise<Blob> {
  if (!item.uri.startsWith('file://')) throw new Error('Geteilter Eingang hat keinen gültigen lokalen Pfad.');
  const response = await fetch(Capacitor.convertFileSrc(item.uri));
  if (!response.ok) throw new Error('Geteilter Eingang konnte nicht lokal gelesen werden.');
  return response.blob();
}

export async function sharedFile(item: SharedItem): Promise<File> {
  if (!item.filename) throw new Error('Geteilte Datei hat keinen Namen.');
  return new File([await readShared(item)], item.filename, { type: item.mime || 'application/octet-stream' });
}

export async function sharedText(item: SharedItem): Promise<string> {
  return (await readShared(item)).text();
}
