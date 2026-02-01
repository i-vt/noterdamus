import { loadFromLocalStorage } from './storage.js';
import { initDrawListeners } from './draw.js';
import { initNoteListeners } from './notes.js';
import { initGlobalEvents, applyToolState, updateSliderUI } from './events.js';
import { initShortcuts } from './shortcuts.js';

console.log("App Starting...");

// 1. Initialize PDF.js
if (typeof pdfjsLib === 'undefined') {
    alert("CRITICAL ERROR: PDF.js library failed to load.");
} else {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// 2. Initialize Subsystems
initGlobalEvents();     // Buttons, UI, File Loading
initDrawListeners();    // Canvas Drawing interaction
initNoteListeners();    // Note Dragging/Creation interaction
initShortcuts();        // Keyboard & Scroll

// 3. Set Initial State
updateSliderUI();
applyToolState();
loadFromLocalStorage(); // Restore previous session if available
