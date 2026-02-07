import { Routes, Route, Navigate } from 'react-router-dom';
import { Home } from './pages/Home.js';
import { Lobby } from './pages/Lobby.js';
import { Game } from './pages/Game.js';
import { Qualifying } from './pages/Qualifying.js';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/qualifying" element={<Qualifying />} />
      <Route path="/lobby/:roomCode" element={<Lobby />} />
      <Route path="/game/:roomCode" element={<Game />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
