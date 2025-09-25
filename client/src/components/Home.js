import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createGame } from '../api';

export default function Home() {
  const [num, setNum] = useState(4);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleCreate() {
    setLoading(true);
    const res = await createGame(Number(num));
    setLoading(false);
    if (res.gameId) {
      navigate(`/lobby/${res.gameId}`);
    } else {
      alert(res.error || 'Error creating game');
    }
  }

  return (
    <div className="container">
      <h2>Create Game</h2>
      <div>
        <label>Number of players (2-8): </label>
        <input type="number" min="2" max="8" value={num} onChange={e => setNum(e.target.value)} />
      </div>
      <div style={{marginTop:12}}>
        <button onClick={handleCreate} disabled={loading}>Create & Go to Lobby</button>
      </div>
      <p style={{marginTop:12}}>You will be host. Share lobby link with friends to join.</p>
    </div>
  );
}
