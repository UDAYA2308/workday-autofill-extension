# Workday Autofill Extension
This Chrome extension autofills Workday account **signup** and **signin** forms with stored credentials to speed up account creation and login.

---

## Installation
1. Clone or download this repo.
2. Load extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable **Developer mode** (toggle top-right)
   - Click **Load unpacked**
   - Select the folder containing this extension code
3. Navigate to any Workday page - a floating form will appear to enter your credentials.

---

## Usage
- Navigate to your Workday signup or signin page.
- The extension will automatically fill your saved username and password.
- If you manually switch between signup and signin forms, autofill will re-trigger automatically.
- Click the extension icon to update credentials or toggle auto-fill settings.
- Use "Fill Now" button for manual form filling.

---

## Settings
Access via extension popup:
- **Username/Email**: Update your stored credentials
- **Password**: Change your password
- **Auto-fill Toggle**: Enable/disable automatic filling
- **Fill Now**: Manually trigger form filling

---

## Development
- Modify `content.js` for autofill logic.
- Edit `utils.js` for form detection and utility functions.
- Update `popup.js` for settings interface.
- Use Chrome DevTools console to debug logs (open with F12).
- Store credentials using Chrome Storage API (`chrome.storage.local`).

---

## Notes
- Works on `*.myworkdayjobs.com`, `*.myworkday.com`, and `*.workday.com` domains.
- Passwords are stored locally in Chrome storage for autofill convenience.
- For enhanced security, consider using browser password managers alongside this extension.
---
