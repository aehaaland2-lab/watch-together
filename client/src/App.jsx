import { Routes, Route, Link } from "react-router-dom";

import Room from "./pages/Room";

function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <div style={{ padding: 40 }}>
            <h1>🎬 Watch Together</h1>

            <Link to="/room/test123">
              Перейти в тестовую комнату
            </Link>
          </div>
        }
      />

      <Route path="/room/:roomId" element={<Room />} />
    </Routes>
  );
}

export default App;