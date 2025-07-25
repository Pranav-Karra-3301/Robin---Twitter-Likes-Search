document.addEventListener('DOMContentLoaded', function() {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const searchTextInput = document.getElementById('searchText');
  const statusDiv = document.getElementById('status');
  
  // Load saved search text
  chrome.storage.sync.get(['searchText'], function(result) {
    if (result.searchText) {
      searchTextInput.value = result.searchText;
    }
  });
  
  // Save search text when changed
  searchTextInput.addEventListener('input', function() {
    chrome.storage.sync.set({
      searchText: searchTextInput.value
    });
  });
  
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
        searchText: searchText
      }, function(response) {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = 'Error: Please refresh the page';
          return;
        }
        
        showStopButton();
        statusDiv.textContent = 'Scrolling started...';
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