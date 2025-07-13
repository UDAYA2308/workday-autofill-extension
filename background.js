chrome.runtime.onInstalled.addListener(() => {
  console.log('Workday Autofill Extension Installed!');

  // Set default auto-fill preference
  chrome.storage.local.get(['autoFillEnabled'], (result) => {
    if (result.autoFillEnabled === undefined) {
      chrome.storage.local.set({ autoFillEnabled: true });
    }
  });
});

// Listen to messages from popup or other scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'saveCredentials':
      chrome.storage.local.set({
        username: request.username,
        password: request.password
      });
      sendResponse({ status: 'success' });
      break;

    case 'toggleAutoFill':
      chrome.storage.local.set({ autoFillEnabled: request.enabled });
      sendResponse({ status: 'success' });
      break;

    case 'credentialsSaved':
      chrome.action.setBadgeText({ text: '' });
      sendResponse({ status: 'success' });
      break;
  }
});