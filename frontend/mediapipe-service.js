/**
 * MediaPipeService - Blink Detection using MediaPipe Face Mesh
 * 
 * This service uses MediaPipe Face Mesh to detect eye blinks for liveness verification.
 * It calculates Eye Aspect Ratio (EAR) from facial landmarks and detects blinks when
 * EAR drops below a threshold and then rises back above it.
 * 
 * Requirements: 7.4, 7.5, 14.1, 14.2, 14.3, 14.4, 14.5
 */

class MediaPipeService {
  /**
   * Creates a new MediaPipeService instance
   * @param {HTMLVideoElement} videoElement - Video element for camera feed
   * @param {HTMLCanvasElement} canvasElement - Canvas element for drawing overlays
   */
  constructor(videoElement, canvasElement) {
    this.videoElement = videoElement;
    this.canvasElement = canvasElement;
    this.canvasContext = canvasElement ? canvasElement.getContext('2d') : null;
    
    this.faceMesh = null;
    this.camera = null;
    this.isDetecting = false;
    this.onBlinkDetectedCallback = null;
    
    // Blink detection state
    this.earThreshold = 0.25;
    this.isBlinking = false;
    this.blinkDetected = false;
    
    // Eye landmark indices for MediaPipe Face Mesh (468 landmarks)
    // Left eye landmarks (6 key points)
    this.leftEyeIndices = [33, 160, 158, 133, 153, 144];
    // Right eye landmarks (6 key points)
    this.rightEyeIndices = [362, 385, 387, 263, 373, 380];
  }

  /**
   * Initializes MediaPipe Face Mesh library
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      // Check if MediaPipe libraries are loaded
      if (typeof FaceMesh === 'undefined') {
        throw new Error('MediaPipe Face Mesh library not loaded. Please include the CDN script.');
      }

      // Initialize Face Mesh
      this.faceMesh = new FaceMesh({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
        }
      });

      // Configure Face Mesh
      this.faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      // Set up result callback
      this.faceMesh.onResults((results) => this.onResults(results));

      console.log('MediaPipe Face Mesh initialized successfully');
    } catch (error) {
      console.error('Failed to initialize MediaPipe:', error);
      throw error;
    }
  }

  /**
   * Starts blink detection by initializing camera and processing video frames
   * @param {Function} onBlinkDetected - Callback function to invoke when blink is detected
   */
  async startDetection(onBlinkDetected) {
    if (!this.faceMesh) {
      throw new Error('MediaPipe not initialized. Call initialize() first.');
    }

    this.onBlinkDetectedCallback = onBlinkDetected;
    this.isDetecting = true;
    this.blinkDetected = false;
    this.isBlinking = false;

    try {
      // Check if Camera utility is available
      if (typeof Camera === 'undefined') {
        throw new Error('MediaPipe Camera utility not loaded. Please include the CDN script.');
      }

      // Initialize camera
      this.camera = new Camera(this.videoElement, {
        onFrame: async () => {
          if (this.isDetecting && this.faceMesh) {
            await this.faceMesh.send({ image: this.videoElement });
          }
        },
        width: 640,
        height: 480
      });

      // Start camera
      await this.camera.start();
      console.log('Camera started, blink detection active');
    } catch (error) {
      console.error('Failed to start camera:', error);
      throw error;
    }
  }

  /**
   * Stops blink detection and cleans up camera stream
   */
  stopDetection() {
    this.isDetecting = false;

    // Stop camera
    if (this.camera) {
      this.camera.stop();
      this.camera = null;
    }

    // Stop video stream
    if (this.videoElement && this.videoElement.srcObject) {
      const stream = this.videoElement.srcObject;
      const tracks = stream.getTracks();
      tracks.forEach(track => track.stop());
      this.videoElement.srcObject = null;
    }

    console.log('Blink detection stopped, camera cleaned up');
  }

  /**
   * Processes Face Mesh results and detects blinks
   * @param {Object} results - Results from MediaPipe Face Mesh
   */
  onResults(results) {
    if (!this.isDetecting || this.blinkDetected) {
      return;
    }

    // Draw results on canvas if available
    if (this.canvasContext && this.canvasElement) {
      this.canvasContext.save();
      this.canvasContext.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
      this.canvasContext.drawImage(
        results.image,
        0,
        0,
        this.canvasElement.width,
        this.canvasElement.height
      );
      this.canvasContext.restore();
    }

    // Check if face is detected
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      return;
    }

    // Get landmarks for the first detected face
    const landmarks = results.multiFaceLandmarks[0];

    // Calculate EAR for both eyes
    const leftEAR = this.calculateEAR(landmarks, this.leftEyeIndices);
    const rightEAR = this.calculateEAR(landmarks, this.rightEyeIndices);

    // Average EAR for both eyes
    const avgEAR = (leftEAR + rightEAR) / 2.0;

    // Detect blink: EAR drops below threshold then rises above
    if (avgEAR < this.earThreshold) {
      // Eye is closing or closed
      if (!this.isBlinking) {
        this.isBlinking = true;
        console.log('Blink started, EAR:', avgEAR.toFixed(3));
      }
    } else {
      // Eye is open
      if (this.isBlinking) {
        // Blink completed (eye was closed, now open)
        this.isBlinking = false;
        this.blinkDetected = true;
        console.log('Blink detected! EAR:', avgEAR.toFixed(3));

        // Trigger callback
        if (this.onBlinkDetectedCallback) {
          this.onBlinkDetectedCallback();
        }
      }
    }
  }

  /**
   * Calculates Eye Aspect Ratio (EAR) from eye landmarks
   * 
   * EAR Formula:
   * EAR = (||p2 - p6|| + ||p3 - p5||) / (2 * ||p1 - p4||)
   * 
   * Where:
   * - p1, p4 are the horizontal eye corners (outer and inner)
   * - p2, p3, p5, p6 are the vertical eye points (top and bottom)
   * 
   * @param {Array} landmarks - All facial landmarks from MediaPipe
   * @param {Array} eyeIndices - Indices of the 6 eye landmarks [p1, p2, p3, p4, p5, p6]
   * @returns {number} Eye Aspect Ratio
   */
  calculateEAR(landmarks, eyeIndices) {
    // Extract eye landmark points
    const p1 = landmarks[eyeIndices[0]]; // Outer corner
    const p2 = landmarks[eyeIndices[1]]; // Top outer
    const p3 = landmarks[eyeIndices[2]]; // Top inner
    const p4 = landmarks[eyeIndices[3]]; // Inner corner
    const p5 = landmarks[eyeIndices[4]]; // Bottom inner
    const p6 = landmarks[eyeIndices[5]]; // Bottom outer

    // Calculate vertical distances
    const vertical1 = this.euclideanDistance(p2, p6);
    const vertical2 = this.euclideanDistance(p3, p5);

    // Calculate horizontal distance
    const horizontal = this.euclideanDistance(p1, p4);

    // Calculate EAR
    const ear = (vertical1 + vertical2) / (2.0 * horizontal);

    return ear;
  }

  /**
   * Calculates Euclidean distance between two 3D points
   * @param {Object} point1 - First point with x, y, z coordinates
   * @param {Object} point2 - Second point with x, y, z coordinates
   * @returns {number} Euclidean distance
   */
  euclideanDistance(point1, point2) {
    const dx = point1.x - point2.x;
    const dy = point1.y - point2.y;
    const dz = point1.z - point2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Checks if MediaPipe libraries are loaded
   * @returns {boolean} True if libraries are loaded
   */
  static isLibraryLoaded() {
    return typeof FaceMesh !== 'undefined' && typeof Camera !== 'undefined';
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MediaPipeService;
}
