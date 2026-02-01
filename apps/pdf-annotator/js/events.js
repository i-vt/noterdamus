import { DOM } from './config.js';
import { state } from './state.js';
import { renderPage, renderThumbnails } from './render.js';
import { redrawCanvas } from './draw.js';
import { renderNotesUI } from './notes.js';
import { 
    exportData, importData, downloadSearchablePDF, 
    exportCurrentPageImage, exportMarkdownBundle, 
    calculatePDFHash, cleanupBackups 
} from './storage.js';

export function initGlobalEvents() {
    // 1. File Upload Logic
    if (DOM.btnUpload) DOM.btnUpload.onclick = () => DOM.fileInput.click();

    if (DOM.fileInput) {
        DOM.fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
                const fr = new FileReader();
                fr.onload = async () => {
                    const arr = new Uint8Array(fr.result);
                    const bytesForExport = arr.slice(0); 
                    
                    const hash = await calculatePDFHash(arr);
                    cleanupBackups();

                    pdfjsLib.getDocument(arr).promise.then(doc => {
                        state.setDoc(doc, bytesForExport, hash);
                        
                        // Check for backup
                        const backup = localStorage.getItem('backup_' + hash);
                        if (backup) {
                            try {
                                const parsed = JSON.parse(backup);
                                state.annotations = parsed.data || {};
                                console.log("Notes restored from backup.");
                            } catch (err) {
                                state.annotations = {};
                            }
                        } else {
                            state.annotations = {};
                        }

                        renderPage();
                        renderThumbnails(); 
                    });
                };
                fr.readAsArrayBuffer(file);
            } else { alert("Invalid PDF"); }
            e.target.value = '';
        };
    }

    // 2. View Options
    if (DOM.btnGridView) {
        DOM.btnGridView.onclick = () => {
            DOM.thumbnailSidebar.classList.toggle('hidden');
            DOM.btnGridView.classList.toggle('active');
            setTimeout(triggerResize, 200);
        };
    }

    // 3. Layout Switching
    if(DOM.layoutSelect) {
        DOM.layoutSelect.onchange = (e) => {
            state.layout = e.target.value;
            Object.values(DOM.panels).forEach(p => { if(p) p.classList.remove('active'); });
            
            if(state.layout !== 'floating') {
                const activePanel = DOM.panels[state.layout];
                if(activePanel) activePanel.classList.add('active');
            }
            renderNotesUI();
            setTimeout(triggerResize, 100);
        };
    }

    // 4. Themes & Zoom
    if(DOM.themeBtn) DOM.themeBtn.onclick = () => { state.isDarkMode = !state.isDarkMode; document.body.classList.toggle('dark-mode'); };
    if(DOM.invertBtn) DOM.invertBtn.onclick = () => { state.isInverted = !state.isInverted; DOM.wrapper.classList.toggle('pdf-inverted'); };

    if(DOM.btnFit) DOM.btnFit.onclick = () => { state.toggleAutoFit(true); DOM.btnFit.classList.add('active'); renderPage(); };
    if(document.getElementById('btn-zoom-in')) document.getElementById('btn-zoom-in').onclick = () => { state.toggleAutoFit(false); DOM.btnFit.classList.remove('active'); state.setScale(state.scale * 1.2); renderPage(); };
    if(document.getElementById('btn-zoom-out')) document.getElementById('btn-zoom-out').onclick = () => { state.toggleAutoFit(false); DOM.btnFit.classList.remove('active'); state.setScale(state.scale * 0.8); renderPage(); };

    // 5. Navigation
    if(DOM.btnPrev) DOM.btnPrev.onclick = () => { if(state.pageNum > 1) { state.setPage(state.pageNum - 1); renderPage(); } };
    if(DOM.btnNext) DOM.btnNext.onclick = () => { if(state.pdfDoc && state.pageNum < state.pdfDoc.numPages) { state.setPage(state.pageNum + 1); renderPage(); } };

    // 6. Tools & Pens
    DOM.toolBtns.forEach(btn => {
        btn.onclick = () => {
            DOM.toolBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.setTool(btn.dataset.tool);
            applyToolState();
        };
    });

    DOM.colorSwatches.forEach(swatch => {
        swatch.onclick = () => {
            DOM.colorSwatches.forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            state.setPenColor(swatch.getAttribute('data-color'));
            document.getElementById('btn-draw').click();
        };
    });

    if(DOM.btnHighlighter) {
        DOM.btnHighlighter.onclick = () => {
            state.toggleHighlighter(!state.isHighlighter);
            DOM.btnHighlighter.classList.toggle('active', state.isHighlighter);
            updateSliderUI();
            document.getElementById('btn-draw').click();
        };
    }

    if(DOM.inputSize) DOM.inputSize.oninput = (e) => state.setStrokeWidth(e.target.value);
    if(DOM.inputOpacity) DOM.inputOpacity.oninput = (e) => state.setStrokeOpacity(e.target.value);

    // 7. Undo/Redo/Storage
    if (DOM.btnUndo) DOM.btnUndo.onclick = () => { if (state.undo()) { redrawCanvas(); renderNotesUI(); } };
    if (DOM.btnRedo) DOM.btnRedo.onclick = () => { if (state.redo()) { redrawCanvas(); renderNotesUI(); } };
    
    if(DOM.btnSave) DOM.btnSave.onclick = exportData;
    if(DOM.btnLoad) DOM.btnLoad.onclick = () => DOM.importInput.click();
    if(DOM.importInput) DOM.importInput.onchange = importData;
    if(DOM.btnExportPdf) DOM.btnExportPdf.onclick = downloadSearchablePDF;
    if(DOM.btnExportImage) DOM.btnExportImage.onclick = exportCurrentPageImage;
    if(DOM.btnExportMd) DOM.btnExportMd.onclick = exportMarkdownBundle;

    if(DOM.btnClear) DOM.btnClear.onclick = () => {
        if(confirm('Clear Page?')) {
            state.pushHistory();
            state.annotations[state.pageNum] = {drawings:[], notes:[]};
            redrawCanvas();
            renderNotesUI();
            state.saveToLocalStorage();
        }
    };

    // 8. Resizing
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(triggerResize, 150);
    });
}

// Helpers used internally
export function applyToolState() {
    DOM.canvasDraw.style.pointerEvents = (state.tool === 'select') ? 'none' : 'auto';
    DOM.textLayer.style.pointerEvents = (state.tool === 'select') ? 'auto' : 'none';
    
    if (state.tool === 'eraser') DOM.canvasDraw.style.cursor = 'cell';
    else if (state.tool === 'draw') DOM.canvasDraw.style.cursor = 'crosshair';
    else DOM.canvasDraw.style.cursor = 'default';
}

export function updateSliderUI() {
    const style = state.getCurrentStrokeStyle();
    if(DOM.inputSize) DOM.inputSize.value = style.width;
    if(DOM.inputOpacity) DOM.inputOpacity.value = style.opacity * 100;
}

function triggerResize() {
    if(state.pdfDoc) renderPage();
}
