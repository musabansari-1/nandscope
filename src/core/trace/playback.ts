import type { Demo } from "./demo";
import { updateExecution, type ExecutionAction, type ExecutionFocus } from "./execution";

export const PLAYBACK_DELAYS = { "0.5": 900, "1": 450, "2": 225, "4": 110 } as const;
export type PlaybackSpeed = keyof typeof PLAYBACK_DELAYS;
export interface PlaybackState { focus: ExecutionFocus; playing: boolean; speed: PlaybackSpeed }
export type PlaybackAction = { type: "play" | "pause" | "tick" | "reset" } | { type: "speed"; speed: PlaybackSpeed } | { type: "inspect"; action: ExecutionAction };
export function initialPlayback(demo: Demo): PlaybackState {
  return { focus: { operationId: demo.hardware[0]?.operationId ?? demo.focuses[0].id, address: 0, cycleIndex: 0 }, playing: false, speed: "1" };
}
export function updatePlayback(demo: Demo, state: PlaybackState, action: PlaybackAction): PlaybackState {
  const current = state.focus.cycleIndex ?? state.focus.address, last = demo.frames.length - 1;
  if (action.type === "reset") return initialPlayback(demo);
  if (action.type === "pause") return { ...state, playing: false };
  if (action.type === "speed") return { ...state, speed: action.speed };
  if (action.type === "inspect") return { ...state, playing: false, focus: updateExecution(demo, state.focus, action.action) };
  if (action.type === "play") return { ...state, playing: last > 0, focus: updateExecution(demo, state.focus, { type: "cycle", cycleIndex: current === last ? 0 : current }) };
  if (!state.playing) return state;
  const next = Math.min(current + 1, last), frame = demo.frames[next];
  // Follow compiler provenance; never derive the next ROM address ourselves.
  const concept = demo.focuses.find(f => f.id === frame.sourceId) ?? demo.focuses.find(f => f.statementId === frame.sourceStatementId);
  return { ...state, playing: next < last, focus: { ...updateExecution(demo, state.focus, { type: "cycle", cycleIndex: next }), operationId: concept?.id ?? state.focus.operationId } };
}
// One cancellable timeout per recorded clock edge; the owner reschedules only
// after a committed cursor change. The cleanup also covers pause and unmount.
export function schedulePlaybackTick(playing: boolean, speed: PlaybackSpeed, tick: () => void) {
  if (!playing) return () => {};
  const timer = setTimeout(tick, PLAYBACK_DELAYS[speed]);
  return () => clearTimeout(timer);
}
