import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { socket } from "../lib/socket";
import VideoPlayer from "../components/VideoPlayer";
import Chat from "../components/Chat";
import VoiceChat from "../components/VoiceChat";

function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const [users, setUsers] = useState(1);

  useEffect(() => {
    socket.emit("join-room", roomId);

    socket.on("room-users", (count) => {
      setUsers(count);
    });

    return () => {
      socket.off("room-users");
    };
  }, [roomId]);
  const copyLink = async () => {
  await navigator.clipboard.writeText(window.location.href);
  alert("Ссылка скопирована!");
};

return (
  <div className="room-page">

    <header className="room-header">
      <div>
        <h1>🎬 Watch Together</h1>
        <span>ID комнаты: {roomId}</span>
      </div>

      <div className="header-actions">
        <div className="online">
          👥 {users}
        </div>

        <button className="copy-btn" onClick={copyLink}>
          🔗 Пригласить
        </button>

        <button
          className="leave-btn"
          onClick={() => navigate("/")}
        >
          🚪 Выйти
        </button>
      </div>
    </header>

    <div className="room-grid">

      <div className="video-card">
        <VideoPlayer roomId={roomId} />
      </div>

      <div className="side-panel">

        <div className="panel">
          <h2>💬 Чат</h2>
          <Chat roomId={roomId} />
        </div>

        <div className="panel">
  <h2>🎤 Голосовой чат</h2>
  <VoiceChat roomId={roomId} />
</div>

      </div>

    </div>

  </div>
);
}

export default Room;