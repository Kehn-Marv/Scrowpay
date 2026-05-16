/**
 * DeviceFingerprintService — Real, library-grade device fingerprinting.
 *
 * BEFORE: a hand-rolled hash of `userAgent + screen + timezone`. Trivially
 * forgeable, indistinguishable across users on the same browser version,
 * and thrown away every page reload.
 *
 * NOW: FingerprintJS open-source v4 (Apache 2.0, free, ~30 stable signals
 * including canvas, audio, fonts, WebGL, math, hardware concurrency, etc.).
 * Loaded from a CDN ESM build so there is zero build-step impact on the
 * vanilla-JS dashboard. Result is a stable `visitorId` (hash) plus a
 * `confidence` score (~0.5–0.99 in browser, lower on private mode).
 *
 * EXPOSED API
 * -----------
 *   const fp = new DeviceFingerprintService(config);
 *   await fp.ready();                      // resolves once the agent is loaded
 *   const { visitorId, confidence, components } = await fp.identify();
 *   const numericFp = fp.toLegacyNumber(visitorId);   // for the Python ML engine
 *   await fp.recordForUser(userId, visitorId);        // persists to device_fingerprints
 *   const stats = await fp.getDeviceStats(visitorId); // {distinctUsers, totalSeen}
 *
 * RESILIENCE
 * - If the CDN is blocked / offline, falls back to the legacy
 *   userAgent+screen+tz hash with `confidence: 0.1` and a `degraded: true`
 *   flag so the AnomalyDetectionEngine knows to weight it less.
 * - All identify() calls are memoized for the lifetime of the page —
 *   FingerprintJS is deterministic on a given device, so re-running it
 *   would just burn CPU.
 */

(function () {
  // FingerprintJS open-source v4 ESM bundle. This URL is the official
  // pinned CDN distribution. We pin a major.minor for stability.
  const FP_CDN = 'https://openfpcdn.io/fingerprintjs/v4/esm.min.js';

  class DeviceFingerprintService {
    constructor(config = {}) {
      this.dbService = (config.turso && config.turso.databaseUrl)
        ? new TursoDBService(config.turso.databaseUrl, config.turso.authToken)
        : null;
      this.connected = false;

      // Cached identify() result — FingerprintJS is deterministic so we
      // only need to compute once per page load.
      this._cached = null;
      this._cachedAt = 0;

      // Promise that resolves when the FingerprintJS agent is loaded
      // and ready to identify(). Created lazily on first ready() call.
      this._agentPromise = null;
      this._agent = null;
      this._degraded = false;
    }

    async _connect() {
      if (this.dbService && !this.connected) {
        await this.dbService.connect();
        this.connected = true;
      }
    }

    /**
     * Resolves once the FingerprintJS agent is ready (or once we've
     * decided to fall back to the legacy hash). Idempotent.
     */
    ready() {
      if (this._agentPromise) return this._agentPromise;
      this._agentPromise = (async () => {
        try {
          // Dynamic ESM import. Works in modern browsers without a build step.
          const mod = await import(/* @vite-ignore */ FP_CDN);
          const FingerprintJS = mod.default || mod;
          this._agent = await FingerprintJS.load({
            // Modest monitoring opt-out. We don't ship telemetry to FP's
            // servers since we use the OSS lib, but this is belt-and-braces.
            monitoring: false
          });
          console.log('[DeviceFingerprint] FingerprintJS agent loaded');
        } catch (err) {
          console.warn('[DeviceFingerprint] CDN load failed, falling back to legacy hash:', err.message);
          this._degraded = true;
          this._agent = null;
        }
      })();
      return this._agentPromise;
    }

    /**
     * Returns { visitorId, confidence, components, degraded }.
     * Memoized — safe to call repeatedly.
     */
    async identify() {
      if (this._cached) return this._cached;
      await this.ready();

      try {
        if (this._agent) {
          const result = await this._agent.get();
          // FingerprintJS returns confidence as { score: 0..1 }
          const confidence = (result.confidence && typeof result.confidence.score === 'number')
            ? result.confidence.score
            : 0.5;
          this._cached = {
            visitorId: result.visitorId,
            confidence,
            components: this._compactComponents(result.components || {}),
            degraded: false
          };
        } else {
          // Fallback: legacy hash. Still useful as SOMETHING to bind a
          // session to, but very weak — the engine should weight it low.
          this._cached = this._legacyHash();
        }
      } catch (err) {
        console.warn('[DeviceFingerprint] identify() failed; using legacy hash:', err.message);
        this._cached = this._legacyHash();
      }

      this._cachedAt = Date.now();
      return this._cached;
    }

    /**
     * The Python ML engine's existing `device_fingerprint` feature is a
     * 32-bit-ish integer. We hash the visitorId down to that shape so we
     * don't have to redeploy the ML engine to consume the new IDs.
     */
    toLegacyNumber(visitorId) {
      const s = String(visitorId || '');
      let h = 0;
      for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h) + s.charCodeAt(i);
        h = h & h; // 32-bit
      }
      return Math.abs(h);
    }

    /**
     * Persist that this user logged in / acted from this device.
     * Best-effort; never throws.
     */
    async recordForUser(userId, visitorId) {
      if (!userId || !visitorId || !this.dbService) return;
      try {
        await this._connect();
        const fp = await this.identify();
        // Use SQLite's native UPSERT (INSERT OR REPLACE) to avoid constraint errors
        // This will insert if new, or update if the fingerprint_id + user_id combo already exists
        await this.dbService._executeHttp(
          `INSERT INTO device_fingerprints
             (fingerprint_id, user_id, confidence, components, user_agent, last_seen_at, seen_count)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1)
           ON CONFLICT(fingerprint_id, user_id) 
           DO UPDATE SET 
             last_seen_at = CURRENT_TIMESTAMP,
             seen_count = COALESCE(seen_count, 0) + 1,
             confidence = excluded.confidence`,
          [
            visitorId,
            userId,
            fp.confidence,
            JSON.stringify(fp.components || {}),
            (typeof navigator !== 'undefined' ? navigator.userAgent : null)
          ]
        );
      } catch (e) {
        console.warn('[DeviceFingerprint] recordForUser failed (non-fatal):', e.message);
      }
    }

    /**
     * Returns { distinctUsers, totalSeen, firstSeenAt } for a fingerprint.
     * Used for device-linked risk signals (e.g. multi-account patterns in DB).
     */
    async getDeviceStats(fingerprintId) {
      const fallback = { distinctUsers: 0, totalSeen: 0, firstSeenAt: null };
      if (!fingerprintId || !this.dbService) return fallback;
      try {
        await this._connect();
        const result = await this.dbService._executeHttp(
          `SELECT
              COUNT(DISTINCT user_id) AS distinctUsers,
              COALESCE(SUM(seen_count), 0) AS totalSeen,
              MIN(first_seen_at)         AS firstSeenAt
            FROM device_fingerprints WHERE fingerprint_id = ?`,
          [fingerprintId]
        );
        const exec = result.results[0]?.response?.result;
        if (!exec || !exec.rows || exec.rows.length === 0) return fallback;
        const row = exec.rows[0];
        const cell = (i) => {
          const v = row[i];
          return (v && typeof v === 'object' && 'value' in v) ? v.value : v;
        };
        return {
          distinctUsers: Number(cell(0)) || 0,
          totalSeen: Number(cell(1)) || 0,
          firstSeenAt: cell(2)
        };
      } catch (e) {
        console.warn('[DeviceFingerprint] getDeviceStats failed:', e.message);
        return fallback;
      }
    }

    // -----------------------------------------------------------------------
    // INTERNAL
    // -----------------------------------------------------------------------
    /**
     * Picks a small, privacy-respecting subset of the FingerprintJS
     * component bag for storage. Storing the full bag is overkill (and
     * leaks more data than we need) — we only keep the high-signal,
     * low-PII fields useful for forensic analysis later.
     */
    _compactComponents(components) {
      const keys = [
        'platform', 'colorDepth', 'colorGamut', 'hardwareConcurrency',
        'deviceMemory', 'screenResolution', 'timezone', 'languages',
        'cpuClass', 'osCpu', 'webGlBasics', 'fontPreferences', 'audio'
      ];
      const out = {};
      for (const k of keys) {
        if (components[k] && components[k].value !== undefined) {
          // Audio + canvas + webgl values can be large — store hashed.
          const v = components[k].value;
          if (typeof v === 'string' && v.length > 64) {
            out[k] = this._shortHash(v);
          } else if (typeof v === 'object') {
            try { out[k] = this._shortHash(JSON.stringify(v)); } catch (_) {}
          } else {
            out[k] = v;
          }
        }
      }
      return out;
    }

    _shortHash(s) {
      let h = 0;
      for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h) + s.charCodeAt(i);
        h = h & h;
      }
      return 'h:' + (h >>> 0).toString(16);
    }

    /**
     * Legacy fallback hash — used only when the FingerprintJS CDN is
     * unreachable. Marked degraded:true so the engine weights it low.
     */
    _legacyHash() {
      const metadata = [
        typeof navigator !== 'undefined' ? navigator.userAgent : '',
        typeof navigator !== 'undefined' ? navigator.language : '',
        typeof screen !== 'undefined' ? screen.width : 0,
        typeof screen !== 'undefined' ? screen.height : 0,
        typeof screen !== 'undefined' ? screen.colorDepth : 0,
        new Date().getTimezoneOffset()
      ].join('|');
      let hash = 0;
      for (let i = 0; i < metadata.length; i++) {
        hash = ((hash << 5) - hash) + metadata.charCodeAt(i);
        hash = hash & hash;
      }
      const visitorId = 'legacy_' + (hash >>> 0).toString(16);
      return {
        visitorId,
        confidence: 0.1,         // intentionally low — the engine de-weights this
        components: {
          ua: typeof navigator !== 'undefined' ? navigator.userAgent : null,
          tz: new Date().getTimezoneOffset()
        },
        degraded: true
      };
    }
  }

  if (typeof window !== 'undefined') {
    window.DeviceFingerprintService = DeviceFingerprintService;
  }
})();
