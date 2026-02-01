const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const archiver = require('archiver');

const app = express();

const PORT = process.env.PORT || config.serverPort || 18449;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static('/tmp'));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const sessionId = req.headers['x-session-id'];
        if (!sessionId) return cb(new Error('No session ID'));
        
        const originalPath = file.originalname.split('@@@').join(path.sep);
        const fullPath = path.join('/tmp', sessionId, originalPath);
        const dir = path.dirname(fullPath);
        
        fs.ensureDirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const originalPath = file.originalname.split('@@@').join(path.sep);
        cb(null, path.basename(originalPath));
    }
});

const upload = multer({ storage });

// --- API Endpoints ---

// Create NEW Session
app.get('/api/session', (req, res) => {
    const id = uuidv4();
    fs.ensureDirSync(path.join('/tmp', id));
    res.json({ sessionId: id });
});

// [NEW] Validate Existing Session
app.get('/api/session/:id', (req, res) => {
    const { id } = req.params;
    // Simple sanitization to prevent directory traversal
    const safeId = path.basename(id); 
    const dir = path.join('/tmp', safeId);
    
    if (fs.existsSync(dir)) {
        res.json({ valid: true, sessionId: safeId });
    } else {
        res.json({ valid: false });
    }
});

app.post('/api/upload', upload.array('files'), (req, res) => {
    res.json({ success: true, count: req.files.length });
});

app.get('/api/files/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const rootDir = path.join('/tmp', sessionId);
    if (!fs.existsSync(rootDir)) return res.json([]);

    async function getFiles(dir) {
        const dirents = await fs.readdir(dir, { withFileTypes: true });
        const files = await Promise.all(dirents.map((dirent) => {
            const resPath = path.resolve(dir, dirent.name);
            const relative = path.relative(rootDir, resPath).replace(/\\/g, '/');
            
            if (dirent.isDirectory()) {
                return getFiles(resPath);
            } else {
                return { name: dirent.name, path: relative };
            }
        }));
        return Array.prototype.concat(...files);
    }

    try {
        const fileList = await getFiles(rootDir);
        res.json(fileList);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/read/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const filePath = req.query.path;
    const safePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.join('/tmp', sessionId, safePath);

    if (fs.existsSync(fullPath)) {
        res.sendFile(fullPath);
    } else {
        res.status(404).send('File not found');
    }
});

app.post('/api/save/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const { path: filePath, content } = req.body;
    const fullPath = path.join('/tmp', sessionId, filePath);
    try {
        await fs.outputFile(fullPath, content);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/delete/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const filePath = req.query.path;
    const safePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.join('/tmp', sessionId, safePath);

    try {
        if (fs.existsSync(fullPath)) {
            await fs.remove(fullPath);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "File not found" });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/rename/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const { oldPath, newPath } = req.body;
    
    const safeOld = path.normalize(oldPath).replace(/^(\.\.[\/\\])+/, '');
    const safeNew = path.normalize(newPath).replace(/^(\.\.[\/\\])+/, '');

    const fullOld = path.join('/tmp', sessionId, safeOld);
    const fullNew = path.join('/tmp', sessionId, safeNew);

    try {
        if (fs.existsSync(fullOld)) {
            await fs.move(fullOld, fullNew, { overwrite: true });
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "File not found" });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/download/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const sourceDir = path.join('/tmp', sessionId);
    if (!fs.existsSync(sourceDir)) return res.status(404).send('Session not found');

    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    res.attachment(`project_${timestamp}.zip`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);
    archive.directory(sourceDir, false);
    archive.finalize();
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
