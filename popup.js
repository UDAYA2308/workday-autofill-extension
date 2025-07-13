document.addEventListener('DOMContentLoaded', async () => {
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const saveButton = document.getElementById('saveCredentials');
  const fillButton = document.getElementById('triggerFill');
  const autoFillToggle = document.getElementById('autoFillToggle');
  const status = document.getElementById('status');

  // MANDATORY encryption initialization
  let crypto = null;
  let attempts = 0;

  while (!window.PasswordCrypto && attempts < 20) {
    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
  }

  if (!window.PasswordCrypto) {
    status.textContent = 'CRITICAL ERROR: Encryption not available - Extension disabled';
    status.className = 'status error';
    status.style.background = '#f44336';

    // Disable all controls
    [usernameInput, passwordInput, saveButton, fillButton, autoFillToggle].forEach(el => {
      el.disabled = true;
    });

    console.error('[Workday Autofill] CRITICAL: Encryption not available in popup');
    return;
  }

  crypto = new window.PasswordCrypto();

  // Test encryption
  try {
    const testResult = await crypto.test();
    if (!testResult) {
      throw new Error('Encryption test failed');
    }
    console.log('[Workday Autofill] Popup encryption verified');
  } catch (error) {
    status.textContent = 'CRITICAL ERROR: Encryption test failed - Extension disabled';
    status.className = 'status error';
    status.style.background = '#f44336';

    [usernameInput, passwordInput, saveButton, fillButton, autoFillToggle].forEach(el => {
      el.disabled = true;
    });

    console.error('[Workday Autofill] CRITICAL: Encryption test failed in popup', error);
    return;
  }

  // Auto-save with MANDATORY encryption
  let saveTimeout;
  function autoSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      const username = usernameInput.value.trim();
      const password = passwordInput.value.trim();

      if (username && password) {
        try {
          const encryptedPassword = await crypto.encryptPassword(password);
          chrome.storage.local.set({ username, encryptedPassword });
          chrome.runtime.sendMessage({ action: 'credentialsSaved' });
          console.log('[Workday Autofill] Auto-saved encrypted credentials');

          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
              chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                func: () => {
                  const prompt = document.getElementById('workday-floating-form');
                  if (prompt) prompt.remove();
                }
              }).catch(() => { });
            }
          });
        } catch (error) {
          console.error('[Workday Autofill] CRITICAL: Auto-save encryption failed', error);
          status.textContent = 'Auto-save failed: Encryption error';
          status.className = 'status error';
        }
      }
    }, 1500);
  }

  usernameInput.addEventListener('input', autoSave);
  passwordInput.addEventListener('input', autoSave);

  // Load ONLY encrypted settings
  chrome.storage.local.get(['username', 'encryptedPassword', 'autoFillEnabled'], async (result) => {
    if (result.username) usernameInput.value = result.username;

    // ONLY decrypt encrypted passwords
    if (result.encryptedPassword) {
      try {
        const decryptedPassword = await crypto.decryptPassword(result.encryptedPassword);
        passwordInput.value = decryptedPassword;
        status.textContent = `Encrypted credentials loaded. Auto-fill: ${result.autoFillEnabled !== false ? 'ON' : 'OFF'}`;
        status.className = 'status success';
      } catch (error) {
        console.error('[Workday Autofill] Failed to decrypt stored password:', error);
        passwordInput.placeholder = 'Decryption failed - please re-enter';
        status.textContent = 'Decryption failed - please re-enter credentials';
        status.className = 'status error';
      }
    } else {
      status.textContent = 'No encrypted credentials found - please enter below';
      status.className = 'status error';
      setTimeout(() => usernameInput.focus(), 100);
    }

    autoFillToggle.checked = result.autoFillEnabled !== false;
  });

  // Save with MANDATORY encryption
  saveButton.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
      status.textContent = 'Please enter both username and password';
      status.className = 'status error';
      return;
    }

    status.textContent = 'Encrypting credentials...';
    status.className = 'status';
    saveButton.disabled = true;

    try {
      const encryptedPassword = await crypto.encryptPassword(password);

      chrome.storage.local.set({ username, encryptedPassword }, () => {
        status.textContent = 'Credentials encrypted and saved successfully!';
        status.className = 'status success';
        saveButton.disabled = false;

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
    } catch (error) {
      console.error('[Workday Autofill] CRITICAL: Encryption failed during save', error);
      status.textContent = 'ENCRYPTION FAILED - Cannot save credentials';
      status.className = 'status error';
      status.style.background = '#f44336';
      saveButton.disabled = false;
    }
  });

  // Toggle auto-fill
  autoFillToggle.addEventListener('change', () => {
    const enabled = autoFillToggle.checked;
    chrome.storage.local.set({ autoFillEnabled: enabled });
    status.textContent = `Auto-fill ${enabled ? 'enabled' : 'disabled'}`;
    status.className = 'status success';
  });

  // Manual fill with MANDATORY encryption
  fillButton.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
      status.textContent = 'Please enter and save credentials first';
      status.className = 'status error';
      return;
    }

    status.textContent = 'Encrypting for secure transmission...';
    status.className = 'status';
    fillButton.disabled = true;

    try {
      // MANDATORY encryption for transmission
      const encryptedPassword = await crypto.encryptPassword(password);

      // Save encrypted credentials first
      chrome.storage.local.set({ username, encryptedPassword });
      chrome.runtime.sendMessage({ action: 'credentialsSaved' });

      // Trigger manual autofill with encrypted data
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: (user, encPass) => {
              const event = new CustomEvent('manualAutofill', {
                detail: { username: user, encryptedPassword: encPass }
              });
              window.dispatchEvent(event);
            },
            args: [username, encryptedPassword]
          }).then(() => {
            status.textContent = 'Manual fill triggered with encrypted data!';
            status.className = 'status success';
            fillButton.disabled = false;
          }).catch((error) => {
            status.textContent = 'Error: Could not access page';
            status.className = 'status error';
            fillButton.disabled = false;
            console.error('Script injection failed:', error);
          });
        }
      });
    } catch (error) {
      console.error('[Workday Autofill] CRITICAL: Manual fill encryption failed', error);
      status.textContent = 'ENCRYPTION FAILED - Manual fill aborted';
      status.className = 'status error';
      status.style.background = '#f44336';
      fillButton.disabled = false;
    }
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