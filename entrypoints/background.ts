export default defineBackground(() => {
  chrome.action.onClicked.addListener(() => {
    void chrome.tabs.create({ url: chrome.runtime.getURL('/dashboard.html') });
  });
});
import { defineBackground } from 'wxt/utils/define-background';
