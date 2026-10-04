import type { ReactNode } from "react";

export function Diagram({ children, viewBox = "0 0 800 420", label }: { children: ReactNode; viewBox?: string; label: string }) {
  return <svg className="diagram" viewBox={viewBox} role="img" aria-label={label}>
    <defs><marker id="signal-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9" fill="none" stroke="context-stroke" strokeWidth="1.5" /></marker></defs>
    {children}
  </svg>;
}
export function Wire({ d, active = true, label, x, y, anchorId }: { d: string; active?: boolean; label?: string; x?: number; y?: number; anchorId?: string }) {
  return <g className={active ? "wire active" : "wire"}><path d={d} markerEnd="url(#signal-arrow)" />{label !== undefined && <text data-visual-anchor={anchorId} x={x} y={y} textAnchor="middle" className="wire-label">{label}</text>}</g>;
}
export function Block({ x, y, width = 140, height = 72, title, value, active = true, anchorId }: { x: number; y: number; width?: number; height?: number; title: string; value?: string; active?: boolean; anchorId?: string }) {
  return <g data-visual-anchor={anchorId} className={active ? "block active" : "block"}>
    <rect x={x} y={y} width={width} height={height} rx={10} />
    <text x={x + width / 2} y={y + (value ? 28 : height / 2 + 5)} textAnchor="middle" className="block-title">{title}</text>
    {value && <text x={x + width / 2} y={y + 52} textAnchor="middle" className="block-value">{value}</text>}
  </g>;
}
export function BitPicker({ bit, onBit, count = 16 }: { bit: number; onBit: (value: number) => void; count?: number }) {
  return <div className="bit-picker" aria-label="Select a bit">
    <span>BIT SLICE</span><div>{Array.from({ length: count }, (_, i) => <button key={i} aria-pressed={i === bit} onClick={() => onBit(i)}>{i}</button>)}</div>
  </div>;
}
