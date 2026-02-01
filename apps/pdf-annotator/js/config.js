export const DOM = {
    fileInput: document.getElementById('file-input'),
    importInput: document.getElementById('import-input'),
    
    // Viewport & Thumbnails
    viewport: document.getElementById('pdf-viewport'),
    wrapper: document.getElementById('page-wrapper'),
    thumbnailSidebar: document.getElementById('thumbnail-sidebar'),
    canvasPDF: document.getElementById('pdf-render'),
    canvasDraw: document.getElementById('draw-layer'),
    textLayer: document.getElementById('text-layer'),
    notesLayer: document.getElementById('notes-layer'),
    
    // UI Info
    pageNum: document.getElementById('page-num'),
    
    // Buttons
    btnUpload: document.getElementById('btn-upload'),
    btnPrev: document.getElementById('btn-prev'),
    btnNext: document.getElementById('btn-next'),
    btnFit: document.getElementById('btn-fit'),
    btnGridView: document.getElementById('btn-grid-view'),
    
    // History
    btnUndo: document.getElementById('btn-undo'),
    btnRedo: document.getElementById('btn-redo'),

    // Storage
    btnSave: document.getElementById('btn-save'),
    btnLoad: document.getElementById('btn-load'),
    btnExportPdf: document.getElementById('btn-export-pdf'),
    btnExportImage: document.getElementById('btn-export-image'),
    // NEW
    btnExportMd: document.getElementById('btn-export-md'),
    
    // Tools
    btnClear: document.getElementById('btn-clear'),
    
    // Pen Controls
    btnHighlighter: document.getElementById('btn-highlighter'),
    colorSwatches: document.querySelectorAll('.color-swatch'),
    inputSize: document.getElementById('input-size'),
    inputOpacity: document.getElementById('input-opacity'),

    // Toggles
    themeBtn: document.getElementById('btn-theme'),
    invertBtn: document.getElementById('btn-invert'),
    layoutSelect: document.getElementById('layout-select'),
    toolBtns: document.querySelectorAll('.tool-btn'),
    
    // Modal Elements
    btnShortcuts: document.getElementById('btn-shortcuts'),
    shortcutsModal: document.getElementById('shortcuts-modal'),
    btnCloseShortcuts: document.getElementById('btn-close-shortcuts'),

    // Containers
    panels: {
        left: document.getElementById('panel-left'),
        right: document.getElementById('panel-right'),
        top: document.getElementById('panel-top'),
        bottom: document.getElementById('panel-bottom')
    },
    containers: {
        left: document.getElementById('container-left'),
        right: document.getElementById('container-right'),
        top: document.getElementById('container-top'),
        bottom: document.getElementById('container-bottom')
    }
};
