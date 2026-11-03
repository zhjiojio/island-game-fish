export function ConsequenceToast({ text, affinity }: { text: string; affinity: number }) {
  return <aside className="consequence-toast" role="status"><small>遗嘱批注</small><b>{affinity >= 0 ? `关系 +${affinity}` : `关系 ${affinity}`}</b><span>{text}</span></aside>
}
