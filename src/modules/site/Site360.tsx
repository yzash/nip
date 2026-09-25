export function Site360({ siteId }: { siteId: string; mode: 'drawer' | 'page'; onClose?: () => void }) {
  return <div className="p-4">{siteId}</div>
}
