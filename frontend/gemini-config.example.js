/**
 * Gemini API configuration TEMPLATE.
 *
 * Copy this file to `gemini-config.js` (which is gitignored) and paste
 * your real API key in. The Trust Engine / Risk Profiling system reads
 * `window.GEMINI_CONFIG` at startup.
 *
 *   1. cp frontend/gemini-config.example.js frontend/gemini-config.js
 *   2. Edit `apiKey` below
 *   3. The dashboard will auto-detect the key on next load and enable
 *      AI-augmented risk flags. If the key is missing or empty the app
 *      runs cleanly with deterministic rules only.
 *
 * NEVER commit a real key. `gemini-config.js` is in .gitignore.
 */

window.GEMINI_CONFIG = {
  // Your Google AI Studio key. Get one at https://aistudio.google.com/
  apiKey: '',

  // Model name. Flash is fast + cheap and more than enough for the
  // short JSON-formatted prompts we send. Switch to a Pro model only
  // if you observe quality issues.
  model: 'gemini-2.0-flash',

  // Hard timeout per request in ms. The risk-profiling pipeline
  // tolerates timeouts gracefully (deterministic rules still run),
  // so keep this short.
  timeoutMs: 4000,

  // Toggle without removing the key — useful while debugging.
  enabled: true
};
