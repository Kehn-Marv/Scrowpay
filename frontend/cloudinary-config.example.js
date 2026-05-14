/**
 * Cloudinary configuration TEMPLATE.
 *
 * Copy this file to `cloudinary-config.js` (which is gitignored) and
 * fill in your real cloud name + upload preset names. The upload
 * service (CloudinaryService.js) reads `window.CLOUDINARY_CONFIG` at
 * startup. The `apiKey`/`apiSecret` pair is NEVER used in the browser
 * — we exclusively use unsigned upload presets, so only the public
 * cloud_name needs to be here.
 *
 *   1. cp frontend/cloudinary-config.example.js frontend/cloudinary-config.js
 *   2. Fill in `cloudName` with the value from your Cloudinary dashboard
 *      (Dashboard home → Product Environment → "Cloud name").
 *   3. Create the three unsigned upload presets in Settings → Upload →
 *      "Add upload preset" with these exact names + folders:
 *
 *        ┌──────────────────────────┬──────────────────────────┬──────────┐
 *        │ Preset name              │ Folder                   │ Max size │
 *        ├──────────────────────────┼──────────────────────────┼──────────┤
 *        │ scrowpay_disputes        │ scrowpay/disputes        │ 10 MB    │
 *        │ scrowpay_fulfillment     │ scrowpay/fulfillment     │ 10 MB    │
 *        │ scrowpay_face            │ scrowpay/face_refs       │  5 MB    │
 *        └──────────────────────────┴──────────────────────────┴──────────┘
 *
 *      For each one: Signing mode → UNSIGNED, allowed formats →
 *      jpg,jpeg,png,webp, image-only.
 *
 *   4. The dashboard auto-detects the config on next load. If the
 *      cloudName is blank, file uploads fall back to base64 inline
 *      storage (the legacy hackathon path) with a console warning.
 *
 * NEVER commit your real config. `cloudinary-config.js` is in
 * .gitignore. The cloud name itself isn't really secret (it's exposed
 * in every upload URL anyway), but keeping the file untracked makes
 * onboarding teammates clearer.
 */

window.CLOUDINARY_CONFIG = {
  // Required. From Cloudinary dashboard → Product Environment.
  cloudName: '',

  // Unsigned upload preset names. Must match the names you create in
  // the Cloudinary dashboard exactly. The folder for each is set on
  // the preset itself, not here.
  presets: {
    disputes: 'scrowpay_disputes',
    fulfillment: 'scrowpay_fulfillment',
    face: 'scrowpay_face'
  },

  // Client-side validation caps. Cloudinary will also enforce its own
  // limits via the preset, but failing fast in the browser saves a
  // round-trip on oversized files.
  maxFileSize: {
    disputes: 10 * 1024 * 1024,
    fulfillment: 10 * 1024 * 1024,
    face: 5 * 1024 * 1024
  },

  // Master enable flag. Flip to false to force the legacy base64
  // fallback path for everything (useful while debugging).
  enabled: true,

  // Hard per-upload timeout. Cloudinary is usually <2s for a 1-2MB
  // image; we give plenty of headroom for slow Nigerian mobile links.
  timeoutMs: 30000
};
