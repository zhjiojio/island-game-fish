<template>
  <section class="production-panel">
    <div class="panel-scroll">
      <header class="workspace-hero">
        <div>
          <p class="eyebrow">{{ workspaceMeta.kicker }}</p>
          <h1>{{ workspaceMeta.title }}</h1>
          <p class="hero-copy">{{ workspaceMeta.description }}</p>
        </div>
        <div class="workspace-index">{{ workspaceMeta.index }}</div>
      </header>

      <template v-if="workspace === 'story'">
        <div class="input-card">
          <div class="section-heading">
            <div><span class="section-no">01</span><h2>剧本入口</h2></div>
            <label class="file-button">导入文本<input type="file" accept=".txt,.md" @change="readScriptFile"></label>
          </div>
          <textarea v-model="scriptSource" rows="6" placeholder="粘贴故事梗概、完整剧本或新的章节内容。领域能力会把它拆成章节、场景、选择与稳定 ID。"></textarea>
          <div class="action-row">
            <button class="primary-action" :disabled="busy" @click="runAction('story.parse', scriptSource)">拆解剧本</button>
            <button class="secondary-action" :disabled="busy" @click="runAction('story.complete_branch', '检查现有场景与选择，补全断开的分支并保留稳定 ID。')">补全分支</button>
            <button class="secondary-action" :disabled="busy" @click="runAction('gameplay.extract', '从当前剧本提取玩家动词、规则、资源、状态、反馈以及它们与场景和选择的关系。')">提取玩法关系</button>
          </div>
          <p class="action-hint">所有操作直接修改结构化项目；结果会同步到左侧知识图谱。</p>
        </div>

        <StatsStrip :items="storyStats" />
        <section class="content-section">
          <div class="section-heading"><div><span class="section-no">02</span><h2>章节树</h2></div><span class="section-meta">{{ chapters.length }} CHAPTERS</span></div>
          <div class="chapter-list">
            <article v-for="chapter in chapters" :key="chapter.id" class="chapter-card">
              <div class="chapter-order">{{ String(chapter.order || 0).padStart(2, '0') }}</div>
              <div class="chapter-body"><h3>{{ chapter.name }}</h3><p>{{ chapter.summary || '等待补充章节摘要' }}</p></div>
              <div class="scene-count">{{ chapter.scene_ids?.length || 0 }} 场景</div>
            </article>
            <EmptyState v-if="!chapters.length" text="导入剧本后，章节会在这里形成可追踪的结构树。" />
          </div>
        </section>
      </template>

      <template v-else-if="workspace === 'characters'">
        <StatsStrip :items="characterStats" />
        <section class="content-section">
          <div class="section-heading">
            <div><span class="section-no">01</span><h2>人物素材库</h2></div>
            <div class="action-row compact">
              <button class="primary-action" :disabled="busy" @click="runAction('characters.generate_candidate', '为缺少视觉资产的人物生成候选设定；只生成候选，不替换已批准锚点。')">生成候选</button>
              <button class="secondary-action" :disabled="busy" @click="runAction('characters.check_consistency', '检查人物设定、造型版本、出场镜头与批准锚点的一致性。')">一致性检查</button>
            </div>
          </div>
          <div class="asset-grid">
            <article v-for="character in characters" :key="character.id" class="asset-card">
              <div class="asset-avatar">{{ character.name?.slice(0, 1) }}</div>
              <div class="asset-main"><div class="asset-title"><h3>{{ character.name }}</h3><span>{{ character.role || '未定义角色' }}</span></div><p>{{ character.summary || '等待补充人物设定' }}</p></div>
              <div class="asset-footer"><span>{{ character.look_versions?.length || 0 }} 个造型</span><span :class="['anchor-state', character.approved_anchor ? 'approved' : 'missing']">{{ character.approved_anchor ? 'ANCHOR READY' : '待确认锚点' }}</span></div>
            </article>
            <EmptyState v-if="!characters.length" text="剧本拆解后可在这里生成、复用和批准人物资产。" />
          </div>
        </section>
      </template>

      <template v-else-if="workspace === 'video'">
        <StatsStrip :items="videoStats" />
        <section class="content-section">
          <div class="section-heading">
            <div><span class="section-no">01</span><h2>镜头工坊</h2></div>
            <div class="action-row compact">
              <button class="secondary-action" :disabled="busy" @click="runAction('video.plan_shots', '把尚未覆盖的场景拆成镜头，并建立人物、媒体与镜头衔接依赖。')">规划镜头</button>
              <button class="primary-action" :disabled="busy" @click="runAction('video.generate_batch', '生成下一批已规划且依赖完整的镜头；涉及付费调用时先请求确认。')">生成下一批镜头</button>
              <button class="secondary-action" :disabled="busy" @click="runAction('video.review', '审查已生成媒体的时长、人物一致性、镜头衔接与可用状态。')">审片</button>
            </div>
          </div>
          <div class="shot-list">
            <article v-for="shot in shots" :key="shot.id" class="shot-card">
              <div class="shot-order">{{ String(shot.order || 0).padStart(2, '0') }}</div>
              <div class="shot-main"><h3>{{ shot.name }}</h3><p>{{ shot.purpose || shot.summary || '等待补充镜头意图' }}</p><div class="token-row"><span>{{ sceneName(shot.scene_id) }}</span><span>{{ shot.duration || '—' }}s</span><span>{{ shot.media_ids?.length || 0 }} MEDIA</span></div></div>
              <span :class="['status-chip', shotStatus(shot)]">{{ shotStatusLabel(shot) }}</span>
            </article>
            <EmptyState v-if="!shots.length" text="选择规划镜头，把场景转换为可生产、可审阅的镜头链。" />
          </div>
          <p class="cost-note">媒体生成是显式生产动作。付费调用、替换人物锚点或批量重做前会先确认。</p>
        </section>
      </template>

      <template v-else-if="workspace === 'assembly'">
        <StatsStrip :items="assemblyStats" />
        <section class="content-section">
          <div class="section-heading"><div><span class="section-no">01</span><h2>玩法与组件映射</h2></div><button class="primary-action" :disabled="busy" @click="runAction('assembly.check', '检查玩法节点、组件、状态、事件与剧本实体的绑定，列出不可试玩的阻塞项。')">检查玩法绑定</button></div>
          <div class="component-list">
            <article v-for="component in components" :key="component.id" class="component-card">
              <div><span class="component-kind">{{ component.kind || 'component' }}</span><h3>{{ component.name }}</h3></div>
              <div class="binding-meter"><strong>{{ component.bindings?.length || 0 }}</strong><span>绑定</span></div>
              <div class="token-row"><span v-for="event in (component.events || []).slice(0, 3)" :key="event">{{ event }}</span></div>
            </article>
            <EmptyState v-if="!components.length" text="玩法关系确认后，在这里共建 UI、玩法组件和稳定绑定。" />
          </div>
        </section>
      </template>

      <template v-else>
        <StatsStrip :items="releaseStats" />
        <section class="content-section release-section">
          <div class="section-heading"><div><span class="section-no">01</span><h2>发布检查</h2></div><button class="primary-action" :disabled="busy" @click="runAction('release.check', '执行本地构建前检查，核对结构、资产、组件绑定和阻塞任务；不要上传或发布。')">运行发布检查</button></div>
          <div class="release-grid">
            <article v-for="item in releaseChecks" :key="item.label" class="check-card"><span :class="['check-dot', item.ok ? 'ok' : 'warn']"></span><div><h3>{{ item.label }}</h3><p>{{ item.detail }}</p></div></article>
          </div>
          <div class="release-guard"><strong>发布保护</strong><p>构建、上传与公开发布彼此独立。检查动作不会上传文件，也不会替你发布。</p></div>
        </section>
      </template>

      <section class="activity-section">
        <div class="section-heading"><div><span class="section-no">LOG</span><h2>生产记录</h2></div><button class="text-action" @click="$emit('refresh')">刷新项目</button></div>
        <div class="activity-list">
          <div v-for="(log, index) in recentLogs" :key="index" class="activity-line"><time>{{ log.time }}</time><span>{{ log.msg }}</span></div>
          <div v-if="!recentLogs.length" class="activity-line muted"><time>--:--:--</time><span>等待领域操作</span></div>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup>
import { computed, defineComponent, h, ref } from 'vue'

const props = defineProps({
  workspace: { type: String, required: true },
  projectData: { type: Object, default: () => ({}) },
  graphData: { type: Object, default: () => ({}) },
  systemLogs: { type: Array, default: () => [] },
  busy: Boolean,
})
const emit = defineEmits(['action', 'refresh'])
const scriptSource = ref('')

const StatsStrip = defineComponent({
  props: { items: { type: Array, default: () => [] } },
  setup(childProps) {
    return () => h('div', { class: 'stats-strip' }, childProps.items.map(item => h('div', { class: 'stat-item' }, [h('strong', item.value), h('span', item.label)])))
  },
})
const EmptyState = defineComponent({
  props: { text: String },
  setup(childProps) { return () => h('div', { class: 'empty-state' }, [h('span', '＋'), h('p', childProps.text)]) },
})

const workspaceMeta = computed(() => ({
  story: { index: '01', kicker: 'STORY WORLD', title: '剧本世界', description: '从原始文本进入结构化创作，在同一套图谱中管理章节、分支、人物与玩法。' },
  characters: { index: '02', kicker: 'CHARACTER LIBRARY', title: '人物与视觉资产', description: '人物不是一次性出图结果，而是可复用、可共建、可审计的设定与素材集合。' },
  video: { index: '03', kicker: 'SHOT WORKSHOP', title: '镜头与视频生产', description: '把场景变成镜头链，让每个镜头都带着人物锚点、媒体依赖与审阅状态。' },
  assembly: { index: '04', kicker: 'GAME ASSEMBLY', title: '游戏组装', description: '将剧本拆出的玩法关系落成组件、状态、事件和可试玩的交互绑定。' },
  release: { index: '05', kicker: 'BUILD & RELEASE', title: '构建发布', description: '在真正构建与发布前集中处理缺失资产、断裂绑定和生产阻塞。' },
}[props.workspace]))

const chapters = computed(() => props.projectData?.chapters || [])
const characters = computed(() => props.projectData?.characters || [])
const shots = computed(() => props.projectData?.shots || [])
const media = computed(() => props.projectData?.media || [])
const components = computed(() => props.projectData?.components || [])
const tasks = computed(() => props.projectData?.tasks || [])
const approvedMedia = computed(() => media.value.filter(item => item.status === 'approved').length)
const approvedAnchors = computed(() => characters.value.filter(item => item.approved_anchor || item.anchor?.status === 'approved').length)
const blockerCount = computed(() => tasks.value.filter(item => item.status === 'blocked').length)
const bindingCount = computed(() => components.value.reduce((total, item) => total + (item.bindings?.length || 0), 0))
const gameplayCount = computed(() => props.projectData?.gameplay_nodes?.length || components.value.filter(item => item.kind === 'gameplay').length)
const recentLogs = computed(() => props.systemLogs.slice(-8).reverse())

const storyStats = computed(() => [
  { value: chapters.value.length, label: 'CHAPTERS' },
  { value: props.projectData?.scenes?.length || 0, label: 'SCENES' },
  { value: props.projectData?.choices?.length || 0, label: 'CHOICES' },
  { value: gameplayCount.value, label: 'GAMEPLAY' },
])
const characterStats = computed(() => [
  { value: characters.value.length, label: 'CHARACTERS' },
  { value: approvedAnchors.value, label: 'ANCHORS' },
  { value: characters.value.reduce((sum, item) => sum + (item.look_versions?.length || item.candidates?.length || 0), 0), label: 'LOOKS' },
  { value: props.projectData?.relationships?.length || 0, label: 'RELATIONS' },
])
const videoStats = computed(() => [
  { value: shots.value.length, label: 'SHOTS' },
  { value: media.value.length, label: 'MEDIA' },
  { value: approvedMedia.value, label: 'APPROVED' },
  { value: props.graphData?.edge_count || 0, label: 'DEPENDENCIES' },
])
const assemblyStats = computed(() => [
  { value: gameplayCount.value, label: 'MECHANICS' },
  { value: components.value.length, label: 'COMPONENTS' },
  { value: bindingCount.value, label: 'BINDINGS' },
  { value: blockerCount.value, label: 'BLOCKERS' },
])
const releaseStats = computed(() => [
  { value: tasks.value.filter(item => item.status === 'completed').length, label: 'DONE' },
  { value: blockerCount.value, label: 'BLOCKERS' },
  { value: approvedMedia.value, label: 'MEDIA READY' },
  { value: components.value.length, label: 'COMPONENTS' },
])
const releaseChecks = computed(() => [
  { label: '剧本结构', ok: chapters.value.length > 0 && (props.projectData?.scenes?.length || 0) > 0, detail: `${chapters.value.length} 章 / ${props.projectData?.scenes?.length || 0} 场` },
  { label: '人物与媒体', ok: characters.value.length > 0 && media.value.length > 0, detail: `${characters.value.length} 人 / ${approvedMedia.value} 个已批准媒体` },
  { label: '玩法绑定', ok: components.value.length > 0 && bindingCount.value > 0, detail: `${components.value.length} 组件 / ${bindingCount.value} 绑定` },
  { label: '阻塞任务', ok: blockerCount.value === 0, detail: blockerCount.value ? `${blockerCount.value} 项需要处理` : '没有阻塞项' },
])

function runAction(action, instruction) {
  emit('action', { action, instruction: instruction?.trim() || undefined })
}
function sceneName(sceneId) {
  return props.projectData?.scenes?.find(item => item.id === sceneId)?.name || sceneId || '未绑定场景'
}
function shotStatus(shot) {
  const related = media.value.filter(item => shot.media_ids?.includes(item.id))
  if (!related.length) return 'planned'
  return related.every(item => item.status === 'approved') ? 'approved' : 'review'
}
function shotStatusLabel(shot) {
  return { planned: 'PLANNED', approved: 'APPROVED', review: 'REVIEW' }[shotStatus(shot)]
}
function readScriptFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => { scriptSource.value = String(reader.result || '') }
  reader.readAsText(file)
  event.target.value = ''
}
</script>

<style scoped>
.production-panel{height:100%;background:#FAFAFA;overflow:hidden;color:#111}.panel-scroll{height:100%;overflow-y:auto;padding:30px 32px 48px}.workspace-hero{display:flex;justify-content:space-between;gap:24px;padding:4px 0 28px;border-bottom:1px solid #E7E7E7}.eyebrow{margin:0 0 8px;font:700 10px/1 'JetBrains Mono',monospace;letter-spacing:.18em;color:#FF5722}.workspace-hero h1{margin:0;font-size:28px;letter-spacing:-.04em}.hero-copy{max-width:620px;margin:10px 0 0;color:#6A6A6A;font-size:12px;line-height:1.7}.workspace-index{font:700 44px/1 'JetBrains Mono',monospace;color:#E5E5E5}.input-card,.content-section,.activity-section{margin-top:22px;padding:22px;background:#FFF;border:1px solid #E7E7E7;border-radius:8px;box-shadow:0 3px 12px rgba(0,0,0,.025)}.section-heading{display:flex;justify-content:space-between;align-items:center;gap:18px;margin-bottom:16px}.section-heading>div:first-child{display:flex;align-items:center;gap:10px}.section-heading h2{margin:0;font-size:14px;letter-spacing:.02em}.section-no{font:700 11px/1 'JetBrains Mono',monospace;color:#FF5722}.section-meta{font:600 9px/1 'JetBrains Mono',monospace;color:#AAA;letter-spacing:.08em}.input-card textarea{box-sizing:border-box;width:100%;resize:vertical;border:1px solid #DDD;border-radius:5px;padding:13px 14px;background:#FCFCFC;color:#222;font:11px/1.7 'JetBrains Mono',monospace;outline:none}.input-card textarea:focus{border-color:#8E24AA;box-shadow:0 0 0 2px rgba(142,36,170,.08)}.file-button,.text-action{font-size:11px;color:#666;text-decoration:underline;cursor:pointer}.file-button input{display:none}.action-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.action-row.compact{margin:0;justify-content:flex-end}.primary-action,.secondary-action{min-height:36px;border-radius:4px;padding:0 14px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap}.primary-action{border:1px solid #111;background:#111;color:#FFF}.secondary-action{border:1px solid #D7D7D7;background:#FFF;color:#222}.primary-action:hover:not(:disabled){background:#FF5722;border-color:#FF5722}.secondary-action:hover:not(:disabled){border-color:#8E24AA;color:#8E24AA}.primary-action:disabled,.secondary-action:disabled{opacity:.45;cursor:wait}.action-hint,.cost-note{margin:10px 0 0;color:#999;font-size:10px}.stats-strip{display:grid;grid-template-columns:repeat(4,1fr);margin-top:22px;background:#FFF;border:1px solid #E7E7E7;border-radius:8px;overflow:hidden}.stat-item{padding:18px;text-align:center;border-right:1px solid #EEE}.stat-item:last-child{border:0}.stat-item strong{display:block;font:700 22px/1 'JetBrains Mono',monospace}.stat-item span{display:block;margin-top:7px;font:600 9px/1 'JetBrains Mono',monospace;color:#999}.chapter-list,.shot-list,.component-list{display:flex;flex-direction:column;gap:8px}.chapter-card,.shot-card,.component-card{display:flex;align-items:center;gap:14px;padding:14px;border:1px solid #ECECEC;border-radius:6px;background:#FFF}.chapter-order,.shot-order{font:700 20px/1 'JetBrains Mono',monospace;color:#D7D7D7;min-width:34px}.chapter-body,.shot-main{flex:1;min-width:0}.chapter-card h3,.shot-card h3,.component-card h3,.asset-card h3,.check-card h3{margin:0;font-size:12px}.chapter-card p,.shot-card p,.asset-card p,.check-card p{margin:5px 0 0;color:#777;font-size:10px;line-height:1.55}.scene-count{font:600 10px 'JetBrains Mono',monospace;color:#888}.asset-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.asset-card{display:grid;grid-template-columns:42px 1fr;gap:12px;padding:15px;border:1px solid #ECECEC;border-radius:6px}.asset-avatar{display:grid;place-items:center;width:42px;height:52px;background:#111;color:#FFF;font-size:18px;font-weight:800}.asset-title{display:flex;align-items:baseline;justify-content:space-between;gap:10px}.asset-title span{font-size:9px;color:#999}.asset-footer{grid-column:1/-1;display:flex;justify-content:space-between;border-top:1px solid #EEE;padding-top:10px;font:600 9px 'JetBrains Mono',monospace;color:#888}.anchor-state.approved{color:#2E7D32}.anchor-state.missing{color:#C46C1A}.token-row{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}.token-row span,.component-kind{padding:3px 6px;border-radius:3px;background:#F3F3F3;font:600 8px 'JetBrains Mono',monospace;color:#666}.status-chip{padding:5px 7px;border-radius:3px;font:700 8px 'JetBrains Mono',monospace}.status-chip.approved{background:#E8F5E9;color:#2E7D32}.status-chip.planned{background:#F3F3F3;color:#777}.status-chip.review{background:#FFF3E0;color:#B35C00}.component-card{display:grid;grid-template-columns:1fr auto;align-items:center}.component-kind{text-transform:uppercase;color:#8E24AA}.component-card h3{margin-top:7px}.binding-meter{text-align:right}.binding-meter strong{display:block;font:700 18px 'JetBrains Mono',monospace}.binding-meter span{font-size:9px;color:#999}.component-card .token-row{grid-column:1/-1}.release-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.check-card{display:flex;gap:10px;padding:14px;border:1px solid #ECECEC;border-radius:6px}.check-dot{width:9px;height:9px;border-radius:50%;margin-top:2px;flex:0 0 auto}.check-dot.ok{background:#4CAF50}.check-dot.warn{background:#FF9800}.release-guard{margin-top:14px;padding:14px;border-left:3px solid #111;background:#F6F6F6}.release-guard strong{font-size:11px}.release-guard p{margin:5px 0 0;color:#777;font-size:10px}.activity-section{box-shadow:none}.text-action{border:0;background:transparent}.activity-list{border-top:1px solid #EEE}.activity-line{display:grid;grid-template-columns:72px 1fr;gap:12px;padding:9px 0;border-bottom:1px solid #F2F2F2;font:10px/1.5 'JetBrains Mono',monospace}.activity-line time{color:#AAA}.activity-line span{color:#555}.activity-line.muted span{color:#AAA}.empty-state{grid-column:1/-1;display:flex;align-items:center;justify-content:center;gap:10px;min-height:90px;border:1px dashed #D8D8D8;color:#999;font-size:11px}.empty-state span{font-size:18px;color:#CCC}.empty-state p{margin:0}@media(max-width:1100px){.asset-grid,.release-grid{grid-template-columns:1fr}.section-heading{align-items:flex-start}.section-heading>.action-row{justify-content:flex-start}.stats-strip{grid-template-columns:repeat(2,1fr)}.stat-item:nth-child(2){border-right:0}.stat-item:nth-child(-n+2){border-bottom:1px solid #EEE}}@media(max-width:720px){.panel-scroll{padding:20px}.workspace-index{display:none}.section-heading{flex-direction:column}.asset-grid,.release-grid{grid-template-columns:1fr}}
</style>
