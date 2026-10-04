"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { createDemo, focusedHardware, type Demo } from "@/core/trace/demo";
import { executionCursor } from "@/core/trace/execution";
import { initialPlayback, updatePlayback, schedulePlaybackTick, type PlaybackState, type PlaybackAction } from "@/core/trace/playback";
import { memorySnapshot } from "@/core/trace/memory";
import { formatStatement } from "@/core/parser";
import { DECISION_SOURCE, EXAMPLES } from "@/core/vm";
import { LAYERS, relatedNodes, type Layer } from "@/core/trace/graph";
import type { Primitive } from "@/core/gates";
import { Ladder, LAYER_INFO } from "./navigation/ladder";
import { SourceLayer } from "./layers/source";
import { VMLayer } from "./layers/vm";
import { AssemblyLayer } from "./layers/assembly";
import { MachineLayer } from "./layers/machine";
import { CPULayer } from "./layers/cpu";
import { ALULayer } from "./layers/alu";
import { GatesLayer } from "./layers/gates";
import { NANDLayer } from "./layers/nand";
import { WhyPanel } from "./shared/why-panel";
import { ExecutionControls } from "./shared/execution-controls";
import { MemoryPanel } from "./shared/memory-panel";
import { SystemsPanel } from "./shared/systems-panel";
import { PointerPanel } from "./shared/pointer-panel";
import "./shared/systems.css";
import type { LayerProps } from "./shared/types";
import { useMicroscope } from "./transitions/use-microscope";
import "./transitions/microscope.css";
import "./shared/memory.css";
import { GuidedExperience } from "./guided";
import { CompareExperience } from "./compare";
import { Showcase } from "./showcase";
import { CostPanel } from "./shared/cost-panel";
import { CausalPanel } from "./shared/causal-panel";
import { ShareButton } from "./shared/share-button";
import { restoreShareState, type ShareState } from "@/core/trace/share";
import "./debugger.css";

const VIEWS = { source: SourceLayer, vm: VMLayer, assembly: AssemblyLayer, machine: MachineLayer, cpu: CPULayer, alu: ALULayer, gate: GatesLayer, nand: NANDLayer };
export function Workspace() {
  const hash = useSyncExternalStore(subscribeHash, getHashSnapshot, () => "");
  const initial = useMemo(() => {
    const state = restoreShareState(hash);
    try {
      if (state.mode === "explorer" || state.mode === "compare") {
        const demo = createDemo(state.source ?? EXAMPLES.Arithmetic, { keyboard: state.keyboard });
        if (state.focus && !demo.focuses.some(f => f.id === state.focus) || state.cycle !== undefined && state.cycle >= demo.frames.length) return { mode: "guided" } as ShareState;
        if (state.rightSource) createDemo(state.rightSource, { keyboard: state.keyboard });
      }
      return state;
    } catch { return { mode: "guided" } as ShareState; }
  }, [hash]);
  return <WorkspaceMode key={hash} initial={initial} />;
}
let hashSnapshot: string | undefined;
function getHashSnapshot() { return hashSnapshot ??= window.location.hash; }
function subscribeHash(change: () => void) {
  const handle = () => { hashSnapshot = window.location.hash; change(); };
  window.addEventListener("hashchange", handle); return () => window.removeEventListener("hashchange", handle);
}
function WorkspaceMode({ initial }: { initial: ShareState }) {
  const [view, setView] = useState(initial);
  const [explorerSource, setExplorerSource] = useState(initial.source ?? EXAMPLES.Arithmetic);
  const [comparisonSource, setComparisonSource] = useState(explorerSource);
  if (view.mode === "guided") return <GuidedExperience initial={view} onCompare={() => { setComparisonSource(EXAMPLES.Arithmetic); setView({ mode: "compare" }); }} onShowcase={() => setView({ mode: "showcase" })} onOpenExplorer={(source) => { setExplorerSource(source); setView({ mode: "explorer" }); }} />;
  if (view.mode === "showcase") return <Showcase initialStep={view.step} onExit={() => setView({ mode: "explorer" })} />;
  if (view.mode === "compare") return <CompareExperience initialSource={comparisonSource} initial={view} onExit={() => setView({ mode: "explorer" })} onExplore={(demo, cycle) => { setExplorerSource(demo.source); setView({ mode: "explorer", cycle, keyboard: demo.keyboard }); }} />;
  return <ExplorerWorkspace initialSource={explorerSource} initial={view} onGuided={() => setView({ mode: "guided" })} onCompare={(source, keyboard) => { setExplorerSource(source); setComparisonSource(source); setView({ mode: "compare", keyboard }); }} onShowcase={() => setView({ mode: "showcase" })} />;
}
function ExplorerWorkspace({ initialSource, initial, onGuided, onCompare, onShowcase }: { initialSource: string; initial: ShareState; onGuided: () => void; onCompare: (source: string, keyboard?: number) => void; onShowcase: () => void }) {
  const [program, setProgram] = useState(() => ({ demo: createDemo(initialSource || DECISION_SOURCE, { keyboard: initial.keyboard }), version: 0 }));
  function compile(source: string, keyboard = 0): string | null {
    try { const demo = createDemo(source, { keyboard }); setProgram(current => ({ demo, version: current.version + 1 })); return null; }
    catch (error) { return error instanceof Error ? error.message : "Unable to compile this program."; }
  }
  return <WorkspaceSession key={program.version} demo={program.demo} initial={program.version === 0 ? initial : undefined} onCompile={compile} onGuided={onGuided} onCompare={onCompare} onShowcase={onShowcase} />;
}
function WorkspaceSession({ demo, initial, onCompile, onGuided, onCompare, onShowcase }: { demo: Demo; initial?: ShareState; onCompile: (source: string, keyboard?: number) => string | null; onGuided: () => void; onCompare: (source: string, keyboard?: number) => void; onShowcase: () => void }) {
  const [runtime, dispatch] = useReducer((state: PlaybackState, action: PlaybackAction) => updatePlayback(demo, state, action), demo, demo => {
    const state = initialPlayback(demo), cycle = initial?.cycle ?? 0;
    return { ...state, focus: { operationId: initial?.focus ?? state.focus.operationId, cycleIndex: cycle, address: cycle } };
  });
  const { focus, playing, speed } = runtime;
  const address = focus.cycleIndex ?? focus.address;
  const root = focus.operationId;
  const [bit, setBit] = useState(initial?.bit ?? 1);
  const [chosenPrimitive, setPrimitive] = useState<Primitive>(initial?.primitive ?? "xor");
  const [cause, setCause] = useState<{ address: number; cycle: number } | null>(null);
  const [causalALU, setCausalALU] = useState<{ id: string; cycle: number } | null>(null);
  const causeOrigin = useRef<HTMLElement | null>(null);
  const addition = focusedHardware(demo, root, address);
  const primitive = addition?.class === "bitwise" ? addition.primitive : chosenPrimitive;
  const { layer, busy, request, state: presentation, stageRef, isLocked, entrySignalStage } = useMicroscope(demo, { operationId: root, address, bit, primitive, inspectedRom: focus.inspectedRom }, initial?.layer);
  const related = useMemo(() => relatedNodes(demo.graph, root), [demo, root]);
  const index = LAYERS.indexOf(layer);
  const baseInfo = LAYER_INFO[layer];
  const info = addition?.class === "bitwise" && layer === "gate" ? { ...baseInfo, title: "Each bit works on its own.", description: `Sixteen parallel ${addition.primitive.toUpperCase()} operations. Select one bit to inspect its circuit.` } : addition?.class === "bitwise" && layer === "alu" ? { ...baseInfo, title: "Binary words meet Boolean logic.", description: "The source bitwise operation configures the real Hack ALU." } : baseInfo;
  const cursor = executionCursor(demo, address);
  const sourceFocus = demo.focuses.find(focus => focus.id === root)!;
  const selectedSourceAddition = sourceFocus.role === "arithmetic" || sourceFocus.role === "bitwise" ? demo.hardware.find(candidate => candidate.operationId === root) : undefined;
  const followAddition = addition ?? selectedSourceAddition ?? (sourceFocus.role === "arithmetic" || sourceFocus.role === "bitwise" ? undefined : demo.hardware.find(candidate => demo.vm.find(vm => vm.id === candidate.vmId)?.sourceStatementId === sourceFocus.statementId) ?? demo.hardware[0]);
  const memory = memorySnapshot(demo, address);
  const changeLayer = useCallback((next: Layer) => { dispatch({ type: "pause" }); return request(next); }, [request]);
  const move = useCallback((delta: number) => changeLayer(LAYERS[Math.max(0, Math.min(7, LAYERS.indexOf(layer) + delta))]), [changeLayer, layer]);
  const step = useCallback((delta: number) => { if (!isLocked()) dispatch({ type: "inspect", action: { type: "step", delta } }); }, [isLocked]);
  useEffect(() => {
    if (causalALU && causalALU.id === root && causalALU.cycle === address && !busy) {
      request("alu"); queueMicrotask(() => setCausalALU(null));
    }
  }, [causalALU, root, address, busy, request]);
  useEffect(() => schedulePlaybackTick(playing, speed, () => { if (!isLocked()) dispatch({ type: "tick" }); }), [playing, speed, address, isLocked]);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const element = event.target instanceof Element ? event.target : null;
      if (element?.closest("input, textarea, select, button, a, [contenteditable]:not([contenteditable='false']), [role='button']") || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); move(event.key === "ArrowDown" ? 1 : -1); }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); step(event.key === "ArrowLeft" ? -1 : 1); }
      if (event.key === " " && !isLocked()) { event.preventDefault(); dispatch({ type: playing ? "pause" : "play" }); }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [move, step, playing, isLocked]);
  function select(id: string) {
    if (isLocked()) return;
    dispatch({ type: "inspect", action: id.startsWith("source:") ? { type: "operation", id } : { type: "vm", id } });
  }
  function selectInstruction(cycleIndex: number) { if (!isLocked()) dispatch({ type: "inspect", action: { type: "cycle", cycleIndex } }); }
  function selectROM(romAddress: number) { if (!isLocked()) dispatch({ type: "inspect", action: { type: "rom", romAddress } }); }
  function followPlus() { if (followAddition) select(followAddition.operationId); }
  const props: LayerProps = {
    demo, related, address, bit, primitive, playing, operationId: root, onCompile: (source, keyboard) => { dispatch({ type: "pause" }); return onCompile(source, keyboard); }, onSelect: select, onInstruction: selectInstruction, onROM: selectROM, inspectedRom: focus.inspectedRom, inspectedVM: focus.inspectedVM,
    onBit: setBit, onPrimitive: setPrimitive, entrySignalStage,
    onExplain: addressToExplain => { causeOrigin.current = document.activeElement as HTMLElement; dispatch({ type: "pause" }); setCause({ address: addressToExplain, cycle: address }); },
  };
  function scene(sceneLayer: Layer, className: string) {
    const View = VIEWS[sceneLayer];
    const hardware = ["alu", "gate", "nand"].includes(sceneLayer);
    const hasArithmetic = !hardware || addition?.address === address;
    return <div key={sceneLayer} className={`layer-scene ${className}`} data-layer={sceneLayer} aria-hidden={className === "scene-source" ? true : undefined} inert={busy}>
      {hasArithmetic ? <div className="scene-content"><View {...props} />{!hardware && <><PointerPanel {...props} /><SystemsPanel {...props} /><MemoryPanel {...props} /></>}</div> : <div className="arithmetic-return"><h2>{!followAddition ? ["arithmetic", "bitwise"].includes(sourceFocus.role) ? "This source operation was not executed on this run." : "This program moves values through memory." : addition && address < addition.address ? `The source ${followAddition.operator} is still ahead.` : addition && address > addition.address ? `The source ${followAddition.operator} has already executed.` : "Follow a source operation into hardware."}</h2><p>Current step: <code data-visual-anchor="arithmetic-context">Cycle {address + 1} · ROM {cursor.romAddress} · {cursor.assembly.text}</code>.<br />{followAddition ? `The operation reaches the ALU at cycle ${followAddition.cycleIndex + 1}, ROM ${followAddition.romAddress}.` : ["arithmetic", "bitwise"].includes(sourceFocus.role) ? "This branch was skipped, so there is no CPU or ALU execution to inspect for this source operation." : "There is no executed source hardware operation in this run. Inspect its memory accesses at the CPU layer."}</p>{followAddition && <button className="primary-button" onClick={followPlus}>Jump to the operation →</button>}</div>}
    </div>;
  }
  return <div className="workspace">
    <header className="app-header"><Link className="brand" href="/" aria-label="NANDscope home"><svg viewBox="0 0 30 30" aria-hidden="true"><path d="M5 6h11a9 9 0 0 1 0 18H5Z" /><circle cx="26" cy="15" r="2.5" /><path d="M1 10h4M1 20h4" /></svg><span>NAND<span className="brand-light">scope</span></span></Link><div className="header-separator" /><span className="header-caption">EXPLORER · EXACT MACHINE STATE</span><button className="explorer-mode-button" onClick={onGuided}>Guided mode</button><div className="header-program"><span className="eyebrow">LINE {cursor.statement.line}</span><code>{formatStatement(cursor.statement)}</code></div></header>
    <div className="explorer-tools"><button className="quiet-button" onClick={() => onCompare(demo.source, demo.keyboard & 65535)}>Compare</button><button className="quiet-button" onClick={onShowcase}>Showcase</button><ShareButton state={{ mode: "explorer", source: demo.source, layer, cycle: address, focus: root, bit, primitive, keyboard: demo.keyboard & 65535 }} /></div><div className="workspace-body"><Ladder active={layer} onChange={changeLayer} busy={busy} /><main className="main-panel"><div className="view-topline"><span className="eyebrow">{String(index + 1).padStart(2, "0")} / 08 <span className="topline-divider">/</span> {info.label.toUpperCase()}</span><span className="domain-label"><span className="small-dot" />{index < 4 ? "SOFTWARE" : "HARDWARE"}</span></div><div className="view-heading"><h1>{info.title}</h1><p>{info.description}</p></div><div className="execution-slot" inert={busy}><ExecutionControls demo={demo} address={address} onSeek={selectInstruction} onStep={step} playing={playing} speed={speed} onToggle={() => dispatch({ type: playing ? "pause" : "play" })} onSpeed={speed => dispatch({ type: "speed", speed })} /></div><CostPanel demo={demo} cycleIndex={address} />{cause && <CausalPanel demo={demo} address={cause.address} cycleIndex={cause.cycle} onClose={() => { setCause(null); queueMicrotask(() => (causeOrigin.current?.isConnected ? causeOrigin.current : stageRef.current)?.focus({ preventScroll: true })); }} onInspect={selectInstruction} onPrevious={cycle => { setCause({ ...cause, cycle }); selectInstruction(cycle); }} onALU={(id, cycle) => { dispatch({ type: "inspect", action: { type: "cycle", cycleIndex: cycle } }); dispatch({ type: "inspect", action: { type: "operation", id } }); setCausalALU({ id, cycle }); }} />}{focus.notice && <div className="inspection-notice" role="status">{focus.notice} The execution cursor remains at cycle {address + 1}.</div>}<div className="visualization microscope-stage" ref={stageRef} tabIndex={-1} aria-label="Layer visualization" data-phase={presentation.transition?.phase ?? "idle"} data-direction={presentation.transition?.direction} data-motion={presentation.transition?.reducedMotion ? "reduced" : "full"} aria-busy={busy}>
      {presentation.transition ? <>{scene(presentation.transition.from, "scene-source")}{scene(presentation.transition.to, "scene-destination")}</> : scene(layer, "scene-current")}
    </div><div className="view-footnote"><span className="small-dot" /><span>Line {cursor.statement.line} · one connected trace.</span><code>{sourceFocus.symbol ? `${sourceFocus.symbol.name} = ${memory.cells.find(cell => cell.symbol.id === sourceFocus.symbol!.id)?.value ?? "inactive frame"}` : `Cycle ${address + 1} · ROM ${cursor.romAddress}`}</code></div></main><WhyPanel active={layer} demo={demo} address={address} bit={bit} root={root} onFollow={followPlus} /></div>
    <footer className="workspace-footer"><span className="footer-caption">WRITE CODE. <b>ZOOM DOWN TO NAND.</b></span><div className="level-controls"><button className="quiet-button" onClick={() => move(-1)} disabled={index === 0 || busy}><span>↑</span> Level up</button><span className="level-count">{String(index + 1).padStart(2, "0")} <span>/ 08</span></span><button className="primary-button" onClick={() => move(1)} disabled={index === 7 || busy}>{index === 0 ? ["arithmetic", "bitwise"].includes(sourceFocus.role) ? `Follow the ${sourceFocus.label}` : sourceFocus.role === "control" || sourceFocus.role === "call" ? "Follow control flow" : "Follow the value" : "Level down"} <span>↓</span></button></div></footer>
  </div>;
}





