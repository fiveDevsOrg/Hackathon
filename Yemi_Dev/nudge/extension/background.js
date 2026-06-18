/*
 * background.js  --  Nudge MV3 service worker
 *
 * Two jobs:
 *  1) On toolbar-icon click, inject content-engine.js into the active tab (on demand).
 *     Re-clicking re-injects; the content script's __nudgeExt guard re-opens the bar
 *     instead of duplicating.
 *  2) Proxy AI planning requests from the content script to the Vercel /api/guide
 *     route. The service worker owns host_permissions, so it can fetch cross-origin
 *     even from CSP-strict pages.
 */

'use strict';

var API_URL = 'https://nudge-sooty.vercel.app/api/guide';

// ---- 1) Inject the engine when the icon is clicked -----------------------
chrome.action.onClicked.addListener(function (tab) {
  try {
    if (!tab || !tab.id) return;
    var url = tab.url || '';
    // Only inject into normal web pages. chrome://, edge://, about:, the Web Store,
    // and extension pages disallow scripting and would just error.
    if (url.indexOf('http://') !== 0 && url.indexOf('https://') !== 0) {
      return;
    }
    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id },
        files: ['content-engine.js']
      },
      function () {
        // Swallow injection errors (restricted page, no permission, etc.).
        if (chrome.runtime.lastError) {
          // no-op; nothing useful to surface without a popup
        }
      }
    );
  } catch (e) {
    // never throw out of the listener
  }
});

// ---- 2) Proxy AI planning requests to /api/guide -------------------------
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || msg.type !== 'nudge-plan') {
    return false; // not ours; let other listeners handle it
  }

  var payload = {
    task: typeof msg.task === 'string' ? msg.task : '',
    marks: Array.isArray(msg.marks) ? msg.marks : [],
    history: Array.isArray(msg.history) ? msg.history : []
  };

  fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(function (res) {
      if (!res.ok) {
        // 503 no_key, 500 errors, etc. -> tell the content script to fall back.
        sendResponse({ error: true });
        return null;
      }
      return res.json();
    })
    .then(function (data) {
      if (data === null) return; // already responded with error above
      if (!data || typeof data !== 'object') {
        sendResponse({ error: true });
        return;
      }
      sendResponse({
        index: typeof data.index === 'number' ? data.index : null,
        instruction: typeof data.instruction === 'string' ? data.instruction : '',
        done: data.done === true
      });
    })
    .catch(function () {
      sendResponse({ error: true });
    });

  // Keep the message channel open for the async sendResponse above.
  return true;
});
