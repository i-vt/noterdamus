const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const archiver = require('archiver');

// 1. Load Configuration
let config;
try {
    const configPath = process.argv.find(arg => arg.startsWith('--config.path='))?.split('=')[1] || 'config.json';
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log('Config loaded:', config);
} catch (err) {
    console.error('Failed to load config.json:', err.message);
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || config.serverPort || 18754;
const UPLOAD_DIR = config.uploadDir || 'uploads/';

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)){
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// 2. Configure Multer (Upload Logic)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.png';
        const filename = `${uuidv4()}${ext}`;
        cb(null, filename);
    }
});
const upload = multer({ storage: storage });

app.use(express.static('public'));

// 4. Config Endpoint
app.get('/config', (req, res) => {
    res.json({
        imageBasePath: config.imageBasePath,
        imageEndpointPrefix: config.imageEndpointPrefix
    });
});

// 5. Upload Endpoint
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    res.json({ success: true, filename: req.file.filename });
});

// 6. Download All Endpoint (Updated with Timestamp)
app.get(`/${config.imageEndpointPrefix}/download-all`, (req, res) => {
    
    // --- Generate Timestamped Filename ---
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    
    const zipFilename = `all-images_${yyyy}${mm}${dd}_${hh}${min}${ss}_${ms}.zip`;

    const archive = archiver('zip', { zlib: { level: 9 } });

    // Set the dynamic filename here
    res.attachment(zipFilename);

    // Error handling
    archive.on('error', (err) => {
        if (!res.headersSent) {
            res.status(500).send({ error: err.message });
        }
    });

    archive.pipe(res);

    // Read directory
    fs.readdir(UPLOAD_DIR, (err, files) => {
        if (err) {
            if (!res.headersSent) res.status(500).send('Could not list files');
            return;
        }

        const validFiles = files.filter(file => {
            const filepath = path.join(UPLOAD_DIR, file);
            return fs.statSync(filepath).isFile() && !file.startsWith('.');
        });

        // Generate Manifest CSV Content
        let csvContent = 'Filename,Markdown Format,HTML Format,URL Format\n';
        const imageBasePath = config.imageBasePath || './images/';

        validFiles.forEach(file => {
            // Add file to zip
            archive.file(path.join(UPLOAD_DIR, file), { name: file });

            // Generate formats
            const publicPath = `${imageBasePath}${file}`;
            const formatField = (text) => `"${text.replace(/"/g, '""')}"`;

            const markdown = `![ThisTextWillShowUpIfImageCannotBeloaded](${publicPath} "TitleTextUsuallyVisible")`;
            const html = `<img src="${publicPath}" alt="Uploaded Image">`;
            const url = publicPath;

            csvContent += `${formatField(file)},${formatField(markdown)},${formatField(html)},${formatField(url)}\n`;
        });

        // Add manifest.csv to zip
        archive.append(csvContent, { name: 'manifest.csv' });

        archive.finalize();

        // Unload (Delete) images after download finishes
        res.on('finish', () => {
            console.log(`Download complete (${zipFilename}). Unloading images...`);
            validFiles.forEach(file => {
                fs.unlink(path.join(UPLOAD_DIR, file), (err) => {
                    if (err) console.error(`Failed to delete ${file}:`, err);
                });
            });
        });
    });
});

// 7. Serve Uploaded Images
app.use(`/${config.imageEndpointPrefix}`, express.static(UPLOAD_DIR));

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Uploads saving to: ${UPLOAD_DIR}`);
});
