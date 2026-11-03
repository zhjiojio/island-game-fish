import capitalDealVideo from '../assets/video/capital-deal.mp4'
import jadeDistanceVideo from '../assets/video/jade-distance.mp4'
import jadeTrustVideo from '../assets/video/jade-trust.mp4'
import labEvidenceVideo from '../assets/video/lab-evidence.mp4'
import launchAttackVideo from '../assets/video/launch-attack.mp4'
import launchStageVideo from '../assets/video/launch-stage.mp4'
import protectionContractVideo from '../assets/video/protection-contract.mp4'
import weddingCrisisVideo from '../assets/video/wedding-crisis.mp4'
import capitalDealPoster from '../assets/stills/capital-deal.jpg'
import endingCrownAlone from '../assets/stills/ending-crown-alone.jpg'
import endingTogether from '../assets/stills/ending-together.jpg'
import endingUnfinished from '../assets/stills/ending-unfinished.jpg'
import jadeDistancePoster from '../assets/stills/jade-distance.jpg'
import jadeTrustPoster from '../assets/stills/jade-trust.jpg'
import labEvidencePoster from '../assets/stills/lab-evidence.jpg'
import launchAttackPoster from '../assets/stills/launch-attack.jpg'
import launchStagePoster from '../assets/stills/launch-stage.jpg'
import protectionContractPoster from '../assets/stills/protection-contract.jpg'
import warehousePriority from '../assets/stills/warehouse-priority.jpg'
import weddingCrisisPoster from '../assets/stills/wedding-crisis.jpg'
import type { StoryGraph } from './types'

export const story: StoryGraph = {
  startNodeId: 'protection-contract',
  initialStats: { trust: 0, evidence: 0, control: 0 },
  endings: [
    'ending-together',
    'ending-crown-alone',
    'ending-unfinished',
  ],
  nodes: {
    'protection-contract': {
      id: 'protection-contract',
      title: '保护契约',
      chapter: '第一幕 · 契约与试探',
      media: {
        kind: 'video',
        src: protectionContractVideo,
        poster: protectionContractPoster,
      },
      dialogue: [
        '苏念卿刚接手龙芯项目，董事会却给她安排了一名来历不明的贴身保镖。',
        '危险已经逼近。她必须决定，是否把自己的安全交给这个陌生强者。',
      ],
      choices: [
        {
          id: 'accept-protection',
          label: '接受贴身保护',
          hint: '交付一部分信任，让他进入你的安全边界。',
          nextNodeId: 'warehouse-priority',
          statDelta: { trust: 1 },
          setFlags: ['accepted-protection'],
        },
        {
          id: 'keep-command',
          label: '安全必须由我掌控',
          hint: '保留决策权，但他会感受到你的戒备。',
          nextNodeId: 'jade-independent',
          statDelta: { trust: -1, control: 1 },
          setFlags: ['kept-distance'],
        },
      ],
    },
    'warehouse-priority': {
      id: 'warehouse-priority',
      title: '仓库里的两秒钟',
      chapter: '第一幕 · 契约与试探',
      media: { kind: 'still', src: warehousePriority },
      dialogue: [
        '他已经挡住第一轮围攻，但受伤的人质与持枪者分处两个方向。',
        '你只有两秒钟下令，这会定义你们此后的协作方式。',
      ],
      choices: [
        {
          id: 'save-the-injured',
          label: '先救受伤者',
          hint: '把人的安全放在胜负之前。',
          nextNodeId: 'jade-guarded',
          statDelta: { trust: 1 },
          setFlags: ['people-first'],
        },
        {
          id: 'secure-the-scene',
          label: '先制服持枪者',
          hint: '控制威胁，避免局势再次失控。',
          nextNodeId: 'jade-guarded',
          statDelta: { control: 1 },
          setFlags: ['scene-secured'],
        },
      ],
    },
    'jade-guarded': {
      id: 'jade-guarded',
      title: '他替你挡下第一击',
      chapter: '第一幕 · 契约与试探',
      media: { kind: 'video', src: jadeTrustVideo, poster: jadeTrustPoster },
      dialogue: [
        '仓库围攻中，他没有等待命令，先一步挡在你与枪口之间。',
        '晚餐时，一枚龙凤玉佩牵出二十年前的旧事。',
      ],
      choices: [
        {
          id: 'ask-the-past',
          label: '追问我们是否早就见过',
          hint: '冒险靠近真相，也靠近他。',
          nextNodeId: 'lab-truth',
          statDelta: { trust: 1, evidence: 1 },
          setFlags: ['identity-questioned'],
        },
        {
          id: 'defer-the-past',
          label: '先谈公司，不谈过去',
          hint: '把情绪留到危机之后。',
          nextNodeId: 'lab-business',
          statDelta: { control: 1 },
          setFlags: ['identity-deferred'],
        },
      ],
    },
    'jade-independent': {
      id: 'jade-independent',
      title: '你守住了命令权',
      chapter: '第一幕 · 契约与试探',
      media: {
        kind: 'video',
        src: jadeDistanceVideo,
        poster: jadeDistancePoster,
      },
      dialogue: [
        '你在公开挑衅中维持了公司的体面，也让保镖明白谁才是最终决策者。',
        '晚餐时，一枚龙凤玉佩仍让你想起二十年前。',
      ],
      choices: [
        {
          id: 'ask-the-past',
          label: '追问我们是否早就见过',
          hint: '放下一次戒备，换取身份线索。',
          nextNodeId: 'lab-truth',
          statDelta: { trust: 1, evidence: 1 },
          setFlags: ['identity-questioned'],
        },
        {
          id: 'defer-the-past',
          label: '先谈公司，不谈过去',
          hint: '继续把公司控制权放在第一位。',
          nextNodeId: 'lab-business',
          statDelta: { control: 1 },
          setFlags: ['identity-deferred'],
        },
      ],
    },
    'lab-truth': {
      id: 'lab-truth',
      title: '旧火重燃',
      chapter: '第二幕 · 项目与真相',
      media: {
        kind: 'video',
        src: labEvidenceVideo,
        poster: labEvidencePoster,
      },
      dialogue: [
        '他承认自己的过去与那场实验室大火有关。',
        '残存服务器可能保存纵火与专利掠夺的证据，但发布会窗口正在关闭。',
      ],
      choices: [
        {
          id: 'secure-evidence',
          label: '留下取证',
          hint: '真相会成为武器，公司却可能错失窗口。',
          nextNodeId: 'launch-evidence',
          statDelta: { evidence: 1, control: -1 },
          setFlags: ['evidence-secured'],
        },
        {
          id: 'protect-launch',
          label: '立刻赶回公司',
          hint: '守住龙芯发布，放弃眼前证据。',
          nextNodeId: 'launch-control',
          statDelta: { control: 1, evidence: -1 },
          setFlags: ['launch-secured'],
        },
      ],
    },
    'lab-business': {
      id: 'lab-business',
      title: '资本的条件',
      chapter: '第二幕 · 项目与真相',
      media: { kind: 'video', src: capitalDealVideo, poster: capitalDealPoster },
      dialogue: [
        '资本方要求分走一半芯片利益，同时有人试图把旧火灾永远定性为意外。',
        '你只有一个行动窗口：追证，或保住即将开始的发布会。',
      ],
      choices: [
        {
          id: 'secure-evidence',
          label: '拒绝交易，留下取证',
          hint: '公司承压，但你可能拿到幕后证据。',
          nextNodeId: 'launch-evidence',
          statDelta: { evidence: 1, control: -1 },
          setFlags: ['evidence-secured'],
        },
        {
          id: 'protect-launch',
          label: '先稳住发布会',
          hint: '扩大你的掌控力，证据却会消失。',
          nextNodeId: 'launch-control',
          statDelta: { control: 1, evidence: -1 },
          setFlags: ['launch-secured'],
        },
      ],
    },
    'launch-evidence': {
      id: 'launch-evidence',
      title: '带着证据登台',
      chapter: '第二幕 · 项目与真相',
      media: {
        kind: 'video',
        src: launchAttackVideo,
        poster: launchAttackPoster,
      },
      dialogue: [
        '你赶到发布会时，袭击者已经启动引爆器。证据在手，但现场每个人都可能成为代价。',
        '直播镜头仍对准舞台。',
      ],
      choices: [
        {
          id: 'keep-broadcasting',
          label: '维持直播，公开证据',
          hint: '让全世界看见真相，也让所有人暴露在风险中。',
          nextNodeId: 'wedding-crisis',
          statDelta: { control: 1 },
          setFlags: ['truth-broadcast'],
        },
        {
          id: 'evacuate-everyone',
          label: '切断直播，立即疏散',
          hint: '优先保护现场，让公司承担舆论损失。',
          nextNodeId: 'wedding-crisis',
          statDelta: { trust: 1, control: -1 },
          setFlags: ['people-protected'],
        },
      ],
    },
    'launch-control': {
      id: 'launch-control',
      title: '龙芯必须如期发布',
      chapter: '第二幕 · 项目与真相',
      media: {
        kind: 'video',
        src: launchStageVideo,
        poster: launchStagePoster,
      },
      dialogue: [
        '第二代龙芯如期亮相，你重新握住公司节奏，袭击警报却在舞台后方亮起。',
        '直播成功和现场安全只能先保一个。',
      ],
      choices: [
        {
          id: 'keep-broadcasting',
          label: '维持直播，稳住市场',
          hint: '巩固公司控制权，让保镖独自处理危险。',
          nextNodeId: 'wedding-crisis',
          statDelta: { control: 1, trust: -1 },
          setFlags: ['market-protected'],
        },
        {
          id: 'evacuate-everyone',
          label: '停止发布，立即疏散',
          hint: '保护现场，也承认你需要他的判断。',
          nextNodeId: 'wedding-crisis',
          statDelta: { trust: 1, control: -1 },
          setFlags: ['people-protected'],
        },
      ],
    },
    'wedding-crisis': {
      id: 'wedding-crisis',
      title: '婚礼前的最后警报',
      chapter: '第三幕 · 婚礼与终局',
      media: {
        kind: 'video',
        src: weddingCrisisVideo,
        poster: weddingCrisisPoster,
      },
      dialogue: [
        '婚礼系统被幕后黑客接管。屏幕上同时出现龙芯数据外泄和宾客锁定警报。',
        '你现在拥有的信任、证据与权力，决定哪些反击方式真正可用。',
      ],
      choices: [
        {
          id: 'fight-together',
          label: '公开战神身份，并肩破局',
          hint: '让证据、技术与他的力量同时走到台前。',
          ending: 'ending-together',
          requiresFlags: [
            'accepted-protection',
            'identity-questioned',
            'evidence-secured',
          ],
          blockedHint:
            '需要在保护契约、玉佩旧事和实验室取证中建立完整信任链。',
        },
        {
          id: 'hold-the-crown',
          label: '封锁系统，独自守住苏氏',
          hint: '用你积累的控制权保住龙芯，不再把命运交给任何人。',
          ending: 'ending-crown-alone',
          requiresStats: { control: 2 },
          blockedHint: '公司控制权不足，无法在没有盟友的情况下封锁系统。',
        },
        {
          id: 'survive-the-night',
          label: '先带所有人活过今夜',
          hint: '放弃彻底清算，保存力量面对下一次威胁。',
          ending: 'ending-unfinished',
        },
      ],
    },
    'ending-together': {
      id: 'ending-together',
      title: '并肩破局',
      chapter: '真结局',
      media: { kind: 'still', src: endingTogether },
      dialogue: [
        '你公开全部证据，他公开战神身份。黑客的远程控制被反向锁定，龙芯与婚礼都不再是诱饵。',
        '这一次，你们不是保护者与被保护者，而是共同决定命运的人。',
      ],
      ending: {
        id: 'ending-together',
        title: '并肩破局',
        summary: '信任让秘密可以共享，证据让力量不必只靠暴力。',
      },
    },
    'ending-crown-alone': {
      id: 'ending-crown-alone',
      title: '王座独行',
      chapter: '守业结局',
      media: { kind: 'still', src: endingCrownAlone },
      dialogue: [
        '你切断系统、冻结权限，苏氏与龙芯毫发无损。',
        '他在警报解除后离开。你守住了所有权力，却没有留下那个愿意替你挡下第一击的人。',
      ],
      ending: {
        id: 'ending-crown-alone',
        title: '王座独行',
        summary: '你赢下公司，也承担了把所有人挡在边界之外的代价。',
      },
    },
    'ending-unfinished': {
      id: 'ending-unfinished',
      title: '未完之劫',
      chapter: '劫后结局',
      media: { kind: 'still', src: endingUnfinished },
      dialogue: [
        '宾客安全撤离，婚礼和龙芯数据却都留下缺口。',
        '海外控制室里，女性黑客关闭了一个窗口，又打开了下一个计划。',
      ],
      ending: {
        id: 'ending-unfinished',
        title: '未完之劫',
        summary: '你活过今夜，但没有足够筹码结束这场劫。',
      },
    },
  },
}
