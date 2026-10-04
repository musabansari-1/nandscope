"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createDemo } from "@/core/trace/demo";
import { memorySnapshot } from "@/core/trace/memory";
import { EXAMPLES } from "@/core/vm";
import { binary } from "@/core/alu";
import { signed } from "@/core/limits";
import "./guided.css";
import { ShareButton } from "./shared/share-button";
import type { ShareState, ConceptId } from "@/core/trace/share";

type GuideStep = {
  eyebrow: string;
  title: string;
  explanation: string;
  visual: ReactNode;
  detailTitle: string;
  detail: ReactNode;
};

type Guide = {
  id: ConceptId;
  marker: string;
  question: string;
  cardQuestion?: string;
  promise: string;
  source: string;
  steps: GuideStep[];
};

function Code({ children, emphasis }: { children: ReactNode; emphasis?: boolean }) {
  return <code className={emphasis ? "guide-code emphasis" : "guide-code"}>{children}</code>;
}

function Arrow() { return <div className="guide-arrow" aria-hidden="true">↓</div>; }

function Flow({ items }: { items: { text: string; emphasis?: boolean }[] }) {
  return <div className="guide-flow">{items.map((item, index) => <div key={`${item.text}-${index}`} className="guide-flow-item"><div><Code emphasis={item.emphasis}>{item.text}</Code></div>{index < items.length - 1 && <span aria-hidden="true">↓</span>}</div>)}</div>;
}

function makeGuides(): Guide[] {
  const arithmetic = createDemo(EXAMPLES.Arithmetic);
  const add = arithmetic.additions[0];
  const addVm = arithmetic.vm.find(command => command.id === add.vmId)!;
  const addAssembly = arithmetic.assembly.filter(line => line.vmId === addVm.id).filter(line => line.address >= 0);
  const addMachine = arithmetic.machine[add.romAddress];
  const addFrame = arithmetic.frames[add.cycleIndex];
  const interestingSlice = add.addition.slices.find(slice => slice.carry === 1) ?? add.addition.slices[0];

  const memory = createDemo(EXAMPLES.Memory);
  const memoryFinal = memorySnapshot(memory, memory.frames.length - 1);
  const memoryX = memoryFinal.cells.find(cell => cell.symbol.name === "x")!;
  const memoryY = memoryFinal.cells.find(cell => cell.symbol.name === "y")!;

  const decision = createDemo(EXAMPLES.Decision);
  const decisionFinal = memorySnapshot(decision, decision.frames.length - 1);
  const decisionResult = decisionFinal.cells.find(cell => cell.symbol.name === "result")!;
  const takenJump = decision.frames.find(frame => frame.jump.taken && frame.jump.bits !== 0);

  const loop = createDemo(EXAMPLES.Loop);
  const loopFinal = memorySnapshot(loop, loop.frames.length - 1);
  const loopX = loopFinal.cells.find(cell => cell.symbol.name === "x")!;

  const fn = createDemo(EXAMPLES.Function);
  const fnFinal = memorySnapshot(fn, fn.frames.length - 1);
  const fnResult = fnFinal.cells.find(cell => cell.symbol.name === "result")!;
  const fnFrame = fn.frames.find(frame => frame.callStack.length === 1)?.callStack[0];

  const array = createDemo(EXAMPLES.Array);
  const arrayFinal = memorySnapshot(array, array.frames.length - 1);
  const arrayView = arrayFinal.arrays[0];
  const arrayX = arrayFinal.cells.find(cell => cell.symbol.name === "x")!;

  const io = createDemo(EXAMPLES["I/O"], { keyboard: 65 });
  const ioFinal = memorySnapshot(io, io.frames.length - 1);
  const ioKey = ioFinal.cells.find(cell => cell.symbol.name === "key")!;
  const screen = ioFinal.screen[0];
  const pointers = createDemo(EXAMPLES.Pointer), pointerFinal = memorySnapshot(pointers, pointers.frames.length - 1);
  const px = pointerFinal.cells.find(c => c.symbol.name === "x")!, pp = pointerFinal.cells.find(c => c.symbol.name === "p")!, py = pointerFinal.cells.find(c => c.symbol.name === "y")!;
  const pointerRead = pointers.pointerEvents.find(e => e.effect === "read")!;
  const bits = createDemo(EXAMPLES["Bitwise AND"]), bitwise = bits.bitwise[0], bitSlice = bitwise.slices[3];

  return [
    {
      id: "pointer", marker: "&x", question: "What is a pointer, really?", promise: "Discover how a number stored in memory can point to another value.", source: EXAMPLES.Pointer,
      steps: [
        { eyebrow: "A VALUE HAS A HOME", title: "x is stored somewhere.", explanation: "The source name x labels a value. That value lives in a real memory cell.", visual: <Flow items={[{ text: "x" }, { text: `RAM[${px.address}] = ${px.value}`, emphasis: true }]} />, detailTitle: "Actual storage", detail: <p>x is local slot {px.symbol.index}. The simulator&apos;s LCL plus that slot index resolves to RAM[{px.address}].</p> },
        { eyebrow: "ASK FOR THE LOCATION", title: "&x gives you x's address.", explanation: "The & asks where x lives. The answer is a number, rather than the value 7 stored there.", visual: <Flow items={[{ text: "&x" }, { text: String(px.address), emphasis: true }]} />, detailTitle: "Machine computation", detail: <p>The address-of command loads LCL and adds the slot index. The executed address calculation produces {pointers.pointerEvents.find(e => e.effect === "address")!.value}.</p> },
        { eyebrow: "AN ADDRESS IS A VALUE TOO", title: "p stores that number.", explanation: "p has its own memory cell. Its contents are x's address. This is what makes p a pointer.", visual: <Flow items={[{ text: "p" }, { text: `RAM[${pp.address}] = ${pp.value}`, emphasis: true }, { text: `${pp.value} is an address` }]} />, detailTitle: "Two distinct locations", detail: <p>x lives at RAM[{px.address}]. p lives at RAM[{pp.address}] and contains {pp.value}.</p> },
        { eyebrow: "FOLLOW THE ADDRESS", title: "*p uses that number as an address.", explanation: "The * says: read p, then use its stored number to select another RAM cell. This is called dereferencing.", visual: <Flow items={[{ text: "*p" }, { text: `p contains ${pp.value}` }, { text: `RAM[${pointerRead.effectiveAddress}]` }, { text: String(pointerRead.value), emphasis: true }]} />, detailTitle: "Actual indirect read", detail: <p>At cycle {pointerRead.cycleIndex + 1}, the CPU reads RAM[{pointerRead.effectiveAddress}] = {pointerRead.value}. The generated A=D instruction loads the stored address into A before D=M reads RAM[A].</p> },
        { eyebrow: "STORE THE RESULT", title: "y receives the value 7.", explanation: "The read value is copied to y. x holds a value, p holds an address, and *p follows that address to the value.", visual: <Flow items={[{ text: "y = *p" }, { text: `RAM[${py.address}] = ${py.value}`, emphasis: true }]} />, detailTitle: "Try an indirect write", detail: <p>In Explorer, <Code>let *p = 9;</Code> writes through the same address and changes x. All three values are taken from CPU RAM.</p> },
      ],
    },
    {
      id: "bitwise", marker: "&", question: "What does a bitwise operation actually do?", cardQuestion: "What does bitwise AND do inside the CPU?", promise: "Line up two binary words and follow one bit through AND to NAND.", source: EXAMPLES["Bitwise AND"],
      steps: [
        { eyebrow: "TWO BINARY WORDS", title: "Line up corresponding bits.", explanation: "12 and 10 are sixteen-bit words. Unlike addition, a bitwise operation considers each pair of bits independently.", visual: <div className="guide-binary-words"><Code>12 = {binary(bitwise.left)}</Code><Code>10 = {binary(bitwise.right)}</Code></div>, detailTitle: "Compiler and machine", detail: <p>The source &amp; becomes VM <Code>and</Code>, then the real Hack instruction <Code>M=D&amp;M</Code>: <Code>{bits.machine[bitwise.romAddress].bits}</Code>.</p> },
        { eyebrow: "AND EACH PAIR", title: "Only two 1s produce a 1.", explanation: "AND keeps a bit only when both input bits are 1. The resulting word is 8.", visual: <Flow items={[{ text: `${binary(bitwise.left)} &` }, { text: binary(bitwise.right) }, { text: binary(bitwise.output), emphasis: true }, { text: String(bitwise.output), emphasis: true }]} />, detailTitle: "Real ALU edge", detail: <p>Cycle {bitwise.cycleIndex + 1}, ROM {bitwise.romAddress} configures the ALU for AND and produces {bitwise.output}. No source expression is evaluated in JavaScript.</p> },
        { eyebrow: "ZOOM INTO ONE BIT", title: "One pair tells the whole story.", explanation: "At bit 3, both inputs contain 1, so the output is 1. The same rule repeats at all sixteen positions.", visual: <div className="guide-bit-card"><span>BIT 3</span><div><Code>A={bitSlice.a}</Code><Code>B={bitSlice.b}</Code></div><Arrow /><Code emphasis>{bitSlice.a} AND {bitSlice.b} = {bitSlice.output}</Code></div>, detailTitle: "Independent bits", detail: <p>There are no carry signals. You can select any bit in Explorer. OR and NOT have their own corresponding primitive circuits.</p> },
        { eyebrow: "ZOOM DOWN TO NAND", title: "Two NANDs build this AND.", explanation: "The first NAND flips the AND result. A second NAND with tied inputs flips it back.", visual: <Flow items={[{ text: "NAND(1, 1) = 0" }, { text: "NAND(0, 0) = 1", emphasis: true }]} />, detailTitle: "Other bitwise primitives", detail: <p>OR uses three NANDs. NOT uses one: <Code>NAND(A, A)</Code>. Each construction is repeated independently across the word.</p> },
      ],
    },
    {
      id: "arithmetic",
      marker: "+",
      question: "How does addition actually happen?",
      promise: "Follow one + from your code all the way down to NAND gates.",
      source: EXAMPLES.Arithmetic,
      steps: [
        {
          eyebrow: "YOUR CODE",
          title: "Start with one tiny question.",
          explanation: "You wrote 7 + 9. The CPU cannot execute that source expression directly, so we will follow only the + and ignore everything else.",
          visual: <div className="guide-source-line"><span>let x = 7 </span><b>+</b><span> 9;</span></div>,
          detailTitle: "What should I notice?",
          detail: <p>The variable name and punctuation are useful to you. The operation <Code emphasis>+</Code> is the piece of work we are tracing.</p>,
        },
        {
          eyebrow: "THE COMPILER MAKES THE WORK EXPLICIT",
          title: "The + becomes a stack operation.",
          explanation: "The compiler first turns the expression into a tiny sequence: put 7 on the stack, put 9 on the stack, add them, then store the answer.",
          visual: <Flow items={[{ text: "push constant 7" }, { text: "push constant 9" }, { text: "add", emphasis: true }, { text: "pop local 0" }]} />,
          detailTitle: "Why use a VM layer?",
          detail: <p>It is a simple intermediate language. <Code>add</Code> means: remove the top two stack values, add them, and push the result.</p>,
        },
        {
          eyebrow: "THE PROCESSOR NEEDS SMALLER INSTRUCTIONS",
          title: "One add becomes several assembly instructions.",
          explanation: "The machine must explicitly move the two stack values into position. The final highlighted instruction is the clock cycle where the arithmetic occurs.",
          visual: <div className="guide-instruction-list">{addAssembly.map(line => <Code key={line.address} emphasis={line.address === add.romAddress}>{line.text}</Code>)}</div>,
          detailTitle: "Exact relationship",
          detail: <p><Code>add</Code> expands into {addAssembly.length} executable instructions. <Code emphasis>{arithmetic.assembly[add.romAddress].text}</Code> is at ROM {add.romAddress}.</p>,
        },
        {
          eyebrow: "ASSEMBLY BECOMES BITS",
          title: "The instruction is encoded as 16 bits.",
          explanation: "Those bits are not decoration. They tell the CPU which computation to perform, where the result goes, and whether to jump.",
          visual: <Flow items={[{ text: arithmetic.assembly[add.romAddress].text, emphasis: true }, { text: addMachine.bits }]} />,
          detailTitle: "Exact machine word",
          detail: <p>The real Hack machine word is <Code>{addMachine.bits}</Code>. Its decoded instruction is still <Code>{arithmetic.assembly[add.romAddress].text}</Code>.</p>,
        },
        {
          eyebrow: "NOW THE CPU ACTS",
          title: "Two values meet at the ALU.",
          explanation: `At this clock cycle, the CPU feeds ${signed(add.left)} and ${signed(add.right)} into the arithmetic path and writes the 16-bit result back to memory.`,
          visual: <div className="guide-equation"><Code>{signed(add.left)}</Code><span>+</span><Code>{signed(add.right)}</Code><span>=</span><Code emphasis>{signed(add.addition.output)}</Code></div>,
          detailTitle: "Exact execution point",
          detail: <p>Cycle {add.cycleIndex + 1}, ROM {add.romAddress}. Before this clock edge D={signed(addFrame.before.d)} and the selected memory input is {signed(addFrame.memory.input)}.</p>,
        },
        {
          eyebrow: "ZOOM INTO ONE BIT",
          title: "Sixteen one-bit adders work together.",
          explanation: "A 16-bit addition is built from 16 small slices. Each slice produces one sum bit and a carry that can feed the next slice.",
          visual: <div className="guide-bit-card"><span>BIT {interestingSlice.index}</span><div><Code>A={interestingSlice.a}</Code><Code>B={interestingSlice.b}</Code><Code>Cin={interestingSlice.cin}</Code></div><Arrow /><div><Code emphasis>Sum={interestingSlice.sum}</Code><Code>Carry={interestingSlice.carry}</Code></div></div>,
          detailTitle: "Binary values",
          detail: <p>{binary(add.left)} + {binary(add.right)} = <Code>{binary(add.addition.output)}</Code>. This bit slice is taken from the real ripple-carry calculation.</p>,
        },
        {
          eyebrow: "THE BOTTOM OF THIS MICROSCOPE",
          title: "Those gates can be built from NAND.",
          explanation: "XOR, AND and OR build the full adder. Each of those gates can itself be constructed entirely from NAND gates.",
          visual: <Flow items={[{ text: "full adder" }, { text: "XOR · AND · OR" }, { text: "NAND", emphasis: true }]} />,
          detailTitle: "The main idea",
          detail: <p>Nothing magical was added on the way down. Each layer is a more concrete implementation of the layer above it.</p>,
        },
      ],
    },
    {
      id: "memory",
      marker: "x",
      question: "Where does a variable actually live?",
      promise: "See a source name turn into a concrete RAM address and value.",
      source: EXAMPLES.Memory,
      steps: [
        { eyebrow: "YOUR CODE", title: "A name is useful to humans.", explanation: "You call the value x. The processor does not know that name; the compiler must assign storage for it.", visual: <Flow items={[{ text: "x", emphasis: true }, { text: "local 0" }]} />, detailTitle: "Compiler mapping", detail: <p>The first local variable is assigned local slot 0.</p> },
        { eyebrow: "A SLOT BECOMES AN ADDRESS", title: "local 0 resolves to RAM.", explanation: "With LCL pointing at 300, local 0 means RAM[300].", visual: <Flow items={[{ text: "local 0" }, { text: `RAM[${memoryX.address}]`, emphasis: true }]} />, detailTitle: "Actual simulated address", detail: <p>The final execution state resolves x to RAM[{memoryX.address}].</p> },
        { eyebrow: "THE VALUE LIVES THERE", title: "Writing x changes memory.", explanation: `The machine eventually stores ${signed(memoryX.value)} at that address.`, visual: <div className="guide-memory-cell"><span>RAM[{memoryX.address}]</span><Code emphasis>{signed(memoryX.value)}</Code></div>, detailTitle: "Real value", detail: <p>This is read from the simulated CPU RAM, not from separate UI state.</p> },
        { eyebrow: "READING A VARIABLE", title: "y = x means: read that address.", explanation: `The value ${signed(memoryX.value)} is loaded from x's address and later stored for y.`, visual: <Flow items={[{ text: `RAM[${memoryX.address}] = ${signed(memoryX.value)}` }, { text: "push local 0" }, { text: `RAM[${memoryY.address}] = ${signed(memoryY.value)}`, emphasis: true }]} />, detailTitle: "What you learned", detail: <p>A variable is ultimately a value at an address. The source name is a convenient label.</p> },
      ],
    },
    {
      id: "decision",
      marker: "if",
      question: "How does an if statement choose?",
      promise: "Watch a comparison become a jump in the Program Counter.",
      source: EXAMPLES.Decision,
      steps: [
        { eyebrow: "YOUR CODE", title: "The source describes a choice.", explanation: "Here x is 7 and y is 9, so the question is whether 7 > 9.", visual: <div className="guide-equation"><Code>7</Code><span>&gt;</span><Code>9</Code><span>?</span></div>, detailTitle: "Result", detail: <p>The condition is false.</p> },
        { eyebrow: "THE COMPARISON BECOMES DATA", title: "False becomes a machine value.", explanation: "The comparison leaves a Boolean value on the stack. In this machine false is 0; true is all 1 bits.", visual: <Flow items={[{ text: "gt" }, { text: "false = 0000000000000000", emphasis: true }]} />, detailTitle: "Why all ones for true?", detail: <p>The VM convention uses -1 (0xFFFF) for true and 0 for false.</p> },
        { eyebrow: "THE CPU DOES NOT UNDERSTAND IF", title: "It understands jumps.", explanation: "Jump logic examines the result and decides which ROM address the Program Counter should use next.", visual: <Flow items={[{ text: "comparison result" }, { text: "conditional jump" }, { text: "Program Counter", emphasis: true }]} />, detailTitle: "A real jump from this run", detail: <p>{takenJump ? <>One taken jump changes PC from ROM {takenJump.before.pc} to ROM {takenJump.after.pc}.</> : <>This run contains real conditional branch instructions.</>}</p> },
        { eyebrow: "ONE PATH RUNS", title: "The other branch still exists, but is skipped.", explanation: `Because 7 > 9 is false, the else path writes ${signed(decisionResult.value)} into result.`, visual: <div className="guide-branch"><div className="skipped">IF branch<br /><small>not executed</small></div><div className="taken">ELSE branch<br /><strong>executed</strong></div></div>, detailTitle: "Key idea", detail: <p>An if statement becomes: compute a condition, then choose the next instruction address.</p> },
      ],
    },
    {
      id: "loop",
      marker: "↻",
      question: "Why does a loop repeat?",
      promise: "See the same ROM instructions execute again because the PC jumps backward.",
      source: EXAMPLES.Loop,
      steps: [
        { eyebrow: "YOUR CODE", title: "Repeat while x < 3.", explanation: "x begins at 0. The machine checks the condition before each pass through the body.", visual: <div className="guide-source-line"><span>while (x &lt; 3)</span></div>, detailTitle: "Starting value", detail: <p>x begins at 0.</p> },
        { eyebrow: "THE BODY CHANGES MEMORY", title: "Each executed pass increments x.", explanation: "The same source line runs three times, producing x = 1, then 2, then 3.", visual: <Flow items={[{ text: "x = 0" }, { text: "x = 1" }, { text: "x = 2" }, { text: `x = ${signed(loopX.value)}`, emphasis: true }]} />, detailTitle: "Executed additions", detail: <p>The simulator recorded {loop.additions.length} executed + operations inside the loop body.</p> },
        { eyebrow: "THE SECRET IS THE PROGRAM COUNTER", title: "A backward jump causes repetition.", explanation: "After the body, the PC jumps back to the condition&apos;s ROM address instead of continuing forward.", visual: <div className="guide-loop-visual"><Code>condition</Code><span>→ body →</span><Code emphasis>jump backward ↺</Code></div>, detailTitle: "ROM versus time", detail: <p>This program has {loop.machine.length} ROM words but {loop.frames.length} executed CPU cycles because some ROM addresses are revisited.</p> },
        { eyebrow: "THE FOURTH CHECK FAILS", title: "3 < 3 is false, so repetition stops.", explanation: "There are three body iterations but four condition visits. The final check exits the loop.", visual: <Flow items={[{ text: "0 < 3 ✓" }, { text: "1 < 3 ✓" }, { text: "2 < 3 ✓" }, { text: "3 < 3 ✕", emphasis: true }]} />, detailTitle: "Important distinction", detail: <p>Condition visit 4 is not a fourth body iteration.</p> },
      ],
    },
    {
      id: "function",
      marker: "fn",
      question: "What happens when a function is called?",
      promise: "Follow arguments, a new stack frame, a return address, and the result.",
      source: EXAMPLES.Function,
      steps: [
        { eyebrow: "THE CALL", title: "add(2, 3) must temporarily move execution elsewhere.", explanation: "The caller passes two arguments and needs to remember where execution should continue afterward.", visual: <div className="guide-source-line"><span>result = </span><b>add(2, 3)</b></div>, detailTitle: "Function result", detail: <p>The real run ends with result = {signed(fnResult.value)}.</p> },
        { eyebrow: "SAVE THE WAY BACK", title: "A return address is stored.", explanation: "Before entering add, the machine saves enough state to restore the caller later.", visual: <Flow items={[{ text: "arguments: 2, 3" }, { text: `return → ROM ${fnFrame?.returnAddress ?? "?"}`, emphasis: true }, { text: "saved frame state" }]} />, detailTitle: "Actual frame", detail: <p>{fnFrame ? <>The callee uses ARG={fnFrame.arg} and LCL={fnFrame.lcl} in this run.</> : <>The simulator builds a real call frame.</>}</p> },
        { eyebrow: "INSIDE THE FUNCTION", title: "Arguments become frame-relative memory.", explanation: "a and b are not global names. Inside this call they refer to argument slots in the current frame.", visual: <Flow items={[{ text: "a → argument 0" }, { text: "b → argument 1" }, { text: "sum → local 0", emphasis: true }]} />, detailTitle: "Why frames matter", detail: <p>Each function call can have its own arguments and locals without overwriting another active call.</p> },
        { eyebrow: "RETURN", title: "The result goes back to the caller.", explanation: "The function leaves its return value for the caller, restores the saved frame, and jumps back to the saved ROM address.", visual: <Flow items={[{ text: "sum = 5" }, { text: "return" }, { text: `result = ${signed(fnResult.value)}`, emphasis: true }]} />, detailTitle: "Key idea", detail: <p>A function call is control flow plus a disciplined memory layout.</p> },
      ],
    },
    {
      id: "array",
      marker: "[]",
      question: "How does values[i] find the right memory?",
      promise: "Watch a base address and index become one effective RAM address.",
      source: EXAMPLES.Array,
      steps: [
        { eyebrow: "THE ARRAY", title: "An array occupies consecutive memory words.", explanation: `The example allocates four words. Its first element begins at RAM[${arrayView.base}].`, visual: <div className="guide-array-row">{arrayView.cells.map(cell => <div key={cell.address}><small>[{cell.index}]</small><Code>{signed(cell.value)}</Code><span>RAM[{cell.address}]</span></div>)}</div>, detailTitle: "Real allocation", detail: <p>This base address comes from the simulated heap allocation.</p> },
        { eyebrow: "THE INDEX", title: "values[1] is address arithmetic.", explanation: "The CPU takes the array&apos;s base address and adds the index.", visual: <div className="guide-equation"><Code>{arrayView.base}</Code><span>+</span><Code>1</Code><span>=</span><Code emphasis>{arrayView.base + 1}</Code></div>, detailTitle: "Effective address", detail: <p>base + index = RAM[{arrayView.base + 1}].</p> },
        { eyebrow: "READ MEMORY", title: "The effective address selects the value.", explanation: `RAM[${arrayView.base + 1}] contains 9, so the read produces 9.`, visual: <Flow items={[{ text: "values[1]" }, { text: `RAM[${arrayView.base + 1}]` }, { text: "9", emphasis: true }]} />, detailTitle: "Final variable", detail: <p>The program stores that value in x, which finishes as {signed(arrayX.value)}.</p> },
      ],
    },
    {
      id: "io",
      marker: "I/O",
      question: "How can a keyboard look like memory?",
      promise: "See memory-mapped I/O turn devices into ordinary CPU reads and writes.",
      source: EXAMPLES["I/O"],
      steps: [
        { eyebrow: "KEYBOARD INPUT", title: "The keyboard appears at one RAM address.", explanation: "For this demonstration the simulated key value is 65. The CPU reads it from the Hack keyboard address.", visual: <Flow items={[{ text: "keyboard()" }, { text: "RAM[24576]" }, { text: String(signed(ioKey.value)), emphasis: true }]} />, detailTitle: "Real bus access", detail: <p>The run loads the keyboard value through the CPU memory bus.</p> },
        { eyebrow: "SCREEN OUTPUT", title: "The screen is a region of memory too.", explanation: `Writing a word into screen memory changes pixels. This run writes the keyboard value to RAM[${screen?.address ?? 16394}].`, visual: <Flow items={[{ text: "screen(10, key)" }, { text: `RAM[${screen?.address ?? 16394}]` }, { text: String(screen?.value ?? 65), emphasis: true }]} />, detailTitle: "Why this is useful", detail: <p>From the CPU&apos;s point of view, a device can be accessed using the same load/store machinery as normal memory.</p> },
      ],
    },
  ];
}

const FEATURED: ConceptId[] = ["arithmetic", "decision", "pointer"];

export function GuidedExperience({ onOpenExplorer, onCompare, onShowcase, initial }: { onOpenExplorer: (source: string) => void; onCompare?: () => void; onShowcase?: () => void; initial?: ShareState }) {
  const guides = useMemo(() => makeGuides(), []);
  const [selected, setSelected] = useState<ConceptId | null>(initial?.concept ?? null);
  const [step, setStep] = useState(() => Math.min(initial?.step ?? 0, (guides.find(g => g.id === initial?.concept)?.steps.length ?? 1) - 1));
  const [details, setDetails] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [playing, setPlaying] = useState(false);
  const guide = selected ? guides.find(item => item.id === selected)! : null;
  const current = guide?.steps[step];
  const featured = FEATURED.map(id => guides.find(item => item.id === id)!);
  const more = guides.filter(item => !FEATURED.includes(item.id));

  useEffect(() => {
    if (!playing || !guide || step >= guide.steps.length - 1) return;
    const timer = window.setTimeout(() => {
      const next = Math.min(step + 1, guide.steps.length - 1);
      setStep(next);
      setDetails(false);
      if (next === guide.steps.length - 1) setPlaying(false);
    }, 2800);
    return () => window.clearTimeout(timer);
  }, [playing, guide, step]);

  function choose(id: ConceptId, autoplay = false) {
    setSelected(id);
    setStep(0);
    setDetails(false);
    setPlaying(autoplay);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function move(delta: number) {
    if (!guide) return;
    setPlaying(false);
    const next = Math.max(0, Math.min(guide.steps.length - 1, step + delta));
    setStep(next);
    setDetails(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function home() {
    setSelected(null);
    setStep(0);
    setDetails(false);
    setPlaying(false);
  }

  return <div className="guided-shell">
    <header className="guided-header">
      <button className="guided-brand" onClick={home} aria-label="NANDscope guided home"><span className="guided-gate">⊼</span><span>NAND<b>scope</b></span></button>
      <div className="guided-mode-switch" aria-label="View mode"><span aria-current="page">Guided</span><button onClick={() => onOpenExplorer(guide?.source ?? EXAMPLES.Arithmetic)}>Explorer</button></div>
    </header>

    {!guide ? <main className="guided-home">
      <section className="guided-hero guided-hero-product">
        <div className="guided-hero-copy">
          <span className="guided-kicker">INTERACTIVE COMPUTER MICROSCOPE</span>
          <h1>Write code.<br />Zoom down to NAND.</h1>
          <p>NANDscope turns a tiny program into VM, Hack assembly, real 16-bit machine code, CPU execution and logic gates — without losing the thread.</p>
          <div className="guided-hero-actions">
            <button className="guided-start" onClick={() => choose("arithmetic", true)}><span>Play the demo</span><Code>7 + 9</Code><b>→</b></button>
            <button className="guided-secondary" onClick={() => choose("arithmetic")}>Learn step by step</button>
          </div>
          <div className="guided-proof-inline"><span className="guided-proof-dot" />Generated from a real compiler + CPU simulation, not a prerecorded animation.</div>
        </div>
        <div className="guided-hero-preview" aria-label="Code to NAND preview">
          <div><span>YOUR CODE</span><Code emphasis>7 + 9</Code></div>
          <i>↓</i><div><span>VM</span><Code>add</Code></div>
          <i>↓</i><div><span>ASSEMBLY</span><Code>M=D+M</Code></div>
          <i>↓</i><div><span>MACHINE</span><Code>1111000010001000</Code></div>
          <i>↓</i><div><span>HARDWARE</span><Code emphasis>NAND</Code></div>
        </div>
      </section>

      <section className="guided-proof-strip" aria-label="How NANDscope works">
        <div><strong>1</strong><span>Parse + compile</span><small>Source → VM</small></div>
        <div><strong>2</strong><span>Assemble</span><small>Hack → 16-bit ROM</small></div>
        <div><strong>3</strong><span>Execute</span><small>Real CPU cycles + RAM</small></div>
        <div><strong>4</strong><span>Trace</span><small>ALU → gates → NAND</small></div>
      </section>

      <section className="guided-questions" aria-labelledby="guided-questions-title">
        <div className="guided-section-heading"><span>START WITH THE BIG IDEAS</span><h2 id="guided-questions-title">Three journeys worth seeing.</h2><p>Each one answers a different question about what computers are actually doing underneath your code.</p></div>
        <div className="guided-card-grid guided-featured-grid">{featured.map(item => <button key={item.id} className="guided-question-card" onClick={() => choose(item.id)}><span className="guided-card-marker">{item.marker}</span><strong>{item.cardQuestion ?? item.question}</strong><p>{item.promise}</p><span className="guided-card-arrow">→</span></button>)}</div>
        <button className="guided-more-toggle" aria-expanded={showMore} onClick={() => setShowMore(value => !value)}>{showMore ? "Hide extra concepts" : `Explore ${more.length} more concepts`}<span>{showMore ? "−" : "+"}</span></button>
        {showMore && <div className="guided-card-grid guided-more-grid">{more.map(item => <button key={item.id} className="guided-question-card compact" onClick={() => choose(item.id)}><span className="guided-card-marker">{item.marker}</span><strong>{item.cardQuestion ?? item.question}</strong><p>{item.promise}</p><span className="guided-card-arrow">→</span></button>)}</div>}
      </section>

      <section className="guided-real-section">
        <span className="guided-kicker">THE IMPORTANT PART</span>
        <h2>This is a simulator, not a slideshow.</h2>
        <p>The explanations come from the same execution data you can inspect in Explorer: parsed source, generated VM, resolved assembly labels, machine words, CPU frames, RAM snapshots and hardware traces.</p>
        <div className="guided-real-tags"><span>Compiler</span><span>Assembler</span><span>CPU simulator</span><span>Execution provenance</span><span>Gate-level arithmetic</span></div>
      </section>

      <div className="guided-explorer-callout"><div><span className="guided-kicker">POWER USER MODE</span><strong>Open the full machine Explorer.</strong><p>Inspect every execution cycle, ROM instruction, memory cell, stack frame, jump, gate and NAND signal — or edit the source program yourself.</p></div><button onClick={() => onOpenExplorer(EXAMPLES.Arithmetic)}>Open Explorer →</button></div>
      {onCompare && <div className="guided-explorer-callout"><div><span className="guided-kicker">WHAT CHANGED?</span><strong>Compare two programs.</strong><p>Change one operator and see the difference all the way down to NAND.</p></div><button onClick={onCompare}>Compare two programs →</button></div>}
      <footer className="guided-footer"><span>NANDscope</span><p>See what your code becomes.</p>{onShowcase && <button className="quiet-button" onClick={onShowcase}>Showcase</button>}</footer>
    </main> : <main className="guided-lesson">
      <nav className="guided-breadcrumb"><button onClick={home}>All questions</button><span>›</span><span>{guide.question}</span></nav><div className="guided-share"><ShareButton state={{ mode: "guided", concept: guide.id, step }} /></div>
      <div className="guided-progress"><div><span>STEP {step + 1} OF {guide.steps.length}</span><strong>{guide.question}</strong></div><div className="guided-progress-actions"><button className={playing ? "guided-autoplay playing" : "guided-autoplay"} onClick={() => setPlaying(value => !value)} disabled={step === guide.steps.length - 1}>{playing ? "Pause demo" : "Auto-play"}<span>{playing ? "Ⅱ" : "▶"}</span></button><div className="guided-progress-track" aria-hidden="true"><i style={{ width: `${((step + 1) / guide.steps.length) * 100}%` }} /></div></div></div>
      <section key={`${guide.id}-${step}`} className="guided-stage guided-stage-enter" aria-live="polite">
        <div className="guided-stage-copy"><span className="guided-kicker">{current!.eyebrow}</span><h1>{current!.title}</h1><p>{current!.explanation}</p><button className="guided-detail-toggle" aria-expanded={details} onClick={() => setDetails(value => !value)}>{details ? "Hide technical details" : "Show technical details"} <span>{details ? "−" : "+"}</span></button>{details && <div className="guided-details"><strong>{current!.detailTitle}</strong>{current!.detail}</div>}</div>
        <div className="guided-stage-visual">{current!.visual}</div>
      </section>
      <div className="guided-step-controls"><button className="guided-back" onClick={() => step === 0 ? home() : move(-1)}>← {step === 0 ? "Questions" : "Back"}</button><div className="guided-dots" aria-label={`Step ${step + 1} of ${guide.steps.length}`}>{guide.steps.map((_, index) => <button key={index} aria-label={`Go to step ${index + 1}`} aria-current={index === step ? "step" : undefined} onClick={() => { setPlaying(false); setStep(index); setDetails(false); }} />)}</div>{step < guide.steps.length - 1 ? <button className="guided-next" onClick={() => move(1)}>Next <span>→</span></button> : <button className="guided-next" onClick={() => onOpenExplorer(guide.source)}>Explore this program <span>→</span></button>}</div>
      {step === guide.steps.length - 1 && <div className="guided-finish"><span>YOU NOW HAVE THE MENTAL MODEL</span><strong>Want the exact machine details?</strong><p>Open the same program in Explorer, or choose another concept and keep learning.</p><div className="guided-finish-actions"><button onClick={() => onOpenExplorer(guide.source)}>Open Explorer →</button><button className="subtle" onClick={home}>Another question</button></div></div>}
    </main>}
  </div>;
}
