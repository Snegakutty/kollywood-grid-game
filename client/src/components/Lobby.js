import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import { SERVER } from '../api';

const socket = io("https://kollywood-backend.onrender.com");
export default function Lobby() {
  const { gameId } = useParams();
  const [name, setName] = useState('');
  const [players, setPlayers] = useState([]);
  const [hostSocket, setHostSocket] = useState(null);
  const [joined, setJoined] = useState(false);
  const [youSocket, setYouSocket] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    socket = io(SERVER);
    socket.on('lobby-update', data => {
      setPlayers(data.players);
      setHostSocket(data.hostSocket);
    });

    return () => socket.disconnect();
  }, [gameId]);

  function join() {
    if (!name.trim()) return alert('Enter name');
    socket.emit('join-game', { gameId, name }, (res) => {
      if (res.error) return alert(res.error);
      setJoined(true);
      setYouSocket(res.youSocket);
    });
  }

  function startGame() {
    socket.emit('start-game', { gameId }, (r) => {
      if (r && r.error) alert(r.error);
      else navigate(`/game/${gameId}`);
    });
  }

  return (
    <div className="container">
      <h2>Lobby - {gameId}</h2>

      {!joined ? (
        <>
          <input placeholder="Your name" value={name} onChange={e=>setName(e.target.value)} />
          <button onClick={join}>Join Lobby</button>
        </>
      ) : (
        <div>
          <p>Share this link: {window.location.origin}/game/{gameId}</p>
          <div className="grid">
            {players.map(p => <div key={p.socketId} className="player-card">{p.name}{p.socketId === hostSocket ? ' (Host)' : ''}</div>)}
          </div>
          {youSocket === hostSocket && (
            <div style={{marginTop:12}}>
              <button onClick={startGame}>Start Game</button>
            </div>
          )}
        </div>
      )}
      <div style={{marginTop:16}}>
        <Link to="/">Back</Link>
      </div>
    </div>
  );
}
