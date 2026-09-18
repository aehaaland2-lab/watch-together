import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Film, Users } from 'lucide-react';

export default function Home() {
  const [roomName, setRoomName] = useState('');
  const navigate = useNavigate();

  const handleJoin = (e) => {
    e.preventDefault();
    const finalRoom = roomName.trim() || Math.random().toString(36).substring(2, 8);
    navigate(`/room/${finalRoom}`);
  };

  return (
    <>
      {/* Фоновые неоновые сферы */}
      <div className="bg-glow-orb orb-1" />
      <div className="bg-glow-orb orb-2" />

      <div className="animate-fade" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div className="glass-panel" style={{ maxWidth: '420px', width: '100%', textAlign: 'center', padding: '45px 35px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
            <div style={{ background: 'rgba(99, 102, 241, 0.15)', padding: '18px', borderRadius: '20px', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
              <Film size={36} color="#6366f1" />
            </div>
          </div>

          <h1 style={{ marginBottom: '10px', fontSize: '28px', fontWeight: '800', letterSpacing: '-0.5px' }}>Watch Together</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '35px', fontSize: '15px' }}>Смотри фильмы с друзьями в идеальной синхронизации</p>

          <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <input
              className="cyber-input"
              placeholder="Название комнаты (или пусто для случайной)"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
            />
            <button type="submit" className="btn-cyber" style={{ justifyContent: 'center', padding: '15px' }}>
              <Users size={18} />
              Создать / Войти
            </button>
          </form>

        </div>
      </div>
    </>
  );
}