# Account Creation Flow - Updated Navigation Diagram

## Complete Flow with Back Button Navigation

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     ACCOUNT CREATION FLOW                               │
│                     (With Back Navigation)                              │
└─────────────────────────────────────────────────────────────────────────┘

                              START
                                │
                                ▼
                    ┌───────────────────────┐
                    │   STAGE 1             │
                    │   Phone Number Entry  │
                    │                       │
                    │   [No Back Button]    │
                    └───────────────────────┘
                                │
                                │ Next
                                ▼
                    ┌───────────────────────┐
                    │   STAGE 2             │
                    │   OTP Verification    │
                    │                       │
                    │   [← Back]            │◄─────┐
                    └───────────────────────┘      │
                                │                   │
                                │ Verify            │
                                ▼                   │
                    ┌───────────────────────┐      │
                    │   STAGE 3             │      │
                    │   BVN Entry           │      │
                    │   (NIN Removed)       │      │
                    │   [← Back]            │◄─────┼─────┐
                    └───────────────────────┘      │     │
                                │                   │     │
                                │ Next              │     │
                                ▼                   │     │
                    ┌───────────────────────┐      │     │
                    │   STAGE 4             │      │     │
                    │   Name & Details      │      │     │
                    │   Entry               │      │     │
                    │   [← Back]            │◄─────┼─────┼─────┐
                    └───────────────────────┘      │     │     │
                                │                   │     │     │
                                │ Next              │     │     │
                                ▼                   │     │     │
                    ┌───────────────────────┐      │     │     │
                    │   STAGE 5             │      │     │     │
                    │   Virtual Account     │      │     │     │
                    │   Creation            │      │     │     │
                    │   [Auto-Processing]   │      │     │     │
                    └───────────────────────┘      │     │     │
                                │                   │     │     │
                                │ Success           │     │     │
                                ▼                   │     │     │
                    ┌───────────────────────┐      │     │     │
                    │   STAGE 6             │      │     │     │
                    │   Face Verification   │      │     │     │
                    │   Intro               │      │     │     │
                    │   [← Back]            │◄─────┼─────┼─────┼─────┐
                    └───────────────────────┘      │     │     │     │
                                │                   │     │     │     │
                                │ Let's Start       │     │     │     │
                                ▼                   │     │     │     │
                    ┌───────────────────────┐      │     │     │     │
                    │   STAGE 7             │      │     │     │     │
                    │   Blink Detection     │      │     │     │     │
                    │                       │      │     │     │     │
                    │   [← Back]            │◄─────┼─────┼─────┼─────┼─────┐
                    └───────────────────────┘      │     │     │     │     │
                                │                   │     │     │     │     │
                                │ Blink Detected    │     │     │     │     │
                                ▼                   │     │     │     │     │
                    ┌───────────────────────┐      │     │     │     │     │
                    │   STAGE 8             │      │     │     │     │     │
                    │   Address Entry       │      │     │     │     │     │
                    │                       │      │     │     │     │     │
                    │   [← Back]            │◄─────┼─────┼─────┼─────┼─────┼─────┐
                    └───────────────────────┘      │     │     │     │     │     │
                                │                   │     │     │     │     │     │
                                │ Next              │     │     │     │     │     │
                                ▼                   │     │     │     │     │     │
                    ┌───────────────────────┐      │     │     │     │     │     │
                    │   STAGE 9             │      │     │     │     │     │     │
                    │   PIN Setup           │      │     │     │     │     │     │
                    │                       │      │     │     │     │     │     │
                    │   [← Back]            │──────┘     │     │     │     │     │
                    └───────────────────────┘            │     │     │     │     │
                                │                         │     │     │     │     │
                                │ Next                    │     │     │     │     │
                                ▼                         │     │     │     │     │
                    ┌───────────────────────┐            │     │     │     │     │
                    │   STAGE 10            │            │     │     │     │     │
                    │   Success Screen      │            │     │     │     │     │
                    │                       │            │     │     │     │     │
                    │   [No Back Button]    │            │     │     │     │     │
                    └───────────────────────┘            │     │     │     │     │
                                │                         │     │     │     │     │
                                │ Click Anywhere          │     │     │     │     │
                                ▼                         │     │     │     │     │
                          DASHBOARD                       │     │     │     │     │
                                                          │     │     │     │     │
Legend:                                                   │     │     │     │     │
─────────────────────────────────────────────────────────┘     │     │     │     │
│ Forward Navigation (Next/Continue)                            │     │     │     │
◄ Back Navigation (Back Button)                                 │     │     │     │
                                                                 │     │     │     │
Back Navigation Paths:                                          │     │     │     │
─────────────────────────────────────────────────────────────────┘     │     │     │
Stage 9 → Stage 8                                                      │     │     │
Stage 8 → Stage 7 ─────────────────────────────────────────────────────┘     │     │
Stage 7 → Stage 6 ──────────────────────────────────────────────────────────┘     │
Stage 6 → Stage 5 (Auto-processing, no back from here)                            │
Stage 4 → Stage 3 ───────────────────────────────────────────────────────────────┘
Stage 3 → Stage 2 ────────────────────────────────────────────────────────────────┘
Stage 2 → Stage 1 ─────────────────────────────────────────────────────────────────┘
```

---

## Stage Details

### Stage 1: Phone Number Entry
- **Purpose**: Collect user's phone number
- **Validation**: Nigerian phone format (11 digits with 0, or 10 without)
- **Back Button**: ❌ No (first stage)
- **Next Action**: Duplicate check → OTP sent

### Stage 2: OTP Verification
- **Purpose**: Verify phone number ownership
- **Validation**: 6-digit OTP code
- **Back Button**: ✅ Yes → Returns to Stage 1
- **Next Action**: OTP verification → Continue

### Stage 3: BVN Entry (Updated)
- **Purpose**: Collect Bank Verification Number
- **Changes**: 
  - ❌ Removed NIN option
  - ✅ BVN only
  - ✅ Simplified UI
- **Validation**: 11-digit BVN
- **Back Button**: ✅ Yes → Returns to Stage 2
- **Next Action**: Duplicate check → Confirmation modal

### Stage 4: Name & Details Entry
- **Purpose**: Collect personal information
- **Fields**: First name, middle name, last name, DOB, gender
- **Validation**: Required fields, date validation
- **Back Button**: ✅ Yes → Returns to Stage 3
- **Next Action**: Data stored → Virtual account creation

### Stage 5: Virtual Account Creation
- **Purpose**: Create Squad virtual account with BVN verification
- **Process**: Auto-processing with loading indicator
- **Back Button**: ❌ No (auto-processing)
- **Next Action**: Success → Face verification intro

### Stage 6: Face Verification Intro
- **Purpose**: Explain face verification process
- **Content**: Informational screen with face icon
- **Back Button**: ✅ Yes → Returns to Stage 5 (if needed)
- **Next Action**: Let's Start → Blink detection

### Stage 7: Blink Detection
- **Purpose**: Verify user is present (liveness check)
- **Process**: Camera access → Face detection → Blink detection
- **Back Button**: ✅ Yes → Returns to Stage 6
- **Next Action**: Blink detected → Processing screen → Success

### Stage 8: Address Entry
- **Purpose**: Collect residential address
- **Fields**: State, LGA, Area, Street address, Landmark
- **Features**: Cascading dropdowns, "Same as current" checkbox
- **Back Button**: ✅ Yes → Returns to Stage 7
- **Next Action**: Address validation → PIN setup

### Stage 9: PIN Setup
- **Purpose**: Set 6-digit login password
- **Validation**: PIN format, PIN confirmation match
- **Back Button**: ✅ Yes → Returns to Stage 8
- **Next Action**: PIN hashed → User saved to database → Success

### Stage 10: Success Screen
- **Purpose**: Confirm account creation
- **Content**: Success checkmark, account details
- **Back Button**: ❌ No (final stage)
- **Next Action**: Click anywhere → Dashboard

---

## Navigation Rules

### Forward Navigation
- ✅ Requires validation of current stage
- ✅ Data must be complete and valid
- ✅ Duplicate checks performed where applicable
- ✅ Progress is saved to registration state

### Backward Navigation
- ✅ No validation required
- ✅ Data is preserved in registration state
- ✅ User can modify previous entries
- ✅ Can navigate multiple stages back
- ✅ No data loss during navigation

### Validation Points
1. **Stage 1**: Phone format, duplicate check
2. **Stage 2**: OTP code verification
3. **Stage 3**: BVN format, duplicate check
4. **Stage 4**: Required fields, date validation
5. **Stage 5**: Squad API verification (auto)
6. **Stage 6**: No validation (informational)
7. **Stage 7**: Blink detection (auto)
8. **Stage 8**: Address completeness
9. **Stage 9**: PIN format, confirmation match

---

## Data Flow

```
Registration State Object
├── currentStage: number
├── phoneNumber: string (+234XXXXXXXXXX)
├── idType: 'BVN' (NIN removed)
├── idNumber: string (11 digits)
├── firstName: string
├── middleName: string
├── lastName: string
├── dob: string (MM/DD/YYYY)
├── gender: string ('1' or '2')
├── currentAddress: object
│   ├── state: string
│   ├── lga: string
│   ├── area: string
│   ├── addressText: string
│   └── landmark: string
├── permanentAddress: object
│   ├── state: string
│   ├── lga: string
│   ├── area: string
│   └── addressText: string
├── pin: string (6 digits, hashed before save)
├── virtualAccountNumber: string
├── bankCode: string
└── verificationStatus: object
    ├── phoneVerified: boolean
    ├── otpVerified: boolean
    ├── idVerified: boolean
    └── faceVerified: boolean
```

---

## Error Handling

### Validation Errors
- Show modal with error message
- User stays on current stage
- Can click back button to navigate away

### Network Errors
- Show retry option
- Show back button option
- Preserve user data

### Camera Errors (Stage 7)
- Show specific error message
- Offer retry option
- Offer back button option

### Database Errors
- Show retry option
- Preserve user data
- Log error details

---

## User Experience Improvements

### Before (Without Back Buttons)
```
User Journey:
1. Enter phone → 2. OTP → 3. BVN → 4. Name → [Mistake!]
   ↓
   ❌ Must restart entire flow
   ↓
   Frustration → Abandonment
```

### After (With Back Buttons)
```
User Journey:
1. Enter phone → 2. OTP → 3. BVN → 4. Name → [Mistake!]
   ↓
   ✅ Click back button
   ↓
   3. Correct BVN → 4. Continue
   ↓
   Success → Completion
```

---

## Mobile View Considerations

```
┌─────────────────┐
│  ← Back         │  ← Easily tappable
│                 │
│  Stage Title    │
│                 │
│  [Input Fields] │
│                 │
│  [Next Button]  │
│                 │
└─────────────────┘
```

- Back button at top for easy thumb access
- Large touch target (44x44px minimum)
- Clear visual hierarchy
- Responsive layout

---

## Accessibility Features

- ✅ Keyboard navigation support
- ✅ Screen reader announcements
- ✅ Focus indicators
- ✅ Color contrast compliance
- ✅ Touch target sizes
- ✅ Clear error messages

---

## Performance Metrics

| Metric | Target | Notes |
|--------|--------|-------|
| Navigation Speed | < 100ms | Instant stage transition |
| Memory Usage | < 50MB | No memory leaks |
| Page Load | < 2s | Initial load time |
| Back Button Response | < 50ms | Immediate feedback |

---

## Future Enhancements

1. **Progress Indicator**: Show user's position in flow (e.g., "Step 3 of 9")
2. **Save & Resume**: Allow users to save progress and continue later
3. **Skip Options**: Allow skipping optional fields
4. **Breadcrumb Navigation**: Visual representation of completed stages
5. **Undo/Redo**: More granular control over changes
6. **Auto-save**: Automatically save data as user progresses

---

## Summary

### Key Changes
1. ✅ Added back buttons to stages 2-4, 6-9
2. ✅ Removed NIN option (BVN only)
3. ✅ Simplified ID verification UI
4. ✅ Improved user control and flexibility
5. ✅ Maintained data persistence during navigation

### Benefits
- 🎯 Better user experience
- 🚀 Higher completion rates
- 💡 Reduced support tickets
- ✨ Increased user confidence
- 🔒 Maintained security standards
