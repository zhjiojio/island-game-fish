<template>
  <section class="project-library">
    <header class="library-header">
      <div><p>PROJECT LIBRARY</p><h2>最近的剧游项目</h2></div>
      <button @click="loadProjects">刷新</button>
    </header>
    <div v-if="loading" class="library-state">正在读取项目…</div>
    <div v-else-if="!projects.length" class="library-state">还没有项目。从上方输入一个故事开始。</div>
    <div v-else class="project-grid">
      <article v-for="project in projects" :key="project.project_id" class="project-card" @click="openProject(project)">
        <div class="card-top"><span>{{ workspaceName(project.current_workspace) }}</span><time>{{ formatDate(project.updated_at) }}</time></div>
        <h3>{{ project.name }}</h3>
        <p>{{ project.requirement || '继续完善这个互动剧游的结构、资产与玩法。' }}</p>
        <div class="card-stats"><span>{{ project.chapters?.length || 0 }} 章</span><span>{{ project.characters?.length || 0 }} 人物</span><span>{{ project.shots?.length || 0 }} 镜头</span><strong>打开工作台 →</strong></div>
      </article>
    </div>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { listDramaProjects } from '../api/drama'

const router = useRouter()
const projects = ref([])
const loading = ref(false)

async function loadProjects() {
  loading.value = true
  try {
    const response = await listDramaProjects()
    projects.value = response.data || []
  } finally { loading.value = false }
}
function openProject(project) { router.push({ name: 'Process', params: { projectId: project.project_id } }) }
function workspaceName(value) {
  return { story: '剧本', characters: '人物', video: '镜头视频', assembly: '游戏组装', release: '构建发布' }[value] || '剧本'
}
function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}
onMounted(loadProjects)
</script>

<style scoped>
.project-library{margin-top:70px;padding-top:36px;border-top:1px solid #E5E5E5}.library-header{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:22px}.library-header p{margin:0 0 8px;font:700 10px 'JetBrains Mono',monospace;letter-spacing:.15em;color:#FF4500}.library-header h2{margin:0;font-size:24px}.library-header button{border:0;background:transparent;text-decoration:underline;color:#777;cursor:pointer}.project-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.project-card{padding:20px;border:1px solid #E5E5E5;cursor:pointer;transition:.2s background,.2s border-color}.project-card:hover{background:#FAFAFA;border-color:#111}.card-top,.card-stats{display:flex;align-items:center;gap:12px}.card-top{justify-content:space-between;font:600 9px 'JetBrains Mono',monospace;color:#999}.card-top>span{color:#FF4500}.project-card h3{margin:18px 0 8px;font-size:16px}.project-card p{min-height:38px;margin:0;color:#777;font-size:11px;line-height:1.6}.card-stats{margin-top:20px;padding-top:12px;border-top:1px solid #EEE;font:600 9px 'JetBrains Mono',monospace;color:#999}.card-stats strong{margin-left:auto;color:#111}.library-state{padding:36px;border:1px dashed #D5D5D5;color:#999;font-size:12px;text-align:center}@media(max-width:760px){.project-grid{grid-template-columns:1fr}}
</style>
