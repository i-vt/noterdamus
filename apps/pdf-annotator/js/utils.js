import { DOM } from './config.js';

export function normalize(x, y) {
    return {
        x: x / DOM.canvasDraw.width,
        y: y / DOM.canvasDraw.height
    };
}

export function denormalize(nX, nY) {
    return {
        x: nX * DOM.canvasDraw.width,
        y: nY * DOM.canvasDraw.height
    };
}

export function getFitScale(page) {
    const vp = page.getViewport({scale: 1.0});
    const pad = 40; // padding
    const availW = DOM.viewport.clientWidth - pad;
    const availH = DOM.viewport.clientHeight - pad;
    
    const scaleW = availW / vp.width;
    const scaleH = availH / vp.height;
    
    return Math.min(scaleW, scaleH);
}
