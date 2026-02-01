export const state = {
    pdfDoc: null,
    pdfBytes: null, 
    pdfHash: null, // NEW: Store hash of current PDF
    pageNum: 1,
    scale: 1.0,
    isAutoFit: true,
    tool: 'select', 
    layout: 'floating',
    isDarkMode: false,
    isInverted: false,
    
    // Drawing Config
    penColor: '#000000',
    isHighlighter: false,
    penSettings: { width: 2, opacity: 1.0 },
    highlighterSettings: { width: 20, opacity: 0.5 },

    // Data Store
    annotations: {},
    
    // History
    history: {},
    redoStack: {},

    // --- METHODS ---
    setDoc(doc, bytes, hash = null) { 
        this.pdfDoc = doc; 
        this.pdfBytes = bytes; 
        this.pdfHash = hash;
        this.pageNum = 1; 
    },
    setPage(num) { this.pageNum = num; },
    setScale(s) { this.scale = s; },
    toggleAutoFit(val) { this.isAutoFit = val; },
    setTool(t) { this.tool = t; },
    
    setPenColor(c) { this.penColor = c; },
    toggleHighlighter(isActive) { this.isHighlighter = isActive; },

    setStrokeWidth(w) {
        if(this.isHighlighter) this.highlighterSettings.width = parseInt(w);
        else this.penSettings.width = parseInt(w);
    },
    setStrokeOpacity(val) {
        const alpha = parseInt(val) / 100;
        if(this.isHighlighter) this.highlighterSettings.opacity = alpha;
        else this.penSettings.opacity = alpha;
    },

    getCurrentStrokeStyle() {
        if(this.isHighlighter) return this.highlighterSettings;
        return this.penSettings;
    },

    getPageData(pNum) {
        if (!this.annotations[pNum]) {
            this.annotations[pNum] = { drawings: [], notes: [] };
        }
        return this.annotations[pNum];
    },

    // --- HISTORY ---
    pushHistory() {
        const p = this.pageNum;
        if (!this.history[p]) this.history[p] = [];
        if (!this.redoStack[p]) this.redoStack[p] = [];
        
        const currentData = JSON.parse(JSON.stringify(this.getPageData(p)));
        if (this.history[p].length > 20) this.history[p].shift();
        
        this.history[p].push(currentData);
        this.redoStack[p] = [];
        this.saveToLocalStorage();
    },

    undo() {
        const p = this.pageNum;
        if (!this.history[p] || this.history[p].length === 0) return false;

        const currentData = JSON.parse(JSON.stringify(this.getPageData(p)));
        if (!this.redoStack[p]) this.redoStack[p] = [];
        this.redoStack[p].push(currentData);

        const prevState = this.history[p].pop();
        this.annotations[p] = prevState;
        this.saveToLocalStorage();
        return true;
    },

    redo() {
        const p = this.pageNum;
        if (!this.redoStack[p] || this.redoStack[p].length === 0) return false;

        const currentData = JSON.parse(JSON.stringify(this.getPageData(p)));
        this.history[p].push(currentData);

        const nextState = this.redoStack[p].pop();
        this.annotations[p] = nextState;
        this.saveToLocalStorage();
        return true;
    },

    saveToLocalStorage() {
        try {
            // 1. Always save to the generic session (for simple reloads)
            localStorage.setItem('pdf_annotator_session', JSON.stringify(this.annotations));

            // 2. If this is a hashed PDF, save specifically to its backup key with timestamp
            if (this.pdfHash) {
                const backupData = {
                    timestamp: Date.now(),
                    data: this.annotations
                };
                localStorage.setItem('backup_' + this.pdfHash, JSON.stringify(backupData));
            }
        } catch (e) {
            console.warn("Local Storage full or disabled");
        }
    }
};
