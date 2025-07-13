// Enhanced content script with MANDATORY encrypted password storage
(() => {
  console.log('[Workday Autofill] Extension loaded - Encryption Required Mode');

  let lastFormType = null;
  let hasFilledCurrentForm = false;
  let crypto = null;

  // Initialize crypto - REQUIRED, no fallback
  async function initializeExtension() {
    // Wait for PasswordCrypto to be available
    let attempts = 0;
    while (!window.PasswordCrypto && attempts < 20) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    if (!window.PasswordCrypto) {
      console.error('[Workday Autofill] CRITICAL: Encryption not available - Extension disabled for security');
      showEncryptionError();
      return;
    }

    crypto = new window.PasswordCrypto();

    // Test encryption capability
    try {
      const testResult = await crypto.test();
      if (!testResult) {
        throw new Error('Encryption test failed');
      }
      console.log('[Workday Autofill] Encryption verified and initialized');
    } catch (error) {
      console.error('[Workday Autofill] CRITICAL: Encryption test failed - Extension disabled', error);
      showEncryptionError();
      return;
    }

    // Load ONLY encrypted credentials
    chrome.storage.local.get(["username", "encryptedPassword", "autoFillEnabled"], async (result) => {
      let username = result.username;
      let password = null;

      // ONLY accept encrypted passwords
      if (result.encryptedPassword) {
        try {
          password = await crypto.decryptPassword(result.encryptedPassword);
          console.log('[Workday Autofill] Encrypted credentials loaded successfully');
        } catch (error) {
          console.error('[Workday Autofill] Failed to decrypt stored password:', error);
          showDecryptionError();
          return;
        }
      }

      if (!username || !password) {
        console.log('[Workday Autofill] No valid encrypted credentials found');
        createFloatingCredentialsForm();
        setupManualAutofillListener();
        return;
      }

      const isAutoFillEnabled = result.autoFillEnabled !== false;

      if (isAutoFillEnabled) {
        waitForFormAndFill(username, password);
        observeFormChanges(username, password);
      }

      setupManualAutofillListener();
    });
  }

  // Show encryption error - extension cannot function
  function showEncryptionError() {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #f44336;
      color: white;
      padding: 15px 20px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      z-index: 999999;
      box-shadow: 0 4px 12px rgba(244, 67, 54, 0.3);
      max-width: 300px;
      border-left: 4px solid #d32f2f;
    `;

    errorDiv.innerHTML = `
      <div style="display: flex; align-items: center; margin-bottom: 8px;">
        <span style="font-size: 18px; margin-right: 8px;">⚠️</span>
        <strong>Workday Autofill Error</strong>
      </div>
      <div style="font-size: 13px; line-height: 1.4;">
        Encryption not available. Extension disabled for security reasons.
      </div>
    `;

    document.body.appendChild(errorDiv);

    // Don't auto-remove - user needs to see this error
  }

  // Show decryption error
  function showDecryptionError() {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #ff9800;
      color: white;
      padding: 15px 20px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      z-index: 999999;
      box-shadow: 0 4px 12px rgba(255, 152, 0, 0.3);
      max-width: 300px;
      border-left: 4px solid #f57c00;
    `;

    errorDiv.innerHTML = `
      <div style="display: flex; align-items: center; margin-bottom: 8px;">
        <span style="font-size: 18px; margin-right: 8px;">🔐</span>
        <strong>Decryption Failed</strong>
      </div>
      <div style="font-size: 13px; line-height: 1.4;">
        Cannot decrypt stored password. Please re-enter your credentials.
      </div>
    `;

    document.body.appendChild(errorDiv);

    setTimeout(() => {
      errorDiv.remove();
      createFloatingCredentialsForm();
    }, 3000);
  }

  // Wait for form to be completely loaded and ready
  function waitForFormAndFill(username, password) {
    const checkFormReady = () => {
      const currentFormType = detectCurrentFormType();

      if (currentFormType && isFormCompletelyLoaded(currentFormType)) {
        if (currentFormType !== lastFormType) {
          lastFormType = currentFormType;
          hasFilledCurrentForm = false;
        }

        if (!hasFilledCurrentForm) {
          const success = fillFormImmediately(username, password, currentFormType);
          if (success) {
            hasFilledCurrentForm = true;
            showSuccessMessage();
            console.log(`[Workday Autofill] ${currentFormType} form filled successfully`);
          }
        }
      } else if (currentFormType) {
        setTimeout(checkFormReady, 100);
      } else {
        setTimeout(checkFormReady, 200);
      }
    };

    checkFormReady();
  }

  // Check if form is completely loaded and ready for filling
  function isFormCompletelyLoaded(formType) {
    if (formType === 'signup') {
      const email = document.querySelector('[data-automation-id="email"]');
      const password = document.querySelector('[data-automation-id="password"]');
      const verifyPassword = document.querySelector('[data-automation-id="verifyPassword"]');

      return email && password && verifyPassword &&
        isElementVisible(email) && isElementVisible(password) && isElementVisible(verifyPassword) &&
        !email.disabled && !password.disabled && !verifyPassword.disabled;
    } else if (formType === 'signin') {
      const email = document.querySelector('[data-automation-id="email"]');
      const password = document.querySelector('[data-automation-id="password"]');

      return email && password &&
        isElementVisible(email) && isElementVisible(password) &&
        !email.disabled && !password.disabled;
    }

    return false;
  }

  // Check if element is visible and ready for interaction
  function isElementVisible(element) {
    if (!element) return false;

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return rect.width > 0 && rect.height > 0 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      style.opacity !== '0';
  }

  // Fill form immediately when ready
  function fillFormImmediately(username, password, formType) {
    if (formType === 'signup') {
      const createAccountCheckbox = document.querySelector('[data-automation-id="createAccountCheckbox"]');
      if (createAccountCheckbox && !createAccountCheckbox.checked) {
        createAccountCheckbox.click();

        setTimeout(() => {
          fillSignupFields(username, password);
        }, 150);
        return true;
      } else {
        return fillSignupFields(username, password);
      }
    } else if (formType === 'signin') {
      return fillSigninFields(username, password);
    }

    return false;
  }

  function fillSignupFields(username, password) {
    const emailSuccess = fillFieldInstantly('[data-automation-id="email"]', username);
    const passwordSuccess = fillFieldInstantly('[data-automation-id="password"]', password);
    const verifyPasswordSuccess = fillFieldInstantly('[data-automation-id="verifyPassword"]', password);

    return emailSuccess && passwordSuccess && verifyPasswordSuccess;
  }

  function fillSigninFields(username, password) {
    const emailSuccess = fillFieldInstantly('[data-automation-id="email"]', username);
    const passwordSuccess = fillFieldInstantly('[data-automation-id="password"]', password);

    return emailSuccess && passwordSuccess;
  }

  // Instant field filling
  function fillFieldInstantly(selector, value) {
    const field = document.querySelector(selector);
    if (!field) return false;

    if (field.value && field.value.trim() !== '') {
      return true;
    }

    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    field.dispatchEvent(new Event('keyup', { bubbles: true }));
    field.dispatchEvent(new Event('blur', { bubbles: true }));

    return true;
  }

  // Monitor for form changes
  function observeFormChanges(username, password) {
    const observer = new MutationObserver((mutations) => {
      const hasFormChanges = mutations.some(mutation => {
        if (mutation.type === 'childList') {
          return Array.from(mutation.addedNodes).some(node =>
            node.nodeType === Node.ELEMENT_NODE &&
            (node.querySelector && node.querySelector('[data-automation-id]'))
          );
        }
        return false;
      });

      if (hasFormChanges) {
        const currentFormType = detectCurrentFormType();

        if (currentFormType && currentFormType !== lastFormType) {
          console.log(`[Workday Autofill] New form detected: ${currentFormType}`);
          lastFormType = currentFormType;
          hasFilledCurrentForm = false;
          waitForFormAndFill(username, password);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
    }, 180000);
  }

  function isSignupFormPresent() {
    const createAccountCheckbox = document.querySelector('[data-automation-id="createAccountCheckbox"]');
    const verifyPasswordField = document.querySelector('[data-automation-id="verifyPassword"]');
    return !!(createAccountCheckbox || verifyPasswordField);
  }

  function isSigninFormPresent() {
    const emailField = document.querySelector('[data-automation-id="email"]');
    const passwordField = document.querySelector('[data-automation-id="password"]');
    const verifyPasswordField = document.querySelector('[data-automation-id="verifyPassword"]');
    return !!(emailField && passwordField && !verifyPasswordField);
  }

  function detectCurrentFormType() {
    if (isSignupFormPresent()) return 'signup';
    if (isSigninFormPresent()) return 'signin';
    return null;
  }

  function showSuccessMessage() {
    const existing = document.querySelector('.workday-autofill-success');
    if (existing) existing.remove();

    const message = document.createElement('div');
    message.className = 'workday-autofill-success';
    message.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #4CAF50, #45a049);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      z-index: 999999;
      box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
      animation: slideIn 0.3s ease;
    `;

    message.innerHTML = '✓ Form auto-filled';
    document.body.appendChild(message);

    setTimeout(() => {
      message.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => {
        if (message.parentNode) message.remove();
      }, 300);
    }, 1000);
  }

  function setupManualAutofillListener() {
    window.addEventListener('manualAutofill', async (event) => {
      const { username, encryptedPassword } = event.detail;

      if (!crypto) {
        console.error('[Workday Autofill] Encryption not available for manual fill');
        showEncryptionError();
        return;
      }

      let password;
      try {
        password = await crypto.decryptPassword(encryptedPassword);
      } catch (error) {
        console.error('[Workday Autofill] Failed to decrypt password for manual fill:', error);
        showDecryptionError();
        return;
      }

      const floatingForm = document.getElementById('workday-floating-form');
      const backdrop = document.getElementById('workday-floating-backdrop');
      if (floatingForm) floatingForm.remove();
      if (backdrop) backdrop.remove();

      hasFilledCurrentForm = false;
      waitForFormAndFill(username, password);
    });
  }

  // SECURE credentials form - ENCRYPTION REQUIRED
  function createFloatingCredentialsForm() {
    if (!crypto) {
      console.error('[Workday Autofill] Cannot create form - encryption not available');
      showEncryptionError();
      return;
    }

    if (document.getElementById('workday-floating-form')) return;

    const backdrop = document.createElement('div');
    backdrop.id = 'workday-floating-backdrop';
    backdrop.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.6));
      backdrop-filter: blur(8px);
      z-index: 999998;
      animation: fadeIn 0.3s ease;
    `;

    const form = document.createElement('div');
    form.id = 'workday-floating-form';
    form.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 0;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3), 0 8px 20px rgba(102, 126, 234, 0.2);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      min-width: 400px;
      overflow: hidden;
      animation: fadeInScale 0.3s ease;
    `;

    form.innerHTML = `
      <div style="background: rgba(255, 255, 255, 0.1); padding: 30px; text-align: center; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
        <div style="width: 60px; height: 60px; background: rgba(255, 255, 255, 0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 24px;">🔐</div>
        <h2 style="margin: 0; color: white; font-size: 24px; font-weight: 600; text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">Workday Autofill</h2>
        <p style="margin: 10px 0 0; color: rgba(255, 255, 255, 0.8); font-size: 14px;">Enter your Workday credentials - Encryption Required</p>
      </div>
      
      <div style="padding: 30px; background: white;">
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; color: #374151; font-weight: 500; font-size: 14px;">Email / Username</label>
          <input type="text" id="workday-username" placeholder="Enter your email or username" 
                 style="width: 100%; padding: 14px 16px; border: 2px solid #e5e7eb; border-radius: 12px; font-size: 16px; transition: all 0.2s ease; background: #f9fafb; box-sizing: border-box;"
                 onfocus="this.style.borderColor='#667eea'; this.style.background='white'; this.style.boxShadow='0 0 0 3px rgba(102, 126, 234, 0.1)'"
                 onblur="this.style.borderColor='#e5e7eb'; this.style.background='#f9fafb'; this.style.boxShadow='none'">
        </div>
        
        <div style="margin-bottom: 25px;">
          <label style="display: block; margin-bottom: 8px; color: #374151; font-weight: 500; font-size: 14px;">Password</label>
          <input type="password" id="workday-password" placeholder="Enter your password"
                 style="width: 100%; padding: 14px 16px; border: 2px solid #e5e7eb; border-radius: 12px; font-size: 16px; transition: all 0.2s ease; background: #f9fafb; box-sizing: border-box;"
                 onfocus="this.style.borderColor='#667eea'; this.style.background='white'; this.style.boxShadow='0 0 0 3px rgba(102, 126, 234, 0.1)'"
                 onblur="this.style.borderColor='#e5e7eb'; this.style.background='#f9fafb'; this.style.boxShadow='none'">
        </div>
        
        <div style="display: flex; gap: 12px; justify-content: space-between;">
          <button id="workday-save" 
                  style="padding: 12px 24px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 12px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s ease; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);"
                  onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 6px 16px rgba(102, 126, 234, 0.4)'"
                  onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(102, 126, 234, 0.3)'">
            Encrypt & Save
          </button>
          <button id="workday-cancel" 
                  style="padding: 12px 24px; border: 2px solid #e5e7eb; background: white; color: #6b7280; border-radius: 12px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s ease;"
                  onmouseover="this.style.borderColor='#d1d5db'; this.style.background='#f9fafb'"
                  onmouseout="this.style.borderColor='#e5e7eb'; this.style.background='white'">
            Cancel
          </button>
        </div>
        
        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
          <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 1.4;">
            🔒 AES-256 Encryption Required - No Plain Text Storage
          </p>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }
      
      @keyframes fadeInScale {
        from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
        to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      }
      
      @keyframes fadeOutScale {
        from { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        to { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
      }
      
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }
      
      @keyframes shake {
        0%, 100% { transform: translate(-50%, -50%) translateX(0); }
        25% { transform: translate(-50%, -50%) translateX(-5px); }
        75% { transform: translate(-50%, -50%) translateX(5px); }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(backdrop);
    document.body.appendChild(form);

    const usernameInput = form.querySelector('#workday-username');
    const passwordInput = form.querySelector('#workday-password');
    const saveButton = form.querySelector('#workday-save');
    const cancelButton = form.querySelector('#workday-cancel');

    const handleSave = async () => {
      const username = usernameInput.value.trim();
      const password = passwordInput.value;

      if (!username || !password) {
        form.style.animation = 'shake 0.5s ease';
        setTimeout(() => {
          form.style.animation = 'fadeInScale 0.3s ease';
        }, 500);

        if (!username) usernameInput.focus();
        else passwordInput.focus();
        return;
      }

      saveButton.innerHTML = 'Encrypting...';
      saveButton.style.opacity = '0.7';
      saveButton.disabled = true;

      try {
        // MANDATORY encryption - fail if not possible
        const encryptedPassword = await crypto.encryptPassword(password);

        chrome.storage.local.set({ username, encryptedPassword }, () => {
          console.log('[Workday Autofill] Credentials encrypted and saved securely');

          form.style.animation = 'fadeOutScale 0.3s ease';
          backdrop.style.animation = 'fadeOut 0.3s ease';

          setTimeout(() => {
            form.remove();
            backdrop.remove();

            window.dispatchEvent(new CustomEvent('manualAutofill', {
              detail: { username, encryptedPassword }
            }));
          }, 300);
        });
      } catch (error) {
        console.error('[Workday Autofill] CRITICAL: Encryption failed - Cannot save credentials', error);
        saveButton.innerHTML = 'ENCRYPTION FAILED';
        saveButton.style.background = '#f44336';
        saveButton.style.opacity = '1';
        saveButton.disabled = true;

        setTimeout(() => {
          saveButton.innerHTML = 'Retry Encryption';
          saveButton.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
          saveButton.disabled = false;
        }, 2000);
      }
    };

    const handleClose = () => {
      form.style.animation = 'fadeOutScale 0.3s ease';
      backdrop.style.animation = 'fadeOut 0.3s ease';

      setTimeout(() => {
        form.remove();
        backdrop.remove();
      }, 300);
    };

    saveButton.addEventListener('click', handleSave);
    cancelButton.addEventListener('click', handleClose);
    backdrop.addEventListener('click', handleClose);

    [usernameInput, passwordInput].forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSave();
      });
    });

    setTimeout(() => {
      if (!usernameInput.value) usernameInput.focus();
      else passwordInput.focus();
    }, 500);
  }

  initializeExtension();
})();