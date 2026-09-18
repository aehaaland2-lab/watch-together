import { useEffect, useRef, useState } from "react";
import { socket } from "../lib/socket";
import Hls from "hls.js";

export default function VideoPlayer({ roomId }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const syncInterval = useRef(null);

  const [input, setInput] = useState("");
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isHost, setIsHost] = useState(false);

  const isSyncingSeek = useRef(false);
  const isSyncingPlay = useRef(false);
  const isSyncingPause = useRef(false);

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

  useEffect(() => {
    socket.on("host-status", (status) => setIsHost(status));
    socket.on("video-state", (state) => {
      if (state.src) setUrl(state.src);
    });
    return () => {
      socket.off("host-status");
      socket.off("video-state");
    };
  }, []);

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
        lowLatencyMode: false, // Отключаем жесткий латентный режим, чтобы плеер не дергался при задержках прокси
        maxBufferLength: 60,   // Буферизуем до 60 секунд вперед (вместо стандартных 30)
        maxMaxBufferLength: 300,
        maxBufferSize: 90 * 1000 * 1000, // Выделяем до 90 МБ под кэш видео в памяти
        liveSyncDurationCount: 3,
        fragLoadingTimeOut: 20000, // Даем больше времени на скачивание тяжелого кусочка
        manifestLoadingTimeOut: 20000,
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

  return (
    <div className="glass-panel" style={{ padding: '20px', marginBottom: '20px' }}>
      
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>Плеер</h2>
        {isHost && (
          <div className="host-badge">
            <span>👑</span> Хост
          </div>
        )}
      </div>

      <div className="magic-input-wrapper">
        <input
          className="magic-input"
          value={input}
          onChange={(e) => {
            const val = e.target.value;
            setInput(val);
            if (val.startsWith("http")) {
              loadVideo(val);
            }
          }}
          placeholder={isLoading ? "⏳ Магия в процессе (жди Желтую кнопку)..." : "Вставь ссылку на фильм (Киного) сюда..."}
          disabled={isLoading}
        />
      </div>

      {url && (
        <video
          ref={videoRef}
          controls
          style={{ width: "100%", maxWidth: "900px", maxHeight: "70vh", display: "block", margin: "0 auto", borderRadius: "12px", background: "#000" }}
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
      )}
    </div>
  );
}