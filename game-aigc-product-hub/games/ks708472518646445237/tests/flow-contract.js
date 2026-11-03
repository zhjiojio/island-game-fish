// 关键剧情回归契约：防止人物、消费、转场和反馈再次错位。
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../package/js');
const engine = fs.readFileSync(path.join(root, 'tb-engine.js'), 'utf8');
const story = fs.readFileSync(path.join(root, 'tb-story.js'), 'utf8');
const render = fs.readFileSync(path.join(root, 'tb-render.js'), 'utf8');
const config = fs.readFileSync(path.join(root, 'tb-config.js'), 'utf8');

let failures = 0;
function check(value, message) {
  if (value) console.log('✅ ' + message);
  else { console.error('❌ ' + message); failures++; }
}

check(engine.includes('st.mediaDone&&st.voiceDone'), '无交互镜头同时等待视频与台词结束');
check(engine.includes('appliedEntryVotes: {}') && engine.includes('st.appliedEntryVotes = {}'), '重开后重新结算入场票数');
const shot10 = story.slice(story.indexOf("shot('shot-10'"), story.indexOf("shot('shot-11'"));
check(shot10.includes('previewMs: 6000') && !shot10.includes('sequence:'), '个人介绍改为短蒙太奇而非五段口型视频');
check((story.match(/私藏资料并 all in/g) || []).length === 4 && (story.match(/starCost: 5/g) || []).length === 4, '四位候选人的私藏资料都明确收费');
check(story.includes('videoBySupport'), '私藏资料只播放 all-in 候选人的视频');
check(engine.includes('OTHER_ROOM_MULT') && engine.includes('Model.spendStars(cost)'), '换装扣星且其他候选人房间有加价');
check(render.includes("slots=['accessory','clothes','prop']"), '换装预览同时展示饰品、服装、道具组合');
check(engine.includes("game: 'rival-surge'") && render.includes("fx.game==='rival-surge'"), '龙哥出手明确展示具体双方');
check(story.includes("为你 all in 的候选人选择对手") && story.includes('不能和自己猜拳') === false, '猜拳对象由 all-in 候选人决定');
check(render.includes('实时榜已更新'), '关键对抗明确提示实时榜变化');
check(engine.includes('previewWho===st.pending.who'), '异步换装图片只允许回填当前角色');
check(engine.includes('finishOutfitPreview') && engine.includes('outfitPreviewDone'), '最后一件换装先展示再进入下一镜');
check(engine.includes('responseAudio') && story.includes('responseAudio'), '选择完成后才播放对应角色反馈');
check(story.includes("type: 'outfit-hub'") && story.includes("type: 'outfit-dynamic'"), '换装改为主推角色必选、其他角色可选');
check(render.includes('组合定装照') && render.includes("revealSlots=['accessory','clothes','prop']"), '最终展示为饰品、服装、道具组合图');
check(story.includes('resultVideoBySupport') && engine.includes('playResultClip'), '截短的出场素材复用于小游戏结果');
check(story.includes("STAR_UNLOCK_COST") === false && engine.includes('OUTFIT_UNLOCK_COST'), '其他候选人化妆间按解锁付费');
check((story.match(/星河闪耀（100 星光）/g) || []).length >= 4 && (story.match(/霓虹烟花（20 星光）/g) || []).length >= 4, '四位候选人暖场选项规格一致');
check(story.includes("settle: 'support-first'") && story.includes('videoBySupport'), '第一名亮相锁定 all-in 候选人画面');
check(engine.includes('STAR_TICK_MS') && engine.includes('addPassiveStars'), '自然星光按独立节拍增长并受软上限约束');
check(config.includes('STAR_RATE: 20') && config.includes('STAR_TICK_MS: 3000'), '自然星光每 3 秒增加 20');
check(story.includes("shot('shot-12b'") && story.includes("label: '结算第一轮排名'"), '私密资料与第一名亮相之间有确认节点');
check((story.match(/host-dressing-room\.mp3/g)||[]).length === 1, '人靠衣服马靠鞍只播一次');
check(engine.includes('playOutfitPrompt') && story.includes('outfitPromptAudioByWho'), '换装偏好台词在选择前播放');
check(story.includes('startSec:6.5') && story.includes('startSec:11') && story.includes('startSec:15.5'), '三个小游戏平均使用未播放的出场视频片段');
check(engine.includes("action === 'game_continue'") && render.includes('回放结束'), '小游戏回放结束等待玩家确认继续');

process.exit(failures ? 1 : 0);
