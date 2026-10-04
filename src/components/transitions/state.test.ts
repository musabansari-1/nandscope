import { describe, expect, it } from "vitest";
import { createDemo } from "../../core/trace/demo";
import { LAYERS, type Layer } from "../../core/trace/graph";
import { relationship } from "./anchors";
import { transitionReducer, type Inspection, type MicroscopeState } from "./state";

const demo = createDemo();
const inspection: Inspection = { operationId: "source:plus", address: 18, bit: 2, primitive: "or" };
function request(layer: Layer, to: Layer, reducedMotion = false, focus = inspection) {
  return transitionReducer({ layer, transition: null }, { type: "request", id: 1, to, inspection: focus, reducedMotion });
}
function finish(state: MicroscopeState) { return transitionReducer(state, { type: "finish", id: 1 }); }

describe("microscope presentation", () => {
  it("arrives at each adjacent layer and returns through the same relationships", () => {
    for (let index = 0; index < LAYERS.length - 1; index++) {
      const down = request(LAYERS[index], LAYERS[index + 1]);
      expect(down.transition?.direction).toBe("deeper");
      expect(finish(down)).toEqual({ layer: LAYERS[index + 1], transition: null });
      const up = request(LAYERS[index + 1], LAYERS[index]);
      expect(up.transition?.direction).toBe("shallower");
      const lower = relationship(demo, down.transition!);
      const upper = relationship(demo, up.transition!);
      expect(upper.source).toBe(lower.destination);
      expect(upper.destination).toBe(lower.source);
      expect(finish(up).layer).toBe(LAYERS[index]);
    }
  });
  it("locks repeated requests and ignores stale completion", () => {
    const state = request("source", "vm");
    expect(transitionReducer(state, { type: "request", id: 2, to: "nand", inspection, reducedMotion: false })).toBe(state);
    expect(transitionReducer(state, { type: "finish", id: 99 })).toBe(state);
    expect(finish(state).layer).toBe("vm");
  });
  it("coordinates phases in order", () => {
    let state = request("vm", "assembly");
    expect(transitionReducer(state, { type: "phase", id: 1, phase: "morphing" })).toBe(state);
    for (const phase of ["source-exiting", "morphing", "destination-entering"] as const) {
      state = transitionReducer(state, { type: "phase", id: 1, phase });
      expect(state.transition?.phase).toBe(phase);
    }
    expect(finish(state).layer).toBe("assembly");
  });
  it("preserves cursor, operation identity, bit and primitive through both directions", () => {
    for (const address of [0, 17, 18, 30]) {
      const focus = { ...inspection, address };
      const snapshot = { ...focus };
      const state = request("assembly", "machine", false, focus);
      expect(state.transition?.inspection).toEqual(snapshot);
      expect(state.transition?.inspection).not.toBe(focus);
      finish(state);
      finish(request("machine", "assembly", false, focus));
      expect(focus).toEqual(snapshot);
    }
  });
  it("reduced motion and direct ladder jumps reach the same state", () => {
    expect(finish(request("source", "nand", true))).toEqual(finish(request("source", "nand")));
    expect(finish(request("nand", "source", true)).layer).toBe("source");
  });
  it("maps the selected assembly address and protects hardware context at ROM 17", () => {
    const focus = { ...inspection, address: 17 };
    expect(relationship(demo, request("assembly", "machine", false, focus).transition!).source).toBe("asm-instruction-17");
    for (const layer of ["alu", "gate", "nand"] as const) {
      expect(relationship(demo, request("cpu", layer, false, focus).transition!)).toMatchObject({ kind: "context", destination: "arithmetic-context" });
    }
  });
  it("unfolds the focused operation without changing a cursor in another VM command", () => {
    const state = request("vm", "assembly", false, { ...inspection, address: 3 });
    expect(relationship(demo, state.transition!)).toMatchObject({ source: "vm-add", destination: "asm-group-vm:add", group: "vm:add", kind: "unfold" });
    expect(state.transition?.inspection.address).toBe(3);
  });
});
