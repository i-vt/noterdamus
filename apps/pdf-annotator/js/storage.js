import { DOM } from './config.js';
import { state } from './state.js';
import { renderPage } from './render.js';

// --- Session (JSON) ---
export function exportData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.annotations));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = "notes_session.json";
    a.click();
}

export function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            state.annotations = JSON.parse(ev.target.result);
            renderPage();
            alert('Session Loaded');
        } catch(err) {
            console.error(err);
            alert('Invalid JSON');
        }
    };
    reader.readAsText(file);
}

export function loadFromLocalStorage() {
    const saved = localStorage.getItem('pdf_annotator_session');
    if (saved) {
        try {
            state.annotations = JSON.parse(saved);
            console.log("Restored session");
            return true;
        } catch (e) {
            return false;
        }
    }
    return false;
}

// --- Hash & Backup Utilities (Secure + Fallback) ---

export async function calculatePDFHash(uint8Array) {
    // 1. Try to use the modern Web Crypto API (Secure Contexts only)
    if (window.crypto && window.crypto.subtle) {
        try {
            const hashBuffer = await crypto.subtle.digest('SHA-256', uint8Array);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {
            console.warn("Crypto API failed, falling back...", e);
        }
    }

    // 2. Fallback for Insecure Contexts (HTTP on LAN)
    console.warn("crypto.subtle not available. Using insecure fallback hash.");
    let hash = 0x811c9dc5;
    const len = uint8Array.length;
    const step = len > 100000 ? Math.floor(len / 10000) : 1; 

    for (let i = 0; i < len; i += step) {
        hash ^= uint8Array[i];
        hash = Math.imul(hash, 0x01000193);
    }
    
    return "fallback-" + (hash >>> 0).toString(16) + "-len" + len;
}

export function cleanupBackups() {
    const retentionPeriod = 72 * 60 * 60 * 1000; // 72 hours in ms
    const cutoff = Date.now() - retentionPeriod;
    
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('backup_')) {
            try {
                const item = JSON.parse(localStorage.getItem(key));
                if (item.timestamp && item.timestamp < cutoff) {
                    localStorage.removeItem(key);
                    console.log(`Removed expired backup: ${key}`);
                }
            } catch (e) {
                localStorage.removeItem(key);
            }
        }
    });
}

// --- Image Export ---
export async function exportCurrentPageImage() {
    if (!state.pdfDoc) return alert("No PDF loaded");

    const pageNum = state.pageNum;
    const pageData = state.getPageData(pageNum);
    const hasNotes = pageData.notes && pageData.notes.length > 0;

    const page = await state.pdfDoc.getPage(pageNum);
    const scale = 2.0; 
    const viewport = page.getViewport({ scale: scale });

    let notesAreaHeight = 0;
    const padding = 20 * scale;
    const fontSize = 12 * scale;
    const lineHeight = 16 * scale;
    const noteSpacing = 12 * scale;
    
    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d');
    measureCtx.font = `${fontSize}px sans-serif`;

    const noteLayouts = []; 

    if (hasNotes) {
        notesAreaHeight += padding; 
        
        pageData.notes.forEach((note, idx) => {
            const label = `Note #${idx + 1}: `;
            const text = note.content || "(Empty)";
            const fullText = label + text;
            
            const maxWidth = viewport.width - (padding * 2);
            
            // Split by paragraphs first to preserve newlines
            const paragraphs = fullText.split('\n');
            const lines = [];

            paragraphs.forEach(paragraph => {
                const words = paragraph.split(' ');
                let line = '';
                
                for (let n = 0; n < words.length; n++) {
                    const testLine = line + words[n] + ' ';
                    const metrics = measureCtx.measureText(testLine);
                    if (metrics.width > maxWidth && line !== '') {
                        lines.push(line);
                        line = words[n] + ' ';
                    } else {
                        line = testLine;
                    }
                }
                lines.push(line);
            });
            
            const h = (lines.length * lineHeight) + noteSpacing;
            noteLayouts.push({ lines: lines, height: h });
            notesAreaHeight += h;
        });
        
        notesAreaHeight += padding;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = viewport.width;
    canvas.height = viewport.height + notesAreaHeight;

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;

    // Draw markers/strokes
    drawAnnotationsOnCanvas(ctx, pageData, canvas.width, viewport.height);

    if (hasNotes) {
        let currentY = viewport.height + padding;
        
        ctx.beginPath();
        ctx.moveTo(padding, viewport.height);
        ctx.lineTo(canvas.width - padding, viewport.height);
        ctx.strokeStyle = "#999999";
        ctx.lineWidth = 1 * scale;
        ctx.stroke();

        ctx.fillStyle = "#000000";
        ctx.font = `${fontSize}px sans-serif`;
        
        // Ensure alignment is left for text blocks
        ctx.textAlign = "left"; 
        ctx.textBaseline = "top";

        noteLayouts.forEach(layout => {
            layout.lines.forEach(l => {
                ctx.fillText(l, padding, currentY);
                currentY += lineHeight;
            });
            currentY += noteSpacing; 
        });
    }

    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `page_${pageNum}_notes.png`;
    a.click();
}

// --- Searchable PDF Export (Fixed: Supports Unicode/Emojis) ---

// Helper to dynamically load fontkit if missing
async function loadFontkit() {
    if (window.fontkit) return;
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error("Could not load fontkit"));
        document.head.appendChild(script);
    });
}

export async function downloadSearchablePDF() {
    if (!state.pdfBytes) return alert("No PDF loaded");

    // 1. Ensure dependencies are loaded
    try {
        await loadFontkit();
    } catch (e) {
        alert("Error: Could not load font engine. Check internet connection.");
        return;
    }

    const { PDFDocument, rgb } = window.PDFLib;
    
    // 2. Load the PDF & Register Fontkit
    const pdfDoc = await PDFDocument.load(state.pdfBytes);
    pdfDoc.registerFontkit(window.fontkit);

    // 3. Fetch and Embed a Unicode Font (Ubuntu-R)
    // This supports many languages and prevents the 'WinAnsi' crash for emojis.
    // Note: To support CJK (Chinese/Japanese) specifically, replace this URL with a CJK font (e.g. Noto Sans SC).
    let font;
    try {
        const fontBytes = await fetch('https://pdf-lib.js.org/assets/ubuntu/Ubuntu-R.ttf').then(res => res.arrayBuffer());
        font = await pdfDoc.embedFont(fontBytes);
    } catch (e) {
        console.warn("Custom font fetch failed. Falling back to Helvetica (may crash on special chars).");
        font = await pdfDoc.embedFont(window.PDFLib.StandardFonts.Helvetica);
    }

    const fontSize = 10;
    const lineHeight = 12;
    const padding = 20;

    const pages = pdfDoc.getPages();

    for (let i = 0; i < pages.length; i++) {
        const pageNum = i + 1;
        const data = state.getPageData(pageNum);
        const page = pages[i];
        
        // Get ORIGINAL size before modification
        const { width, height } = page.getSize();
        
        const hasNotes = data.notes && data.notes.length > 0;
        
        // 4. Calculate Footer Content
        let footerHeight = 0;
        let noteLines = [];

        if (hasNotes) {
            noteLines.push({ text: "Notes:", isHeader: true });
            footerHeight += lineHeight + 5;

            for (let nIdx = 0; nIdx < data.notes.length; nIdx++) {
                const note = data.notes[nIdx];
                
                // Replace tabs with spaces (tabs still cause measurement issues)
                // We NO LONGER strip emojis or foreign characters.
                const safeText = (note.content || "(No content)").replace(/\t/g, '    ');
                const content = `[${nIdx + 1}] ${safeText}`;
                
                const paragraphs = content.split('\n');
                
                for (const paragraph of paragraphs) {
                    const words = paragraph.split(' ');
                    let line = '';
                    
                    for (const word of words) {
                        const testLine = line + word + ' ';
                        const widthTest = font.widthOfTextAtSize(testLine, fontSize);
                        
                        if (widthTest > width - 2 * padding) {
                            noteLines.push({ text: line });
                            footerHeight += lineHeight;
                            line = word + ' ';
                        } else {
                            line = testLine;
                        }
                    }
                    noteLines.push({ text: line });
                    footerHeight += lineHeight;
                }
            }
            footerHeight += padding * 2;
        }

        // 5. Expand Page if needed (Modify MediaBox)
        if (footerHeight > 0) {
            const mb = page.getMediaBox();
            
            // Extend downwards (Negative Y)
            const newY = mb.y - footerHeight;
            const newHeight = mb.height + footerHeight;
            
            page.setMediaBox(mb.x, newY, mb.width, newHeight);

            // Draw Divider
            const dividerY = mb.y - 5;
            page.drawLine({
                start: { x: padding, y: dividerY },
                end: { x: width - padding, y: dividerY },
                color: rgb(0.6, 0.6, 0.6),
                thickness: 1
            });

            // Draw Footer Text
            let textY = dividerY - padding;
            for (const lineObj of noteLines) {
                page.drawText(lineObj.text, {
                    x: padding,
                    y: textY,
                    size: fontSize,
                    color: rgb(0, 0, 0),
                    font: font
                });
                textY -= lineHeight;
            }
        }

        // 6. Draw Annotations on top
        drawAnnotationsOnPDF(page, data, width, height, rgb, font);
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'annotated_searchable.pdf';
    link.click();
}

function drawAnnotationsOnPDF(pdfPage, data, w, h, rgb, font) {
    // 1. Strokes
    if (data.drawings) {
        for (const path of data.drawings) {
            if (path.points.length < 2) continue;
            const r = parseInt(path.color.slice(1, 3), 16) / 255;
            const g = parseInt(path.color.slice(3, 5), 16) / 255;
            const b = parseInt(path.color.slice(5, 7), 16) / 255;

            for (let j = 0; j < path.points.length - 1; j++) {
                const p1 = path.points[j];
                const p2 = path.points[j + 1];
                
                pdfPage.drawLine({
                    start: { x: p1.x * w, y: (1 - p1.y) * h },
                    end:   { x: p2.x * w, y: (1 - p2.y) * h },
                    thickness: path.width,
                    color: rgb(r, g, b),
                    opacity: path.opacity
                });
            }
        }
    }

    // 2. Note Pins (Circles + Numbers)
    if (data.notes) {
        for(let idx = 0; idx < data.notes.length; idx++) {
            const note = data.notes[idx];
            const nx = note.nx * w;
            const ny = (1 - note.ny) * h;
            
            // Circle
             pdfPage.drawCircle({
                x: nx, y: ny, size: 10,
                color: rgb(0.31, 0.27, 0.90), // Accent
                borderColor: rgb(1,1,1),
                borderWidth: 2
            });
            
            // Number
            const numStr = (idx+1).toString();
            // Use fallback width if measure fails
            let textWidth = 6;
            try { textWidth = font.widthOfTextAtSize(numStr, 10); } catch(e){}

            pdfPage.drawText(numStr, {
                x: nx - (textWidth/2),
                y: ny - 3.5, 
                size: 10,
                color: rgb(1,1,1),
                font: font
            });
        }
    }
}

// --- Markdown Bundle Export (ZIP) ---
export async function exportMarkdownBundle() {
    if (!state.pdfDoc) return alert("No PDF loaded");
    
    const zip = new JSZip();
    const imgFolder = zip.folder("images");
    
    const bundleUUID = crypto.randomUUID ? crypto.randomUUID() : 'bundle_' + Date.now();
    const totalPages = state.pdfDoc.numPages;
    const paddingLen = totalPages.toString().length;

    let mdContent = `# PDF Notes Export\n**Bundle ID:** ${bundleUUID}\n\n`;
    let hasAnnotations = false;

    for (let i = 1; i <= totalPages; i++) {
        const data = state.getPageData(i);
        if ((!data.drawings || data.drawings.length === 0) && (!data.notes || data.notes.length === 0)) {
            continue;
        }
        
        hasAnnotations = true;
        const paddedPageNum = i.toString().padStart(paddingLen, '0');
        
        mdContent += `## Page ${i}\n\n`;
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const page = await state.pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        await page.render({ canvasContext: ctx, viewport }).promise;
        drawAnnotationsOnCanvas(ctx, data, canvas.width, canvas.height);
        
        const imgBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const imgName = `${bundleUUID}_page_${paddedPageNum}.png`;
        
        imgFolder.file(imgName, imgBlob);
        mdContent += `![Page ${i} Context](images/${imgName})\n\n`;
        
        if (data.notes && data.notes.length > 0) {
            data.notes.forEach((note, idx) => {
                mdContent += `### Note #${idx + 1}\n`;
                mdContent += `> ${note.content.replace(/\n/g, '\n> ')}\n\n`; 
            });
        } else {
            mdContent += "*No text notes (drawings only)*\n\n";
        }
        
        mdContent += "---\n\n";
    }

    if (!hasAnnotations) return alert("No annotations found to export.");

    zip.file("notes.md", mdContent);
    
    zip.generateAsync({type:"blob"}).then(function(content) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `notes_bundle_${bundleUUID}.zip`;
        link.click();
    });
}

// Helper: Visual Rendering on Canvas
function drawAnnotationsOnCanvas(ctx, data, w, h) {
    if (data.drawings) {
        data.drawings.forEach(path => {
            if(path.points.length < 1) return;
            ctx.beginPath();
            ctx.strokeStyle = path.color;
            ctx.lineWidth = path.width * (w / DOM.canvasDraw.width); 
            ctx.globalAlpha = path.opacity;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            const p0 = path.points[0];
            ctx.moveTo(p0.x * w, p0.y * h);
            for (let i = 1; i < path.points.length; i++) {
                const p = path.points[i];
                ctx.lineTo(p.x * w, p.y * h);
            }
            ctx.stroke();
        });
        ctx.globalAlpha = 1.0;
    }

    if (data.notes) {
        data.notes.forEach((note, idx) => {
            const x = note.nx * w;
            const y = note.ny * h;
            
            // Circle
            ctx.beginPath();
            ctx.arc(x, y, 15, 0, 2 * Math.PI);
            ctx.fillStyle = "#4f46e5"; 
            ctx.fill();
            ctx.strokeStyle = "white";
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Number
            ctx.fillStyle = "white";
            ctx.font = "bold 14px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(idx + 1, x, y);
        });
    }
}
