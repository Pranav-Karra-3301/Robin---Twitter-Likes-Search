document.addEventListener('DOMContentLoaded', function() {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const jumpBottomBtn = document.getElementById('jumpBottomBtn');
  const forceLoadBtn = document.getElementById('forceLoadBtn');
  const reindexBtn = document.getElementById('reindexBtn');
  const searchTextInput = document.getElementById('searchText');
  const usernameTextInput = document.getElementById('usernameText');
  const statusDiv = document.getElementById('status');
  
  // Load saved search text and username
  chrome.storage.sync.get(['searchText', 'usernameText'], function(result) {
    if (result.searchText) {
      searchTextInput.value = result.searchText;
    }
    if (result.usernameText) {
      usernameTextInput.value = result.usernameText;
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
});