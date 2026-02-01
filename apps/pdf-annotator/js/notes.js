import { DOM } from './config.js';
import { state } from './state.js'; // This must match the export above
import { normalize, denormalize } from './utils.js';

let dragState = {
    id: null,
    isDragging: false,
    dragOffsetX: 0,
    dragOffsetY: 0,
    initialX: 0,
    initialY: 0
};

export function initNoteListeners() {
    DOM.canvasDraw.addEventListener('mousedown', (e) => {
        if (state.tool === 'note') {
            createNote(e.offsetX, e.offsetY);
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (!dragState.isDragging || !dragState.id) return;
        
        const rect = DOM.canvasDraw.getBoundingClientRect();
        let x = e.clientX - rect.left - dragState.dragOffsetX;
        let y = e.clientY - rect.top - dragState.dragOffsetY;
        
        updateElementPosition(dragState.id, x, y);
    });

    window.addEventListener('mouseup', (e) => {
        if (dragState.isDragging) {
            const rect = DOM.canvasDraw.getBoundingClientRect();
            let finalX = e.clientX - rect.left - dragState.dragOffsetX;
            let finalY = e.clientY - rect.top - dragState.dragOffsetY;
            
            const dist = Math.abs(finalX - dragState.initialX) + Math.abs(finalY - dragState.initialY);

            if (dist > 5) {
                const n = normalize(finalX, finalY);
                const pageData = state.getPageData(state.pageNum);
                const note = pageData.notes.find(n => n.id === dragState.id);
                if (note) {
                    note.nx = n.x;
                    note.ny = n.y;
                }
                state.saveToLocalStorage();
            }

            dragState.isDragging = false;
            dragState.id = null;
            document.body.style.cursor = 'default';
        }
    });
}

function updateElementPosition(id, x, y) {
    const floatEl = document.getElementById('note-wrap-' + id);
    if (floatEl) { floatEl.style.left = x + 'px'; floatEl.style.top = y + 'px'; }
    const pinEl = document.getElementById('note-pin-' + id);
    if (pinEl) { pinEl.style.left = x + 'px'; pinEl.style.top = y + 'px'; }
}

function startDrag(e, noteId, isPin = false) {
    e.stopPropagation();
    state.pushHistory();

    dragState.isDragging = true;
    dragState.id = noteId;
    
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    
    if (isPin) {
        dragState.dragOffsetX = 0; 
        dragState.dragOffsetY = 0; 
    } else {
        dragState.dragOffsetX = e.clientX - rect.left;
        dragState.dragOffsetY = e.clientY - rect.top;
    }
    
    const canvasRect = DOM.canvasDraw.getBoundingClientRect();
    dragState.initialX = e.clientX - canvasRect.left - dragState.dragOffsetX;
    dragState.initialY = e.clientY - canvasRect.top - dragState.dragOffsetY;

    document.body.style.cursor = 'grabbing';
}

export function createNote(x, y) {
    state.pushHistory();

    const pageData = state.getPageData(state.pageNum);
    const n = normalize(x, y);
    const newId = Date.now();
    
    pageData.notes.push({
        id: newId,
        nx: n.x, ny: n.y,
        content: '',
        w: null, h: null
    });
    
    renderNotesUI();
    state.saveToLocalStorage();

    setTimeout(() => {
        const inputEl = document.getElementById('note-input-' + newId);
        if (inputEl) {
            inputEl.focus();
            inputEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, 10);
}

export function renderNotesUI() {
    DOM.notesLayer.innerHTML = '';
    Object.values(DOM.containers).forEach(c => c.innerHTML = '');

    const data = state.getPageData(state.pageNum);
    
    data.notes.forEach((note, idx) => {
        const pos = denormalize(note.nx, note.ny);
        
        const area = document.createElement('textarea');
        area.id = 'note-input-' + note.id;
        area.className = 'note-input';
        area.placeholder = 'Type...';
        area.value = note.content;
        
        if(note.w) area.style.width = note.w;
        if(note.h) area.style.height = note.h;

        if(!note.h && note.content) {
            setTimeout(() => { area.style.height = 'auto'; area.style.height = area.scrollHeight+'px'; },0);
        }

        area.oninput = (e) => {
            note.content = e.target.value;
            if(!note.h) { e.target.style.height='auto'; e.target.style.height=e.target.scrollHeight+'px'; }
        };
        
        area.onmouseup = () => {
            if(area.style.width || area.style.height) {
                note.w = area.style.width; 
                note.h = area.style.height;
                state.saveToLocalStorage();
            }
        };
        area.onmousedown = e => e.stopPropagation();

        const btnDel = document.createElement('button');
        btnDel.className = 'btn-icon';
        btnDel.innerHTML = '<i class="fas fa-times"></i>';
        btnDel.onmousedown = (e) => { 
            e.stopPropagation();
            if(confirm("Delete note?")) {
                state.pushHistory();
                data.notes.splice(idx, 1); 
                renderNotesUI(); 
                state.saveToLocalStorage();
            }
        };

        if (state.layout === 'floating') {
            const wrap = document.createElement('div');
            wrap.id = 'note-wrap-' + note.id;
            wrap.className = 'sticky-note-floating';
            wrap.style.left = pos.x + 'px';
            wrap.style.top = pos.y + 'px';
            
            const head = document.createElement('div');
            head.className = 'header-row';
            head.style.cursor = 'grab';
            head.innerHTML = `<span>#${idx+1}</span>`;
            head.appendChild(btnDel);
            
            head.onmousedown = (e) => startDrag(e, note.id, false);
            
            wrap.appendChild(head);
            wrap.appendChild(area);
            DOM.notesLayer.appendChild(wrap);
        } else {
            const pin = document.createElement('div');
            pin.id = 'note-pin-' + note.id;
            pin.className = 'note-marker';
            pin.style.left = pos.x + 'px';
            pin.style.top = pos.y + 'px';
            pin.innerText = idx + 1;
            
            pin.onmousedown = (e) => {
                if(e.button === 0) startDrag(e, note.id, true);
            };

            pin.onclick = (e) => {
                 const targetInput = document.getElementById('note-input-' + note.id);
                 if(targetInput) {
                     targetInput.scrollIntoView({behavior:'smooth', block: 'center'});
                     targetInput.focus();
                 }
            };

            DOM.notesLayer.appendChild(pin);

            const card = document.createElement('div');
            card.className = 'docked-note-card';
            card.id = 'nc-'+note.id;
            
            const head = document.createElement('div');
            head.className = 'header-row';
            head.innerHTML = `<b>Note #${idx+1}</b>`;
            head.appendChild(btnDel);
            card.appendChild(head);
            card.appendChild(area);
            DOM.containers[state.layout].appendChild(card);
        }
    });
}
