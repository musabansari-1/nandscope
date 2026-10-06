import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemo } from "./demo";
import { initialPlayback, updatePlayback, schedulePlaybackTick, PLAYBACK_DELAYS } from "./playback";
import { EXAMPLES } from "../vm";

afterEach(() => vi.useRealTimers());
describe("runtime playback state", () => {
  const d = createDemo(EXAMPLES.Loop);
  it("plays only recorded cycles, revisits ROM and stops at the final edge", () => {
    let s = updatePlayback(d, initialPlayback(d), { type: "play" }); const observed = [d.frames[s.focus.cycleIndex!].romAddress];
    while (s.playing) { const before = s.focus.cycleIndex!; s = updatePlayback(d, s, { type: "tick" }); expect(s.focus.cycleIndex).toBe(before + 1); observed.push(d.frames[s.focus.cycleIndex!].romAddress); }
    expect(observed).toEqual(d.frames.map(f => f.romAddress)); expect(new Set(observed).size).toBeLessThan(observed.length);
    expect(s.focus.cycleIndex).toBe(d.frames.length - 1); expect(updatePlayback(d,s,{type:"tick"})).toBe(s);
    expect(updatePlayback(d,s,{type:"play"}).focus.cycleIndex).toBe(0);
  });
  it("pause holds the exact cycle and manual seeks/steps/source/ROM inspection pause", () => {
    let s = updatePlayback(d, initialPlayback(d), { type: "play" }); s = updatePlayback(d,s,{type:"tick"});
    const paused = updatePlayback(d,s,{type:"pause"}); expect(updatePlayback(d,paused,{type:"tick"})).toBe(paused);
    for (const action of [{type:"cycle" as const,cycleIndex:80},{type:"step" as const,delta:1},{type:"operation" as const,id:d.additions[0].operationId},{type:"rom" as const,romAddress:19}]) expect(updatePlayback(d,s,{type:"inspect",action}).playing).toBe(false);
  });
  it("compile/reset begins a fresh paused run", () => {
    let s=updatePlayback(d,initialPlayback(d),{type:"play"});s=updatePlayback(d,s,{type:"tick"});s=updatePlayback(d,s,{type:"speed",speed:"2"});
    const next = createDemo(EXAMPLES.Pointer); expect(updatePlayback(next,s,{type:"reset"})).toEqual(initialPlayback(next));
  });
  it("a backward jump advances to the actual next ROM rather than ROM+1", () => {
    const jump=d.frames.find(f=>f.jump.backward)!;let s=updatePlayback(d,initialPlayback(d),{type:"inspect",action:{type:"cycle",cycleIndex:jump.cycleIndex}});
    s=updatePlayback(d,s,{type:"play"});s=updatePlayback(d,s,{type:"tick"});expect(d.frames[s.focus.cycleIndex!].romAddress).toBe(jump.after.pc);expect(d.frames[s.focus.cycleIndex!].romAddress).toBeLessThan(jump.romAddress);
  });
  it("follows actual call-stack push/pop edges and compiler source identity", () => {
    const fn=createDemo(EXAMPLES.Function);let s=updatePlayback(fn,initialPlayback(fn),{type:"play"});const depths=[0];
    while(s.playing){s=updatePlayback(fn,s,{type:"tick"});const f=fn.frames[s.focus.cycleIndex!];depths.push(f.callStack.length);expect(fn.focuses.some(c=>c.id===s.focus.operationId&&c.statementId===f.sourceStatementId)).toBe(true);}
    expect(depths).toContain(1);expect(depths.at(-1)).toBe(0);
  });
});
describe("cancellable playback timer", () => {
  it.each(["0.5", "1", "2", "4"] as const)("schedules exactly one edge at %s×", speed => {
    vi.useFakeTimers();const tick=vi.fn();const clean=schedulePlaybackTick(true,speed,tick);
    vi.advanceTimersByTime(PLAYBACK_DELAYS[speed]-1);expect(tick).not.toHaveBeenCalled();vi.advanceTimersByTime(1);expect(tick).toHaveBeenCalledOnce();vi.advanceTimersByTime(5000);expect(tick).toHaveBeenCalledOnce();clean();expect(vi.getTimerCount()).toBe(0);
  });
  it("cleanup after pause, seek, compile or unmount cancels the pending edge", () => {
    vi.useFakeTimers();const tick=vi.fn();const cleanup=schedulePlaybackTick(true,"1",tick);expect(vi.getTimerCount()).toBe(1);cleanup();vi.advanceTimersByTime(5000);expect(tick).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
    const paused=schedulePlaybackTick(false,"1",tick);expect(vi.getTimerCount()).toBe(0);paused();
  });
  it("speed changes cancel the old deadline and retain exactly one new timer", () => {
    vi.useFakeTimers();const tick=vi.fn();let cleanup=schedulePlaybackTick(true,"0.5",tick);vi.advanceTimersByTime(100);cleanup();cleanup=schedulePlaybackTick(true,"2",tick);expect(vi.getTimerCount()).toBe(1);vi.advanceTimersByTime(225);expect(tick).toHaveBeenCalledOnce();cleanup();vi.advanceTimersByTime(1000);expect(tick).toHaveBeenCalledOnce();
  });
});
