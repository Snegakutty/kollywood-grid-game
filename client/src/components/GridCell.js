import React, { useState } from "react";

const GridCell = ({ cell, onGuess }) => {
  const [guess, setGuess] = useState("");

  const handleSubmit = () => {
    if (guess.trim()) {
      onGuess(cell.id, guess.trim());
      setGuess("");
    }
  };

  return (
    <div
      className={`border w-20 h-20 flex flex-col items-center justify-center rounded-lg m-1 ${
        cell.correct ? "bg-green-400 text-white" : "bg-gray-100"
      }`}
    >
      <div className="text-xl font-bold">{cell.letter}</div>
      {!cell.correct && (
        <div className="flex mt-1">
          <input
            type="text"
            className="w-14 text-center border rounded"
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            placeholder="Guess"
          />
          <button
            onClick={handleSubmit}
            className="ml-1 bg-blue-500 text-white px-2 rounded"
          >
            ✔
          </button>
        </div>
      )}
      {cell.correct && <div className="text-sm">✅ Correct</div>}
    </div>
  );
};

export default GridCell;
