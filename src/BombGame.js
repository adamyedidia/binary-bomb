import React, { useState, useEffect } from "react";

/* Helper: Convert the level’s program into a dictionary.
   If the level defines the program as a list, we assign line numbers 1, 2, … */
function convertProgram(prog) {
  if (Array.isArray(prog)) {
    let newProg = {};
    prog.forEach((instr, index) => {
      newProg[index + 1] = instr;
    });
    return newProg;
  } else {
    // If already a dict, make sure the keys are numbers.
    let newProg = {};
    Object.keys(prog).forEach((k) => {
      newProg[Number(k)] = prog[k];
    });
    return newProg;
  }
}

/* Given a program (dict mapping line numbers to instructions),
   insert a new instruction at the given target line.
   All lines with a line number >= target get shifted upward by 1.
   Note: We no longer update any jump targets in the instructions.
*/
function insertLine(prog, target, newInstr) {
  let newProg = {};
  let keys = Object.keys(prog)
    .map(Number)
    .sort((a, b) => a - b);
  keys.forEach((key) => {
    if (key >= target) {
      newProg[key + 1] = prog[key];
    } else {
      newProg[key] = prog[key];
    }
  });
  newProg[target] = newInstr;
  return newProg;
}

//
// getDisplayedProgram constructs a “display dictionary” of the program.
// It includes every defined line plus the immediate neighbors (and always the PC’s line and its neighbors).
// It also inserts a “…” marker between any non-contiguous blocks.
//
function getDisplayedProgram(prog, pc) {
  let keysSet = new Set();
  Object.keys(prog).forEach((k) => {
    let num = Number(k);
    keysSet.add(num);
    keysSet.add(num - 1);
    keysSet.add(num + 1);
  });
  // Always include the PC and its neighbors.
  keysSet.add(pc - 1);
  keysSet.add(pc);
  keysSet.add(pc + 1);
  let keys = Array.from(keysSet);
  keys.sort((a, b) => a - b);
  let displayLines = [];
  for (let i = 0; i < keys.length; i++) {
    if (i > 0 && keys[i] - keys[i - 1] > 1) {
      displayLines.push({ line: "...", instr: null });
    }
    let line = keys[i];
    let instr = prog[line] || { op: "EMPTY", args: [] };
    displayLines.push({ line, instr });
  }
  return displayLines;
}

function BombGame({ level }) {
  // The registers: A (player‐controlled), B, and T (time).
  const [registers, setRegisters] = useState(level.initialRegisters);
  // The program counter is 1-indexed.
  const [pc, setPC] = useState(1);
  // History stores snapshots of registers at each time step.
  const [history, setHistory] = useState({ 0: level.initialRegisters });
  // gameStatus: "waiting", "running", "won", or "lost".
  const [gameStatus, setGameStatus] = useState("waiting");
  // The value for register A as entered by the player.
  const [playerValue, setPlayerValue] = useState(level.initialRegisters.A);
  // Controls whether the simulation is running automatically.
  const [isRunning, setIsRunning] = useState(false);
  // Tooltip content and its position.
  const [tooltipContent, setTooltipContent] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  // The program is stored as a dict mapping line numbers to instructions.
  const [program, setProgram] = useState(convertProgram(level.program));

  // Reset the level state using the provided value for register A.
  const resetGame = (newA) => {
    const initialA = parseInt(newA, 10);
    const initRegs = { ...level.initialRegisters, A: initialA };
    setProgram(convertProgram(level.program));
    setRegisters(initRegs);
    setPC(1);
    setHistory({ 0: initRegs });
    setGameStatus("waiting");
    setIsRunning(false);
  };

  // When the level prop changes, reset the game.
  useEffect(() => {
    setPlayerValue(level.initialRegisters.A);
    resetGame(level.initialRegisters.A);
  }, [level]);

  // Helper: Given an argument (a register name or constant), return its numeric value.
  const getValue = (arg, regs) => {
    if (typeof arg === "number") return arg;
    if (regs.hasOwnProperty(arg)) return regs[arg];
    const num = parseInt(arg, 10);
    return isNaN(num) ? 0 : num;
  };

  // Helper: Format an argument for display.
  const formatArg = (arg) => {
    if (typeof arg === "string" && /^[A-Z]$/.test(arg)) {
      return `Register ${arg}`;
    }
    return arg;
  };

  // Format an instruction for display.
  const formatInstruction = (instr) => {
    switch (instr.op) {
      case "ADD":
        return `${instr.args[2]} ← ${instr.args[0]} + ${instr.args[1]}`;
      case "CJUMP":
        return `CJUMP ${instr.args[0]} ${instr.args[1]} ${instr.args[2]} → ${instr.args[3]}`;
      case "JUMP":
        return `JUMP ${instr.args[0]}`;
      case "COPY":
        // Two-argument form: "COPY A → B"
        if (instr.args.length === 2) {
          return `COPY ${instr.args[0]} → ${instr.args[1]}`;
        }
        return `COPY ${instr.args[0]}`;
      case "EMPTY":
        return `EMPTY`;
      case "TTRAVEL":
        return "TTRAVEL";
      case "DEFUSE":
        return "DEFUSE";
      case "EXPLODE":
        return "EXPLODE";
      default:
        return `${instr.op} ${instr.args.join(", ")}`;
    }
  };

  // Tooltip dictionary.
  const tooltipFuncs = {
    ADD: (args) =>
      `${formatArg(args[2])} ← ${formatArg(args[0])} + ${formatArg(args[1])}`,
    JUMP: (args) => `Jump to instruction ${args[0]}`,
    CJUMP: (args) =>
      `If ${formatArg(args[0])} ${args[1]} ${formatArg(args[2])}, jump to instruction ${args[3]}`,
    COPY: (args) =>
      args.length === 2
        ? `Copy the instruction at line ${args[0]} into line ${args[1]}`
        : `Copy the instruction at line ${args[0]} and insert it after the current line`,
    EMPTY: () => `No operation (does nothing)`,
    TTRAVEL: () => `Reset registers to their state at time T`,
    DEFUSE: () => `Defuse the bomb and win the game!`,
    EXPLODE: () => `Explode the bomb and lose the game!`
  };

  const getTooltipText = (instr) => {
    if (tooltipFuncs[instr.op]) {
      return tooltipFuncs[instr.op](instr.args);
    }
    return "";
  };

  // Execute one step of the program.
  const step = () => {
    // Get the current instruction from the program.
    // If pc is not defined in the program, treat it as EMPTY.
    const instr = program[pc] || { op: "EMPTY", args: [] };
    // Always increment T.
    const newT = registers.T + 1;
    let newRegisters = { ...registers, T: newT };
    // Default: advance PC by 1.
    let newPC = pc + 1;
    // Terminal instructions do not advance.
    if (["DEFUSE", "EXPLODE"].includes(instr.op)) {
      newPC = pc;
    }
    let newProgram = { ...program };

    switch (instr.op) {
      case "ADD": {
        const val1 = getValue(instr.args[0], newRegisters);
        const val2 = getValue(instr.args[1], newRegisters);
        const dest = instr.args[2];
        newRegisters[dest] = val1 + val2;
        break;
      }
      case "JUMP":
        newPC = getValue(instr.args[0], newRegisters);
        break;
      case "CJUMP": {
        const leftValue = getValue(instr.args[0], newRegisters);
        const operator = instr.args[1];
        const rightValue = getValue(instr.args[2], newRegisters);
        const target = getValue(instr.args[3], newRegisters);
        let condition = false;
        switch (operator) {
          case "<":
            condition = leftValue < rightValue;
            break;
          case ">":
            condition = leftValue > rightValue;
            break;
          case "=":
            condition = leftValue === rightValue;
            break;
          case "≠":
            condition = leftValue !== rightValue;
            break;
          default:
            break;
        }
        if (condition) {
          newPC = target;
        }
        break;
      }
      case "COPY": {
        if (instr.args.length === 2) {
          // New form: COPY A → B.
          const source = getValue(instr.args[0], newRegisters);
          const target = getValue(instr.args[1], newRegisters);
          const copyInstr = source in program ? program[source] : { op: "EMPTY", args: [] };
          newProgram = insertLine(program, target, copyInstr);
          // If the current PC is ≥ target, shift PC up by 1.
          if (pc >= target) {
            newPC = newPC + 1;
          }
        } else {
          // Old form: single argument. Insert a copy immediately after the current line.
          const source = getValue(instr.args[0], newRegisters);
          const target = pc + 1;
          const copyInstr = source in program ? program[source] : { op: "EMPTY", args: [] };
          newProgram = insertLine(program, target, copyInstr);
          // No adjustment to PC needed.
        }
        setProgram(newProgram);
        break;
      }
      case "EMPTY":
        // Do nothing.
        break;
      case "TTRAVEL": {
        const travelTime = newRegisters.T;
        if (history[travelTime]) {
          newRegisters = { ...history[travelTime] };
        }
        break;
      }
      case "DEFUSE":
        setGameStatus("won");
        setIsRunning(false);
        break;
      case "EXPLODE":
        setGameStatus("lost");
        setIsRunning(false);
        break;
      default:
        // Unknown opcodes are treated as EMPTY.
        break;
    }

    setHistory((prevHistory) => ({
      ...prevHistory,
      [newRegisters.T]: newRegisters
    }));
    setRegisters(newRegisters);
    setPC(newPC);
  };

  // Automatic stepping.
  useEffect(() => {
    if (!isRunning || gameStatus !== "running") return;
    const timer = setTimeout(() => {
      step();
    }, 500);
    return () => clearTimeout(timer);
  }, [isRunning, gameStatus, registers, pc, program]);

  // Manual stepping.
  const manualStep = () => {
    setIsRunning(false);
    if (gameStatus === "waiting") setGameStatus("running");
    step();
  };

  // Compute the displayable program.
  const displayLines = getDisplayedProgram(program, pc);

  return (
    <div>
      <h2>{level.name}</h2>
      <p>{level.description}</p>
      <div style={{ display: "flex", marginBottom: "20px" }}>
        {/* Registers */}
        <div style={{ marginRight: "40px" }}>
          <h3>Registers</h3>
          {Object.entries(registers).map(([reg, val]) => (
            <div key={reg}>
              <strong>{reg}:</strong> {val}
            </div>
          ))}
        </div>
        {/* Program Display (scrollable) */}
        <div
          style={{
            flexGrow: 1,
            maxHeight: "400px",
            overflowY: "auto",
            border: "1px solid #ccc",
            padding: "5px",
            fontFamily: "monospace"
          }}
        >
          <h3>Program</h3>
          {displayLines.map((entry, index) =>
            entry.line === "..." ? (
              <div key={`gap-${index}`} style={{ textAlign: "center" }}>
                ...
              </div>
            ) : (
              <div
                key={entry.line}
                style={{
                  padding: "2px 5px",
                  backgroundColor:
                    entry.line === pc ? "lightgreen" : "transparent",
                  cursor: "pointer"
                }}
                onMouseOver={() => setTooltipContent(getTooltipText(entry.instr))}
                onMouseMove={(e) =>
                  setTooltipPosition({ x: e.clientX, y: e.clientY })
                }
                onMouseOut={() => setTooltipContent(null)}
              >
                {entry.line}: {formatInstruction(entry.instr)}
              </div>
            )
          )}
        </div>
      </div>
      {/* Controls */}
      <div>
        <h3>Controls</h3>
        <label>
          Register A initial value:{" "}
          <input
            type="number"
            value={playerValue}
            onChange={(e) => {
              const newVal = e.target.value;
              setPlayerValue(newVal);
              resetGame(newVal);
            }}
            style={{ marginLeft: "10px" }}
          />
        </label>
        <button onClick={() => resetGame(playerValue)} style={{ marginLeft: "20px" }}>
          Reset Level
        </button>
        <button
          onClick={() => {
            if (gameStatus === "waiting") setGameStatus("running");
            setIsRunning(true);
          }}
          style={{ marginLeft: "20px" }}
          disabled={gameStatus !== "waiting"}
        >
          Run
        </button>
        <button
          onClick={manualStep}
          style={{ marginLeft: "20px" }}
          disabled={gameStatus === "won" || gameStatus === "lost"}
        >
          Step
        </button>
      </div>
      <div style={{ marginTop: "20px", fontSize: "20px" }}>
        {gameStatus === "won" && (
          <div style={{ color: "green" }}>Bomb defused! You win!</div>
        )}
        {gameStatus === "lost" && (
          <div style={{ color: "red" }}>Boom! The bomb exploded!</div>
        )}
      </div>
      {/* Tooltip */}
      {tooltipContent && (
        <div
          style={{
            position: "fixed",
            left: tooltipPosition.x + 10,
            top: tooltipPosition.y + 10,
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            color: "white",
            padding: "5px",
            borderRadius: "3px",
            pointerEvents: "none",
            zIndex: 1000
          }}
        >
          {tooltipContent}
        </div>
      )}
    </div>
  );
}

function App() {
  // Define levels.
  const levels = [
    {
      id: "tutorial",
      name: "Level 1",
      program: [
        { op: "CJUMP", args: ["A", "=", 5, 3] },
        { op: "EXPLODE", args: [] },
        { op: "DEFUSE", args: [] }
      ],
      initialRegisters: { A: 0, T: 0 },
      description: "Figure out the correct input for register A to defuse the bomb."
    },
    {
      id: "doubling",
      name: "Level 2",
      program: [
        { op: "CJUMP", args: ["A", "<", 10, 8] },
        { op: "CJUMP", args: ["A", ">", 50, 8] },
        { op: "CJUMP", args: ["T", ">", 40, 8] },
        { op: "CJUMP", args: ["B", "=", "A", 7] },
        { op: "ADD", args: ["B", "B", "B"] },
        { op: "JUMP", args: [3] },
        { op: "DEFUSE", args: [] },
        { op: "EXPLODE", args: [] }
      ],
      initialRegisters: { A: 0, B: 1, T: 0 },
      description: "Can you defuse a more complex bomb?"
    },
    {
      id: "copying",
      name: "Level 3",
      program: [
        { op: "JUMP", args: [5] },
        { op: "EXPLODE", args: [] },
        { op: "DEFUSE", args: [] },
        { op: "EXPLODE", args: [] },
        { op: "ADD", args: ["A", "B", "B"] },
        { op: "COPY", args: ["B"] },
        { op: "CJUMP", args: ["T", ">", "15", 4] },
        { op: "JUMP", args: [5] }
      ],
      initialRegisters: { A: 0, B: 1, T: 0 },
      description: "What if the program could modify itself?"
    },
    {
      id: "more_copying",
      name: "Level 4",
      program: [
        { op: "JUMP", args: [5] },
        { op: "EXPLODE", args: [] },
        { op: "DEFUSE", args: [] },
        { op: "EXPLODE", args: [] },
        { op: "ADD", args: ["A", "B", "B"] },
        { op: "COPY", args: ["A", "B"] },
        { op: "CJUMP", args: ["T", ">", "15", 4] },
        { op: "JUMP", args: [5] }
      ],
      initialRegisters: { A: 0, B: 2, T: 0 },
      description: "Add new lines anywhere in the program!"
    }
  ];

  const [selectedLevel, setSelectedLevel] = useState(levels[0]);

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Level Selector Sidebar */}
      <div
        style={{
          width: "200px",
          borderRight: "1px solid #ccc",
          padding: "10px",
          boxSizing: "border-box"
        }}
      >
        <h3>Levels</h3>
        {levels.map((lvl) => (
          <div
            key={lvl.id}
            style={{
              padding: "5px",
              cursor: "pointer",
              backgroundColor: selectedLevel.id === lvl.id ? "#ddd" : "transparent"
            }}
            onClick={() => setSelectedLevel(lvl)}
          >
            {lvl.name}
          </div>
        ))}
      </div>
      {/* Game Area */}
      <div style={{ flex: 1, padding: "10px" }}>
        <BombGame level={selectedLevel} />
      </div>
    </div>
  );
}

export default App;
