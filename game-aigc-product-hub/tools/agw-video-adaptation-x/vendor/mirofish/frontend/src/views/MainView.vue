<template>
  <div class="main-view">
    <header class="app-header">
      <div class="header-left"><BrandMark @click="router.push('/')" /></div>
      <nav class="workspace-switcher" aria-label="制作工作区">
        <button v-for="item in workspaces" :key="item.id" :class="{ active: workspace === item.id }" @click="changeWorkspace(item.id)"><span>{{ item.index }}</span>{{ item.label }}</button>
      </nav>
      <div class="header-right">
        <div class="view-switcher"><button v-for="mode in viewModes" :key="mode.id" :class="{ active: viewMode === mode.id }" @click="viewMode = mode.id">{{ mode.label }}</button></div>
        <span class="status-indicator" :class="statusClass"><span class="dot"></span>{{ statusText }}</span>
      </div>
    </header>

    <div class="context-bar">
      <div class="project-context"><span>PROJECT</span><strong>{{ projectData?.name || '加载中…' }}</strong><code>{{ currentProjectId }}</code></div>
      <div class="graph-mode-switcher"><span class="mode-label">GRAPH VIEW</span><button v-for="mode in visibleGraphModes" :key="mode.id" :class="{ active: graphMode === mode.id }" @click="changeGraphMode(mode.id)">{{ mode.label }}</button></div>
    </div>

    <main class="content-area">
      <div class="panel-wrapper left" :style="leftPanelStyle"><GraphPanel :graphData="graphData" :loading="graphLoading" :currentPhase="2" @refresh="loadGraph" @toggle-maximize="toggleMaximize('graph')" /></div>
      <div class="panel-wrapper right" :style="rightPanelStyle">
        <ProductionWorkspacePanel :workspace="workspace" :projectData="projectData" :graphData="graphData" :systemLogs="systemLogs" :busy="actionBusy" @refresh="loadProject" @action="startProductionAction" />
      </div>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GraphPanel from '../components/GraphPanel.vue'
import ProductionWorkspacePanel from '../components/ProductionWorkspacePanel.vue'
import BrandMark from '../components/BrandMark.vue'
import { createDramaProject, createProductionAction, getDramaGraph, getDramaProject, getProductionAction, updateDramaProject } from '../api/drama'

const route = useRoute()
const router = useRouter()
const currentProjectId = ref(route.params.projectId)
const viewMode = ref('split')
const workspace = ref('story')
const graphMode = ref('story')
const graphLoading = ref(false)
const loading = ref(false)
const actionBusy = ref(false)
const error = ref('')
const projectData = ref(null)
const graphData = ref(null)
const systemLogs = ref([])
let actionPollTimer = null
let lastTaskMessage = ''

const workspaces = [
  { id: 'story', index: '01', label: '剧本', defaultGraph: 'story' },
  { id: 'characters', index: '02', label: '人物', defaultGraph: 'characters' },
  { id: 'video', index: '03', label: '镜头视频', defaultGraph: 'shots' },
  { id: 'assembly', index: '04', label: '游戏组装', defaultGraph: 'gameplay' },
  { id: 'release', index: '05', label: '构建发布', defaultGraph: 'gameplay' },
]
const graphModes = [
  { id: 'story', label: '章节与场景', workspaces: ['story', 'release'] },
  { id: 'branches', label: '分支剧本', workspaces: ['story'] },
  { id: 'characters', label: '人物关系', workspaces: ['story', 'characters'] },
  { id: 'gameplay', label: '玩法关系', workspaces: ['story', 'assembly', 'release'] },
  { id: 'shots', label: '镜头依赖', workspaces: ['video', 'release'] },
]
const viewModes = [{ id: 'graph', label: '图谱' }, { id: 'split', label: '分屏' }, { id: 'workbench', label: '工作台' }]
const actionLabels = {
  'story.parse': '拆解剧本', 'story.complete_branch': '补全分支', 'gameplay.extract': '提取玩法关系',
  'characters.generate_candidate': '生成人物候选', 'characters.check_consistency': '检查人物一致性',
  'video.plan_shots': '规划镜头', 'video.generate_batch': '生成镜头批次', 'video.review': '审片',
  'assembly.check': '检查玩法绑定', 'release.check': '执行发布检查',
}

const visibleGraphModes = computed(() => graphModes.filter(item => item.workspaces.includes(workspace.value)))
const statusClass = computed(() => error.value ? 'error' : loading.value || graphLoading.value || actionBusy.value ? 'processing' : 'completed')
const statusText = computed(() => error.value ? 'Error' : actionBusy.value ? 'Running' : loading.value || graphLoading.value ? 'Loading' : 'Ready')
const leftPanelStyle = computed(() => viewMode.value === 'graph' ? { width: '100%', opacity: 1, transform: 'translateX(0)' } : viewMode.value === 'workbench' ? { width: '0%', opacity: 0, transform: 'translateX(-20px)' } : { width: '50%', opacity: 1, transform: 'translateX(0)' })
const rightPanelStyle = computed(() => viewMode.value === 'workbench' ? { width: '100%', opacity: 1, transform: 'translateX(0)' } : viewMode.value === 'graph' ? { width: '0%', opacity: 0, transform: 'translateX(20px)' } : { width: '50%', opacity: 1, transform: 'translateX(0)' })

function addLog(message) {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  systemLogs.value.push({ time, msg: message })
  if (systemLogs.value.length > 100) systemLogs.value.shift()
}
function toggleMaximize(target) { viewMode.value = viewMode.value === target ? 'split' : target }
async function changeGraphMode(mode) {
  if (mode === graphMode.value) return
  graphMode.value = mode
  await loadGraph()
}
async function changeWorkspace(nextWorkspace) {
  if (workspace.value === nextWorkspace) return
  workspace.value = nextWorkspace
  const meta = workspaces.find(item => item.id === nextWorkspace)
  graphMode.value = meta?.defaultGraph || 'story'
  addLog(`切换工作区：${meta?.label || nextWorkspace}`)
  if (projectData.value) {
    try {
      const response = await updateDramaProject(currentProjectId.value, { current_workspace: nextWorkspace })
      projectData.value = response.data
    } catch (reason) { addLog(`工作区状态保存失败：${reason.message}`) }
  }
  await loadGraph()
}
async function loadGraph() {
  if (!currentProjectId.value || currentProjectId.value === 'new') return
  graphLoading.value = true
  error.value = ''
  try {
    const response = await getDramaGraph(currentProjectId.value, graphMode.value)
    graphData.value = response.data
    const label = graphModes.find(item => item.id === graphMode.value)?.label || graphMode.value
    addLog(`${label}已加载：${response.data.node_count} 节点 / ${response.data.edge_count} 关系`)
  } catch (reason) {
    error.value = reason.message
    addLog(`图谱加载失败：${reason.message}`)
  } finally { graphLoading.value = false }
}
async function loadProject() {
  loading.value = true
  error.value = ''
  try {
    if (currentProjectId.value === 'new') {
      const response = await createDramaProject({ name: '未命名剧游' })
      currentProjectId.value = response.data.project_id
      await router.replace({ name: 'Process', params: { projectId: currentProjectId.value } })
      projectData.value = response.data
      addLog(`剧游项目已创建：${currentProjectId.value}`)
    } else {
      const response = await getDramaProject(currentProjectId.value)
      projectData.value = response.data
      addLog(`剧游项目已恢复：${currentProjectId.value}`)
    }
    const savedWorkspace = workspaces.some(item => item.id === projectData.value?.current_workspace) ? projectData.value.current_workspace : 'story'
    workspace.value = savedWorkspace
    graphMode.value = workspaces.find(item => item.id === savedWorkspace)?.defaultGraph || 'story'
    await loadGraph()
  } catch (reason) {
    error.value = reason.message
    addLog(`项目加载失败：${reason.message}`)
  } finally { loading.value = false }
}
async function startProductionAction(payload) {
  if (!payload?.action || actionBusy.value) return
  actionBusy.value = true
  error.value = ''
  const label = actionLabels[payload.action] || payload.action
  try {
    const response = await createProductionAction(currentProjectId.value, payload)
    const taskId = response.data.task_id
    lastTaskMessage = ''
    addLog(`${label}已提交：${taskId}`)
    clearInterval(actionPollTimer)
    actionPollTimer = setInterval(async () => {
      try {
        const statusResponse = await getProductionAction(taskId)
        const task = statusResponse.data
        if (task.message && task.message !== lastTaskMessage) {
          addLog(`${label} · ${task.message}`)
          lastTaskMessage = task.message
        }
        if (['completed', 'failed'].includes(task.status)) {
          clearInterval(actionPollTimer)
          actionPollTimer = null
          actionBusy.value = false
          if (task.status === 'failed') {
            error.value = task.error || `${label}失败`
            addLog(`${label}失败：${task.error || '未知错误'}`)
          } else {
            addLog(`${label}完成，项目结构已刷新`)
            await loadProject()
          }
        }
      } catch (reason) {
        clearInterval(actionPollTimer)
        actionPollTimer = null
        actionBusy.value = false
        error.value = reason.message
        addLog(`生产动作状态读取失败：${reason.message}`)
      }
    }, 2000)
  } catch (reason) {
    actionBusy.value = false
    error.value = reason.message
    addLog(`${label}提交失败：${reason.message}`)
  }
}

watch(() => route.params.projectId, value => {
  if (value && value !== currentProjectId.value) { currentProjectId.value = value; loadProject() }
})
onMounted(loadProject)
onUnmounted(() => { if (actionPollTimer) clearInterval(actionPollTimer) })
</script>

<style scoped>
.main-view{height:100vh;display:flex;flex-direction:column;background:#FFF;overflow:hidden;font-family:'Space Grotesk','Noto Sans SC',system-ui,sans-serif}.app-header{height:64px;border-bottom:1px solid #EAEAEA;display:grid;grid-template-columns:210px minmax(500px,1fr) auto;align-items:center;padding:0 22px;background:#FFF;z-index:100;position:relative}.header-left{min-width:0}.workspace-switcher{height:100%;display:flex;align-items:stretch;justify-content:center;gap:4px}.workspace-switcher button{position:relative;border:0;background:transparent;padding:0 16px;color:#777;font-size:12px;font-weight:650;cursor:pointer;white-space:nowrap}.workspace-switcher button span{margin-right:6px;font:600 8px 'JetBrains Mono',monospace;color:#BBB}.workspace-switcher button::after{content:'';position:absolute;left:14px;right:14px;bottom:-1px;height:2px;background:transparent}.workspace-switcher button:hover,.workspace-switcher button.active{color:#111}.workspace-switcher button.active span{color:#FF5722}.workspace-switcher button.active::after{background:#FF5722}.header-right{display:flex;align-items:center;gap:15px}.view-switcher,.graph-mode-switcher{display:flex;align-items:center;background:#F5F5F5;padding:4px;border-radius:6px;gap:3px}.view-switcher button,.graph-mode-switcher button{border:none;background:transparent;padding:6px 11px;font-size:10px;font-weight:650;color:#777;border-radius:4px;cursor:pointer;white-space:nowrap}.view-switcher button.active,.graph-mode-switcher button.active{background:#FFF;color:#111;box-shadow:0 2px 5px rgba(0,0,0,.06)}.status-indicator{display:flex;align-items:center;gap:7px;min-width:62px;font:600 10px 'JetBrains Mono',monospace;color:#777}.dot{width:7px;height:7px;border-radius:50%;background:#CCC}.status-indicator.processing .dot{background:#FF5722;animation:pulse 1s infinite}.status-indicator.completed .dot{background:#4CAF50}.status-indicator.error .dot{background:#F44336}@keyframes pulse{50%{opacity:.4}}.context-bar{height:42px;display:flex;align-items:center;justify-content:space-between;padding:0 24px;border-bottom:1px solid #EAEAEA;background:#FCFCFC}.project-context{display:flex;align-items:center;gap:9px;min-width:0}.project-context>span,.mode-label{font:700 8px 'JetBrains Mono',monospace;letter-spacing:.12em;color:#BBB}.project-context strong{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.project-context code{font-size:8px;color:#AAA}.graph-mode-switcher{padding:3px}.graph-mode-switcher .mode-label{padding:0 7px}.graph-mode-switcher button{padding:5px 10px}.content-area{flex:1;display:flex;position:relative;overflow:hidden}.panel-wrapper{height:100%;overflow:hidden;transition:width .35s cubic-bezier(.25,.8,.25,1),opacity .25s ease,transform .25s ease;will-change:width,opacity,transform}.panel-wrapper.left{border-right:1px solid #EAEAEA}@media(max-width:1300px){.app-header{grid-template-columns:170px 1fr auto;padding:0 16px}.workspace-switcher button{padding:0 10px}.workspace-switcher button span{display:none}.project-context code{display:none}}@media(max-width:980px){.app-header{grid-template-columns:auto 1fr}.workspace-switcher{position:absolute;top:64px;left:0;right:0;height:42px;background:#FFF;border-bottom:1px solid #EAEAEA;z-index:20}.header-right{justify-self:end}.context-bar{margin-top:42px}.view-switcher{display:none}.content-area{flex-direction:column}.panel-wrapper.left,.panel-wrapper.right{width:100%!important;height:50%;opacity:1!important;transform:none!important}.panel-wrapper.left{border-right:0;border-bottom:1px solid #EAEAEA}}@media(max-width:640px){.status-indicator{display:none}.workspace-switcher button{font-size:10px;padding:0 7px}.project-context>span{display:none}.graph-mode-switcher .mode-label{display:none}.graph-mode-switcher button{padding:5px 7px;font-size:9px}}
</style>
