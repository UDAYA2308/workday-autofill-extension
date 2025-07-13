// Enhanced content script with form type change detection
(() => {
  console.log('[Workday Autofill] Content script loaded');
  
  let lastFormType = null;
  let navigationTimeout = null;
  
  chrome.storage.local.get(["username", "password", "autoFillEnabled"], ({ username, password, autoFillEnabled }) => {
    if (!username || !password) {
      console.warn("[Workday Autofill] No stored username or password found");
      createFloatingCredentialsForm();
      setupManualAutofillListener();
      return;
    }
    
    console.log("[Workday Autofill] Starting autofill process with saved credentials");

    const isAutoFillEnabled = autoFillEnabled !== false;
    
    if (isAutoFillEnabled) {
      console.log("[Workday Autofill] Auto-fill is ENABLED - starting automatic autofill");
      
      performAutofillWithFormDetection(username, password);

      const observer = new MutationObserver(debounce((mutations) => {
        const hasRelevantChanges = mutations.some(mutation => {
          if (mutation.addedNodes.length > 0) {
            return Array.from(mutation.addedNodes).some(node => 
              node.nodeType === Node.ELEMENT_NODE && 
              (node.querySelector && (
                node.querySelector('[data-automation-id="email"]') ||
                node.querySelector('[data-automation-id="password"]') ||
                node.querySelector('[data-automation-id="verifyPassword"]') ||
                node.querySelector('[data-automation-id="createAccountCheckbox"]')
              ))
            );
          }
          
          if (mutation.type === 'attributes' && mutation.target) {
            const target = mutation.target;
            return target.hasAttribute && (
              target.hasAttribute('data-automation-id') ||
              target.querySelector('[data-automation-id]')
            );
          }
          
          return false;
        });
        
        if (hasRelevantChanges) {
          chrome.storage.local.get(['autoFillEnabled'], (result) => {
            if (result.autoFillEnabled !== false) {
              console.log("[Workday Autofill] Form content changed - checking for form transition");
              performAutofillWithFormDetection(username, password);
            }
          });
        }
      }, 300));

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'data-automation-id']
      });

      let lastUrl = location.href;
      let lastHash = location.hash;
      
      const checkForNavigation = () => {
        const currentUrl = location.href;
        const currentHash = location.hash;
        
        if (currentUrl !== lastUrl || currentHash !== lastHash) {
          lastUrl = currentUrl;
          lastHash = currentHash;
          console.log(`[Workday Autofill] Navigation detected: ${currentUrl}`);
          
          // Reset notification state on navigation
          if (typeof resetNotificationState === 'function') {
            resetNotificationState();
          }
          
          clearTimeout(navigationTimeout);
          
          chrome.storage.local.get(['autoFillEnabled'], (result) => {
            if (result.autoFillEnabled !== false) {
              console.log("[Workday Autofill] Auto-fill enabled - handling navigation");
              
              const retryDelays = [500, 1000, 1500, 2500];
              retryDelays.forEach((delay, index) => {
                setTimeout(() => {
                  console.log(`[Workday Autofill] Navigation retry ${index + 1}/${retryDelays.length}`);
                  performAutofillWithFormDetection(username, password);
                }, delay);
              });
            }
          });
        }
      };
      
      const urlCheckInterval = setInterval(checkForNavigation, 500);

      const navigationEvents = ['popstate', 'pushstate', 'replacestate', 'hashchange'];
      navigationEvents.forEach(eventType => {
        window.addEventListener(eventType, () => {
          console.log(`[Workday Autofill] ${eventType} event detected`);
          
          // Reset notification state on navigation events
          if (typeof resetNotificationState === 'function') {
            resetNotificationState();
          }
          
          clearTimeout(navigationTimeout);
          navigationTimeout = setTimeout(() => {
            chrome.storage.local.get(['autoFillEnabled'], (result) => {
              if (result.autoFillEnabled !== false) {
                performAutofillWithFormDetection(username, password);
              }
            });
          }, 800);
        });
      });

      document.addEventListener('focusin', debounce((event) => {
        if (event.target && event.target.hasAttribute && 
            event.target.hasAttribute('data-automation-id')) {
          console.log('[Workday Autofill] Form field focused - checking if autofill needed');
          setTimeout(() => {
            chrome.storage.local.get(['autoFillEnabled'], (result) => {
              if (result.autoFillEnabled !== false) {
                performAutofillWithFormDetection(username, password);
              }
            });
          }, 200);
        }
      }, 500));

      setTimeout(() => {
        observer.disconnect();
        clearInterval(urlCheckInterval);
        console.log("[Workday Autofill] Stopped observing DOM mutations]")
              }, 180000);
    } else {
      console.log("[Workday Autofill] Auto-fill is DISABLED - skipping automatic autofill");
    }
    
    setupManualAutofillListener();
  });

  function performAutofillWithFormDetection(username, password) {
    setTimeout(() => {
      const currentFormType = detectCurrentFormType();
      
      // Check if form type has changed and handle notification state accordingly
      if (currentFormType !== lastFormType) {
        console.log(`[Workday Autofill] Form type changed from ${lastFormType} to ${currentFormType}`);
        lastFormType = currentFormType;
        
        // Handle form type change for notification system
        if (typeof handleFormTypeChange === 'function') {
          handleFormTypeChange(currentFormType);
        }
      }
      
      if (currentFormType) {
        console.log(`[Workday Autofill] Attempting to fill ${currentFormType} form`);
        autofillWithRetry(username, password);
      } else {
        console.log('[Workday Autofill] No form detected, will retry');
        setTimeout(() => {
          const retryFormType = detectCurrentFormType();
          if (retryFormType) {
            console.log(`[Workday Autofill] Retry detected ${retryFormType} form`);
            
            // Handle form type change for retry as well
            if (retryFormType !== lastFormType) {
              lastFormType = retryFormType;
              if (typeof handleFormTypeChange === 'function') {
                handleFormTypeChange(retryFormType);
              }
            }
            
            autofillWithRetry(username, password);
          }
        }, 1000);
      }
    }, 100);
  }
  
  function detectCurrentFormType() {
    const checkForm = () => {
      const hasEmail = !!document.querySelector('[data-automation-id="email"]');
      const hasPassword = !!document.querySelector('[data-automation-id="password"]');
      const hasVerifyPassword = !!document.querySelector('[data-automation-id="verifyPassword"]');
      const hasCreateAccountCheckbox = !!document.querySelector('[data-automation-id="createAccountCheckbox"]');
      
      console.log(`[Workday Autofill] Form elements found: email=${hasEmail}, password=${hasPassword}, verifyPassword=${hasVerifyPassword}, createAccount=${hasCreateAccountCheckbox}`);
      
      if (hasCreateAccountCheckbox && hasVerifyPassword) {
        return 'signup';
      } else if (hasEmail && hasPassword && !hasVerifyPassword) {
        return 'signin';
      }
      return null;
    };
    
    return checkForm();
  }

  function manualFillWithRetry(username, password) {
    console.log('[Workday Autofill] Manual fill with retry initiated');
    
    // Reset notification state to ensure notification shows for manual fill
    if (typeof resetNotificationState === 'function') {
      resetNotificationState();
    }
    
    let attempts = 0;
    const maxAttempts = 5;
    
    const attemptManualFill = () => {
      attempts++;
      console.log(`[Workday Autofill] Manual fill attempt ${attempts}/${maxAttempts}`);
      
      const success = tryAutofill(username, password);
      
      if (success) {
        console.log("[Workday Autofill] Manual fill succeeded");
        return;
      }
      
      if (attempts < maxAttempts) {
        setTimeout(attemptManualFill, 800);
      } else {
        console.log("[Workday Autofill] Manual fill failed after all attempts");
        showErrorMessage('Could not find form fields to fill');
      }
    };
    
    attemptManualFill();
  }

  function showErrorMessage(message) {
    const existing = document.querySelector('.workday-autofill-notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = 'workday-autofill-notification';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #f44336;
      color: white;
      padding: 12px 20px;
      border-radius: 6px;
      font-family: Arial, sans-serif;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 999999;
      animation: slideInFromRight 0.3s ease forwards;
    `;
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = 'slideOutToLeft 0.3s ease forwards';
        setTimeout(() => notification.remove(), 300);
      }
    }, 4000);
  }

  function setupManualAutofillListener() {
    window.addEventListener('manualAutofill', (event) => {
      const { username, password } = event.detail;
      console.log('[Workday Autofill] Manual autofill triggered from popup');
      
      const existingForm = document.getElementById('workday-floating-form');
      const existingBackdrop = document.getElementById('workday-floating-backdrop');
      if (existingForm) existingForm.remove();
      if (existingBackdrop) existingBackdrop.remove();
      
      manualFillWithRetry(username, password);
    });
  }

  // Enhanced form change detection - check for form type changes more frequently
  let formTypeCheckInterval = setInterval(() => {
    const currentFormType = detectCurrentFormType();
    
    if (currentFormType && currentFormType !== lastFormType) {
      console.log(`[Workday Autofill] Form type change detected via interval: ${lastFormType} -> ${currentFormType}`);
      lastFormType = currentFormType;
      
      // Handle form type change for notification system
      if (typeof handleFormTypeChange === 'function') {
        handleFormTypeChange(currentFormType);
      }
      
      // Trigger autofill for the new form type
      chrome.storage.local.get(['username', 'password', 'autoFillEnabled'], (result) => {
        if (result.username && result.password && result.autoFillEnabled !== false) {
          console.log(`[Workday Autofill] Auto-filling new ${currentFormType} form`);
          setTimeout(() => {
            autofillWithRetry(result.username, result.password);
          }, 500);
        }
      });
    }
  }, 1000); // Check every second

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      console.log('[Workday Autofill] Page became visible - checking for forms');
      
      chrome.storage.local.get(['username', 'password', 'autoFillEnabled'], (result) => {
        if (result.username && result.password && result.autoFillEnabled !== false) {
          setTimeout(() => {
            performAutofillWithFormDetection(result.username, result.password);
          }, 500);
        }
      });
    }
  });

  window.addEventListener('focus', () => {
    console.log('[Workday Autofill] Window focused - checking for forms');
    
    chrome.storage.local.get(['username', 'password', 'autoFillEnabled'], (result) => {
      if (result.username && result.password && result.autoFillEnabled !== false) {
        setTimeout(() => {
          performAutofillWithFormDetection(result.username, result.password);
        }, 300);
      }
    });
  });

  window.addEventListener('beforeunload', () => {
    console.log('[Workday Autofill] Page unloading - cleaning up');
    
    // Clear intervals
    if (formTypeCheckInterval) {
      clearInterval(formTypeCheckInterval);
    }
    
    if (navigationTimeout) {
      clearTimeout(navigationTimeout);
    }
    if (typeof autofillTimeout !== 'undefined') {
      clearTimeout(autofillTimeout);
    }
    
    const notifications = document.querySelectorAll('.workday-autofill-notification');
    notifications.forEach(notification => notification.remove());
    
    const floatingForm = document.getElementById('workday-floating-form');
    const backdrop = document.getElementById('workday-floating-backdrop');
    if (floatingForm) floatingForm.remove();
    if (backdrop) backdrop.remove();
  });

})();