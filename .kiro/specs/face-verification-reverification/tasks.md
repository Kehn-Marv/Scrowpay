# Implementation Plan: Face Verification and Reverification System

## Overview

This implementation plan breaks down the face verification and reverification system into discrete coding tasks. The system captures facial biometric data during account creation, stores face embeddings in Turso DB and images in Cloudinary, and reverifies user identity when security-sensitive events occur (e.g., login from new device). The implementation uses MediaPipe Face Mesh for liveness detection (blink detection), face-api.js for face embedding extraction, and similarity metrics (Euclidean distance and cosine similarity) for face comparison.

**Technology Stack**: JavaScript (ES6+), HTML5, Tailwind CSS, MediaPipe Face Mesh, face-api.js, Cloudinary API, Turso DB

**Key Features**: Camera capture, blink detection, lighting analysis, face embedding extraction, secure storage, similarity-based verification, OTP fallback

## Tasks

- [ ] 1. Set up database schema for face verification
  - Create `face_verification_data` table in Turso DB with columns: id, phone_number, face_embedding (TEXT/JSON), cloudinary_url, created_at, updated_at
  - Create `reverification_logs` table with columns: id, phone_number, attempt_timestamp, result, similarity_score_euclidean, similarity_score_cosine, ip_address, user_agent, failure_reason
  - Create `verification_config` table with columns: id, config_key, config_value, description, updated_at
  - Add unique constraint and index on phone_number in face_verification_data table
  - Add indexes on phone_number, attempt_timestamp, result, and ip_address in reverification_logs table
  - Insert default configuration values (euclidean_threshold: 0.6, cosine_threshold: 0.7, luminance_threshold: 50, blink_ear_threshold: 0.25, blink_timeout_seconds: 30, reverification_timeout_minutes: 5, max_retry_attempts: 3)
  - Add foreign key constraints linking to users table
  - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_

- [ ] 2. Implement Lighting Detector module
  - [ ] 2.1 Create LightingDetector class with calculateLuminance, isLightingAdequate, and assessLighting methods
    - Implement calculateLuminance to extract pixel data from ImageData and calculate L = 0.299×R + 0.587×G + 0.114×B for each pixel
    - Implement isLightingAdequate to check if luminance >= 50
    - Implement assessLighting to load image blob, extract pixel data, calculate average luminance, and return {adequate: boolean, luminance: number}
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [ ]* 2.2 Write property test for luminance calculation correctness
    - **Property 1: Luminance Calculation Correctness**
    - **Validates: Requirements 2.1**
    - Generate random RGB values [0-255], verify calculated luminance equals 0.299×R + 0.587×G + 0.114×B
  
  - [ ]* 2.3 Write property test for luminance classification threshold
    - **Property 2: Luminance Classification Threshold**
    - **Validates: Requirements 2.2**
    - Generate random luminance values [0-255], verify classification is "too dark" iff L < 50, "acceptable" iff L >= 50

- [ ] 3. Implement Liveness Detector module with MediaPipe Face Mesh
  - [ ] 3.1 Create LivenessDetector class with initialize, startDetection, stopDetection, and calculateEAR methods
    - Initialize MediaPipe Face Mesh with maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5
    - Implement startDetection to process video frames and monitor Eye Aspect Ratio
    - Implement calculateEAR using formula: (||p2 - p6|| + ||p3 - p5||) / (2 × ||p1 - p4||)
    - Implement euclideanDistance helper for 3D points
    - Track blink state (isBlinking) and detect transition from EAR < 0.25 to EAR >= 0.25
    - Trigger callback when blink detected
    - Implement 30-second timeout if no blink detected
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
  
  - [ ]* 3.2 Write property test for Eye Aspect Ratio calculation
    - **Property 3: Eye Aspect Ratio Calculation**
    - **Validates: Requirements 3.2**
    - Generate random 3D eye landmark points, verify EAR equals (||p2 - p6|| + ||p3 - p5||) / (2 × ||p1 - p4||)
  
  - [ ]* 3.3 Write property test for eye state classification
    - **Property 4: Eye State Classification**
    - **Validates: Requirements 3.3**
    - Generate random EAR values, verify state is "closing" iff EAR < 0.25, "open" iff EAR >= 0.25
  
  - [ ]* 3.4 Write property test for blink detection state machine
    - **Property 5: Blink Detection State Machine**
    - **Validates: Requirements 3.4**
    - Generate random EAR sequences, verify blink detected iff transition from EAR < 0.25 to EAR >= 0.25 exists

- [ ] 4. Implement Face Capture Module
  - [ ] 4.1 Create FaceCaptureModule class with activateCamera, captureImage, stopCamera, and renderOvalGuide methods
    - Implement activateCamera using navigator.mediaDevices.getUserMedia with video constraints (640x480, facingMode: 'user')
    - Handle camera permission errors (NotAllowedError) with user-friendly messages
    - Implement captureImage to capture still frame from video stream as Blob
    - Implement stopCamera to stop all media tracks and release camera resources
    - Implement renderOvalGuide to draw oval overlay on canvas for face positioning
    - Coordinate with LivenessDetector to trigger capture on blink detection
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 15.1, 15.2_
  
  - [ ]* 4.2 Write unit tests for camera permission handling
    - Test camera activation with granted permissions
    - Test error handling for denied permissions (NotAllowedError)
    - Test error handling for camera not available
    - Test error handling for camera in use by another application
    - _Requirements: 15.3, 15.4, 15.5_

- [ ] 5. Implement Face Embedding Extractor module
  - [ ] 5.1 Create FaceEmbeddingExtractor class with initialize, extractEmbedding, and detectFaceCount methods
    - Load face-api.js models (ssdMobilenetv1, faceLandmark68Net, faceRecognitionNet) from /models directory
    - Implement extractEmbedding to detect face, extract 68 landmarks, and generate 128-dimensional descriptor
    - Return error if no face detected (code: NO_FACE_DETECTED)
    - Return error if multiple faces detected (code: MULTIPLE_FACES_DETECTED)
    - Implement detectFaceCount to count faces in image
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 17.1, 17.2_
  
  - [ ]* 5.2 Write unit tests for face detection error handling
    - Test with image containing no face (should throw NO_FACE_DETECTED error)
    - Test with image containing multiple faces (should throw MULTIPLE_FACES_DETECTED error)
    - Test with valid single face image (should return 128-dimensional embedding)
    - _Requirements: 4.4, 4.5, 17.1, 17.2_

- [ ] 6. Implement Face Comparison Engine
  - [ ] 6.1 Create FaceComparisonEngine class with compareEmbeddings, calculateEuclideanDistance, calculateCosineSimilarity, and isMatch methods
    - Implement calculateEuclideanDistance: sqrt(Σ(emb1[i] - emb2[i])²)
    - Implement calculateCosineSimilarity: (emb1 · emb2) / (||emb1|| × ||emb2||)
    - Implement isMatch logic: (euclideanDistance < threshold) OR (cosineSimilarity > threshold)
    - Return {euclideanDistance, cosineSimilarity, isMatch} object
    - _Requirements: 10.2, 10.3, 10.4, 10.5_
  
  - [ ]* 6.2 Write property test for Euclidean distance calculation
    - **Property 6: Euclidean Distance Calculation**
    - **Validates: Requirements 10.2**
    - Generate random embedding pairs, verify distance equals sqrt(Σ(emb1[i] - emb2[i])²)
    - Test edge case: identical embeddings should have distance = 0
  
  - [ ]* 6.3 Write property test for cosine similarity calculation
    - **Property 7: Cosine Similarity Calculation**
    - **Validates: Requirements 10.3**
    - Generate random embedding pairs, verify similarity equals (emb1 · emb2) / (||emb1|| × ||emb2||)
    - Verify result is in range [-1, 1]
    - Test edge case: identical embeddings should have similarity = 1
  
  - [ ]* 6.4 Write property test for verification classification logic
    - **Property 8: Verification Classification Logic**
    - **Validates: Requirements 10.4, 10.5**
    - Generate random distance/similarity pairs, verify classification is "successful" iff (D < threshold) OR (S > threshold)

- [ ] 7. Checkpoint - Ensure all core modules pass tests
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Implement Cloudinary integration in Face Storage Service
  - [ ] 8.1 Create CloudinaryUploader class with uploadImage and uploadWithRetry methods
    - Implement uploadImage to upload Blob to Cloudinary using Upload API
    - Configure upload preset: 'face_verification', folder: 'face_verification/baselines' or 'face_verification/reverifications'
    - Apply transformations: width: 640, height: 480, crop: 'limit', quality: 'auto:good'
    - Set public_id format: {phone_number}_{type}_{timestamp}
    - Add tags: ['baseline'] or ['reverification']
    - Add context metadata: phone_number, capture_type, timestamp
    - Return secure_url from response
    - _Requirements: 5.1, 5.2, 5.3_
  
  - [ ] 8.2 Implement retry logic for Cloudinary uploads
    - Implement uploadWithRetry with exponential backoff (1s, 2s, 4s)
    - Retry on 5xx errors up to 3 times
    - Fail permanently on 4xx errors
    - _Requirements: 5.4, 5.5_
  
  - [ ]* 8.3 Write property test for upload retry logic
    - **Property 9: Upload Retry Logic**
    - **Validates: Requirements 5.4**
    - Simulate upload failures, verify system retries up to 3 times (4 total attempts)

- [ ] 9. Implement database operations in Face Storage Service
  - [ ] 9.1 Extend TursoDBService with face verification methods
    - Implement storeFaceEmbedding to insert into face_verification_data table
    - Store embedding as JSON array string
    - Store cloudinary_url, phone_number, created_at, updated_at
    - Implement getBaselineFaceData to retrieve embedding by phone_number
    - Parse JSON embedding string back to Float32Array
    - Implement transaction rollback if Cloudinary upload succeeds but DB storage fails
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [ ] 9.2 Implement reverification logging methods
    - Implement logReverificationAttempt to insert into reverification_logs table
    - Store phone_number, attempt_timestamp, result, similarity_score_euclidean, similarity_score_cosine, ip_address, user_agent, failure_reason
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_
  
  - [ ]* 9.3 Write integration tests for database operations
    - Test storing face embedding and retrieving it
    - Test transaction rollback on partial failure
    - Test logging reverification attempts
    - Verify data integrity after round-trip storage

- [ ] 10. Implement Face Storage Service orchestration
  - [ ] 10.1 Create FaceStorageService class with storeFaceData and getBaselineFaceData methods
    - Implement storeFaceData to orchestrate Cloudinary upload + DB storage
    - Upload image to Cloudinary first
    - If upload succeeds, store embedding in DB with Cloudinary URL
    - If DB storage fails, delete uploaded image from Cloudinary (rollback)
    - Return {imageUrl, embeddingId} on success
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [ ]* 10.2 Write integration tests for atomic storage operations
    - Test successful storage (both Cloudinary and DB succeed)
    - Test rollback when DB storage fails after Cloudinary upload succeeds
    - Verify no orphaned data in either system

- [ ] 11. Implement reverification trigger detection
  - [ ] 11.1 Create ReverificationTrigger class with detectNewDevice and shouldTriggerReverification methods
    - Implement detectNewDevice to compare current IP address against stored IP addresses
    - Query reverification_logs table for previous IP addresses for user
    - Return true if IP address not found in previous logs
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  
  - [ ]* 11.2 Write property test for IP address matching logic
    - **Property 10: IP Address Matching Logic**
    - **Validates: Requirements 7.2, 7.3**
    - Generate random IP addresses and lists, verify classification is "new device" iff IP not in list

- [ ] 12. Implement initial face capture flow (account creation integration)
  - [ ] 12.1 Create face-verification-stage.html page
    - Add video element for camera feed
    - Add canvas element for oval guide overlay
    - Add UI elements: instructions, status messages, retry button, skip to OTP button
    - Style with Tailwind CSS matching existing account creation pages
    - _Requirements: 1.1, 1.2, 1.3, 20.1_
  
  - [ ] 12.2 Create face-verification-service.js orchestration module
    - Implement initializeFaceVerification to load models and initialize components
    - Implement startFaceCapture workflow: activate camera → start blink detection → capture on blink → check lighting → extract embedding → store data
    - Handle lighting warnings and allow retry
    - Handle face detection errors (no face, multiple faces) with clear messages
    - Handle blink timeout (30 seconds) with retry option
    - Integrate with existing account creation flow (after ID verification, before address entry)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.3, 2.4, 2.5, 3.6, 17.1, 17.2, 17.3, 17.4, 17.5, 20.2, 20.3_
  
  - [ ]* 12.3 Write integration tests for face capture flow
    - Test complete flow: camera activation → blink detection → capture → lighting check → embedding extraction → storage
    - Test retry on lighting warning
    - Test retry on face detection errors
    - Test timeout handling

- [ ] 13. Checkpoint - Ensure initial face capture flow works end-to-end
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Implement reverification flow UI
  - [ ] 14.1 Create reverification-choice.html page
    - Display two options: "Verify with Face" and "Verify with OTP"
    - Add 60-second countdown timer (default to OTP if no selection)
    - Style with Tailwind CSS
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  
  - [ ] 14.2 Create reverification-face.html page
    - Reuse face capture UI components from initial capture
    - Add reverification-specific messaging
    - Add options: retry, switch to OTP, contact support
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 12.1, 12.2, 12.3, 12.4_

- [ ] 15. Implement reverification flow logic
  - [ ] 15.1 Create reverification-service.js orchestration module
    - Implement triggerReverification to detect new device and show choice screen
    - Implement startReverification workflow: capture face → extract embedding → retrieve baseline → compare embeddings → log result → grant/deny access
    - Handle successful verification: grant access, record IP as trusted, redirect to dashboard
    - Handle failed verification: show failure message, offer retry/OTP/support options
    - Implement failure counter: redirect to OTP after 3 consecutive failures
    - Implement 5-minute timeout for reverification process
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 8.5, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.1, 10.2, 10.3, 10.4, 10.5, 11.1, 11.2, 11.3, 11.4, 11.5, 12.1, 12.2, 12.3, 12.4, 12.5, 13.1, 13.2, 13.3, 13.4, 13.5, 18.1, 18.2, 18.3, 18.4, 18.5_
  
  - [ ]* 15.2 Write property test for failure counter logic
    - **Property 11: Failure Counter Logic**
    - **Validates: Requirements 12.5**
    - Generate random verification attempt sequences, verify redirect to OTP iff 3 consecutive failures
  
  - [ ]* 15.3 Write integration tests for reverification flow
    - Test successful reverification (same person)
    - Test failed reverification (different person)
    - Test retry after failure
    - Test automatic redirect to OTP after 3 failures
    - Test timeout handling

- [ ] 16. Implement configuration management
  - [ ] 16.1 Create VerificationConfig class with getConfig, setConfig, and loadDefaults methods
    - Implement getConfig to retrieve configuration values from verification_config table
    - Implement setConfig to update configuration values
    - Implement loadDefaults to initialize default thresholds
    - Cache configuration values in memory for performance
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_
  
  - [ ]* 16.2 Write property test for custom threshold application
    - **Property 12: Custom Threshold Application**
    - **Validates: Requirements 14.3, 14.4**
    - Set custom threshold, perform multiple verifications, verify all use custom threshold

- [ ] 17. Implement error handling and user feedback
  - [ ] 17.1 Create ErrorHandler class with displayError, getErrorMessage, and isRetryableError methods
    - Define error codes and messages for all error scenarios (camera, face detection, lighting, liveness, storage, verification)
    - Implement displayError to show modal with error message and action buttons
    - Implement getErrorMessage to return user-friendly error messages
    - Implement isRetryableError to determine if automatic retry is appropriate
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_
  
  - [ ] 17.2 Implement retry logic with exponential backoff
    - Implement retryWithBackoff helper function
    - Network errors: 3 retries with exponential backoff (1s, 2s, 4s)
    - Transient errors: 2 retries with 1-second delay
    - User errors: no automatic retry (user must initiate)
    - _Requirements: 5.4_
  
  - [ ]* 17.3 Write unit tests for error handling
    - Test error message generation for all error codes
    - Test retry logic for different error types
    - Test fallback to OTP on non-recoverable errors

- [ ] 18. Implement security features
  - [ ] 18.1 Add HTTPS enforcement
    - Check window.location.protocol and throw error if not HTTPS
    - Display warning message if HTTPS not available
    - _Requirements: 16.2, 16.4_
  
  - [ ] 18.2 Implement data encryption for embeddings
    - Embeddings stored as TEXT in Turso DB (Turso provides transparent encryption at rest)
    - Verify all API calls use HTTPS
    - _Requirements: 16.1, 16.2_
  
  - [ ] 18.3 Implement data deletion on account closure
    - Create deleteFaceData method to remove data from both Cloudinary and Turso DB
    - Delete face_verification_data record
    - Delete Cloudinary image using public_id
    - Delete old reverification_logs (older than 90 days)
    - _Requirements: 16.5_
  
  - [ ]* 18.4 Write integration tests for security features
    - Test HTTPS enforcement
    - Test data deletion (verify data removed from both systems)
    - Test that embeddings are not transmitted over unencrypted connections

- [ ] 19. Checkpoint - Ensure security and error handling are robust
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 20. Implement UI components and styling
  - [ ] 20.1 Create reusable UI components
    - Create CameraPreview component (video + canvas overlay)
    - Create StatusMessage component (instructions, warnings, errors)
    - Create ActionButtons component (retry, skip to OTP, contact support)
    - Create ProgressIndicator component (blink detection, processing)
    - Style all components with Tailwind CSS matching existing design
    - _Requirements: 1.2, 1.3, 2.3, 2.4, 17.1, 17.2, 17.3, 17.4, 17.5_
  
  - [ ] 20.2 Implement responsive design
    - Ensure camera preview works on mobile devices
    - Adjust oval guide size for different screen sizes
    - Test on various devices and browsers
    - _Requirements: 1.2, 1.3_

- [ ] 21. Integrate with existing account creation flow
  - [ ] 21.1 Update account-creation.html to include face verification stage
    - Add Stage 6: Face Verification Introduction (explain feature, show benefits)
    - Add Stage 7: Face Capture (actual face verification)
    - Update stage navigation to include new stages
    - Ensure face verification occurs after ID verification (Stage 5) and before address entry (Stage 8)
    - _Requirements: 20.1, 20.2_
  
  - [ ] 21.2 Update account creation service to save face data before creating account
    - Call FaceStorageService.storeFaceData before final account creation
    - If face data storage fails, prevent account creation and display error
    - If user skips face verification, allow account creation but flag for later completion
    - _Requirements: 20.4, 20.5_
  
  - [ ]* 21.3 Write integration tests for account creation flow
    - Test complete account creation with face verification
    - Test account creation failure when face data storage fails
    - Test account creation with skipped face verification

- [ ] 22. Integrate with sign-in flow for reverification
  - [ ] 22.1 Update sign-in.html to trigger reverification on new device
    - After successful PIN verification, check if reverification needed
    - If new device detected, redirect to reverification choice page
    - If reverification successful, proceed to dashboard
    - If reverification failed, offer retry or OTP
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 8.5_
  
  - [ ]* 22.2 Write integration tests for sign-in with reverification
    - Test sign-in from known device (no reverification)
    - Test sign-in from new device (reverification triggered)
    - Test successful reverification flow
    - Test failed reverification with OTP fallback

- [ ] 23. Implement monitoring and logging
  - [ ] 23.1 Add performance metrics tracking
    - Track camera activation time
    - Track blink detection latency
    - Track embedding extraction time
    - Track storage time (Cloudinary + DB)
    - Track total reverification time
    - Log metrics to console (future: send to analytics service)
    - _Requirements: N/A (implementation detail)_
  
  - [ ] 23.2 Add audit logging for security events
    - Log all face capture attempts (success/failure)
    - Log all reverification attempts (success/failure)
    - Log similarity scores for all comparisons
    - Log IP addresses and user agents
    - Log lighting conditions and blink detection results
    - Store logs in reverification_logs table
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

- [ ] 24. Final checkpoint and end-to-end testing
  - [ ] 24.1 Run complete end-to-end tests
    - Test complete account creation flow with face verification
    - Test complete sign-in flow with reverification
    - Test all error scenarios and recovery paths
    - Test on multiple browsers (Chrome, Firefox, Safari, Edge)
    - Test on mobile devices (iOS Safari, Android Chrome)
    - _Requirements: All_
  
  - [ ] 24.2 Verify all correctness properties pass
    - Run all property-based tests
    - Verify all 12 correctness properties hold
    - Fix any failing properties
  
  - [ ] 24.3 Final checkpoint
    - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional property-based tests and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Integration tests validate end-to-end workflows
- Checkpoints ensure incremental validation at key milestones
- The implementation uses existing infrastructure (TursoDBService, MediaPipeService) and extends it with face verification capabilities
- Face-api.js models (ssdMobilenetv1, faceLandmark68Net, faceRecognitionNet) must be downloaded and hosted in /models directory before implementation
- Cloudinary account and upload preset must be configured before implementation
- All face data is encrypted at rest (Turso DB) and in transit (HTTPS)
- OTP verification is always available as a fallback if face verification fails or is unavailable
