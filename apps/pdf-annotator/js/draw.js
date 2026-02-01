import { DOM } from './config.js';
import { state } from './state.js';
import { normalize, denormalize } from './utils.js';

const ctx = DOM.canvasDraw.getContext('2d');
let isDrawing = false;
let currentPath = null;

export function initDrawListeners() {
    DOM.canvasDraw.addEventListener('mousedown', startDraw);
    DOM.canvasDraw.addEventListener('mousemove', moveDraw);
    DOM.canvasDraw.addEventListener('mouseup', endDraw);
    DOM.canvasDraw.addEventListener('mouseout', endDraw);
}

function startDraw(e) {
    if (state.tool !== 'draw' && state.tool !== 'eraser') return;
    
    // Save history before modifying
    state.pushHistory();

    isDrawing = true;
    
    // If Eraser, we don't start a path, we just delete
    if (state.tool === 'eraser') {
        eraseAt(e.offsetX, e.offsetY);
        return;
    }

    // Drawing Logic
    const n = normalize(e.offsetX, e.offsetY);
    const pageData = state.getPageData(state.pageNum);
    const style = state.getCurrentStrokeStyle();

    currentPath = {
        color: state.penColor,
        width: style.width,
        opacity: style.opacity,
        isHighlighter: state.isHighlighter,
        points: [n]
    };
    
    pageData.drawings.push(currentPath);
    redrawCanvas();
}

function moveDraw(e) {
    if (!isDrawing) return;

    if (state.tool === 'eraser') {
        eraseAt(e.offsetX, e.offsetY);
        return;
    }

    if (!currentPath) return;

    const n = normalize(e.offsetX, e.offsetY);
    currentPath.points.push(n);
    redrawCanvas();
}

function endDraw() {
    isDrawing = false;
    currentPath = null;
}

// --- ERASER LOGIC ---
// Removes the ENTIRE stroke if the mouse touches any point of it.
function eraseAt(cx, cy) {
    const pageData = state.getPageData(state.pageNum);
    const eraserRadius = 15; // Detection radius in pixels
    
    let changed = false;

    // Iterate backwards so we can splice safely
    for (let i = pageData.drawings.length - 1; i >= 0; i--) {
        const path = pageData.drawings[i];
        let hit = false;
        
        // Check collision with path points
        // Optimisation: Step by 2 or 3 to speed up big paths
        for (let j = 0; j < path.points.length; j += 2) {
            const p = denormalize(path.points[j].x, path.points[j].y);
            const dx = cx - p.x;
            const dy = cy - p.y;
            
            // Simple distance check
            if (dx*dx + dy*dy < eraserRadius * eraserRadius) {
                hit = true;
                break;
            }
        }

        if (hit) {
            pageData.drawings.splice(i, 1);
            changed = true;
        }
    }

    if (changed) {
        redrawCanvas();
        state.saveToLocalStorage(); // Ensure auto-save captures erasure
    }
}

export function redrawCanvas() {
    ctx.clearRect(0, 0, DOM.canvasDraw.width, DOM.canvasDraw.height);
    const data = state.getPageData(state.pageNum);
    
    if (data.drawings) {
        data.drawings.forEach(path => {
            if(path.points.length < 1) return;
            
            ctx.beginPath();
            ctx.strokeStyle = path.color;
            ctx.lineWidth = path.width;
            ctx.globalAlpha = path.opacity;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            const start = denormalize(path.points[0].x, path.points[0].y);
            ctx.moveTo(start.x, start.y);
            
            for (let i = 1; i < path.points.length; i++) {
                const p = denormalize(path.points[i].x, path.points[i].y);
                ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
        });
        ctx.globalAlpha = 1.0;
    }
}
