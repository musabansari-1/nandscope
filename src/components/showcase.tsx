"use client";
import { useEffect, useMemo, useState } from "react";
import { createShowcase, SHOWCASE_STEP_MS } from "@/core/trace/showcase";
import { relatedNodes } from "@/core/trace/graph";
import { pointerPath } from "@/core/trace/pointers";
import { SourceLayer } from "./layers/source";
import { VMLayer } from "./layers/vm";
import { AssemblyLayer } from "./layers/assembly";
import { MachineLayer } from "./layers/machine";
import { CPULayer } from "./layers/cpu";
import { ALULayer } from "./layers/alu";
import { GatesLayer } from "./layers/gates";
import { NANDLayer } from "./layers/nand";
import { ShareButton } from "./shared/share-button";
const VIEWS = { source: SourceLayer, vm: VMLayer, assembly: AssemblyLayer, machine: MachineLayer, cpu: CPULayer, alu: ALULayer, gate: GatesLayer, nand: NANDLayer };
export function Showcase({ onExit, initialStep = 0 }: { onExit: () => void; initialStep?: number }) {
  const steps = useMemo(() => createShowcase(), []), [step, setStep] = useState(Math.min(initialStep, steps.length - 1)), [playing, setPlaying] = useState(false), [done, setDone] = useState(false);
  const [bit, setBit] = useState(3), current = steps[step], View = VIEWS[current.layer];
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => { if (step === steps.length - 1) { setPlaying(false); setDone(true); } else setStep(s => s + 1); }, SHOWCASE_STEP_MS);
    return () => clearTimeout(timer);
  }, [playing, step, steps.length]);
  const path = current.kind === "pointer" ? pointerPath(current.demo, current.focus, current.cycle) : undefined;
  const pointerAction = path?.kind === "address-of" ? "Actual address computation" : "Actual indirect read";
  return <div className="showcase-shell"><header className="debug-header"><span className="guided-brand">NAND<b>scope</b></span><span className="eyebrow">SHOWCASE · 36 SECONDS</span><button className="quiet-button" onClick={onExit}>Exit showcase</button></header><main className="showcase-stage" data-showcase-step={step} data-playing={playing}><span className="guided-kicker">{current.caption}</span><h1>{current.title}</h1><div className={`showcase-visual ${current.kind ?? ""}`} key={step}>{current.kind === "finish" ? <div className="showcase-finish"><span>⊼</span><h2>See what your code becomes.</h2><p>What changed? Why this value? How much machine work?</p></div> : path ? <div className="showcase-pointer">{path.items.map((item, i) => <div key={i}>{i > 0 && <span>↓</span>}<code>{item}</code></div>)}<p>{pointerAction} · cycle {current.cycle + 1} · ROM {current.demo.frames[current.cycle].romAddress}</p></div> : <View demo={current.demo} related={relatedNodes(current.demo.graph, current.focus)} address={current.cycle} operationId={current.focus} bit={bit} primitive="xor" entrySignalStage={3} onBit={setBit} onPrimitive={() => {}} onSelect={() => {}} onInstruction={() => {}} onROM={() => {}} />}</div></main><footer className="showcase-controls"><button className="primary-button" onClick={() => { if (done) { setStep(0); setDone(false); } setPlaying(p => !p); }}>{playing ? "Pause" : done ? "Play again" : "Play showcase"}</button><button className="quiet-button" onClick={() => { setStep(0); setDone(false); setPlaying(false); }}>Restart</button><label>Scene<select value={step} onChange={e => { setPlaying(false); setDone(false); setStep(Number(e.target.value)); }}>{steps.map((s, i) => <option value={i} key={i}>{i + 1}. {s.title}</option>)}</select></label><span role="status">{done ? "Showcase complete" : `${step + 1} / ${steps.length}`}</span><ShareButton state={{ mode: "showcase", step }} /></footer></div>;
}
