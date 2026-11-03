const {
  HAND_EVALUATOR_V1,
  HAND_EVALUATOR_LITE,
  HAND_POLICY_V1,
  HAND_POLICY_LITE,
} = require('./policies');

const MODES = new Set(['v1', 'lite']);

function normalizeHandStrengthMode (value) {
  const mode = String(value || 'lite').toLowerCase();
  return MODES.has(mode) ? mode : 'lite';
}

class HandStrengthRuntime {
  constructor (options = {}) {
    this.config = { mode: normalizeHandStrengthMode(options.mode) };
  }

  configureRoom (room) {
    const mode = this.config.mode;
    room.handStrengthMode = mode;
    room.handEvaluatorVersion = mode === 'v1' ? HAND_EVALUATOR_V1 : HAND_EVALUATOR_LITE;
    room.handPolicyVersion = mode === 'v1' ? HAND_POLICY_V1 : HAND_POLICY_LITE;
    return mode;
  }
}

function createHandStrengthRuntimeFromEnv (env = process.env, options = {}) {
  return new HandStrengthRuntime({
    mode: env.DDZ_HAND_STRENGTH_MODE || 'lite',
    ...options,
  });
}

module.exports = {
  HandStrengthRuntime,
  createHandStrengthRuntimeFromEnv,
  normalizeHandStrengthMode,
};
