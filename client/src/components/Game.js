import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { SERVER } from '../api';
import GridCell from './GridCell';

let socket;

export default function Game() {
  const { gameId } = useParams();
  const [state, setState] = useState({ players: [], hostSocket: null, round: 0, boardState: {}, strikes: {} });
  const [letters, setLetters] = useState(['', '', '', '']);
  const [youId, setYouId] = useState(null);
  const [locks, setLocks] = useState({}); // key `${target}-${cellIdx}` -> socketId
  const [joined, setJoined] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    socket = io(SERVER);
    socket.on('connect', () => setYouId(socket.id));
    socket.on('game-started', d => {
      setState(s => ({ ...s, round: d.round }));
    });
    socket.on('letters-set', ({ letters }) => {
      // update boardState firstLetter fields
      setState(s => {
        const bs = {...s.boardState};
        Object.keys(bs).forEach(target => {
          bs[target] = bs[target].map((c, idx) => ({ ...c, firstLetter: letters[idx], status: 'open' }));
        });
        return {...s, boardState: bs};
      });
    });
    socket.on('lobby-update', d => {
      setState(s => ({ ...s, players: d.players, hostSocket: d.hostSocket }));
    });
    socket.on('cell-locked', ({ targetSocketId, cellIdx, by }) => {
      setLocks(prev => ({ ...prev, [`${targetSocketId}-${cellIdx}`]: by }));
    });
    socket.on('cell-unlocked', ({ targetSocketId, cellIdx }) => {
      setLocks(prev => { const p = {...prev}; delete p[`${targetSocketId}-${cellIdx}`]; return p; });
    });
    socket.on('guess-result', ({ targetSocketId, cellIdx, status, word }) => {
      setState(s => {
        const bs = {...s.boardState};
        if (!bs[targetSocketId]) return s;
        bs[targetSocketId][cellIdx] = { ...bs[targetSocketId][cellIdx], status, word };
        return { ...s, boardState: bs };
      });
    });
    socket.on('strike', ({ targetSocketId, removed, remaining }) => {
      setState(s => {
        const st = {...s.strikes};
        st[targetSocketId] = st[targetSocketId] ? st[targetSocketId].slice(0, remaining) : [];
        return {...s, strikes: st};
      });
    });
    socket.on('player-lost', ({ targetSocketId }) => {
      // highlight lost player
      setState(s => {
        const bs = {...s.boardState};
        if (bs[targetSocketId]) {
          bs[targetSocketId].forEach(c => c.status = c.status === 'correct' ? 'correct' : 'locked');
        }
        return {...s, boardState: bs};
      });
    });
    socket.on('round-changed', ({ round }) => setState(s => ({ ...s, round })));
    socket.on('game-over', ({ results }) => {
      alert('Game over! See console for results.');
      console.log('Final results', results);
    });

    // initial state fetch
    socket.emit('get-state', { gameId }, (res) => {
      if (res && !res.error) {
        setState({ players: res.players, hostSocket: res.hostSocket, round: res.round, boardState: res.boardState || {}, strikes: res.strikes || {} });
      } else {
        alert('Error fetching game state');
        navigate('/');
      }
    });

    return () => socket.disconnect();
  }, [gameId, navigate]);

  // join handled from lobby; here players arrive already in room, but ensure you are listening
  function setAsHostLetters() {
    // host clicks to set letters
    socket.emit('set-letters', { gameId, letters }, (r) => {
      if (r && r.error) alert(r.error);
    });
  }

  function lockCell(targetSocketId, cellIdx) {
    socket.emit('lock-cell', { gameId, targetSocketId, cellIdx }, (r) => {
      if (r && r.error) alert('Lock failed: ' + r.error);
    });
  }
  function unlockCell(targetSocketId, cellIdx) {
    socket.emit('unlock-cell', { gameId, targetSocketId, cellIdx });
  }
  function submitGuess(targetSocketId, cellIdx, guess) {
    socket.emit('submit-guess', { gameId, targetSocketId, cellIdx, guess }, (r) => {
      if (r && r.error) console.log('err', r.error);
    });
  }

  function nextRound() {
    socket.emit('next-round', { gameId }, (r) => {
      if (r && r.error) alert(r.error);
    });
  }

  const playersList = state.players || [];

  return (
    <div className="container">
      <h2>Game: {gameId}</h2>
      <div>Round: {state.round || 0}</div>
      <div style={{display:'flex', gap:20, marginTop:12}}>
        <div style={{flex:1}}>
          <h3>Players</h3>
          <div>
            {playersList.map(p => <div key={p.socketId} className="player-card">{p.name}{p.socketId === state.hostSocket ? ' (Host)' : ''}</div>)}
          </div>
          <div className="strikes">
            <h4>Strikes</h4>
            {playersList.map(p => (
              <div key={p.socketId}>
                {p.name}: {(state.strikes[p.socketId] || []).join(' ')}
              </div>
            ))}
          </div>

          {youId === state.hostSocket && (
            <div style={{marginTop:12}}>
              <h4>Host: set first letters</h4>
              <div style={{display:'flex', gap:8}}>
                {letters.map((l, i) => (
                  <input key={i} value={l} onChange={e => {
                    const copy = [...letters]; copy[i] = e.target.value.slice(0,1); setLetters(copy);
                  }} placeholder="a" maxLength={1} style={{width:36, textAlign:'center'}} />
                ))}
              </div>
              <div className="controls">
                <button onClick={setAsHostLetters}>Set Letters</button>
                <button onClick={nextRound} className="small">Next Round</button>
              </div>
            </div>
          )}
        </div>

        <div style={{flex:2}}>
          <h3>Boards</h3>
          <div style={{display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12}}>
            {playersList.map(p => (
              <div key={p.socketId} className="player-card">
                <div style={{fontWeight:600}}>{p.name}</div>
                <div className="board">
                  { (state.boardState[p.socketId] || Array(4).fill({})).map((cell, idx) => (
                    <GridCell
                      key={idx}
                      cell={{...cell, title: ['Hero','Heroine','Song','Movie'][idx]}}
                      lockedBy={locks[`${p.socketId}-${idx}`]}
                      isYou={youId === p.socketId}
                      onLock={() => lockCell(p.socketId, idx)}
                      onUnlock={() => unlockCell(p.socketId, idx)}
                      onSubmit={(text) => submitGuess(p.socketId, idx, text)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
