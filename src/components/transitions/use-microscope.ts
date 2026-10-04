import { useCallback, useLayoutEffect, useReducer, useRef, useState } from "react";
import type { Demo } from "../../core/trace/demo";
import type { Layer } from "../../core/trace/graph";
import { buildNandNetwork } from "../../core/gates";
import { relationship } from "./anchors";
import { anchor, animateRelationship, capture, revealAnchor, type VisualSnapshot } from "./motion";
import { transitionReducer, type Inspection, type MicroscopeState } from "./state";

export function useMicroscope(demo: Demo, inspection: Inspection, initialLayer: Layer = "source") {
  const [state, dispatch] = useReducer(transitionReducer, { layer: initialLayer, transition: null } satisfies MicroscopeState);
  const stageRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  useLayoutEffect(() => { stateRef.current = state; }, [state]);
  const lock = useRef(false), sequence = useRef(0);
  const source = useRef<VisualSnapshot | null>(null);
  const [signalEntry, setSignalEntry] = useState<{ bit: number; primitive: Inspection["primitive"]; stage: number } | null>(null);
  const request = useCallback((to: Layer) => {
    if (lock.current || stateRef.current.layer === to) return false;
    const stage = stageRef.current;
    const action = { type: "request" as const, id: ++sequence.current, to, inspection, reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches };
    const next = transitionReducer(stateRef.current, action);
    const mapping = relationship(demo, next.transition!);
    const element = stage && anchor(stage, mapping.source);
    revealAnchor(element);
    source.current = element && stage ? capture(element, stage) : null;
    // Move focus before the outgoing plane becomes inert/aria-hidden. A source
    // token can still own focus when navigation is requested programmatically.
    if (stage?.contains(document.activeElement)) stage.focus({ preventScroll: true });
    if (stage) stage.scrollTop = 0;
    lock.current = true; stateRef.current = next;
    dispatch(action); setSignalEntry(null);
    return true;
  }, [demo, inspection]);

  const transition = state.transition;
  // One lifecycle per request. Phase updates do not restart animations or timers.
  const transitionId = transition?.id;
  useLayoutEffect(() => {
    const current = stateRef.current.transition;
    const stage = stageRef.current;
    if (!current || !stage) return;
    const scene = stage.querySelector<HTMLElement>(".scene-destination")!;
    const mapping = relationship(demo, current);
    const element = anchor(scene, mapping.destination);
    revealAnchor(element);
    const sourceElement = stage.querySelector<HTMLElement | SVGGraphicsElement>(`.scene-source [data-visual-anchor="${mapping.source}"]`);
    // Capture was made before React changed the presentation tree.
    const cleanupMotion = animateRelationship(stage, source.current, scene, mapping, current, demo);
    if (sourceElement) sourceElement.style.visibility = "hidden";
    const timers: ReturnType<typeof setTimeout>[] = [];
    const schedule = (time: number, callback: () => void) => { timers.push(setTimeout(callback, time)); };
    const reduced = current.reducedMotion;
    dispatch({ type: "phase", id: current.id, phase: "source-exiting" });
    schedule(reduced ? 20 : 130, () => dispatch({ type: "phase", id: current.id, phase: "morphing" }));
    schedule(reduced ? 45 : 620, () => dispatch({ type: "phase", id: current.id, phase: "destination-entering" }));
    if (mapping.kind === "decompose") schedule(reduced ? 45 : 620, () => { if (element) element.style.visibility = ""; });
    if (current.to === "nand" && mapping.kind !== "context") {
      const stages = buildNandNetwork(current.inspection.primitive).stages;
      for (let depth = 1; depth <= stages; depth++) schedule(reduced ? 60 : 560 + depth * 60, () => setSignalEntry({ bit: current.inspection.bit, primitive: current.inspection.primitive, stage: depth }));
    }
    schedule(reduced ? 140 : 840, () => {
      cleanupMotion();
      dispatch({ type: "finish", id: current.id });
      // Unlock after React commits the destination, avoiding a stale-source request.
    });
    const resize = () => {
      cleanupMotion(); timers.forEach(clearTimeout);
      if (current.to === "nand" && mapping.kind !== "context") setSignalEntry({ bit: current.inspection.bit, primitive: current.inspection.primitive, stage: buildNandNetwork(current.inspection.primitive).stages });
      dispatch({ type: "finish", id: current.id });
    };
    window.addEventListener("resize", resize);
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    motionPreference.addEventListener("change", resize);
    return () => {
      timers.forEach(clearTimeout); cleanupMotion();
      if (sourceElement) sourceElement.style.visibility = "";
      window.removeEventListener("resize", resize);
      motionPreference.removeEventListener("change", resize);
    };
  }, [demo, transitionId]);
  useLayoutEffect(() => { if (!state.transition) lock.current = false; }, [state.transition]);
  const isLocked = useCallback(() => lock.current, []);
  return {
    state, stageRef, request, busy: !!state.transition,
    layer: state.transition?.to ?? state.layer,
    isLocked,
    entrySignalStage: signalEntry?.bit === inspection.bit && signalEntry.primitive === inspection.primitive ? signalEntry.stage : undefined,
  };
}
