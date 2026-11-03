const logger = require('../logger');

const POSITIONS = new Set(['landlord', 'landlord_down', 'landlord_up']);
const REASONS = new Set([
  'douzero_busy',
  'douzero_circuit_open',
  'douzero_invalid_context',
  'douzero_invalid_request',
  'douzero_invalid_response',
  'douzero_stale_response',
  'douzero_timeout',
  'douzero_unavailable',
  'douzero_unknown_candidate',
]);

function clampLogEvery (value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 100;
  return Math.max(1, Math.min(100000, Math.floor(number)));
}

function normalizeReason (reason) {
  const value = String(reason || 'unknown');
  return REASONS.has(value) ? value : 'other';
}

class ShadowMetrics {
  constructor (options = {}) {
    this.logEvery = clampLogEvery(options.logEvery);
    this.logger = typeof options.logger === 'function' ? options.logger : logger.info;
    this.reset();
  }

  reset () {
    this.total = 0;
    this.agree = 0;
    this.disagree = 0;
    this.failures = 0;
    this.inferenceTotalMs = 0;
    this.inferenceSamples = 0;
    this.positions = { landlord: 0, landlord_down: 0, landlord_up: 0 };
    this.reasons = {};
  }

  record (result = {}) {
    this.total += 1;
    if (result.agreed === true) this.agree += 1;
    else if (result.agreed === false) this.disagree += 1;
    else {
      this.failures += 1;
      const reason = normalizeReason(result.reason);
      this.reasons[reason] = (this.reasons[reason] || 0) + 1;
    }
    if (POSITIONS.has(result.position)) this.positions[result.position] += 1;
    const inferenceMs = Number(result.inferenceMs);
    if (Number.isFinite(inferenceMs) && inferenceMs >= 0) {
      this.inferenceTotalMs += inferenceMs;
      this.inferenceSamples += 1;
    }
    if (this.total >= this.logEvery) return this.flush();
    return null;
  }

  flush () {
    if (this.total === 0) return null;
    const successful = this.agree + this.disagree;
    const agreement = successful > 0 ? Math.round((this.agree / successful) * 1000) / 10 : 0;
    const averageInference = this.inferenceSamples > 0
      ? Math.round(this.inferenceTotalMs / this.inferenceSamples)
      : 0;
    const reasons = Object.entries(this.reasons)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([reason, count]) => `${reason}:${count}`)
      .join(',') || 'none';
    const summary = {
      samples: this.total,
      agree: this.agree,
      disagree: this.disagree,
      failures: this.failures,
      agreementPercent: agreement,
      averageInferenceMs: averageInference,
      positions: { ...this.positions },
      reasons: { ...this.reasons },
    };
    try {
      this.logger(`[DouZero影子] samples=${summary.samples} agree=${summary.agree} disagree=${summary.disagree} failures=${summary.failures} agreement=${summary.agreementPercent}% avg_inference=${summary.averageInferenceMs}ms reasons=${reasons}`);
    } catch (_) {}
    this.reset();
    return summary;
  }
}

module.exports = { ShadowMetrics, normalizeReason, clampLogEvery };
