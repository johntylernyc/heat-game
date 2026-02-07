import { Routes, Route, Navigate } from 'react-router-dom';
import { WebSocketProvider } from './providers/WebSocketProvider.js';
import { Home } from './pages/Home.js';
import { Lobby } from './pages/Lobby.js';
import { Game } from './pages/Game.js';
import { Profile } from './pages/Profile.js';

export function App() {
  return (
    <WebSocketProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/lobby/:roomCode" element={<Lobby />} />
        <Route path="/game/:roomCode" element={<Game />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </WebSocketProvider>
  );
}
