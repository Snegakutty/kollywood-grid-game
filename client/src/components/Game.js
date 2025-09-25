import React, { useEffect, useState } from "react";
import io from "socket.io-client";
import GridCell from "./GridCell";

const socket = io(process.env.REACT_APP_BACKEND_URL);

const Game = ({ gameId, username }) => {
  const [game, setGame] = useState(null);
  const [cells, setCells] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [fullNames, setFullNames] = useState({});

  useEffect(() => {
    socket.emit("join_game", { gameId, username });

    socket.on("game_state", (updatedGame) => {
      setGame(updatedGame);
      setCells(updatedGame.cells || []);
      setIsHost(updatedGame.host === username);
    });

    socket.on("cell_update", (updatedCells) => {
      setCells(updatedCells);
    });

    return () => socket.disconnect();
  }, [gameId, username]);

  const handleSetLetters = () => {
    socket.emit("set_letters", {
      gameId,
      cells: Object.entries(fullNames).map(([id, fullName]) => ({
        id,
        letter: fullName.charAt(0).toUpperCase(),
        fullName
      })),
    });
    setFullNames({});
  };

  const handleGuess = (cellId, guess) => {
    socket.emit("make_guess", { gameId, cellId, guess });
  };

  return (
    <div className="p-4">
      <h1 className="text-3xl font-bold mb-4 text-center">Kollywood Grid</h1>
      <h2 className="text-xl mb-2">Game: {gameId}</h2>
      <h3>Round: {game?.round || 0}</h3>

      {isHost && (
        <div className="mb-4">
          <h4 className="font-semibold">Host: Set Full Names (Only First Letter Visible)</h4>
          {cells.map((cell) => (
            <div key={cell.id} className="mb-2">
              <input
                type="text"
                placeholder="Full Name"
                className="border p-2 w-48"
                onChange={(e) =>
                  setFullNames({ ...fullNames, [cell.id]: e.target.value })
                }
              />
            </div>
          ))}
          <button
            onClick={handleSetLetters}
            className="bg-green-600 text-white px-4 py-2 rounded"
          >
            ✅ Set Letters
          </button>
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 mt-6">
        {cells.map((cell) => (
          <GridCell key={cell.id} cell={cell} onGuess={handleGuess} />
        ))}
      </div>
    </div>
  );
};

export default Game;
