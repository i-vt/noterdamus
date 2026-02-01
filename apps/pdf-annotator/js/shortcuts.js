import { DOM } from './config.js';
import { state } from './state.js';

export function initShortcuts() {
    // Modal Toggle
    if (DOM.btnShortcuts && DOM.shortcutsModal) {
        DOM.btnShortcuts.onclick = () => DOM.shortcutsModal.classList.remove('hidden');
        DOM.btnCloseShortcuts.onclick = () => DOM.shortcutsModal.classList.add('hidden');
        
        DOM.shortcutsModal.onclick = (e) => {
            if (e.target === DOM.shortcutsModal) DOM.shortcutsModal.classList.add('hidden');
        };
    }

    // Keyboard Listener
    window.addEventListener('keydown', (e) => {
        // Ignore if user is typing in a note
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.isContentEditable) return;

        const key = e.key.toLowerCase();
        
        // Tool Shortcuts
        if (key === 's') document.getElementById('btn-select')?.click();
        if (key === 'd') document.getElementById('btn-draw')?.click();
        if (key === 'e') document.getElementById('btn-eraser')?.click();
        if (key === 'n') document.getElementById('btn-note')?.click();
        if (key === 'h') DOM.btnHighlighter?.click();

        // Page Navigation
        if (e.key === 'ArrowLeft' || key === 'b') DOM.btnPrev?.click();
        if (e.key === 'ArrowRight' || key === 'f') DOM.btnNext?.click();

        // Undo / Redo
        if ((e.ctrlKey || e.metaKey) && key === 'z') {
            if (e.shiftKey) DOM.btnRedo?.click();
            else DOM.btnUndo?.click();
            e.preventDefault();
        }

        // Close modal
        if (e.key === 'Escape' && DOM.shortcutsModal && !DOM.shortcutsModal.classList.contains('hidden')) {
            DOM.shortcutsModal.classList.add('hidden');
        }
    });

    // Scroll Wheel Navigation
    let lastScrollTime = 0;
    const SCROLL_DELAY = 400; 

    DOM.viewport.addEventListener('wheel', (e) => {
        if (e.ctrlKey) return; 

        const now = Date.now();
        if (now - lastScrollTime < SCROLL_DELAY) return;

        const el = DOM.viewport;
        const isAtTop = el.scrollTop <= 0;
        const isAtBottom = Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) <= 2;

        if (e.deltaY > 0 && isAtBottom) {
            // Next Page
            if (state.pageNum < (state.pdfDoc ? state.pdfDoc.numPages : 0)) {
                DOM.btnNext.click();
                lastScrollTime = now;
            }
        } else if (e.deltaY < 0 && isAtTop) {
            // Prev Page
            if (state.pageNum > 1) {
                DOM.btnPrev.click();
                lastScrollTime = now;
            }
        }
    }, { passive: true });
}
