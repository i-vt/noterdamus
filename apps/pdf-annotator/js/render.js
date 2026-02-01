import { DOM } from './config.js';
import { state } from './state.js';
import { getFitScale } from './utils.js';
import { redrawCanvas } from './draw.js';
import { renderNotesUI } from './notes.js';

// --- NEW: Track the active render task ---
let renderTask = null;

export function renderPage() {
    if (!state.pdfDoc) return;

    // 1. Cancel previous render if it's still running
    if (renderTask) {
        renderTask.cancel();
        renderTask = null;
    }

    state.pdfDoc.getPage(state.pageNum).then(page => {
        // 2. Calculate Scale
        if (state.isAutoFit) {
            state.scale = getFitScale(page);
        }

        const viewport = page.getViewport({ scale: state.scale });

        // Update CSS for text alignment
        DOM.wrapper.style.setProperty('--scale-factor', state.scale);

        // Resize Canvases
        [DOM.canvasPDF, DOM.canvasDraw].forEach(c => {
            c.width = viewport.width;
            c.height = viewport.height;
        });

        DOM.wrapper.style.width = viewport.width + 'px';
        DOM.wrapper.style.height = viewport.height + 'px';
        DOM.textLayer.style.width = viewport.width + 'px';
        DOM.textLayer.style.height = viewport.height + 'px';

        const ctx = DOM.canvasPDF.getContext('2d');
        const renderCtx = { canvasContext: ctx, viewport: viewport };
        
        // 3. Start New Render Task & Save Reference
        renderTask = page.render(renderCtx);

        // 4. Handle Completion
        renderTask.promise.then(() => {
            renderTask = null; // Clear task when done
            DOM.pageNum.textContent = `${state.pageNum} / ${state.pdfDoc.numPages}`;
            
            // Restore Annotations
            redrawCanvas();
            renderNotesUI();
            updateThumbnails(); 
        }).catch(err => {
            // Ignore "cancelled" errors, report others
            if (err.name !== 'RenderingCancelledException') {
                console.error("Render Error:", err);
            }
        });

        // 5. Render Text Layer (Independent)
        DOM.textLayer.innerHTML = '';
        page.getTextContent().then(textContent => {
            pdfjsLib.renderTextLayer({
                textContentSource: textContent,
                container: DOM.textLayer,
                viewport: viewport,
                textDivs: []
            });
        });
    });
}

// --- Generate Thumbnails ---
export async function renderThumbnails() {
    DOM.thumbnailSidebar.innerHTML = ''; 
    
    // Performance: Only render first 10 pages initially if document is huge
    const maxThumbs = Math.min(state.pdfDoc.numPages, 50);

    for (let i = 1; i <= maxThumbs; i++) {
        const page = await state.pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 0.2 }); 
        
        const card = document.createElement('div');
        card.className = 'thumbnail-card';
        if (i === state.pageNum) card.classList.add('active');
        card.id = `thumb-${i}`;
        
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        const ctx = canvas.getContext('2d');
        
        // Note: We don't need to cancel thumbnail renders as they are unique canvases
        await page.render({ canvasContext: ctx, viewport }).promise;
        
        const label = document.createElement('div');
        label.className = 'thumbnail-label';
        label.innerText = `Page ${i}`;
        
        card.appendChild(canvas);
        card.appendChild(label);
        
        card.onclick = () => {
            state.setPage(i);
            renderPage();
        };
        
        DOM.thumbnailSidebar.appendChild(card);
    }
}

function updateThumbnails() {
    if(!DOM.thumbnailSidebar) return;
    document.querySelectorAll('.thumbnail-card').forEach(c => c.classList.remove('active'));
    const active = document.getElementById(`thumb-${state.pageNum}`);
    if (active) {
        active.classList.add('active');
        active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}
