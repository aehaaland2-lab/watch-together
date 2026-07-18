import { useEffect, useRef, useState } from "react";
import { socket } from "../lib/socket";

export default function Chat({ roomId }) {
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState("");

    const bottomRef = useRef(null);

    useEffect(() => {
    socket.on("chat-message", (msg) => {
        setMessages((prev) => [...prev, msg]);
    });
    socket.on("chat-history", (history) => {
    setMessages(history);
});

    return () => {
        socket.off("chat-message");
        socket.off("chat-history");
    };
}, []);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({
            behavior: "smooth"
        });
    }, [messages]);

    const sendMessage = () => {
        if (!text.trim()) return;

        socket.emit("chat-message", {
            roomId,
            message: text
        });

        setText("");
    };

    return (
        <div className="chat-box">

            <div className="messages">

                {messages.map((msg, index) => (
                    <div key={index} className="message">
                        <strong>{msg.id.slice(0,5)}</strong>

                        <span>{msg.message}</span>

                        <small>{msg.time}</small>
                    </div>
                ))}

                <div ref={bottomRef}/>
            </div>

            <div className="chat-input">

                <input
                    value={text}
                    onChange={(e)=>setText(e.target.value)}
                    onKeyDown={(e)=>{
                        if(e.key==="Enter") sendMessage();
                    }}
                    placeholder="Написать сообщение..."
                />

                <button onClick={sendMessage}>
                    ➤
                </button>

            </div>

        </div>
    );
}