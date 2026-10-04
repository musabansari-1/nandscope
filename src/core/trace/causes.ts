import type { Demo } from "./demo";
import { flattenStatements, type StorageSymbol } from "../parser";
import { loopIteration } from "./execution";
import { signed } from "../limits";

export type CauseKind = "constant" | "initial" | "read" | "write" | "alu" | "pointer-read" | "pointer-write" | "address" | "return" | "branch" | "input" | "reference" | "limit";
export interface CauseNode {
  id: string; kind: CauseKind; label: string; value: number; cycleIndex?: number; address?: number; operationId?: string;
  frameId?: string; callCycle?: number; previousCycle?: number; iteration?: number; causes: CauseNode[];
}
export interface ValueCause { address: number; value: number; cycleIndex: number; sourceSymbol?: StorageSymbol; producingWrite?: number; causes: CauseNode[]; truncated: boolean }
type Index = Map<number, CauseNode[]>;
const cache = new WeakMap<Demo, Index>();
function buildIndex(demo: Demo): Index {
  const writes: Index = new Map(), memory = new Map<number, CauseNode>();
  const leaf = (id: string, kind: CauseKind, value: number, label: string, cycleIndex?: number): CauseNode => ({ id, kind, value, label, cycleIndex, causes: [] });
  let a = leaf("initial:A", "initial", 0, "Initial A = 0"), d = leaf("initial:D", "initial", 0, "Initial D = 0");
  const initialRAM = demo.frames[0]?.before.ram;
  const read = (address: number) => memory.get(address) ?? leaf(`initial:${address}`, address === 24576 ? "input" : "initial", initialRAM?.[address] ?? 0, address === 24576 ? `Memory-mapped input KBD = ${signed(initialRAM?.[address] ?? 0)}` : `Initial RAM[${address}] = ${signed(initialRAM?.[address] ?? 0)}`);
  const vmMap = new Map(demo.vm.map(v => [v.id, v]));
  const hardware = new Map(demo.hardware.map(h => [h.cycleIndex, h]));
  const pointer = new Map(demo.pointerEvents.map(p => [p.cycleIndex, p]));
  const controls = demo.statements.filter(s => s.kind === "if" || s.kind === "while");
  const decisions = new Map<string, CauseNode>();
  let previousVM = "", operands: CauseNode[] = [];
  for (const f of demo.frames) {
    const machine = demo.machine[f.romAddress], fields = machine.fields, command = vmMap.get(f.vmId)!;
    const node = (kind: CauseKind, label: string, value: number, causes: CauseNode[]): CauseNode => ({ id: `${kind}:${f.cycleIndex}`, kind, label, value, cycleIndex: f.cycleIndex, operationId: f.sourceId, frameId: f.frameId, causes: [...new Map(causes.map(c => [c.id, c])).values()] });
    if (f.vmId !== previousVM) { operands = [read(f.before.ram[0] - 2), read(f.before.ram[0] - 1)]; previousVM = f.vmId; }
    if (fields.kind === "A") { a = leaf(`constant:${f.cycleIndex}`, "constant", f.after.a, `Constant ${signed(f.after.a)}`, f.cycleIndex); continue; }
    let m = read(f.memory.address);
    const symbol = demo.bindings[command.sourceId];
    const location = symbol && (symbol.segment === "static" ? 1536 : f.before.ram[symbol.segment === "argument" ? 2 : 1]) + symbol.index;
    if (f.usesY && f.ySource === "M" && f.memory.address === location && command.kind === "push") {
      m = { ...node("read", `${symbol.name} was ${signed(f.memory.input)} · RAM[${f.memory.address}]`, f.memory.input, [m]), address: f.memory.address };
    }
    const comp = fields.compName, y = f.ySource === "M" ? m : a;
    let value: CauseNode;
    if (comp === "D") value = d;
    else if (comp === "M" || comp === "A") value = y;
    else if (["0", "1", "-1"].includes(comp)) value = leaf(`constant:${f.cycleIndex}`, "constant", f.alu!.output, `Constant ${signed(f.alu!.output)}`, f.cycleIndex);
    else value = node("alu", `${comp} = ${signed(f.alu!.output)}`, f.alu!.output, [ ...(f.usesD ? [d] : []), ...(f.usesY ? [y] : []) ]);
    const h = hardware.get(f.cycleIndex);
    if (h) value = node("alu", `${signed(h.left)} ${h.operator} ${h.class === "bitwise" && h.primitive === "not" ? "" : signed(h.right)} = ${signed(f.alu!.output)} · ALU ${command.kind.toUpperCase()}`, f.alu!.output, h.class === "bitwise" && h.primitive === "not" ? [m] : [m, d]);
    if (["gt", "lt", "eq"].includes(command.kind) && f.memory.write && (comp === "0" || comp === "-1")) {
      const operator = command.kind === "gt" ? ">" : command.kind === "lt" ? "<" : "==";
      value = node("alu", `${signed(operands[0].value)} ${operator} ${signed(operands[1].value)} → ${f.alu!.output ? "true" : "false"} · executed comparison`, f.alu!.output, operands);
    }
    const p = pointer.get(f.cycleIndex);
    if (p) {
      const storage = demo.allSymbols.find(s => s.id === p.storageId)!;
      const pointerAddress = (storage.segment === "static" ? 1536 : f.before.ram[storage.segment === "argument" ? 2 : 1]) + storage.index;
      if (p.effect === "address") value = node("address", `&${storage.name} resolved to RAM[${p.effectiveAddress}]`, p.value, []);
      else if (p.effect === "read") value = { ...node("pointer-read", `${storage.name} stored ${p.effectiveAddress} → *${storage.name} read RAM[${p.effectiveAddress}] = ${signed(p.value)}`, p.value, [read(pointerAddress), m]), address: p.effectiveAddress };
      else value = { ...node("pointer-write", `${storage.name} stored ${p.effectiveAddress} → *${storage.name} selected RAM[${p.effectiveAddress}] · indirect write ${signed(f.memory.input)} → ${signed(p.value)}`, p.value, [read(pointerAddress), value]), address: p.effectiveAddress };
    }
    if (command.kind === "return" && f.memory.write && f.memory.address === f.before.ram[2] && comp === "D") {
      const call = f.beforeStack.at(-1);
      value = { ...node("return", `${call?.name ?? f.sourceFunction} returned ${signed(f.memory.output!)} · ${call?.id ?? f.frameId}`, f.memory.output!, [value]), callCycle: call?.callCycle };
    }
    if (command.kind === "if-goto" && f.jump.bits) decisions.set(`${command.sourceStatementId}:${f.frameId}`, node("branch", `Condition ${f.before.d ? "true" : "false"} · PC ${f.romAddress} → ${f.after.pc} · jump ${f.jump.taken ? "taken" : "not taken"}`, f.before.d, [d]));
    if (f.destinations.includes("M")) {
      const address = f.memory.address;
      // Scratch / stack copies retain value identity. Named and user RAM writes
      // become explicit events; the CPU write history is indexed for every cell.
      const userCell = demo.allSymbols.some(s => address === (s.segment === "static" ? 1536 : s.scope === "main" ? 300 : f.before.ram[s.segment === "argument" ? 2 : 1]) + s.index && (s.scope === "main" || s.scope === f.sourceFunction));
      const meaningful = userCell || p?.effect === "write" || address >= 2048 || value.kind === "return";
      let stored = value;
      const previous = writes.get(address)?.at(-1);
      if (meaningful && !(command.kind === "return" && value.kind === "return")) {
        const branchCauses = controls.filter(s => flattenStatements(s.kind === "if" ? [...s.then, ...s.otherwise] : s.kind === "while" ? s.body : []).some(child => child.id === f.sourceStatementId)).map(s => decisions.get(`${s.id}:${f.frameId}`)).filter((n): n is CauseNode => !!n);
        stored = { ...node("write", `RAM[${address}] changed ${signed(f.memory.input)} → ${signed(f.memory.output!)} · ${demo.assembly[f.romAddress].text}`, f.memory.output!, [value, ...branchCauses]), address, previousCycle: previous?.cycleIndex, iteration: loopIteration(demo, f.sourceStatementId, f.cycleIndex) };
      }
      memory.set(address, stored);
      const event = { ...stored, cycleIndex: f.cycleIndex, address, previousCycle: previous?.cycleIndex };
      const history = writes.get(address) ?? []; history.push(event); writes.set(address, history);
    }
    if (f.destinations.includes("D")) d = value;
    if (f.destinations.includes("A")) a = value;
  }
  return writes;
}
export function explainValue(demo: Demo, query: { address: number; cycleIndex: number; maxDepth?: number; maxNodes?: number }): ValueCause {
  const cycleIndex = Math.max(0, Math.min(demo.frames.length - 1, Math.trunc(query.cycleIndex))), address = Math.max(0, Math.min(32767, Math.trunc(query.address)));
  let index = cache.get(demo); if (!index) { index = buildIndex(demo); cache.set(demo, index); }
  const write = index.get(address)?.findLast(w => w.cycleIndex! <= cycleIndex);
  const value = demo.frames[cycleIndex].after.ram[address], frame = demo.frames[cycleIndex];
  const symbol = demo.allSymbols.find(s => (s.scope === "main" || s.scope === frame.callStack.at(-1)?.name) && address === (s.segment === "static" ? 1536 : s.scope === "main" ? 300 : frame.after.ram[s.segment === "argument" ? 2 : 1]) + s.index);
  const seen = new Set<string>(); let truncated = false, count = 0;
  function bounded(node: CauseNode, depth: number): CauseNode {
    if (seen.has(node.id)) return { ...node, kind: "reference", label: `${node.label} · already shown`, causes: [] };
    if (depth >= (query.maxDepth ?? 7) || count >= (query.maxNodes ?? 48)) { truncated = true; return { ...node, kind: "limit", causes: [] }; }
    count++; seen.add(node.id); return { ...node, causes: node.causes.map(n => bounded(n, depth + 1)) };
  }
  return { address, value, cycleIndex, sourceSymbol: symbol, producingWrite: write?.cycleIndex, ...(() => {
    const causes = [bounded(write ?? { id: `initial:${address}`, kind: address === 24576 ? "input" : "initial", label: `Initial ${address === 24576 ? "KBD input" : `RAM[${address}]`} = ${signed(value)} · no write before this cycle`, value, address, causes: [] }, 0)];
    return { causes, truncated };
  })() };
}
