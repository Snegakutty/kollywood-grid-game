import React, { useState } from "react";

const GridCell = ({ placeholder, onSubmit, disabled }) => {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState(""); // '', 'correct', 'wrong'

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!value.trim()) return;

    const isCorrect = onSubmit(value.trim());
    setStatus(isCorrect ? "correct" : "wrong");
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`border w-40 h-40 flex flex-col items-center justify-center m-2 text-center ${
        status === "correct"
          ? "bg-green-300"
          : status === "wrong"
          ? "bg-red-300"
          : "bg-white"
      }`}
    >
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled || status === "correct"}
        className="text-center text-lg p-2 border rounded w-full"
      />
      <button
        type="submit"
        disabled={disabled || status === "correct"}
        className="mt-2 px-3 py-1 bg-blue-500 text-white rounded"
      >
        Submit
      </button>
    </form>
  );
};

export default GridCell;
