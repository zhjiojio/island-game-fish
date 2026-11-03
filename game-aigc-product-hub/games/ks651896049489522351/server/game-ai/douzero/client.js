const { CircuitBreaker } = require('./circuit-breaker');

// 2 vCPU Sidecar benchmark (64/152 candidates) peaks at four in-flight
// requests. Higher concurrency reduces throughput while increasing tail latency.
const DEFAULT_MAX_CONCURRENT = 4;

class DouZeroClientError extends Error {
  constructor (reason, message, options = {}) {
    super(message || reason);
    this.name = 'DouZeroClientError';
    this.reason = reason;
    this.status = options.status || 0;
  }
}

function clamp (value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || min));
}

async function readJsonLimited (response, maximumBytes) {
  const contentLength = Number(response.headers?.get?.('content-length') || 0);
  if (contentLength > maximumBytes) throw new DouZeroClientError('douzero_invalid_response', 'response_too_large');
  let bytes;
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel().catch(() => {});
        throw new DouZeroClientError('douzero_invalid_response', 'response_too_large');
      }
      chunks.push(value);
    }
    bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
  } else {
    bytes = new Uint8Array(await response.arrayBuffer());
  }
  if (bytes.byteLength > maximumBytes) throw new DouZeroClientError('douzero_invalid_response', 'response_too_large');
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (_) {
    throw new DouZeroClientError('douzero_invalid_response', 'invalid_json');
  }
}

class DouZeroClient {
  constructor (options = {}) {
    this.baseUrl = String(options.baseUrl || 'http://douzero:2021').replace(/\/$/, '');
    this.timeoutMs = clamp(options.timeoutMs || 800, 50, 1500);
    this.maximumResponseBytes = Math.floor(clamp(options.maximumResponseBytes || 32768, 1024, 1024 * 1024));
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.breaker = options.breaker || new CircuitBreaker(options.circuit || {});
    this.maxConcurrent = Math.floor(clamp(options.maxConcurrent || DEFAULT_MAX_CONCURRENT, 1, 256));
    this.inFlight = 0;
    if (typeof this.fetchImpl !== 'function') throw new Error('douzero_fetch_unavailable');
  }

  async decidePlay (request, options = {}) {
    if (this.inFlight >= this.maxConcurrent) throw new DouZeroClientError('douzero_busy');
    const permit = this.breaker.acquire();
    if (!permit.allowed) throw new DouZeroClientError('douzero_circuit_open');
    // Re-check after acquiring a possible half-open probe. This keeps a rejected
    // capacity race from leaving the probe slot occupied until cooldown.
    if (this.inFlight >= this.maxConcurrent) {
      if (permit.probe) this.breaker.releaseProbe();
      throw new DouZeroClientError('douzero_busy');
    }
    const timeoutMs = clamp(options.timeoutMs || this.timeoutMs, 50, this.timeoutMs);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    this.inFlight += 1;
    try {
      let response;
      try {
        response = await this.fetchImpl(`${this.baseUrl}/v1/decide-play`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request),
          signal: controller.signal,
        });
      } catch (err) {
        if (err?.name === 'AbortError' || controller.signal.aborted) {
          throw new DouZeroClientError('douzero_timeout');
        }
        throw new DouZeroClientError('douzero_unavailable', err?.message);
      }
      if (!response.ok) {
        const reason = response.status === 504
          ? 'douzero_timeout'
          : response.status >= 500 || response.status === 429
            ? 'douzero_unavailable'
            : 'douzero_invalid_request';
        throw new DouZeroClientError(reason, `http_${response.status}`, { status: response.status });
      }
      const payload = await readJsonLimited(response, this.maximumResponseBytes);
      if (
        !payload ||
        payload.schema_version !== 1 ||
        typeof payload.decision_id !== 'string' ||
        typeof payload.candidate_id !== 'string'
      ) {
        throw new DouZeroClientError('douzero_invalid_response', 'invalid_response_schema');
      }
      if (options.expectedDecisionId && payload.decision_id !== options.expectedDecisionId) {
        throw new DouZeroClientError('douzero_stale_response');
      }
      if (options.candidateIds && !options.candidateIds.has(payload.candidate_id)) {
        throw new DouZeroClientError('douzero_unknown_candidate');
      }
      this.breaker.success(permit.probe);
      return payload;
    } catch (err) {
      const normalized = err instanceof DouZeroClientError
        ? err
        : new DouZeroClientError('douzero_invalid_response', err?.message);
      const breakerFailure = new Set([
        'douzero_timeout',
        'douzero_unavailable',
        'douzero_invalid_response',
        'douzero_unknown_candidate',
        'douzero_stale_response',
      ]).has(normalized.reason);
      if (breakerFailure) this.breaker.failure(permit.probe);
      else if (permit.probe) this.breaker.releaseProbe();
      throw normalized;
    } finally {
      clearTimeout(timeout);
      this.inFlight -= 1;
    }
  }
}

module.exports = { DEFAULT_MAX_CONCURRENT, DouZeroClient, DouZeroClientError, readJsonLimited };
