# Requirements Document: ScrowPay Account Creation Flow

## Introduction

This document specifies the requirements for the ScrowPay account creation flow, a comprehensive multi-stage web-based registration system for the ScrowPay secure escrow payment platform. The system guides users through phone verification, identity verification, biometric liveness checks, and profile setup to create verified accounts capable of performing secure escrow transactions.

The account creation flow consists of nine sequential stages: phone number entry, OTP verification, ID information entry, name entry, Squad API verification, face verification (liveness check), residential address entry, PIN setup, and success confirmation. The system integrates with external services including Squad API for BVN/NIN verification, MediaPipe for blink detection, and Turso DB for data persistence.

## Glossary

- **Account_Creation_System**: The complete multi-stage registration flow that creates verified user accounts
- **Phone_Validator**: Component that validates Nigerian phone number format
- **OTP_Verifier**: Component that handles one-time password verification
- **ID_Validator**: Component that validates BVN and NIN format and structure
- **Squad_API_Client**: Integration component that communicates with Squad API for identity verification
- **Liveness_Detector**: Component using MediaPipe to detect eye blinks for face verification
- **Address_Manager**: Component that manages current and permanent address data
- **PIN_Manager**: Component that validates and securely stores user login PINs
- **Turso_DB_Client**: Database client for storing and retrieving user registration data
- **BVN**: Bank Verification Number - 11-digit identifier starting with 1 or 2
- **NIN**: National Identification Number - 11-digit identifier
- **OTP**: One-Time Password - 6-digit verification code
- **PIN**: Personal Identification Number - 6-digit login password
- **EAR**: Eye Aspect Ratio - metric used by MediaPipe for blink detection
- **Toast_Notification**: Temporary message that appears and auto-dismisses
- **Modal**: Popup dialog requiring user interaction
- **Stage**: Individual step in the account creation flow

## Requirements

### Requirement 1: Phone Number Entry and Validation

**User Story:** As a new user, I want to enter my Nigerian phone number, so that I can begin the account creation process.

#### Acceptance Criteria

1. THE Account_Creation_System SHALL display a page with header "Get a ScrowPay Account"
2. THE Account_Creation_System SHALL display a phone number input field with Nigeria flag icon and +234 country code prefix
3. WHEN a user enters a phone number, THE Phone_Validator SHALL accept format 08135866028 (with leading zero)
4. WHEN a user enters a phone number, THE Phone_Validator SHALL accept format 8135866028 (without leading zero)
5. WHEN a phone number is incomplete, THE Phone_Validator SHALL display a red border on the input field
6. THE Account_Creation_System SHALL display a "Next" button below the phone input field
7. WHEN the "Next" button is clicked with a valid phone number, THE Account_Creation_System SHALL proceed to Stage 2 (Phone Verification)
8. THE Account_Creation_System SHALL NOT display invitation code fields or airtime voucher options

### Requirement 2: OTP Verification

**User Story:** As a new user, I want to verify my phone number with an OTP code, so that I can prove ownership of my phone number.

#### Acceptance Criteria

1. THE Account_Creation_System SHALL display a page with header "Verify Your Phone Number"
2. THE Account_Creation_System SHALL display Step 1 tile showing message "A verification code has been sent to your phone number +234 [number], please take a look" with OTP icon
3. THE Account_Creation_System SHALL display Step 2 tile containing 6 individual input boxes for OTP entry
4. WHEN the OTP verification page loads, THE Account_Creation_System SHALL display a toast notification with message "A verification code has been sent to your mobile phone"
5. THE Toast_Notification SHALL auto-dismiss after 3 seconds
6. THE Account_Creation_System SHALL display a "Verify" button below Step 2
7. WHEN the user enters OTP "123456", THE OTP_Verifier SHALL validate it as correct
8. WHEN the user enters any OTP other than "123456", THE OTP_Verifier SHALL validate it as incorrect
9. WHEN an incorrect OTP is submitted, THE Account_Creation_System SHALL display a "Failed!" modal with message "verification code error" and "Retry" button
10. WHEN a correct OTP is submitted, THE Account_Creation_System SHALL display a "Succeeded!" modal with message "Your Phone Number has been verified successfully!"
11. WHEN the user dismisses the success modal, THE Account_Creation_System SHALL proceed to Stage 3 (ID Information Entry)
12. THE Account_Creation_System SHALL NOT display resend OTP options or alternative verification methods

### Requirement 3: ID Information Entry and Validation

**User Story:** As a new user, I want to enter my BVN or NIN, so that I can verify my identity for account opening.

#### Acceptance Criteria

1. THE Account_Creation_System SHALL display a page with header "Enter your ID information"
2. THE Account_Creation_System SHALL display subheader "Please provide your own BVN/NIN to verify your account opening application"
3. THE Account_Creation_System SHALL display a toggle selector for choosing between NIN and BVN
4. WHEN BVN is selected, THE Account_Creation_System SHALL display 11 individual digit input boxes for BVN entry
5. WHEN NIN is selected, THE Account_Creation_System SHALL display 11 individual digit input boxes for NIN entry
6. WHEN a user types a digit in a BVN or NIN input box, THE Account_Creation_System SHALL display a dot (•) instead of the actual digit
7. WHEN a BVN is entered, THE ID_Validator SHALL verify it is 11 digits starting with 1 or 2
8. WHEN a NIN is entered, THE ID_Validator SHALL verify it is 11 digits
9. WHEN an invalid ID format is entered, THE Account_Creation_System SHALL display a validation error modal
10. THE Account_Creation_System SHALL display a "Next" button below the ID input
11. WHEN the "Next" button is clicked with valid ID, THE Account_Creation_System SHALL display a confirmation modal showing the entered ID number with dots masking the digits
12. THE Confirmation_Modal SHALL display "Edit" button and "Confirm" button
13. WHEN "Edit" is clicked, THE Account_Creation_System SHALL return to the ID input screen
14. WHEN "Confirm" is clicked, THE Account_Creation_System SHALL proceed to Stage 4 (Name Entry)
15. THE Account_Creation_System SHALL NOT display help text, sample links, "forgot BVN/NIN" options, or promotional offers

### Requirement 4: Name Entry

**User Story:** As a new user, I want to enter my full name, so that my account can be associated with my identity.

#### Acceptance Criteria

1. THE Account_Creation_System SHALL display a form with three text input fields labeled "First Name", "Middle Name", and "Last Name"
2. THE Account_Creation_System SHALL accept alphabetic characters in all name fields
3. THE Account_Creation_System SHALL display a "Next" button below the name fields
4. WHEN the "Next" button is clicked with all required name fields filled, THE Account_Creation_System SHALL proceed to Stage 5 (Squad API Verification)

### Requirement 5: Squad API Identity Verification

**User Story:** As a new user, I want my BVN/NIN to be verified against official records, so that my identity can be confirmed for secure transactions.

#### Acceptance Criteria

1. WHEN Stage 5 begins, THE Squad_API_Client SHALL send a verification request to Squad API with the user's BVN or NIN
2. THE Squad_API_Client SHALL include required Squad API credentials in the verification request
3. WHEN Squad API returns a successful verification response, THE Account_Creation_System SHALL proceed to Stage 6 (Face Verification)
4. WHEN Squad API returns a failed verification response, THE Account_Creation_System SHALL display an error message with the failure reason
5. WHEN Squad API returns an error, THE Account_Creation_System SHALL allow the user to retry verification

### Requirement 6: Face Verification Introduction

**User Story:** As a new user, I want to understand the face verification process, so that I know what to expect before starting the liveness check.

#### Acceptance Criteria

1. THE Account_Creation_System SHALL display a page with header "Face Verification"
2. THE Account_Creation_System SHALL display description "Face verification is used to confirm that you are the BVN holder"
3. THE Account_Creation_System SHALL display a "Let's Start" button
4. WHEN the "Let's Start" button is clicked, THE Account_Creation_System SHALL proceed to the camera/blink detection screen
5. THE Account_Creation_System SHALL NOT display help links or additional instructions

### Requirement 7: Blink Detection and Liveness Check

**User Story:** As a new user, I want to complete a blink detection test, so that I can prove I am a live person and not a photo or video.

#### Acceptance Criteria

1. WHEN the blink detection screen loads, THE Liveness_Detector SHALL request access to the user's laptop camera
2. THE Liveness_Detector SHALL display a live camera feed with an oval frame overlay for face positioning
3. THE Account_Creation_System SHALL display instruction "Blink your eyes"
4. THE Liveness_Detector SHALL use MediaPipe library to calculate Eye Aspect Ratio (EAR)
5. WHEN the user blinks their eyes, THE Liveness_Detector SHALL detect the blink using EAR threshold
6. WHEN a valid blink is detected, THE Account_Creation_System SHALL proceed to the verification processing screen
7. THE Liveness_Detector SHALL NOT detect head turns or other gestures

### Requirement 8: Face Verification Processing

**User Story:** As a new user, I want to see the progress of my face verification, so that I know the system is processing my liveness check.

#### Acceptance Criteria

1. THE Account_Creation_System SHALL display a "Checking..." overlay with a progress indicator
2. THE Account_Creation_System SHALL display "Almost done" message with a percentage value
3. THE Account_Creation_System SHALL simulate face matching processing with a delay between 1.5 and 2 seconds
4. THE Account_Creation_System SHALL return a hardcoded success response after the processing delay
5. WHEN processing completes successfully, THE Account_Creation_System SHALL display a "Succeeded!" modal with message "Your face has been verified successfully!"
6. WHEN the user dismisses the success modal, THE Account_Creation_System SHALL proceed to Stage 7 (Residential Address)

### Requirement 9: Residential Address Entry

**User Story:** As a new user, I want to enter my current and permanent addresses, so that my account has complete location information.

#### Acceptance Criteria

1. THE Account_Creation_System SHALL display a "Current Address" section with State dropdown, LGA dropdown, Area dropdown, Address text field, and optional Landmark/Nearest Bus Stop field
2. THE Account_Creation_System SHALL display a "Permanent Address" section with a checkbox labeled "Same as Current Address"
3. WHEN the residential address page loads, THE Address_Manager SHALL set the "Same as Current Address" checkbox to checked by default
4. WHEN the "Same as Current Address" checkbox is checked, THE Account_Creation_System SHALL hide the permanent address input fields
5. WHEN the "Same as Current Address" checkbox is unchecked, THE Account_Creation_System SHALL display State dropdown, LGA dropdown, Area dropdown, and Address text field for permanent address
6. THE Account_Creation_System SHALL NOT display a landmark field in the permanent address section
7. THE Account_Creation_System SHALL display a "Next" button below the address sections
8. WHEN the "Next" button is clicked with all required address fields filled, THE Account_Creation_System SHALL proceed to Stage 8 (PIN Setup)

### Requirement 10: PIN Setup and Validation

**User Story:** As a new user, I want to create a secure 6-digit PIN, so that I can log in to my account securely.

#### Acceptance Criteria

1. THE Account_Creation_System SHALL display a page with header "Set Your 6-Digit Login Password"
2. THE Account_Creation_System SHALL display description "This password must contain numbers which cannot be repeated or consecutive"
3. THE Account_Creation_System SHALL display a "Set Password" section with 6 individual digit input boxes
4. THE Account_Creation_System SHALL display a "Re-Enter Password" section with 6 individual digit input boxes
5. WHEN a PIN is entered, THE PIN_Manager SHALL validate that it contains exactly 6 digits
6. WHEN a PIN is entered, THE PIN_Manager SHALL validate that no digits are repeated
7. WHEN a PIN is entered, THE PIN_Manager SHALL validate that no digits are consecutive
8. WHEN the PIN and re-entered PIN do not match, THE PIN_Manager SHALL display a validation error
9. WHEN a valid PIN is entered and confirmed, THE PIN_Manager SHALL hash the PIN using a secure hashing algorithm
10. THE Account_Creation_System SHALL display a "Next" button below the PIN entry sections
11. WHEN the "Next" button is clicked with a valid PIN, THE Account_Creation_System SHALL proceed to Stage 9 (Success)
12. THE Account_Creation_System SHALL NOT display invitation code fields

### Requirement 11: Account Creation Success

**User Story:** As a new user, I want to see confirmation that my account was created successfully, so that I know I can begin using ScrowPay.

#### Acceptance Criteria

1. THE Account_Creation_System SHALL display a success modal or screen confirming account creation
2. WHEN the user clicks anywhere on the success screen, THE Account_Creation_System SHALL dismiss the success message
3. WHEN the success message is dismissed, THE Account_Creation_System SHALL navigate to the main app dashboard
4. THE Account_Creation_System SHALL enable the user to perform transactions after successful account creation

### Requirement 12: Turso Database Integration

**User Story:** As the system, I want to store all user registration data in Turso DB, so that user accounts persist and can be retrieved for authentication.

#### Acceptance Criteria

1. THE Turso_DB_Client SHALL store phone numbers in the database
2. WHEN a phone number is entered in Stage 1, THE Turso_DB_Client SHALL check if the phone number already exists in the database
3. WHEN a duplicate phone number is detected, THE Account_Creation_System SHALL display an error message indicating the phone number is already registered
4. THE Turso_DB_Client SHALL store BVN or NIN in the database
5. WHEN a BVN or NIN is entered in Stage 3, THE Turso_DB_Client SHALL check if the BVN or NIN already exists in the database
6. WHEN a duplicate BVN or NIN is detected, THE Account_Creation_System SHALL display an error message indicating the ID is already registered
7. THE Turso_DB_Client SHALL store user profile information including first name, middle name, last name, current address, and permanent address
8. THE Turso_DB_Client SHALL store the hashed PIN securely
9. THE Turso_DB_Client SHALL support fast lookup queries for duplicate checking during registration
10. THE Turso_DB_Client SHALL encrypt sensitive data fields including BVN, NIN, and hashed PIN

### Requirement 13: Visual Design Consistency

**User Story:** As a new user, I want the account creation flow to match ScrowPay's existing website design, so that I have a consistent brand experience.

#### Acceptance Criteria

1. THE Account_Creation_System SHALL use brand color #1c1c1c for dark elements
2. THE Account_Creation_System SHALL use brand color #caff04 or #C0FF00 for green/lime accent elements
3. THE Account_Creation_System SHALL use brand color #f5f5f7 for gray elements
4. THE Account_Creation_System SHALL use Inter font family for all text
5. THE Account_Creation_System SHALL use rounded corners on UI elements consistent with the existing website
6. THE Account_Creation_System SHALL use clean white backgrounds as the primary background color
7. THE Account_Creation_System SHALL NOT use dark UI themes or dark backgrounds

### Requirement 14: MediaPipe Integration for Blink Detection

**User Story:** As the system, I want to use MediaPipe for blink detection, so that I can perform liveness checks without expensive third-party services.

#### Acceptance Criteria

1. THE Liveness_Detector SHALL integrate MediaPipe library for facial landmark detection
2. THE Liveness_Detector SHALL use MediaPipe's Eye Aspect Ratio (EAR) calculation for blink detection
3. WHEN the EAR value drops below a threshold and then rises above the threshold, THE Liveness_Detector SHALL register a blink event
4. THE Liveness_Detector SHALL require at least one valid blink to pass the liveness check
5. THE Liveness_Detector SHALL process video frames in real-time to detect blinks

### Requirement 15: Squad API Configuration

**User Story:** As a developer, I want clear guidance on Squad API integration, so that I can configure BVN/NIN verification correctly.

#### Acceptance Criteria

1. THE Squad_API_Client SHALL use Squad API endpoint for BVN/NIN verification as documented at https://docs.squadco.com/
2. THE Squad_API_Client SHALL require Squad API secret key for authentication
3. THE Squad_API_Client SHALL require Squad API public key for authentication
4. THE Squad_API_Client SHALL send BVN or NIN in the verification request payload
5. WHEN Squad API returns verification data, THE Squad_API_Client SHALL parse the response and extract verification status

### Requirement 16: Turso Database Configuration

**User Story:** As a developer, I want clear guidance on Turso DB setup, so that I can configure the database correctly for the account creation flow.

#### Acceptance Criteria

1. THE Turso_DB_Client SHALL connect to Turso DB using a connection string
2. THE Turso_DB_Client SHALL require a database authentication token
3. THE Turso_DB_Client SHALL create a users table with columns for phone_number, bvn, nin, first_name, middle_name, last_name, current_address_state, current_address_lga, current_address_area, current_address_text, current_address_landmark, permanent_address_state, permanent_address_lga, permanent_address_area, permanent_address_text, hashed_pin, and created_at
4. THE Turso_DB_Client SHALL create unique indexes on phone_number, bvn, and nin columns for fast duplicate checking
5. THE Turso_DB_Client SHALL support SQL queries for inserting and retrieving user data

### Requirement 17: Error Handling and User Feedback

**User Story:** As a new user, I want clear error messages when something goes wrong, so that I know how to fix issues and continue registration.

#### Acceptance Criteria

1. WHEN a network error occurs during Squad API verification, THE Account_Creation_System SHALL display an error message "Unable to verify your identity. Please check your internet connection and try again."
2. WHEN a database error occurs, THE Account_Creation_System SHALL display an error message "An error occurred. Please try again later."
3. WHEN camera access is denied, THE Account_Creation_System SHALL display an error message "Camera access is required for face verification. Please enable camera access and try again."
4. WHEN MediaPipe fails to detect a face, THE Account_Creation_System SHALL display an error message "Unable to detect your face. Please ensure your face is visible in the camera frame."
5. WHEN any validation error occurs, THE Account_Creation_System SHALL display the error message in a modal or inline notification

### Requirement 18: Performance and Timeline Constraints

**User Story:** As a developer, I want the implementation to be simple and achievable within the hackathon timeline, so that the feature can be completed in less than 3 days.

#### Acceptance Criteria

1. THE Account_Creation_System SHALL use simple, straightforward implementations without overly complex architecture
2. THE Account_Creation_System SHALL prioritize functional completeness over advanced optimizations
3. THE Account_Creation_System SHALL use mock implementations for expensive operations (face matching against NIMC database)
4. THE Account_Creation_System SHALL use fixed dummy OTP instead of real SMS integration to reduce implementation complexity
5. THE Account_Creation_System SHALL focus on web-only implementation without mobile app considerations
