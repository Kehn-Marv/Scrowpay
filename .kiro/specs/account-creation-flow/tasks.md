# Implementation Plan: ScrowPay Account Creation Flow

## Overview

This implementation plan breaks down the ScrowPay account creation flow into discrete, actionable coding tasks. The system is a 9-stage web-based registration flow built with vanilla JavaScript, HTML, and Tailwind CSS, integrating with Squad API for identity verification, MediaPipe for liveness detection, and Turso DB for data persistence.

The implementation follows a progressive approach: foundation setup, core stage components, external service integrations, UI polish, and testing. Each task builds incrementally on previous work, ensuring the system remains functional at each checkpoint.

## Tasks

- [x] 1. Set up project structure and core infrastructure
  - Create HTML file structure with Tailwind CSS CDN integration
  - Set up ScrowPay brand colors (#1c1c1c, #caff04, #f5f5f7) and Inter font
  - Create main container with responsive layout
  - Initialize registration state object to track user data across stages
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_

- [ ]* 1.1 Write unit tests for state management
  - Test state initialization with default values
  - Test state updates for each field
  - Test state persistence across stage transitions
  - _Requirements: 13.1_

- [x] 2. Implement StageManager and navigation system
  - Create StageManager class to orchestrate stage transitions
  - Implement getCurrentStage(), goToStage(), goToNextStage() methods
  - Implement renderCurrentStage() to dynamically show/hide stage content
  - Add stage validation before allowing transitions
  - _Requirements: 1.7, 2.11, 3.13, 4.3, 6.4, 8.7, 10.10_

- [ ]* 2.1 Write unit tests for StageManager
  - Test stage transitions (forward and backward)
  - Test stage validation logic
  - Test rendering of different stages
  - _Requirements: 1.7_

- [x] 3. Implement reusable UI components
  - [x] 3.1 Create Modal component with title, message, and button support
    - Implement show() and hide() methods
    - Add button click handlers
    - Style with ScrowPay branding and shadows
    - _Requirements: 2.9, 2.10, 3.10, 3.11, 17.5_
  
  - [x] 3.2 Create Toast notification component
    - Implement show() method with auto-dismiss after 3 seconds
    - Position toast at top of screen
    - Style with ScrowPay colors
    - _Requirements: 2.4, 2.5_
  
  - [x] 3.3 Create DigitInputBox component for multi-digit inputs
    - Render individual input boxes for each digit
    - Implement auto-focus to next box on digit entry
    - Implement backspace handling to move to previous box
    - Add getValue() and setValue() methods
    - _Requirements: 2.3, 3.4, 3.5, 10.3, 10.4_

- [ ]* 3.4 Write unit tests for UI components
  - Test Modal show/hide and button callbacks
  - Test Toast auto-dismiss timing
  - Test DigitInputBox navigation and value handling
  - _Requirements: 2.4, 2.5, 3.10_

- [x] 4. Implement Turso DB service and schema
  - [x] 4.1 Set up Turso DB connection
    - Install @libsql/client package
    - Create TursoDBService class with connection configuration
    - Implement connect() method using database URL and auth token
    - _Requirements: 12.9, 16.1, 16.2_
  
  - [x] 4.2 Create database schema
    - Create users table with all required columns (phone_number, id_type, id_number, names, addresses, hashed_pin, timestamps)
    - Create unique indexes on phone_number and id_number for duplicate checking
    - Create index on created_at for query performance
    - _Requirements: 12.1, 12.4, 12.7, 12.8, 16.3, 16.4_
  
  - [x] 4.3 Implement duplicate checking methods
    - Implement checkPhoneDuplicate(phone) to query existing phone numbers
    - Implement checkIDDuplicate(idNumber, idType) to query existing BVN/NIN
    - Return boolean indicating if duplicate exists
    - _Requirements: 12.2, 12.3, 12.5, 12.6, 12.9_
  
  - [x] 4.4 Implement user data persistence
    - Implement saveUser(userData) to insert complete user record
    - Implement getUserByPhone(phone) for user retrieval
    - Add error handling for database operations
    - _Requirements: 12.7, 12.8, 12.10, 17.2_

- [ ]* 4.5 Write integration tests for Turso DB service
  - Test database connection and schema creation
  - Test duplicate checking with existing and non-existing records
  - Test user insertion and retrieval
  - Test error handling for connection failures
  - _Requirements: 12.2, 12.5, 16.4_

- [x] 5. Checkpoint - Ensure infrastructure is working
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement Stage 1: Phone Number Entry
  - [x] 6.1 Create PhoneValidationService
    - Implement validateFormat() to accept 08135866028 or 8135866028 formats
    - Implement normalizePhone() to convert to +2348135866028 format
    - Validate 11 digits (with 0) or 10 digits (without 0)
    - _Requirements: 1.3, 1.4_
  
  - [x] 6.2 Build phone entry UI
    - Render header "Get a ScrowPay Account"
    - Render phone input field with Nigeria flag icon and +234 prefix
    - Add red border styling for invalid input
    - Render "Next" button
    - _Requirements: 1.1, 1.2, 1.5, 1.6_
  
  - [x] 6.3 Implement phone validation and submission
    - Validate phone format on input change
    - Check for duplicate phone number in database on submit
    - Display error modal if phone already registered
    - Transition to Stage 2 on successful validation
    - _Requirements: 1.7, 12.2, 12.3, 17.2_

- [ ]* 6.4 Write unit tests for phone validation
  - Test validateFormat() with valid formats (with/without leading 0)
  - Test validateFormat() with invalid formats
  - Test normalizePhone() conversion
  - Test duplicate detection logic
  - _Requirements: 1.3, 1.4, 12.2_

- [x] 7. Implement Stage 2: OTP Verification
  - [x] 7.1 Create OTPService
    - Implement verifyOTP() method with hardcoded correct OTP "123456"
    - Return true for "123456", false for all other inputs
    - _Requirements: 2.7, 2.8, 18.4_
  
  - [x] 7.2 Build OTP verification UI
    - Render header "Verify Your Phone Number"
    - Render Step 1 tile with message showing user's phone number and OTP icon
    - Render Step 2 tile with 6 DigitInputBox components for OTP entry
    - Render "Verify" button
    - _Requirements: 2.1, 2.2, 2.3, 2.6_
  
  - [x] 7.3 Implement OTP verification flow
    - Display toast notification "A verification code has been sent to your mobile phone" on page load
    - Validate OTP on verify button click
    - Display "Failed!" modal with "verification code error" message for incorrect OTP
    - Display "Succeeded!" modal with success message for correct OTP
    - Transition to Stage 3 on success modal dismissal
    - _Requirements: 2.4, 2.5, 2.7, 2.8, 2.9, 2.10, 2.11_

- [ ]* 7.4 Write unit tests for OTP verification
  - Test OTPService with correct OTP "123456"
  - Test OTPService with incorrect OTPs
  - Test toast notification display and auto-dismiss
  - Test modal display for success and failure cases
  - _Requirements: 2.7, 2.8, 2.9_

- [x] 8. Implement Stage 3: ID Information Entry
  - [x] 8.1 Create IDValidationService
    - Implement validateBVN() to check 11 digits starting with 1 or 2
    - Implement validateNIN() to check 11 digits
    - Return validation result with error messages
    - _Requirements: 3.6, 3.7_
  
  - [x] 8.2 Build ID information UI
    - Render header "Enter your ID information"
    - Render subheader with BVN/NIN verification explanation
    - Render toggle selector for NIN/BVN selection
    - Render 11 DigitInputBox components for ID entry
    - Render "Next" button
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.9_
  
  - [x] 8.3 Implement ID validation and confirmation flow
    - Validate ID format based on selected type (BVN/NIN)
    - Display validation error modal for invalid format
    - Check for duplicate ID in database
    - Display confirmation modal showing entered ID with "Edit" and "Confirm" buttons
    - Return to ID input on "Edit", proceed to Stage 4 on "Confirm"
    - _Requirements: 3.6, 3.7, 3.8, 3.10, 3.11, 3.12, 3.13, 12.5, 12.6_

- [ ]* 8.4 Write unit tests for ID validation
  - Test validateBVN() with valid BVNs (starting with 1 or 2)
  - Test validateBVN() with invalid BVNs
  - Test validateNIN() with valid and invalid NINs
  - Test duplicate ID detection
  - _Requirements: 3.6, 3.7, 12.5_

- [x] 9. Implement Stage 4: Name Entry
  - [x] 9.1 Build name entry UI
    - Render form with three text input fields: "First Name", "Middle Name", "Last Name"
    - Add validation for alphabetic characters only
    - Render "Next" button
    - _Requirements: 4.1, 4.2, 4.3_
  
  - [x] 9.2 Implement name validation and submission
    - Validate alphabetic characters in all name fields
    - Store names in registration state
    - Transition to Stage 5 on successful submission
    - _Requirements: 4.2, 4.3_

- [ ]* 9.3 Write unit tests for name validation
  - Test alphabetic character validation
  - Test required field validation
  - Test state updates with name data
  - _Requirements: 4.2_

- [x] 10. Checkpoint - Ensure core stages are working
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement Stage 5: Squad API Verification
  - [x] 11.1 Create SquadAPIService
    - Create class with constructor accepting secretKey and publicKey
    - Implement verifyBVN(bvn) method to call Squad API BVN endpoint
    - Implement verifyNIN(nin) method to call Squad API NIN endpoint
    - Add Bearer token authentication with secret key
    - Parse API response and return VerificationResult object
    - _Requirements: 5.1, 5.2, 15.1, 15.2, 15.3, 15.4, 15.5_
  
  - [x] 11.2 Build Squad API verification UI
    - Display loading indicator with "Verifying your identity..." message
    - Show progress animation during API call
    - _Requirements: 5.1_
  
  - [x] 11.3 Implement verification flow and error handling
    - Call Squad API with user's BVN or NIN based on ID type
    - Handle successful verification response and proceed to Stage 6
    - Display error modal with failure reason for failed verification
    - Display error modal with retry option for network errors
    - Allow user to retry verification on failure
    - _Requirements: 5.3, 5.4, 5.5, 17.1_

- [ ]* 11.4 Write integration tests for Squad API service
  - Test API request format and authentication
  - Test successful verification response handling
  - Test failed verification response handling
  - Test network error handling and retry logic
  - _Requirements: 5.1, 5.3, 5.4, 17.1_

- [x] 12. Implement Stage 6: Face Verification Introduction
  - [x] 12.1 Build face verification intro UI
    - Render header "Face Verification"
    - Render description "Face verification is used to confirm that you are the BVN holder"
    - Render "Let's Start" button
    - _Requirements: 6.1, 6.2, 6.3_
  
  - [x] 12.2 Implement transition to blink detection
    - Transition to Stage 7 (blink detection screen) on button click
    - _Requirements: 6.4_

- [x] 13. Implement Stage 7: Blink Detection and Liveness Check
  - [x] 13.1 Create MediaPipeService
    - Create class with constructor accepting videoElement and canvasElement
    - Implement initialize() to load MediaPipe Face Mesh library
    - Implement calculateEAR(landmarks) to compute Eye Aspect Ratio
    - Implement startDetection(onBlinkDetected) to process video frames
    - Implement stopDetection() to clean up camera stream
    - Extract eye landmarks (indices 33-133 for left eye, 362-263 for right eye)
    - Detect blink when EAR drops below 0.25 threshold then rises above
    - _Requirements: 7.4, 7.5, 14.1, 14.2, 14.3, 14.4, 14.5_
  
  - [x] 13.2 Build blink detection UI
    - Request camera access on page load
    - Display live camera feed with oval frame overlay for face positioning
    - Display instruction "Blink your eyes"
    - Add MediaPipe library via CDN (face_mesh and camera_utils)
    - _Requirements: 7.1, 7.2, 7.3_
  
  - [x] 13.3 Implement blink detection flow
    - Initialize MediaPipe Face Mesh when stage loads
    - Start real-time video processing
    - Calculate EAR for each frame
    - Trigger callback when valid blink detected
    - Transition to verification processing screen on blink detection
    - _Requirements: 7.5, 7.6_
  
  - [x] 13.4 Implement camera error handling
    - Display error modal if camera access denied
    - Display error modal if no camera available
    - Display error modal if MediaPipe fails to initialize
    - Display error modal if face not detected in frame
    - _Requirements: 17.3, 17.4_

- [ ]* 13.5 Write integration tests for MediaPipe service
  - Test MediaPipe initialization
  - Test EAR calculation with mock landmarks
  - Test blink detection threshold logic
  - Test callback invocation on blink
  - Test camera error handling
  - _Requirements: 7.4, 7.5, 14.3_

- [x] 14. Implement Face Verification Processing Screen
  - [x] 14.1 Build processing UI
    - Display "Checking..." overlay with progress indicator
    - Display "Almost done" message with percentage value
    - Animate percentage from 0% to 100%
    - _Requirements: 8.1, 8.2_
  
  - [x] 14.2 Implement mock face matching
    - Simulate processing delay between 1.5 and 2 seconds
    - Return hardcoded success response after delay
    - Display "Succeeded!" modal with "Your face has been verified successfully!" message
    - Transition to Stage 8 on success modal dismissal
    - _Requirements: 8.3, 8.4, 8.5, 8.6, 18.3_

- [ ]* 14.3 Write unit tests for processing screen
  - Test processing delay timing
  - Test success modal display
  - Test transition to next stage
  - _Requirements: 8.3, 8.4_

- [x] 15. Implement Stage 8: Residential Address Entry with Cascading Dropdowns
  - [x] 15.1 Create AddressDataService to load and query state-lga-area.json
    - Create AddressDataService class with constructor
    - Implement loadData() method to fetch and parse state-lga-area.json file
    - Implement getStates() method to return array of all state names
    - Implement getLGAsForState(state) method to filter and return LGAs for specified state
    - Implement getWardsForLGA(state, lga) method to filter and return wards/areas for specified state and LGA
    - Cache parsed JSON data in memory after loading for instant filtering
    - _Requirements: 9.1_
  
  - [x] 15.2 Build address entry UI with cascading dropdowns
    - Render "Current Address" section with State, LGA, Area dropdowns
    - Set LGA and Area dropdowns to disabled initially (grayed out)
    - Add Address text field and optional Landmark/Nearest Bus Stop field
    - Render "Permanent Address" section with "Same as Current Address" checkbox
    - Set checkbox to checked by default
    - Hide permanent address fields when checkbox is checked
    - Show permanent address State, LGA, Area dropdowns and Address field when checkbox is unchecked
    - Render "Next" button
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_
  
  - [x] 15.3 Implement cascading dropdown logic and event handlers
    - Load address data using AddressDataService on stage initialization
    - Populate State dropdown with all states from getStates()
    - Implement state selection handler for current address:
      * Get LGAs for selected state using getLGAsForState()
      * Populate LGA dropdown with filtered LGAs
      * Enable LGA dropdown
      * Reset and disable Area dropdown
    - Implement LGA selection handler for current address:
      * Get wards for selected state and LGA using getWardsForLGA()
      * Populate Area dropdown with filtered wards
      * Enable Area dropdown
    - Implement "Same as Current Address" checkbox handler:
      * Hide/show permanent address fields based on checkbox state
      * Clear permanent address selections when checked
      * Initialize permanent address dropdowns when unchecked
    - Apply same cascading logic to permanent address dropdowns (state → LGA → area)
    - _Requirements: 9.1, 9.3, 9.4, 9.5_
  
  - [x] 15.4 Implement address validation and submission
    - Validate all required fields are filled (State, LGA, Area, Address text)
    - Copy current address to permanent address when checkbox is checked
    - Store address data in registration state
    - Transition to Stage 9 on successful submission
    - _Requirements: 9.3, 9.4, 9.5, 9.8_

- [ ]* 15.5 Write unit tests for address entry with cascading dropdowns
  - Test state selection enables LGA dropdown
  - Test LGA selection enables Area dropdown
  - Test dropdown reset when parent selection changes
  - Test "Same as Current Address" checkbox behavior
  - Test field visibility toggling
  - Test address data copying logic
  - Test required field validation
  - _Requirements: 9.3, 9.4, 9.5_

- [x] 16. Implement Stage 9: PIN Setup and Validation
  - [x] 16.1 Create PINService
    - Implement validatePIN(pin) to check exactly 6 digits
    - Validate no repeated digits (e.g., "111111" invalid)
    - Validate no consecutive digits (e.g., "123456" invalid)
    - Implement hashPIN(pin) using Web Crypto API SHA-256
    - Salt hash with user's phone number for additional security
    - Implement verifyPIN(pin, hash) for future login verification
    - _Requirements: 10.5, 10.6, 10.7, 10.9_
  
  - [x] 16.2 Build PIN setup UI
    - Render header "Set Your 6-Digit Login Password"
    - Render description "This password must contain numbers which cannot be repeated or consecutive"
    - Render "Set Password" section with 6 DigitInputBox components
    - Render "Re-Enter Password" section with 6 DigitInputBox components
    - Render "Next" button
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.10_
  
  - [x] 16.3 Implement PIN validation and submission
    - Validate PIN format (6 digits, no repeats, no consecutive)
    - Display validation error modal for invalid PIN format
    - Validate PIN and re-entered PIN match
    - Display validation error modal for PIN mismatch
    - Hash PIN before storing in registration state
    - Transition to Stage 10 (Success) on successful validation
    - _Requirements: 10.5, 10.6, 10.7, 10.8, 10.11_

- [ ]* 16.4 Write unit tests for PIN service
  - Test validatePIN() with valid PINs
  - Test validatePIN() with repeated digits
  - Test validatePIN() with consecutive digits
  - Test PIN hashing and verification
  - Test PIN match validation
  - _Requirements: 10.5, 10.6, 10.7, 10.9_

- [x] 17. Checkpoint - Ensure all stages are complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 18. Implement Success Screen and Data Persistence
  - [x] 18.1 Build success screen UI
    - Display success modal or screen confirming account creation
    - Show success message and checkmark icon
    - Add click handler to dismiss success message
    - _Requirements: 11.1, 11.2_
  
  - [x] 18.2 Implement final data persistence
    - Collect all data from registration state
    - Call TursoDBService.saveUser() with complete user data
    - Handle database errors and display error modal if save fails
    - Navigate to main app dashboard on successful save and success dismissal
    - _Requirements: 11.3, 11.4, 12.7, 12.8, 17.2_

- [ ]* 18.3 Write integration tests for complete flow
  - Test end-to-end registration from Stage 1 to Success
  - Test data persistence in database
  - Test duplicate detection at each stage
  - Test error handling throughout flow
  - _Requirements: 11.4, 12.2, 12.5_

- [x] 19. Implement comprehensive error handling
  - Add network error handling for Squad API calls
  - Add database error handling for Turso DB operations
  - Add camera access error handling for MediaPipe
  - Add face detection error handling
  - Implement error message constants for consistent messaging
  - Add retry mechanisms for transient failures
  - Preserve user input on errors (don't clear forms)
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

- [ ]* 19.1 Write unit tests for error handling
  - Test network error scenarios
  - Test database error scenarios
  - Test camera error scenarios
  - Test error message display
  - Test retry mechanisms
  - _Requirements: 17.1, 17.2, 17.3, 17.4_

- [x] 20. Apply visual design and branding
  - Apply ScrowPay brand colors throughout (#1c1c1c, #caff04, #f5f5f7)
  - Apply Inter font family to all text elements
  - Add rounded corners to buttons, cards, and inputs
  - Add shadows to modals and cards
  - Ensure clean white backgrounds
  - Style input fields with proper focus states
  - Add hover effects to buttons
  - Ensure responsive design for different screen sizes
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_

- [ ]* 20.1 Perform visual QA testing
  - Test visual consistency across all stages
  - Test responsive design on mobile, tablet, and desktop
  - Test color contrast for accessibility
  - Test focus states and keyboard navigation
  - _Requirements: 13.1, 13.2, 13.3_

- [x] 21. Final integration and polish
  - Test complete registration flow from start to finish
  - Verify all stage transitions work smoothly
  - Verify all modals and toasts display correctly
  - Verify all error scenarios are handled gracefully
  - Verify data is correctly saved to Turso DB
  - Verify Squad API integration works with real credentials
  - Verify MediaPipe blink detection works reliably
  - Fix any remaining bugs or edge cases
  - _Requirements: 11.4, 18.2_

- [x] 22. Final checkpoint - Complete system verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional testing tasks and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation and provide opportunities for user feedback
- The implementation prioritizes functional completeness over advanced optimizations (per Requirement 18.2)
- Mock implementations are used for OTP (fixed "123456") and face matching (simulated delay) to meet hackathon timeline constraints
- All external service integrations (Squad API, MediaPipe, Turso DB) are implemented with proper error handling
- Security best practices are followed: PIN hashing, data encryption, input validation, parameterized queries
