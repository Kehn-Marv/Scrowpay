# Session Management Implementation

## Overview

This document describes the session management implementation for the ScrowPay Escrow Dashboard, covering session token validation, expiry handling, and logout functionality.

## Requirements Implemented

- **Requirement 13.1**: Validate session token on dashboard load
- **Requirement 13.2**: Redirect to sign-in page if token invalid/expired
- **Requirement 13.3**: Store session token in localStorage (NOT sensitive data like PINs, BVN)
- **Requirement 13.4**: Implement 24-hour session expiry with inactivity timeout
- **Requirement 13.5**: Add "Logout" button to clear session and redirect
- **Requirement 19.2**: Display user's first name in the header
- **Requirement 20.3**: Retrieve user data from Turso DB using phone number from session token

## Architecture

### SessionService

The `SessionService` class handles all session management operations:

```javascript
class SessionService {
  constructor(config)
  createSession(user)
  validateSession()
  updateActivity()
  startInactivityMonitoring()
  stopInactivityMonitoring()
  getSession()
  getUserData()
  clearSession()
  logout()
  redirectToSignIn(reason)
  isAuthenticated()
  getSessionExpiry()
  getInactivityInfo()
  extendSession()
  cleanup()
}
```

### Session Storage

Session data is stored in `localStorage` with the following keys:

- `scrowpay_session`: Session object containing:
  - `userId`: User ID from database
  - `phoneNumber`: User's phone number
  - `firstName`: User's first name
  - `lastName`: User's last name
  - `virtualAccountNumber`: User's virtual account number
  - `createdAt`: Session creation timestamp
  - `expiresAt`: Session expiry timestamp (24 hours from creation)

- `scrowpay_last_activity`: Timestamp of last user activity

**Security Note**: Sensitive data like PINs, BVN, and hashed passwords are **NOT** stored in localStorage.

## Session Lifecycle

### 1. Sign In (sign-in.html)

When a user signs in successfully:

```javascript
// After PIN verification
const sessionResult = sessionService.createSession(user);

if (sessionResult.success) {
  // Redirect to dashboard
  window.location.href = 'dashboard.html';
}
```

### 2. Dashboard Load (dashboard.html)

When the dashboard loads:

```javascript
// Validate session
const validation = sessionService.validateSession();

if (!validation.valid) {
  // Redirect to sign-in with reason
  sessionService.redirectToSignIn(validation.reason);
  return;
}

// Get user data from database
const userDataResult = await sessionService.getUserData();

// Update UI with user data
document.getElementById('user-name').textContent = `Welcome, ${userData.first_name}!`;
```

### 3. Session Validation

The session is validated on:
- Dashboard load
- Every minute (automatic check)
- Before any authenticated operation

Validation checks:
- Session exists in localStorage
- Session has not expired (24 hours)
- User has not been inactive for more than 30 minutes

### 4. Inactivity Monitoring

The service monitors user activity through:
- Mouse movements (`mousedown`)
- Keyboard input (`keydown`)
- Scrolling (`scroll`)
- Touch events (`touchstart`)

When activity is detected, the `last_activity` timestamp is updated.

If the user is inactive for 30 minutes, the session is automatically cleared and the user is redirected to sign-in.

### 5. Logout

When the user clicks the "Logout" button:

```javascript
document.getElementById('btn-logout').addEventListener('click', () => {
  if (confirm('Are you sure you want to logout?')) {
    sessionService.logout();
  }
});
```

This:
1. Clears session data from localStorage
2. Stops inactivity monitoring
3. Redirects to sign-in page

## Session Expiry Reasons

When redirecting to sign-in, the service provides a reason:

- `no_session`: No session found in localStorage
- `session_expired`: Session has expired (24 hours)
- `inactivity_timeout`: User was inactive for 30 minutes
- `logout`: User clicked logout button
- `validation_error`: Session data is corrupted
- `user_data_error`: Failed to retrieve user data from database

The sign-in page displays an appropriate message based on the reason.

## Configuration

Session timeouts can be configured in the `SessionService` constructor:

```javascript
this.SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours
this.INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
```

## Testing

A test suite is provided in `test-session-management.html` to verify:

1. Session creation
2. Session validation
3. Session info retrieval
4. Activity updates
5. Session extension
6. Session clearing
7. localStorage inspection

To run tests:

1. Open `test-session-management.html` in a browser
2. Click each test button to verify functionality
3. Check the console for detailed logs

## Security Considerations

### What is Stored

✅ **Safe to store in localStorage:**
- User ID
- Phone number
- First name
- Last name
- Virtual account number
- Session timestamps

### What is NOT Stored

❌ **Never stored in localStorage:**
- PIN (plain or hashed)
- BVN (Bank Verification Number)
- ID numbers
- Passwords
- Authentication tokens from external services

### Session Security

- Sessions expire after 24 hours
- Inactivity timeout of 30 minutes
- Session validation on every page load
- Automatic cleanup on expiry
- Secure redirect on invalid session

## Integration with Existing Code

### sign-in.html

```javascript
// After successful PIN verification
const sessionResult = sessionService.createSession(user);
```

### dashboard.html

```javascript
// At the start of DOMContentLoaded
const sessionService = new SessionService(config);
const validation = sessionService.validateSession();

if (!validation.valid) {
  sessionService.redirectToSignIn(validation.reason);
  return;
}

// Get user data
const userDataResult = await sessionService.getUserData();
const userData = userDataResult.user;

// Update UI
document.getElementById('user-name').textContent = `Welcome, ${userData.first_name}!`;

// Logout button
document.getElementById('btn-logout').addEventListener('click', () => {
  sessionService.logout();
});
```

## Files Modified

1. **frontend/SessionService.js** (NEW)
   - Complete session management service

2. **frontend/sign-in.html** (MODIFIED)
   - Added SessionService import
   - Updated sign-in flow to create session
   - Added redirect reason display

3. **frontend/dashboard.html** (MODIFIED)
   - Added SessionService import
   - Added session validation on load
   - Added logout button handler
   - Updated user data loading from session

4. **frontend/test-session-management.html** (NEW)
   - Test suite for session management

## Future Enhancements

1. **Refresh Tokens**: Implement refresh tokens for seamless session renewal
2. **Multi-Device Sessions**: Track and manage sessions across multiple devices
3. **Session History**: Log session activity for security auditing
4. **Remember Me**: Optional extended session duration
5. **Session Warnings**: Warn user before session expires

## Troubleshooting

### Session keeps expiring

- Check if system time is correct
- Verify `SESSION_DURATION` is set correctly
- Check browser console for validation errors

### Redirect loop

- Clear localStorage manually: `localStorage.clear()`
- Check if session creation is successful in sign-in
- Verify database connection is working

### User data not loading

- Check Turso DB connection
- Verify phone number format in session
- Check database for user record

## Support

For issues or questions, check:
1. Browser console for error messages
2. SessionService logs (prefixed with `[SessionService]`)
3. Test suite results in `test-session-management.html`
