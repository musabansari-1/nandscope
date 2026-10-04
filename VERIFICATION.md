# Current verification: source-to-silicon debugger

Earlier reports below are historical records. Current results are in the final source-to-silicon debugger report at the end of this file; older test counts and Lighthouse scores describe their respective builds.

# P0 verification

Verified on 2 October 2026 against the final production build.

## Automated checks

| Check | Result |
| --- | --- |
| `npm run lint` | Pass, no errors or warnings |
| `npm run typecheck` | Pass |
| `npm test` | 41 tests pass |
| `npm run build` | Pass; `/` statically prerendered |
| Dependency installation audit | 0 vulnerabilities reported |

Core tests verify all two-input gate truth tables, all eight full-adder inputs, NAND XOR/AND/OR constructions, sixteen-bit carry propagation and overflow, all documented Hack comp operations, fixed instruction encodings for all 31 ROM words, simultaneous A/memory writes, old-A jump targets, signed jump conditions, VM/CPU agreement at operation boundaries, independent snapshots, and trace graph provenance.

## Browser inspection

The actual rendered app was inspected in the Codex browser, including the final production server at `http://127.0.0.1:3000`.

| Layer | Verified behavior |
| --- | --- |
| Code | Opens directly on `let x = 2 + 3;`, with + selected and the expression marked |
| VM | Four operations; add displays the top-first stack 3 / 2 becoming 5 |
| Assembly | All 31 instructions grouped by originating VM operation; the five add instructions are highlighted |
| Machine Code | `M=D+M` is `111 / 1000010 / 001 / 000`; selected row is visible in its scroll area |
| CPU | Addition uses D=3, A=256, RAM[256]=2, outM=5 and writeM=1; `AM=M-1` uses the old A address and updates A to 257 |
| ALU | Decimal 2+3=5 and sixteen-bit binary arithmetic match the recorded CPU result |
| Gates | Bit 1 has sum 0 / carry 1; bit 2 receives carry 1 and yields sum 1 / carry 0; neighboring slices show the carry chain |
| NAND | XOR(1,1)=0 after three steps; AND(1,1)=1 and OR(1,0)=1 after two steps each |

- Clicked every ladder level in the production build.
- Used ↑/↓ from Code to NAND and back; the original + remains selected.
- Selected a machine instruction and verified that CPU displays the same instruction/frame.
- Changed bit slices and primitive gate types; signals reset for the new NAND network.
- Inspected all eight views at desktop and narrow widths. Document content width matched viewport width; no horizontal overflow. The new carry overview was also checked at the narrow width.
- Observed no browser console warnings or errors in the production app.
- Kept the production Code view open as the deliverable. Captured `artifacts/p0-source.jpg` and `artifacts/p0-nand.jpg`.

## Limits

P0 includes one fixed program, preinitialized SP/LCL, a finite ROM trace, a simplified CPU diagram, and dependency-depth NAND stepping. It does not include a general compiler/editor, full VM, memory-mapped I/O, physical circuit timing, timeline, autoplay or additional examples. Detailed circuit labels are intended primarily for desktop; narrow screens stack the workspace and require vertical scrolling.

Architecture, assumptions and attribution are documented in `README.md`. The results above are the historical P0 baseline.

# P1 verification

Verified on 2 October 2026 against the final production build, served at `http://127.0.0.1:3001`.

## Automated checks

| Check | Result |
| --- | --- |
| `npm run lint` | Pass, no errors or warnings |
| `npm run typecheck` | Pass |
| `npm test` | 49 tests pass across 2 files |
| `npm run build` | Pass; `/` statically prerendered |

Eight new tests in `src/core/trace/execution.test.ts` cover unique VM mapping and graph provenance for all 31 addresses; assembly/machine/CPU synchronization at every address; all five add instructions and their adjacent command boundaries; ROM 18 addition; bounded stepping/seeking; preservation of `source:plus` across execution and VM selection; VM entry/retained position; reversible frame snapshots; and explicit source-operation changes/return to addition. The original 41 simulation tests remain passing. No simulation modules were rewritten.

## Browser verification

Inspected the rendered production app in the Codex browser at desktop widths (1200 and 1440 CSS pixels) and narrow widths (325 and 390 CSS pixels). Browser zoom means viewport override dimensions differ from the measured CSS widths reported here.

- Visited all eight layers on desktop and at 325 CSS pixels; document content never exceeded viewport width. Also checked execution, assembly and hardware jump behavior at 390 CSS pixels.
- Verified Code → VM, moved the cursor through multiple instructions, then used Assembly → Machine Code → CPU. ROM 3 (`A=M`) and ROM 15 (`AM=M-1`) remained synchronized across these views with the source `+` still in focus.
- Traversed ROM 14–18 in VM: `add` stayed current and the within-command indicator advanced from 1/5 to 5/5. The whole-command stack boundaries remained explicitly labeled.
- Used keyboard ← ← → → at CPU and Assembly, returning to the same instruction. Keyboard stepping left page scroll unchanged. Assembly retained exactly one current instruction; the current row at the end of ROM was visible inside its own scrolling container.
- Selected the ROM 18 machine word directly and confirmed `M=D+M` and encoding `1111000010001000`. Machine decoding and selected word updated immediately.
- Selected a different VM command, stepped forward, and retained original source `+` operation identity. The explanation panel separately identified the current command and its actual source provenance.
- Used the scrubber Home/End keys and verified disabled previous/next controls at ROM 0/30. Focused-button arrow keys did not step execution; a focused range arrow advanced exactly once through the native control.
- At ROM 15, visited ALU, Gates and NAND; all showed context and **Jump to the addition** rather than an unrelated gate interpretation. Also checked the post-addition context at ROM 30.
- Jumped to ROM 18 and verified ALU `2 + 3 = 5`, gate bit 1 sum 0 / carry 1, and NAND XOR(1,1)=0 after three signal steps. Signal stepping did not change the execution cursor.
- Tested the exact ladder focus sequence: click VM, press ↓ repeatedly through CPU and NAND. Focus followed the actual active layer, with exactly one selected ladder item. A neutral dashed keyboard-focus indicator remains distinct from the warm active-level styling.
- Confirmed the public milestone badge is gone and the original visual system and diagrams remain.
- Observed no console warnings or errors, including after reloading the final build.
- Saved `artifacts/p1-cpu.jpg` and `artifacts/p1-mobile.jpg`. Left the production app open at ROM 18 in the CPU view.

## Architecture and limits

One `Workspace` reducer owns `{ operationId, address }`. Views derive VM command, instruction index within its group, assembly, machine word and CPU frame from that address. Execution actions never overwrite operation identity. Layer navigation and hardware bit/primitive selection are independent. CPU state is always read from existing deterministic snapshots.

This fixed program is straight-line: ROM address equals recorded CPU frame index. This mapping is intentionally limited to the curated demo and does not claim to handle branches or repeated ROM visits. VM stacks show before/after a complete command, rather than intermediate machine-step stack states. Hardware detail remains limited to the source addition at ROM 18, and NAND signal depth remains a separate inspection sequence. The default cursor starts at ROM 18 to preserve the original guided addition experience; the scrubber can visit ROM 0.

Narrow screens retain vertical scrolling; detailed diagrams remain primarily suited to desktop. There is no autoplay, extra program, source editor or expanded course implementation. P2 has not been started.

Recommended next pass: automate the verified browser flows for cursor continuity, keyboard focus and contained scrolling, then consider guided transition polish for this same program.

## P1 changed-file inventory

- Added: `src/core/trace/execution.ts`, `src/core/trace/execution.test.ts`, `src/components/shared/execution-controls.tsx`, `src/components/shared/reveal-instruction.ts`.
- Updated: `src/components/workspace.tsx`, `src/components/navigation/ladder.tsx`, `src/components/layers/vm.tsx`, `src/components/layers/assembly.tsx`, `src/components/layers/machine.tsx`, `src/components/layers/cpu.tsx`, `src/components/shared/types.ts`, `src/components/shared/why-panel.tsx`, `src/app/globals.css`, `README.md`, `VERIFICATION.md`.
- Captured: `artifacts/p1-cpu.jpg`, `artifacts/p1-mobile.jpg`.

# P2 verification

Verified on 2 October 2026 against Next.js 16.3.8 and the final production build at `http://127.0.0.1:3003`. The P0/P1 sections above are historical baselines.

## Automated checks

| Check | Result |
| --- | --- |
| `npm test` | 56/56 pass across 3 files; all original 49 tests preserved |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass, no errors or warnings |
| `npm run build` | Pass; `/` statically prerendered |

Seven new tests in `src/components/transitions/state.test.ts` verify adjacent arrival and reversal, navigation locking/stale completion, phase ordering, preservation of the complete inspection snapshot, reduced-motion/direct-jump arrival, ROM 17 hardware context, and unfolding a focused operation independently of the execution cursor. No simulation module or trace graph was changed.

## Transition architecture and technique

`state.ts` owns presentation only: committed layer, source/target, direction, request ID, phase, reduced-motion preference, and a copied `{ operationId, address, bit, primitive }` inspection. `anchors.ts` maps explicit visual identities to the adjacent conceptual relationships. It does not infer relationships from DOM order or add animation metadata to the trace graph.

`use-microscope.ts` locks synchronously when a request is accepted, captures the source before React changes the presentation tree, and owns every phase timer, animation and cleanup. The source plane does not contribute to destination layout. `motion.ts` measures destination anchors before paint, uses inert, accessibility-hidden DOM/SVG snapshots in a clipped overlay, hides underlying focal objects, animates their measured positions/sizes, and returns ownership to the destination. Inspection actions stay fixed until completion. Resize or a motion-preference change cancels motion and settles safely at the destination.

Normal phase timing is approximately 840 ms after preparation; measured mobile development transitions were approximately 0.9–1.0 seconds including preparation. Reduced-motion coordination is 140 ms, with immediate placement, a brief highlight, no moving focal overlay and no scene transforms. All temporary overlays and inline visibility changes are cleaned up.

| Relationship | Completed behavior |
| --- | --- |
| Code ↔ VM | Source token tracks into its VM label; `+` becomes `add`, with surrounding instructions receding/revealing |
| VM ↔ Assembly | Focused VM command unfolds into its real translated rows; ROM 18 arithmetic receives emphasis |
| Assembly ↔ Machine | Current instruction stays anchored while actual word fields appear contiguously and separate into their measured positions; explanations follow |
| Machine ↔ CPU | Actual fields collect into the instruction input; only paths marked active by the existing CPU frame reveal |
| CPU ↔ ALU | Actual ALU block becomes the larger ADD component; existing D=3/M=2 values, decimal result and binary representation remain correct |
| ALU ↔ Gates | ADD opens one selected full-adder interface with real A/B/Cin/Sum/Carry, then its XOR/AND/OR decomposition |
| Gates ↔ NAND | Selected primitive expands into its real NAND construction; entry resolves actual signal dependency depths to its output |

Reverse navigation uses the same anchors and relationships. Direct, nonadjacent ladder selections use a corresponding focal handoff without replaying intervening layers. At addresses outside ROM 18 (or another source focus), hardware detail uses the existing contextual return view and never invents source-addition circuitry.

## Browser and visual inspection

Inspected rendered pixels using the NANDScope browser connector, including held intermediate animation frames for all three Priority A transitions. Captures are `artifacts/p2-plus-to-add.jpeg`, `artifacts/p2-add-unfold.jpeg`, `artifacts/p2-encoding.jpeg`, and `artifacts/p2-mobile.jpeg`. Temporary frame-holding instrumentation was removed; the delivered page is at idle.

- Traversed Code → VM → Assembly → Machine → CPU → ALU → Gates → NAND and back in the final production app at 1440×1000. Every destination settled at idle, ROM remained 18, and no overlays remained. Header top stayed 0 and footer top stayed 928 throughout. No horizontal overflow.
- Inspected the CPU, ALU, full-adder and NAND diagrams visually. The full CPU datapath remains visible in the fixed frame, including D=3, memory input 2, output 5 and writeM=1. Dense supplemental content scrolls inside the visualization.
- Tested direct ladder selection and rapid repeated level requests. Only the first accepted request ran; the final state was VM, with unchanged ROM and no leftover overlay.
- Tested ladder ↑/↓: active level and focus moved together, with exactly one `aria-current` item. Tested actual browser ←/→ at CPU: ROM 18 → 17 → 18, source operation remained `+`, and page scroll stayed 0.
- Stepped before descending: ROM 17 `A=A-1` stayed synchronized through Machine and CPU. ALU/Gates/NAND displayed **The source + is still ahead**. Jump to addition returned to ROM 18. Next to ROM 19 showed **already executed**, and Previous returned to ROM 18.
- Preserved selected bit 2 and OR through Gates → NAND and upward navigation. The actual OR(0,0) network resolved to 0 at ROM 18. Reset and signal stepping remain available independently of the execution cursor.
- Also checked Machine through NAND at 1200×800: all settled, ROM remained 18, footer position stayed constant and content width did not exceed viewport width. Resizing settles pending transitions without stale overlays.
- The final production browser reported no console messages, warnings or errors after the verification flows.

## Mobile and reduced motion

At exact 390×844, traversed all eight layers down and back. Measured content width stayed 390 throughout, ROM stayed 18, window scroll stayed 0 during the top-of-page traversal, and the sticky footer stayed at y=772. Visually inspected Code, gates, machine fields/ROM rows and a resolved NAND OR network. Page scrolling exposes lower explanations and diagram controls; the footer stays available. Source-to-VM motion simplifies when showing execution controls moves the mobile frame; offscreen source anchors also use immediate destination highlighting.

The browser connector's `emulate` API has no native reduced-motion override. Tested the actual application's `MediaQueryList.matches` branch using a temporary query shim in the production page, then removed it. All fourteen down/up requests reached the same destinations with the same ROM, zero moving focal objects, and computed scene transforms of `none`; measured completion was approximately 0.18–0.24 seconds including preparation. The existing `prefers-reduced-motion` CSS rule remains, and the presentation CSS additionally suppresses transforms whenever the request marks reduced motion. Native OS/browser preference emulation was not independently exercised by this tool.

## Visual limits and P3 recommendation

DOM representations move, resize and crossfade; font outlines do not interpolate. Hardware handoffs are simpler than the three software transitions. Dense explanations and carry/primitive controls may require contained scrolling on shorter desktop frames; narrow circuit labels remain primarily suited to desktop. Nonadjacent ladder jumps skip intermediate unfoldings, and mobile motion deliberately simplifies for offscreen or moving frames. NAND depth steps are logical dependencies, not propagation delays.

For P3, automate these browser flows and rehearse the silent demo with learners, then refine the lower-layer focus handoffs based on feedback. Keep the program and verified simulator fixed. P3 has not been started.

## P2 changed-file inventory

- Added: `src/components/transitions/state.ts`, `state.test.ts`, `anchors.ts`, `motion.ts`, `use-microscope.ts`, `microscope.css`.
- Updated workspace/navigation: `src/components/workspace.tsx`, `src/components/navigation/ladder.tsx`.
- Updated views: `src/components/layers/source.tsx`, `vm.tsx`, `assembly.tsx`, `machine.tsx`, `cpu.tsx`, `alu.tsx`, `gates.tsx`, `nand.tsx`.
- Updated shared UI: `src/components/shared/diagram.tsx`, `types.ts`, `reveal-instruction.ts`.
- Updated styling/test configuration/docs: `src/app/globals.css`, `vitest.config.ts`, `README.md`, `VERIFICATION.md`.
- Captured: `artifacts/p2-plus-to-add.jpeg`, `artifacts/p2-add-unfold.jpeg`, `artifacts/p2-encoding.jpeg`, `artifacts/p2-mobile.jpeg`.

# P4 verification

Verified on 2 October 2026 against Next.js 16.3.8 and the final production app at `http://127.0.0.1:3004`. The P0–P2 sections above are historical. This checkout had no P3 parser/editor implementation; P4 extends the existing deterministic simulator, execution reducer and microscope rather than replacing them.

## Automated checks

| Check | Result |
| --- | --- |
| `npm test` | **100/100 pass across 5 files**; all 56 historical tests preserved unchanged |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass, no errors or warnings |
| `npm run build` | Pass; `/` statically prerendered |
| Production startup | Pass at `127.0.0.1:3004` |

`src/core/memory.test.ts` adds 40 tests covering the real AST; all six RHS forms; unsupported syntax; source line errors; use-before-definition; first self-reference; deterministic symbol allocation; reassignment; prototype-like identifiers; stable semantic IDs; the 32-statement bound; exact VM output; push/pop local translation and CPU effects; VM/CPU stack and local agreement; copying; a program without addition; traces exceeding the former 256-cycle fixture guard; runtime overflow; earlier-frame memory; reversible reassignment snapshots; actual LCL lookup; provenance at every CPU frame; variable-to-storage-to-access graph paths; and separate addition/gate/NAND chains.

`src/components/transitions/memory-transition.test.ts` adds 4 tests for variable-to-VM forward/reverse mappings, unfolding the actual store group, selecting a later addition's own hardware frame, and safe contextual hardware views for a program without `+`.

## Architecture and allocation

The parser produces Program/LetStatement/IntegerLiteral/Identifier/BinaryExpression objects with spans and position/role IDs. `resolveSymbols` validates the RHS before allocating the target. The symbol table assigns local slots in first-definition order, using own-property checks. Reassignment keeps the slot. No source-specific global name mapping exists.

The compiler emits real VM commands with source occurrence, statement and expression IDs. Assembly carries those IDs and its VM ID; machine words retain assembly/VM/source provenance; decorated CPU frames retain that same chain. Statement highlighting derives from the current frame/command provenance. The graph adds statement containment, source occurrence → storage allocation, slot → symbolic RAM resolution, and actual CPU memory-access nodes. The memory jump reads an explicitly attached frame/VM ID; it does not derive provenance from instruction text or ROM ranges.

`push local i` emits `@LCL; D=M; @i; A=D+A; D=M` followed by the normal stack push sequence. This selects and reads RAM[LCL+i]. `pop local i` keeps the existing R13 destination-address sequence and real stack pop, ending with `@R13; A=M; M=D`. The assembler and CPU instruction semantics are unchanged. The finite recording guard now accommodates the generated straight-line ROM's length.

Each `+` gets its own actual addition frame, recorded operands, ripple-adder slices and hardware graph. No UI circuit uses fixed 2/3/5 data or a fixed arithmetic ROM address. The no-argument `createDemo()` compatibility facade retains the historical fixture's identities and exact binary reference for the unchanged regression tests; explicit-source demos use the new semantic IDs through the same parser/compiler pipeline.

## Memory and cursor behavior

One shared `{ operationId, address }` reducer still owns execution. Stepping or selecting executable rows preserves source operation identity. Source selection distinguishes target/write, left/read, operator/arithmetic and right/read occurrences.

The memory panel derives only program-relevant cells from `frame.after.ram[frame.after.ram[1] + slot]`. Before → after comes from that frame's own RAM snapshots. Read/write emphasis comes from the frame's real CPU memory access, including writes that do not change the stored value. Values are explicitly labeled **after the selected clock edge**. Source statement, VM, assembly, machine, CPU and memory use the same cursor. Editing allocates no UI-only memory state.

Memory and editor details use progressive disclosure. Selecting a variable opens its storage path, while instructions and CPU diagrams remain in their existing layers. Dense scene content scrolls inside the fixed desktop stage. At narrow widths, vertical page scrolling exposes the memory table and explanations.

## Browser acceptance

Inspected actual rendered pixels in the NANDScope browser connector, against production builds, at **1440×1000** and exact **390×844** (mobile/touch).

| Program/check | Observed result |
| --- | --- |
| A: x=7; y=9; result=x+y | 75 machine frames; final RAM[300..302] = 7, 9, 16 |
| A: instruction-by-instruction memory | Stepped all 75 positions through the real Next button; asserted every position against the expected memory timeline |
| A: store edges | ROM 17: [0,0,0]; 18: [7,0,0]. ROM 36: [7,0,0]; 37: [7,9,0]. ROM 73: [7,9,0]; 74: [7,9,16] |
| A: variable focus | Clicked source reads x and y and the result destination; observed local 0/1/2, RAM 300/301/302 and separate read/write explanations |
| A: CPU read | x read at ROM 42: `D=M`, A=300, inM=7; Why describes that actual load |
| A: CPU write | result write at ROM 74: `M=D`, A=302, D=16, outM=16, writeM=1; Why describes that actual store |
| A: reverse | Previous and native ← from ROM 74 return result to 0 at ROM 73; → restores 16, without page scrolling |
| B: x=2; x=x+1 | Compiled through the textarea; one slot only, writes 0→2 at ROM 18 and 2→3 at ROM 52 |
| C: result=missing+1 | Clear Line 1 use-before-definition message; the previous three-statement source, ROM 62 cursor, 75-frame trace and source focus stayed intact |
| Arithmetic microscope | Selected the source `+`; VM add / `M=D+M` / binary / CPU remained at ROM 62 through all 14 adjacent down/up transitions |
| Hardware pixels | ALU shows 7+9=16. Full-adder bit 1 has A=1, B=0, Cin=1, Sum=0, Carry=1. NAND XOR(1,0) resolves to 1 |
| Executable synchronization | ROM 74 selected pop local 2 in VM, M=D in Assembly, 1110001100001000 in Machine, and the same CPU write frame |
| Keyboard navigation | Native ladder ↓ moved Code→VM→Assembly, kept ROM 74 and gave focus to the actual active item; exactly one ladder item had aria-current |
| Native range stepping | Focused range ← advanced once backward; earlier reassignment value remained 2 before its final write |
| Mobile | All 8 layers down and back at 390×844; measured content width remained exactly 390, with the cursor held at ROM 62 and no leftover overlays |
| Console | No console messages, warnings or errors after the final production reload and final verification flows |

The early browser pass exposed a Chrome accessibility warning when a selected source button retained focus while its outgoing transition plane became aria-hidden. The final coordinator moves focus to the persistent stage before hiding/inerting that plane. Repeated the final mobile down/up traversal after rebuilding and restarting production: the warning was gone.

The original arithmetic and reverse-transition tests remain passing. Reduced-motion reducer behavior is covered by the unchanged P2 tests; native OS reduced-motion preferences were not independently re-emulated during P4.

## Saved evidence

- `artifacts/p4-memory.jpeg`: desktop name/local/RAM table, final result write and dynamic Why panel.
- `artifacts/p4-cpu-write.jpeg`: actual final store through the CPU datapath.
- `artifacts/p4-mobile.jpeg`: 390×844 memory table with result 0→16 and no horizontal overflow.
- `artifacts/p4-nand.jpeg`: the default program's real XOR slice resolved at ROM 62.

## Known limitations and P5 recommendation

The implemented teaching grammar has at most 32 statements, 0–32767 literals and unsigned sixteen-bit runtime values. RAM snapshots bound source size; there is no general VM/Jack frontend. SP/LCL are preinitialized by the harness. The trace is finite and straight-line, so ROM address equals frame index. VM stack drawings remain whole-command boundaries, while memory is instruction-exact. Hardware detail expands source additions; NAND steps are logical dependencies. Narrow screens use vertical scrolling, and some desktop content needs contained scrolling. These are documented limits rather than unimplemented P4 requirements.

For P5, add comparison/conditional-jump concepts only after separating a CPU execution visit/frame index from its ROM address, then carry existing source provenance into taken and untaken paths. Do not add loops or functions as part of that decisions lesson. P5 has not been started.

## P4 changed-file inventory

Added:

- `src/core/parser/index.ts`
- `src/core/compiler/index.ts`
- `src/core/trace/memory.ts`
- `src/core/memory.test.ts`
- `src/components/shared/memory-panel.tsx`
- `src/components/shared/memory.css`
- `src/components/transitions/memory-transition.test.ts`

Updated:

- `src/core/vm/index.ts`
- `src/core/cpu/index.ts`
- `src/core/trace/demo.ts`
- `src/core/trace/execution.ts`
- `src/core/trace/graph.ts`
- `src/components/workspace.tsx`
- `src/components/shared/types.ts`
- `src/components/shared/why-panel.tsx`
- `src/components/shared/execution-controls.tsx`
- `src/components/navigation/ladder.tsx`
- `src/components/layers/source.tsx`
- `src/components/layers/vm.tsx`
- `src/components/layers/assembly.tsx`
- `src/components/layers/cpu.tsx`
- `src/components/layers/alu.tsx`
- `src/components/layers/gates.tsx`
- `src/components/layers/nand.tsx`
- `src/components/transitions/anchors.ts`
- `src/components/transitions/motion.ts`
- `src/components/transitions/use-microscope.ts`
- `src/components/transitions/microscope.css`
- `src/app/layout.tsx`
- `README.md`
- `SPEC.md`
- `VERIFICATION.md`

Captured: the four P4 screenshots listed above. `tsconfig.tsbuildinfo` is also regenerated by typechecking. Existing test files, assembler, ALU and gate-simulator modules were not edited. No dependency was added. The checkout has no Git metadata, so this inventory records the files touched rather than claiming a Git diff.


# Comprehensive systems expansion — completed 2 October 2026

Verified with Next.js 16.3.8 and the production app at http://127.0.0.1:3005. This is one completed systems expansion, with real machine execution throughout. No dependency was added and the existing CPU, ALU, gates and microscope coordinator were retained.

## Final acceptance report

| # | Area | Implemented result |
| --- | --- | --- |
| 1 | Language | let/reassignment, signed literals, names, nested +/-, parentheses, </>/==, if/optional else, while, top-level functions, arguments/locals, calls/returns, nested calls, recursion, fixed arrays, keyboard(), screen(), call statements and comments. |
| 2 | AST | Typed Program/statement/expression/assignment-target unions with stable syntax-role IDs and spans/line information. No UI string parser or JavaScript source evaluator. |
| 3 | Compiler | Recursive AST → VM lowering with scoped occurrence bindings. Main slots, static globals, parameters and callee locals are distinct. Let inside blocks shares the enclosing scope. |
| 4 | VM | push/pop constant/local/argument/static/temp/pointer, add/sub/gt/lt/eq, label/goto/if-goto, function/call/return/drop, bounded array allocation/access and KBD/SCREEN commands. Internal R13–R15 support effective addresses and returns. |
| 5 | Labels | Strict two-pass program assembler resolves forward/backward labels and keeps source/VM provenance; pseudo-labels consume neither ROM nor cycles. Machine view displays symbolic → numeric targets and real Hack fields. |
| 6 | Cycles | Canonical cycleIndex selects a recorded frame; its romAddress selects ROM/assembly/machine. ROM, statement and VM indexes have repeated visits. The legacy address spelling denotes a cycle. |
| 7 | Branches | Real Hack comparisons/jumps. Opposite-sign operands are handled before subtraction to avoid signed overflow. Skipped source/VM/assembly/machine code has no CPU frames and does not move the runtime cursor when inspected. |
| 8 | Loops | Real condition/body/backward-jump lowering, repeated ROM visits and iteration indication. Selecting while follows its real backward-jump VM command. |
| 9 | Functions | Actual saved return address/LCL/ARG/THIS/THAT on the machine stack; callee ARG/LCL, zero-initialized locals, return-value placement and restored caller registers. Nested/recursive calls create distinct RAM-backed frames. |
| 10 | Arrays | Monotonic bounded heap, real length headers and base/index values; bounds checks, effective-address calculation and indirect RAM reads/writes. Arrays may be passed/returned or aliased. |
| 11 | I/O | keyboard reads RAM[24576]; screen writes RAM[16384+offset]. A simulated signed word and compact sixteen-pixel screen-word display expose actual device memory. |
| 12 | Memory | Independent copy-on-write 256-word RAM pages; selected-edge values for main slots, frame arguments/locals, stack, arrays and touched devices. Relevant regions only. |
| 13 | Provenance | Every executed frame carries cycle/ROM/machine/assembly/VM/source occurrence, statement/expression/function and frame identity. Frames decorate by executed PC, not cycle-as-ROM indexing or text matching. |
| 14 | Graph | CPU nodes use cycle IDs; machine nodes use ROM IDs. Added controls, loops-to, invokes, stored-as, resumes-at and array resolves-to alongside allocation/hardware chains. Indexed adjacency handles repeated execution efficiently. |
| 15 | Microscope | Existing reducer, DOM/SVG capture and animation coordinator preserved. Cycles resolve to ROM for anchors; repeated +/- occurrences retain their actual operands. Subtraction shows a mathematically equivalent adder identity and actual M-D ALU controls. Skipped ROM uses context handoff. |
| 16 | Tests | 140 passing tests across six files. Historical simulator, encoding and transition regressions remain. Nine former unsupported-syntax cases were superseded because those constructs are now valid; RAM equality tests compare snapshot contents and the statement-bound test now checks 128. |
| 17 | Static checks | Typecheck pass; lint pass without warnings; production build pass with / statically prerendered; final production startup pass. |
| 18 | Desktop | Actual rendered pixels inspected at 1440×1000, all ten examples and both branch paths, memory/call frames/recursion/arrays/devices/PC and down/up navigation. No horizontal overflow or app console errors. |
| 19 | Mobile | Exact 390×844, mobile/touch. All examples and all eight layers down/up, 14 adjacent transitions, unchanged arithmetic cycle, zero leftover overlays, measured width=390. Frame/array/device/PC pixels inspected. Source states/iteration badges are visible. |
| 20 | Limits | No general-purpose runtime, extra arithmetic/comparisons, closures/classes/OS/GC. Arrays are word pointers with a bounded monotonic allocator; keyboard is fixed per run. VM boundaries and completed decision visits are explicitly distinguished from the selected CPU edge. Dense views scroll; hardware text is easiest on desktop. |

## Automated evidence

| Check | Final result |
| --- | --- |
| npm test | 140/140 pass, six files |
| npm run typecheck | Pass |
| npm run lint | Pass, no warnings/errors |
| npm run build | Pass, Next.js 16.3.8; / statically prerendered |
| npm run start -- --port 3005 | Ready, http://127.0.0.1:3005 |

`src/core/systems.test.ts` covers all examples, spanned AST/validation, precedence/associativity, scope/argument/local distinctions, all 36 boundary pairs per signed comparison, arithmetic wraparound/subtraction slices, forward/backward/duplicate/unknown labels, both branch paths and skipped provenance, optional/nested blocks, every cycle mapping, backward jumps, exact loop memory, repeated hardware occurrences, infinite-loop/recursion limits, argument order, local initialization, result placement, return addresses, multiple/nested calls and caller locals, THIS/THAT restoration, four recursive frames, arrays in functions, allocated-array return values, aliases, bounds, KBD/SCREEN, independent shared-page snapshots, resource limits, stack protection and unique complete graph endpoints.

The core 31-word historical 2+3 fixture and fixed binary reference still pass. Addition gate truth tables, all documented ALU comp encodings, old-A simultaneous write/jump semantics, memory history and reverse inspection, and P2 phase/reversal/locking/reduced-motion tests remain passing. Source lowering remains exact for existing straight-line programs.

## Browser programs and outcomes

Compiled and executed through the actual rendered editor/example buttons. Final-memory values were read from the rendered memory panels; final cycle/ROM and intermediate controls were inspected in the production browser.

| Program | Runtime | Observed result |
| --- | --- | --- |
| Arithmetic: x=7+9 | 31 cycles | RAM[300]=16; actual source addition at cycle index 18 / ROM 18 |
| Memory: x=7; y=x | 41 cycles | RAM[300..301]=7,7 |
| Reassignment: x=2; x=x+1 | 53 cycles | One slot; final store 2→3 |
| Decision: 7>9 | 134 cycles, 163 ROM words | Else writes result=9; if-body remains in ROM with zero visits |
| Decision: 9>7 | 130 cycles, 163 ROM words | If writes result=9; else source is skipped |
| Loop: x<3 | 323 cycles | x=3; condition values 0,1,2,3 and three backward jumps |
| Function: add(2,3) | 163 cycles, 212 ROM words | result=5 at RAM[1536]; arguments RAM[256]=2 / [257]=3, LCL=263, local sum initially zero |
| Nested: twice(add(2,3)) | 361 cycles | result=10; nested machine calls restore caller frames |
| Recursion: countdown(3) | 607 cycles | Four distinct frames; deepest n=0 at RAM[274], LCL=280, saved return ROM 224; complete unwind |
| Array | 270 cycles | base=2049, RAM[2049]=7, RAM[2050]=9, x=9; exact indirect read/write CPU accesses |
| I/O with KBD=65 | 69 cycles | keyboard read RAM[24576]=65, key=65; SCREEN word RAM[16394]=65 with pixel bits 0 and 6 set |

Loop browser history exposes cycle 103/187/271 at ROM 113, each jumping to ROM 19. Stepping cycle 187→188 changes ROM 113→19; Previous reverses exactly. Source arithmetic in the third iteration reaches cycle 257/ROM 99 with operands 2+1=3; ALU, bit slice and NAND use that occurrence, not the first iteration. Selecting while in the final build selects cycle 102/ROM 112 (load target); Next executes cycle 103/ROM 113 (backward jump), then cycle 104/ROM 19 (condition again).

Function setup begins with SP=258, ARG=0, LCL=300. Entry exposes ARG=256, LCL=263 and saved RAM[258..262]=61,300,0,0,0. Source, VM, assembly, machine and CPU stay synchronized inside the callee. Recursive frames use real distinct argument/frame addresses, with progressive disclosure for inactive callers. Returning removes frames at the actual return jump. These UI values are reads from the selected machine snapshots.

A skipped source destination/ROM selection retains the cycle cursor and gives the actual bypass jump explanation. Machine inspection can display its bits, while CPU continues to show the real selected cycle. Label selection explicitly explains that it has no standalone cycle. Control views display a completed decision with its own cycle or state that the decision is pending; they do not borrow a future condition result. Array panels show requested base/index and current RAM/R13 values.

An invalid editor compile (`let result = missing + 1;`) reports the correct source line and preserves the previous program/cursor. `while (1) {}` records exactly 12,000 real cycles, displays the infinite-loop/excessive-recursion warning and remains interactive; choosing Arithmetic starts a valid new run normally.

## Rendering, motion and console

All ten curated examples were exercised at both 1440×1000 and exact 390×844. Document scrollWidth always equaled viewport width. The seven down and seven up arithmetic transitions retained cycle index 18, settled at idle and left no microscope overlays on either viewport. Skipped instructions, source highlighting, call frames, actual memory writes, indirect-array regions, device words and backward PC transfers were inspected in rendered pixels, including the narrow frame/array/PC/device panels.

The arithmetic pipeline remains source operator → VM command → real assembly/encoding → CPU → ALU → full-adder slice → gates → NAND. The repeated-loop third addition and subtraction 7−9=−2 were separately inspected; subtraction's actual controls were 0 0 0 1 1 1, with equivalent-adder carry-in 1. Source ↔ VM, VM ↔ assembly and assembly ↔ machine transitions preserve their measured handoffs. Existing reduced-motion reducer tests pass; native OS reduced-motion emulation was not repeated in this pass.

Final production console inspection reports no messages/warnings/errors. A browser check found A-instruction flag labels rendering NaN when the ALU was idle; the final CPU view renders an em dash instead and was rechecked after rebuilding. Browser-tool evaluation errors from an outdated selector/session helper were tool errors, not application console errors, and were recovered by fresh DOM inspection/helper initialization.

## Bounds and practical limits

The limits in README.md are active: source characters/statements/functions/depth, VM/ROM size, cycles, stack range, array size/heap and screen offsets. Runtime bounds failures preserve partial history and a useful reason. Copy-on-write memory pages avoid full 64 KiB copies for every frame. The synchronous recording/build work is bounded; this is not an unbounded language service.

Only completed VM visits have boundary stack diagrams; the selected CPU edge has exact memory/register/PC state. Source statements are displayed once despite repeated execution. Arrays have no deallocator/garbage collector, and a word can be used as a pointer; this is an educational RAM model, not a type-safe memory system. KBD is fixed for the run. SCREEN exposes up to sixteen touched words. Jump history shows up to 100 events, while the slider reaches the entire trace. Deep/nested content uses contained desktop scrolling and vertical mobile scrolling; the hardware diagram's small labels remain clearer on desktop.

## Changed-file inventory

Added: `src/core/limits.ts`, `src/core/cpu/ram.ts`, `src/core/systems.test.ts`, `src/components/shared/systems-panel.tsx`, `src/components/shared/systems.css`, and systems browser evidence in `artifacts`.

Updated: parser/compiler/VM, program assembler, CPU history, gates' optional carry-in, trace demo/cursor/graph/memory, workspace and shared types/controls/Why/memory panels, source/VM/assembly/machine/CPU/ALU/gates/NAND views, transition anchors/motion/inspection type, app metadata, README/SPEC/VERIFICATION and the two historical tests whose grammar/bound/snapshot assumptions changed. The microscope coordinator and existing transition state tests were retained. No Git metadata exists in this checkout, so this inventory does not claim a Git diff.

Saved evidence:

- `artifacts/systems-desktop.jpeg`: final desktop source, active/skipped states and cycle/ROM controls.
- `artifacts/systems-array.jpeg`: real main slots, final indirect-read write and array RAM contents.
- `artifacts/systems-frame.jpeg`: current add frame, argument/local addresses and saved caller state.
- `artifacts/systems-nand.jpeg`: actual arithmetic occurrence's XOR NAND circuit.
- `artifacts/systems-motion.jpeg`: source + → VM add handoff at 320 ms, with nine active animations and one temporary overlay.
- `artifacts/systems-mobile-frame.jpeg`, `systems-mobile-array.jpeg`, `systems-mobile-io.jpeg`, `systems-mobile-pc.jpeg`: exact 390×844 frame, array, keyboard/screen and backward-PC views.
- `artifacts/systems-mobile-checks.json`: mobile example outcomes and fourteen settled adjacent transitions.

The motion capture temporarily paused browser animations and held the coordinator's finish callback to inspect the real intermediate handoff. The callback and native timer were restored, the transition settled with zero overlays, and the page was freshly reloaded and checked again. No temporary motion instrumentation remains in the final page or source.

# Focused expansion — completed 3 October 2026

Pointers/references, bitwise AND/OR/NOT and Explorer runtime playback are complete in one pass. Verification used Next.js 16.3.8 and the production app at http://127.0.0.1:3007. The baseline 140 tests remain passing; 44 new cases bring the total to 184 across eight files. No dependency was added. The existing assembler, ALU simulator, cycle history, copy-on-write RAM and microscope coordinator were retained.

## Final acceptance report

| # | Area | Completed result |
| --- | --- | --- |
| 1 | Files changed | Seven added source files, 24 updated source files, README/SPEC/VERIFICATION, generated TypeScript build info and nine browser-evidence files. Exact inventory below; this checkout has no Git metadata. |
| 2 | Pointer grammar / AST | `&identifier`, `*identifier`, `let *identifier = expression;`; proper AddressOfExpression, DereferenceExpression and DereferenceTarget nodes with IDs, spans and identifier children. Nested arithmetic after dereference is supported. |
| 3 | Pointer semantics | A deliberately small value/pointer distinction with stable slot kinds, pointer aliases/reassignment and definite initialization merged across both branches. Invalid dereference, unknown address target, numeric pointer assignment, pointer arithmetic/indexing, pointer-to-pointer and pointer arguments/returns produce line-aware errors. |
| 4 | Pointer lowering | Narrow `address-of`, `indirect-read` and `indirect-write` commands retain source/storage provenance. Addresses are actual LCL/ARG + slot or static RAM[1536 + slot], including current function storage. |
| 5 | Indirect memory | Real Hack instructions pop the address, check zero with a machine jump, load A and access RAM[A]. Writes preserve the address on the real stack while evaluating the RHS, then use R13/R14 to write M=D. An RHS function cannot destroy the destination through scratch-register reuse. |
| 6 | Pointer provenance | Generation attaches storage IDs and explicit pointer effects. Executed events connect source/slot/address-value/actual RAM cell/CPU bus read or write. Explorer paths come from bindings and selected memory snapshots, rather than parsing UI text. |
| 7 | Bitwise syntax | Binary `&` and `|`, unary `~`; `&name` is unambiguously prefix address-taking. Precedence is prefix, +/-, </>, ==, &, then |. `&&`, `||` and `^` remain unsupported. |
| 8 | Bitwise lowering | VM and/or/not emit M=D&M, M=D|M and M=!M; real assembly encoding and CPU ALU output are tested. Results are 16-bit words, including ~0 = 65535 raw / -1 signed. |
| 9 | Hardware model | Discriminated ArithmeticTrace/BitwiseTrace records are tagged at generation and populated from actual executed ALU operands. Chronological hardware occurrences preserve repeated operations. Historical arithmetic records/IDs and ripple-carry views remain compatible. |
| 10 | Gates / NAND | Sixteen independent AND/OR/NOT bit slices with selectable bits and corresponding primitive/output. AND uses two NANDs, OR three, NOT one with tied inputs. Bitwise views expose no carry circuit. All primitive input combinations are tested. |
| 11 | Runtime architecture | A pure playback reducer wraps the existing execution focus; each tick advances exactly one recorded CPU frame. One cancellable timeout is scheduled per committed edge and cleaned up on pause, seek, compile, speed change or unmount. Final-edge playback stops; Replay restarts at index 0. |
| 12 | Speeds | 0.5× = 900 ms, 1× = 450 ms, 2× = 225 ms. Accessible labeled selector; changing speed cancels the old deadline without creating another runtime memory store. |
| 13 | Jumps / loops / functions | Actual frame PC before/after supplies transfer indicators. Full loop playback visited all 323 cycles, including three ROM 113 → 19 backward jumps and x=0→1→2→3. Full add-function playback visited all 163 cycles, pushed the actual saved frame at index 60 and removed it at return index 155, finishing with result=5. |
| 14 | Guided additions | Five-step “What is a pointer, really?” lesson and four-step “What does a bitwise operation actually do?” lesson. Values and technical details are derived from the compiled demo/events. Addition, decisions and pointers are featured; six extra concepts include bitwise AND and functions. One-click addition demo and existing taglines remain. |
| 15 | Explorer changes | Distinct x/&x/p/*p paths, five new examples, operation-aware ALU/gates/NAND, Play/Pause/Replay, source following, exact RAM before→after, real jump/frame indicators and contained instruction-list scrolling. Manual steps/seeks/focus/layers/compile/modes pause playback. Guided autoplay remains separate. |
| 16 | New tests | expansion.test.ts: AST/validation, aliases/branch initialization, actual/custom-LCL/static/ARG/local addresses, indirect writes with function RHS, zero-global-pointer trap, graph paths, arithmetic after dereference, bitwise precedence/encodings/16-bit outputs/repeated hardware, per-bit NAND truth tables and microscope anchors. playback.test.ts: exact history, pause/inspection/reset/replay/final edge, jumps/functions/source identity, all speeds and timer cancellation. |
| 17 | Tests | 184/184 pass across eight files, including all 140 baseline regressions. Existing test assertions were retained; the primitive truth-table expectation now includes NOT. |
| 18 | Static checks | npm run typecheck: pass. npm run lint: pass without warnings/errors. npm run build: pass, production routes statically generated. Final production server ready on port 3007. |
| 19 | Browser | Actual desktop rendering inspected at 1440×1000; pointer Guided/Explorer, indirect write, *p+1 through NAND, AND across all eight layers, OR=14, NOT=65535/-1, complete loop/function playback, source/compile/mode/layer/step/slider pause behavior, native Space keyboard interaction and contained VM/assembly scrolling. No console, React or hydration messages. |
| 20 | Mobile | Exact 390×844 mobile/touch rendering: both new lessons, pointer Explorer, runtime controls and speed selector, backward PC indicator, NAND circuit, pointer write and OR/NOT memory. Fourteen adjacent bitwise down/up transitions held cycle index 18, settled idle, left zero overlays and kept scrollWidth=390. Runtime controls were above the footer with no sticky overlap. |
| 21 | Accessibility | Final pointer Explorer and narrow NAND Lighthouse snapshots: accessibility 100, best practices 100, SEO 100, agentic browsing 100; zero failed audits. Fixed dim-text contrast, memory-table header/cell roles and runtime form-field labeling. Native Space toggles playback; focus stays on its button. These are snapshot audits, not a complete accessibility audit or performance run. |
| 22 | Limits | Explicit identifiers only; no arbitrary address literals, pointer arithmetic, pointer-to-pointer, casts, pointer indexing or pointer function arguments/returns. No general type/lifetime system or malloc/free. XOR/logical &&/|| omitted. Playback uses the existing bounded recorded history (12,000 cycles), with existing source/VM/ROM/stack/heap limits. NAND signal steps describe logical dependency depth, not physical timing. Dense hardware text is easiest on desktop. |

## Browser evidence and runtime details

The pointer program finishes after 74 recorded cycles with RAM[300..302] = 7, 300, 7. Address computation is at cycle index 22; the actual dereference read is at index 56, ROM 56, with A=300 and RAM[300]=7. Selecting the address-taking event and then x displays the ordinary-value path RAM[300]→7; p shows its own RAM[301] holding 300; *p shows that stored number being used to read RAM[300]. Earlier snapshots intentionally show uninitialized cells as zero or pending instead of borrowing later values. Guided shows the five completed teaching steps with x, &x, p, *p and y.

The Pointer write example finishes with x=9, p=300, y=10. The custom *p+1 program exposes the actual 7+1=8 ALU edge and the existing adder/gates/NAND path. AND 12&10 yields 8 at cycle index 18 with controls 0 0 0 0 0 0; OR yields 14 with 0 1 0 1 0 1; NOT ~0 yields raw 65535 with 1 1 0 0 0 1. Bitwise NAND uses the operation's own primitive even when the previous arithmetic primitive was XOR.

Full loop playback was observed with a DOM-only history observer: indices 0..322 were contiguous, no skipped or invented cycles, playback ended paused. At indices 102/186/270 the displayed PC transfer was ROM 113→19 and the condition visit was 1/2/3. Writes at indices 100/184/268 showed RAM[300] 0→1, 1→2 and 2→3. The observer did not change app state or timers.

Full function playback similarly observed all indices 0..162. Entry at index 60 showed ROM 60→68, ARG=256, LCL=263, arguments 2 and 3, and RAM[258..262]=61,300,0,0,0. Return at index 155 showed ROM 162→61 and removed the frame. Final RAM[1536]=5. Both observers were disconnected after inspection.

During separate live VM/assembly playback samples, every current row remained within its list and page scroll stayed constant. VM scroll changed only when its next command left the container; assembly revealed only the row crossing an edge. Layer/source changes, compile, manual step/seek and mode switch each stopped playback without stray ticks. A failed compile reported the missing-variable source line, paused playback and retained the previous trace. Native Space tested both the stage shortcut and the focused runtime button.

Saved evidence:

- artifacts/expansion-pointer-desktop.png — final production pointer target/read path.
- artifacts/expansion-pointer-mobile.png — real p→300→RAM[300]→7 path at 390×844.
- artifacts/expansion-and-nand.png — desktop operation-aware AND NAND circuit.
- artifacts/expansion-and-nand-mobile.png — same circuit at 390×844.
- artifacts/expansion-bitwise-mobile.png — Guided bitwise lesson's final NAND step.
- artifacts/expansion-runtime-start.png — mobile runtime controls, speed 2×, actual backward ROM 113→19 jump and condition visit.
- artifacts/expansion-loop-complete.png — complete desktop loop run.
- artifacts/expansion-loop-playback.json — exact observed cycle count, backward jumps and RAM write progression.
- artifacts/expansion-function-playback.json — exact observed cycle count, frame push/pop and final result.

The final Lighthouse reports were generated at C:/Users/user/AppData/Local/Temp/chrome-devtools-mcp-hxFJPT/report.json (pointer) and C:/Users/user/AppData/Local/Temp/chrome-devtools-mcp-3BG6M4/report.json (narrow NAND). The tool labels snapshot device as desktop even with a 390×844 emulated viewport; mobile layout verification above used the actual viewport pixels and dimensions. Final production console inspection returned no messages. Browser helper selector errors were evaluation-tool errors, not app errors; fresh DOM inspection resolved them.

## Changed-file inventory

Added source:

- src/core/trace/hardware.ts
- src/core/trace/pointers.ts
- src/core/trace/playback.ts
- src/core/expansion.test.ts
- src/core/trace/playback.test.ts
- src/components/layers/bitwise.tsx
- src/components/shared/pointer-panel.tsx

Updated source:

- src/core/parser/index.ts
- src/core/compiler/index.ts
- src/core/vm/index.ts
- src/core/cpu/index.ts
- src/core/gates/index.ts
- src/core/trace/demo.ts
- src/core/trace/execution.ts
- src/core/core.test.ts
- src/components/workspace.tsx
- src/components/shared/execution-controls.tsx
- src/components/shared/types.ts
- src/components/shared/memory-panel.tsx
- src/components/shared/why-panel.tsx
- src/components/shared/reveal-instruction.ts
- src/components/shared/diagram.tsx
- src/components/shared/systems.css
- src/components/layers/source.tsx
- src/components/layers/alu.tsx
- src/components/layers/gates.tsx
- src/components/layers/nand.tsx
- src/components/transitions/anchors.ts
- src/components/guided.tsx
- src/components/guided.css
- src/app/globals.css

Documentation: README.md, SPEC.md and VERIFICATION.md. Typechecking regenerated tsconfig.tsbuildinfo. The nine saved evidence files are listed above. AGENTS.md was read and preserved, as were the installed Next guides. No dependency, unrelated feature, deployment or additional implementation phase was introduced.

## Final source-to-silicon debugger report

Verified 3 October 2026 against the final production build on `http://127.0.0.1:3008`. The existing 184-test suite passed before changes. The parser, compiler, VM translator, assembler, CPU semantics, recorded playback and original test assertions were preserved. AGENTS.md and the relevant installed Next.js server/client and CSS guides were read before implementation. No dependency, language feature or deployment was added.

| # | Requested report | Result |
| --- | --- | --- |
| 1 | Comparison architecture | `src/core/trace/compare.ts` constructs two independent Demo objects. TraceComparison retains both executions and source, VM, assembly, machine, runtime, hardware and metric differences, aligned operations, executed-statement sets, first divergence and a separate conditional-path divergence. React renders this data. |
| 2 | Semantic alignment | Sibling source statements use bounded LCS by statement kind and assignment target/name within the same enclosing IF, ELSE, loop or function region. VM visits use the mapped statement region, expression position, command family, control role, call-name path and chronological occurrence. A linear occurrence-key merge leaves unmatched visits explicit. An inserted indirect write does not shift a later dereference into an unrelated operation; unequal clock counts are supported. |
| 3 | First divergence | Within aligned executed VM visits, corresponding relative instruction offsets are checked for changed encoding, A/D state, memory output and jump decision. The first different actual edge supplies the category, both cycle indices, source statements and descriptions. Missing edges/visits are explicit path differences. Actual if-goto outcomes separately identify the first different conditional PC decision and subsequent source path. Changing x=7 to x=10 first changes @7/@10 at cycle 1; its later branch divergence is also exposed. |
| 4 | Comparison UI | Explorer has Compare; the current source and keyboard word become LEFT. Both sources are editable. Three presets, a first-divergence card, semantic-operation selector and six compact views cover Source/VM/Assembly/Machine/CPU/Hardware. Tokens and individual machine bits use restrained emphasis; real decoded comp/dest/jump fields identify the changed encoding. CPU can open either execution in Explorer. Hardware shows actual carry slices versus independent bit operations, primitive NAND signals, logical costs and program/selected-occurrence deltas. |
| 5 | Causal architecture | `src/core/trace/causes.ts` caches a forward CPU dataflow index per Demo using a WeakMap. A/D dependencies and actual RAM reads/writes retain value origins through stack and scratch copies. explainValue picks the latest accepted write at or before the selected cycle and reads the value from that historical RAM snapshot. The resulting DAG deduplicates references and bounds expansion by depth and node count. No source expression is evaluated in JavaScript. |
| 6 | Causal event types | Constants, initial RAM/register values, named reads, explicit writes, generic ALU computations, tagged source arithmetic/bitwise edges, executed comparisons, address-taking, pointer reads/writes, function returns, branch decisions and KBD input. Prior-write links support historical queries; repeated/limited dependencies are labeled. The compact chain exposes Inspect write, Inspect ALU, Inspect call frame and Go to previous value when the recorded event supports them. |
| 7 | Pointer/function/loop causality | Pointer writes retain p's own storage, stored target address and the real indirect write into that target. Function results retain the callee's actual return-to-ARG write/frame and the caller's later destination write as separate events. Parameter/local reads trace back to call arguments. The last loop write carries its real iteration and previous-write cycle; earlier x histories start folded under Show previous causes. |
| 8 | Metric definitions | ROM words are generated machine words; CPU cycles are recorded edges; unique ROM is the distinct executed addresses. RAM reads are C-edges that actually use M, including read-modify-write; writes are accepted M destinations, excluding ignored KBD writes. ALU operations count C-edges. Taken/backward jumps come from CPU jump results. Maximum stack words measures SP above 256 before/after edges, including calling state; maximum call depth uses recorded frame stacks. Source arithmetic/bitwise counts use hardware events. A selected occurrence measures its executed VM visit and generated translation. Partial traces remain labeled. |
| 9 | NAND-equivalent calculation | `buildNandNetwork` supplies each primitive's gate list and dependency depth. Sixteen independent AND/OR/NOT slices contain 32/48/16 NANDs with depths 2/2/1. arithmeticNetwork composes the same two half adders plus OR as the displayed fullAdder: 2×(4+2)+3 = 15 NANDs per slice; sixteen connected slices contain 240 NANDs with a 67-stage longest sum/carry dependency. Full-adder truth tables verify the composed graph. These are logical structures, not transistor counts, silicon area or physical latency. |
| 10 | Share-state format | Version-1 UTF-8 JSON in a URL fragment uses LZSS and URL-safe base64. Known programs use example keys; custom and Compare sources remain encoded. Fields restore mode, source focus, layer, cycle, bit, primitive, keyboard word, Guided concept/step, Compare preset/pair/exact paired cycles and Showcase scene. Tokens are bounded to 8,000 characters; decoded data to 30,000 bytes. Enum/numeric/source validation and recompilation protect restoration; malformed or uncompilable links fall back to Guided home. Web Share is preferred, with clipboard fallback and a temporary copy action during native sharing. Creating a link does not reset the session. |
| 11 | Showcase | Twelve three-second scenes use real Arithmetic, Pointer and Decision Demo objects plus the existing layer renderers and actual pointer/jump paths. The address scene uses its address-taking edge; dereference uses its later RAM-read edge. One cancellable timeout advances scenes; Pause, Restart, scene selection and replay cancel/reschedule appropriately. All twelve scenes and controls fit 1280×720. A live full sequence completed in 36,395 ms, reached the end card and stopped; pausing held the initial scene beyond one scene interval. |
| 12 | Tests added | 34 focused cases in `src/core/debugger.test.ts`: five comparison cases; six causal cases; eleven derived machine/circuit-cost cases; eleven share round-trip/invalid/bounded-codec cases; one real-data showcase case. They cover unequal paths, inserted pointer writes, loop occurrence alignment, true return-write identity, previous writes, historical input, full-adder truth tables, logical depths, custom Unicode source and distinct pointer address/read scenes. |
| 13 | Total tests | **218/218 pass across nine files**, including the preserved 184 baseline tests. Final run: 22:29:30 local time. |
| 14 | Typecheck | **Pass** — `npm run typecheck`, `tsc --noEmit`. |
| 15 | Lint | **Pass** — `npm run lint`, no warnings or errors. |
| 16 | Production build | **Pass** — `npm run build`, Next.js 16.3.8; production routes statically generated. Final build completed after the pointer-scene label and new-section heading corrections. The production server is ready on port 3008. |
| 17 | Desktop browser | Actual production UI verified for addition/AND source-to-hardware comparison, decoded machine fields, branch comparison outputs/unequal cycles/PC paths, pointer writes, function return and loop causes, Inspect write/ALU, cost cards, shared NAND restoration and exact Compare restoration. First-divergence inspection shows the actual earliest edge rather than the end of its VM visit. All twelve Showcase scenes were measured at 1280×720; hardware comparison was captured at 1440×1000. Final console inspection returned no warnings/errors. |
| 18 | Mobile | Actual 390×844 viewport: Guided addition lesson, vertically stacked Compare, loop/pointer/function causal chains and shared NAND bit 7. Compared cards use one column; no tested view has horizontal overflow. Causal heading receives focus when opened; closing via Enter returns focus to its Why button. Earlier loop causes remain folded initially. |
| 19 | Lighthouse/accessibility | **A fresh Lighthouse snapshot was unavailable**: NANDScope's browser connector repeatedly returned Session terminated. Historical scores above are not results for this build. Manual checks verified accessible names/headings, native button/select/range keyboard controls, causal focus entry/restoration, theme contrast styles and reduced-motion CSS. No claim of a new automated accessibility score is made. |
| 20 | Known limitations | Alignment is structural, not a proof of equivalence: renaming/reordering/different expression shapes and repeated recursive calls can create unmatched visits. Relative offsets inside an aligned VM visit can show differences caused by relocated labels. Causal expansion defaults to depth 7 and 48 expanded nodes; earlier dependencies need explicit inspection. Hardware cost models the displayed logical circuit; subtraction's operand inversion lies outside that selected ripple graph. Huge custom sources can exceed the link budget. KBD remains a fixed word per run, existing 12,000-cycle/language/storage bounds apply, and dense circuits are easiest on desktop. Clipboard fallback is implemented but this browser offered native Web Share, so a separate clipboard-only browser run was not available. |

### Recorded execution evidence

Addition/AND both execute 31 CPU cycles, read RAM 11 times, accept 9 writes and execute 19 ALU edges. Their selected source operation uses five cycles and two writes on each side. The real instruction fields differ only in comp: `1000010` (D+M) versus `1000000` (D&M), with dest `001` and jump `000`. The logical circuits differ: 240 versus 32 NAND-equivalent gates, depths 67 versus 2.

The branch preset finishes after 134 versus 130 cycles. Its comparison yields 0 versus 65535. The conditional jump at ROM 116 is not taken on the left (PC 116→117, displayed cycle 110) and taken on the right (PC 116→141, displayed cycle 108). The subsequent real source blocks are ELSE line 7 and IF line 5. Both exact first-divergence cycles restore to cycle 1/ROM 0 through a shared Compare URL, together with the CPU level and branch preset.

The loop finishes after 323 cycles with x=3. Its final causal write is displayed cycle 269, iteration 3, RAM[300] 2→3; the producing ALU edge is cycle 257, 2+1=3. Inspect actions moved the actual cursor to those edges. The pointer-write example finishes after 120 cycles: x=9 came through *p at cycle 74, with p in RAM[301] holding 300; address-taking was cycle 23 and p's own write cycle 40. The function example finishes after 163 cycles: result in RAM[1536] was written at cycle 161; the actual function return value was written at cycle 129; sum in RAM[263] at cycle 104 originated in the 2+3 ALU edge at cycle 92. The explanation keeps those timestamps separate.

A shared Explorer URL was generated at Arithmetic NAND cycle index 18, focus `source:statement:0:operator`, bit 7 and XOR. Reload restored Finally, only NAND, slider value 18, the pressed bit-7 button and the + focus. A malformed `#ns=!!` URL returned to Guided home and its Compare entry remained usable. Native Web Share completed. Browser automation suffered one approval-review timeout during a read; its allowed retry succeeded. This was not an application error.

### Saved evidence

- `artifacts/debugger-compare-desktop.jpg` — final real ripple-carry / independent-AND circuits and logical costs.
- `artifacts/debugger-compare-mobile.jpg` — one-column hardware comparison at 390×844.
- `artifacts/debugger-guided-mobile.jpg` — preserved Guided addition lesson.
- `artifacts/debugger-nand-desktop.jpg` — desktop selected NAND bit.
- `artifacts/debugger-shared-nand-mobile.jpg` — actual reloaded NAND cycle/focus/bit.
- `artifacts/debugger-cause-loop-mobile.jpg` — last loop write and producing ALU edge.
- `artifacts/debugger-cause-pointer-mobile.jpg` — actual p storage, effective address and indirect write.
- `artifacts/debugger-cause-function-mobile.jpg` — caller write and callee return with separate cycles.
- `artifacts/debugger-showcase-scene-checks.json` — twelve measured 1280×720 scenes without overflow.
- `artifacts/debugger-showcase-playback.json` — observed scene progression, 36,395 ms completion and empty warning/error log.
- `artifacts/debugger-showcase-finish.jpg` — final presentation layout.

### Changed-file inventory

Added: `src/core/trace/compare.ts`, `causes.ts`, `cost.ts`, `share.ts`, `showcase.ts`; `src/core/debugger.test.ts`; `src/components/compare.tsx`, `showcase.tsx`, `debugger.css`; `src/components/shared/causal-panel.tsx`, `cost-panel.tsx`, `share-button.tsx`.

Updated: `src/components/workspace.tsx`, `guided.tsx`, `shared/memory-panel.tsx`, `shared/types.ts`, `transitions/use-microscope.ts`; `README.md`, `SPEC.md`, `VERIFICATION.md`. Typechecking regenerated `tsconfig.tsbuildinfo`. Evidence files are listed above. This checkout has no Git metadata, so no commit/diff or deployment is claimed.
