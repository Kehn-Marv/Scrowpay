# Quick Test Guide: BVN Masking

## Test the BVN Masking Feature

### Quick Test (2 minutes)

1. **Open the app**
   ```
   Open: frontend/account-creation.html
   ```

2. **Navigate to BVN stage**
   - Enter phone: `08135866028`
   - Click Next
   - Enter OTP: `123456`
   - Click Verify, then Continue

3. **Enter BVN**
   ```
   Enter: 22681364684
   Click: Next
   ```

4. **Verify masking**
   ```
   Expected modal text:
   "Please confirm your BVN:
   
   *******4684"
   
   ✅ Should show: *******4684
   ❌ Should NOT show: 22681364684
   ```

5. **Take screenshot**
   - Take a screenshot of the modal
   - Verify only last 4 digits are visible
   - ✅ Safe to share this screenshot!

---

## Test Cases

### Test 1: Standard BVN
```
Input:    22681364684
Expected: *******4684
Status:   [ ] Pass [ ] Fail
```

### Test 2: Different BVN
```
Input:    12345678901
Expected: *******8901
Status:   [ ] Pass [ ] Fail
```

### Test 3: Another BVN
```
Input:    98765432109
Expected: *******2109
Status:   [ ] Pass [ ] Fail
```

### Test 4: Masking Length
```
Input:    22681364684 (11 digits)
Expected: *******4684 (7 asterisks + 4 digits)
Count:    11 total characters
Status:   [ ] Pass [ ] Fail
```

---

## Visual Verification

### What You Should See

```
┌─────────────────────────────────────┐
│     Confirm Your BVN                │
│                                     │
│  Please confirm your BVN:           │
│                                     │
│  *******4684                        │  ← Only this!
│                                     │
│  [Edit]  [Confirm]                  │
└─────────────────────────────────────┘
```

### What You Should NOT See

```
┌─────────────────────────────────────┐
│     Confirm Your BVN                │
│                                     │
│  Please confirm your BVN:           │
│                                     │
│  22681364684                        │  ← NOT this!
│                                     │
│  [Edit]  [Confirm]                  │
└─────────────────────────────────────┘
```

---

## Demo Preparation Checklist

Before your live demo:

- [ ] Test BVN masking works correctly
- [ ] Take practice screenshots - verify masking
- [ ] Record practice video - verify masking
- [ ] Test on projector/large screen - verify readable
- [ ] Prepare test BVN (use dummy: 12345678901)
- [ ] Verify modal is visible to audience
- [ ] Confirm last 4 digits are clear enough

---

## Demo Script

```
"Now I'll demonstrate the BVN verification process.
As you can see, when I enter my BVN...
[Enter BVN]
...the system asks me to confirm it.
[Click Next]
Notice that for security, we only show the last 4 digits.
[Point to *******4684]
This protects sensitive information while still allowing
verification. The user can check the last 4 digits to
confirm they entered it correctly.
[Click Confirm]
And we proceed to the next step."
```

---

## Troubleshooting

### Issue: Full BVN showing
```
Problem: Modal shows "22681364684" instead of "*******4684"
Solution: 
1. Clear browser cache
2. Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
3. Verify you're using the updated file
4. Check browser console for errors
```

### Issue: Wrong number of asterisks
```
Problem: Shows "****4684" (4 asterisks) instead of "*******4684" (7 asterisks)
Solution:
1. Check BVN length (should be 11 digits)
2. Verify masking logic: '*'.repeat(idNumber.length - 4)
3. Check browser console for errors
```

### Issue: No masking at all
```
Problem: Modal shows empty or undefined
Solution:
1. Check if idNumber is defined
2. Verify masking code is present
3. Check browser console for JavaScript errors
4. Verify modal is rendering correctly
```

---

## Browser Console Test

Open browser console and run:

```javascript
// Test masking function
const testBVN = "22681364684";
const masked = '*'.repeat(testBVN.length - 4) + testBVN.slice(-4);
console.log("Original:", testBVN);
console.log("Masked:", masked);
console.log("Expected: *******4684");
console.log("Match:", masked === "*******4684" ? "✅ PASS" : "❌ FAIL");
```

Expected output:
```
Original: 22681364684
Masked: *******4684
Expected: *******4684
Match: ✅ PASS
```

---

## Security Verification

### Checklist

- [ ] Full BVN never visible in modal
- [ ] Only last 4 digits visible
- [ ] Asterisks used for masking
- [ ] Masking consistent across browsers
- [ ] Screenshots are safe
- [ ] Screen recordings are safe
- [ ] No BVN in browser console logs
- [ ] No BVN in network requests (check DevTools)

---

## Success Criteria

✅ **Test passes when:**
1. Modal shows `*******4684` format
2. First 7 digits are asterisks
3. Last 4 digits are visible
4. Total length is 11 characters
5. Screenshots are safe to share
6. User can still verify their entry

❌ **Test fails when:**
1. Full BVN is visible
2. Wrong number of asterisks
3. Wrong digits visible
4. Masking not working
5. JavaScript errors occur

---

## Quick Reference

### Masking Formula
```javascript
const maskedBVN = '*'.repeat(idNumber.length - 4) + idNumber.slice(-4);
```

### Examples
```
22681364684 → *******4684
12345678901 → *******8901
98765432109 → *******2109
```

### File Location
```
frontend/account-creation.html
Line: ~901-904
```

---

## Report Issues

If masking doesn't work:

1. **Check browser console** for errors
2. **Take screenshot** of the issue
3. **Note the BVN** you entered (for testing)
4. **Record browser** and OS version
5. **Document steps** to reproduce

---

## Summary

**What changed:**
- BVN confirmation now masks first 7 digits
- Only last 4 digits visible
- Safe for demos and screenshots

**How to test:**
1. Enter BVN: `22681364684`
2. Click Next
3. Verify modal shows: `*******4684`
4. ✅ Test passes!

**Why it matters:**
- 🎥 Safe for live demos
- 📸 Safe for screenshots
- 🔒 Protects sensitive data
- ✅ Production ready

---

## Need Help?

- Check `BVN_SECURITY_IMPROVEMENT.md` for details
- Check `BVN_MASKING_VISUAL.md` for visual examples
- Check browser console for errors
- Verify file is up to date
