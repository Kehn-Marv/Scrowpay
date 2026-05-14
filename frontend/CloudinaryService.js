/**
 * CloudinaryService — Browser unsigned upload to Cloudinary.
 *
 * This service replaces the legacy "stuff base64 data URIs into Turso"
 * pattern with proper object-store URLs. We use the unsigned-upload
 * pattern, which means:
 *
 *   • The cloud_name and preset name are public (in cloudinary-config.js).
 *   • There is NO API secret or API key in the browser.
 *   • Abuse is mitigated by Cloudinary's per-preset restrictions:
 *     image-only, max file size, folder-routed, and Cloudinary's own
 *     rate-limiting on suspicious clients.
 *
 * USAGE
 * -----
 *   const cs = new CloudinaryService();
 *   if (!cs.available) { ...fall back to base64... }
 *
 *   // Upload one file to a named preset:
 *   const result = await cs.uploadFile(file, 'disputes', {
 *     onProgress: pct => updateUI(pct),
 *     tags: ['user_42', 'dispute_xyz']
 *   });
 *   // result.secureUrl  -> 'https://res.cloudinary.com/.../v123/scrowpay/disputes/abc.jpg'
 *   // result.publicId   -> 'scrowpay/disputes/abc'
 *   // result.bytes      -> 123456
 *
 *   // Convenience helpers for the three concrete use cases:
 *   await cs.uploadDisputePhoto(file, { userId, disputeId });
 *   await cs.uploadFulfillmentProof(file, { userId, transactionId });
 *   await cs.uploadFaceReference(blob, { userId });
 *
 * RESILIENCE
 * ----------
 * If cloudinary-config.js has a blank cloudName, `available` is false
 * and callers SHOULD fall back to the legacy base64 path. The service
 * never throws on init — only on actual upload failure.
 *
 * The fallback path (base64 data URLs) is intentionally retained as a
 * last resort because Cloudinary outages would otherwise wedge dispute
 * uploads and fulfillment proof. Better degraded than broken.
 */

(function () {
  const ENDPOINT_BASE = 'https://api.cloudinary.com/v1_1/';

  class CloudinaryService {
    constructor() {
      const cfg = (typeof window !== 'undefined' && window.CLOUDINARY_CONFIG) || {};
      this.cloudName = cfg.cloudName || '';
      this.presets = cfg.presets || {};
      this.maxFileSize = cfg.maxFileSize || {};
      this.enabled = cfg.enabled !== false;
      this.timeoutMs = Number(cfg.timeoutMs) || 30000;

      // `available` is the public flag callers check before deciding
      // to use Cloudinary vs base64 fallback. We require all three:
      // a non-empty cloud_name, the enabled flag, and at least one
      // preset to be configured. Missing any of these means we're
      // not safely configured.
      this.available = !!(
        this.enabled &&
        this.cloudName &&
        Object.keys(this.presets).length > 0
      );

      if (!this.available) {
        console.warn('[CloudinaryService] Not configured (cloudName blank or disabled). Falling back to base64 storage. Edit frontend/cloudinary-config.js to enable.');
      } else {
        console.log('[CloudinaryService] Ready — cloud:', this.cloudName);
      }
    }

    // -----------------------------------------------------------------------
    // GENERIC UPLOAD
    // -----------------------------------------------------------------------
    /**
     * @param {File|Blob} file
     * @param {'disputes'|'fulfillment'|'face'} presetKey
     * @param {Object} [opts]
     * @param {(pct:number)=>void} [opts.onProgress]
     * @param {string[]} [opts.tags]
     * @param {string} [opts.publicId]   only honored if the preset allows it
     * @param {Object} [opts.context]    free-form key=value metadata
     * @returns {Promise<{secureUrl, publicId, bytes, width, height, format, resourceType, etag}>}
     */
    async uploadFile(file, presetKey, opts = {}) {
      if (!this.available) {
        throw new Error('CloudinaryService is not configured');
      }
      if (!file) throw new Error('uploadFile: file is required');
      const preset = this.presets[presetKey];
      if (!preset) throw new Error('uploadFile: unknown preset ' + presetKey);

      // Client-side size check — fail fast before burning bandwidth.
      const sizeLimit = this.maxFileSize[presetKey];
      if (sizeLimit && file.size > sizeLimit) {
        throw new Error(`File too large (${(file.size / 1048576).toFixed(1)}MB > ${(sizeLimit / 1048576).toFixed(0)}MB)`);
      }

      // Cloudinary only accepts a small whitelist of params on unsigned
      // uploads. The full list is documented at
      //   https://cloudinary.com/documentation/upload_presets
      // We use: file, upload_preset, tags, public_id (if allowed),
      // context. Everything else (resource_type, format, folder, etc.)
      // is configured on the preset itself.
      const form = new FormData();
      form.append('file', file);
      form.append('upload_preset', preset);
      if (opts.tags && opts.tags.length) form.append('tags', opts.tags.join(','));
      if (opts.publicId) form.append('public_id', opts.publicId);
      if (opts.context && typeof opts.context === 'object') {
        // context format: "key1=val1|key2=val2"
        const ctxStr = Object.entries(opts.context)
          .map(([k, v]) => `${k}=${String(v).replace(/[|=]/g, '_')}`)
          .join('|');
        if (ctxStr) form.append('context', ctxStr);
      }

      const url = ENDPOINT_BASE + encodeURIComponent(this.cloudName) + '/image/upload';

      // Use XHR (not fetch) because we need real upload-progress events
      // — `fetch` doesn't expose progress for request bodies.
      const response = await this._xhrUpload(url, form, opts.onProgress);

      if (!response || response.error) {
        const msg = (response && response.error && response.error.message) || 'Cloudinary upload failed';
        throw new Error(msg);
      }
      return {
        secureUrl:    response.secure_url,
        publicId:     response.public_id,
        bytes:        response.bytes,
        width:        response.width,
        height:       response.height,
        format:       response.format,
        resourceType: response.resource_type,
        etag:         response.etag,
        version:      response.version,
        createdAt:    response.created_at
      };
    }

    // -----------------------------------------------------------------------
    // CONVENIENCE WRAPPERS
    // -----------------------------------------------------------------------
    async uploadDisputePhoto(file, { userId, disputeId, transactionId } = {}) {
      return this.uploadFile(file, 'disputes', {
        tags: this._buildTags({ userId, disputeId, transactionId, type: 'dispute' }),
        context: { user_id: userId, dispute_id: disputeId, transaction_id: transactionId }
      });
    }

    async uploadFulfillmentProof(file, { userId, transactionId } = {}) {
      return this.uploadFile(file, 'fulfillment', {
        tags: this._buildTags({ userId, transactionId, type: 'fulfillment' }),
        context: { user_id: userId, transaction_id: transactionId }
      });
    }

    /**
     * Face reference / re-verification capture. We deliberately set a
     * deterministic publicId based on user_id and timestamp so the
     * cloudinary URL is predictable enough to debug, but each capture
     * is a new asset (we never overwrite the original signup reference
     * — that's a security audit trail).
     */
    async uploadFaceReference(blob, { userId, purpose = 'signup' } = {}) {
      const ts = Date.now();
      return this.uploadFile(blob, 'face', {
        tags: this._buildTags({ userId, type: 'face', purpose }),
        context: { user_id: userId, purpose, ts },
        publicId: `face_${userId}_${purpose}_${ts}`
      });
    }

    // -----------------------------------------------------------------------
    // INTERNAL
    // -----------------------------------------------------------------------
    _buildTags({ userId, transactionId, disputeId, type, purpose }) {
      const tags = [];
      if (type) tags.push('type:' + type);
      if (userId) tags.push('user:' + userId);
      if (transactionId) tags.push('txn:' + transactionId);
      if (disputeId) tags.push('dispute:' + disputeId);
      if (purpose) tags.push('purpose:' + purpose);
      return tags;
    }

    _xhrUpload(url, formData, onProgress) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.timeout = this.timeoutMs;

        if (typeof onProgress === 'function') {
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              onProgress(Math.round((e.loaded / e.total) * 100));
            }
          });
        }
        xhr.onload = () => {
          try {
            const parsed = JSON.parse(xhr.responseText || '{}');
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(parsed);
            } else {
              reject(new Error(
                (parsed && parsed.error && parsed.error.message) ||
                `Cloudinary ${xhr.status}`
              ));
            }
          } catch (e) {
            reject(new Error('Cloudinary returned invalid JSON'));
          }
        };
        xhr.onerror = () => reject(new Error('Cloudinary network error'));
        xhr.ontimeout = () => reject(new Error('Cloudinary upload timed out'));
        xhr.send(formData);
      });
    }
  }

  if (typeof window !== 'undefined') {
    window.CloudinaryService = CloudinaryService;
  }
})();
