// server/server.js
(async () =>{// to allow top-level await for nanoid import
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { customAlphabet } = await import('nanoid');

const nano = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8);
const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const MAX_ROUNDS = 5;
const BASE_WORD = "KOLLYWOOD".split(''); // letters to strike out

// In-memory store: games[gameId] = {...}
const games = {};

app.post('/create-game', (req, res) => {
  const { numPlayers } = req.body;
  if (!numPlayers || numPlayers < 2 || numPlayers > 8) {
    return res.status(400).json({ error: 'numPlayers must be 2..8' });
  }
  const id = nano();
  games[id] = {
    id,
    numPlayers,
    players: {}, // socketId -> {name, score, lostRounds}
    order: [], // socketIds in join order
    hostSocket: null,
    round: 0,
    strikes: {}, // socketId -> array of remaining letters
    boardState: {}, // socketId -> 4 cell states [{letter, status, fullWord}]
    playing: false
  };
  res.json({ gameId: id });
});

// helper to create initial player board
function createInitialBoard() {
  // 4 categories
  return [
    { title: 'Hero', firstLetter: '', word: '', status: 'empty' },
    { title: 'Heroine', firstLetter: '', word: '', status: 'empty' },
    { title: 'Song', firstLetter: '', word: '', status: 'empty' },
    { title: 'Movie', firstLetter: '', word: '', status: 'empty' },
  ];
}

io.on('connection', (socket) => {
  // join by gameId and name
  socket.on('join-game', ({ gameId, name }, callback) => {
    const g = games[gameId];
    if (!g) return callback({ error: 'Game not found' });

    if (g.order.length >= g.numPlayers) {
      return callback({ error: 'Game full' });
    }
    // register player
    g.players[socket.id] = { name, score: 0, lost: false, socketId: socket.id };
    g.order.push(socket.id);
    if (!g.hostSocket) g.hostSocket = socket.id; // first joined becomes host
    g.strikes[socket.id] = [...BASE_WORD];
    g.boardState[socket.id] = createInitialBoard();

    socket.join(gameId);
    io.to(gameId).emit('lobby-update', {
      players: Object.values(g.players).map(p => ({ name: p.name, socketId: p.socketId })),
      hostSocket: g.hostSocket,
      numPlayers: g.numPlayers
    });
    callback({ ok: true, hostSocket: g.hostSocket, youSocket: socket.id });
  });

  socket.on('start-game', ({ gameId }, cb) => {
    const g = games[gameId];
    if (!g) return;
    if (socket.id !== g.hostSocket) return cb && cb({ error: 'Only host' });
    g.playing = true;
    g.round = 1;
    // reset per-round data
    Object.keys(g.players).forEach(sid => {
      g.strikes[sid] = [...BASE_WORD];
      g.boardState[sid] = createInitialBoard();
      g.players[sid].lost = false;
    });
    io.to(gameId).emit('game-started', { round: g.round });
    cb && cb({ ok: true });
  });

  socket.on('set-letters', ({ gameId, letters }, cb) => {
    // host sets first letters for the 4 categories
    const g = games[gameId];
    if (!g) return;
    if (socket.id !== g.hostSocket) return;
    // expect letters: ['s','a','n','a'] etc.
    g.order.forEach(sid => {
      // assign same first letters for everyone (the host sets letters per player? In your spec host gives letters per round; each player gets same board)
      g.boardState[sid].forEach((cell, idx) => {
        cell.firstLetter = letters[idx] || '';
        cell.status = 'open';
        cell.word = '';
      });
    });
    io.to(gameId).emit('letters-set', { letters });
    cb && cb({ ok: true });
  });

  // lock cell for typing (to ensure only one typing)
  socket.on('lock-cell', ({ gameId, targetSocketId, cellIdx }, cb) => {
    const g = games[gameId]; if (!g) return;
    // we store lock as property on boardState[targetSocketId][cellIdx].lockedBy
    const cell = g.boardState[targetSocketId][cellIdx];
    if (!cell) return cb && cb({ error: 'cell not found' });
    if (cell.lockedBy && cell.lockedBy !== socket.id) return cb && cb({ error: 'locked' });
    cell.lockedBy = socket.id;
    io.to(gameId).emit('cell-locked', { targetSocketId, cellIdx, by: socket.id });
    cb && cb({ ok: true });
  });

  socket.on('unlock-cell', ({ gameId, targetSocketId, cellIdx }) => {
    const g = games[gameId]; if (!g) return;
    const cell = g.boardState[targetSocketId][cellIdx];
    if (!cell) return;
    if (cell.lockedBy === socket.id) {
      delete cell.lockedBy;
      io.to(gameId).emit('cell-unlocked', { targetSocketId, cellIdx });
    }
  });

  // submit guess for a target player's one cell
  socket.on('submit-guess', ({ gameId, targetSocketId, cellIdx, guess }, cb) => {
    const g = games[gameId]; if (!g) return;
    const cell = g.boardState[targetSocketId][cellIdx];
    if (!cell || cell.status !== 'open') return cb && cb({ error: 'not open' });

    // simple case-insensitive match; if starts with given letter and contains guess string? We'll require full match contains the word (host expects)
    const normalizedGuess = (guess || '').trim();
    if (!normalizedGuess) return cb && cb({ error: 'empty' });

    // For flexibility: treat correct if guess starts with the first letter (case-insensitive)
    const first = (cell.firstLetter || '').toLowerCase();
    const ok = normalizedGuess[0].toLowerCase() === first && normalizedGuess.length >= 2;
    if (ok) {
      // mark green (correct)
      cell.word = normalizedGuess;
      cell.status = 'correct';
      // unlock
      delete cell.lockedBy;
      io.to(gameId).emit('guess-result', {
        targetSocketId, cellIdx, status: 'correct', word: normalizedGuess
      });
      // check if player filled all 4 -> award small bonus maybe; for now just continue
    } else {
      // incorrect -> strike a letter from their strikes array (pop one)
      const sarr = g.strikes[targetSocketId];
      if (sarr && sarr.length > 0) {
        const removed = sarr.shift(); // remove first letter
        io.to(gameId).emit('strike', { targetSocketId, removed, remaining: sarr.length });
      }
      // mark cell briefly as wrong (client shows strike)
      io.to(gameId).emit('guess-result', {
        targetSocketId, cellIdx, status: 'wrong', word: normalizedGuess
      });

      // if player fully struck out -> lost this round
      if (sarr.length === 0) {
        g.players[targetSocketId].lost = true;
        // host gets a point
        if (g.players[g.hostSocket]) g.players[g.hostSocket].score += 1;
        io.to(gameId).emit('player-lost', { targetSocketId, hostScore: g.players[g.hostSocket].score });
        // maybe end round when only host gets points? We'll allow round to proceed until host triggers nextRound
      }
    }
    cb && cb({ ok: true });
  });

  socket.on('next-round', ({ gameId }, cb) => {
    const g = games[gameId]; if (!g) return;
    if (socket.id !== g.hostSocket) return cb && cb({ error: 'Only host' });
    if (g.round >= MAX_ROUNDS) {
      // finalize results
      const results = Object.values(g.players)
        .map(p => ({ name: p.name, score: p.score }))
        .sort((a,b) => b.score - a.score);
      io.to(gameId).emit('game-over', { results });
      g.playing = false;
      return cb && cb({ ok: true, final: results });
    }
    // prepare next round
    g.round += 1;
    // reset strikes and board for new round
    Object.keys(g.players).forEach(sid => {
      g.strikes[sid] = [...BASE_WORD];
      g.boardState[sid] = createInitialBoard();
      g.players[sid].lost = false;
    });
    io.to(gameId).emit('round-changed', { round: g.round });
    cb && cb({ ok: true });
  });

  socket.on('get-state', ({ gameId }, cb) => {
    const g = games[gameId]; if (!g) return cb && cb({ error: 'Game not found' });
    cb && cb({
      players: Object.values(g.players).map(p => ({ name: p.name, socketId: p.socketId, score: p.score })),
      hostSocket: g.hostSocket,
      round: g.round,
      boardState: g.boardState,
      strikes: g.strikes,
      playing: g.playing
    });
  });

  socket.on('disconnect', () => {
    // remove player from any games
    Object.values(games).forEach(g => {
      if (g.players[socket.id]) {
        delete g.players[socket.id];
        g.order = g.order.filter(sid => sid !== socket.id);
        delete g.strikes[socket.id];
        delete g.boardState[socket.id];
        if (g.hostSocket === socket.id) {
          // choose next host
          g.hostSocket = g.order[0] || null;
        }
        io.to(g.id).emit('lobby-update', {
          players: Object.values(g.players).map(p => ({ name: p.name, socketId: p.socketId })),
          hostSocket: g.hostSocket,
          numPlayers: g.numPlayers
        });
      }
    });
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));
})();