import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { socket } from "../lib/socket";
import Hls from "hls.js";
import { Copy, Users, Send, Mic, MicOff, PhoneOff, Film, LogOut, Check } from "lucide-react";

export default function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const syncInterval = useRef(null);

  const [input, setInput] = useState("");
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [userCount, setUserCount] = useState(1);
  const [copied, setCopied] = useState(false);

  // Чат
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const chatBottomRef = useRef(null);

  // Голосовой чат
  const [inVoice, setInVoice] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const localStreamRef = useRef(null);
  const peerConnections = useRef({});

  // Блокировки синхронизации
  const isSyncingSeek = useRef(false);
  const isSyncingPlay = useRef(false);
  const isSyncingPause = useRef(false);

  // Автозагрузка видео при вводе ссылки
  async function loadVideo(urlToLoad) {
    if (!urlToLoad) return;
    setIsLoading(true);

    try {
      if (urlToLoad.includes(".m3u8") || urlToLoad.includes(".mp4")) {
        setUrl(urlToLoad);
        socket.emit("video-load", { roomId, src: urlToLoad });
        setIsLoading(false);
        return;
      }

      const response = await fetch("http://localhost:3000/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlToLoad }),
      });

      const data = await response.json();
      if (data.success && data.url) {
        setUrl(data.url);
        socket.emit("video-load", { roomId, src: data.url });
      } else {
        alert("Не удалось найти видео.");
      }
    } catch (err) {
      console.error("Ошибка:", err);
    } finally {
      setIsLoading(false);
    }
  }

  // Подключение к комнате и сокетам
  useEffect(() => {
    socket.emit("join-room", roomId);

    socket.on("host-status", (status) => setIsHost(status));
    socket.on("room-users", (count) => setUserCount(count));
    socket.on("video-state", (state) => {
      if (state.src) setUrl(state.src);
    });
    socket.on("chat-history", (history) => setMessages(history));
    socket.on("chat-message", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      socket.off("host-status");
      socket.off("room-users");
      socket.off("video-state");
      socket.off("chat-history");
      socket.off("chat-message");
    };
  }, [roomId]);

  // Скролл чата вниз
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Синхронизация тиков хоста
  useEffect(() => {
    if (isHost && url) {
      syncInterval.current = setInterval(() => {
        if (videoRef.current && videoRef.current.readyState > 0) {
          socket.emit("video-sync", {
            roomId,
            currentTime: videoRef.current.currentTime,
            playing: !videoRef.current.paused
          });
        }
      }, 2000);
    }
    return () => clearInterval(syncInterval.current);
  }, [isHost, url, roomId]);

  // Инициализация HLS плеера
  useEffect(() => {
    if (!url || !videoRef.current) return;
    const video = videoRef.current;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported() && url.includes('.m3u8')) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
        xhrSetup: function(xhr, requestUrl) {
          let targetUrl = requestUrl;
          if (requestUrl.startsWith('http://localhost:3000/') && !requestUrl.includes('/proxy?url=')) {
              const originalBaseUrl = url.substring(0, url.lastIndexOf('/') + 1);
              const fileName = requestUrl.replace('http://localhost:3000/', '').replace(/^\//, '');
              targetUrl = originalBaseUrl + fileName;
          }
          let proxyUrl = targetUrl;
          if (!targetUrl.includes('/proxy?url=')) {
              proxyUrl = `http://localhost:3000/proxy?url=${encodeURIComponent(targetUrl)}&ref=${encodeURIComponent(input)}`;
          }
          xhr.open('GET', proxyUrl);
        }
      });
      hls.loadSource(url);
      hls.attachMedia(video);
      hlsRef.current = hls;
    } else {
      video.src = `http://localhost:3000/proxy?url=${encodeURIComponent(url)}&ref=${encodeURIComponent(input)}`;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [url, input]);

  // Слушатели событий видео (Play, Pause, Seek, Sync)
  useEffect(() => {
    const onLoad = (src) => setUrl(src);
    const onPlay = async (time) => {
      const video = videoRef.current;
      if (!video) return;
      if (Math.abs(video.currentTime - time) > 0.5) {
        isSyncingSeek.current = true;
        video.currentTime = time;
      }
      if (video.paused) {
        isSyncingPlay.current = true;
        try { await video.play(); } catch {}
      }
    };
    const onPause = (time) => {
      const video = videoRef.current;
      if (!video) return;
      isSyncingPause.current = true;
      video.currentTime = time;
      video.pause();
    };
    const onSeek = (time) => {
      const video = videoRef.current;
      if (!video) return;
      if (Math.abs(video.currentTime - time) > 0.5) {
        isSyncingSeek.current = true;
        video.currentTime = time;
      }
    };
    const onSync = ({ currentTime, playing }) => {
      if (isHost || !videoRef.current) return;
      const video = videoRef.current;
      if (video.readyState === 0) return;
      const diff = currentTime - video.currentTime;

      if (Math.abs(diff) > 2) {
        if (!video.seeking) {
          isSyncingSeek.current = true;
          video.currentTime = currentTime;
        }
      } else if (diff > 0.5) {
        video.playbackRate = 1.05;
      } else if (diff < -0.5) {
        video.playbackRate = 0.95;
      } else {
        video.playbackRate = 1;
      }

      if (!video.seeking) {
        if (playing && video.paused) {
          isSyncingPlay.current = true;
          video.play().catch(()=>{});
        } else if (!playing && !video.paused) {
          isSyncingPause.current = true;
          video.pause();
        }
      }
    };

    socket.on("video-load", onLoad);
    socket.on("video-play", onPlay);
    socket.on("video-pause", onPause);
    socket.on("video-seek", onSeek);
    socket.on("video-sync", onSync);

    return () => {
      socket.off("video-load", onLoad);
      socket.off("video-play", onPlay);
      socket.off("video-pause", onPause);
      socket.off("video-seek", onSeek);
      socket.off("video-sync", onSync);
    };
  }, [isHost]);

  // Отправка сообщения в чат
  const sendChatMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socket.emit("chat-message", { roomId, message: chatInput });
    setChatInput("");
  };

  // Копирование ссылки для приглашения
  const copyInviteLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Управление голосовым чатом (WebRTC)
  const toggleVoice = async () => {
    if (inVoice) {
      socket.emit("voice-leave", roomId);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      Object.values(peerConnections.current).forEach(pc => pc.close());
      peerConnections.current = {};
      setInVoice(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;
        socket.emit("voice-join", roomId);
        setInVoice(true);

        socket.on("voice-users", async (users) => {
          users.forEach(async (targetId) => {
            const pc = createPeerConnection(targetId, stream);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit("voice-offer", { target: targetId, offer });
          });
        });

        socket.on("voice-user-joined", async (targetId) => {
          const pc = createPeerConnection(targetId, stream);
          peerConnections.current[targetId] = pc;
        });

        socket.on("voice-offer", async ({ from, offer }) => {
          const pc = createPeerConnection(from, stream);
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("voice-answer", { target: from, answer });
        });

        socket.on("voice-answer", async ({ from, answer }) => {
          const pc = peerConnections.current[from];
          if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
        });

        socket.on("voice-ice", async ({ from, candidate }) => {
          const pc = peerConnections.current[from];
          if (pc && candidate) await pc.addIceCandidate(new RTCIceCandidate(candidate));
        });

        socket.on("voice-user-left", (targetId) => {
          if (peerConnections.current[targetId]) {
            peerConnections.current[targetId].close();
            delete peerConnections.current[targetId];
          }
        });

      } catch (err) {
        alert("Не удалось получить доступ к микрофону");
      }
    }
  };

  const createPeerConnection = (targetId, stream) => {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("voice-ice", { target: targetId, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      const audio = new Audio();
      audio.srcObject = event.streams[0];
      audio.autoplay = true;
      audio.play().catch(() => {});
    };

    peerConnections.current[targetId] = pc;
    return pc;
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  return (
    <>
      {/* Фоновые неоновые сферы */}
      <div className="bg-glow-orb orb-1" />
      <div className="bg-glow-orb orb-2" />

      <div className="animate-fade" style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Навигационная панель */}
        <header className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'rgba(99, 102, 241, 0.2)', padding: '10px', borderRadius: '12px' }}>
              <Film size={22} color="#6366f1" />
            </div>
            <h1 style={{ fontSize: '20px', fontWeight: '800', letterSpacing: '-0.5px' }}>Watch Together</h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px 16px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <Users size={16} color="#9ca3af" />
              <span>Онлайн: <strong style={{ color: '#10b981' }}>{userCount}</strong></span>
            </div>

            <button onClick={copyInviteLink} className="btn-cyber" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              {copied ? <Check size={16} color="#10b981" /> : <Copy size={16} />}
              {copied ? "Скопировано!" : "Пригласить"}
            </button>

            <button onClick={() => navigate('/')} className="btn-cyber btn-danger" style={{ padding: '12px' }} title="Выйти">
              <LogOut size={16} />
            </button>
          </div>
        </header>

        {/* Основной макет: Плеер + Чат/Голос */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px', alignItems: 'start' }}>
          
          {/* Левая колонка: Плеер и Инпут */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-muted)' }}>Вставьте ссылку на кино (Киного)</span>
                {isHost && (
                  <span style={{ background: '#f59e0b', color: '#000', padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase' }}>
                    👑 Хост комнаты
                  </span>
                )}
              </div>

              <input
                className="cyber-input"
                value={input}
                onChange={(e) => {
                  const val = e.target.value;
                  setInput(val);
                  if (val.startsWith("http")) loadVideo(val);
                }}
                placeholder={isLoading ? "⏳ Извлекаем видеопоток (ждите желтую кнопку)..." : "https://kinogo.online/..."}
                disabled={isLoading}
              />
            </div>

            {url && (
              <div className="glass-panel" style={{ padding: '16px', overflow: 'hidden' }}>
                <video
                  ref={videoRef}
                  controls
                  style={{ width: '100%', maxHeight: '70vh', borderRadius: '12px', background: '#000' }}
                  onPlay={() => {
                    if (isSyncingPlay.current) { isSyncingPlay.current = false; return; }
                    socket.emit("video-play", { roomId, currentTime: videoRef.current.currentTime });
                  }}
                  onPause={() => {
                    if (isSyncingPause.current) { isSyncingPause.current = false; return; }
                    socket.emit("video-pause", { roomId, currentTime: videoRef.current.currentTime });
                  }}
                  onSeeked={() => {
                    if (isSyncingSeek.current) { isSyncingSeek.current = false; return; }
                    socket.emit("video-seek", { roomId, currentTime: videoRef.current.currentTime });
                  }}
                />
              </div>
            )}

          </div>

          {/* Правая колонка: Чат и Голосовой чат */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: 'calc(100vh - 140px)', position: 'sticky', top: '24px' }}>
            
            {/* Голосовой чат панель */}
            <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: inVoice ? '#10b981' : '#6b7280', boxShadow: inVoice ? '0 0 10px #10b981' : 'none' }} />
                <span style={{ fontSize: '14px', fontWeight: '600' }}>Голосовой чат</span>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                {!inVoice ? (
                  <button onClick={toggleVoice} className="btn-cyber" style={{ padding: '8px 16px', fontSize: '13px' }}>
                    <Mic size={14} /> Войти
                  </button>
                ) : (
                  <>
                    <button onClick={toggleMute} className="btn-cyber" style={{ background: isMuted ? '#ef4444' : 'rgba(255,255,255,0.1)', padding: '8px 12px' }}>
                      {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
                    </button>
                    <button onClick={toggleVoice} className="btn-cyber btn-danger" style={{ padding: '8px 12px' }} title="Отключиться">
                      <PhoneOff size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Чат */}
            <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>Текстовый чат</h3>

              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '4px', marginBottom: '16px' }}>
                {messages.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '40px', fontSize: '13px' }}>Сообщений пока нет. Напишите что-нибудь!</div>
                ) : (
                  messages.map((msg, index) => (
                    <div key={index} style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.03)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                        <span style={{ fontFamily: 'monospace', color: '#818cf8' }}>{msg.id.substring(0, 6)}</span>
                        <span>{msg.time}</span>
                      </div>
                      <div style={{ fontSize: '14px', wordBreak: 'break-word' }}>{msg.message}</div>
                    </div>
                  ))
                )}
                <div ref={chatBottomRef} />
              </div>

              <form onSubmit={sendChatMessage} style={{ display: 'flex', gap: '8px' }}>
                <input
                  className="cyber-input"
                  style={{ padding: '10px 14px', fontSize: '14px' }}
                  placeholder="Сообщение..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                />
                <button type="submit" className="btn-cyber" style={{ padding: '10px 14px' }}>
                  <Send size={16} />
                </button>
              </form>

            </div>

          </div>

        </div>

      </div>
    </>
  );
}