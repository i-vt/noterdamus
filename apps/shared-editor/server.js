const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const createRoutes = require("./src/routes");
const initSockets = require("./src/socket");

// --- Initialization ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- Configuration ---
const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = path.join(__dirname, "uploads");

// --- Middleware ---
app.use("/uploads", express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, "public")));

// --- Routes & Sockets ---
// We inject 'io' into routes so API calls can broadcast updates
app.use("/", createRoutes(io));

// Initialize Socket.io logic
initSockets(io);

// --- Start Server ---
server.listen(PORT, () => {
    console.log(`Shared Editor running at http://localhost:${PORT}`);
    console.log(`Storage: ${UPLOADS_DIR}`);
});
