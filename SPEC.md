# Current implementation: source-to-silicon debugging (3 October 2026)

The original V1 and P4 sections below preserve design history. The current language, bounds and architecture are defined in README.md and the expansion contracts at the end of this specification; the current acceptance evidence is in VERIFICATION.md.

# NANDscope — Product & Technical Specification

**Working tagline:** **Write code. Zoom down to NAND.**

## 1. Product Summary

NANDscope is an interactive educational visualization that lets a learner take a tiny piece of high-level code and follow its execution downward through the abstraction layers of a computer:

**High-level code → VM → Assembly → Machine Code → CPU → ALU → Logic Gates → NAND**

The learner should be able to move up and down these layers while execution is happening and understand how an operation at one level corresponds to operations at the level below it.

NANDscope is inspired by the core educational idea behind Nand2Tetris: understanding a computer system by traversing the abstractions from Boolean logic to software.

NANDscope is **not** intended to replace the course.

It is a visual companion that answers one question:

> **What actually happens underneath my code?**

---

## 2. Single Learning Objective

After using NANDscope, a learner should understand:

> **A high-level operation is progressively translated into simpler operations until it is ultimately implemented by logic gates.**

Everything in the product must reinforce this.

NANDscope is **not primarily an assembly-language trainer**.

It is **not primarily a CPU-design course**.

It is **not primarily a digital-logic course**.

Those concepts appear because they are layers in the same execution chain.

---

## 3. Core Product Principle

Every visible object at one abstraction level should have a traceable relationship to the level directly above and below it.

Example:

```text
let x = 2 + 3;
        │
        ▼
push constant 2
push constant 3
add
pop local 0
        │
        ▼
Hack-like assembly instructions
        │
        ▼
16-bit machine instructions
        │
        ▼
CPU datapath activity
        │
        ▼
ALU addition
        │
        ▼
16-bit adder
        │
        ▼
full adders
        │
        ▼
Boolean gates
        │
        ▼
NAND
```

The user must never encounter a transformation that feels like:

**“And then magic happens.”**

---

## 4. Target User

Primary:

- CS students
- Nand2Tetris learners
- self-taught programmers
- developers curious about computer architecture
- programmers who understand code but treat hardware as a black box

Secondary:

- instructors demonstrating abstraction
- high-school computing students
- people learning assembly or computer architecture

No prior hardware knowledge should be required for the introductory experience.

---

## 5. V1 Scope

V1 should be intentionally small.

Do **not** implement an entire programming language, compiler, computer architecture, operating system, or complete Nand2Tetris environment.

Support enough functionality to visualize a few carefully selected programs correctly and beautifully.

### Example A — Assignment

```text
let x = 5;
```

Teaches:

- constant
- stack/value movement
- machine instruction
- register
- memory

### Example B — Arithmetic

```text
let x = 2 + 3;
```

Teaches:

- arithmetic lowering
- operands
- ALU
- binary addition
- adders
- NAND

This is the **hero demo**.

### Example C — Comparison / branch

```text
if (x > 3) {
    let y = 1;
}
```

Teaches:

- comparison
- flags/result
- conditional jump
- program counter

This is a stretch goal after the hero path works.

---

## 6. Product Experience

### 6.1 Landing Screen

Minimal landing page.

Hero:

# See what your code becomes.

Subtext:

**Follow one line of code from a high-level language all the way down to the NAND gates executing it.**

Primary CTA:

**Start Exploring**

Secondary CTA:

**What is NANDscope?**

A small visual below the CTA should preview:

```text
CODE
 ↓
VM
 ↓
ASSEMBLY
 ↓
CPU
 ↓
GATES
 ↓
NAND
```

---

## 7. Main Workspace

Desktop-first for V1.

```text
┌────────────────────────────────────────────────────────────┐
│ NANDscope                                Reset   Examples   │
├───────────────┬───────────────────────────────┬────────────┤
│               │                               │            │
│ ABSTRACTION   │      MAIN VISUALIZATION       │  DETAILS   │
│ LADDER        │                               │            │
│               │                               │            │
│ Code          │                               │            │
│ VM            │                               │            │
│ Assembly      │                               │            │
│ Machine Code  │                               │            │
│ CPU           │                               │            │
│ ALU           │                               │            │
│ Gates         │                               │            │
│ NAND          │                               │            │
│               │                               │            │
├───────────────┴───────────────────────────────┴────────────┤
│ ◀ Previous       ▶ Step       ▶▶ Run        Speed: 1×     │
└────────────────────────────────────────────────────────────┘
```

The **main visualization** is the star of the product.

Do not make it look like an IDE with charts attached.

---

## 8. The Abstraction Ladder

Persistent vertical navigation on the left:

```text
HIGH LEVEL

● Code
│
● VM
│
● Assembly
│
● Machine Code
│
● CPU
│
● ALU
│
● Gates
│
● NAND

LOW LEVEL
```

The active level is emphasized.

Users can:

- click a level
- scroll between adjacent levels
- drag a vertical “zoom” controller
- use keyboard shortcuts
- follow execution automatically

Recommended shortcuts:

```text
↑      Move one abstraction level up
↓      Move one abstraction level down
→      Step execution
Space  Play / pause
R      Reset
```

---

## 9. Signature Interaction: Zoom Into the Computer

This is the defining product interaction.

Suppose the current source is:

```text
let x = 2 + 3;
```

At **Code** level, that statement fills the center.

The user drags downward.

The expression visually separates into lower-level operations.

At **VM**:

```text
push constant 2
push constant 3
add
pop local 0
```

Continue downward.

Those VM instructions expand into groups of assembly instructions.

Continue.

Each assembly instruction becomes its binary encoding.

Continue.

The currently executing instruction enters the CPU datapath.

Continue.

The CPU view focuses on the ALU.

Continue.

The ALU explodes into logical components.

Continue.

Components expand into primitive gates.

Finally:

# NAND

The user has visually moved from:

```text
2 + 3
```

to the primitive operations that ultimately implement it.

The transition should feel like zooming into an object with a microscope rather than navigating unrelated pages.

---

## 10. Cross-Layer Highlighting

This is essential.

Selecting something on one level should highlight everything associated with it.

Example:

User clicks:

```text
add
```

at VM level.

Highlight:

- its generated assembly sequence
- the corresponding machine instructions
- CPU cycles used by those instructions
- relevant ALU operations
- adder circuitry
- gate activity

Likewise, selecting a machine-code instruction should highlight:

- originating assembly instruction
- associated VM operation
- currently active CPU path

Relationships must be stored explicitly rather than inferred from UI state.

---

## 11. Execution Modes

### Mode A — Explore

User freely moves between layers.

No animation required.

Useful for understanding mappings.

### Mode B — Step

User clicks **Step →**.

The system advances one execution event.

At CPU level this may correspond to one machine instruction.

At lower levels, stepping may expose sub-events.

### Mode C — Run

Execution animates automatically.

Speed:

```text
0.25×
0.5×
1×
2×
4×
```

Pause at any time.

---

## 12. Code Level

V1 should use a deliberately restricted Jack-like teaching syntax.

Supported initially:

```text
let x = 5;
let x = 2 + 3;
let x = a + b;
let x = a - b;
```

Optional V1.1:

```text
if (...)
while (...)
```

Do not attempt full Jack syntax in the initial implementation.

Show:

```text
let x = 2 + 3;
        └───┬───┘
         expression
```

When execution starts:

- `2` highlights
- then `3`
- then `+`
- then assignment

---

## 13. VM Level

Visualize stack-based execution.

Example:

```text
push constant 2
push constant 3
add
pop local 0
```

Beside it display a stack:

```text
┌─────┐
│     │
├─────┤
│  3  │
├─────┤
│  2  │
└─────┘
```

During `add`:

```text
3 ─┐
   ├── ADD ──► 5
2 ─┘
```

Then:

```text
┌─────┐
│  5  │
└─────┘
```

The learner should understand why a compiler/VM layer can represent a high-level arithmetic expression using stack operations.

---

## 14. Assembly Level

Show the generated assembly as a compact list.

Do not dump dozens of unexplained lines.

Group instructions visually by the higher-level operation that caused them.

Example:

```text
VM: push constant 2

  @2
  D=A
  @SP
  A=M
  M=D
  @SP
  M=M+1
```

Selecting a single line transitions toward machine-code view.

---

## 15. Machine-Code Level

Display instruction bits:

```text
1110110000010000
```

Do not leave them unexplained.

Break fields apart visually:

```text
111 | 0110000 | 010 | 000
     COMP      DEST   JUMP
```

Hover/click:

```text
COMP → A
DEST → D
JUMP → none
```

The goal is to show that assembly is not executed directly; it becomes structured binary information consumed by CPU circuitry.

---

## 16. CPU Level

Create a simplified animated CPU datapath.

Core components:

- Program Counter
- Instruction Memory / ROM
- Instruction Register representation
- A register
- D register
- ALU
- Memory interface
- control signals
- buses

Suggested visual:

```text
               ┌─────────┐
               │   ROM   │
               └────┬────┘
                    │ instruction
                    ▼
             ┌──────────────┐
             │   DECODER    │
             └───┬──────┬───┘
                 │      │
          ┌──────▼─┐  ┌─▼──────┐
          │ A Reg  │  │ D Reg  │
          └────┬───┘  └────┬───┘
               │           │
               └─────┬─────┘
                     ▼
                  ┌─────┐
                  │ ALU │
                  └──┬──┘
                     │
                     ▼
                   output
```

Values move as animated packets along buses.

Do not animate everything simultaneously.

Only active paths light up. Inactive paths fade into the background.

---

## 17. CPU Execution Story

Every machine instruction has a human-readable explanation.

Example:

> **Fetch**  
> The program counter points to instruction 17.

Then:

> **Decode**  
> The CPU determines that this instruction loads the value 2.

Then:

> **Execute**  
> The appropriate data path is activated.

Then:

> **Write**  
> The resulting value is stored.

The terminology should remain technically correct but approachable.

---

## 18. ALU Level

When an arithmetic operation is selected, zoom into the ALU.

Example:

```text
x = 2
y = 3

       0010
         │
         ▼
      ┌─────┐
      │ ADD │
      └─────┘
         ▲
         │
       0011

         ↓

       0101
```

Display simultaneously:

```text
Decimal: 2 + 3 = 5
Binary:  0010 + 0011 = 0101
```

---

## 19. Gates Level

Zoom further into one bit of addition.

For educational clarity, begin with a **single-bit slice** rather than immediately rendering the complete 16-bit network.

Show a full-adder visualization:

```text
A ──────┐
        │
B ──────┼──► FULL ADDER ──► SUM
        │
Cin ────┘              └──► CARRY
```

Then expand:

```text
Full Adder
    ↓
Half Adders
    ↓
XOR / AND / OR
```

The learner can select:

**Show all 16 bits**

Only then render the repeated 16-bit structure.

---

## 20. NAND Level

Final layer.

All higher-level gates can be represented in terms of NAND.

At this level, show individual primitive NAND gates and signal propagation.

Example:

```text
A ─────┐
       NAND ─── OUTPUT
B ─────┘
```

Signals are represented as `0` and `1`.

Animate propagation:

```text
A = 1
B = 1

        ↓

NAND(1,1)

        ↓

OUTPUT = 0
```

For large structures, do not render hundreds or thousands of gates immediately.

Default: **Relevant slice**

Optional: **Show complete circuit**

The final visual moment should communicate:

> All the layers above ultimately reduce to simple Boolean operations.

---

## 21. “Why?” Panel

Right-side contextual panel.

Every level answers three questions:

### What am I looking at?

Short description.

### Why does this layer exist?

Explanation of the abstraction.

### What happened to my original code?

Explicit connection to the source.

Example at ALU level:

> Your original `2 + 3` operation has reached the processor's arithmetic unit. The ALU receives the two values as binary inputs and produces `5` as its output.

Maximum ~80 words per explanation.

No textbook-sized paragraphs.

---

## 22. Breadcrumb

Always show:

```text
let x = 2 + 3;
   ↓
add
   ↓
assembly sequence
   ↓
instruction #17
   ↓
ALU ADD
   ↓
16-bit adder
   ↓
bit 2
   ↓
NAND gates
```

This prevents the learner from losing context.

---

## 23. Visual Design

Desired feeling:

**Figma × oscilloscope × interactive textbook**

Not:

- cyberpunk overload
- Matrix-green terminal
- generic SaaS dashboard
- children's educational game

Use:

- dark neutral background
- strong typography
- subtle grid
- glass/flat component surfaces
- smooth zoom transitions
- glowing active signals
- muted inactive components
- monospace only for code/data
- normal sans-serif for explanations

The main visualization should occupy most of the viewport.

---

## 24. Motion Design

Motion has instructional purpose.

Use animation to communicate:

- value movement
- signal propagation
- instruction flow
- transformations
- parent/child relationships

Avoid decorative animation that conveys nothing.

When moving `ADD` from assembly to machine code, the word should visually transform into its binary representation rather than simply fading one page out and another in.

Ideal transition time: **300–700 ms**

CPU execution packets: **500–1200 ms depending on selected speed**

---

## 25. Architecture

Recommended V1 frontend:

- Next.js
- React
- TypeScript
- Tailwind CSS
- Zustand or equivalent small state store
- Framer Motion
- SVG for circuit diagrams
- optional React Flow only where useful

Avoid Three.js unless a specific interaction genuinely benefits from 3D.

This product should primarily be **2D** because circuits are easier to understand that way and implementation complexity stays manageable.

---

## 26. Simulation Engine

Keep simulation logic independent from React.

Suggested modules:

```text
/core
  parser/
  compiler/
  vm/
  assembler/
  cpu/
  alu/
  gates/
  trace/

/ui
  code/
  vm/
  assembly/
  cpu/
  gates/
  timeline/
```

Core functions should be deterministic.

```ts
parseSource(source)
compileToVM(ast)
translateVM(vm)
assemble(asm)
executeMachineInstruction(state, instruction)
evaluateALU(inputs)
evaluateGateGraph(graph, inputs)
```

No UI component should contain CPU execution logic.

---

## 27. Trace Model

The most important internal abstraction is not the CPU. It is the **Trace Graph**.

Every transformation creates relationships between layers.

```ts
interface TraceNode {
  id: string;
  layer:
    | "source"
    | "vm"
    | "assembly"
    | "machine"
    | "cpu"
    | "alu"
    | "gate"
    | "nand";

  label: string;
  metadata: Record<string, unknown>;
}

interface TraceEdge {
  from: string;
  to: string;

  relation:
    | "compiled-to"
    | "translated-to"
    | "encoded-as"
    | "executed-by"
    | "implemented-by";
}
```

Example:

```text
source:add-expression
        │ compiled-to
        ▼
vm:add
        │ translated-to
        ▼
asm:add-sequence
        │ encoded-as
        ▼
machine:instructions
        │ executed-by
        ▼
alu:add
        │ implemented-by
        ▼
gate:add16
```

All cross-highlighting should use this graph.

---

## 28. Execution State

```ts
interface MachineState {
  pc: number;
  a: number;
  d: number;
  ram: Uint16Array;
  currentInstruction: number;

  alu: {
    x: number;
    y: number;
    output: number;
    zr: boolean;
    ng: boolean;
  };
}
```

Each execution step produces:

```ts
interface ExecutionFrame {
  index: number;
  before: MachineState;
  after: MachineState;
  activeTraceNodes: string[];
  explanation: string;
}
```

This enables:

- forward stepping
- backward stepping
- scrubbing
- replay
- animations
- deterministic demos

---

## 29. Precompute Execution

For V1, do not simulate indefinitely in real time.

When the learner presses **Run**:

1. parse program
2. generate intermediate forms
3. assemble
4. execute until completion
5. record execution frames
6. construct trace graph
7. replay frames visually

This makes animations deterministic and lets users move backward in time.

---

## 30. Time Scrubber

Bottom timeline:

```text
◀ │━━━━━━●━━━━━━━━│ ▶

Instruction 17 / 43
```

Dragging backward restores earlier machine state.

This means the learner can literally rewind the CPU.

Useful CTA: **Rewind execution**

---

## 31. Information Hierarchy

The product must work at three depths.

### Beginner

Sees:

> `2 + 3` entered the ALU and became `5`.

### Intermediate

Sees:

> VM `add` generated these machine operations.

### Advanced

Can inspect:

> Which control bits caused this ALU behavior?

Don't force advanced details on beginners.

Use progressive disclosure.

---

## 32. Guided Story Mode

The first visit should not open into an empty editor.

Start automatically with:

```text
let x = 2 + 3;
```

And an invitation:

> **Ever wondered what the `+` actually becomes?**

CTA:

**Follow the +**

The experience then guides the user:

1. Code
2. VM
3. Assembly
4. Binary
5. CPU
6. ALU
7. Gates
8. NAND

This should be completable in approximately 3–5 minutes.

Afterward:

> **Now explore it yourself.**

---

## 33. Exploration Mode

After the guided experience, users may:

- modify constants
- change operators
- step manually
- inspect registers
- inspect RAM
- inspect individual bits
- switch between layers
- replay execution

Keep the permitted source syntax constrained.

Do not provide a giant arbitrary-code editor in V1.

---

## 34. Example Gallery

### Addition

```text
let x = 2 + 3;
```

### Subtraction

```text
let x = 7 - 4;
```

### Variables

```text
let x = a + b;
```

### Branch — stretch

```text
if (x > 3) {
    let y = 1;
}
```

Each example should advertise the concept it demonstrates.

---

## 35. Nand2Tetris Relationship

NANDscope should be described as:

> **An independent visual learning companion inspired by the abstraction journey taught in Nand2Tetris.**

Do not market it as an official Nand2Tetris tool.

Do not publish completed solutions to course assignments.

Where Nand2Tetris terminology or material is directly reused:

- provide attribution
- respect the source license
- do not expose assignment solutions
- clearly mark NANDscope as unofficial

---

## 36. What V1 Must NOT Include

Do not build:

- complete Nand2Tetris project solutions
- full HDL IDE
- full Jack compiler
- complete VM specification
- operating system
- arbitrary program execution
- user accounts
- database
- social features
- authentication
- cloud backend
- AI chatbot
- multiplayer
- lessons/course management
- achievements/gamification
- 3D CPU model
- mobile app

None are necessary for the DevDay demo.

---

## 37. V1 Definition of Done

The product is ready when this experience works flawlessly:

User opens NANDscope.

They see:

```text
let x = 2 + 3;
```

They click:

**Follow the +**

They can then move continuously through:

```text
High-level expression
        ↓
VM operations
        ↓
Assembly
        ↓
Machine code
        ↓
CPU execution
        ↓
ALU addition
        ↓
Adder circuitry
        ↓
Logic gates
        ↓
NAND
```

At every layer:

- relevant data is correct
- active elements are highlighted
- the original `+` remains traceable
- there is a short explanation
- stepping backward works
- stepping forward works
- animations correspond to actual execution
- transformations are deterministic

If this single path is excellent, V1 succeeds.

---

## 38. Acceptance Test

A learner who has never studied CPU architecture should be able to use the guided demo and afterward explain roughly:

> “My high-level code isn't executed directly. It gets translated through intermediate representations into machine instructions. The CPU fetches and executes those instructions. Arithmetic is handled by the ALU, whose circuitry is constructed from simpler logic gates, which ultimately can be constructed from NAND gates.”

That explanation is the product's learning outcome.

---

## 39. Demo-First Development Priority

Build in this order:

### P0 — Trace model

Hardcoded `2 + 3` across every abstraction level.

No editor. No animation polish. Verify relationships.

### P1 — Main abstraction ladder

Clickable:

```text
Code
VM
Assembly
Machine
CPU
ALU
Gates
NAND
```

### P2 — Cross-highlighting

Select `+` / `add` and preserve identity across all layers.

### P3 — CPU execution

Correct step-by-step machine state.

### P4 — Visual movement

Animate values through CPU and ALU.

### P5 — Gate decomposition

Adder → gates → NAND.

### P6 — Microscope zoom

Smooth transformations between adjacent abstraction layers.

### P7 — Guided story

“Follow the +”.

### P8 — Tiny editor

Allow constants/operator to change.

### P9 — Polish

Typography, responsiveness, transitions, onboarding, demo recording.

Do **not** implement P8 until the hardcoded hero path looks excellent.

---

## 40. DevDay Demo

The final product must be understandable with the sound off.

Suggested 45–60 second recording:

### 0–4 sec

Text:

**I wanted to see how far down one `+` really goes.**

Show:

```text
let x = 2 + 3;
```

### 4–10 sec

Click:

**Follow the +**

### 10–17 sec

Zoom:

```text
Code → VM
```

`+` becomes `add`.

### 17–23 sec

Zoom:

```text
VM → Assembly → Machine Code
```

### 23–32 sec

CPU appears.

Watch instruction/data travel through CPU.

### 32–39 sec

Zoom into ALU.

```text
2 + 3 → 5
```

### 39–48 sec

Zoom into full adder → gates.

### 48–54 sec

Gates expand into NAND.

### 54–60 sec

Rapid zoom back outward:

```text
NAND
 ↓
Gates
 ↓
ALU
 ↓
CPU
 ↓
Machine Code
 ↓
Assembly
 ↓
VM
 ↓
let x = 2 + 3;
```

End card:

# NANDscope

**Write code. Zoom down to NAND.**

Small line:

**Built with GPT‑6.1 Sol.**

---

## 41. Success Criteria

For the DevDay version, optimize for:

1. **Immediate comprehension** — someone understands the concept within five seconds.
2. **Visual surprise** — moving from a `+` to NAND gates should produce a genuine “oh wow” moment.
3. **Technical correctness** — the transformations cannot merely be decorative.
4. **Educational clarity** — animation explains rather than distracts.
5. **Demoability** — the best experience fits inside one minute.
6. **Scope discipline** — one extraordinary execution trace is better than ten incomplete features.

---

## 42. Product North Star

Whenever deciding whether to add something, ask:

> **Does this help the learner understand how their code becomes hardware behavior?**

If not, leave it out.

The product is not about showing how many computer-science concepts we can implement.

The product is about making an invisible chain of abstractions **visible**.

---

# Final Product Promise

**Write one line of code.**

**Follow it through the software stack.**

**Watch the CPU execute it.**

**Keep zooming.**

**Eventually, there is only NAND.**

# P4 — Memory and variables (historical milestone)

The original V1 priority list above is historical. The current concept pass is **variables are values stored at memory locations**. P4 supports multiple `let` statements whose RHS is one integer/name or one addition of two integers/names, and deterministic first-definition local allocation. Reassignment reuses the existing slot; use-before-definition fails with a source line diagnostic.

The default is `let x = 7; let y = 9; let result = x + y;`. Source read/write occurrences, symbol slots, actual LCL-relative memory addresses, VM commands, assembly, machine words and CPU accesses share explicit provenance. RAM is displayed from the selected instruction frame after its clock edge, with its exact read/write highlighted. Selecting `+` preserves the existing source → NAND microscope for each addition.

P4 does not add branching, more arithmetic operators, functions, arrays, pointers or nested expressions. A plain multiline textarea and disclosure-based relevant-memory panel keep the interface focused. See README.md for the implemented grammar/resource bounds and VERIFICATION.md for acceptance evidence.

This historical scope is superseded by the comprehensive systems expansion below.


# Comprehensive systems expansion — current acceptance contract

The product now teaches computation, memory, decisions, repetition, functions/stack frames, indirect arrays and memory-mapped I/O in one real machine pipeline:

source → spanned AST/scoped symbols → stack VM → symbolic assembly → resolved ROM/machine words → bounded CPU cycle history → actual memory/PC/frames → selected arithmetic → ALU → full adders → gates → NAND.

Supported statements are let (including array targets), if/optional else, while, top-level function declarations, return and standalone calls. Expressions include signed integer words, identifiers, +/-, </>/==, parentheses, calls and array accesses. Nested blocks/calls and real recursion are supported. Booleans are -1/0 and arithmetic wraps modulo 65536. Opposite-sign comparisons must avoid overflow-broken subtraction.

Every CPU frame identifies its cycle, ROM, machine word, assembly/VM owner, source statement/expression, source function and relevant frame. The cursor indexes cycles; ROM-to-cycles is many-valued. Skipped source, VM, assembly and machine words remain inspectable without CPU frames. Real conditional/unconditional jumps change PC; loops revisit ROM, and calls/returns save/restore frame RAM.

Functions use the Nand2Tetris-style return-address/LCL/ARG/THIS/THAT convention. Main static slots and real stack-frame-relative arguments/locals remain separate. Fixed-size arrays use bounded heap RAM, length headers, actual bounds checks and indirect loads/stores. keyboard() and screen(offset,word) map to KBD=24576 and SCREEN=16384+offset.

The lightweight editor, curated examples, current/skipped highlighting, cycle/ROM controls, PC story, completed/pending control decisions, call-frame disclosure, relevant memory/arrays/devices and existing arithmetic microscope are the learning surfaces. Hardware circuits must use the selected executed arithmetic occurrence, including repeated loops and recursion.

Bounds: 12,000 source characters, 128 total statements, 12 functions, depth 24, array size 64, 2,048 VM commands, 16,000 ROM words and 12,000 cycles. Stack is stopped before RAM[1536]; heap is RAM[2048..8191]. Runtime stops preserve real partial history with useful diagnostics. RAM history uses shared copy-on-write pages, not full 32K copies on every edge.

Acceptance requires simulator/AST/compiler/assembler/provenance invariants, all prior arithmetic/transition regressions, signed boundary pairs, both branches, repeated-loop memory, call order/locals/return/register restoration, recursion, arrays/bounds/devices, all static checks and actual desktop/mobile rendering. README.md documents semantics and intentionally bounded limitations; VERIFICATION.md records the completed evidence.

# Focused expansion — pointers, bitwise operations and runtime playback

This pass preserves the existing pipeline and adds exactly three teaching capabilities.

Pointers: prefix `&identifier` and `*identifier`, plus `let *identifier = expression;`. The AST has AddressOfExpression, DereferenceExpression and DereferenceTarget nodes with their own IDs/spans and identifier children. A two-kind semantic model tracks explicit pointers, stable slot kinds and definite address assignments. Unsupported pointer arithmetic, pointer-to-pointer, numeric pointer assignment, indexing and pointer arguments/returns receive line-aware errors. Ordinary arrays retain their existing behavior.

`address-of` computes real LCL/ARG + slot, or the actual static address. `indirect-read` pops the pointer, checks for an uninitialized zero address with a machine jump, loads A from D and reads RAM[A]. `indirect-write` retains the address on the actual stack during RHS evaluation, then uses R13/R14 and M=D to store to the target. There is no JavaScript source evaluation or symbolic address substitution. Compilation/generation attach storage IDs and explicit pointer effects; executed cycles record numeric addresses and accesses in the graph. Explorer distinguishes the value path, address-taking path, pointer's own storage and dereference target. The five-step Guided lesson uses actual RAM/event data.

Bitwise: binary `&` and `|`, unary `~`. Prefix syntax disambiguates address-taking from binary AND. Unary NOT has a proper UnaryExpression. VM and/or/not emit real Hack ALU instructions. Generation attaches an explicit hardware effect to the operative instruction; execution creates a HardwareTrace union of ArithmeticTrace and BitwiseTrace. Arithmetic's existing fixture IDs, ripple slices and +/- UI remain. Bitwise records show sixteen independent AND/OR/NOT slices, two/three/one-NAND constructions and no carry signals. Bit choice reuses existing interaction. The short four-step Guided lesson teaches corresponding bits using 12 & 10 = 8.

Runtime: one shared cycle cursor is wrapped in a pure playback reducer with play/pause/tick/speed/inspection/reset actions. A single cancellable timeout schedules the next recorded cycle at 900/450/225 ms. It never computes PC or RAM. Manual inspection, compilation, mode changes and layer transitions pause playback; final-edge playback stops automatically. Source focus follows provenance, lists reveal escaped rows within their own scrolling container, memory writes flash and display before/after, and actual jumps/frame transfers are visible in the controls. Guided slide autoplay stays independent.

Homepage: addition, if/PC and pointer/RAM remain three focused featured cards; bitwise and functions appear among extra concepts. The one-click addition demo and both existing taglines are retained.

Acceptance includes all 140 baseline regressions, new AST/semantics/lowering/address/provenance/bit-circuit/playback tests, typecheck/lint/production build, actual browser inspection, complete loop/function playback, 390×844 lessons/controls/circuits, console inspection and an available Lighthouse snapshot. Existing bounds continue to apply. Do not add another concept in this pass.

# Final source-to-silicon debugging acceptance contract

Preserve all language, runtime, hardware and Guided functionality. Compare is an opt-in Explorer experience, using two independently compiled and executed Demo objects. Comparison algorithms remain outside React; structural source-block alignment and VM occurrence identity preserve semantic correspondence across unequal cycle counts. First differing clock edge, first differing conditional jump, decoded machine-bit fields, missing execution visits and subsequent source paths are explicit. Hardware comparison uses actual arithmetic/bitwise occurrences and existing NAND constructions.

The causal debugger starts at a selected historical RAM value and its latest accepted CPU write. CPU register/RAM dataflow, not source evaluation, supplies its ancestors. Constants, reads, arithmetic/bitwise/comparison events, pointer addresses/dereferences/indirect writes, function returns and branch decisions retain actual cycles and frame identity. Loop iteration and earlier writes are progressively disclosed; deduplication and bounds prevent unbounded UI recursion. Opening the explanation focuses its heading; closing restores the initiating control when it remains mounted.

Program and selected-visit cost meters derive instruction/cycle/bus/ALU/jump/stack/frame counts from generated or executed records. NAND-equivalent count and logical dependency depth derive from the displayed feed-forward gate networks. They describe logical structure, not physical transistor cost or nanoseconds.

Versioned, bounded, compressed URL fragments restore Guided, Explorer, Compare or Showcase without serializing RAM histories. Invalid data falls back safely. Share uses the native Web Share API or clipboard. Showcase uses twelve real-data scenes, three seconds each, with cancellable playback, pause/restart, no editor/sidebar and a 16:9 recording layout. Homepage continues to prioritize Play the demo, Learn step by step and three featured journeys.

Acceptance includes all 184 baseline tests, focused compare/causal/cost/share/showcase cases, typecheck, lint, production build, actual desktop/mobile comparison and value tracing, exact NAND/bit/cycle reload, all twelve showcase scenes and a full timed run. Lighthouse snapshot is requested when its browser tool is available; any unavailable audit must be reported without inventing a score. No additional language construct or AI assistant belongs in this scope.
