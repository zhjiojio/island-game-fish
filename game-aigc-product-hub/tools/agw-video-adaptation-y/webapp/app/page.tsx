"use client";

import { useMemo, useState } from "react";

type WorkspaceId = "overview" | "story" | "characters" | "video" | "assembly" | "release" | "capability";
type StudioMode = "creation" | "capability";

const workspaces: { id: WorkspaceId; label: string; mark: string; note: string }[] = [
  { id: "overview", label: "项目总览", mark: "总", note: "下一步与进度" },
  { id: "story", label: "剧本", mark: "剧", note: "章节、场景与分支" },
  { id: "characters", label: "人物", mark: "人", note: "角色资产与一致性" },
  { id: "video", label: "视频", mark: "镜", note: "镜头生产与审片" },
  { id: "assembly", label: "游戏组装", mark: "组", note: "玩法、组件与体验" },
  { id: "release", label: "构建发布", mark: "发", note: "校验与快手小游戏" },
  { id: "capability", label: "能力共建台", mark: "研", note: "工具、组件与 Evals" },
];

const productionSteps = [
  { id: "story" as WorkspaceId, no: "01", title: "剧本", value: 82, status: "8 章 · 31 场", tone: "blue" },
  { id: "characters" as WorkspaceId, no: "02", title: "人物", value: 71, status: "6 / 8 已定稿", tone: "plum" },
  { id: "video" as WorkspaceId, no: "03", title: "视频", value: 54, status: "18 / 34 已审", tone: "ember" },
  { id: "assembly" as WorkspaceId, no: "04", title: "游戏组装", value: 38, status: "主循环搭建中", tone: "green" },
  { id: "release" as WorkspaceId, no: "05", title: "构建发布", value: 16, status: "3 项待处理", tone: "brass" },
];

const storyNodes = [
  { id: "S4-1", title: "婚书落案", meta: "剧情 · 42s", x: 8, y: 43, type: "start" },
  { id: "S4-2", title: "婉儿的试探", meta: "对话 · 36s", x: 30, y: 19, type: "scene" },
  { id: "S4-3", title: "傲天闯入", meta: "冲突 · 51s", x: 30, y: 66, type: "scene" },
  { id: "S4-C", title: "你相信谁？", meta: "选择 · 2 分支", x: 54, y: 43, type: "choice" },
  { id: "S4-4", title: "替她隐瞒", meta: "好感 +12", x: 76, y: 19, type: "scene" },
  { id: "S4-5", title: "当面对质", meta: "线索 +1", x: 76, y: 66, type: "scene" },
];

const frames = [
  { id: "E4S1", src: "/media/e4s1-first.jpg", title: "婚书落案", status: "已通过", time: "00:42" },
  { id: "E4S3", src: "/media/e4s3-first.jpg", title: "傲天闯入", status: "待审片", time: "00:51" },
  { id: "E4S4", src: "/media/e4s4-first.jpg", title: "替她隐瞒", status: "生成中", time: "00:38" },
  { id: "E4S6", src: "/media/e4s6-first.jpg", title: "当面对质", status: "待修改", time: "00:47" },
  { id: "E4S8", src: "/media/e4s8-first.jpg", title: "夜雨归人", status: "已通过", time: "00:34" },
];

const assistantCopy: Record<WorkspaceId, { kicker: string; title: string; body: string; action: string }> = {
  overview: { kicker: "制作建议 01", title: "先锁定婉儿的人物形象", body: "她出现在 14 个待生成镜头中。先通过人物一致性检查，可以减少后续约 6 次返工。", action: "去处理人物" },
  story: { kicker: "结构诊断", title: "第四章缺少回收点", body: "“婚书来源”线索在本章被提及 3 次，但没有形成奖励或反转。建议在 S4-5 增加线索回收。", action: "生成补写建议" },
  characters: { kicker: "一致性提醒", title: "婉儿侧脸偏差较高", body: "最近一批 12 张图中有 3 张发饰和脸型偏离基准。可用已发布能力批量修正。", action: "运行一致性修复" },
  video: { kicker: "审片聚焦", title: "有 2 个镜头影响主线", body: "E4S3 的口型与台词相差 8 帧，E4S6 的出场位置跨镜不连续。建议优先处理。", action: "只看问题镜头" },
  assembly: { kicker: "体验检查", title: "第一次选择出现偏晚", body: "当前玩家在 96 秒后才进行首次操作。建议把“相信谁”提前到开场 45 秒内。", action: "应用节奏建议" },
  release: { kicker: "发布检查", title: "还差 3 项即可构建", body: "存在 1 个未连接分支、1 个未压缩视频，以及小游戏首包超出目标 1.8MB。", action: "查看全部阻断项" },
  capability: { kicker: "共建动态", title: "v1.4 已通过离线评测", body: "人物侧脸一致性较 v1.3 提升 11.2%，等待 UI 验收交互参数后即可申请发布。", action: "打开评测报告" },
};

function IconArrow() { return <span aria-hidden="true">↗</span>; }

export default function Home() {
  const [studioMode, setStudioMode] = useState<StudioMode>("creation");
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>("overview");
  const [selectedNode, setSelectedNode] = useState("S4-C");
  const [selectedCharacter, setSelectedCharacter] = useState("wanr");
  const [frameStatus, setFrameStatus] = useState<Record<string, string>>({});
  const [previewChoice, setPreviewChoice] = useState("替她隐瞒");
  const [showBlockers, setShowBlockers] = useState(false);
  const current = studioMode === "capability" ? "capability" : activeWorkspace;
  const helper = assistantCopy[current];
  const navigate = (id: WorkspaceId) => {
    if (id === "capability") { setStudioMode("capability"); setActiveWorkspace("capability"); }
    else { setStudioMode("creation"); setActiveWorkspace(id); }
  };

  return (
    <main className="studio-shell">
      <header className="topbar">
        <button className="brand" onClick={() => navigate("overview")} aria-label="返回项目总览"><span className="brand-seal">幕</span><span><strong>幕间</strong><small>STUDIO</small></span></button>
        <div className="project-crumb"><span>项目</span><b>荒年记</b><i>短剧互动 · 第 4 章制作中</i></div>
        <div className="mode-switch" aria-label="工作台模式"><button className={studioMode === "creation" ? "active" : ""} onClick={() => { setStudioMode("creation"); setActiveWorkspace("overview"); }}>创作工作台</button><button className={studioMode === "capability" ? "active" : ""} onClick={() => navigate("capability")}>能力共建台</button></div>
        <div className="top-actions"><div className="avatars" aria-label="项目成员"><span>林</span><span>周</span><span>AI</span></div><button className="ghost-btn">预览</button><button className="primary-btn" onClick={() => navigate("release")}>构建发布 <IconArrow /></button></div>
      </header>

      <aside className="left-rail">
        <div className="rail-label">{studioMode === "creation" ? "制作流程" : "共建空间"}</div>
        <nav>{(studioMode === "creation" ? workspaces.slice(0, 6) : [workspaces[6]]).map((item) => <button key={item.id} className={current === item.id ? "active" : ""} onClick={() => navigate(item.id)}><span className="nav-mark">{item.mark}</span><span><b>{item.label}</b><small>{item.note}</small></span>{current === item.id && <i />}</button>)}</nav>
        {studioMode === "creation" && <div className="rail-secondary"><div className="rail-label">项目资源</div><button><span>库</span>素材库<em>128</em></button><button><span>记</span>生成记录</button><button><span>版</span>版本与审计</button></div>}
        <div className="rail-foot"><div className="storage-line"><span>项目用量</span><b>3.2 / 10 GB</b></div><div className="storage-track"><i /></div><button className="project-switch">荒年记 <span>⌄</span></button></div>
      </aside>

      <section className="workspace">
        {current === "overview" && <Overview onNavigate={navigate} />}
        {current === "story" && <Story selectedNode={selectedNode} setSelectedNode={setSelectedNode} />}
        {current === "characters" && <Characters selectedCharacter={selectedCharacter} setSelectedCharacter={setSelectedCharacter} />}
        {current === "video" && <Video frameStatus={frameStatus} setFrameStatus={setFrameStatus} />}
        {current === "assembly" && <Assembly previewChoice={previewChoice} setPreviewChoice={setPreviewChoice} />}
        {current === "release" && <Release showBlockers={showBlockers} setShowBlockers={setShowBlockers} />}
        {current === "capability" && <Capability />}
      </section>

      <aside className="assistant-rail">
        <div className="assistant-head"><span className="ai-orbit">✦</span><div><b>AI 制作助手</b><small>基于当前项目上下文</small></div><i className="online-dot" /></div>
        <div className="assistant-card"><small>{helper.kicker}</small><h3>{helper.title}</h3><p>{helper.body}</p><button onClick={() => current === "overview" && navigate("characters")}>{helper.action} <IconArrow /></button></div>
        <div className="context-list"><div className="context-title"><span>当前上下文</span><b>{current === "capability" ? "能力 v1.4" : "荒年记"}</b></div><div><span>制作阶段</span><b>{current === "release" ? "构建校验" : "内容生产"}</b></div><div><span>关联资产</span><b>{current === "characters" ? "24 项" : "12 项"}</b></div><div><span>本周消耗</span><b>¥ 186.40</b></div></div>
        <div className="quick-prompts"><small>快捷指令</small><button>检查当前内容的问题</button><button>总结今天的制作进展</button></div>
        <div className="chat-box"><span>问问项目里的任何事…</span><button aria-label="发送">↑</button></div>
      </aside>
    </main>
  );
}

function PageHeading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode }) {
  return <div className="page-heading"><div><small>{eyebrow}</small><h1>{title}</h1><p>{description}</p></div>{actions && <div className="heading-actions">{actions}</div>}</div>;
}

function Overview({ onNavigate }: { onNavigate: (id: WorkspaceId) => void }) {
  return <div className="view overview-view"><PageHeading eyebrow="PROJECT  /  荒年记" title="今天，把第四章推到可试玩" description="AI 已根据依赖关系整理了最短制作路径，你也可以随时进入任意分区。" actions={<><button className="ghost-btn">邀请协作者</button><button className="dark-btn">···</button></>} /><section className="next-action-panel"><div className="next-copy"><span className="eyebrow-chip">建议下一步 · 约 12 分钟</span><h2>确认「婉儿」定妆资产</h2><p>人物定稿会解锁 14 个视频镜头，并同步更新游戏立绘与选择卡。</p><div><button className="cream-btn" onClick={() => onNavigate("characters")}>进入人物工作区 <IconArrow /></button><button className="text-btn">查看影响范围</button></div></div><div className="character-proof"><img src="/media/wanr.png" alt="婉儿人物定妆参考" /><div><span>待确认资产</span><b>婉儿 · 城外雨夜</b><small>一致性 92% · v3</small></div></div></section><section className="pipeline-section"><div className="section-title"><div><small>PRODUCTION LINE</small><h2>制作主线</h2></div><span>总进度 <b>52%</b></span></div><div className="cue-line" aria-hidden="true"><i /></div><div className="step-grid">{productionSteps.map((step) => <button key={step.id} className={`step-card tone-${step.tone}`} onClick={() => onNavigate(step.id)}><span className="step-no">{step.no}</span><div><h3>{step.title}</h3><p>{step.status}</p></div><div className="mini-progress"><i style={{ width: `${step.value}%` }} /></div><b>{step.value}%</b><IconArrow /></button>)}</div></section><div className="overview-lower"><section className="panel activity-panel"><div className="panel-head"><h2>最近动态</h2><button>查看全部</button></div><ul><li><span className="activity-mark blue">镜</span><div><b>周末末</b> 通过了镜头 E4S1<small>7 分钟前 · 视频</small></div><em>已通过</em></li><li><span className="activity-mark plum">人</span><div><b>人物一致性生成</b> 完成一批任务<small>23 分钟前 · 12 张资产</small></div><em>92%</em></li><li><span className="activity-mark brass">剧</span><div><b>林一</b> 修改了「婚书落案」<small>1 小时前 · 剧本 v18</small></div><em>+ 6 行</em></li></ul></section><section className="panel health-panel"><div className="panel-head"><h2>项目健康度</h2><span className="score">84</span></div><div className="health-row"><span>叙事完整性</span><i><b style={{ width: "88%" }} /></i><em>良好</em></div><div className="health-row"><span>人物一致性</span><i><b style={{ width: "76%" }} /></i><em>关注</em></div><div className="health-row"><span>交互节奏</span><i><b style={{ width: "68%" }} /></i><em>待优化</em></div><p>较上个版本提升 <b>+6</b>，主要来自第四章分支补全。</p></section></div></div>;
}

function Story({ selectedNode, setSelectedNode }: { selectedNode: string; setSelectedNode: (id: string) => void }) {
  const node = storyNodes.find((item) => item.id === selectedNode) ?? storyNodes[3];
  return <div className="view full-height-view"><PageHeading eyebrow="STORY MAP  /  第四章" title="分支剧本" description="把场景、选择与结果放在同一张叙事地图上。" actions={<><button className="ghost-btn">导入剧本</button><button className="primary-btn">＋ 新建场景</button></>} /><div className="tool-strip"><div className="chapter-tabs"><button>前三章</button><button className="active">第四章 · 赐婚</button><button>第五章</button></div><div><button>筛选 ▾</button><button>缩放 100%</button></div></div><section className="story-board"><div className="story-canvas"><div className="story-grid" /><div className="node-lines"><i className="line l1" /><i className="line l2" /><i className="line l3" /><i className="line l4" /><i className="line l5" /></div>{storyNodes.map((item) => <button key={item.id} className={`story-node ${item.type} ${selectedNode === item.id ? "selected" : ""}`} style={{ left: `${item.x}%`, top: `${item.y}%` }} onClick={() => setSelectedNode(item.id)}><small>{item.id}</small><b>{item.title}</b><span>{item.meta}</span></button>)}<div className="canvas-legend"><span><i className="legend-scene" />场景</span><span><i className="legend-choice" />玩家选择</span></div></div><aside className="inspector"><div className="inspector-label">节点属性</div><h2>{node.title}</h2><span className="status-pill">{node.type === "choice" ? "玩家选择" : "剧情场景"}</span><label>节点编号<input value={node.id} readOnly /></label><label>节点目标<textarea defaultValue={node.type === "choice" ? "玩家需要判断婉儿是否隐瞒了婚书的真正来源。" : "推进第四章冲突，并为下一选择建立动机。"} /></label><div className="branch-box"><span>后续连接</span><b>{node.type === "choice" ? "2 个分支" : "1 个场景"}</b></div><button className="wide-btn">打开场景编辑器 <IconArrow /></button></aside></section></div>;
}

function Characters({ selectedCharacter, setSelectedCharacter }: { selectedCharacter: string; setSelectedCharacter: (id: string) => void }) {
  const wanr = selectedCharacter === "wanr";
  return <div className="view"><PageHeading eyebrow="CHARACTER ASSETS  /  6 位角色" title="人物" description="角色设定、定妆资产与跨镜头一致性在这里沉淀。" actions={<button className="primary-btn">＋ 创建人物</button>} /><div className="source-actions"><button>从公共库使用</button><button>从项目复用</button><button className="active">AI 新生成</button><span>人物资产既可复用，也可以由算法与 UI 共建能力生成。</span></div><div className="character-layout"><section className="character-list"><div className="list-filter"><b>主要角色</b><span>按更新时间 ▾</span></div><button className={wanr ? "character-card selected" : "character-card"} onClick={() => setSelectedCharacter("wanr")}><img src="/media/wanr.png" alt="婉儿角色资产" /><div><span className="role-tag">女主角</span><h3>婉儿</h3><p>温顺外表下藏着决定荒年命运的秘密。</p><small><i className="good-dot" /> 一致性 92% · 24 项资产</small></div></button><button className={!wanr ? "character-card selected" : "character-card"} onClick={() => setSelectedCharacter("aotian")}><img src="/media/aotian.png" alt="傲天角色资产" /><div><span className="role-tag blue-tag">男主角</span><h3>傲天</h3><p>从边关归来的少年将军，执意查明赐婚真相。</p><small><i className="warn-dot" /> 一致性 86% · 19 项资产</small></div></button><button className="empty-card">＋ 添加配角或群众角色</button></section><section className="character-detail"><div className="detail-hero"><img src={wanr ? "/media/wanr.png" : "/media/aotian.png"} alt={wanr ? "婉儿定妆大图" : "傲天定妆大图"} /><div className="hero-stamp">CURRENT<br />v3.2</div></div><div className="detail-copy"><div className="detail-title"><div><small>角色基准</small><h2>{wanr ? "婉儿 · 荒年定妆" : "傲天 · 归京定妆"}</h2></div><button>···</button></div><div className="asset-stats"><div><span>一致性</span><b>{wanr ? "92" : "86"}<small>%</small></b></div><div><span>已引用</span><b>{wanr ? "14" : "11"}<small>镜头</small></b></div><div><span>资产版本</span><b>3<small>版</small></b></div></div><div className="appearance-notes"><h3>视觉锚点</h3><p>{wanr ? "素白襦裙、低髻银簪、清冷眉眼；情绪克制但不能显得怯懦。" : "玄色窄袖、束发银冠、眉峰锐利；征战风尘感保留在衣领与面部细节。"}</p><div><span>正脸</span><span>三分侧脸</span><span>雨夜光</span><span>情绪组</span></div></div><button className="wide-btn">运行人物一致性生成 <IconArrow /></button><p className="capability-credit">使用能力：人物一致性生成 v1.3 · 算法 × UI 共建</p></div></section></div></div>;
}

function Video({ frameStatus, setFrameStatus }: { frameStatus: Record<string, string>; setFrameStatus: (value: Record<string, string>) => void }) {
  const shownFrames = useMemo(() => frames.map((frame) => ({ ...frame, status: frameStatus[frame.id] ?? frame.status })), [frameStatus]);
  return <div className="view"><PageHeading eyebrow="VIDEO PRODUCTION  /  第四章" title="镜头工坊" description="以场景为单位生成、审阅并回流问题，不在时间轴里迷路。" actions={<><button className="ghost-btn">批量设置</button><button className="primary-btn">生成下一批 · 6</button></>} /><div className="video-summary"><div><span className="pulse-dot" /><b>2 个任务生成中</b><small>预计 04:18 完成</small></div><div className="review-count"><span>待审片 <b>6</b></span><span>待修改 <b>3</b></span><span>已通过 <b>18</b></span></div></div><section className="frame-grid">{shownFrames.map((frame) => <article className="frame-card" key={frame.id}><div className="frame-image"><img src={frame.src} alt={`${frame.title}镜头首帧`} /><span>{frame.time}</span><i className={`frame-state state-${frame.status}`}>{frame.status}</i><button className="play-btn" aria-label={`播放${frame.title}`}>▶</button></div><div className="frame-info"><div><small>{frame.id}</small><h3>{frame.title}</h3></div><button>···</button></div><div className="frame-actions"><button onClick={() => setFrameStatus({ ...frameStatus, [frame.id]: "待修改" })}>退回</button><button className="approve" onClick={() => setFrameStatus({ ...frameStatus, [frame.id]: "已通过" })}>通过</button></div></article>)}<button className="generate-card"><span>＋</span><b>补充镜头</b><small>从剧本节点生成</small></button></section></div>;
}

function Assembly({ previewChoice, setPreviewChoice }: { previewChoice: string; setPreviewChoice: (choice: string) => void }) {
  return <div className="view full-height-view"><PageHeading eyebrow="GAME ASSEMBLY  /  体验版本 0.8" title="游戏组装" description="把剧情、视频和玩法组件拼成可试玩的完整体验。" actions={<><button className="ghost-btn">体验规则</button><button className="primary-btn">▶ 试玩当前章节</button></>} /><section className="assembly-layout"><aside className="scene-stack"><div className="stack-title"><b>第四章 · 赐婚</b><button>＋</button></div>{["E4S1 婚书落案", "E4S3 傲天闯入", "E4C1 你相信谁？", "E4S4 替她隐瞒", "E4S6 当面对质"].map((item, index) => <button className={index === 2 ? "active" : ""} key={item}><span>{index === 2 ? "选" : "镜"}</span><div><b>{item.slice(5)}</b><small>{index === 2 ? "选择组件 · 2 分支" : "视频场景"}</small></div><i>⋮</i></button>)}<div className="stack-end">章末 · 进入第五章</div></aside><div className="phone-stage"><div className="stage-toolbar"><span>预览设备：9:16 竖屏</span><button>↻</button><button>全屏</button></div><div className="phone-frame"><div className="phone-screen"><img src="/media/e4s6-first.jpg" alt="第四章游戏预览画面" /><div className="preview-vignette" /><div className="preview-dialogue"><small>婉儿</small><p>若我说，这封婚书从来都不是圣意……你可信我？</p></div><div className="preview-choices"><button className={previewChoice === "替她隐瞒" ? "selected" : ""} onClick={() => setPreviewChoice("替她隐瞒")}><span>A</span>替她隐瞒</button><button className={previewChoice === "当面对质" ? "selected" : ""} onClick={() => setPreviewChoice("当面对质")}><span>B</span>当面对质</button></div><div className="phone-home" /></div></div><p className="preview-state">当前预览选择：<b>{previewChoice}</b> · 将写入试玩记录</p></div><aside className="component-inspector"><div className="inspector-label">组件属性</div><h2>双分支选择</h2><span className="component-kind">玩法组件 · 官方</span><label>出现方式<select defaultValue="dialogue"><option value="dialogue">对白结束后</option></select></label><label>选择倒计时<div className="input-unit"><input defaultValue="8" /><span>秒</span></div></label><label>默认策略<select defaultValue="none"><option value="none">超时不选择</option></select></label><div className="component-slots"><h3>UI 组件</h3><div><span className="component-thumb">UI</span><p><b>古风纸签 · 浅色</b><small>UI 团队 · v2.1</small></p><button>更换</button></div></div><div className="rule-tip"><span>验</span><p><b>体验规则提示</b><small>首次操作位于 96 秒，晚于建议的 45 秒。</small></p></div><button className="wide-btn">保存组件配置</button></aside></section></div>;
}

function Release({ showBlockers, setShowBlockers }: { showBlockers: boolean; setShowBlockers: (value: boolean) => void }) {
  return <div className="view"><PageHeading eyebrow="BUILD & RELEASE  /  v0.8.3" title="构建发布" description="从内容检查到快手小游戏工程，一条链路完成交付。" actions={<button className="ghost-btn">查看构建历史</button>} /><section className="release-hero"><div><span className="build-ring">78<small>%</small></span><div><small>发布就绪度</small><h2>接近可构建，还有 3 项需要处理</h2><p>处理阻断项后，将生成可上传的快手小游戏生产工程。</p></div></div><button className="primary-btn" onClick={() => setShowBlockers(!showBlockers)}>处理阻断项 <IconArrow /></button></section><div className="release-grid"><section className="panel checklist"><div className="panel-head"><h2>发布检查</h2><span>16 / 19 通过</span></div>{[{ name: "内容完整性", detail: "31 个场景均有有效出口", ok: true }, { name: "资产可用性", detail: "E4S6 视频仍为高码率源文件", ok: false }, { name: "叙事连通性", detail: "S4-5 存在 1 个未连接分支", ok: false }, { name: "小游戏首包", detail: "当前 7.8MB，目标不超过 6MB", ok: false }, { name: "隐私与合规", detail: "角色与台词扫描通过", ok: true }].map((row) => <div className={`check-row ${showBlockers && !row.ok ? "highlight" : ""}`} key={row.name}><span className={row.ok ? "check-ok" : "check-warn"}>{row.ok ? "✓" : "!"}</span><div><b>{row.name}</b><small>{row.detail}</small></div><button>{row.ok ? "查看" : "修复"}</button></div>)}</section><section className="panel target-panel"><div className="panel-head"><h2>发布目标</h2><span className="ks-badge">快手小游戏</span></div><div className="target-card"><div className="target-icon">快</div><div><b>荒年记 · 体验版</b><small>包名 ks.drama.huangnianji</small></div></div><div className="build-meta"><span>运行环境<b>KSGame / WebGL</b></span><span>版本号<b>0.8.3 (42)</b></span><span>资源策略<b>主包 + 4 分包</b></span></div><button className="build-button" disabled>生成生产工程</button><p>完成全部阻断项后可用 · 预计构建 4 分钟</p></section></div></div>;
}

function Capability() {
  return <div className="view capability-view"><PageHeading eyebrow="CAPABILITY LAB  /  内部共建" title="人物一致性生成" description="算法、UI 与业务共同维护可复用的生产能力，并用 Evals 决定是否发布。" actions={<><button className="ghost-btn">能力文档</button><button className="primary-btn">申请发布 v1.4</button></>} /><div className="capability-banner"><div><span className="cap-icon">人</span><div><small>CAP-CHAR-003</small><h2>人物一致性生成</h2><p>输入角色基准与场景约束，产出可审阅、可追溯的角色图像资产。</p></div></div><div className="cap-status"><span>内部能力</span><b>v1.4 RC</b><small>最后更新 · 今天 10:24</small></div></div><div className="cap-tabs"><button className="active">概览</button><button>工具编排</button><button>交互面板</button><button>Evals</button><button>版本</button><button>使用项目 · 12</button></div><div className="capability-grid"><section className="panel cap-flow"><div className="panel-head"><h2>能力组成</h2><button>编辑编排</button></div><div className="flow-row"><article><span className="flow-role algo">算法</span><b>角色特征抽取</b><small>FaceID + Style Encoder</small><em>v2.8</em></article><i>→</i><article><span className="flow-role ui">UI</span><b>约束参数面板</b><small>锚点、角度与风格控制</small><em>v1.4</em></article><i>→</i><article><span className="flow-role asset">资产</span><b>版本化人物图</b><small>审阅后写入项目素材库</small><em>输出</em></article></div><div className="co-build-note"><span>共</span><div><b>这是一个共建能力，不是孤立的算法接口</b><p>算法提供稳定工具，UI 把参数变成创作者可理解的操作；双方共同对最终资产质量负责。</p></div></div></section><section className="panel eval-panel"><div className="panel-head"><h2>Evals · v1.4</h2><span className="passed">已通过</span></div><div className="eval-score"><b>91.6</b><span>综合评分<small>较 v1.3 +6.8</small></span></div>{[{ n: "正脸一致性", v: 96 }, { n: "侧脸一致性", v: 88 }, { n: "服饰保持", v: 93 }, { n: "可控性", v: 89 }].map((row) => <div className="eval-row" key={row.n}><span>{row.n}</span><i><b style={{ width: `${row.v}%` }} /></i><em>{row.v}</em></div>)}</section><section className="panel contributors"><div className="panel-head"><h2>共建成员</h2><button>＋ 邀请</button></div><div className="member"><span className="member-avatar algo-bg">陈</span><div><b>陈洛 · 算法</b><small>特征抽取、生成链路</small></div><em>Owner</em></div><div className="member"><span className="member-avatar ui-bg">周</span><div><b>周末末 · UI</b><small>参数面板、审阅体验</small></div><em>Maintainer</em></div><div className="member"><span className="member-avatar product-bg">林</span><div><b>林一 · 剧游制作</b><small>场景样本、验收规则</small></div><em>Reviewer</em></div></section><section className="panel impact"><div className="panel-head"><h2>生产影响</h2><span>近 30 天</span></div><div className="impact-number"><b>1,284</b><span>生成资产<small>12 个项目使用</small></span></div><div className="impact-list"><span>平均通过率<b>87.2%</b></span><span>平均节省返工<b>34 min / 角色</b></span><span>本月失败回流<b>26 例</b></span></div></section></div></div>;
}
