import React, { useState, useEffect } from "react";

// BombGame runs a level passed in via props.
function BombGame({ level }) {
  // The registers: A (player‐controlled), B, and T (time).
  const [registers, setRegisters] = useState(level.initialRegisters);
  const [pc, setPC] = useState(0);
  // History stores snapshots of registers at each time step.
  const [history, setHistory] = useState({ 0: level.initialRegisters });
  // gameStatus is one of: "waiting" (before Run is pressed), "running", "won", or "lost".
  const [gameStatus, setGameStatus] = useState("waiting");
  // The value for register A as entered by the player (defaults to 0).
  const [playerValue, setPlayerValue] = useState(level.initialRegisters.A);
  // Controls whether the simulation is running.
  const [isRunning, setIsRunning] = useState(false);
  // Tooltip content and its screen position.
  const [tooltipContent, setTooltipContent] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  // When the level prop changes, reset the game.
  useEffect(() => {
    setPlayerValue(level.initialRegisters.A);
    setRegisters(level.initialRegisters);
    setPC(0);
    setHistory({ 0: level.initialRegisters });
    setGameStatus("waiting");
    setIsRunning(false);
  }, [level]);

  // Helper: Given an argument (register name or a number constant), return its numeric value.
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

  // A dictionary mapping opcodes to functions that generate tooltip strings.
  const tooltipFuncs = {
    ADD: (args) =>
      `Set the value of ${formatArg(args[2])} to ${formatArg(
        args[0]
      )} + ${formatArg(args[1])}`,
    JMP: (args) => `Jump to instruction ${args[0]}`,
    BEQ: (args) =>
      `If ${formatArg(args[0])} equals ${formatArg(
        args[1]
      )}, jump to instruction ${args[2]}`,
    BNE: (args) =>
      `If ${formatArg(args[0])} does not equal ${formatArg(
        args[1]
      )}, jump to instruction ${args[2]}`,
    BGT: (args) =>
      `If ${formatArg(args[0])} is greater than ${formatArg(
        args[1]
      )}, jump to instruction ${args[2]}`,
    BLT: (args) =>
      `If ${formatArg(args[0])} is less than ${formatArg(
        args[1]
      )}, jump to instruction ${args[2]}`,
    TTRAVEL: () => `Set every register to its state at time T`,
    DEFUSE: () => `Defuse the bomb and win the game!`,
    EXPLODE: () => `Explode the bomb and lose the game!`,
  };

  // Returns a tooltip string for a given instruction.
  const getTooltip = (instr) => {
    if (tooltipFuncs[instr.op]) {
      return tooltipFuncs[instr.op](instr.args);
    }
    return "";
  };

  // Execute one step of the program.
  const step = () => {
    // If the program counter is out of bounds, treat it as a failure.
    if (pc < 0 || pc >= level.program.length) {
      setGameStatus("lost");
      setIsRunning(false);
      return;
    }
    const instr = level.program[pc];
    // Always increment T.
    const newT = registers.T + 1;
    let newRegisters = { ...registers, T: newT };
    let newPC = pc + 1; // default: next instruction

    switch (instr.op) {
      case "ADD": {
        // ADD takes three arguments: source1, source2, destination.
        const val1 = getValue(instr.args[0], newRegisters);
        const val2 = getValue(instr.args[1], newRegisters);
        const dest = instr.args[2];
        newRegisters[dest] = val1 + val2;
        break;
      }
      case "JMP":
        newPC = instr.args[0];
        break;
      case "BEQ": {
        const reg = instr.args[0];
        const cmpVal = getValue(instr.args[1], newRegisters);
        const target = instr.args[2];
        if (newRegisters[reg] === cmpVal) {
          newPC = target;
        }
        break;
      }
      case "BNE": {
        const reg = instr.args[0];
        const cmpVal = getValue(instr.args[1], newRegisters);
        const target = instr.args[2];
        if (newRegisters[reg] !== cmpVal) {
          newPC = target;
        }
        break;
      }
      case "BGT": {
        // Branch if Greater Than.
        const reg = instr.args[0];
        const cmpVal = getValue(instr.args[1], newRegisters);
        const target = instr.args[2];
        if (newRegisters[reg] > cmpVal) {
          newPC = target;
        }
        break;
      }
      case "BLT": {
        // Branch if Less Than.
        const reg = instr.args[0];
        const cmpVal = getValue(instr.args[1], newRegisters);
        const target = instr.args[2];
        if (newRegisters[reg] < cmpVal) {
          newPC = target;
        }
        break;
      }
      case "TTRAVEL": {
        // Reset registers to their state at time T.
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
        break;
    }

    // Record the new register state in the history.
    setHistory((prevHistory) => ({
      ...prevHistory,
      [newRegisters.T]: newRegisters,
    }));

    setRegisters(newRegisters);
    setPC(newPC);
  };

  // Timer to step through the program if running.
  useEffect(() => {
    if (!isRunning || gameStatus !== "running") return;
    const timer = setTimeout(() => {
      step();
    }, 500); // execute one instruction every 500ms
    return () => clearTimeout(timer);
  }, [isRunning, gameStatus, registers, pc]);

  // Reset the level state using the player's specified value for register A.
  // (No external check is made—any errors will be caught by the assembly instructions.)
  const resetGame = () => {
    const initialA = parseInt(playerValue, 10);
    const initRegs = { ...level.initialRegisters, A: initialA };
    setRegisters(initRegs);
    setPC(0);
    setHistory({ 0: initRegs });
    setGameStatus("waiting");
    setIsRunning(false);
  };

  // Start running the program.
  const runGame = () => {
    if (gameStatus === "waiting") {
      setGameStatus("running");
      setIsRunning(true);
    }
  };

  return (
    <div>
      <h2>{level.name}</h2>
      {/* The level description is now vague—its win/lose conditions are hidden in the code. */}
      <p>{level.description}</p>
      <div style={{ display: "flex", marginBottom: "20px" }}>
        {/* Registers Display */}
        <div style={{ marginRight: "40px" }}>
          <h3>Registers</h3>
          {Object.entries(registers).map(([reg, val]) => (
            <div key={reg}>
              <strong>{reg}:</strong> {val}
            </div>
          ))}
        </div>
        {/* Program Display */}
        <div>
          <h3>Program</h3>
          {level.program.map((instr, index) => (
            <div
              key={index}
              style={{
                padding: "5px",
                backgroundColor: index === pc ? "lightgreen" : "transparent",
                cursor: "pointer",
              }}
              onMouseOver={() => setTooltipContent(getTooltip(instr))}
              onMouseMove={(e) =>
                setTooltipPosition({ x: e.clientX, y: e.clientY })
              }
              onMouseOut={() => setTooltipContent(null)}
            >
              {index}: {instr.op} {instr.args.join(", ")}
            </div>
          ))}
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
            onChange={(e) => setPlayerValue(e.target.value)}
            style={{ marginLeft: "10px" }}
          />
        </label>
        <button onClick={resetGame} style={{ marginLeft: "20px" }}>
          Reset Level
        </button>
        <button
          onClick={runGame}
          style={{ marginLeft: "20px" }}
          disabled={gameStatus !== "waiting"}
        >
          Run
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
      {/* Tooltip (appears near the mouse pointer when hovering over an instruction) */}
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
            zIndex: 1000,
          }}
        >
          {tooltipContent}
        </div>
      )}
    </div>
  );
}

// The App component contains a level selector on the left and the BombGame on the right.
function App() {
  // Define our levels. (For now, we only have one level.)
  const levels = [
    {
      id: "doubling",
      name: "Bomb",
      program: [
        // 0: If A is less than 10, jump to instruction 7 (EXPLODE)
        { op: "BLT", args: ["A", 10, 7] },
        // 1: If A is greater than 50, jump to instruction 7 (EXPLODE)
        { op: "BGT", args: ["A", 50, 7] },
        // 2: If T is greater than 100, jump to instruction 7 (EXPLODE)
        { op: "BGT", args: ["T", 40, 7] },
        // 3: If B equals A, jump to instruction 6 (DEFUSE)
        { op: "BEQ", args: ["B", "A", 6] },
        // 4: Double B (B = B + B)
        { op: "ADD", args: ["B", "B", "B"] },
        // 5: Jump back to instruction 2 (to re‑check T and then test B vs. A)
        { op: "JMP", args: [2] },
        // 6: Defuse the bomb.
        { op: "DEFUSE", args: [] },
        // 7: Explode the bomb.
        { op: "EXPLODE", args: [] },
      ],
      // Initial registers (A is set by the player; B starts at 1; T starts at 0).
      initialRegisters: { A: 0, B: 1, T: 0 },
      // The level description does not reveal the win/lose conditions.
      description:
        "The bomb's conditions are hidden within the assembly code. Figure out the correct input for register A to defuse the bomb.",
    },
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
          boxSizing: "border-box",
        }}
      >
        <h3>Levels</h3>
        {levels.map((lvl) => (
          <div
            key={lvl.id}
            style={{
              padding: "5px",
              cursor: "pointer",
              backgroundColor:
                selectedLevel.id === lvl.id ? "#ddd" : "transparent",
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
