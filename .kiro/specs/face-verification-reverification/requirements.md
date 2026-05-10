# Requirements Document: Face Verification and Reverification System

## Introduction

The Face Verification and Reverification System enables ScrowPay to capture and store user facial biometric data during initial account creation, and subsequently reverify user identity when security-sensitive events occur. The system uses face embeddings stored in a vector database, compares them using similarity metrics, and includes liveness detection to prevent spoofing attacks. This feature enhances security by providing an additional authentication factor beyond PIN and OTP.

## Glossary

- **Face_Verification_System**: The complete system responsible for capturing, storing, and verifying facial biometric data
- **Face_Capture_Module**: Component that captures selfie images from the user's camera
- **Face_Embedding_Extractor**: Component that converts facial images into numerical vector representations (embeddings)
- **Face_Storage_Service**: Component that stores face embeddings in Turso DB and images in Cloudinary
- **Face_Comparison_Engine**: Component that compares face embeddings using similarity metrics
- **Liveness_Detector**: Component that detects eye blinks using MediaPipe Face Mesh to verify the user is physically present
- **Lighting_Detector**: Component that analyzes image luminance to detect poor lighting conditions
- **Reverification_Trigger**: Event or condition that requires the user to reverify their identity
- **Security_Event**: An action or condition that triggers reverification (e.g., new device login, IP address change)
- **Baseline_Face_Data**: The initial face embedding and image captured during account creation
- **Reverification_Face_Data**: The face embedding and image captured during a reverification attempt
- **Similarity_Threshold**: The minimum similarity score required for successful face verification
- **Euclidean_Distance**: A distance metric used to compare face embeddings (lower values indicate higher similarity)
- **Cosine_Similarity**: A similarity metric used to compare face embeddings (higher values indicate higher similarity)
- **Face_Embedding**: A numerical vector (128 or 512 floats) representing facial features
- **Cloudinary**: Third-party image storage service used to store raw selfie images
- **Turso_DB**: Database with vector support used to store face embeddings and metadata
- **MediaPipe_Face_Mesh**: Library used for facial landmark detection and blink detection
- **Eye_Aspect_Ratio**: Metric calculated from eye landmarks to detect blinks (EAR)
- **Luminance**: Brightness value calculated from image pixels using the formula L = 0.299×R + 0.587×G + 0.114×B
- **Mock_NIMC_Data**: Simulated identity verification data (not connected to real NIMC database)
- **OTP_Verification**: One-time password verification method offered as an alternative to face verification
- **IP_Address**: Network identifier used to detect new device logins

## Requirements

### Requirement 1: Initial Face Capture During Account Creation

**User Story:** As a new user creating a ScrowPay account, I want to capture my face during registration, so that my identity can be verified for future security checks.

#### Acceptance Criteria

1. WHEN the user reaches the face verification stage during account creation, THE Face_Capture_Module SHALL activate the device camera
2. WHEN the camera is activated, THE Face_Capture_Module SHALL display a live video feed to the user
3. WHEN the video feed is displayed, THE Face_Capture_Module SHALL overlay an oval guide to help the user position their face
4. WHEN the user's face is positioned within the oval guide, THE Liveness_Detector SHALL initiate blink detection
5. WHEN a blink is detected, THE Face_Capture_Module SHALL capture a selfie image
6. WHEN the selfie image is captured, THE Face_Capture_Module SHALL stop the camera and release camera resources

### Requirement 2: Lighting Condition Detection

**User Story:** As a user attempting face verification, I want to be notified if lighting conditions are poor, so that I can improve the lighting and ensure successful verification.

#### Acceptance Criteria

1. WHEN a selfie image is captured, THE Lighting_Detector SHALL calculate the luminance value using the formula L = 0.299×R + 0.587×G + 0.114×B
2. WHEN the luminance value is below 50 (on a scale of 0-255), THE Lighting_Detector SHALL classify the image as too dark
3. IF the image is classified as too dark, THEN THE Face_Verification_System SHALL display a warning message to the user
4. WHEN a warning message is displayed, THE Face_Verification_System SHALL prompt the user to improve lighting conditions and retry
5. WHEN the user retries, THE Face_Capture_Module SHALL restart the capture process

### Requirement 3: Liveness Detection Using Blink Detection

**User Story:** As a security-conscious platform, I want to detect eye blinks during face capture, so that I can verify the user is physically present and not using a static photo.

#### Acceptance Criteria

1. WHEN the camera feed is active, THE Liveness_Detector SHALL use MediaPipe_Face_Mesh to detect facial landmarks
2. WHEN facial landmarks are detected, THE Liveness_Detector SHALL calculate Eye_Aspect_Ratio for both eyes
3. WHEN Eye_Aspect_Ratio drops below 0.25, THE Liveness_Detector SHALL mark the eye as closing
4. WHEN Eye_Aspect_Ratio rises above 0.25 after being below the threshold, THE Liveness_Detector SHALL detect a blink
5. WHEN a blink is detected, THE Liveness_Detector SHALL notify the Face_Capture_Module to capture the selfie
6. WHEN no blink is detected within 30 seconds, THE Face_Verification_System SHALL display a timeout message and allow the user to retry

### Requirement 4: Face Embedding Extraction

**User Story:** As the system, I want to extract numerical face embeddings from captured selfies, so that I can efficiently compare faces using mathematical similarity metrics.

#### Acceptance Criteria

1. WHEN a selfie image is captured, THE Face_Embedding_Extractor SHALL process the image using a face recognition model
2. WHEN the face recognition model processes the image, THE Face_Embedding_Extractor SHALL generate a face embedding vector
3. THE Face_Embedding_Extractor SHALL produce embeddings with either 128 or 512 float values
4. IF no face is detected in the image, THEN THE Face_Embedding_Extractor SHALL return an error
5. WHEN multiple faces are detected in the image, THE Face_Embedding_Extractor SHALL return an error indicating multiple faces detected

### Requirement 5: Face Data Storage in Cloudinary

**User Story:** As the system, I want to store raw selfie images in Cloudinary, so that I can retrieve and display them for audit purposes.

#### Acceptance Criteria

1. WHEN a selfie image is captured, THE Face_Storage_Service SHALL upload the image to Cloudinary
2. WHEN uploading to Cloudinary, THE Face_Storage_Service SHALL use the Cloudinary API
3. WHEN the upload is successful, THE Face_Storage_Service SHALL receive a Cloudinary URL for the stored image
4. WHEN the upload fails, THE Face_Storage_Service SHALL retry the upload up to 3 times
5. IF all retry attempts fail, THEN THE Face_Storage_Service SHALL return an error to the user

### Requirement 6: Face Embedding Storage in Turso DB

**User Story:** As the system, I want to store face embeddings in Turso DB with vector support, so that I can efficiently query and compare embeddings during reverification.

#### Acceptance Criteria

1. WHEN a face embedding is extracted, THE Face_Storage_Service SHALL store the embedding in Turso_DB
2. WHEN storing the embedding, THE Face_Storage_Service SHALL associate it with the user's phone number
3. WHEN storing the embedding, THE Face_Storage_Service SHALL store the Cloudinary image URL as metadata
4. WHEN storing the embedding, THE Face_Storage_Service SHALL store a timestamp indicating when the baseline was captured
5. THE Face_Storage_Service SHALL store embeddings as an array of float values in a vector-compatible column

### Requirement 7: Reverification Trigger Detection

**User Story:** As a security-conscious platform, I want to detect when users log in from new devices, so that I can trigger reverification to prevent unauthorized access.

#### Acceptance Criteria

1. WHEN a user attempts to log in, THE Face_Verification_System SHALL retrieve the user's IP_Address
2. WHEN the IP_Address is retrieved, THE Face_Verification_System SHALL compare it against previously recorded IP addresses for that user
3. WHEN the IP_Address does not match any previously recorded IP addresses, THE Face_Verification_System SHALL classify the login as a new device login
4. WHEN a new device login is detected, THE Face_Verification_System SHALL trigger a reverification request
5. WHEN a reverification request is triggered, THE Face_Verification_System SHALL offer the user a choice between OTP_Verification and face verification

### Requirement 8: Reverification Flow Initiation

**User Story:** As a user logging in from a new device, I want to choose between OTP and face verification, so that I can use my preferred authentication method.

#### Acceptance Criteria

1. WHEN a reverification request is triggered, THE Face_Verification_System SHALL display a choice screen to the user
2. THE Face_Verification_System SHALL offer two options: OTP_Verification and face verification
3. WHEN the user selects OTP_Verification, THE Face_Verification_System SHALL initiate the OTP flow
4. WHEN the user selects face verification, THE Face_Verification_System SHALL initiate the face reverification flow
5. WHEN the user does not make a selection within 60 seconds, THE Face_Verification_System SHALL default to OTP_Verification

### Requirement 9: Reverification Face Capture

**User Story:** As a user undergoing reverification, I want to capture a new selfie, so that the system can compare it against my baseline face data.

#### Acceptance Criteria

1. WHEN the user selects face verification, THE Face_Capture_Module SHALL activate the device camera
2. WHEN the camera is activated, THE Lighting_Detector SHALL check lighting conditions before proceeding
3. IF lighting conditions are poor, THEN THE Face_Verification_System SHALL prompt the user to improve lighting
4. WHEN lighting conditions are acceptable, THE Liveness_Detector SHALL initiate blink detection
5. WHEN a blink is detected, THE Face_Capture_Module SHALL capture a reverification selfie
6. WHEN the reverification selfie is captured, THE Face_Embedding_Extractor SHALL extract a face embedding from the image

### Requirement 10: Face Embedding Comparison

**User Story:** As the system, I want to compare the reverification face embedding against the baseline embedding, so that I can determine if the user is the same person.

#### Acceptance Criteria

1. WHEN a reverification face embedding is extracted, THE Face_Comparison_Engine SHALL retrieve the Baseline_Face_Data from Turso_DB using the user's phone number
2. WHEN the Baseline_Face_Data is retrieved, THE Face_Comparison_Engine SHALL calculate the Euclidean_Distance between the two embeddings
3. THE Face_Comparison_Engine SHALL also calculate the Cosine_Similarity between the two embeddings
4. WHEN the Euclidean_Distance is below the Similarity_Threshold OR the Cosine_Similarity is above the Similarity_Threshold, THE Face_Comparison_Engine SHALL classify the verification as successful
5. WHEN the Euclidean_Distance is above the Similarity_Threshold AND the Cosine_Similarity is below the Similarity_Threshold, THE Face_Comparison_Engine SHALL classify the verification as failed

### Requirement 11: Successful Reverification Handling

**User Story:** As a user who successfully completes face reverification, I want to be granted access to my account, so that I can proceed with my intended action.

#### Acceptance Criteria

1. WHEN face verification is classified as successful, THE Face_Verification_System SHALL grant the user access to their account
2. WHEN access is granted, THE Face_Verification_System SHALL record the successful verification event with a timestamp
3. WHEN access is granted, THE Face_Verification_System SHALL record the new IP_Address as a trusted device
4. WHEN access is granted, THE Face_Verification_System SHALL display a success message to the user
5. WHEN access is granted, THE Face_Verification_System SHALL redirect the user to their intended destination

### Requirement 12: Failed Reverification Handling

**User Story:** As a user whose face reverification fails, I want to be given retry options, so that I can attempt verification again or use an alternative method.

#### Acceptance Criteria

1. WHEN face verification is classified as failed, THE Face_Verification_System SHALL display a failure message to the user
2. WHEN a failure message is displayed, THE Face_Verification_System SHALL offer the user three options: retry face verification, use OTP_Verification, or contact support
3. WHEN the user selects retry, THE Face_Verification_System SHALL restart the face capture process
4. WHEN the user selects OTP_Verification, THE Face_Verification_System SHALL initiate the OTP flow
5. WHEN the user fails face verification 3 consecutive times, THE Face_Verification_System SHALL automatically redirect to OTP_Verification

### Requirement 13: Reverification Attempt Logging

**User Story:** As a security administrator, I want to log all reverification attempts, so that I can audit security events and detect potential fraud.

#### Acceptance Criteria

1. WHEN a reverification attempt is initiated, THE Face_Verification_System SHALL create a log entry with a timestamp
2. WHEN a reverification attempt completes, THE Face_Verification_System SHALL record the result (success or failure) in the log entry
3. WHEN a reverification attempt completes, THE Face_Verification_System SHALL record the similarity score in the log entry
4. WHEN a reverification attempt completes, THE Face_Verification_System SHALL record the IP_Address in the log entry
5. THE Face_Verification_System SHALL store all log entries in Turso_DB for audit purposes

### Requirement 14: Similarity Threshold Configuration

**User Story:** As a system administrator, I want to configure the similarity threshold for face verification, so that I can balance security and user experience.

#### Acceptance Criteria

1. THE Face_Verification_System SHALL define a default Similarity_Threshold for Euclidean_Distance
2. THE Face_Verification_System SHALL define a default Similarity_Threshold for Cosine_Similarity
3. WHERE a custom threshold is configured, THE Face_Comparison_Engine SHALL use the custom threshold instead of the default
4. WHEN the threshold is changed, THE Face_Verification_System SHALL apply the new threshold to all subsequent verification attempts
5. THE Face_Verification_System SHALL store the current threshold value in a configuration table in Turso_DB

### Requirement 15: Camera Permission Handling

**User Story:** As a user, I want to be prompted for camera permissions when needed, so that I understand why the app needs access to my camera.

#### Acceptance Criteria

1. WHEN the Face_Capture_Module attempts to activate the camera, THE Face_Verification_System SHALL request camera permissions from the browser
2. WHEN camera permissions are granted, THE Face_Capture_Module SHALL activate the camera
3. IF camera permissions are denied, THEN THE Face_Verification_System SHALL display an error message explaining that camera access is required
4. WHEN camera permissions are denied, THE Face_Verification_System SHALL offer the user the option to use OTP_Verification instead
5. WHEN camera permissions are denied, THE Face_Verification_System SHALL provide instructions on how to enable camera permissions in browser settings

### Requirement 16: Face Data Privacy and Security

**User Story:** As a privacy-conscious user, I want my facial biometric data to be stored securely, so that my personal information is protected.

#### Acceptance Criteria

1. WHEN face embeddings are stored in Turso_DB, THE Face_Storage_Service SHALL encrypt the embeddings at rest
2. WHEN face images are uploaded to Cloudinary, THE Face_Storage_Service SHALL use HTTPS for secure transmission
3. THE Face_Verification_System SHALL NOT store raw face images in Turso_DB
4. THE Face_Verification_System SHALL NOT transmit face embeddings over unencrypted connections
5. WHEN a user deletes their account, THE Face_Verification_System SHALL delete all associated face embeddings and images from both Turso_DB and Cloudinary

### Requirement 17: Error Handling for Face Detection Failures

**User Story:** As a user whose face cannot be detected, I want to receive clear error messages, so that I can understand what went wrong and how to fix it.

#### Acceptance Criteria

1. IF no face is detected in the captured image, THEN THE Face_Verification_System SHALL display an error message stating "No face detected"
2. IF multiple faces are detected in the captured image, THEN THE Face_Verification_System SHALL display an error message stating "Multiple faces detected, please ensure only your face is visible"
3. IF the face is too far from the camera, THEN THE Face_Verification_System SHALL display an error message stating "Face too far, please move closer to the camera"
4. IF the face is too close to the camera, THEN THE Face_Verification_System SHALL display an error message stating "Face too close, please move back from the camera"
5. WHEN an error message is displayed, THE Face_Verification_System SHALL allow the user to retry the capture process

### Requirement 18: Reverification Timeout Handling

**User Story:** As a user who takes too long to complete reverification, I want the system to handle timeouts gracefully, so that I can restart the process without losing my session.

#### Acceptance Criteria

1. WHEN a reverification request is initiated, THE Face_Verification_System SHALL start a 5-minute timeout timer
2. WHEN the timeout timer expires before verification completes, THE Face_Verification_System SHALL cancel the reverification attempt
3. WHEN a reverification attempt is cancelled due to timeout, THE Face_Verification_System SHALL display a timeout message to the user
4. WHEN a timeout message is displayed, THE Face_Verification_System SHALL offer the user the option to restart reverification or use OTP_Verification
5. WHEN the user restarts reverification, THE Face_Verification_System SHALL reset the timeout timer

### Requirement 19: Database Schema for Face Verification

**User Story:** As a developer, I want a well-defined database schema for face verification data, so that I can efficiently store and query face embeddings and metadata.

#### Acceptance Criteria

1. THE Face_Storage_Service SHALL create a table named "face_verification_data" in Turso_DB
2. THE "face_verification_data" table SHALL include columns: id, phone_number, face_embedding, cloudinary_url, created_at, updated_at
3. THE "face_verification_data" table SHALL include a unique constraint on the phone_number column
4. THE "face_verification_data" table SHALL include an index on the phone_number column for fast lookups
5. THE Face_Storage_Service SHALL create a table named "reverification_logs" in Turso_DB with columns: id, phone_number, attempt_timestamp, result, similarity_score, ip_address

### Requirement 20: Integration with Existing Account Creation Flow

**User Story:** As a user creating an account, I want face verification to be seamlessly integrated into the registration process, so that I have a smooth onboarding experience.

#### Acceptance Criteria

1. WHEN the user completes ID verification (Stage 5), THE Face_Verification_System SHALL present the face verification introduction screen (Stage 6)
2. WHEN the user completes face verification (Stage 7), THE Face_Verification_System SHALL proceed to the address entry stage (Stage 8)
3. WHEN face verification fails, THE Face_Verification_System SHALL allow the user to retry without restarting the entire registration process
4. WHEN the user completes the entire registration process, THE Face_Storage_Service SHALL save the Baseline_Face_Data before creating the user account
5. IF face data storage fails, THEN THE Face_Verification_System SHALL prevent account creation and display an error message
