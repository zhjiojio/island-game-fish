class CircuitBreaker {
  constructor (options = {}) {
    this.windowSize = Math.max(1, Number(options.windowSize || 20));
    this.minimumRequests = Math.max(1, Number(options.minimumRequests || 10));
    this.minimumFailures = Math.max(1, Number(options.minimumFailures || 5));
    this.failureRate = Math.max(0, Math.min(1, Number(options.failureRate ?? 0.5)));
    this.cooldownMs = Math.max(1, Number(options.cooldownMs || 30000));
    this.now = options.now || Date.now;
    this.history = [];
    this.openedAt = 0;
    this.halfOpenProbe = false;
  }

  acquire () {
    if (!this.openedAt) return { allowed: true, probe: false };
    if (this.now() - this.openedAt < this.cooldownMs) return { allowed: false, probe: false };
    if (this.halfOpenProbe) return { allowed: false, probe: false };
    this.halfOpenProbe = true;
    return { allowed: true, probe: true };
  }

  success (probe = false) {
    if (probe) {
      this.history = [];
      this.openedAt = 0;
      this.halfOpenProbe = false;
      return;
    }
    // Ignore an old in-flight result after another request has opened the
    // circuit. Only the explicit half-open probe may close it again.
    if (this.openedAt) return;
    this.record(false);
  }

  failure (probe = false) {
    if (probe) {
      this.openedAt = this.now();
      this.halfOpenProbe = false;
      return;
    }
    if (this.openedAt) return;
    this.record(true);
    const failures = this.history.filter(Boolean).length;
    if (
      this.history.length >= this.minimumRequests &&
      failures >= this.minimumFailures &&
      failures / this.history.length >= this.failureRate
    ) {
      this.openedAt = this.now();
    }
  }

  releaseProbe () {
    this.halfOpenProbe = false;
  }

  record (failed) {
    this.history.push(Boolean(failed));
    if (this.history.length > this.windowSize) this.history.shift();
  }

  state () {
    if (!this.openedAt) return 'closed';
    return this.now() - this.openedAt >= this.cooldownMs ? 'half_open' : 'open';
  }
}

module.exports = { CircuitBreaker };
