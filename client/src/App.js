import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import Lobby from './components/Lobby';
import Game from './components/Game';

export default function App() {
  return (
    <div className="app">
      <h1 className="title">Kollywood Grid</h1>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/lobby/:gameId" element={<Lobby />} />
        <Route path="/game/:gameId" element={<Game />} />
      </Routes>
    </div>
  );
}
