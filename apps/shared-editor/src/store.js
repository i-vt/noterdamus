// In-memory shared state
// Map<roomId, { text: string, files: Array<FileInfo> }>
const rooms = new Map();

function getRoomState(roomId) {
    if (!rooms.has(roomId)) {
        rooms.set(roomId, { text: "", files: [] });
    }
    return rooms.get(roomId);
}

module.exports = {
    rooms,
    getRoomState
};
