import { executionCursor } from "../../core/trace/execution";
import { focusedAddition } from "../../core/trace/demo";
import type { Demo } from "../../core/trace/demo";
import type { Relationship } from "./anchors";
import { assemblyAnchor } from "./anchors";
import type { Transition } from "./state";

type Box = { left: number; top: number; width: number; height: number };
export interface VisualSnapshot { box: Box; clone: HTMLElement | SVGSVGElement; origin?: { left: number; top: number } }
const easing = "cubic-bezier(.22,.7,.22,1)";
const snapshotProperties = [
  "display", "align-items", "justify-content", "flex-direction", "gap", "flex-shrink",
  "margin", "padding", "border", "border-radius", "box-shadow", "box-sizing", "overflow",
  "background-color", "background-image", "color", "opacity", "visibility",
  "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing",
  "text-align", "text-anchor", "white-space", "text-transform", "vertical-align",
  "fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin",
];
export function anchor(scene: HTMLElement, id: string) {
  return scene.querySelector<HTMLElement | SVGGraphicsElement>(`[data-visual-anchor="${id}"]`);
}
export function capture(element: HTMLElement | SVGGraphicsElement, stage: HTMLElement): VisualSnapshot {
  const bounds = element.getBoundingClientRect();
  const parent = stage.getBoundingClientRect();
  const copy = element.cloneNode(true) as typeof element;
  const originals = [element, ...element.querySelectorAll<HTMLElement | SVGElement>("*")];
  const copies = [copy, ...copy.querySelectorAll<HTMLElement | SVGElement>("*")];
  originals.forEach((original, index) => {
    const style = getComputedStyle(original);
    const target = copies[index];
    // Copy visual/layout properties, not hundreds of unrelated computed browser defaults.
    for (const property of snapshotProperties) target.style.setProperty(property, style.getPropertyValue(property));
    target.removeAttribute("id"); target.removeAttribute("data-visual-anchor");
    target.removeAttribute("aria-pressed"); target.removeAttribute("aria-current");
    target.style.animation = "none"; target.style.transition = "none";
  });
  copy.style.visibility = "visible"; copy.style.opacity = "1";
  let clone: HTMLElement | SVGSVGElement;
  if (element instanceof SVGGraphicsElement) {
    const bbox = element.getBBox();
    clone = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    clone.setAttribute("viewBox", `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
    clone.append(copy);
  } else clone = copy as HTMLElement;
  Object.assign(clone.style, { width: "100%", height: "100%", maxWidth: "none", maxHeight: "none", minWidth: "0", margin: "0", pointerEvents: "none" });
  return { box: { left: bounds.left - parent.left, top: bounds.top - parent.top, width: bounds.width, height: bounds.height }, clone, origin: { left: parent.left, top: parent.top } };
}

export function revealAnchor(element: Element | null) {
  const list = element?.closest<HTMLElement>(".assembly-groups, .machine-rows");
  if (!element || !list) return;
  const box = element.getBoundingClientRect(), bounds = list.getBoundingClientRect();
  if (box.top < bounds.top || box.bottom > bounds.bottom) list.scrollTop += box.top - bounds.top - (list.clientHeight - box.height) / 2;
}

// All temporary objects and animations belong to one coordinator and one cleanup scope.
export function animateRelationship(stage: HTMLElement, source: VisualSnapshot | null, destinationScene: HTMLElement, mapping: Relationship, transition: Transition, demo: Demo) {
  const stageBounds = stage.getBoundingClientRect();
  const movedFrame = source?.origin ? Math.abs(source.origin.top - stageBounds.top) > 2 : false;
  if (source?.origin) source = { ...source, box: { ...source.box, left: source.box.left + source.origin.left - stageBounds.left, top: source.box.top + source.origin.top - stageBounds.top } };
  const overlay = document.createElement("div");
  overlay.className = "microscope-overlay"; overlay.setAttribute("aria-hidden", "true"); overlay.inert = true;
  stage.append(overlay);
  const animations: Animation[] = [];
  const destination = anchor(destinationScene, mapping.destination);
  const hidden: Array<HTMLElement | SVGGraphicsElement> = [];
  const hide = (element: HTMLElement | SVGGraphicsElement | null) => {
    if (element) { element.style.visibility = "hidden"; hidden.push(element); }
  };
  const play = (element: Element, frames: Keyframe[], duration: number, delay = 0) => {
    const animation = element.animate(frames, { duration, delay, easing, fill: "both" }); animations.push(animation); return animation;
  };
  const object = (snapshot: VisualSnapshot, start: Box, end: Box, delay = 0, duration = 500) => {
    const frame = document.createElement("div"); frame.className = "microscope-object"; frame.append(snapshot.clone); overlay.append(frame);
    play(frame, [start, end].map(box => ({ left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` })), duration, delay);
    return frame;
  };
  const disappear = (element: Element, delay: number, duration = 180) => play(element, [{ opacity: 1 }, { opacity: 0 }], duration, delay);
  const appear = (element: Element, delay: number, duration = 220) => play(element, [{ opacity: 0 }, { opacity: 1 }], duration, delay);
  const target = destination ? capture(destination, stage) : null;

  // Reduced motion and offscreen mobile anchors use immediate placement + a short highlight.
  const mobile = window.matchMedia("(max-width: 650px)").matches;
  const onScreen = source && source.box.top + stage.getBoundingClientRect().top >= 0 && source.box.top + stage.getBoundingClientRect().top < window.innerHeight;
  if (transition.reducedMotion || !source || !target || (mobile && (!onScreen || movedFrame))) {
    if (destination) play(destination, [{ filter: "brightness(1.45)" }, { filter: "brightness(1)" }], transition.reducedMotion ? 120 : 300);
  } else if (mapping.kind === "control") {
    const deeper = transition.direction === "deeper";
    const fieldsScene = deeper ? stage.querySelector<HTMLElement>(".scene-source")! : destinationScene;
    const word = deeper ? target : source;
    const instruction = executionCursor(demo, transition.inspection.address).machine;
    const parts = instruction.fields.kind === "C" ? [instruction.fields.prefix, instruction.fields.comp, instruction.fields.dest, instruction.fields.jump] : [instruction.fields.prefix, instruction.fields.address];
    let x = word.box.left;
    parts.forEach((part, index) => {
      const element = anchor(fieldsScene, `machine-field-${index}`)!;
      const snapshot = capture(element, stage);
      const fragment = { left: x, top: word.box.top, width: word.box.width * part.length / 16, height: word.box.height };
      x += fragment.width;
      const frame = object(snapshot, deeper ? snapshot.box : fragment, deeper ? fragment : snapshot.box, 120 + index * 20, 470);
      Object.assign(snapshot.clone.style, { padding: "0", display: "flex", alignItems: "center", justifyContent: "center" });
      const border = getComputedStyle(element).borderColor, background = getComputedStyle(element).backgroundColor;
      const fieldFont = getComputedStyle(element).fontSize, wordFont = `${word.box.height * .85}px`;
      play(snapshot.clone, [{ fontSize: deeper ? fieldFont : wordFont, borderColor: deeper ? border : "transparent", background: deeper ? background : "transparent" }, { fontSize: deeper ? wordFont : fieldFont, borderColor: deeper ? "transparent" : border, background: deeper ? "transparent" : background }], 470, 120 + index * 20);
      if (!deeper) appear(frame, 80, 160);
      hide(element);
    });
    hide(destination);
    const cpuScene = deeper ? destinationScene : stage.querySelector<HTMLElement>(".scene-source")!;
    if (deeper) cpuScene.querySelectorAll<SVGPathElement>(".wire.active path").forEach(path => {
      const length = path.getTotalLength();
      play(path, [{ strokeDasharray: `${length} ${length}`, strokeDashoffset: length }, { strokeDasharray: `${length} ${length}`, strokeDashoffset: 0 }], 320, 430);
    });
  } else if (mapping.kind === "encode") {
    const deeper = transition.direction === "deeper";
    const assembly = deeper ? source : target;
    const assemblyClone = object(assembly, assembly.box, assembly.box);
    const fieldsScene = deeper ? destinationScene : stage.querySelector<HTMLElement>(".scene-source")!;
    const instruction = executionCursor(demo, transition.inspection.address).machine;
    const parts = instruction.fields.kind === "C" ? [instruction.fields.prefix, instruction.fields.comp, instruction.fields.dest, instruction.fields.jump] : [instruction.fields.prefix, instruction.fields.address];
    const elements = parts.map((_, index) => anchor(fieldsScene, `machine-field-${index}`)!);
    const snapshots = elements.map(element => capture(element, stage));
    const font = parseFloat(getComputedStyle(elements[0]).fontSize);
    const character = font * .61;
    let x = assembly.box.left + assembly.box.width / 2 - instruction.bits.length * character / 2;
    snapshots.forEach((snapshot, index) => {
      const compact: Box = { left: x, top: assembly.box.top + assembly.box.height / 2 - snapshot.box.height / 2, width: parts[index].length * character, height: snapshot.box.height };
      x += compact.width;
      const frame = object(snapshot, deeper ? compact : snapshot.box, deeper ? snapshot.box : compact, 250, 400);
      snapshot.clone.style.padding = "0"; snapshot.clone.style.display = "flex"; snapshot.clone.style.alignItems = "center"; snapshot.clone.style.justifyContent = "center";
      const endBorder = getComputedStyle(elements[index]).borderColor, endBackground = getComputedStyle(elements[index]).backgroundColor;
      play(snapshot.clone, [{ borderColor: deeper ? "transparent" : endBorder, background: deeper ? "transparent" : endBackground }, { borderColor: deeper ? endBorder : "transparent", background: deeper ? endBackground : "transparent" }], 380, 270);
      if (deeper) appear(frame, 130, 160); else disappear(frame, 550, 120);
      hide(elements[index]);
    });
    if (deeper) disappear(assemblyClone, 100, 180); else appear(assemblyClone, 550, 150);
    hide(destination);
  } else if (mapping.kind === "unfold" && mapping.group) {
    const deeper = transition.direction === "deeper";
    const vm = deeper ? source : target;
    const groupScene = deeper ? destinationScene : stage.querySelector<HTMLElement>(".scene-source")!;
    const vmObject = object(vm, vm.box, vm.box);
    const lines = demo.assembly.filter(line => line.vmId === mapping.group);
    lines.forEach((line, index) => {
      const element = anchor(groupScene, assemblyAnchor(line.address))?.closest<HTMLElement>("button");
      if (!element) return;
      const snapshot = capture(element, stage);
      const folded = { ...vm.box, height: vm.box.height, top: vm.box.top };
      const frame = object(snapshot, deeper ? folded : snapshot.box, deeper ? snapshot.box : folded, 130 + (deeper ? index : lines.length - 1 - index) * 28, 400);
      if (deeper) appear(frame, 150 + index * 28, 180); else disappear(frame, 440 + index * 20, 150);
      hide(element);
    });
    if (deeper) disappear(vmObject, 100, 180); else appear(vmObject, 550, 150);
    hide(destination);
  } else {
    hide(destination);
    const start = source.box, end = target.box;
    const oldObject = object(source, start, end, 120, 470);
    const newObject = object(target, start, end, 120, 470);
    disappear(oldObject, 280, 200); appear(newObject, 310, 240);
    if (mapping.kind === "identity" && (transition.from === "source" || transition.to === "source") && (transition.from === "vm" || transition.to === "vm")) {
      const sourceFont = parseFloat(source.clone.style.fontSize), targetFont = parseFloat(target.clone.style.fontSize);
      Object.assign(target.clone.style, { display: "flex", alignItems: "center", justifyContent: "center", whiteSpace: "nowrap" });
      play(source.clone, [{ fontSize: `${sourceFont}px`, lineHeight: "1.1" }, { fontSize: `${targetFont}px`, lineHeight: "1.1" }], 470, 120);
      play(target.clone, [{ fontSize: `${sourceFont}px`, offset: 0 }, { fontSize: `${Math.max(28, targetFont)}px`, offset: .62 }, { fontSize: `${Math.max(28, targetFont)}px`, offset: .84 }, { fontSize: `${targetFont}px`, offset: 1 }], 530, 120);
    }
    if (mapping.kind === "decompose" && transition.direction === "deeper") disappear(newObject, 550, 70);
    if (mapping.kind === "slice" && transition.direction === "deeper") {
      // Show one full-adder interface before its existing XOR/AND/OR decomposition appears.
      const slice = focusedAddition(demo, transition.inspection.operationId, transition.inspection.address)!.addition.slices[transition.inspection.bit];
      const block = document.createElement("div"); block.className = "full-adder-interface";
      block.innerHTML = `<span>A = ${slice.a} &nbsp; B = ${slice.b} &nbsp; Cin = ${slice.cin}</span><strong>Full Adder · bit ${slice.index}</strong><span>Sum = ${slice.sum} &nbsp; Carry = ${slice.carry}</span>`;
      const frame = object({ clone: block, box: end }, start, end, 120, 400);
      appear(frame, 200, 100); disappear(frame, 500, 160);
      appear(newObject, 490, 200);
    }
  }
  return () => { animations.forEach(animation => animation.cancel()); hidden.forEach(element => { element.style.visibility = ""; }); overlay.remove(); };
}


