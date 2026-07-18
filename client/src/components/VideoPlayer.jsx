import { useEffect, useRef, useState } from "react";
import { socket } from "../lib/socket";
import Hls from "hls.js";

export default function VideoPlayer({ roomId }) {
    const videoRef = useRef(null);
    const hlsRef = useRef(null);

    const [input, setInput] = useState("");
    const [url, setUrl] = useState("");
    const remoteAction = useRef(false);

    function loadVideo() {
        if (!input) return;

        setUrl(input);

        socket.emit("video-load", {
            roomId,
            src: input
        });
        console.log("Отправил video-load", input);
    }
    useEffect(() => {
    if (!url || !videoRef.current) return;

    const video = videoRef.current;

    if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
    }

    if (Hls.isSupported()) {
    const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
        maxBufferLength: 10,
        maxMaxBufferLength: 20,
        startLevel: -1,
    });

    hls.loadSource(url);
    hls.attachMedia(video);

    hlsRef.current = hls;
} else if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = url;
}

    return () => {
        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }
    };
}, [url]);

    useEffect(() => {
        const onLoad = (src) => {
    console.log("Получил video-load", src);
    setUrl(src);
};

        const onPlay = async (time) => {
    const video = videoRef.current;
    if (!video) return;

    remoteAction.current = true;

    if (Math.abs(video.currentTime - time) > 0.5) {
        video.currentTime = time;
    }

    if (video.paused) {
        try {
            await video.play();
        } catch {}
    }

    remoteAction.current = false;
};

        const onPause = (time) => {
    if (!videoRef.current) return;

    remoteAction.current = true;

    videoRef.current.currentTime = time;
    videoRef.current.pause();

    setTimeout(() => {
        remoteAction.current = false;
    }, 100);
};

        const onSeek = (time) => {
            if (!videoRef.current) return;

            if (Math.abs(videoRef.current.currentTime - time) > 0.5) {
    remoteAction.current = true;

    videoRef.current.currentTime = time;

    setTimeout(() => {
        remoteAction.current = false;
    }, 50);
}
        };

        socket.on("video-load", onLoad);
        socket.on("video-play", onPlay);
        socket.on("video-pause", onPause);
        socket.on("video-seek", onSeek);

        return () => {
            socket.off("video-load", onLoad);
            socket.off("video-play", onPlay);
            socket.off("video-pause", onPause);
            socket.off("video-seek", onSeek);
        };
    }, []);

    return (
        <div className="video-container">
            <div style={{ display: "flex", gap: 10, marginBottom: 15 }}>
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Вставьте ссылку .m3u8"
                    style={{ flex: 1 }}
                />

                <button onClick={loadVideo}>
                    Загрузить
                </button>
            </div>

            {url && (
                <video
                    ref={videoRef}
                    controls
                    style={{
                        width: "100%",
                        maxWidth: "900px",
                        maxHeight: "70vh",
                        display: "block",
                        margin: "0 auto",
                        borderRadius: "12px"
                    }}
                    onPlay={() => {
    if (remoteAction.current) return;

    socket.emit("video-play", {
        roomId,
        currentTime: videoRef.current.currentTime
    });
}}
                    onPause={() => {
    if (remoteAction.current) return;

    socket.emit("video-pause", {
        roomId,
        currentTime: videoRef.current.currentTime
    });
}}
                    onSeeked={() => {
    if (remoteAction.current) return;

    socket.emit("video-seek", {
        roomId,
        currentTime: videoRef.current.currentTime
    });
}}
                />
            )}
        </div>
    );
}