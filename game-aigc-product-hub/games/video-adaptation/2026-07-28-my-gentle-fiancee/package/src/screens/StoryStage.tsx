import { useEffect, useMemo, useRef, useState } from 'react'
import { cgByNode } from '../generated/cg-imports'
import { cinemagraphByNode } from '../generated/animated-portrait-imports'
import { musicByKey } from '../generated/music-imports'
import { foleyById } from '../generated/foley-imports'
import { mediaByNode } from '../generated/media-imports'
import { portraitByNode } from '../generated/portrait-imports'
import { portraitByCharacter } from '../generated/roster-imports'
import { applyChoice, selectResult, selectedMediaId, targetForChoice } from '../story/engine'
import type { StoryChoice, StoryGraph, StoryState } from '../story/types'
import { ChoicePanel } from '../components/ChoicePanel'
import { ConsequenceToast } from '../components/ConsequenceToast'
import { HeartMeter } from '../components/HeartMeter'
import { playUiSound } from '../audio/sound'
import { LayeredAudioController } from '../audio/layered-audio'

type MediaKey = keyof typeof mediaByNode
const cinemagraphs = cinemagraphByNode as Record<string, { animatedSrc: string; fallbackSrc: string; cue: string }>
const musicTracks = musicByKey as Record<string, string>
const foleyTracks = foleyById as Record<string, string>

export function StoryStage({ routeId, name, graph, onExit, onComplete }: { routeId: string; name: string; graph: StoryGraph; onExit: () => void; onComplete: (state: StoryState, resultId: string) => void }) {
  const [nodeId, setNodeId] = useState(graph.startNodeId)
  const [state, setState] = useState<StoryState>({ affinity: 0, flags: [], clues: [] })
  const [mediaError, setMediaError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const [consequence, setConsequence] = useState<{ text: string; affinity: number }>()
  const node = graph.nodes[nodeId]
  const mediaId = useMemo(() => selectedMediaId(node, state.flags), [node, state.flags])
  const media = mediaId ? mediaByNode[mediaId as MediaKey] : undefined
  const nodePortrait = portraitByNode[node.id as keyof typeof portraitByNode]
  const nodeCg = cgByNode[node.id as keyof typeof cgByNode]
  const cinemagraph = cinemagraphs[node.id]
  const fallback = portraitByCharacter[routeId as keyof typeof portraitByCharacter]
  const [mediaReady, setMediaReady] = useState(!media)
  const [stillSrc, setStillSrc] = useState(cinemagraph?.animatedSrc ?? nodePortrait?.src ?? nodeCg?.src ?? fallback)
  const audioController = useMemo(() => new LayeredAudioController(), [])
  const entrySequence = useRef(0)
  const result = selectResult(node, state)

  useEffect(() => {
    entrySequence.current += 1
    if (media) {
      audioController.enterVideo()
      return
    }
    const musicSrc = node.musicKey ? musicTracks[node.musicKey] : undefined
    if (node.musicKey && musicSrc) audioController.enterStatic({ musicKey: node.musicKey, musicSrc })
    const foleySrc = node.foleyAssetId ? foleyTracks[node.foleyAssetId] : undefined
    audioController.playFoley(`${node.id}:${entrySequence.current}`, foleySrc)
    const nextCinemagraph = cinemagraphs[node.id]
    setStillSrc(nextCinemagraph?.animatedSrc ?? nodePortrait?.src ?? nodeCg?.src ?? fallback)
  }, [audioController, fallback, media, node.id, node.musicKey, node.foleyAssetId, nodePortrait?.src, nodeCg?.src])

  useEffect(() => {
    const unlock = () => audioController.unlock()
    window.addEventListener('pointerdown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      audioController.dispose()
    }
  }, [audioController])

  useEffect(() => {
    if (!consequence) return
    const timer = window.setTimeout(() => setConsequence(undefined), 2400)
    return () => window.clearTimeout(timer)
  }, [consequence])

  const enterNode = (nextNodeId: string, nextState = state) => {
    const nextNode = graph.nodes[nextNodeId]
    const nextMediaId = selectedMediaId(nextNode, nextState.flags)
    setNodeId(nextNodeId)
    setMediaReady(!nextMediaId || !(nextMediaId in mediaByNode))
    setMediaError(false)
  }

  const choose = (choice: StoryChoice) => {
    playUiSound('choice')
    const next = applyChoice(state, choice)
    setState(next)
    setConsequence({ text: choice.directConsequence, affinity: choice.effects?.affinity ?? 0 })
    enterNode(targetForChoice(node, choice.id), next)
  }

  const finishMedia = () => {
    if (node.nextNodeId && !node.choices?.length) enterNode(node.nextNodeId)
    else setMediaReady(true)
  }

  return (
    <main className="stage-shell">
      <nav className="stage-nav"><button type="button" aria-label="退出会面" onClick={onExit}>离开</button><span>{name}</span><HeartMeter affinity={state.affinity} /></nav>
      <section className={`vertical-stage ${media ? 'is-video' : 'is-static'}`} aria-label={`${name}剧情舞台`}>
        {media ? <video key={retryKey} data-testid="story-video" src={media.video} poster={media.poster} autoPlay playsInline onEnded={finishMedia} onError={() => setMediaError(true)} /> : <picture><source media="(prefers-reduced-motion: reduce)" srcSet={cinemagraph?.fallbackSrc ?? nodePortrait?.src ?? nodeCg?.src ?? fallback} /><img className="story-still" src={stillSrc} onError={() => setStillSrc(cinemagraph?.fallbackSrc ?? nodePortrait?.src ?? nodeCg?.src ?? fallback)} alt={`${name}剧情画面`} /></picture>}
        <div className="stage-vignette" />
        <div className="round-marker">{node.id.split('-r').at(-1)} / {Object.keys(graph.nodes).length}</div>
        <section className="dialogue-sheet">
          <small>CHAPTER 01 · {node.id.split('-r').at(-1)}</small>
          <p>{node.action}</p>
          {node.dialogue.map((line) => <blockquote key={`${line.speaker}-${line.text}`}><b>{name}</b>{line.text}</blockquote>)}
        </section>
      </section>
      {mediaError ? <div className="media-error" role="alert"><b>这一幕没有成功播放</b><span>重新加载这段视频，或使用角色立绘继续；当前选择不会丢失。</span><button onClick={() => { setMediaError(false); setRetryKey((value) => value + 1) }}>重新播放</button><button onClick={() => setMediaReady(true)}>用立绘继续</button></div> : null}
      {consequence ? <div className="stage-feedback-slot"><ConsequenceToast text={consequence.text} affinity={consequence.affinity} /></div> : null}
      {mediaReady && node.choices ? <ChoicePanel choices={node.choices} onChoose={choose} /> : null}
      {mediaReady && node.nextNodeId && !node.choices?.length && !media ? <button className="stage-continue" onClick={() => { playUiSound('continue'); enterNode(node.nextNodeId!) }}>继续会面</button> : null}
      {mediaReady && node.chapterResult && result ? <button className="stage-continue" onClick={() => { playUiSound('complete'); onComplete(state, result.id) }}>保存本章记录</button> : null}
    </main>
  )
}
