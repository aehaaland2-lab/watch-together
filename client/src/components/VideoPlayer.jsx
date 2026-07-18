import { useEffect, useState } from "react";
import { socket } from "../lib/socket";

export default function VideoPlayer({ roomId }) {
    const [input, setInput] = useState("");
    const [url, setUrl] = useState("");

    function convertVk(url) {
        const match = url.match(/video(-?\d+)_(\d+)/);

        if (!match) return null;

        return `https://vkvideo.ru/video_ext.php?oid=${match[1]}&id=${match[2]}&hd=2`;
    }

    function loadVideo() {
        const embed = convertVk(input);

        if (!embed) {
            alert("Неверная ссылка VK");
            return;
        }

        setUrl(embed);

        socket.emit("video-load", {
            roomId,
            src: embed,
        });
    }

    useEffect(() => {
        socket.on("video-load", (src) => {
            setUrl(src);
        });

        return () => {
            socket.off("video-load");
        };
    }, []);

    return (
        <div className="video-container">
            <div style={{ display: "flex", gap: 10, marginBottom: 15 }}>
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Вставьте ссылку VK Видео"
                    style={{ flex: 1 }}
                />

                <button onClick={loadVideo}>
                    Загрузить
                </button>
            </div>

            {url && (
                <iframe
                    src={url}
                    width="100%"
                    height="600"
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                    style={{
                        border: "none",
                        borderRadius: "12px"
                    }}
                />
            )}
        </div>
    );
}