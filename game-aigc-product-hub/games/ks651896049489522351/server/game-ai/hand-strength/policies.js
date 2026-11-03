const HAND_EVALUATOR_V1 = 'hand-strength-v1';
const HAND_EVALUATOR_LITE = 'hand-strength-lite';
const HAND_POLICY_V1 = 'bid-double-policy-v1';
const HAND_POLICY_LITE = 'bid-double-policy-lite';

const V1_THRESHOLDS = Object.freeze({
  calling: 0.38,
  robbing: 0.55,
  final_confirm: 0.48,
  landlordDouble: 0.60,
  landlordSuperDouble: 0.78,
  farmerDouble: 0.62,
  farmerSuperDouble: 0.80,
});

const LITE_THRESHOLDS = Object.freeze({
  calling: 0.52,
  robbing: 0.64,
  final_confirm: 0.58,
  landlordDouble: 0.68,
  landlordSuperDouble: 0.82,
  farmerDouble: 0.70,
  farmerSuperDouble: 0.84,
});

module.exports = {
  HAND_EVALUATOR_V1,
  HAND_EVALUATOR_LITE,
  HAND_POLICY_V1,
  HAND_POLICY_LITE,
  V1_THRESHOLDS,
  LITE_THRESHOLDS,
};
