const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();

app.use(cors());

app.get("/", (req, res) => {
    res.json({
        status: "ok",
        message: "Watch Together API работает"
    });
});

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"]
    }
});
const rooms = new Map();
const chatHistory = new Map();
const videoState = new Map();
const voiceUsers = new Map();

io.on("connection", (socket) => {
    socket.on("join-room", (roomId) => {
    socket.join(roomId);
    socket.emit("chat-history", chatHistory.get(roomId) || []);
    socket.emit("video-state", videoState.get(roomId) || {
    playing: false,
    currentTime: 0,
    src: ""
});

    if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
    }

    rooms.get(roomId).add(socket.id);

    io.to(roomId).emit("room-users", rooms.get(roomId).size);

    console.log(`${socket.id} joined ${roomId}`);
});
socket.on("chat-message", ({ roomId, message }) => {
    const msg = {
        id: socket.id,
        message,
        time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        }),
    };

    if (!chatHistory.has(roomId)) {
        chatHistory.set(roomId, []);
    }

    const history = chatHistory.get(roomId);

    history.push(msg);
    if (history.length > 100) {
        history.shift();
    }

    io.to(roomId).emit("chat-message", msg);
});
socket.on("video-load", ({ roomId, src }) => {
    console.log("LOAD", roomId, src);

    const state = {
        src,
        currentTime: 0,
        playing: false
    };

    videoState.set(roomId, state);

    socket.to(roomId).emit("video-load", src);
});

socket.on("video-play", ({ roomId, currentTime }) => {
    console.log("PLAY", roomId, currentTime);
    socket.to(roomId).emit("video-play", currentTime);
});

socket.on("video-pause", ({ roomId, currentTime }) => {
    socket.to(roomId).emit("video-pause", currentTime);
});

socket.on("video-seek", ({ roomId, currentTime }) => {
    socket.to(roomId).emit("video-seek", currentTime);
});
socket.on("voice-join", (roomId) => {

    socket.join(`voice-${roomId}`);

    if (!voiceUsers.has(roomId)) {
        voiceUsers.set(roomId, new Set());
    }

    const users = voiceUsers.get(roomId);

    socket.emit(
        "voice-users",
        [...users]
    );

    users.add(socket.id);

    socket.to(`voice-${roomId}`).emit(
        "voice-user-joined",
        socket.id
    );

});

socket.on("voice-leave", (roomId) => {

    socket.leave(`voice-${roomId}`);

    const users = voiceUsers.get(roomId);

    if (!users) return;

    users.delete(socket.id);

    socket.to(`voice-${roomId}`).emit(
        "voice-user-left",
        socket.id
    );

    if (users.size === 0) {
        voiceUsers.delete(roomId);
    }

});
socket.on("voice-offer", ({ target, offer }) => {
    io.to(target).emit("voice-offer", {
        from: socket.id,
        offer
    });
});

socket.on("voice-answer", ({ target, answer }) => {
    io.to(target).emit("voice-answer", {
        from: socket.id,
        answer
    });
});

socket.on("voice-ice", ({ target, candidate }) => {
    io.to(target).emit("voice-ice", {
        from: socket.id,
        candidate
    });
});
    console.log("Пользователь подключился:", socket.id);

    socket.on("disconnect", () => {
        for (const [roomId, users] of rooms) {
    users.delete(socket.id);

    if (users.size === 0) {
        rooms.delete(roomId);
    } else {
        io.to(roomId).emit("room-users", users.size);
    }
}
for (const [roomId, users] of voiceUsers) {

    users.delete(socket.id);

    socket.to(`voice-${roomId}`).emit("voice-user-left", socket.id);

    if (users.size === 0) {
        voiceUsers.delete(roomId);
    }

}
        console.log("Пользователь вышел:", socket.id);
    });
});

const PORT = 3000;

server.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
});