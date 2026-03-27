# SmartMouse Playwright Integration Guide

## Overview
SmartMouse now integrates with Playwright to provide advanced web automation capabilities while maintaining complete stealth. The system can connect to your main Chrome instance running with remote debugging, making it undetectable to websites as an automated system.

## Key Features

### 1. Chrome Connection Modes
- **Existing Instance Connection**: Connects to your main Chrome instance running with `--remote-debugging-port=9222`
- **New Instance Launch**: Creates a new Chrome instance with stealth configurations when needed
- **Automatic Fallback**: Seamlessly switches between connection methods

### 2. Advanced Stealth Capabilities
- **CDP Protocol**: Uses Chrome DevTools Protocol for native-like interactions
- **Anti-Detection Flags**: Launches Chrome with flags that prevent automation detection:
  - `--disable-blink-features=AutomationControlled`
  - `--disable-infobars`
  - `--disable-extensions`
  - Multiple other stealth flags
- **Fingerprint Protection**: Prevents canvas and WebGL fingerprinting
- **User Agent Consistency**: Maintains legitimate browser signatures

### 3. Action System Integration
All Playwright actions are now available through SmartMouse's unified action system:

#### Initialization
```typescript
await executeAction({
  action: 'init_playwright',
  config: {
    cdpEndpoint: 'http://127.0.0.1:9222',  // Connect to existing Chrome
    stealth: true,                         // Enable stealth mode
    headless: false                        // Visible browser
  }
});
```

#### Navigation
```typescript
await executeAction({ 
  action: 'navigate', 
  url: 'https://example.com' 
});
```

#### Element Interaction
```typescript
// Click an element
await executeAction({ 
  action: 'click_element', 
  selector: 'button.login-button' 
});

// Fill a form field
await executeAction({ 
  action: 'fill_field', 
  selector: 'input.username', 
  text: 'myusername' 
});

// Get element text
await executeAction({ 
  action: 'get_element_text', 
  selector: '.status-message' 
});
```

#### Page Information
```typescript
// Get current URL
const urlResult = await executeAction({ action: 'get_current_url' });

// Get page title
const titleResult = await executeAction({ action: 'get_page_title' });

// Take screenshot
await executeAction({ 
  action: 'take_screenshot', 
  path: './screenshots/page.png' 
});
```

#### Cleanup
```typescript
// Close the browser
await executeAction({ action: 'close_playwright' });
```

## How to Use

### Step 1: Launch Chrome with Debugging
First, start Chrome with remote debugging enabled:

```bash
# Use the setup script (recommended)
node smartmouse-ts/setup-chrome-debugging.js

# Or manually launch Chrome with:
chrome.exe --remote-debugging-port=9222 --user-data-dir="C:\temp\chrome_debug" --disable-blink-features=AutomationControlled --disable-infobars --disable-extensions
```

### Step 2: Initialize Playwright in Your Scripts
```typescript
import { executeAction } from './actions';

// Connect to your main Chrome instance
const initResult = await executeAction({
  action: 'init_playwright',
  config: {
    cdpEndpoint: 'http://127.0.0.1:9222',
    stealth: true,
    headless: false
  }
});

if (initResult.success) {
  console.log('Connected to Chrome successfully!');
  
  // Now you can use all Playwright actions
  await executeAction({ action: 'navigate', url: 'https://google.com' });
  await executeAction({ action: 'fill_field', selector: 'textarea[title="Search"]', text: 'SmartMouse' });
  await executeAction({ action: 'press', key: 'Enter' });
  
  // Always clean up
  await executeAction({ action: 'close_playwright' });
}
```

### Step 3: Available Selectors
The system supports multiple selector strategies:
- **CSS Selectors**: `input[type="email"]`, `.class-name`, `#id`
- **XPath**: `//input[@name='username']`
- **Text-based**: `text="Login"`, `button:has-text("Submit")`
- **Attribute-based**: `[data-testid="login-btn"]`, `input[placeholder="Email"]`

## Stealth Verification

The integration includes comprehensive stealth measures:
- WebDriver property removal
- Plugin array spoofing
- Language consistency preservation
- Chrome runtime protection
- Permissions mocking
- Error pattern prevention

To verify stealth, visit `test-stealth.html` in your browser to check for detection vectors.

## Best Practices

1. **Always start Chrome with debugging enabled** for main instance control
2. **Use realistic timing** between actions (add waits as needed)
3. **Implement proper error handling** and retry logic
4. **Monitor for detection** and adjust strategies as needed
5. **Clean up resources** by always closing the browser when done
6. **Use specific selectors** that are less likely to change
7. **Combine with native Windows automation** when needed

## Troubleshooting

### Common Issues:
- **Connection fails**: Ensure Chrome is running with `--remote-debugging-port=9222`
- **Selectors don't work**: Websites change their HTML structure frequently
- **Detection occurs**: Update stealth flags or use different interaction patterns

### Verification Commands:
```bash
# Check if Chrome debugging is active
curl http://127.0.0.1:9222/json/version

# Test connection
node -e "require('axios').get('http://127.0.0.1:9222/json/version').then(r => console.log('Chrome is running:', r.data.Browser))"
```

## Architecture
```
SmartMouse Vision System
         ↓
Action Routing Layer (handles all actions)
         ↓
Playwright Service (manages browser connections)
         ↓
Chrome Browser (with stealth configurations)
```

This architecture allows seamless switching between native Windows automation and browser automation while maintaining complete stealth from website detection systems.