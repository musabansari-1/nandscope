import { LAYERS, type Layer } from "../../core/trace/graph";
import type { Primitive } from "../../core/gates";

// Presentation state owns a snapshot, never a simulation reducer or CPU frame.
export interface Inspection { operationId: string; address: number; bit: number; primitive: Primitive; inspectedRom?: number }
export type Phase = "preparing" | "source-exiting" | "morphing" | "destination-entering";
export interface Transition {
  id: number;
  from: Layer;
  to: Layer;
  direction: "deeper" | "shallower";
  phase: Phase;
  inspection: Inspection;
  reducedMotion: boolean;
}
export interface MicroscopeState { layer: Layer; transition: Transition | null }
export type TransitionAction =
  | { type: "request"; id: number; to: Layer; inspection: Inspection; reducedMotion: boolean }
  | { type: "phase"; id: number; phase: Phase }
  | { type: "finish"; id: number };

export function transitionReducer(state: MicroscopeState, action: TransitionAction): MicroscopeState {
  if (action.type === "request") {
    if (state.transition || action.to === state.layer) return state;
    return { ...state, transition: {
      id: action.id, from: state.layer, to: action.to,
      direction: LAYERS.indexOf(action.to) > LAYERS.indexOf(state.layer) ? "deeper" : "shallower",
      phase: "preparing", inspection: { ...action.inspection }, reducedMotion: action.reducedMotion,
    } };
  }
  if (!state.transition || state.transition.id !== action.id) return state;
  if (action.type === "finish") return { layer: state.transition.to, transition: null };
  const order: Phase[] = ["preparing", "source-exiting", "morphing", "destination-entering"];
  if (order.indexOf(action.phase) !== order.indexOf(state.transition.phase) + 1) return state;
  return { ...state, transition: { ...state.transition, phase: action.phase } };
}
