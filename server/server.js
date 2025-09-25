// server/server.js
(async () => {
  const express = require('express');
  const http = require('http');
  const { Server } = require('socket.io');
  const cors = require('cors');
  const { customAlphabet } = await import('nanoid');

  const nano = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8);
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });

  app.use(cors());
  app.use(express.json());

  const MAX_ROUNDS = 5;
  const BASE_WORD = "KOLLYWOOD".split('');

  // In-memory games store
  const games = {};

  // Create game
  app.post('/create-game', (req, res) => {
    const { numPlayers } = req.body;
    if (!numPlayers || numPlayers < 2 || numPlayers > 8) {
      return res.status(400).json({ error: 'numPlayers must be 2..8' });
    }
    const gameId = nano();
    games[gameId] = {
      id: gameId,
      numPlayers,
      players: {},
      order: [],
      hostSocket: null,
      round: 0,
      strikes: {},
      boardState: {},
      playing: false
    };
    res.json({ gameId });
  });

  // Helper: Initial board for each player
  const createBoard = () => [
    { title: 'Hero', firstLetter: '', word: '', status: 'empty' },
    { title: 'Heroine', firstLetter: '', word: '', status: 'empty' },
    { title: 'Song', firstLetter: '', word: '', status: 'empty' },
    { title: 'Movie', firstLetter: '', word: '', status: 'empty' }
  ];

  // Socket.io events
  io.on('connection', socket => {

    // Join game
    socket.on('join-game', ({ gameId, name }, cb) => {
      const g = games[gameId];
      if (!g) return cb({ error: 'Game not found' });
      if (g.order.length >= g.numPlayers) return cb({ error: 'Game full' });

      g.players[socket.id] = { name, score: 0, lost: false, socketId: socket.id };
      g.order.push(socket.id);
      if (!g.hostSocket) g.hostSocket = socket.id;

      g.strikes[socket.id] = [...BASE_WORD];
      g.boardState[socket.id] = createBoard();
      socket.join(gameId);

      io.to(gameId).emit('lobby-update', {
        players: Object.values(g.players).map(p => ({ name: p.name, socketId: p.socketId })),
        hostSocket: g.hostSocket,
        numPlayers: g.numPlayers
      });

      cb({ ok: true, hostSocket: g.hostSocket, youSocket: socket.id });
    });

    // Start game
    socket.on('start-game', ({ gameId }, cb) => {
      const g = games[gameId];
      if (!g || socket.id !== g.hostSocket) return cb && cb({ error: 'Only host' });

      g.playing = true;
      g.round = 1;
      Object.keys(g.players).forEach(sid => {
        g.strikes[sid] = [...BASE_WORD];
        g.boardState[sid] = createBoard();
        g.players[sid].lost = false;
      });

      io.to(gameId).emit('game-started', { round: g.round });
      cb && cb({ ok: true });
    });

    // Set letters (host only)
    socket.on('set-letters', ({ gameId, letters }, cb) => {
      const g = games[gameId];
      if (!g || socket.id !== g.hostSocket) return;

      g.order.forEach(sid => {
        g.boardState[sid].forEach((cell, idx) => {
          cell.firstLetter = letters[idx] || '';
          cell.status = 'open';
          cell.word = '';
        });
      });

      io.to(gameId).emit('letters-set', { letters });
      cb && cb({ ok: true });
    });

    // Lock cell
    socket.on('lock-cell', ({ gameId, targetSocketId, cellIdx }, cb) => {
      const g = games[gameId];
      if (!g) return;
      const cell = g.boardState[targetSocketId]?.[cellIdx];
      if (!cell) return cb && cb({ error: 'cell not found' });
      if (cell.lockedBy && cell.lockedBy !== socket.id) return cb && cb({ error: 'locked' });

      cell.lockedBy = socket.id;
      io.to(gameId).emit('cell-locked', { targetSocketId, cellIdx, by: socket.id });
      cb && cb({ ok: true });
    });

    // Unlock cell
    socket.on('unlock-cell', ({ gameId, targetSocketId, cellIdx }) => {
      const g = games[gameId];
      const cell = g.boardState[targetSocketId]?.[cellIdx];
      if (cell?.lockedBy === socket.id) {
        delete cell.lockedBy;
        io.to(gameId).emit('cell-unlocked', { targetSocketId, cellIdx });
      }
    });

    // Submit guess
    socket.on('submit-guess', ({ gameId, targetSocketId, cellIdx, guess }, cb) => {
      const g = games[gameId];
      const cell = g.boardState[targetSocketId]?.[cellIdx];
      if (!g || !cell || cell.status !== 'open') return cb && cb({ error: 'not open' });

      const val = (guess || '').trim();
      if (!val) return cb && cb({ error: 'empty' });

      const firstLetter = (cell.firstLetter || '').toLowerCase();
      const correct = val[0].toLowerCase() === firstLetter && val.length >= 2;

      if (correct) {
        cell.word = val;
        cell.status = 'correct';
        delete cell.lockedBy;
        io.to(gameId).emit('guess-result', { targetSocketId, cellIdx, status: 'correct', word: val });
      } else {
        const strikes = g.strikes[targetSocketId];
        const removed = strikes.shift();
        io.to(gameId).emit('strike', { targetSocketId, removed, remaining: strikes.length });
        io.to(gameId).emit('guess-result', { targetSocketId, cellIdx, status: 'wrong', word: val });

        if (strikes.length === 0) {
          g.players[targetSocketId].lost = true;
          if (g.players[g.hostSocket]) g.players[g.hostSocket].score += 1;
          io.to(gameId).emit('player-lost', { targetSocketId, hostScore: g.players[g.hostSocket].score });
        }
      }
      cb && cb({ ok: true });
    });

    // Next round
    socket.on('next-round', ({ gameId }, cb) => {
      const g = games[gameId];
      if (!g || socket.id !== g.hostSocket) return cb && cb({ error: 'Only host' });

      if (g.round >= MAX_ROUNDS) {
        const results = Object.values(g.players).map(p => ({ name: p.name, score: p.score }))
                          .sort((a,b) => b.score - a.score);
        io.to(gameId).emit('game-over', { results });
        g.playing = false;
        return cb && cb({ ok: true, final: results });
      }

      g.round++;
      Object.keys(g.players).forEach(sid => {
        g.strikes[sid] = [...BASE_WORD];
        g.boardState[sid] = createBoard();
        g.players[sid].lost = false;
      });

      io.to(gameId).emit('round-changed', { round: g.round });
      cb && cb({ ok: true });
    });

    // Get current state
    socket.on('get-state', ({ gameId }, cb) => {
      const g = games[gameId];
      if (!g) return cb && cb({ error: 'Game not found' });

      cb && cb({
        players: Object.values(g.players).map(p => ({ name: p.name, socketId: p.socketId, score: p.score })),
        hostSocket: g.hostSocket,
        round: g.round,
        boardState: g.boardState,
        strikes: g.strikes,
        playing: g.playing
      });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      Object.values(games).forEach(g => {
        if (!g.players[socket.id]) return;
        delete g.players[socket.id];
        g.order = g.order.filter(id => id !== socket.id);
        delete g.strikes[socket.id];
        delete g.boardState[socket.id];

        if (g.hostSocket === socket.id) g.hostSocket = g.order[0] || null;

        io.to(g.id).emit('lobby-update', {
          players: Object.values(g.players).map(p => ({ name: p.name, socketId: p.socketId })),
          hostSocket: g.hostSocket,
          numPlayers: g.numPlayers
        });
      });
    });
  });

  const PORT = process.env.PORT || 4000;
  server.listen(PORT, () => console.log(`Server running on ${PORT}`));
})();
