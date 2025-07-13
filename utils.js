// Enhanced utility functions with better form transition handling

function debounce(func, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

function fireEvents(el) {
  ["focus", "input", "change", "blur"].forEach(type =>
    el.dispatchEvent(new Event(type, { bubbles: true }))
  );
}

function fillField(selector, value) {
  const el = document.querySelector(selector);
  if (el) {
    // Don't fill if user is actively focused on this field
    if (document.activeElement === el) {
      console.log(`[Workday Autofill] Skipping ${selector} - user is actively focused`);
      return false;
    }
    
    // Check if field already has the correct value
    if (el.value === value) {
      console.log(`[Workday Autofill] Field ${selector} already has correct value`);
      return true;
    }
    
    // Don't overwrite user content unless it's empty or placeholder text
    if (el.value && el.value !== value && el.value !== el.placeholder) {
      console.log(`[Workday Autofill] Skipping ${selector} - has user content: "${el.value}"`);
      return false;
    }
    
    el.value = value;
    fireEvents(el);
    console.log(`[Workday Autofill] Filled ${selector} with value`);
    return true;
  } else {
    console.log(`[Workday Autofill] Missing field: ${selector}`);
    return false;
  }
}

function checkCheckbox(selector) {
  const cb = document.querySelector(selector);
  if (cb && !cb.checked) {
    cb.click();
    console.log(`[Workday Autofill] Checked checkbox: ${selector}`);
    return true;
  } else if (cb && cb.checked) {
    console.log(`[Workday Autofill] Checkbox ${selector} already checked`);
    return true;
  }
  return false;
}

function isSignupFormPresent() {
  const hasCreateAccount = !!document.querySelector('[data-automation-id="createAccountCheckbox"]');
  const hasVerifyPassword = !!document.querySelector('[data-automation-id="verifyPassword"]');
  const result = hasCreateAccount && hasVerifyPassword;
  console.log(`[Workday Autofill] Signup form check: createAccount=${hasCreateAccount}, verifyPassword=${hasVerifyPassword}, result=${result}`);
  return result;
}

function isSigninFormPresent() {
  const hasEmail = !!document.querySelector('[data-automation-id="email"]');
  const hasPassword = !!document.querySelector('[data-automation-id="password"]');
  const isNotSignup = !isSignupFormPresent();
  const result = hasEmail && hasPassword && isNotSignup;
  console.log(`[Workday Autofill] Signin form check: email=${hasEmail}, password=${hasPassword}, notSignup=${isNotSignup}, result=${result}`);
  return result;
}

function shouldAttemptAutofill() {
  // Allow autofill even if user is in a field, but be more careful about overwriting
  const activeEl = document.activeElement;
  if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
    const automationId = activeEl.getAttribute('data-automation-id');
    if (automationId && ['email', 'password', 'verifyPassword'].includes(automationId)) {
      console.log("[Workday Autofill] User is in a form field, will be careful with autofill");
      return true; // Allow but be careful
    }
  }
  return true;
}

function tryAutofill(username, password) {
  if (!shouldAttemptAutofill()) {
    return false;
  }

  // More thorough form detection
  const signupPresent = isSignupFormPresent();
  const signinPresent = isSigninFormPresent();
  
  console.log(`[Workday Autofill] Form detection: signup=${signupPresent}, signin=${signinPresent}`);

  if (signupPresent) {
    console.log("[Workday Autofill] Processing Signup form");
    
    // For signup, check the checkbox first
    const checkboxChecked = checkCheckbox('[data-automation-id="createAccountCheckbox"]');
    
    // Fill all signup fields
    const emailFilled = fillField('[data-automation-id="email"]', username);
    const passwordFilled = fillField('[data-automation-id="password"]', password);
    const verifyPasswordFilled = fillField('[data-automation-id="verifyPassword"]', password);
    
    const success = emailFilled && passwordFilled && verifyPasswordFilled;
    console.log(`[Workday Autofill] Signup form fill result: email=${emailFilled}, password=${passwordFilled}, verify=${verifyPasswordFilled}, success=${success}`);
    return success;
    
  } else if (signinPresent) {
    console.log("[Workday Autofill] Processing Signin form");
    
    const emailFilled = fillField('[data-automation-id="email"]', username);
    const passwordFilled = fillField('[data-automation-id="password"]', password);
    
    const success = emailFilled && passwordFilled;
    console.log(`[Workday Autofill] Signin form fill result: email=${emailFilled}, password=${passwordFilled}, success=${success}`);
    return success;
    
  } else {
    console.log("[Workday Autofill] No recognizable form found");
    
    // Debug: List all visible form inputs
    const allInputs = document.querySelectorAll('input[data-automation-id]');
    console.log(`[Workday Autofill] Found ${allInputs.length} inputs with data-automation-id:`);
    allInputs.forEach(input => {
      console.log(`  - ${input.getAttribute('data-automation-id')}: type=${input.type}, visible=${input.offsetParent !== null}`);
    });
    
    return false;
  }
}

// GLOBAL notification control to prevent duplicates
let globalNotificationState = {
  lastNotificationTime: 0,
  lastSuccessfulFormType: null, // Track form TYPE instead of full state
  currentFormType: null,
  isNotificationVisible: false,
  notificationCooldown: 3000 // Reduced to 3 seconds for form transitions
};

// Enhanced autofill with STRONG notification debouncing
// Enhanced autofill with page-aware notification debouncing
let autofillTimeout;
function autofillWithRetry(username, password) {
  clearTimeout(autofillTimeout);
  
  autofillTimeout = setTimeout(() => {
    let attempts = 0;
    const maxAttempts = 8;
    
    const attemptFill = () => {
      attempts++;
      console.log(`[Workday Autofill] Fill attempt ${attempts}/${maxAttempts}`);
      
      const success = tryAutofill(username, password);
      
      if (success) {
        console.log("[Workday Autofill] Autofill succeeded");
        
        // Get current form type and create page-specific key
        const currentFormType = getCurrentFormType();
        const currentTime = Date.now();
        const pageKey = `${window.location.pathname}|${currentFormType}`;
        
        // Check if we've already shown notification for this page+form combination
        const lastNotifiedPage = localStorage.getItem('workday-autofill-last-notified');
        const shouldShowNotification = (
          !globalNotificationState.isNotificationVisible &&
          currentFormType &&
          lastNotifiedPage !== pageKey &&
          (currentTime - globalNotificationState.lastNotificationTime) > globalNotificationState.notificationCooldown
        );
        
        if (shouldShowNotification) {
          console.log("[Workday Autofill] Showing notification - new page or form type");
          globalNotificationState.lastNotificationTime = currentTime;
          globalNotificationState.lastSuccessfulFormType = currentFormType;
          globalNotificationState.isNotificationVisible = true;
          
          // Store the page+form combination to prevent repeat notifications
          localStorage.setItem('workday-autofill-last-notified', pageKey);
          
          showSuccessMessage();
        } else {
          console.log("[Workday Autofill] Notification suppressed - already shown for this page");
        }
        
        return;
      }
      
      if (attempts < maxAttempts) {
        const delay = attempts <= 3 ? 600 : attempts <= 5 ? 1000 : 1500;
        setTimeout(attemptFill, delay);
      } else {
        console.log("[Workday Autofill] Autofill giving up after all attempts");
      }
    };
    
    attemptFill();
  }, 200);
}

// Simplified form type detection (just the type, not full state)
function getCurrentFormType() {
  if (isSignupFormPresent()) return 'signup';
  if (isSigninFormPresent()) return 'signin';
  return null;
}

// Enhanced notification state reset - only reset on actual form changes, not page visits
function resetNotificationState() {
  console.log("[Workday Autofill] Resetting notification state");
  globalNotificationState.lastSuccessfulFormType = null;
  globalNotificationState.currentFormType = null;
  globalNotificationState.isNotificationVisible = false;
  // Don't clear localStorage here - only clear on actual form type changes
}

// New function to reset page-specific tracking when form type actually changes
function resetPageNotificationTracking() {
  console.log("[Workday Autofill] Resetting page notification tracking");
  localStorage.removeItem('workday-autofill-last-notified');
  resetNotificationState();
}

// Function to handle form type changes specifically
function handleFormTypeChange(newFormType) {
  const oldFormType = globalNotificationState.currentFormType;
  
  if (oldFormType !== newFormType) {
    console.log(`[Workday Autofill] Form type changed: ${oldFormType} -> ${newFormType}`);
    
    // Reset page-specific tracking when form type actually changes
    resetPageNotificationTracking();
    globalNotificationState.currentFormType = newFormType;
    
    console.log("[Workday Autofill] Notification state reset for form type change");
  }
}

// Enhanced success message with CSS slide animations
function showSuccessMessage() {
  console.log("[Workday Autofill] Showing success notification");
  
  // Remove any existing notification first
  const existing = document.querySelector('.workday-autofill-notification');
  if (existing) {
    console.log("[Workday Autofill] Removing existing notification");
    existing.remove();
  }
  
  const notification = document.createElement('div');
  notification.className = 'workday-autofill-notification';
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #4CAF50;
    color: white;
    padding: 12px 20px;
    border-radius: 6px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 999999;
    animation: slideInFromRight 0.3s ease forwards;
  `;
  
  // Add enhanced animation keyframes
  if (!document.querySelector('style[data-workday-autofill]')) {
    const style = document.createElement('style');
    style.setAttribute('data-workday-autofill', 'true');
    style.textContent = `
      @keyframes slideInFromRight {
        from { 
          transform: translateX(100%); 
          opacity: 0;
        }
        to { 
          transform: translateX(0); 
          opacity: 1;
        }
      }
      @keyframes slideOutToLeft {
        from { 
          transform: translateX(0); 
          opacity: 1;
        }
        to { 
          transform: translateX(-100%); 
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  notification.textContent = 'Form filled successfully!';
  document.body.appendChild(notification);
  
  console.log("[Workday Autofill] Success notification displayed");
  
  // After 2 seconds, slide out to left
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.animation = 'slideOutToLeft 0.3s ease forwards';
      
      // Remove after slide animation completes
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
          // Reset visibility flag after notification is completely gone
          globalNotificationState.isNotificationVisible = false;
          console.log("[Workday Autofill] Notification removed and state reset");
        }
      }, 300); // Wait for slide animation to complete
    }
  }, 1000); 
}

// Enhanced floating credentials form
function createFloatingCredentialsForm() {
  // Remove existing form if present
  const existing = document.getElementById('workday-floating-form');
  if (existing) existing.remove();
  
  const form = document.createElement('div');
  form.id = 'workday-floating-form';
  form.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    border-radius: 12px;
    padding: 0;
    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    border: none;
    min-width: 350px;
    max-width: 400px;
    animation: fadeInScale 0.3s ease;
  `;
  
  // Add animation keyframes for the floating form
  if (!document.querySelector('style[data-workday-floating-form]')) {
    const style = document.createElement('style');
    style.setAttribute('data-workday-floating-form', 'true');
    style.textContent = `
      @keyframes fadeInScale {
        from { 
          opacity: 0; 
          transform: translate(-50%, -50%) scale(0.9); 
        }
        to { 
          opacity: 1; 
          transform: translate(-50%, -50%) scale(1); 
        }
      }
      @keyframes fadeOutScale {
        from { 
          opacity: 1; 
          transform: translate(-50%, -50%) scale(1); 
        }
        to { 
          opacity: 0; 
          transform: translate(-50%, -50%) scale(0.9); 
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  form.innerHTML = `
    <div style="
      text-align: center; 
      margin-bottom: 25px;
      background: linear-gradient(135deg, #4CAF50, #45a049);
      color: white;
      padding: 20px;
      border-radius: 12px 12px 0 0;
      position: relative;
    ">
      <h3 style="margin: 0; font-size: 24px; font-weight: 600;">🔐 Workday Autofill</h3>
      <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 14px;">Enter your credentials to enable autofill</p>
      <button id="floating-close" style="
        position: absolute;
        top: 15px;
        right: 15px;
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      " onmouseover="this.style.background='rgba(255,255,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.2)'">×</button>
    </div>
    
    <div style="padding: 0 25px 25px 25px;">
      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #333; font-size: 14px;">Username/Email:</label>
        <input type="text" id="float-username" style="
          width: 100%;
          padding: 12px;
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          font-size: 14px;
          transition: border-color 0.3s;
          box-sizing: border-box;
          font-family: inherit;
        " placeholder="Enter your username or email"
        onfocus="this.style.borderColor='#4CAF50'; this.style.boxShadow='0 0 0 3px rgba(76,175,80,0.1)'"
        onblur="this.style.borderColor='#e0e0e0'; this.style.boxShadow='none'">
      </div>
      
      <div style="margin-bottom: 25px;">
        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #333; font-size: 14px;">Password:</label>
        <input type="password" id="float-password" style="
          width: 100%;
          padding: 12px;
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          font-size: 14px;
          transition: border-color 0.3s;
          box-sizing: border-box;
          font-family: inherit;
        " placeholder="Enter your password"
        onfocus="this.style.borderColor='#4CAF50'; this.style.boxShadow='0 0 0 3px rgba(76,175,80,0.1)'"
        onblur="this.style.borderColor='#e0e0e0'; this.style.boxShadow='none'">
      </div>
      
      <div style="display: flex; gap: 12px;">
        <button id="floating-save" style="
          flex: 1;
          padding: 12px 24px;
          background: linear-gradient(135deg, #4CAF50, #45a049);
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
          font-family: inherit;
        " onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 12px rgba(76,175,80,0.3)'"
           onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'"
           onmousedown="this.style.transform='translateY(0)'"
           onmouseup="this.style.transform='translateY(-1px)'">
          Save & Fill Now
        </button>
        <button id="floating-cancel" style="
          padding: 12px 18px;
          background: #f5f5f5;
          color: #666;
          border: 1px solid #ddd;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
          font-family: inherit;
        " onmouseover="this.style.background='#eeeeee'; this.style.borderColor='#ccc'"
           onmouseout="this.style.background='#f5f5f5'; this.style.borderColor='#ddd'">
          Cancel
        </button>
      </div>
      
      <div style="margin-top: 15px; text-align: center;">
        <small style="color: #888; font-size: 12px;">
          Credentials are stored locally and securely in your browser
        </small>
      </div>
    </div>
  `;
  
  // Create backdrop
  const backdrop = document.createElement('div');
  backdrop.id = 'workday-floating-backdrop';
  backdrop.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 999998;
    animation: fadeIn 0.3s ease;
  `;
  
  // Add backdrop animation
  if (!document.querySelector('style[data-workday-backdrop]')) {
    const style = document.createElement('style');
    style.setAttribute('data-workday-backdrop', 'true');
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(backdrop);
  document.body.appendChild(form);
  
  // Event handlers
  const usernameInput = document.getElementById('float-username');
  const passwordInput = document.getElementById('float-password');
  const saveButton = document.getElementById('floating-save');
  const closeButton = document.getElementById('floating-close');
  const cancelButton = document.getElementById('floating-cancel');
  
  // Save and fill
  const handleSave = () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    
    if (!username || !password) {
      // Shake animation for empty fields
      form.style.animation = 'shake 0.5s ease';
      setTimeout(() => {
        form.style.animation = 'fadeInScale 0.3s ease';
      }, 500);
      
      if (!username) usernameInput.focus();
      else passwordInput.focus();
      return;
    }
    
    // Show loading state
    saveButton.innerHTML = 'Saving...';
    saveButton.style.opacity = '0.7';
    saveButton.disabled = true;
    
    chrome.storage.local.set({ username, password }, () => {
      console.log('[Workday Autofill] Credentials saved from floating form');
      
      // Reset notification state for new credentials
      resetNotificationState();
      
      // Close form with animation
      form.style.animation = 'fadeOutScale 0.3s ease';
      backdrop.style.animation = 'fadeOut 0.3s ease';
      
      setTimeout(() => {
        form.remove();
        backdrop.remove();
        // Start autofill
        autofillWithRetry(username, password);
      }, 300);
    });
  };
  
  // Close form
  const handleClose = () => {
    form.style.animation = 'fadeOutScale 0.3s ease';
    backdrop.style.animation = 'fadeOut 0.3s ease';
    
    setTimeout(() => {
      form.remove();
      backdrop.remove();
    }, 300);
  };
  
  saveButton.addEventListener('click', handleSave);
  closeButton.addEventListener('click', handleClose);
  cancelButton.addEventListener('click', handleClose);
  backdrop.addEventListener('click', handleClose);
  
  // Enter key support
  [usernameInput, passwordInput].forEach(input => {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleSave();
      }
    });
  });
  
  // Escape key support
  document.addEventListener('keydown', function escapeHandler(e) {
    if (e.key === 'Escape') {
      handleClose();
      document.removeEventListener('keydown', escapeHandler);
    }
  });
  
  // Add shake animation for validation
  if (!document.querySelector('style[data-workday-shake]')) {
    const style = document.createElement('style');
    style.setAttribute('data-workday-shake', 'true');
    style.textContent = `
      @keyframes shake {
        0%, 100% { transform: translate(-50%, -50%) translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translate(-50%, -50%) translateX(-5px); }
        20%, 40%, 60%, 80% { transform: translate(-50%, -50%) translateX(5px); }
      }
    `;
    document.head.appendChild(style);
  }
  
  // Focus on username field after animation
  setTimeout(() => {
    usernameInput.focus();
  }, 350);
}

function setupManualAutofillListener() {
  window.addEventListener('manualAutofill', (event) => {
    const { username, password } = event.detail;
    console.log('[Workday Autofill] Manual autofill triggered');
    
    // Remove floating form if present
    const floatingForm = document.getElementById('workday-floating-form');
    const backdrop = document.getElementById('workday-floating-backdrop');
    if (floatingForm) floatingForm.remove();
    if (backdrop) backdrop.remove();
    
    // Reset notification state for manual trigger
    resetNotificationState();
    
    autofillWithRetry(username, password);
  });
}