# Testing Guide: Back Button Navigation & BVN-Only Flow

## Overview
This guide helps you test the new back button navigation and BVN-only verification flow in the account creation process.

## Prerequisites
- Open `frontend/account-creation.html` in a web browser
- Have a test phone number ready (e.g., 08135866028)
- Have a test BVN ready (11 digits)

---

## Test Case 1: Back Button Visibility

### Objective
Verify that back buttons appear on all appropriate stages.

### Steps
1. Open account creation page
2. Progress through each stage
3. Check for back button presence

### Expected Results

| Stage | Back Button Expected | Notes |
|-------|---------------------|-------|
| 1 - Phone Entry | ❌ No | First stage |
| 2 - OTP Verification | ✅ Yes | Top left corner |
| 3 - BVN Entry | ✅ Yes | Top left corner |
| 4 - Name Entry | ✅ Yes | Top left corner |
| 5 - Account Creation | ❌ No | Auto-processing |
| 6 - Face Verification Intro | ✅ Yes | Top left corner |
| 7 - Blink Detection | ✅ Yes | Top left corner |
| 8 - Address Entry | ✅ Yes | Top left corner |
| 9 - PIN Setup | ✅ Yes | Top left corner |
| 10 - Success | ❌ No | Final stage |

---

## Test Case 2: Back Button Functionality

### Objective
Verify that back buttons navigate to the correct previous stage.

### Steps
1. Start at Stage 2 (OTP Verification)
2. Click back button
3. Verify you're at Stage 1 (Phone Entry)
4. Progress to Stage 3 (BVN Entry)
5. Click back button
6. Verify you're at Stage 2 (OTP Verification)
7. Repeat for all stages with back buttons

### Expected Results
- Each back button should navigate to the immediately previous stage
- No errors should occur during navigation
- Page should render correctly after navigation

---

## Test Case 3: Data Persistence

### Objective
Verify that user data is preserved when navigating back and forth.

### Steps
1. Enter phone number: `08135866028`
2. Click Next
3. Enter OTP: `123456`
4. Click Verify
5. Click Continue
6. **Click Back button**
7. Verify OTP inputs are cleared (expected behavior)
8. **Click Back button again**
9. Verify phone number is still filled: `8135866028`

### Expected Results
- Phone number should be preserved
- BVN should be preserved when navigating back from Stage 4
- Name fields should be preserved when navigating back from Stage 5
- Address fields should be preserved when navigating back from Stage 9

---

## Test Case 4: BVN-Only Verification

### Objective
Verify that NIN option is completely removed and only BVN is available.

### Steps
1. Navigate to Stage 3 (ID Information)
2. Check the page content

### Expected Results
- ✅ Should see: "Bank Verification Number (BVN)" label
- ✅ Should see: 11 digit input boxes
- ✅ Should see: "Please provide your BVN to verify your account opening application"
- ❌ Should NOT see: "NIN" toggle button
- ❌ Should NOT see: "BVN" toggle button
- ❌ Should NOT see: "BVN/NIN" in description text

---

## Test Case 5: BVN Validation

### Objective
Verify that BVN validation works correctly.

### Steps
1. Navigate to Stage 3 (BVN Entry)
2. Enter invalid BVN: `123` (too short)
3. Click Next
4. Verify error message appears
5. Enter valid BVN: `12345678901` (11 digits)
6. Click Next
7. Verify confirmation modal appears

### Expected Results
- Invalid BVN should show error: "BVN must be exactly 11 digits"
- Valid BVN should show confirmation modal: "Please confirm your BVN"
- Modal should have "Edit" and "Confirm" buttons

---

## Test Case 6: Complete Flow with Back Navigation

### Objective
Test a realistic scenario where user needs to go back and correct information.

### Scenario
User enters wrong phone number and realizes it at Stage 4.

### Steps
1. **Stage 1**: Enter phone: `08135866028`
2. **Stage 2**: Enter OTP: `123456`, click Verify, click Continue
3. **Stage 3**: Enter BVN: `12345678901`, click Next, click Confirm
4. **Stage 4**: Start entering name, then realize phone number was wrong
5. **Click Back** → Returns to Stage 3 (BVN Entry)
6. **Click Back** → Returns to Stage 2 (OTP Verification)
7. **Click Back** → Returns to Stage 1 (Phone Entry)
8. Correct phone number: `08123456789`
9. Progress through all stages again
10. Complete account creation

### Expected Results
- Navigation should work smoothly in both directions
- No data loss during backward navigation
- User can successfully complete the flow after corrections
- No JavaScript errors in console

---

## Test Case 7: Back Button Styling

### Objective
Verify that back button has correct styling and hover effects.

### Steps
1. Navigate to any stage with a back button
2. Observe the back button appearance
3. Hover over the back button
4. Click the back button

### Expected Results
- Back button should have:
  - Left arrow icon (←)
  - "Back" text
  - Dark text color (`text-brand-dark`)
  - Green hover color (`hover:text-brand-green`)
  - Smooth transition effect
  - Proper spacing (`mb-4` margin bottom)
  - Flex layout with gap between icon and text

---

## Test Case 8: Error Handling with Back Navigation

### Objective
Verify that validation errors don't prevent back navigation.

### Steps
1. Navigate to Stage 3 (BVN Entry)
2. Enter invalid BVN: `123`
3. Click Next (error should appear)
4. **Click Back button**
5. Verify you can navigate back despite the error

### Expected Results
- Back button should work even when there are validation errors
- User should be able to navigate back without fixing the error
- No JavaScript errors should occur

---

## Test Case 9: Mobile Responsiveness

### Objective
Verify that back buttons work correctly on mobile devices.

### Steps
1. Open browser developer tools
2. Switch to mobile device view (e.g., iPhone 12)
3. Navigate through account creation flow
4. Test back buttons on each stage

### Expected Results
- Back buttons should be visible and clickable on mobile
- Touch targets should be large enough (minimum 44x44px)
- Layout should not break on small screens
- Back button should not overlap with other content

---

## Test Case 10: Keyboard Navigation

### Objective
Verify that back buttons are accessible via keyboard.

### Steps
1. Navigate to Stage 2 (OTP Verification)
2. Press Tab key until back button is focused
3. Press Enter or Space key
4. Verify navigation occurs

### Expected Results
- Back button should be focusable via Tab key
- Focus indicator should be visible
- Enter/Space key should trigger navigation
- Keyboard navigation should work consistently across all stages

---

## Regression Testing Checklist

After implementing changes, verify these existing features still work:

- [ ] Phone number validation
- [ ] OTP verification
- [ ] BVN validation (now BVN-only)
- [ ] Duplicate phone check
- [ ] Duplicate BVN check
- [ ] Name validation
- [ ] Date of birth selection
- [ ] Gender selection
- [ ] Virtual account creation
- [ ] Face verification
- [ ] Blink detection
- [ ] Address cascading dropdowns
- [ ] PIN setup and confirmation
- [ ] Database saving
- [ ] Session creation
- [ ] Dashboard redirect

---

## Browser Compatibility Testing

Test the back button functionality in:

- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

---

## Performance Testing

### Metrics to Monitor
- Page load time
- Navigation speed (forward and backward)
- Memory usage during navigation
- No memory leaks after multiple navigations

### Tools
- Chrome DevTools Performance tab
- Chrome DevTools Memory tab
- Lighthouse audit

---

## Accessibility Testing

### WCAG Compliance
- [ ] Back buttons have sufficient color contrast
- [ ] Back buttons are keyboard accessible
- [ ] Back buttons have proper focus indicators
- [ ] Screen readers announce back button correctly
- [ ] Touch targets are at least 44x44px

### Tools
- Chrome DevTools Lighthouse (Accessibility audit)
- WAVE browser extension
- Screen reader testing (NVDA, JAWS, VoiceOver)

---

## Bug Reporting Template

If you find any issues, report them using this template:

```markdown
### Bug Title
[Brief description of the issue]

### Steps to Reproduce
1. [First step]
2. [Second step]
3. [Third step]

### Expected Behavior
[What should happen]

### Actual Behavior
[What actually happens]

### Screenshots
[Attach screenshots if applicable]

### Environment
- Browser: [e.g., Chrome 120]
- OS: [e.g., Windows 11]
- Device: [e.g., Desktop, iPhone 12]

### Console Errors
[Paste any JavaScript errors from console]

### Additional Context
[Any other relevant information]
```

---

## Success Criteria

All tests pass when:

✅ Back buttons appear on all appropriate stages (2-4, 6-9)
✅ Back buttons navigate to correct previous stages
✅ User data is preserved during navigation
✅ NIN option is completely removed
✅ BVN validation works correctly
✅ No JavaScript errors occur
✅ Mobile responsiveness is maintained
✅ Keyboard navigation works
✅ Accessibility standards are met
✅ All existing features still work

---

## Quick Test Script

For rapid testing, use this script:

```javascript
// Open browser console and run this script
// to quickly test navigation flow

console.log('Starting navigation test...');

// Test data
const testData = {
  phone: '08135866028',
  otp: '123456',
  bvn: '12345678901',
  firstName: 'John',
  lastName: 'Doe'
};

// Helper function to check current stage
function getCurrentStage() {
  return stageManager.getCurrentStage();
}

// Test back navigation
function testBackNavigation() {
  console.log('Testing back navigation...');
  
  // Navigate forward to stage 4
  stageManager.goToStage(4, true);
  console.log('Current stage:', getCurrentStage()); // Should be 4
  
  // Navigate back
  stageManager.goToPreviousStage();
  console.log('After back:', getCurrentStage()); // Should be 3
  
  stageManager.goToPreviousStage();
  console.log('After back:', getCurrentStage()); // Should be 2
  
  stageManager.goToPreviousStage();
  console.log('After back:', getCurrentStage()); // Should be 1
  
  console.log('✅ Back navigation test complete!');
}

// Run test
testBackNavigation();
```

---

## Notes

- Always test in a clean browser session (incognito/private mode)
- Clear localStorage before each test run
- Check browser console for any errors
- Test with both valid and invalid data
- Verify database operations if testing with real backend
- Document any unexpected behavior

---

## Support

If you encounter any issues during testing:
1. Check browser console for errors
2. Verify you're using the latest version of the file
3. Clear browser cache and reload
4. Test in a different browser
5. Report issues using the bug template above
