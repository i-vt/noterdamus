const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

// --- Puppeteer & Stealth ---
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// --- Text Extraction ---
const { JSDOM, VirtualConsole } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const TurndownService = require('turndown');

const app = express();
const PORT = process.env.PORT || 3001;
const ASSETS_DIR = path.join(__dirname, 'assets');
const MANIFEST_PATH = path.join(ASSETS_DIR, 'manifest.json');

// --- Setup ---
if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR);
}

// ==========================================
//    MANIFEST SYSTEM (JSON TRACKING)
// ==========================================

function getManifest() {
    if (!fs.existsSync(MANIFEST_PATH)) return {};
    try {
        return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    } catch (e) {
        console.error("Manifest corrupted, resetting.");
        return {};
    }
}

function saveManifest(data) {
    try {
        fs.writeFileSync(MANIFEST_PATH, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Failed to save manifest:", e);
    }
}

function updateManifestEntry(url, updates) {
    const manifest = getManifest();
    manifest[url] = { ...(manifest[url] || {}), ...updates, lastUpdated: Date.now() };
    saveManifest(manifest);
}

function checkAssetsExist(fileBase) {
    if (!fileBase) return false;
    const jpg = path.join(ASSETS_DIR, `${fileBase}.jpg`);
    const md = path.join(ASSETS_DIR, `${fileBase}.md`);
    return fs.existsSync(jpg) && fs.existsSync(md);
}

// --- Helper: Find Newsboat DB ---
function findDbPath() {
    const home = os.homedir();
    const paths = [
        path.join(home, '.local', 'share', 'newsboat', 'cache.db'),
        path.join(home, '.newsboat', 'cache.db'),
        path.join(home, 'snap', 'newsboat', 'common', '.newsboat', 'cache.db'),
        path.join(home, 'snap', 'newsboat', 'current', '.newsboat', 'cache.db'),
        path.join(home, 'snap', 'newsboat', 'common', '.local', 'share', 'newsboat', 'cache.db')
    ];

    console.log("Searching for cache.db in these locations:");
    for (const p of paths) {
        console.log(` - Checking: ${p}`);
        if (fs.existsSync(p)) {
            console.log(` >> FOUND: ${p}`);
            return p;
        }
    }
    throw new Error('Newsboat cache.db not found! Please ensure Newsboat is initialized.');
}

const dbPath = findDbPath();
const db = new Database(dbPath, { readonly: false }); 

app.use(express.static('public'));
app.use(express.json());

// ==========================================
//    CRAWLER & QUEUE SYSTEM
// ==========================================

// Reduced concurrency to prevent "Execution Context Destroyed" due to OOM
const MAX_CONCURRENT = 5; 
let activeCrawls = 0;
const queue = []; 
const processing = new Map(); 
let globalBrowser = null;

// --- Browser Singleton ---
async function getBrowser() {
    if (globalBrowser && globalBrowser.isConnected()) {
        return globalBrowser;
    }

    console.log("Launching Shared Browser Instance...");
    globalBrowser = await puppeteer.launch({
        headless: "new",
        executablePath: '/usr/bin/google-chrome-stable',
        args: [
            '--no-sandbox', '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage', '--disable-gpu', 
            '--window-size=1920,1080', 
            '--disable-extensions', '--disable-component-update', '--disable-background-networking'
        ]
    });

    globalBrowser.on('disconnected', () => {
        console.log("Browser disconnected.");
        globalBrowser = null;
    });

    return globalBrowser;
}

function generateFilename(url) {
    return crypto.createHash('md5').update(url).digest('hex');
}

async function autoScroll(page) {
    try {
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 100;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    if(totalHeight >= scrollHeight - window.innerHeight){
                        clearInterval(timer);
                        resolve();
                    }
                }, 50);
            });
        });
    } catch (e) {
        console.warn("AutoScroll interrupted (navigation occurred?), proceeding...", e.message);
    }
}

// --- Core Crawl Logic ---
async function performCrawl(url, force = false) {
    const fileBase = generateFilename(url);
    const jpgPath = path.join(ASSETS_DIR, `${fileBase}.jpg`);
    const mdPath = path.join(ASSETS_DIR, `${fileBase}.md`);
    const htmlPath = path.join(ASSETS_DIR, `${fileBase}.html`);

    // 1. Manifest / Cache Check
    const manifest = getManifest();
    const entry = manifest[url];
    
    if (!force && entry && entry.status === 'completed') {
        if (checkAssetsExist(entry.fileBase)) {
            console.log(`[Cache Hit] ${url}`);
            const imgBuffer = fs.readFileSync(jpgPath);
            const mdContent = fs.readFileSync(mdPath, 'utf8');
            return {
                success: true,
                image: `data:image/jpeg;base64,${imgBuffer.toString('base64')}`,
                markdown: mdContent,
                cached: true
            };
        } else {
            console.log(`[Cache Miss] Files missing for ${url}, re-crawling.`);
        }
    }

    console.log(`[Crawl Start] ${url}`);
    updateManifestEntry(url, { status: 'processing' });
    
    let page = null;
    try {
        const browser = await getBrowser();
        page = await browser.newPage();

        // Safe Resource Blocking
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['font', 'media', 'texttrack', 'object', 'beacon', 'csp_report', 'imageset'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1920, height: 1080 });

        // Robust Navigation
        try {
            // networkidle2 is more stable for redirects than domcontentloaded
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
        } catch (e) {
            console.warn(`Navigation warning for ${url}: ${e.message}`);
        }
        
        await new Promise(r => setTimeout(r, 1500));
        await autoScroll(page);
        await new Promise(r => setTimeout(r, 500));

        // Clean DOM (Wrapped in try/catch to prevent context crashes)
        try {
            await page.evaluate(() => {
                document.documentElement.style.overflow = 'auto';
                document.body.style.overflow = 'auto';
                const junk = ['#onetrust-consent-sdk', '.onetrust-pc-dark-filter', '#onetrust-banner-sdk', '#acc-alert', '#cybotCookiebotDialog', '#cookie-banner', '.cookie-banner', 'div[class*="cookie"]', 'div[class*="consent"]'];
                junk.forEach(sel => document.querySelectorAll(sel).forEach(el => el.remove()));
                document.querySelectorAll('body *').forEach(el => {
                    const s = window.getComputedStyle(el);
                    if (s.position === 'fixed' || s.position === 'sticky') el.remove();
                });
                document.querySelectorAll('img').forEach(img => {
                    const real = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-lazy-src');
                    if (real) img.src = real.split(' ')[0];
                    if (img.src) img.src = img.src; 
                });
                document.querySelectorAll('a').forEach(a => { if (a.href) a.href = a.href; });
            });
        } catch (e) {
            console.warn(`DOM Cleaning skipped due to context loss: ${e.message}`);
        }

        const fullHtml = await page.content();
        const virtualConsole = new VirtualConsole();
        virtualConsole.sendTo(console, { omitJSDOMErrors: true });
        
        const doc = new JSDOM(fullHtml, { url, virtualConsole });
        const reader = new Readability(doc.window.document, { charThreshold: 0, keepClasses: true });
        const article = reader.parse();
        
        let markdownContent = "";
        if (article) {
            const turndownService = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
            markdownContent = `# ${article.title}\n\n`;
            if (article.byline) markdownContent += `*By ${article.byline}*\n\n`;
            markdownContent += `---\n\n${turndownService.turndown(article.content)}`;
        } else {
            markdownContent = "> **Error:** Could not extract text. View Screenshot.";
        }

        const screenshotBuffer = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 75 });

        fs.writeFileSync(jpgPath, screenshotBuffer);
        fs.writeFileSync(mdPath, markdownContent);
        fs.writeFileSync(htmlPath, fullHtml);

        // Update Manifest Success
        updateManifestEntry(url, { 
            status: 'completed', 
            fileBase: fileBase,
            title: article ? article.title : 'Unknown'
        });

        console.log(`[Crawl Done] ${url}`);
        return {
            success: true,
            image: `data:image/jpeg;base64,${screenshotBuffer.toString('base64')}`,
            markdown: markdownContent,
            cached: false
        };

    } catch (error) {
        console.error(`[Crawl Fail] ${url}: ${error.message}`);
        updateManifestEntry(url, { status: 'failed', error: error.message });
        throw error;
    } finally {
        if (page) try { await page.close(); } catch(e) {}
    }
}

// --- Queue Management ---

function enqueueCrawl(url, priority = false, force = false) {
    return new Promise((resolve, reject) => {
        if (processing.has(url)) {
            console.log(`[Queue] Attaching to running task: ${url}`);
            processing.get(url).then(resolve).catch(reject);
            return;
        }

        const existingIdx = queue.findIndex(t => t.url === url);
        if (existingIdx !== -1) {
            const task = queue[existingIdx];
            task.resolvers.push(resolve);
            task.rejecters.push(reject);
            if (priority && !task.priority) {
                console.log(`[Queue] Promoting to Priority: ${url}`);
                task.priority = true;
                queue.splice(existingIdx, 1);
                queue.unshift(task); 
            }
            return;
        }

        const task = {
            url,
            force,
            priority,
            resolvers: [resolve],
            rejecters: [reject]
        };

        if (priority) {
            console.log(`[Queue] Added Priority: ${url}`);
            queue.unshift(task);
        } else {
            queue.push(task);
        }

        // Mark in manifest as queued if not already
        const m = getManifest();
        if (!m[url] || m[url].status !== 'processing') {
            updateManifestEntry(url, { status: 'queued' });
        }

        processQueue();
    });
}

function processQueue() {
    if (activeCrawls >= MAX_CONCURRENT || queue.length === 0) return;

    const task = queue.shift();
    activeCrawls++;

    const promise = performCrawl(task.url, task.force);
    processing.set(task.url, promise);

    promise
        .then(result => {
            task.resolvers.forEach(r => r(result));
        })
        .catch(error => {
            const msg = { error: error.message };
            task.rejecters.forEach(r => r(msg)); 
        })
        .finally(() => {
            activeCrawls--;
            processing.delete(task.url);
            processQueue(); 
        });
}

// --- Background Loader (Manifest Reconciler) ---
function startBackgroundCrawler() {
    console.log("[Background] Reconciling Manifest with Database...");
    try {
        const rows = db.prepare("SELECT url FROM rss_item WHERE unread = 1 ORDER BY pubDate DESC").all();
        const manifest = getManifest();
        
        let queuedCount = 0;
        
        for (const row of rows) {
            const url = row.url;
            let needsCrawl = false;
            
            if (!manifest[url]) {
                console.log(`[Manifest] New entry found: ${url}`);
                needsCrawl = true;
            } else {
                const entry = manifest[url];
                if (entry.status === 'completed') {
                    if (!checkAssetsExist(entry.fileBase)) {
                        console.log(`[Manifest] Asset missing for ${url}, re-queueing.`);
                        needsCrawl = true;
                    }
                } else if (entry.status === 'failed' || entry.status === 'queued') {
                    needsCrawl = true;
                }
            }

            if (needsCrawl) {
                enqueueCrawl(url, false, false).catch(() => {});
                queuedCount++;
            }
        }
        console.log(`[Background] Queued ${queuedCount} articles for sync.`);
    } catch (e) {
        console.error("[Background Error]", e);
    }
}

// ==========================================
//    API ROUTES
// ==========================================

app.get('/api/feeds', (req, res) => {
    try {
        const stmt = db.prepare('SELECT rssurl, title, unread_count FROM rss_feed ORDER BY title ASC');
        res.json(stmt.all());
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/articles', (req, res) => {
    const showAll = req.query.all === 'true';
    const limit = parseInt(req.query.limit) || 50;
    const sql = `SELECT id, title, url, content, pubDate, author, unread, feedurl FROM rss_item ${showAll ? '' : 'WHERE unread = 1'} ORDER BY pubDate DESC LIMIT ?`;
    try {
        res.json(db.prepare(sql).all(limit));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/articles/:id/read', (req, res) => {
    try {
        const info = db.prepare('UPDATE rss_item SET unread = 0 WHERE id = ?').run(req.params.id);
        res.json({ success: true, changes: info.changes });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/cache', (req, res) => {
    const { url } = req.query;
    if (!url) return res.json({ cached: false });
    
    // Efficient Manifest Lookup
    const manifest = getManifest();
    const entry = manifest[url];
    
    if (entry && entry.status === 'completed') {
        if (checkAssetsExist(entry.fileBase)) {
            return res.json({ cached: true });
        }
    }
    return res.json({ cached: false });
});

// NEW: Live Status Monitor Endpoint
app.get('/api/status', (req, res) => {
    const manifest = getManifest();
    const values = Object.values(manifest);
    
    const stats = {
        queueLength: queue.length,
        activeCrawls: activeCrawls,
        totalCached: values.filter(e => e.status === 'completed').length,
        totalFailed: values.filter(e => e.status === 'failed').length
    };
    res.json(stats);
});

app.post('/api/crawl', async (req, res) => {
    const { url, force } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    try {
        const result = await enqueueCrawl(url, true, force);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.error || error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    setTimeout(startBackgroundCrawler, 3000);
});

process.on('SIGINT', async () => {
    if (globalBrowser) await globalBrowser.close();
    process.exit();
});
