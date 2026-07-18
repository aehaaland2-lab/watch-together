import { useEffect, useRef, useState } from "react";
import { socket } from "../lib/socket";

const config = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302"
        }
    ]
};

export default function VoiceChat({ roomId }) {

    const [connected, setConnected] = useState(false);

    const streamRef = useRef(null);

    const peers = useRef({});

    const pendingIce = useRef({});

    const audioRefs = useRef({});

    const audioContainer = useRef(null);
        const connectVoice = async () => {

        if (connected) return;

        try {

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false
            });

            streamRef.current = stream;

            setConnected(true);

            socket.emit("voice-join", roomId);

        } catch (err) {

            console.error(err);

            alert("Не удалось получить доступ к микрофону");

        }

    };

    const disconnectVoice = () => {

        socket.emit("voice-leave", roomId);

        Object.values(peers.current).forEach(peer => peer.close());

        Object.values(audioRefs.current).forEach(audio => {
            audio.remove();
        });

        peers.current = {};
        pendingIce.current = {};
        audioRefs.current = {};

        streamRef.current?.getTracks().forEach(track => track.stop());

        streamRef.current = null;

        setConnected(false);

    };

    const createPeer = (id) => {

        const peer = new RTCPeerConnection(config);

        peers.current[id] = peer;

        pendingIce.current[id] = [];

        streamRef.current.getTracks().forEach(track => {
            peer.addTrack(track, streamRef.current);
        });

        peer.ontrack = (event) => {

            if (audioRefs.current[id]) return;

            const audio = document.createElement("audio");

            audio.autoplay = true;
            audio.playsInline = true;
            audio.srcObject = event.streams[0];

            audioRefs.current[id] = audio;

            audioContainer.current.appendChild(audio);

        };

        peer.onicecandidate = ({ candidate }) => {

            if (!candidate) return;

            socket.emit("voice-ice", {
                target: id,
                candidate
            });

        };

        return peer;

    };
        useEffect(() => {

        socket.on("voice-users", async (users) => {

            if (!streamRef.current) return;

            for (const id of users) {

                if (peers.current[id]) continue;

                const peer = createPeer(id);

                const offer = await peer.createOffer();

                await peer.setLocalDescription(offer);

                socket.emit("voice-offer", {
                    target: id,
                    offer: peer.localDescription
                });

            }

        });

        socket.on("voice-offer", async ({ from, offer }) => {

            if (!streamRef.current) return;

            let peer = peers.current[from];

            if (!peer) {
                peer = createPeer(from);
            }

            if (peer.signalingState !== "stable") {
                return;
            }

            await peer.setRemoteDescription(
                new RTCSessionDescription(offer)
            );

            while (pendingIce.current[from]?.length) {

                await peer.addIceCandidate(
                    pendingIce.current[from].shift()
                );

            }

            const answer = await peer.createAnswer();

            await peer.setLocalDescription(answer);

            socket.emit("voice-answer", {
                target: from,
                answer: peer.localDescription
            });

        });

        socket.on("voice-answer", async ({ from, answer }) => {

            const peer = peers.current[from];

            if (!peer) return;

            if (peer.signalingState !== "have-local-offer") {
                return;
            }

            await peer.setRemoteDescription(
                new RTCSessionDescription(answer)
            );

            while (pendingIce.current[from]?.length) {

                await peer.addIceCandidate(
                    pendingIce.current[from].shift()
                );

            }

        });
                socket.on("voice-ice", async ({ from, candidate }) => {

            const peer = peers.current[from];

            if (!peer) return;

            if (peer.remoteDescription) {

                try {
                    await peer.addIceCandidate(
                        new RTCIceCandidate(candidate)
                    );
                } catch (e) {
                    console.error(e);
                }

            } else {

                pendingIce.current[from].push(
                    new RTCIceCandidate(candidate)
                );

            }

        });

        socket.on("voice-user-left", (id) => {

            peers.current[id]?.close();

            delete peers.current[id];
            delete pendingIce.current[id];

            if (audioRefs.current[id]) {

                audioRefs.current[id].remove();

                delete audioRefs.current[id];

            }

        });

        return () => {

            socket.off("voice-users");
            socket.off("voice-offer");
            socket.off("voice-answer");
            socket.off("voice-ice");
            socket.off("voice-user-left");

        };

    }, []);

    useEffect(() => {

        return () => {
            disconnectVoice();
        };

    }, []);

    return (
        <>
            <button
                className="voice-btn"
                onClick={connected ? disconnectVoice : connectVoice}
            >
                {connected ? "🔴 Покинуть голосовой" : "🎤 Присоединиться"}
            </button>

            <div ref={audioContainer}></div>
        </>
    );

}