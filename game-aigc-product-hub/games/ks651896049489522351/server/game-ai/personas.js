const PERSONAS = Object.freeze({
  aggressive: Object.freeze({
    id: 'aggressive',
    bidAggression: 0.76,
    riskPreference: 0.78,
    cooperatePreference: 0.55,
    powerPlayPreference: 0.76,
    thinkSpeed: 0.82,
    skillLevel: 0.72,
    baseMistakeRate: 0.05,
  }),
  balanced: Object.freeze({
    id: 'balanced',
    bidAggression: 0.56,
    riskPreference: 0.52,
    cooperatePreference: 0.82,
    powerPlayPreference: 0.58,
    thinkSpeed: 1,
    skillLevel: 0.78,
    baseMistakeRate: 0.04,
  }),
  cautious: Object.freeze({
    id: 'cautious',
    bidAggression: 0.36,
    riskPreference: 0.3,
    cooperatePreference: 0.88,
    powerPlayPreference: 0.36,
    thinkSpeed: 1.18,
    skillLevel: 0.76,
    baseMistakeRate: 0.045,
  }),
});

const CONTROLLER_PROFILES = Object.freeze({
  bot_solo_fill: Object.freeze({ id: 'bot_solo_fill', skillModifier: -0.12, mistakeModifier: 0.01, allowMistakes: true }),
  bot_duo_fill: Object.freeze({ id: 'bot_duo_fill', skillModifier: 0, mistakeModifier: 0, allowMistakes: true }),
  managed: Object.freeze({ id: 'managed', skillModifier: 0.04, mistakeModifier: -0.04, allowMistakes: false }),
  timeout: Object.freeze({ id: 'timeout', skillModifier: -0.04, mistakeModifier: -0.04, allowMistakes: false }),
  hint: Object.freeze({ id: 'hint', skillModifier: 0.12, mistakeModifier: -0.04, allowMistakes: false }),
});

function getPersona (id) {
  return PERSONAS[id] || PERSONAS.balanced;
}

function getControllerProfile (id) {
  return CONTROLLER_PROFILES[id] || CONTROLLER_PROFILES.timeout;
}

function pickPersona (rng = Math.random, excludedIds = []) {
  const available = Object.values(PERSONAS).filter(persona => !excludedIds.includes(persona.id));
  const pool = available.length ? available : Object.values(PERSONAS);
  return pool[Math.floor(Math.max(0, Math.min(0.999999, rng())) * pool.length)];
}

module.exports = { PERSONAS, CONTROLLER_PROFILES, getPersona, getControllerProfile, pickPersona };
