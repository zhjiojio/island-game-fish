const crypto = require('crypto');
const { pickPersona } = require('../game-ai/personas');

const BOT_NAMES = [
  '清风徐来', '山河入梦', '今晚吃鱼', '牌桌小将', '微笑向暖', '橘子汽水',
  '星河漫游', '认真生活', '好运常在', '夏日微风', '简单快乐', '自在如风',
];
// bot 头像池：CDN 完整 URL（canvas 圆形裁剪 + WebGL 纹理需 ACAO:*，该域已支持）。
// 旧的相对路径 images/avatar-default-N.png 包内并无此文件，一直 404 回退名字首字。
const BOT_AVATAR_CDN = 'https://p1-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks651896049489522351/avatar';
const BOT_AVATARS = Array.from({ length: 10 }, (_, i) => `${BOT_AVATAR_CDN}/avatar-default-${i + 1}.png`);

function randomIndex (length, rng) {
  return Math.floor(Math.max(0, Math.min(0.999999, rng())) * length);
}

function displayedBalance (minimum, rng = Math.random) {
  const roll = rng();
  let multiplier;
  if (roll < 0.7) multiplier = 1 + rng() * 1.5;
  else if (roll < 0.95) multiplier = 2.5 + rng() * 3;
  else multiplier = 5.5 + rng() * 6;
  return Math.max(minimum, Math.round((minimum * multiplier) / 100) * 100);
}

function createBot (options = {}) {
  const rng = options.rng || Math.random;
  const usedNames = options.usedNames || [];
  const usedAvatars = options.usedAvatars || [];
  const names = BOT_NAMES.filter(name => !usedNames.includes(name));
  const avatars = BOT_AVATARS.filter(avatar => !usedAvatars.includes(avatar));
  const persona = pickPersona(rng, options.excludedPersonaIds || []);
  const id = `bot::${crypto.randomUUID()}`;
  return {
    id,
    accountId: id,
    name: (names.length ? names : BOT_NAMES)[randomIndex((names.length ? names : BOT_NAMES).length, rng)],
    avatarUrl: (avatars.length ? avatars : BOT_AVATARS)[randomIndex((avatars.length ? avatars : BOT_AVATARS).length, rng)],
    controllerType: 'bot',
    isBot: true,
    personaId: persona.id,
    connected: true,
    autoManaged: false,
    beans: displayedBalance(Number(options.minimumBeans || 1000), rng),
  };
}

module.exports = { BOT_NAMES, BOT_AVATARS, displayedBalance, createBot };
