const express = require("express");
const http = require("http");
const https = require("https");
const { Server } = require("socket.io");
const cors = require("cors");
const puppeteer = require("puppeteer");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

// ГЛОБАЛЬНОЕ ХРАНИЛИЩЕ УКРАДЕННЫХ КУКОВ
let globalCookies = ""; 

// --- ДИАГНОСТИЧЕСКИЙ ПРОКСИ ---
app.get("/proxy", async (req, res) => {
    const targetUrl = req.query.url;
    const ref = req.query.ref;
    
    console.log(`\n=========================================`);
    console.log(`➡️ [ПРОКСИ] Запрос от плеера: ${targetUrl}`);

    if (!targetUrl) {
        console.log(`❌ [ПРОКСИ] Ошибка: URL не передан`);
        return res.status(400).send("URL не указан");
    }

    try {
        const urlObj = new URL(targetUrl);
        const referer = ref || urlObj.origin + '/';

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Referer': referer,
            'Origin': new URL(referer).origin,
            'Accept': '*/*',
            'Accept-Encoding': 'identity'
        };

        if (globalCookies) headers['Cookie'] = globalCookies;
        if (req.headers.range) headers['Range'] = req.headers.range;

        console.log(`⏳ [ПРОКСИ] Стучимся к пиратам...`);

        const response = await axios({
            method: 'GET',
            url: targetUrl,
            responseType: 'stream',
            headers: headers,
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            validateStatus: () => true,
            decompress: false
        });

        console.log(`⬅️ [ПРОКСИ] Ответ от пиратов: Статус [${response.status}], Тип: [${response.headers['content-type']}], Размер: [${response.headers['content-length'] || 'неизвестен'}]`);

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

        const safeHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
        for (const [key, value] of Object.entries(response.headers)) {
            if (safeHeaders.includes(key.toLowerCase())) {
                res.setHeader(key, value);
            }
        }

        res.status(response.status);
        response.data.pipe(res);

        response.data.on('end', () => {
            console.log(`✅ [ПРОКСИ] Файл успешно передан клиенту.`);
        });

        req.on('close', () => {
            if (response.data && typeof response.data.destroy === 'function') {
                response.data.destroy();
                console.log(`⚠️ [ПРОКСИ] Клиент (плеер) сам закрыл соединение до завершения.`);
            }
        });
    } catch (error) {
        console.error(`❌ [ПРОКСИ] Критическая ошибка:`, error.message);
        if (error.response) {
            console.error(`❌ [ПРОКСИ] Статус ошибки:`, error.response.status);
        }
        if (!res.headersSent) res.status(500).send("Ошибка прокси");
    }
});
// --- КОНЕЦ ДИАГНОСТИЧЕСКОГО ПРОКСИ ---

// --- ПАРСЕР (КРАЖА СЕССИИ И КУКОВ) ---
app.post("/api/extract", async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL не предоставлен" });

    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: false, 
            defaultViewport: null,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-popup-blocking'] 
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        
        console.log("Открываю страницу:", url);
        let lastVideoUrl = null;

        page.on('request', request => {
            const reqUrl = request.url();
            if (reqUrl.includes('.ts') || reqUrl.includes('vast') || reqUrl.includes('ads') || reqUrl.includes('google')) return;
            
            if (reqUrl.includes('.m3u8') || reqUrl.includes('.mp4')) {
                console.log("👀 Замечен плейлист:", reqUrl);
                lastVideoUrl = reqUrl;
            }
        });

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 0 });

        await page.evaluate(() => {
            const btn = document.createElement('button');
            btn.innerHTML = '🎬 ФИЛЬМ НАЧАЛСЯ! ЗАХВАТИТЬ';
            btn.style.cssText = 'position:fixed; top:20px; right:20px; z-index:9999999; padding:20px 30px; font-size:20px; background:#eab308; color:black; border:none; border-radius:12px; cursor:pointer; box-shadow:0 10px 25px rgba(0,0,0,0.8); font-weight:900; text-transform:uppercase; font-family:sans-serif;';
            btn.onclick = () => { 
                window.wtVideoGrabbed = true; 
                btn.innerHTML = '⏳ Захват...'; 
                btn.style.background = '#4ade80';
            };
            document.body.appendChild(btn);
        });

        console.log("⏳ ПРОПУСТИ РЕКЛАМУ. НАЖМИ ЖЕЛТУЮ КНОПКУ НА ФИЛЬМЕ!");

        await page.waitForFunction(() => window.wtVideoGrabbed === true, { timeout: 300000 });

        if (lastVideoUrl) {
            // САМОЕ ГЛАВНОЕ: КРАДЕМ ВСЕ КУКИ С САЙТА ПЕРЕД ЗАКРЫТИЕМ
            const cookiesArray = await page.cookies();
            globalCookies = cookiesArray.map(c => `${c.name}=${c.value}`).join('; ');
            console.log("🍪 Сессия украдена! Длина куков:", globalCookies.length);

            console.log("🎯 БИНГО! Поток найден:", lastVideoUrl);
            res.json({ success: true, url: lastVideoUrl });
        } else {
            res.status(404).json({ success: false, error: "Поток не найден" });
        }
    } catch (error) {
        if (!res.headersSent) res.status(500).json({ success: false, error: "Ошибка сервера" });
    } finally {
        if (browser) await browser.close();
    }
});
// --- КОНЕЦ ПАРСЕРА ---

app.get("/", (req, res) => res.json({ status: "ok" }));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: ["http://localhost:5173", "https://watch-together-swart.vercel.app"], methods: ["GET", "POST"], credentials: true }
});

const rooms = new Map();
const roomHosts = new Map();
const chatHistory = new Map();
const videoState = new Map();

io.on("connection", (socket) => {
    socket.on("join-room", (roomId) => {
        socket.join(roomId);
        if (!rooms.has(roomId)) rooms.set(roomId, new Set());
        rooms.get(roomId).add(socket.id);
        if (!roomHosts.has(roomId)) roomHosts.set(roomId, socket.id);
        
        socket.emit("host-status", roomHosts.get(roomId) === socket.id);
        socket.emit("chat-history", chatHistory.get(roomId) || []);
        socket.emit("video-state", videoState.get(roomId) || { playing: false, currentTime: 0, src: "" });
        io.to(roomId).emit("room-users", rooms.get(roomId).size);
    });

    socket.on("video-sync", ({ roomId, currentTime, playing }) => {
        if (roomHosts.get(roomId) === socket.id) {
            videoState.set(roomId, { ...videoState.get(roomId), currentTime, playing });
            socket.to(roomId).emit("video-sync", { currentTime, playing });
        }
    });

    socket.on("video-load", ({ roomId, src }) => {
        videoState.set(roomId, { src, currentTime: 0, playing: false });
        socket.to(roomId).emit("video-load", src);
    });
    socket.on("video-play", ({ roomId, currentTime }) => socket.to(roomId).emit("video-play", currentTime));
    socket.on("video-pause", ({ roomId, currentTime }) => socket.to(roomId).emit("video-pause", currentTime));
    socket.on("video-seek", ({ roomId, currentTime }) => socket.to(roomId).emit("video-seek", currentTime));

    socket.on("disconnect", () => {
        // Проверяем обычные комнаты
        for (const [roomId, users] of rooms) {
            if (users.has(socket.id)) {
                users.delete(socket.id);
                
                if (users.size === 0) {
                    // АБСОЛЮТНО УДАЛЯЕМ ВСЕ ДАННЫЕ КОМНАТЫ
                    rooms.delete(roomId);
                    roomHosts.delete(roomId);
                    videoState.delete(roomId);
                    chatHistory.delete(roomId);
                    console.log(`🧹 Комната ${roomId} пуста. Вся история и данные удалены.`);
                } else {
                    io.to(roomId).emit("room-users", users.size);
                    if (roomHosts.get(roomId) === socket.id) {
                        const nextHost = Array.from(users)[0];
                        roomHosts.set(roomId, nextHost);
                        io.to(nextHost).emit("host-status", true);
                    }
                }
            }
        }

        // Чистим голосовой чат, если кто-то вышел
        for (const [roomId, users] of voiceUsers) {
            if (users.has(socket.id)) {
                users.delete(socket.id);
                socket.to(`voice-${roomId}`).emit("voice-user-left", socket.id);
                if (users.size === 0) voiceUsers.delete(roomId);
            }
        }
    });
});

server.listen(3000, () => console.log(`Server started on http://localhost:3000`));