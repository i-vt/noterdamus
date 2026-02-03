const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getRoomState } = require('./store');

const router = express.Router();

// --- Multer Configuration ---
const UPLOADS_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

const storage = multer.diskStorage({
    destination: (_, __, cb) => cb(null, UPLOADS_DIR),
    filename: (_, file, cb) => {
        const unique = Date.now() + "-" + Math.round(Math.random() * 1e6);
        cb(null, unique + "-" + file.originalname);
    },
});
const upload = multer({ storage });

// --- Route Factory ---
// We export a function that returns the router so we can inject 'io'
module.exports = (io) => {

    // 1. File Upload
    router.post("/upload/:room", upload.single("file"), (req, res) => {
        const { room } = req.params;
        if (!req.file) return res.status(400).send("No file uploaded");

        const fileInfo = {
            id: req.file.filename,
            name: req.file.originalname,
            size: req.file.size,
            url: `/uploads/${req.file.filename}`,
            uploadedAt: Date.now(),
        };

        const roomState = getRoomState(room);
        roomState.files.push(fileInfo);
        
        // Notify clients in the room
        io.to(room).emit("files:update", roomState.files);

        res.json(fileInfo);
    });

    // 2. File Delete
    router.delete("/delete/:room/:fileId", (req, res) => {
        const { room, fileId } = req.params;
        const roomState = getRoomState(room);

        const fileIndex = roomState.files.findIndex((f) => f.id === fileId);
        if (fileIndex === -1) return res.status(404).send("File not found");

        const [file] = roomState.files.splice(fileIndex, 1);
        const filePath = path.join(UPLOADS_DIR, file.id);
        
        // Remove from disk
        if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch(e) { console.error(e); }
        }

        // Notify clients
        io.to(room).emit("files:update", roomState.files);
        res.sendStatus(200);
    });

    // 3. Root Redirect (Random Room)
    router.get("/", (req, res) => {
        const roomId = Math.random().toString(36).substring(2, 8);
        res.redirect("/room?room=" + roomId);
    });

    // 4. Main App Page
    router.get("/room", (req, res) => {
        res.sendFile(path.join(__dirname, '../public/index.html'));
    });

    return router;
};
