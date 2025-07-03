// content.js

// Map to store references to link elements by their unique ID
const linkElements = new Map();
let linkIdCounter = 0; // Simple counter for unique IDs

// Status counters and URL lists
const statusCounts = {
  ok: 0,
  redirect: 0,
  broken: 0,
  network_error: 0,
  invalid_url: 0,
  unknown: 0
};

const statusUrls = {
  ok: [],
  redirect: [],
  broken: [],
  network_error: [],
  invalid_url: [],
  unknown: []
};

// Function to process a single link
function processLink(linkElement) {
  const href = linkElement.href;

  // Generate a unique ID for this link
  const linkId = `link-${linkIdCounter++}`;

  // Store the link element by its unique ID for later access
  // We store it *before* sending the message, so we can always reference it.
  linkElements.set(linkId, linkElement);

  // --- Robust URL validation before sending to background script ---
  let validatedUrl;
  try {
    const urlObject = new URL(href);
    if (urlObject.protocol === 'http:' || urlObject.protocol === 'https:') {
      validatedUrl = urlObject.href;
    } else {
      console.log(`[Content Script] Skipping non-HTTP(S) or invalid protocol link: ${href}`);
      // If not a valid HTTP/S URL, remove from map and don't send to background
      linkElements.delete(linkId);
      return;
    }
  } catch (e) {
    console.warn(`[Content Script] Invalid URL found, skipping: ${href}`, e);
    // If URL constructor fails, remove from map and don't send to background
    linkElements.delete(linkId);
    return;
  }
  // --- END Robust URL validation ---

  // Log that the content script is attempting to send a message
  console.log(`[Content Script] Attempting to send message for URL: ${validatedUrl} with ID: ${linkId}`);
  // Send a message to the background script to check the link status, including the unique ID
  chrome.runtime.sendMessage({ action: 'checkLink', url: validatedUrl, linkId: linkId });
}

// Track highlighted element
let highlightedElement = null;

// Listen for messages from popup and background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle requests from popup for status counts
  if (request.action === 'getStatusCounts') {
    sendResponse({ counts: statusCounts, urls: statusUrls });
    return true;
  }
  
  // Handle export request
  if (request.action === 'exportData') {
    const csvData = generateCSV();
    sendResponse({ csvData: csvData, pageUrl: window.location.href });
    return true;
  }
  
  // Handle highlight request
  if (request.action === 'highlightLink') {
    highlightLinkOnPage(request.url, request.status);
    return true;
  }
  
  // Handle clear highlight request
  if (request.action === 'clearHighlight') {
    clearHighlight();
    return true;
  }
  
  // Handle responses from background script (these don't have an action property)
  if (request.linkId && linkElements.has(request.linkId)) {
    const linkElement = linkElements.get(request.linkId);

    // Apply styles and update counters based on the link status type
    switch (request.linkStatusType) {
      case 'redirect':
        linkElement.style.setProperty('color', 'orange', 'important');
        linkElement.title = `Redirected (Status: ${request.status})`;
        statusCounts.redirect++;
        statusUrls.redirect.push(request.url);
        break;
      case 'broken':
      case 'broken_inferred':
        linkElement.style.setProperty('color', 'red', 'important');
        linkElement.title = `Broken Link (Status: ${request.status || 'Error'})`;
        statusCounts.broken++;
        statusUrls.broken.push(request.url);
        break;
      case 'network_error':
        linkElement.style.setProperty('color', 'red', 'important');
        linkElement.title = `Network Error`;
        statusCounts.network_error++;
        statusUrls.network_error.push(request.url);
        break;
      case 'invalid_url':
        linkElement.style.setProperty('color', 'red', 'important');
        linkElement.title = `Invalid URL`;
        statusCounts.invalid_url++;
        statusUrls.invalid_url.push(request.url);
        break;
      case 'ok':
        linkElement.style.setProperty('color', 'green', 'important');
        linkElement.title = `OK (Status: ${request.status})`;
        statusCounts.ok++;
        statusUrls.ok.push(request.url);
        break;
      default:
        linkElement.style.setProperty('color', 'gray', 'important');
        linkElement.title = `Unknown Status (Status: ${request.status || 'Unknown'})`;
        statusCounts.unknown++;
        statusUrls.unknown.push(request.url);
        break;
    }
    
    linkElements.delete(request.linkId);
  }
});

// Function to find and process links within a given node
function findAndProcessLinks(node) {
  if (node.nodeType === Node.ELEMENT_NODE) {
    // If the node itself is an anchor tag
    if (node.tagName === 'A' && node.href) {
      processLink(node);
    }
    // Find all anchor tags within the node's descendants
    const links = node.querySelectorAll('a[href]');
    links.forEach(link => {
      processLink(link);
    });
  }
}

// Callback function for the MutationObserver
const observerCallback = (mutationsList, observer) => {
  for (const mutation of mutationsList) {
    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
      for (const addedNode of mutation.addedNodes) {
        findAndProcessLinks(addedNode);
      }
    }
  }
};

// Create a MutationObserver instance
const observer = new MutationObserver(observerCallback);

// Run the script when the entire page (including all resources) is fully loaded
window.addEventListener('load', () => {
  chrome.storage.local.get(['extensionEnabled'], (result) => {
    if (result.extensionEnabled !== false) {
      console.log("[Content Script] Page fully loaded. Starting initial link processing.");
      findAndProcessLinks(document.body);
      observer.observe(document.body, { childList: true, subtree: true });
      console.log("[Content Script] Started observing for dynamic content changes.");
    }
  });
});

// Generate CSV data
function generateCSV() {
  let csv = 'Page URL,Link URL,Status,OK Count,Redirect Count,Broken Count,Network Error Count,Invalid URL Count,Unknown Count\n';
  const pageUrl = window.location.href;
  
  Object.keys(statusUrls).forEach(status => {
    statusUrls[status].forEach(url => {
      csv += `"${pageUrl}","${url}","${status}",${statusCounts.ok},${statusCounts.redirect},${statusCounts.broken},${statusCounts.network_error},${statusCounts.invalid_url},${statusCounts.unknown}\n`;
    });
  });
  
  return csv;
}

// Highlight link on page
function highlightLinkOnPage(url, status) {
  // Clear previous highlight
  clearHighlight();
  
  // Get color based on status
  const statusColors = {
    ok: 'green',
    redirect: 'orange', 
    broken: 'red',
    network_error: 'red',
    invalid_url: 'red',
    unknown: 'gray'
  };
  
  const color = statusColors[status] || 'gray';
  
  // Find link with matching URL
  const links = document.querySelectorAll('a[href]');
  for (const link of links) {
    if (link.href === url) {
      highlightedElement = link;
      link.style.setProperty('outline', `2px dashed ${color}`, 'important');
      link.style.setProperty('outline-offset', '2px', 'important');
      link.scrollIntoView({ behavior: 'smooth', block: 'center' });
      break;
    }
  }
}

// Clear highlight
function clearHighlight() {
  if (highlightedElement) {
    highlightedElement.style.removeProperty('outline');
    highlightedElement.style.removeProperty('outline-offset');
    highlightedElement = null;
  }
}

// Listen for popup disconnect to clear highlights
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'popup') {
    port.onDisconnect.addListener(() => {
      clearHighlight();
    });
  }
});

// Optional: Clean up observer when the page unloads (though service worker handles script lifecycle)
window.addEventListener('unload', () => {
  observer.disconnect();
  console.log("[Content Script] MutationObserver disconnected on page unload.");
});
