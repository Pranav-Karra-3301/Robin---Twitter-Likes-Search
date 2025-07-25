let isScrolling = false;
let scrollInterval = null;
let searchText = '';
let lastHeight = 0;
let sameHeightCount = 0;
let scrollAttempts = 0;

// Listen for messages from popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'startScroll') {
    startScrolling(request.searchText);
    sendResponse({success: true});
  } else if (request.action === 'stopScroll') {
    stopScrolling();
    sendResponse({success: true});
  } else if (request.action === 'getStatus') {
    sendResponse({isScrolling: isScrolling});
  }
});

function startScrolling(targetText = '') {
  if (isScrolling) return;
  
  isScrolling = true;
  searchText = targetText.toLowerCase();
  lastHeight = document.body.scrollHeight;
  sameHeightCount = 0;
  scrollAttempts = 0;
  
  console.log('Starting scroll to end...', searchText ? `Looking for: "${targetText}"` : 'No target text');
  
  // Send progress update
  chrome.runtime.sendMessage({
    action: 'scrollProgress',
    progress: 'Starting...'
  });
  
  scrollInterval = setInterval(function() {
    performScroll();
  }, 2000); // Scroll every 2 seconds
}

function stopScrolling() {
  if (!isScrolling) return;
  
  isScrolling = false;
  if (scrollInterval) {
    clearInterval(scrollInterval);
    scrollInterval = null;
  }
  
  console.log('Scrolling stopped by user');
}

function performScroll() {
  if (!isScrolling) return;
  
  scrollAttempts++;
  
  // Check if we need to look for specific text
  if (searchText) {
    if (checkForTargetText()) {
      completeScrolling('Found target text!');
      return;
    }
  }
  
  // Get current page height
  const currentHeight = document.body.scrollHeight;
  const windowHeight = window.innerHeight;
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  
  // Check if we've reached the bottom
  if (scrollTop + windowHeight >= currentHeight - 100) {
    // Wait a moment to see if more content loads
    setTimeout(() => {
      const newHeight = document.body.scrollHeight;
      if (newHeight === currentHeight) {
        completeScrolling('Reached bottom of page');
        return;
      }
    }, 3000);
  }
  
  // Check if page height hasn't changed (no new content loading)
  if (currentHeight === lastHeight) {
    sameHeightCount++;
    if (sameHeightCount >= 5) { // If height unchanged for 5 attempts (10 seconds)
      completeScrolling('No more content loading');
      return;
    }
  } else {
    sameHeightCount = 0;
    lastHeight = currentHeight;
  }
  
  // Scroll down
  window.scrollBy(0, windowHeight * 0.8);
  
  // Send progress update
  const progress = Math.round((scrollTop / (currentHeight - windowHeight)) * 100);
  chrome.runtime.sendMessage({
    action: 'scrollProgress',
    progress: `${Math.min(progress, 99)}% - Attempt ${scrollAttempts}`
  });
  
  // Safety check - stop after too many attempts
  if (scrollAttempts > 1000) {
    completeScrolling('Maximum attempts reached');
  }
}

function checkForTargetText() {
  if (!searchText) return false;
  
  // Look for tweets containing the target text
  const tweets = document.querySelectorAll('[data-testid="tweet"]');
  
  for (let tweet of tweets) {
    const tweetText = tweet.innerText.toLowerCase();
    if (tweetText.includes(searchText)) {
      // Scroll to this tweet
      tweet.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Highlight the tweet
      tweet.style.border = '3px solid #1da1f2';
      tweet.style.borderRadius = '10px';
      
      console.log('Found target text in tweet:', tweet);
      return true;
    }
  }
  
  return false;
}

function completeScrolling(reason) {
  stopScrolling();
  
  console.log('Scrolling completed:', reason);
  
  // Send completion message to popup
  chrome.runtime.sendMessage({
    action: 'scrollComplete',
    reason: reason
  });
}

// Handle page navigation (Twitter is a SPA)
let currentUrl = location.href;
new MutationObserver(() => {
  if (location.href !== currentUrl) {
    currentUrl = location.href;
    if (isScrolling) {
      stopScrolling();
      chrome.runtime.sendMessage({
        action: 'scrollComplete',
        reason: 'Page changed'
      });
    }
  }
}).observe(document, {subtree: true, childList: true});

console.log('Scroll to End extension loaded');