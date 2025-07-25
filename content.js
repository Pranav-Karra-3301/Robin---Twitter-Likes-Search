let isScrolling = false;
let scrollInterval = null;
let searchText = '';
let lastHeight = 0;
let sameHeightCount = 0;
let scrollAttempts = 0;
let preloadedTweets = new Map();
let scrollSpeed = 1;
let adaptiveScrolling = true;
let lastScrollTime = 0;
let contentLoadingAttempts = 0;
let forceLoadingComplete = false;
let isWaitingForContent = false;

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
  } else if (request.action === 'jumpToBottom') {
    jumpToAbsoluteBottom();
    sendResponse({success: true});
  } else if (request.action === 'forceLoad') {
    forceContentLoading();
    sendResponse({success: true});
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
  
  // Start with faster scrolling
  scrollInterval = setInterval(function() {
    performScroll();
  }, 500); // Start with 500ms intervals
}

function stopScrolling() {
  if (!isScrolling) return;
  
  isScrolling = false;
  if (scrollInterval) {
    clearInterval(scrollInterval);
    scrollInterval = null;
  }
  
  // Reset all scroll-related variables
  scrollSpeed = 1;
  adaptiveScrolling = true;
  lastScrollTime = 0;
  contentLoadingAttempts = 0;
  forceLoadingComplete = false;
  isWaitingForContent = false;
  
  console.log('Scrolling stopped by user');
}

function performScroll() {
  if (!isScrolling) return;
  
  scrollAttempts++;
  const now = Date.now();
  
  // Preload visible tweets for better performance
  preloadVisibleTweets();
  
  // Check if we need to look for specific text
  if (searchText) {
    if (checkForTargetText()) {
      completeScrolling('Found target text!');
      return;
    }
  }
  
  // Get current page height and scroll position
  const currentHeight = document.body.scrollHeight;
  const windowHeight = window.innerHeight;
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  
  // Adaptive scrolling based on content loading speed
  if (adaptiveScrolling) {
    adjustScrollSpeed(currentHeight, now);
  }
  
  // Check if we've reached the bottom
  if (scrollTop + windowHeight >= currentHeight - 100) {
    if (!isWaitingForContent) {
      isWaitingForContent = true;
      contentLoadingAttempts++;
      
      // Wait longer for content to load, especially on likes pages
      const waitTime = isLikesPage() ? 3000 : 2000;
      
      setTimeout(() => {
        const newHeight = document.body.scrollHeight;
        isWaitingForContent = false;
        
        if (newHeight === currentHeight) {
          // Try to force load more content before giving up
          if (contentLoadingAttempts < 3) {
            forceContentLoading();
            // Wait a bit more after forcing
            setTimeout(() => {
              const finalHeight = document.body.scrollHeight;
              if (finalHeight === newHeight) {
                completeScrolling('Reached bottom of page');
              }
            }, 2000);
          } else {
            completeScrolling('Reached bottom of page');
          }
          return;
        } else {
          // Reset attempts if new content loaded
          contentLoadingAttempts = 0;
        }
      }, waitTime);
    }
    return;
  }
  
  // More lenient content loading detection
  if (currentHeight === lastHeight) {
    sameHeightCount++;
    // Increased threshold and added special handling for likes pages
    const maxSameHeightCount = isLikesPage() ? 8 : 6;
    
    if (sameHeightCount >= maxSameHeightCount) {
      // Before giving up, try to force load content
      if (!forceLoadingComplete) {
        forceLoadingComplete = true;
        forceContentLoading();
        
        // Wait and check again
        setTimeout(() => {
          const newHeight = document.body.scrollHeight;
          if (newHeight === currentHeight) {
            completeScrolling('No more content loading');
          } else {
            sameHeightCount = 0;
            lastHeight = newHeight;
            forceLoadingComplete = false;
          }
        }, 3000);
        return;
      } else {
        completeScrolling('No more content loading');
        return;
      }
    }
  } else {
    sameHeightCount = 0;
    lastHeight = currentHeight;
    forceLoadingComplete = false;
  }
  
  // Dynamic scroll distance based on content density and speed
  const scrollDistance = calculateOptimalScrollDistance(windowHeight, scrollSpeed);
  
  // Perform the scroll with requestAnimationFrame for smoother animation
  requestAnimationFrame(() => {
    window.scrollBy({
      top: scrollDistance,
      behavior: scrollSpeed > 5 ? 'auto' : 'smooth'
    });
  });
  
  // Send progress update
  const progress = Math.round((scrollTop / (currentHeight - windowHeight)) * 100);
  chrome.runtime.sendMessage({
    action: 'scrollProgress',
    progress: `${Math.min(progress, 99)}% - Speed: ${scrollSpeed}x - Attempt ${scrollAttempts}`
  });
  
  lastScrollTime = now;
  
  // Safety check - stop after too many attempts
  if (scrollAttempts > 2000) { // Increased limit due to faster scrolling
    completeScrolling('Maximum attempts reached');
  }
}

function checkForTargetText() {
  if (!searchText) return false;
  
  // First check preloaded tweets for faster search
  for (let [index, tweetData] of preloadedTweets) {
    if (tweetData.text.toLowerCase().includes(searchText)) {
      // Scroll to this tweet
      tweetData.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Highlight the tweet with minimal UI impact
      const originalStyle = tweetData.element.style.cssText;
      tweetData.element.style.cssText = originalStyle + '; border: 3px solid #1da1f2 !important; border-radius: 10px !important; transition: border 0.3s ease !important;';
      
      // Remove highlight after 5 seconds to restore original UI
      setTimeout(() => {
        tweetData.element.style.cssText = originalStyle;
      }, 5000);
      
      console.log('Found target text in preloaded tweet:', tweetData.element);
      return true;
    }
  }
  
  // Fallback to DOM search if not found in preloaded tweets
  const tweets = document.querySelectorAll('[data-testid="tweet"]');
  for (let tweet of tweets) {
    const tweetText = tweet.innerText.toLowerCase();
    if (tweetText.includes(searchText)) {
      tweet.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      const originalStyle = tweet.style.cssText;
      tweet.style.cssText = originalStyle + '; border: 3px solid #1da1f2 !important; border-radius: 10px !important; transition: border 0.3s ease !important;';
      
      setTimeout(() => {
        tweet.style.cssText = originalStyle;
      }, 5000);
      
      console.log('Found target text in tweet:', tweet);
      return true;
    }
  }
  
  return false;
}

function preloadVisibleTweets() {
  const tweets = document.querySelectorAll('[data-testid="tweet"]');
  const viewportTop = window.pageYOffset;
  const viewportBottom = viewportTop + window.innerHeight;
  
  tweets.forEach((tweet, index) => {
    const rect = tweet.getBoundingClientRect();
    const tweetTop = rect.top + viewportTop;
    const tweetBottom = tweetTop + rect.height;
    
    // Preload tweets that are visible or will be visible soon
    if (tweetBottom >= viewportTop - 1000 && tweetTop <= viewportBottom + 2000) {
      if (!preloadedTweets.has(index)) {
        // Cache tweet content and interactions
        const tweetData = {
          text: tweet.innerText,
          likes: tweet.querySelector('[data-testid="like"]'),
          retweets: tweet.querySelector('[data-testid="retweet"]'),
          replies: tweet.querySelector('[data-testid="reply"]'),
          element: tweet
        };
        preloadedTweets.set(index, tweetData);
      }
    }
  });
}

function adjustScrollSpeed(currentHeight, now) {
  const timeSinceLastScroll = now - lastScrollTime;
  const heightGrowthRate = (currentHeight - lastHeight) / Math.max(timeSinceLastScroll, 100);
  
  // Increase speed if content is loading quickly
  if (heightGrowthRate > 0.5 && scrollSpeed < 10) {
    scrollSpeed = Math.min(scrollSpeed * 1.2, 10);
    // Adjust interval for faster scrolling
    if (scrollInterval) {
      clearInterval(scrollInterval);
      scrollInterval = setInterval(performScroll, Math.max(200, 500 / scrollSpeed));
    }
  }
  // Decrease speed if content is loading slowly
  else if (heightGrowthRate < 0.1 && scrollSpeed > 1) {
    scrollSpeed = Math.max(scrollSpeed * 0.8, 1);
    if (scrollInterval) {
      clearInterval(scrollInterval);
      scrollInterval = setInterval(performScroll, Math.max(200, 500 / scrollSpeed));
    }
  }
}

function calculateOptimalScrollDistance(windowHeight, speed) {
  // Base scroll distance
  let baseDistance = windowHeight * 0.9;
  
  // For high speeds, jump larger distances (up to 3 screen heights)
  if (speed > 5) {
    baseDistance = windowHeight * Math.min(speed * 0.4, 3);
  }
  
  // Check content density to avoid jumping over important content
  const tweets = document.querySelectorAll('[data-testid="tweet"]');
  const currentViewportTweets = Array.from(tweets).filter(tweet => {
    const rect = tweet.getBoundingClientRect();
    return rect.top >= 0 && rect.top <= windowHeight;
  });
  
  // If there are many tweets in viewport, use smaller jumps
  if (currentViewportTweets.length > 3) {
    baseDistance = Math.min(baseDistance, windowHeight * 1.2);
  }
  
  return baseDistance;
}

function isLikesPage() {
  const url = window.location.href;
  return url.includes('/likes') || url.includes('/favorites') || 
         document.querySelector('[data-testid="primaryColumn"] h1, [data-testid="primaryColumn"] h2')?.textContent?.toLowerCase().includes('liked');
}

function forceContentLoading() {
  console.log('Forcing content loading...');
  
  // Method 1: Trigger scroll events to encourage loading
  const scrollEvent = new Event('scroll', { bubbles: true });
  window.dispatchEvent(scrollEvent);
  
  // Method 2: Focus and blur to trigger potential lazy loading
  if (document.activeElement) {
    document.activeElement.blur();
  }
  window.focus();
  
  // Method 3: Try to click 'Show more' or similar buttons if they exist
  const loadMoreButtons = document.querySelectorAll(
    '[role="button"]:not([data-testid]), button:not([data-testid]), ' +
    '[aria-label*="more"], [aria-label*="load"], [aria-label*="show"]'
  );
  
  loadMoreButtons.forEach(button => {
    const text = button.textContent?.toLowerCase() || '';
    const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
    
    if (text.includes('more') || text.includes('load') || text.includes('show') ||
        ariaLabel.includes('more') || ariaLabel.includes('load') || ariaLabel.includes('show')) {
      try {
        button.click();
        console.log('Clicked potential load more button:', button);
      } catch (e) {
        // Ignore click errors
      }
    }
  });
  
  // Method 4: Rapid small scrolls to trigger content loading
  for (let i = 0; i < 5; i++) {
    setTimeout(() => {
      window.scrollBy(0, 50);
      setTimeout(() => window.scrollBy(0, -50), 100);
    }, i * 200);
  }
  
  // Method 5: Try to reach absolute bottom of page
  setTimeout(() => {
    window.scrollTo(0, document.body.scrollHeight);
  }, 1000);
}

function jumpToAbsoluteBottom() {
  console.log('Jumping to absolute bottom...');
  
  // First, scroll to the very bottom
  window.scrollTo({
    top: document.body.scrollHeight,
    behavior: 'auto'
  });
  
  // Wait a moment, then force loading and scroll again
  setTimeout(() => {
    forceContentLoading();
    
    setTimeout(() => {
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'auto'
      });
    }, 2000);
  }, 1000);
}

function completeScrolling(reason) {
  stopScrolling();
  
  console.log('Scrolling completed:', reason);
  console.log(`Preloaded ${preloadedTweets.size} tweets for better performance`);
  
  // Clear preloaded data
  preloadedTweets.clear();
  
  // Send completion message to popup
  chrome.runtime.sendMessage({
    action: 'scrollComplete',
    reason: reason
  });
}

// Enhanced page navigation handling for Twitter/X SPA
let currentUrl = location.href;
let navigationObserver = new MutationObserver((mutations) => {
  // Check for URL changes
  if (location.href !== currentUrl) {
    currentUrl = location.href;
    if (isScrolling) {
      stopScrolling();
      chrome.runtime.sendMessage({
        action: 'scrollComplete',
        reason: 'Page changed'
      });
    }
    // Clear preloaded data when navigating
    preloadedTweets.clear();
  }
  
  // Optimize observer performance by throttling
  if (isScrolling && mutations.length > 50) {
    // If too many mutations, temporarily pause observation
    navigationObserver.disconnect();
    setTimeout(() => {
      navigationObserver.observe(document, {subtree: true, childList: true});
    }, 1000);
  }
});

navigationObserver.observe(document, {subtree: true, childList: true});

// Performance monitoring and cleanup
function cleanupPerformance() {
  // Clear old preloaded tweets to prevent memory leaks
  if (preloadedTweets.size > 200) {
    const keysToDelete = Array.from(preloadedTweets.keys()).slice(0, 100);
    keysToDelete.forEach(key => preloadedTweets.delete(key));
  }
}

// Run cleanup every 30 seconds
setInterval(cleanupPerformance, 30000);

// Initialize performance optimizations
function initializeOptimizations() {
  // Preconnect to Twitter's CDN for faster image loading
  const preconnectLink = document.createElement('link');
  preconnectLink.rel = 'preconnect';
  preconnectLink.href = 'https://pbs.twimg.com';
  document.head.appendChild(preconnectLink);
  
  // Optimize image loading for better scroll performance
  const style = document.createElement('style');
  style.textContent = `
    [data-testid="tweet"] img {
      loading: lazy !important;
      transition: opacity 0.2s ease !important;
    }
    
    /* Ensure smooth scrolling doesn't interfere with Twitter's UI */
    html {
      scroll-behavior: auto !important;
    }
  `;
  document.head.appendChild(style);
}

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeOptimizations);
} else {
  initializeOptimizations();
}

console.log('Scroll to End extension loaded with performance optimizations');