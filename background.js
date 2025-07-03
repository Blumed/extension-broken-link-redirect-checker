// background.js

// Listen for messages from the content script
chrome.runtime.onMessage.addListener((request, sender) => {
  if (request.action === 'checkLink') {
    const url = request.url;
    const tabId = sender.tab.id;
    
    // Validate URL
    try {
      const urlObject = new URL(url);
      if (urlObject.protocol !== 'http:' && urlObject.protocol !== 'https:') {
        chrome.tabs.sendMessage(tabId, {
          url: url,
          linkId: request.linkId,
          status: 0,
          linkStatusType: 'invalid_url',
          isBroken: true
        });
        return;
      }
    } catch (e) {
      chrome.tabs.sendMessage(tabId, {
        url: url,
        linkId: request.linkId,
        status: 0,
        linkStatusType: 'invalid_url',
        isBroken: true
      });
      return;
    }

    // Check link status
    fetch(url, { method: 'HEAD', mode: 'no-cors' })
      .then(response => {
        let linkStatusType = 'unknown';
        if (response.redirected) {
          linkStatusType = 'redirect';
        } else if (response.status >= 400) {
          linkStatusType = 'broken';
        } else if (response.status === 200) {
          linkStatusType = 'ok';
        } else if (response.status === 0) {
          linkStatusType = 'broken_inferred';
        }
        
        chrome.tabs.sendMessage(tabId, {
          url: url,
          linkId: request.linkId,
          status: response.status,
          redirected: response.redirected,
          linkStatusType: linkStatusType,
          isBroken: (linkStatusType === 'broken' || linkStatusType === 'broken_inferred')
        });
      })
      .catch(() => {
        chrome.tabs.sendMessage(tabId, {
          url: url,
          linkId: request.linkId,
          status: 0,
          linkStatusType: 'network_error',
          isBroken: true
        });
      });
  }
});


