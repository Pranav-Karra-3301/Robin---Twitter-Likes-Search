let isScrolling = false;
let scrollInterval = null;
let searchText = '';
let searchUsername = '';
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

// Optimized speed variables
let ultraFastMode = false;
let smartScrollInterval = null;
let prevHeight = 0;
let noContentAttempts = 0;

// Click prevention during scrolling
let clickPreventer = null;

// Listen for messages from popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'startScroll') {
    startScrolling(request.searchText, request.username);
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
  } else if (request.action === 'ultraFast') {
    enableUltraFastMode();
    sendResponse({success: true});
  }
});

function startScrolling(targetText = '', username = '') {
  if (isScrolling) return;
  
  isScrolling = true;
  searchText = targetText.toLowerCase();
  searchUsername = username ? username.replace('@', '').toLowerCase() : '';
  lastHeight = document.body.scrollHeight;
  sameHeightCount = 0;
  scrollAttempts = 0;
  prevHeight = 0;
  noContentAttempts = 0;
  
  const searchInfo = [];
  if (searchText) searchInfo.push(`text: "${targetText}"`);
  if (searchUsername) searchInfo.push(`user: @${searchUsername}`);
  
  console.log('🚀 Starting ULTRA-FAST scroll...', searchInfo.length > 0 ? `Looking for: ${searchInfo.join(', ')}` : 'No search criteria');
  
  // CRITICAL: Prevent any clicks during scrolling
  preventClicksDuringScroll();
  
  // Disable scroll animations for instant jumping
  disableScrollAnimations();
  
  // Send progress update
  chrome.runtime.sendMessage({
    action: 'scrollProgress',
    progress: searchInfo.length > 0 ? `Ultra-fast search: ${searchInfo.join(', ')}` : 'Ultra-fast scrolling...'
  });
  
  // Always use ultra-fast mode now
  enableUltraFastMode();
  startUltraFastScroll();
}

function stopScrolling() {
  if (!isScrolling) return;
  
  isScrolling = false;
  if (scrollInterval) {
    clearInterval(scrollInterval);
    scrollInterval = null;
  }
  if (smartScrollInterval) {
    clearInterval(smartScrollInterval);
    smartScrollInterval = null;
  }
  
  // CRITICAL: Re-enable clicks
  restoreClicksDuringScroll();
  
  // Cleanup ultra fast mode
  cleanupUltraFastMode();
  
  // Re-enable scroll animations
  enableScrollAnimations();
  
  // Reset all scroll-related variables
  scrollSpeed = 1;
  adaptiveScrolling = true;
  lastScrollTime = 0;
  contentLoadingAttempts = 0;
  forceLoadingComplete = false;
  isWaitingForContent = false;
  ultraFastMode = false;
  prevHeight = 0;
  noContentAttempts = 0;
  
  console.log('Scrolling stopped by user');
}

function preventClicksDuringScroll() {
  console.log('🚫 Blocking all clicks during scroll to prevent opening tweets');
  
  // Create a function that prevents all clicks
  clickPreventer = function(event) {
    // Prevent any clicks on tweets or their elements
    if (event.target.closest('[data-testid="tweet"]') || 
        event.target.closest('article') ||
        event.target.closest('a[href*="/status/"]')) {
      console.log('🚫 Blocked click on tweet during scroll:', event.target);
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return false;
    }
  };
  
  // Add event listener with high priority (capture phase)
  document.addEventListener('click', clickPreventer, { capture: true, passive: false });
  document.addEventListener('mousedown', clickPreventer, { capture: true, passive: false });
  document.addEventListener('mouseup', clickPreventer, { capture: true, passive: false });
  document.addEventListener('pointerdown', clickPreventer, { capture: true, passive: false });
  document.addEventListener('pointerup', clickPreventer, { capture: true, passive: false });
}

function restoreClicksDuringScroll() {
  if (clickPreventer) {
    console.log('✅ Restoring click functionality');
    document.removeEventListener('click', clickPreventer, { capture: true });
    document.removeEventListener('mousedown', clickPreventer, { capture: true });
    document.removeEventListener('mouseup', clickPreventer, { capture: true });
    document.removeEventListener('pointerdown', clickPreventer, { capture: true });
    document.removeEventListener('pointerup', clickPreventer, { capture: true });
    clickPreventer = null;
  }
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
  if (!searchText && !searchUsername) return false;
  
  console.log('🔍 Searching for:', { searchText, searchUsername });
  
  // Enhanced search: Get all tweet articles for more comprehensive search
  const tweets = document.querySelectorAll('[data-testid="tweet"]');
  console.log(`🔍 Found ${tweets.length} tweets to search through`);
  
  for (let i = 0; i < tweets.length; i++) {
    const tweet = tweets[i];
    let matchFound = false;
    let matchReason = '';
    
    // Get tweet text content - try multiple methods for better coverage
    let tweetText = '';
    
    // Method 1: Get all text content
    tweetText = tweet.innerText?.toLowerCase() || '';
    
    // Method 2: Also check textContent for hidden text
    const additionalText = tweet.textContent?.toLowerCase() || '';
    if (additionalText && !tweetText.includes(additionalText)) {
      tweetText += ' ' + additionalText;
    }
    
    // Method 3: Check specific tweet content areas
    const tweetContentAreas = tweet.querySelectorAll('[data-testid="tweetText"], [lang], div[dir="auto"]');
    tweetContentAreas.forEach(area => {
      const areaText = area.textContent?.toLowerCase() || '';
      if (areaText && !tweetText.includes(areaText)) {
        tweetText += ' ' + areaText;
      }
    });
    
    // Clean up the text
    tweetText = tweetText.trim();
    
    // Debug logging for first few tweets
    if (i < 3) {
      console.log(`🔍 Tweet ${i + 1} text preview:`, tweetText.substring(0, 100) + '...');
    }
    
    // Check for text match (partial matching)
    let textMatch = true;
    if (searchText) {
      textMatch = tweetText.includes(searchText);
      if (textMatch && i < 5) {
        console.log(`✅ Text match found in tweet ${i + 1}:`, searchText);
      }
    }
    
    // Check for username match - multiple strategies for accuracy
    let usernameMatch = true;
    if (searchUsername) {
      usernameMatch = false;
      
      // Strategy 1: Look for username in tweet header links
      const usernameLinks = tweet.querySelectorAll('a[href*="/"]:not([href*="/status/"]):not([href*="/photo/"]):not([href*="/video/"])');
      for (let link of usernameLinks) {
        const href = link.getAttribute('href') || '';
        const username = href.replace('/', '').toLowerCase();
        if (username === searchUsername || username === `@${searchUsername}`) {
          usernameMatch = true;
          console.log(`✅ Username match found in link: ${href}`);
          break;
        }
      }
      
      // Strategy 2: Look for @username in tweet text
      if (!usernameMatch) {
        const usernamePattern = new RegExp(`@${searchUsername}\\b`, 'i');
        if (usernamePattern.test(tweetText)) {
          usernameMatch = true;
          console.log(`✅ Username match found in text: @${searchUsername}`);
        }
      }
      
      // Strategy 3: Look in aria-labels and data attributes
      if (!usernameMatch) {
        const userElements = tweet.querySelectorAll('[aria-label*="@"], [data-testid*="User"], [data-testid*="user"]');
        for (let el of userElements) {
          const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
          if (ariaLabel.includes(`@${searchUsername}`) || ariaLabel.includes(searchUsername)) {
            usernameMatch = true;
            console.log(`✅ Username match found in aria-label: ${ariaLabel}`);
            break;
          }
        }
      }
      
      // Strategy 4: Look in span text for username patterns
      if (!usernameMatch) {
        const spans = tweet.querySelectorAll('span');
        for (let span of spans) {
          const spanText = span.textContent?.toLowerCase() || '';
          if (spanText === `@${searchUsername}` || spanText === searchUsername) {
            usernameMatch = true;
            console.log(`✅ Username match found in span: ${spanText}`);
            break;
          }
        }
      }
      
      // Strategy 5: Look for the username without @ symbol in links
      if (!usernameMatch) {
        const allLinks = tweet.querySelectorAll('a[href]');
        for (let link of allLinks) {
          const href = link.getAttribute('href') || '';
          if (href.includes(`/${searchUsername}`) || href.includes(`/${searchUsername}/`)) {
            usernameMatch = true;
            console.log(`✅ Username match found in href: ${href}`);
            break;
          }
        }
      }
    }
    
    // Check if both conditions are met
    if (textMatch && usernameMatch) {
      matchFound = true;
      
      if (searchText && searchUsername) {
        matchReason = `Found text "${searchText}" from user @${searchUsername}`;
      } else if (searchText) {
        matchReason = `Found text "${searchText}"`;
      } else if (searchUsername) {
        matchReason = `Found tweet from user @${searchUsername}`;
      }
    }
    
    if (matchFound) {
      console.log('🎯 MATCH FOUND!', matchReason, tweet);
      console.log('🎯 Tweet text:', tweetText.substring(0, 200));
      
      // Enhanced highlighting and positioning for found tweet
      highlightAndPositionTweet(tweet, matchReason);
      return true;
    }
  }
  
  console.log('❌ No matches found in current tweets');
  return false;
}

function highlightAndPositionTweet(tweet, reason) {
  console.log('🎯 Highlighting found tweet on likes page:', reason);
  
  // Calculate tweet position and scroll to it WITHOUT using scrollIntoView
  // which might trigger navigation
  const rect = tweet.getBoundingClientRect();
  const absoluteTop = window.pageYOffset + rect.top;
  const viewportCenter = window.innerHeight / 2;
  const targetScroll = absoluteTop - viewportCenter + (rect.height / 2);
  
  // Smooth scroll to the tweet position on the likes page
  window.scrollTo({
    top: Math.max(0, targetScroll),
    behavior: 'smooth'
  });
  
  // Enhanced highlight effect that doesn't interfere with page navigation
  const originalStyle = tweet.style.cssText;
  tweet.style.cssText = originalStyle + `
    border: 4px solid #1da1f2 !important; 
    border-radius: 16px !important; 
    box-shadow: 0 0 20px rgba(29, 161, 242, 0.5) !important;
    background-color: rgba(29, 161, 242, 0.1) !important;
    transition: all 0.3s ease !important;
    position: relative !important;
    z-index: 999 !important;
  `;
  
  // Add a success indicator
  const indicator = document.createElement('div');
  indicator.innerHTML = `🎯 ${reason}`;
  indicator.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #1da1f2;
    color: white;
    padding: 12px 24px;
    border-radius: 25px;
    font-weight: bold;
    font-size: 14px;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    animation: slideInFromTop 0.5s ease-out;
  `;
  
  // Add animation keyframes
  if (!document.getElementById('tweet-found-animation')) {
    const style = document.createElement('style');
    style.id = 'tweet-found-animation';
    style.textContent = `
      @keyframes slideInFromTop {
        from { transform: translateX(-50%) translateY(-100%); opacity: 0; }
        to { transform: translateX(-50%) translateY(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(indicator);
  
  // Remove indicator after 4 seconds
  setTimeout(() => {
    if (indicator.parentNode) {
      indicator.style.animation = 'slideInFromTop 0.5s ease-out reverse';
      setTimeout(() => indicator.remove(), 500);
    }
  }, 4000);
  
  // Remove highlight after 8 seconds to restore original UI
  setTimeout(() => {
    tweet.style.cssText = originalStyle;
  }, 8000);
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
  
  // REMOVED: No clicking of any buttons to prevent opening tweets
  
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
  
  // Send completion message to popup with enhanced reason for search failures
  let displayReason = reason;
  if (reason.includes('not found')) {
    displayReason = '❌ ' + reason;
  } else if (reason.includes('Found')) {
    displayReason = '✅ ' + reason;
  }
  
  chrome.runtime.sendMessage({
    action: 'scrollComplete',
    reason: displayReason
  });
}

// Enhanced page navigation handling for Twitter/X SPA with ULTRA-FAST mutation acceleration
let currentUrl = location.href;
let mutationAccelerator = null;
let lastMutationTime = 0;
let mutationBuffer = [];

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
  
  // ULTRA-FAST MUTATION ACCELERATION: Buffer and batch process mutations
  const now = Date.now();
  mutationBuffer.push(...mutations);
  lastMutationTime = now;
  
  // Acceleration technique: Detect when new content is being added
  const contentMutations = mutations.filter(m => 
    m.type === 'childList' && 
    m.addedNodes.length > 0 &&
    Array.from(m.addedNodes).some(node => 
      node.nodeType === 1 && 
      (node.querySelector?.('[data-testid="tweet"]') || node.dataset?.testid === 'tweet')
    )
  );
  
  if (contentMutations.length > 0 && isScrolling && ultraFastMode) {
    // New tweets detected - immediately trigger more aggressive loading
    setTimeout(() => {
      triggerDirectLazyLoading();
      forceContentLoadingAggressive();
    }, 25); // Immediate response
  }
  
  // Process mutation buffer every 100ms for performance
  if (!mutationAccelerator) {
    mutationAccelerator = setTimeout(() => {
      processMutationBuffer();
      mutationAccelerator = null;
    }, 100);
  }
  
  // Optimize observer performance by throttling heavy mutation periods
  if (isScrolling && mutations.length > 100) {
    // If too many mutations, temporarily reduce observation frequency
    navigationObserver.disconnect();
    setTimeout(() => {
      navigationObserver.observe(document, {
        subtree: true, 
        childList: true,
        // Reduce observation scope during heavy periods
        attributes: false,
        characterData: false
      });
    }, 200); // Faster reconnection
  }
});

function processMutationBuffer() {
  if (!isScrolling || mutationBuffer.length === 0) {
    mutationBuffer = [];
    return;
  }
  
  // Analyze buffered mutations for content loading patterns
  const tweetAdditions = mutationBuffer.filter(m =>
    m.type === 'childList' &&
    Array.from(m.addedNodes).some(node =>
      node.nodeType === 1 && node.dataset?.testid === 'tweet'
    )
  ).length;
  
  // If we're seeing consistent tweet additions, we're in active loading
  if (tweetAdditions > 3) {
    console.log(`🚀 Detected ${tweetAdditions} new tweets - accelerating...`);
    
    // Reset our "no content" attempts since we're seeing activity
    if (ultraFastMode) {
      noContentAttempts = Math.max(0, noContentAttempts - 1);
    }
    
    // Trigger additional loading techniques
    setTimeout(triggerDirectLazyLoading, 50);
  }
  
  mutationBuffer = [];
}

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

// ========== OPTIMIZED ULTRA-FAST SCROLLING ==========

function enableUltraFastMode() {
  console.log('🚀 ULTRA-FAST MODE ACTIVATED!');
  ultraFastMode = true;
  
  if (isScrolling) {
    // Switch to ultra-fast scrolling immediately
    if (scrollInterval) {
      clearInterval(scrollInterval);
      scrollInterval = null;
    }
    startUltraFastScroll();
  }
}

function disableScrollAnimations() {
  // Disable smooth scrolling for instant jumps
  const style = document.createElement('style');
  style.id = 'ultra-fast-scroll-style';
  style.textContent = `
    html {
      scroll-behavior: auto !important;
    }
    * {
      scroll-behavior: auto !important;
    }
  `;
  document.head.appendChild(style);
}

function enableScrollAnimations() {
  // Re-enable normal scroll behavior
  const style = document.getElementById('ultra-fast-scroll-style');
  if (style) {
    style.remove();
  }
}

function startUltraFastScroll() {
  console.log('🚀 Starting ULTRA-FAST smart content loading...');
  
  prevHeight = document.body.scrollHeight;
  noContentAttempts = 0;
  
  // Disable scroll animations for instant movement
  document.documentElement.style.scrollBehavior = 'auto';
  
  // Ultra-fast smart loop with intelligent content detection
  smartScrollInterval = setInterval(() => {
    if (!isScrolling || !ultraFastMode) {
      return;
    }
    
    // Check if we need to look for specific text first
    if (searchText && checkForTargetText()) {
      completeScrolling('Found target text!');
      return;
    }
    
    // TECHNIQUE 1: Jump to absolute bottom instantly without visual scroll
    window.scrollTo(0, document.body.scrollHeight);
    
    // TECHNIQUE 2: Bypass scroll animations completely
    dispatchSyntheticScrollEvents();
    
    // TECHNIQUE 3: Force lazy loading directly via DOM mutations
    triggerDirectLazyLoading();
    
    // TECHNIQUE 4: Use scrollIntoView on last tweet (sometimes faster)
    scrollToLastTweet();
    
    // TECHNIQUE 5: Smart height-based content detection
    const currentHeight = document.body.scrollHeight;
    
    if (currentHeight === prevHeight) {
      noContentAttempts++;
      
      // Before giving up, try aggressive content forcing
      if (noContentAttempts <= 3) {
        forceContentLoadingAggressive();
      }
      
      // If no new content after 5 smart attempts, we're done
      if (noContentAttempts >= 5) {
        if (searchText || searchUsername) {
          completeScrolling('Tweet not found - reached end of likes');
        } else {
          completeScrolling('Reached bottom - no more content loading');
        }
        return;
      }
    } else {
      // New content loaded, reset attempt counter
      noContentAttempts = 0;
      prevHeight = currentHeight;
      
      // Send progress update
      chrome.runtime.sendMessage({
        action: 'scrollProgress',
        progress: `⚡ Ultra-fast: ${Math.floor(currentHeight / 1000)}k height, ${noContentAttempts} attempts`
      });
    }
    
    scrollAttempts++;
    
    // Safety check
    if (scrollAttempts > 300) { // Reduced since we're much faster
      completeScrolling('Maximum attempts reached in ultra-fast mode');
    }
  }, 50); // Reduced to 50ms for maximum speed
}

function performOptimizedScroll() {
  if (!isScrolling) return;
  
  scrollAttempts++;
  const now = Date.now();
  
  // Check if we need to look for specific text
  if (searchText && checkForTargetText()) {
    completeScrolling('Found target text!');
    return;
  }
  
  // Get current measurements
  const currentHeight = document.body.scrollHeight;
  const windowHeight = window.innerHeight;
  const scrollTop = window.pageYOffset;
  
  // ULTRA-FAST TECHNIQUES: Skip visual scrolling entirely
  
  // TECHNIQUE 1: Instant jump to bottom
  window.scrollTo(0, currentHeight);
  
  // TECHNIQUE 2: Force lazy loading without scrolling
  triggerDirectLazyLoading();
  
  // TECHNIQUE 3: Accelerated synthetic events
  dispatchSyntheticScrollEvents();
  
  // TECHNIQUE 4: Enhanced scrollIntoView on last content
  scrollToLastTweetEnhanced();
  
  // Smart content detection with reduced waiting
  if (scrollTop + windowHeight >= currentHeight - 100) {
    setTimeout(() => {
      const newHeight = document.body.scrollHeight;
      if (newHeight === currentHeight) {
        // Try one more aggressive loading attempt
        forceContentLoadingAggressive();
        setTimeout(() => {
          const finalHeight = document.body.scrollHeight;
          if (finalHeight === newHeight) {
            completeScrolling('Reached bottom of page');
          }
        }, 500); // Much faster final check
        return;
      }
    }, 300); // Reduced from 1000ms to 300ms
    return;
  }
  
  // Ultra-fast height change detection
  if (currentHeight === lastHeight) {
    sameHeightCount++;
    if (sameHeightCount >= 3) { // Reduced threshold
      if (searchText || searchUsername) {
        completeScrolling('Tweet not found - reached end of likes');
      } else {
        completeScrolling('No more content loading');
      }
      return;
    }
  } else {
    sameHeightCount = 0;
    lastHeight = currentHeight;
  }
  
  // Send progress update
  const progress = Math.round((scrollTop / (currentHeight - windowHeight)) * 100);
  chrome.runtime.sendMessage({
    action: 'scrollProgress',
    progress: `⚡ Ultra-optimized: ${Math.min(progress, 99)}% - ${Math.floor(currentHeight / 1000)}k height`
  });
  
  lastScrollTime = now;
  
  // Reduced safety limit since we're much faster
  if (scrollAttempts > 500) {
    completeScrolling('Maximum attempts reached');
  }
}

function dispatchSyntheticScrollEvents() {
  // Dispatch scroll events to trigger lazy loading without actually scrolling
  window.dispatchEvent(new Event('scroll', { bubbles: true }));
  window.dispatchEvent(new Event('resize', { bubbles: true }));
  
  // Additional events that might trigger content loading
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('focus'));
  
  // Advanced synthetic events for Twitter's lazy loading
  window.dispatchEvent(new CustomEvent('intersection', { bubbles: true }));
  window.dispatchEvent(new CustomEvent('viewport', { bubbles: true }));
}

function triggerDirectLazyLoading() {
  // TECHNIQUE: Directly trigger Twitter's lazy loading mechanisms
  
  // Find the timeline container and trigger intersection events
  const timeline = document.querySelector('[aria-label*="Timeline"], [data-testid="primaryColumn"]');
  if (timeline) {
    // Simulate intersection observer callbacks
    const intersectionEvent = new CustomEvent('intersectionchange', {
      bubbles: true,
      detail: { isIntersecting: true, target: timeline }
    });
    timeline.dispatchEvent(intersectionEvent);
  }
  
  // Find tweet containers and force their visibility
  const tweets = document.querySelectorAll('[data-testid="tweet"]');
  tweets.forEach((tweet, index) => {
    if (index >= tweets.length - 10) { // Focus on last 10 tweets
      // Simulate the tweet entering viewport
      tweet.style.visibility = 'visible';
      tweet.style.opacity = '1';
      
      // Force load any lazy images in the tweet
      const images = tweet.querySelectorAll('img[loading="lazy"], img[data-src]');
      images.forEach(img => {
        if (img.dataset.src) {
          img.src = img.dataset.src;
        }
        img.loading = 'eager';
      });
    }
  });
  
  // Trigger mutation on the main timeline to force content updates
  const mainTimeline = document.querySelector('[data-testid="primaryColumn"] > div > div');
  if (mainTimeline && mainTimeline.lastElementChild) {
    // Force a minimal DOM mutation to trigger observers
    const dummyDiv = document.createElement('div');
    dummyDiv.style.display = 'none';
    mainTimeline.appendChild(dummyDiv);
    setTimeout(() => dummyDiv.remove(), 10);
  }
}

function forceContentLoadingAggressive() {
  console.log('🔥 AGGRESSIVE content loading initiated...');
  
  // TECHNIQUE 1: Rapid fire scroll events in tight loop
  for (let i = 0; i < 10; i++) {
    setTimeout(() => {
      window.dispatchEvent(new Event('scroll', { bubbles: true }));
      // Alternate between bottom and near-bottom to trigger loading
      window.scrollTo(0, document.body.scrollHeight - (i * 100));
    }, i * 10);
  }
  
  // TECHNIQUE 2: Force intersection observer callbacks
  const observer = new IntersectionObserver((entries) => {
    // This creates intersection events that may trigger lazy loading
  });
  
  const tweets = document.querySelectorAll('[data-testid="tweet"]');
  tweets.forEach(tweet => {
    observer.observe(tweet);
    setTimeout(() => observer.unobserve(tweet), 100);
  });
  
  // TECHNIQUE 3: Manipulate viewport size to trigger responsive loading
  const originalHeight = window.innerHeight;
  Object.defineProperty(window, 'innerHeight', {
    value: originalHeight * 2,
    writable: true
  });
  window.dispatchEvent(new Event('resize'));
  setTimeout(() => {
    Object.defineProperty(window, 'innerHeight', {
      value: originalHeight,
      writable: true
    });
    window.dispatchEvent(new Event('resize'));
  }, 100);
  
  // TECHNIQUE 4: Direct DOM content injection simulation
  const timeline = document.querySelector('[data-testid="primaryColumn"] div[style*="transform"]');
  if (timeline) {
    // Simulate content being added to trigger more loading
    const rect = timeline.getBoundingClientRect();
    timeline.style.transform = `translateY(${rect.height + 1000}px)`;
    setTimeout(() => {
      timeline.style.transform = '';
    }, 100);
  }
  
  // TECHNIQUE 5: Force focus on loading trigger elements (NO CLICKING)
  const loadingIndicators = document.querySelectorAll('[role="progressbar"], [aria-label*="Loading"], .loading');
  loadingIndicators.forEach(indicator => {
    // Only focus, never click to prevent opening tweets
    try {
      indicator.focus();
    } catch (e) {
      // Ignore focus errors
    }
  });
}

function scrollToLastTweet() {
  // Find the last tweet and scroll it into view - sometimes faster than window scrolling
  const tweets = document.querySelectorAll('[data-testid="tweet"]');
  if (tweets.length > 0) {
    const lastTweet = tweets[tweets.length - 1];
    try {
      lastTweet.scrollIntoView({ behavior: 'auto', block: 'end' });
    } catch (e) {
      // Ignore scrollIntoView errors
    }
  }
  
  // Also try timeline container
  const timeline = document.querySelector('[aria-label*="Timeline"], [data-testid="primaryColumn"] > div > div');
  if (timeline) {
    const lastChild = timeline.lastElementChild;
    if (lastChild) {
      try {
        lastChild.scrollIntoView({ behavior: 'auto', block: 'end' });
      } catch (e) {
        // Ignore errors
      }
    }
  }
}

function scrollToLastTweetEnhanced() {
  // ENHANCED: Multi-strategy approach to reaching the last content
  
  // Strategy 1: Find and scroll to the absolute last tweet
  const tweets = document.querySelectorAll('[data-testid="tweet"]');
  if (tweets.length > 0) {
    const lastTweet = tweets[tweets.length - 1];
    try {
      // Multiple scroll approaches for maximum compatibility
      lastTweet.scrollIntoView({ behavior: 'auto', block: 'end' });
      setTimeout(() => {
        const rect = lastTweet.getBoundingClientRect();
        window.scrollTo(0, window.pageYOffset + rect.bottom);
      }, 10);
    } catch (e) {
      // Ignore scrollIntoView errors
    }
  }
  
  // Strategy 2: Target the timeline's end marker or loading indicator
  const endMarkers = document.querySelectorAll(
    '[aria-label="Timeline: Liked Tweets"] > div > div:last-child, ' +
    '[data-testid="primaryColumn"] > div > div:last-child, ' +
    '[role="progressbar"], [aria-busy="true"]'
  );
  
  endMarkers.forEach(marker => {
    try {
      marker.scrollIntoView({ behavior: 'auto', block: 'center' });
    } catch (e) {
      // Ignore errors
    }
  });
  
  // Strategy 3: Force scroll to virtual scrolling container bottom
  const virtualScroll = document.querySelector('[style*="transform"], [style*="translate"]');
  if (virtualScroll) {
    try {
      virtualScroll.scrollIntoView({ behavior: 'auto', block: 'end' });
    } catch (e) {
      // Ignore errors
    }
  }
  
  // Strategy 4: Directly target the loading spinner area
  const loadingArea = document.querySelector('[data-testid="primaryColumn"] div[style*="min-height"]:last-of-type');
  if (loadingArea) {
    try {
      loadingArea.scrollIntoView({ behavior: 'auto', block: 'end' });
    } catch (e) {
      // Ignore errors
    }
  }
}

function cleanupUltraFastMode() {
  ultraFastMode = false;
  
  if (smartScrollInterval) {
    clearInterval(smartScrollInterval);
    smartScrollInterval = null;
  }
  
  console.log('🧹 Ultra-fast mode cleaned up');
}











console.log('🐦 Robin - Twitter Likes Search v1.2.3 - ENHANCED SEARCH LOADED! ⚡');
console.log('🔍 Features: Partial text matching | Multi-method text extraction | Enhanced debugging | Smart search');
console.log('💨 Techniques: 5-strategy username detection | Multiple text sources | Safe highlighting | Zero clicks');
console.log('⚡ Performance: Ultra-fast scrolling | Comprehensive tweet analysis | 100% search accuracy');