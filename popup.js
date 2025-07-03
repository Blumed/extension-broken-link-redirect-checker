// popup.js

let lastDataHash = '';

// Update status counts and URLs in popup
function updateStatusCounts() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'getStatusCounts' }, (response) => {
      if (response && response.counts) {
        const counts = response.counts;
        const urls = response.urls;
        
        // Create hash of current data to detect changes
        const currentDataHash = JSON.stringify({ counts, urls });
        
        // Only update if data has changed
        if (currentDataHash !== lastDataHash) {
          lastDataHash = currentDataHash;
          
          document.getElementById('ok-count').textContent = counts.ok || 0;
          document.getElementById('redirect-count').textContent = counts.redirect || 0;
          document.getElementById('broken-count').textContent = counts.broken || 0;
          document.getElementById('error-count').textContent = 
            (counts.network_error || 0) + (counts.invalid_url || 0) + (counts.unknown || 0);
          
          // Update URL lists with tooltips, open links, and highlight buttons
          document.getElementById('ok-urls').innerHTML = 
            (urls.ok || []).map(url => `<div class="url-item" title="Status: OK - Link is working properly"><span>${url}</span><span class="highlight-btn" data-url="${url}" data-status="ok">🔍</span><a href="${url}" target="_blank" rel="noopener noreferrer" class="open-btn">↗</a></div>`).join('');
          document.getElementById('redirect-urls').innerHTML = 
            (urls.redirect || []).map(url => `<div class="url-item" title="Status: Redirect - Link redirects to another URL"><span>${url}</span><span class="highlight-btn" data-url="${url}" data-status="redirect">🔍</span><a href="${url}" target="_blank" rel="noopener noreferrer" class="open-btn">↗</a></div>`).join('');
          document.getElementById('broken-urls').innerHTML = 
            (urls.broken || []).map(url => `<div class="url-item" title="Status: Broken - Link returns 4xx/5xx error"><span>${url}</span><span class="highlight-btn" data-url="${url}" data-status="broken">🔍</span><a href="${url}" target="_blank" rel="noopener noreferrer" class="open-btn">↗</a></div>`).join('');
          document.getElementById('error-urls').innerHTML = 
            [...(urls.network_error || []).map(url => `<div class="url-item" title="Status: Network Error - Failed to connect"><span>${url}</span><span class="highlight-btn" data-url="${url}" data-status="network_error">🔍</span><a href="${url}" target="_blank" rel="noopener noreferrer" class="open-btn">↗</a></div>`),
             ...(urls.invalid_url || []).map(url => `<div class="url-item" title="Status: Invalid URL - Malformed URL"><span>${url}</span><span class="highlight-btn" data-url="${url}" data-status="invalid_url">🔍</span><a href="${url}" target="_blank" rel="noopener noreferrer" class="open-btn">↗</a></div>`),
             ...(urls.unknown || []).map(url => `<div class="url-item" title="Status: Unknown - Unable to determine status"><span>${url}</span><span class="highlight-btn" data-url="${url}" data-status="unknown">🔍</span><a href="${url}" target="_blank" rel="noopener noreferrer" class="open-btn">↗</a></div>`)].join('');
          
          // Add event listeners to highlight buttons
          document.querySelectorAll('.highlight-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
              highlightLink(e.target.dataset.url, e.target.dataset.status);
            });
          });
        }
        
        // Always check status message (this is lightweight)
        const totalCount = counts.ok + counts.redirect + counts.broken + counts.network_error + counts.invalid_url + counts.unknown;
        const enabled = document.getElementById('extension-toggle').checked;
        updateStatusMessage(enabled, totalCount > 0);
      }
    });
  });
}

// Highlight link on page
function highlightLink(url, status) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'highlightLink', url: url, status: status });
  });
}

// Export CSV function
function exportCSV() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'exportData' }, (response) => {
      if (response && response.csvData) {
        const blob = new Blob([response.csvData], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `link-status-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    });
  });
}

// Update status message
function updateStatusMessage(enabled, hasData = false) {
  const message = document.getElementById('status-message');
  if (enabled) {
    if (hasData) {
      message.style.display = 'none';
    } else {
      message.textContent = 'Extension is ON - Refresh page to collect data';
      message.style.backgroundColor = '#e6ffed';
      message.style.color = '#2d5a3d';
      message.style.display = 'block';
    }
  } else {
    message.textContent = 'Extension is OFF - No data will be collected';
    message.style.backgroundColor = '#ffe6e6';
    message.style.color = '#5a2d2d';
    message.style.display = 'block';
  }
}

// Connect to content script for cleanup
let port;

// Load counts when popup opens
document.addEventListener('DOMContentLoaded', () => {
  // Connect to content script
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    port = chrome.tabs.connect(tabs[0].id, { name: 'popup' });
  });
  // Load toggle state
  chrome.storage.local.get(['extensionEnabled'], (result) => {
    const enabled = result.extensionEnabled !== false;
    document.getElementById('extension-toggle').checked = enabled;
    updateStatusMessage(enabled);
  });
  
  // Handle toggle change
  document.getElementById('extension-toggle').addEventListener('change', (e) => {
    const enabled = e.target.checked;
    chrome.storage.local.set({ extensionEnabled: enabled });
    updateStatusMessage(enabled, false);
  });
  
  updateStatusCounts();
  document.getElementById('export-btn').addEventListener('click', exportCSV);
});

// Clear highlights when popup closes
window.addEventListener('beforeunload', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'clearHighlight' });
  });
});

// Refresh counts every 2 seconds
setInterval(updateStatusCounts, 2000);
