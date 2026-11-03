const crypto = require('crypto');
const { decideAction, STRATEGY_VERSION } = require('./strategy');
const { enumerateLegalActions } = require('./legal-actions');
const { buildDouZeroContext } = require('./douzero/context-builder');
const { DouZeroClient } = require('./douzero/client');

const MODES = new Set(['off', 'shadow', 'active']);

function clamp (value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function normalizeMode (value) {
  const mode = String(value || 'active').toLowerCase();
  return MODES.has(mode) ? mode : 'active';
}

function stableBucket (key) {
  const digest = crypto.createHash('sha256').update(String(key || '')).digest();
  return digest.readUInt32BE(0) % 100;
}

function chooseRoundMode (config, stableKey) {
  const mode = normalizeMode(config.mode);
  const bucket = stableBucket(stableKey);
  if (mode === 'active' && bucket < clamp(config.trafficPercent, 0, 100)) return 'active';
  if (mode === 'shadow' && bucket < clamp(config.shadowPercent, 0, 100)) return 'shadow';
  return 'rule';
}

function strategyVersionForMode (mode, configuredVersion) {
  const model = String(configuredVersion || 'douzero-wp').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 32) || 'douzero-wp';
  if (mode === 'active') return `dz-${model}`.slice(0, 64);
  if (mode === 'shadow') return `${STRATEGY_VERSION}+dz-${model}-shadow`.slice(0, 64);
  return STRATEGY_VERSION;
}

function safeText (value, maximum = 64) {
  return typeof value === 'string' ? value.slice(0, maximum) : null;
}

function ruleResult (action, options = {}) {
  return {
    ...action,
    meta: {
      ...(action?.meta || {}),
      requestedEngine: options.requestedEngine || 'rule',
      selectedEngine: 'rule',
      fallbackReason: options.fallbackReason || null,
      fallbackApplied: Boolean(options.fallbackReason),
      decisionId: options.decisionId || null,
      candidateCount: Number(options.candidateCount || 0),
      totalDecisionMs: Math.max(0, Number(options.totalDecisionMs || 0)),
    },
  };
}

function sameAction (left, right) {
  if (!left || !right || left.type !== right.type) return false;
  if (left.type === 'pass') return true;
  const leftIds = (left.cardIds || []).slice().sort();
  const rightIds = (right.cardIds || []).slice().sort();
  return leftIds.length === rightIds.length && leftIds.every((id, index) => id === rightIds[index]);
}

function reportShadow (options, result) {
  try {
    const pending = options.onShadowResult?.(result);
    if (pending && typeof pending.catch === 'function') void pending.catch(() => {});
  } catch (_) {}
}

class DecisionRouter {
  constructor (options = {}) {
    this.config = {
      mode: normalizeMode(options.mode),
      trafficPercent: clamp(options.trafficPercent, 0, 100),
      shadowPercent: clamp(options.shadowPercent, 0, 100),
      timeoutMs: clamp(options.timeoutMs || 800, 50, 1500),
      modelVersion: options.modelVersion || 'douzero-wp',
    };
    const createClient = options.createClient || (clientOptions => new DouZeroClient(clientOptions));
    this.client = options.client || createClient({
      baseUrl: options.baseUrl,
      timeoutMs: this.config.timeoutMs,
      maxConcurrent: options.maxConcurrent,
      circuit: options.circuit,
    });
    // Shadow inference must never consume the active path's capacity or circuit.
    // A separate small fast-fail client keeps observability traffic disposable.
    this.shadowClient = options.shadowClient || (options.client
      ? this.client
      : createClient({
          baseUrl: options.baseUrl,
          timeoutMs: this.config.timeoutMs,
          maxConcurrent: options.shadowMaxConcurrent || 2,
          circuit: options.circuit,
        }));
    this.now = options.now || Date.now;
  }

  configureRoom (room, roundNo) {
    const mode = chooseRoundMode(this.config, `${room?.instanceId || room?.id || ''}:${roundNo}`);
    room.botDecisionMode = mode;
    room.botStrategyVersion = strategyVersionForMode(mode, this.config.modelVersion);
    return mode;
  }

  async resolve (observation, options = {}) {
    const startedAt = this.now();
    const ruleAction = options.ruleAction || decideAction(observation, options.strategyOptions || {});
    if (!ruleAction) return null;
    if (observation.phase !== 'playing') return ruleResult(ruleAction);

    const decisionId = String(options.decisionId || '');
    const mode = options.mode || 'rule';
    if (mode === 'rule') return ruleResult(ruleAction, { decisionId });

    let context;
    try {
      const actions = options.actions || enumerateLegalActions(observation);
      context = buildDouZeroContext(observation, actions, { decisionId });
    } catch (err) {
      if (mode === 'shadow') {
        reportShadow(options, {
          agreed: null,
          reason: err.reason || 'douzero_invalid_context',
        });
      }
      return ruleResult(ruleAction, {
        requestedEngine: mode === 'shadow' ? 'douzero_shadow' : 'douzero',
        fallbackReason: err.reason || 'douzero_invalid_context',
        decisionId,
        totalDecisionMs: this.now() - startedAt,
      });
    }

    if (mode === 'shadow') {
      // Shadow traffic is disposable: even a synchronous deadline rejection
      // must stay outside the rule action's return path.
      void Promise.resolve()
        .then(() => this.request(context, options, this.shadowClient))
        .then(response => {
          const shadowAction = context.candidateMap.get(response.candidate_id);
          reportShadow(options, {
            agreed: sameAction(shadowAction, ruleAction),
            position: context.request.position,
            candidateCount: context.candidateCount,
            inferenceMs: Math.max(0, Number(response.inference_ms || 0)),
          });
        })
        .catch(err => {
          reportShadow(options, {
            agreed: null,
            position: context.request.position,
            candidateCount: context.candidateCount,
            reason: err.reason || 'douzero_unavailable',
          });
        });
      return ruleResult(ruleAction, {
        requestedEngine: 'douzero_shadow',
        decisionId,
        candidateCount: context.candidateCount,
        totalDecisionMs: this.now() - startedAt,
      });
    }

    if (context.candidateCount === 1) {
      const only = context.candidateMap.get(context.request.candidates[0].id);
      return ruleResult(only || ruleAction, {
        requestedEngine: 'douzero',
        fallbackReason: 'single_candidate',
        decisionId,
        candidateCount: 1,
        totalDecisionMs: this.now() - startedAt,
      });
    }

    try {
      const response = await this.request(context, options);
      if (response.decision_id !== decisionId) throw Object.assign(new Error('decision_id_mismatch'), { reason: 'douzero_stale_response' });
      const action = context.candidateMap.get(response.candidate_id);
      if (!action) throw Object.assign(new Error('unknown_candidate'), { reason: 'douzero_unknown_candidate' });
      return {
        ...action,
        meta: {
          requestedEngine: 'douzero',
          selectedEngine: 'douzero',
          fallbackReason: null,
          fallbackApplied: false,
          decisionId,
          candidateCount: context.candidateCount,
          inferenceMs: Math.max(0, Number(response.inference_ms || 0)),
          totalDecisionMs: Math.max(0, this.now() - startedAt),
          modelName: safeText(response.model?.name),
          modelVersion: safeText(response.model?.version),
          modelSha: safeText(response.model?.sha256, 128),
          strategyVersion: strategyVersionForMode('active', response.model?.version || this.config.modelVersion),
        },
      };
    } catch (err) {
      return ruleResult(ruleAction, {
        requestedEngine: 'douzero',
        fallbackReason: err.reason || 'douzero_unavailable',
        decisionId,
        candidateCount: context.candidateCount,
        totalDecisionMs: this.now() - startedAt,
      });
    }
  }

  request (context, options, client = this.client) {
    const remainingMs = Number(options.deadlineAt || 0) - this.now() - 500;
    if (Number(options.deadlineAt || 0) > 0 && remainingMs < 50) {
      throw Object.assign(new Error('decision_deadline_exceeded'), { reason: 'douzero_timeout' });
    }
    const timeoutMs = remainingMs > 0
      ? Math.min(this.config.timeoutMs, Math.max(50, remainingMs))
      : this.config.timeoutMs;
    return client.decidePlay(context.request, {
      timeoutMs,
      expectedDecisionId: context.request.decision_id,
      candidateIds: new Set(context.request.candidates.map(candidate => candidate.id)),
    });
  }
}

function createDecisionRouterFromEnv (env = process.env, options = {}) {
  return new DecisionRouter({
    // DouZero is the primary playing-phase policy. Any Sidecar startup,
    // readiness, timeout or response failure is handled by resolve() through
    // the existing rule-AI fallback instead of disabling the game server.
    mode: env.DDZ_DOUZERO_MODE || 'active',
    baseUrl: env.DDZ_DOUZERO_URL || 'http://douzero:2021',
    timeoutMs: env.DDZ_DOUZERO_TIMEOUT_MS || 800,
    trafficPercent: env.DDZ_DOUZERO_TRAFFIC_PERCENT || 100,
    shadowPercent: env.DDZ_DOUZERO_SHADOW_PERCENT || 0,
    modelVersion: env.DDZ_DOUZERO_MODEL_VERSION || 'douzero-wp',
    circuit: {
      windowSize: env.DDZ_DOUZERO_CIRCUIT_WINDOW || 20,
      cooldownMs: env.DDZ_DOUZERO_CIRCUIT_COOLDOWN_MS || 30000,
    },
    // Leave the fallback to DouZeroClient so the default has one source of truth.
    maxConcurrent: env.DDZ_DOUZERO_MAX_CONCURRENT,
    shadowMaxConcurrent: env.DDZ_DOUZERO_SHADOW_MAX_CONCURRENT || 2,
    ...options,
  });
}

module.exports = {
  DecisionRouter,
  createDecisionRouterFromEnv,
  normalizeMode,
  stableBucket,
  chooseRoundMode,
  strategyVersionForMode,
  sameAction,
  reportShadow,
};
