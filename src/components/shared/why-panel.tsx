import { binary } from "@/core/alu";
import { type Layer } from "@/core/trace/graph";
import { focusedAddition, focusedHardware, type Demo } from "@/core/trace/demo";
import { pointerPath } from "@/core/trace/pointers";
import { commandForOperation, executionCursor } from "@/core/trace/execution";
import { memorySnapshot } from "@/core/trace/memory";
import { formatStatement } from "@/core/parser";
import { signed } from "@/core/limits";
import { LAYER_INFO } from "../navigation/ladder";
export function WhyPanel({ active, demo, address, bit, root, onFollow }: { active: Layer; demo: Demo; address: number; bit: number; root: string; onFollow: () => void }) {
  const info = LAYER_INFO[active], focus = demo.focuses.find(f => f.id === root)!, c = executionCursor(demo, address), m = memorySnapshot(demo, address);
  const operation = commandForOperation(demo, root) ?? demo.vm.find(v => v.sourceStatementId === focus.statementId), arithmetic = focusedAddition(demo, root, address), now = arithmetic?.cycleIndex === address;
  const cell = focus.symbol && m.cells.find(c => c.symbol.id === focus.symbol!.id);
  let what = info.what, why = info.why, connection = `Line ${c.statement.line} → ${c.vm.label} → ROM ${c.romAddress}. Cycle ${address + 1} executes this instruction.`;
  if (active === "source") {
    what = cell ? `${focus.label} names a stored sixteen-bit value.` : `Selected concept: ${focus.label}.`;
    why = cell ? `The compiler assigns ${cell.symbol.segment} ${cell.symbol.index}; the selected frame gives its actual RAM address.` : focus.role === "comparison" || focus.role === "control" ? "Decisions become ALU results, Boolean stack values and PC jumps." : focus.role === "call" || focus.role === "return" ? "Arguments and saved return addresses let machine execution move between stack frames." : focus.role === "array" ? "The base address plus an index chooses a memory location." : "Source syntax expresses intent; the compiler makes its operations explicit.";
  }
  if (active === "vm") { what = `${c.vm.label} is the current executed VM command.`; connection = ["gt", "lt", "eq"].includes(c.vm.kind) ? "The comparison leaves true = 0xFFFF or false = 0 on the stack. if-goto consumes that value." : c.vm.kind === "call" ? "call pushes the return address and saved LCL, ARG, THIS, THAT, then jumps to the function." : c.vm.kind === "return" ? "return places the value at ARG, restores the caller and jumps to the saved ROM address." : connection; }
  if (active === "cpu") {
    what = `One clock edge of ${c.assembly.text}.`;
    connection = c.frame.jump.bits ? `${c.machine.fields.kind === "C" ? c.machine.fields.jumpName : "Jump"}: zr=${Number(c.frame.alu?.zr)}, ng=${Number(c.frame.alu?.ng)}. ${c.frame.jump.taken ? "Taken" : "Not taken"}: PC ${c.frame.before.pc} → ${c.frame.after.pc}${c.frame.jump.backward ? "; execution moves backward" : ""}.` : c.frame.memory.write ? `A selects RAM[${c.frame.memory.address}]; the CPU writes ${signed(c.frame.memory.output!)} at this clock edge.` : c.frame.usesY && c.frame.ySource === "M" ? `The CPU reads RAM[${c.frame.memory.address}] = ${signed(c.frame.memory.input)}.${c.frame.memory.address === 24576 ? " The keyboard device appears as a memory address." : ""}` : c.frame.explanation;
  }
  if (cell && active === "source") connection = `${cell.symbol.segment} ${cell.symbol.index} → RAM[${cell.address}] = ${signed(cell.value)} after this cycle.`;
  if (now && arithmetic && ["alu", "gate", "nand"].includes(active)) {
    what = `${signed(arithmetic.left)} ${arithmetic.operator} ${signed(arithmetic.right)} = ${signed(arithmetic.addition.output)} using sixteen-bit arithmetic.`;
    connection = arithmetic.operator === "-" ? "Subtraction uses x + NOT(y) + 1 through the same adder and NAND primitives." : `The selected source arithmetic reaches a real adder; bit ${bit} is one of sixteen slices.`;
    if (arithmetic.operator === "+" && signed(arithmetic.left) + signed(arithmetic.right) !== signed(arithmetic.addition.output)) connection += " Signed overflow wraps to the low sixteen bits; it is not clamped.";
  }
  const hardware = focusedHardware(demo, root, address);
  if (hardware?.class === "bitwise" && hardware.cycleIndex === address && ["alu", "gate", "nand"].includes(active)) {
    what = `ALU ${hardware.primitive.toUpperCase()} produces ${hardware.output} (signed ${signed(hardware.output)}) across sixteen bits.`;
    why = "Bitwise operations act on corresponding bits independently. Each output uses a small Boolean circuit.";
    connection = hardware.primitive === "not" ? `Bit ${bit}: NOT ${hardware.slices[bit].a} = ${hardware.slices[bit].output}. NOT is NAND(A, A).` : `Bit ${bit}: ${hardware.slices[bit].a} ${hardware.primitive.toUpperCase()} ${hardware.slices[bit].b} = ${hardware.slices[bit].output}. ${hardware.primitive.toUpperCase()} uses ${hardware.primitive === "and" ? "two" : "three"} NAND gates.`;
  }
  const selectedArithmeticExecuted = focus.role === "arithmetic" && demo.additions.some(addition => addition.operationId === root);
  if (focus.role === "arithmetic" && !selectedArithmeticExecuted && ["alu", "gate", "nand"].includes(active)) {
    what = "This source arithmetic has no hardware event on this run.";
    why = "The branch containing this operation was skipped, so the CPU never executed an ALU operation for it.";
    connection = "Its compiled VM, assembly and machine code still exist, but there is no executed CPU cycle to trace into the ALU, gates or NAND.";
  }
  const pointerConcept = focus.role === "address-of" || focus.role === "dereference" || focus.role === "indirect-write" || focus.symbol?.valueKind === "pointer";
  const chain = pointerConcept ? pointerPath(demo, root, address).items : cell ? [focus.label, `${cell.symbol.segment} ${cell.symbol.index}`, `RAM[${cell.address}] = ${signed(cell.value)}`, operation?.label ?? "declaration"] : [focus.label, operation?.label ?? "declaration"];
  if (pointerConcept) {
    what = focus.role === "address-of" ? "& asks for the address of a variable's real storage." : focus.role === "dereference" || focus.role === "indirect-write" ? "* uses a pointer's stored numeric value as a RAM address." : "A pointer is a value containing an address, stored in its own RAM cell.";
    why = "The same memory hardware stores both ordinary values and numeric addresses.";
    connection = chain.join(" → ");
  }
  return <aside className="why-panel"><div className="identity-card"><span className="eyebrow">CONCEPT IN FOCUS</span><code>{focus.label}</code><div>Line {demo.statements.find(s => s.id === focus.statementId)?.line} · {focus.role}</div>{!arithmetic && focus.role !== "arithmetic" && demo.additions.length > 0 && <button onClick={onFollow}>Follow arithmetic →</button>}</div><section><span className="panel-number">01</span><h2>What am I looking at?</h2><p>{what}</p></section><section><span className="panel-number">02</span><h2>Why this layer?</h2><p>{why}</p></section><section><span className="panel-number">03</span><h2>Where did my code go?</h2><p>{connection}</p></section><div className="traceback"><span className="eyebrow">SOURCE FOCUS</span><ol>{chain.map((text, i) => <li key={i}><span className="trace-dot" /><code>{text}</code></li>)}</ol></div><div className="traceback"><span className="eyebrow">CURRENT EXECUTION</span><ol>{[formatStatement(c.statement), c.vm.label, `ROM ${c.romAddress} · ${c.assembly.text}`, binary(c.machine.value), `Cycle ${address + 1} · ${c.frame.sourceFunction}`].map((text, i) => <li key={i}><span className="trace-dot" /><code>{text}</code></li>)}</ol></div></aside>;
}

