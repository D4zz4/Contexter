export default defineBackground(() => {
  chrome.action.onClicked.addListener(tab => {
    void (async () => {
      if (tab.id && tab.url && /^https?:\/\//i.test(tab.url)) {
        await chrome.storage.session.set({ contexterActivatedTab: { id: tab.id, url: tab.url } });
      } else {
        await chrome.storage.session.remove('contexterActivatedTab');
      }
      await chrome.tabs.create({ url: chrome.runtime.getURL('/dashboard.html') });
    })();
  });

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!message || typeof message !== 'object' || (message as { type?: string }).type !== 'contexter:capture-activated-tab') return;
    void (async () => {
      const { contexterActivatedTab } = await chrome.storage.session.get('contexterActivatedTab') as { contexterActivatedTab?: { id: number; url: string } };
      if (!contexterActivatedTab) throw new Error('Öffne Contexter über das Symbol auf der gewünschten Webseite.');
      const current = await chrome.tabs.get(contexterActivatedTab.id);
      if (!current.url || !/^https?:\/\//i.test(current.url) || new URL(current.url).origin !== new URL(contexterActivatedTab.url).origin) {
        throw new Error('Der zuvor geöffnete Tab wurde geschlossen oder hat die Website gewechselt.');
      }
      const results = await chrome.scripting.executeScript({ target: { tabId: current.id! }, func: () => document.documentElement.outerHTML });
      if (!results[0]?.result) throw new Error('Der Tab enthält keinen lesbaren Inhalt.');
      sendResponse({ url: current.url, html: results[0].result });
    })().catch(error => sendResponse({ error: error instanceof Error ? error.message : String(error) }));
    return true;
  });
});
import { defineBackground } from 'wxt/utils/define-background';
