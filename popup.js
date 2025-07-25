document.addEventListener('DOMContentLoaded', function() {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const jumpBottomBtn = document.getElementById('jumpBottomBtn');
  const forceLoadBtn = document.getElementById('forceLoadBtn');
  const reindexBtn = document.getElementById('reindexBtn');
  const searchTextInput = document.getElementById('searchText');
  const usernameTextInput = document.getElementById('usernameText');
  const embedSearchToggle = document.getElementById('embedSearchToggle');
  const indexSearchInput = document.getElementById('indexSearch');
  const searchResultsDiv = document.getElementById('searchResults');
  const statusDiv = document.getElementById('status');
  
  // Load saved search text, username, and embed toggle
  chrome.storage.sync.get(['searchText', 'usernameText', 'embedSearchEnabled'], function(result) {
    if (result.searchText) {
      searchTextInput.value = result.searchText;
    }
    if (result.usernameText) {
      usernameTextInput.value = result.usernameText;
    }
    if (result.embedSearchEnabled !== undefined) {
      embedSearchToggle.checked = result.embedSearchEnabled;
    }
    // Update button text after loading stored values
    updateButtonText();
  });
  
  // Update button text based on search criteria
  function updateButtonText() {
    const searchText = searchTextInput.value.trim();
    const usernameText = usernameTextInput.value.trim();
    
    if (searchText || usernameText) {
      startBtn.textContent = 'Find Tweet';
    } else {
      startBtn.textContent = 'Scroll to Bottom';
    }
  }
  
  // Save search text when changed
  searchTextInput.addEventListener('input', function() {
    chrome.storage.sync.set({
      searchText: searchTextInput.value
    });
    updateButtonText();
  });
  
  // Save username when changed
  usernameTextInput.addEventListener('input', function() {
    chrome.storage.sync.set({
      usernameText: usernameTextInput.value
    });
    updateButtonText();
  });
  
  // Save embed search toggle when changed
  embedSearchToggle.addEventListener('change', function() {
    chrome.storage.sync.set({
      embedSearchEnabled: embedSearchToggle.checked
    });
    
    // Send message to content script to toggle embed search
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0] && tabs[0].url.includes('x.com') && tabs[0].url.includes('/likes')) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'toggleEmbedSearch',
          enabled: embedSearchToggle.checked
        });
      }
    });
  });
  
  // Index search functionality
  indexSearchInput.addEventListener('input', function() {
    const query = indexSearchInput.value.trim();
    if (query) {
      performPopupSearch(query);
    } else {
      searchResultsDiv.style.display = 'none';
    }
  });
  
  // Update button text on initial load
  updateButtonText();
  
  // Check if scrolling is already active
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {action: 'getStatus'}, function(response) {
      if (chrome.runtime.lastError) {
        statusDiv.textContent = 'Please navigate to Twitter/X likes page';
        return;
      }
      
      if (response && response.isScrolling) {
        showStopButton();
        statusDiv.textContent = 'Scrolling in progress...';
      }
    });
  });
  
  startBtn.addEventListener('click', function() {
    const searchText = searchTextInput.value.trim();
    const usernameText = usernameTextInput.value.trim();
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const tab = tabs[0];
      
      // Check if we're on Twitter/X
      if (!tab.url.includes('twitter.com') && !tab.url.includes('x.com')) {
        statusDiv.textContent = 'Please navigate to Twitter/X first';
        return;
      }
      
      // Send message to content script
      chrome.tabs.sendMessage(tab.id, {
        action: 'startScroll',
        searchText: searchText,
        username: usernameText
      }, function(response) {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = 'Error: Please refresh the page';
          return;
        }
        
        showStopButton();
        const searchInfo = [];
        if (searchText) searchInfo.push(`text: "${searchText}"`);
        if (usernameText) searchInfo.push(`user: ${usernameText}`);
        
        statusDiv.textContent = searchInfo.length > 0 
          ? `Ultra-fast scrolling... (${searchInfo.join(', ')})`
          : 'Ultra-fast scrolling started...';
      });
    });
  });
  
  stopBtn.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'stopScroll'}, function(response) {
        showStartButton();
        statusDiv.textContent = 'Scrolling stopped';
      });
    });
  });
  
  jumpBottomBtn.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const tab = tabs[0];
      
      if (!tab.url.includes('twitter.com') && !tab.url.includes('x.com')) {
        statusDiv.textContent = 'Please navigate to Twitter/X first';
        return;
      }
      
      chrome.tabs.sendMessage(tab.id, {action: 'jumpToBottom'}, function(response) {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = 'Error: Please refresh the page';
          return;
        }
        statusDiv.textContent = 'Jumping to bottom...';
      });
    });
  });
  
  forceLoadBtn.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const tab = tabs[0];
      
      if (!tab.url.includes('twitter.com') && !tab.url.includes('x.com')) {
        statusDiv.textContent = 'Please navigate to Twitter/X first';
        return;
      }
      
      chrome.tabs.sendMessage(tab.id, {action: 'forceLoad'}, function(response) {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = 'Error: Please refresh the page';
          return;
        }
        statusDiv.textContent = 'Forcing content load...';
      });
    });
  });
  
  reindexBtn.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const tab = tabs[0];
      
      if (!tab.url.includes('x.com') || !tab.url.includes('/likes')) {
        statusDiv.textContent = 'Please navigate to a X.com likes page first';
        return;
      }
      
      if (confirm('Are you sure you want to reindex all tweets? This will delete the current index and rebuild it from scratch. This may take several minutes.')) {
        chrome.tabs.sendMessage(tab.id, {action: 'reindexAll'}, function(response) {
          if (chrome.runtime.lastError) {
            statusDiv.textContent = 'Error: Please refresh the page';
            return;
          }
          statusDiv.textContent = 'Starting reindex...';
        });
      }
    });
  });
  
  
  function showStartButton() {
    startBtn.style.display = 'block';
    stopBtn.style.display = 'none';
  }
  
  function showStopButton() {
    startBtn.style.display = 'none';
    stopBtn.style.display = 'block';
  }
  
  // Listen for messages from content script
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'scrollComplete') {
      showStartButton();
      statusDiv.textContent = request.reason || 'Scrolling completed';
    } else if (request.action === 'scrollProgress') {
      statusDiv.textContent = `Scrolling... ${request.progress}`;
    }
  });
  
  // Search functionality
  function performPopupSearch(query) {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0] && tabs[0].url.includes('x.com') && tabs[0].url.includes('/likes')) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'searchIndex',
          query: query
        }, function(response) {
          if (response && response.results) {
            displaySearchResults(response.results);
          }
        });
      } else {
        searchResultsDiv.innerHTML = '<div style="color: #666; text-align: center; padding: 10px;">Please navigate to a X.com likes page</div>';
        searchResultsDiv.style.display = 'block';
      }
    });
  }
  
  function displaySearchResults(results) {
    if (results.length === 0) {
      searchResultsDiv.innerHTML = '<div style="color: #666; text-align: center; padding: 10px;">No results found</div>';
    } else {
      const resultsHtml = results.slice(0, 10).map(tweet => {
        const truncatedText = tweet.text.length > 80 ? tweet.text.substring(0, 80) + '...' : tweet.text;
        const authorDisplay = tweet.displayName ? `${tweet.displayName} (@${tweet.originalAuthor || tweet.username})` : `@${tweet.username}`;
        
        return `
          <div class="search-result-item" data-tweet-url="${tweet.url}">
            <div class="search-result-author">${authorDisplay}</div>
            <div class="search-result-text">${truncatedText}</div>
            <div class="search-result-meta">
              ${tweet.timestamp ? new Date(tweet.timestamp).toLocaleDateString() : ''} • 
              ❤️ ${tweet.metrics?.likes || 0} 🔄 ${tweet.metrics?.retweets || 0}
              ${tweet.hasImage ? ' 🖼️' : ''}${tweet.hasVideo ? ' 📹' : ''}
            </div>
          </div>
        `;
      }).join('');
      
      searchResultsDiv.innerHTML = resultsHtml;
      
      // Add click listeners
      const resultItems = searchResultsDiv.querySelectorAll('.search-result-item');
      resultItems.forEach(item => {
        item.addEventListener('click', function() {
          const url = item.getAttribute('data-tweet-url');
          if (url) {
            chrome.tabs.create({ url: url });
          }
        });
      });
    }
    
    searchResultsDiv.style.display = 'block';
  }
});