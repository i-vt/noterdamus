const { getRoomState } = require('./store');

function initSockets(io) {
    io.on("connection", (socket) => {
        socket.on("join", ({ room }) => {
            socket.join(room);
            const state = getRoomState(room);
            
            // Send initial state to the joining client
            socket.emit("text:sync", { text: state.text });
            socket.emit("files:update", state.files);
        });

        socket.on("text:update", ({ room, text }) => {
            const state = getRoomState(room);
            state.text = text;
            
            // Broadcast text changes to everyone else in the room
            socket.to(room).emit("text:sync", { text });
        });
    });
}

module.exports = initSockets;
