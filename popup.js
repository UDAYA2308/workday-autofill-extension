document.addEventListener('DOMContentLoaded', () => {
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const saveButton = document.getElementById('saveCredentials');
  const fillButton = document.getElementById('triggerFill');
  const autoFillToggle = document.getElementById('autoFillToggle');
  const status = document.getElementById('status');

  // Auto-save credentials when user types (debounced)
  let saveTimeout;
  function autoSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      const username = usernameInput.value.trim();
      const password = passwordInput.value.trim();

      if (username && password) {
        chrome.storage.local.set({ username, password });
        chrome.runtime.sendMessage({ action: 'credentialsSaved' });
        console.log('[Workday Autofill] Auto-saved credentials');

        // Remove page prompt when credentials are auto-saved
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              func: () => {
                const prompt = document.getElementById('workday-floating-form');
                if (prompt) prompt.remove();
              }
            }).catch(() => {
              // Silently handle permission errors
            });
          }
        });
      }
    }, 1500);
  }

  usernameInput.addEventListener('input', autoSave);
  passwordInput.addEventListener('input', autoSave);

  // Load existing settings
  chrome.storage.local.get(['username', 'password', 'autoFillEnabled'], (result) => {
    if (result.username) usernameInput.value = result.username;
    if (result.password) passwordInput.value = result.password;

    // Set auto-fill toggle state
    autoFillToggle.checked = result.autoFillEnabled !== false;

    if (result.username && result.password) {
      status.textContent = `Credentials loaded. Auto-fill: ${autoFillToggle.checked ? 'ON' : 'OFF'}`;
      status.className = 'status success';
    } else {
      status.textContent = 'Please enter your credentials below';
      status.className = 'status error';
      // Focus on username field for immediate input
      setTimeout(() => usernameInput.focus(), 100);
    }
  });

  // Save credentials
  saveButton.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
      status.textContent = 'Please enter both username and password';
      status.className = 'status error';
      return;
    }

    chrome.storage.local.set({ username, password }, () => {
      status.textContent = 'Credentials saved successfully!';
      status.className = 'status success';

      // Clear badge notification and remove page prompts
      chrome.runtime.sendMessage({ action: 'credentialsSaved' });

      // Remove prompt from current tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: () => {
              const prompt = document.getElementById('workday-floating-form');
              if (prompt) prompt.remove();
            }
          }).catch(() => {
            // Silently handle permission errors
          });
        }
      });
    });
  });

  // Toggle auto-fill
  autoFillToggle.addEventListener('change', () => {
    const enabled = autoFillToggle.checked;
    chrome.storage.local.set({ autoFillEnabled: enabled });
    status.textContent = `Auto-fill ${enabled ? 'enabled' : 'disabled'}`;
    status.className = 'status success';
  });

  // Manual fill trigger
  fillButton.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
      status.textContent = 'Please enter and save credentials first';
      status.className = 'status error';
      return;
    }

    // Save credentials first
    chrome.storage.local.set({ username, password });

    // Clear badge notification
    chrome.runtime.sendMessage({ action: 'credentialsSaved' });

    // Trigger manual autofill
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: (user, pass) => {
            const event = new CustomEvent('manualAutofill', {
              detail: { username: user, password: pass }
            });
            window.dispatchEvent(event);
          },
          args: [username, password]
        }).then(() => {
          status.textContent = 'Manual fill triggered!';
          status.className = 'status success';
        }).catch((error) => {
          status.textContent = 'Error: Could not access page';
          status.className = 'status error';
          console.error('Script injection failed:', error);
        });
      }
    });
  });

  // Enter key support
  [usernameInput, passwordInput].forEach(input => {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        saveButton.click();
      }
    });
  });
});