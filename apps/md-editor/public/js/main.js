// main.js - Entry Point & UI Controller

import * as API from './api.js';
import * as Editor from './editor.js';
import * as Files from './files.js';
import * as UI from './ui.js';

const state = {
    sessionId: null,
    currentFilePath: null
};

const els = {
    saveBtn: document.getElementById('saveBtn'),
    themeBtn: document.getElementById('themeBtn'),
    downloadZipBtn: document.getElementById('downloadZipBtn'),
    toggleSidebarBtn: document.getElementById('toggleSidebarBtn'),
    sessionInput: document.getElementById('sessionInput'),
    sessionLoadBtn: document.getElementById('sessionLoadBtn'),
    sidebar: document.getElementById('sidebar'),
    sidebarResizer: document.getElementById('sidebarResizer'),
    dropZone: document.getElementById('dropZone'),
    folderInput: document.getElementById('folderInput'),
    fileExplorer: document.getElementById('fileExplorer'),
    editorWrapper: document.getElementById('editorWrapper'),
    resizer: document.getElementById('resizer'),
    preview: document.getElementById('preview'),
    editor: document.getElementById('editor'),
    lineNumbers: document.getElementById('lineNumbers'),
    mirror: document.getElementById('mirror')
};

async function init() {
    restoreConfigs();

    // 1. Session Init
    const cookieSession = getCookie('sessionKey');
    let sessionValid = false;

    if (cookieSession) {
        sessionValid = await API.checkSession(cookieSession);
        if (sessionValid) {
            state.sessionId = cookieSession;
            UI.showToast('Session restored', 'success');
        }
    }

    if (!sessionValid) {
        state.sessionId = await API.createSession();
        setCookie('sessionKey', state.sessionId);
    }

    els.sessionInput.value = state.sessionId;

    // 2. Initialize Modules
    Editor.initEditor({
        editor: els.editor,
        preview: els.preview,
        lineNumbers: els.lineNumbers,
        mirror: els.mirror
    });
    Editor.setEditorSessionId(state.sessionId);

    Files.initFileExplorer({
        dropZone: els.dropZone,
        folderInput: els.folderInput,
        fileExplorer: els.fileExplorer
    }, {
        sessionId: state.sessionId,
        onFileSelect: handleFileSelect
    });

    if (sessionValid) {
        Files.refreshExplorer(state.sessionId, null);
    } else {
        Editor.setEditorContent(`# New Theme Applied
This editor now uses the **Pandoc Interstellar** theme.

## Features
1. **Mermaid Diagrams**:
\`\`\`mermaid
graph LR
    A[Dark Mode] --> B{Like it?}
    B -->|Yes| C[Keep it]
    B -->|No| D[Switch to Light]
\`\`\`

2. **Progress Bar**: Look at the top of the window as you scroll this pane.
3. **Typography**: JetBrains Mono for code, Inter for text.
`);
    }

    setupToolbar();
    setupResizer();
    setupSidebarResizer();
}

function setCookie(name, value, days = 30) {
    const d = new Date();
    d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value};expires=${d.toUTCString()};path=/`;
}

function getCookie(name) {
    const match = document.cookie.match(`(^|;) ?${name}=([^;]*)(;|$)`);
    return match ? match[2] : null;
}

function restoreConfigs() {
    // [CHANGED] Theme Logic: Default is Dark. 'true' means Light Mode now.
    if (getCookie('lightMode') === 'true') {
        document.documentElement.setAttribute('data-theme', 'light');
        els.themeBtn.innerText = "🌙 Dark Mode";
    } else {
        document.documentElement.removeAttribute('data-theme');
        els.themeBtn.innerText = "☀ Light Mode";
    }

    if (getCookie('sidebarHidden') === 'true') {
        els.sidebar.classList.add('hidden');
    }

    const sbWidth = getCookie('sidebarWidth');
    if (sbWidth) {
        const width = parseInt(sbWidth, 10);
        if (!isNaN(width) && width > 50 && width < 600) {
            els.sidebar.style.width = `${width}px`;
        }
    }

    const savedWidth = getCookie('editorWidth');
    if (savedWidth) {
        const width = parseFloat(savedWidth);
        if (!isNaN(width) && width > 10 && width < 90) {
            els.editorWrapper.style.width = `${width}%`;
            els.preview.style.width = `${100 - width}%`;
        }
    }
}

async function handleFileSelect(path) {
    if (!path.match(/\.(md|txt|js|css|html|json)$/i)) return;
    state.currentFilePath = path;
    Editor.setEditorFilePath(path);
    const content = await API.readFile(state.sessionId, path);
    Editor.setEditorContent(content);
    Files.refreshExplorer(state.sessionId, path);
}

function setupToolbar() {
    els.sessionLoadBtn.addEventListener('click', async () => {
        const inputKey = els.sessionInput.value.trim();
        if (!inputKey) return UI.showToast('Please enter a session key', 'error');

        const isValid = await API.checkSession(inputKey);
        if (isValid) {
            state.sessionId = inputKey;
            setCookie('sessionKey', inputKey);
            Editor.setEditorSessionId(inputKey);
            Files.initFileExplorer({
                dropZone: els.dropZone,
                folderInput: els.folderInput,
                fileExplorer: els.fileExplorer
            }, {
                sessionId: state.sessionId,
                onFileSelect: handleFileSelect
            });
            Files.refreshExplorer(state.sessionId, null);
            UI.showToast('Session loaded successfully', 'success');
        } else {
            UI.showToast('Invalid Session ID', 'error');
        }
    });

    els.saveBtn.addEventListener('click', async () => {
        if (!state.currentFilePath) {
            UI.showToast('No file selected to save', 'error');
            return;
        }
        await API.saveFile(state.sessionId, state.currentFilePath, Editor.getEditorContent());
        UI.showToast('File saved successfully', 'success');
    });

    els.downloadZipBtn.addEventListener('click', () => {
        window.location.href = `/api/download/${state.sessionId}`;
        UI.showToast('Download started...', 'info');
    });

    // [CHANGED] Theme Toggle Logic
    els.themeBtn.addEventListener('click', () => {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        if (isLight) {
            document.documentElement.removeAttribute('data-theme'); // Go Dark
            els.themeBtn.innerText = "☀ Light Mode";
            setCookie('lightMode', 'false');
        } else {
            document.documentElement.setAttribute('data-theme', 'light'); // Go Light
            els.themeBtn.innerText = "🌙 Dark Mode";
            setCookie('lightMode', 'true');
        }
    });

    els.toggleSidebarBtn.addEventListener('click', () => {
        els.sidebar.classList.toggle('hidden');
        const isHidden = els.sidebar.classList.contains('hidden');
        setCookie('sidebarHidden', isHidden);
    });
}

function setupResizer() {
    let isResizing = false;
    els.resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.style.cursor = 'col-resize';
        els.resizer.classList.add('active');
    });
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const containerWidth = els.editorWrapper.parentElement.clientWidth;
        const sidebarWidth = els.sidebar.getBoundingClientRect().width;
        const x = e.clientX - sidebarWidth;
        let newWidthPercent = (x / containerWidth) * 100;
        if (newWidthPercent < 10) newWidthPercent = 10;
        if (newWidthPercent > 90) newWidthPercent = 90;
        els.editorWrapper.style.width = `${newWidthPercent}%`;
        els.preview.style.width = `${100 - newWidthPercent}%`;
    });
    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = 'default';
            els.resizer.classList.remove('active');
            const currentWidth = els.editorWrapper.style.width;
            if (currentWidth) setCookie('editorWidth', parseFloat(currentWidth));
            window.dispatchEvent(new Event('resize'));
        }
    });
}

function setupSidebarResizer() {
    let isResizing = false;
    els.sidebarResizer.addEventListener('mousedown', () => {
        isResizing = true;
        document.body.style.cursor = 'col-resize';
        els.sidebarResizer.classList.add('active');
        els.sidebar.style.transition = 'none';
    });
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        let newWidth = e.clientX;
        if (newWidth < 150) newWidth = 150;
        if (newWidth > 600) newWidth = 600;
        els.sidebar.style.width = `${newWidth}px`;
    });
    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = 'default';
            els.sidebarResizer.classList.remove('active');
            els.sidebar.style.transition = 'width 0.1s ease';
            const currentWidth = els.sidebar.style.width;
            if (currentWidth) setCookie('sidebarWidth', parseInt(currentWidth, 10));
        }
    });
}

init();
