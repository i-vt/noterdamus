// editor.js - Handles Markdown rendering, Sync, and Template Features

const md = window.markdownit({ html: true, linkify: true, typographer: true });

let editorEl, previewEl, lineNumbersEl, mirrorEl;
let currentSessionId = null;
let currentFilePath = '';
let isScrolling = false;
let lineHeights = [];

// [NEW] Mermaid Initialization
if (typeof mermaid !== 'undefined') {
    mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });
}

export function initEditor(elements) {
    editorEl = elements.editor;
    previewEl = elements.preview;
    lineNumbersEl = elements.lineNumbers;
    mirrorEl = elements.mirror;

    setupImageRenderer();
    setupLineNumbers();

    // Event Listeners
    editorEl.addEventListener('input', updatePreview);
    editorEl.addEventListener('scroll', handleEditorScroll);
    previewEl.addEventListener('dblclick', handlePreviewDoubleClick);
    
    // [NEW] Scroll Progress Bar Listener
    previewEl.addEventListener('scroll', updateProgressBar);
    
    // [NEW] Lightbox Listener (Delegation)
    previewEl.addEventListener('click', handleImageClick);
    
    // Close Lightbox
    const lightbox = document.getElementById('lightbox');
    if(lightbox) lightbox.addEventListener('click', () => lightbox.classList.remove('active'));

    window.addEventListener('resize', updateLineNumbers);
    
    updatePreview();
}

export function setEditorSessionId(id) { currentSessionId = id; }
export function setEditorFilePath(path) { currentFilePath = path; }
export function setEditorContent(text) { editorEl.value = text; updatePreview(); }
export function getEditorContent() { return editorEl.value; }

// --- Template Features ---

function updateProgressBar() {
    const progressBar = document.getElementById('progress-bar');
    if (!progressBar) return;
    
    const scrollTop = previewEl.scrollTop;
    const scrollHeight = previewEl.scrollHeight - previewEl.clientHeight;
    
    if (scrollHeight > 0) {
        const percent = (scrollTop / scrollHeight) * 100;
        progressBar.style.width = `${percent}%`;
    }
}

function handleImageClick(e) {
    if (e.target.tagName === 'IMG') {
        const lightbox = document.getElementById('lightbox');
        if (lightbox) {
            lightbox.innerHTML = '';
            const clone = e.target.cloneNode();
            lightbox.appendChild(clone);
            lightbox.classList.add('active');
        }
    }
}

function updatePreview() {
    updateLineNumbers();
    
    // Render Markdown
    const html = md.render(editorEl.value);
    previewEl.innerHTML = html;
    
    // [NEW] Render Mermaid
    if (typeof mermaid !== 'undefined') {
        previewEl.querySelectorAll('.language-mermaid').forEach(async (block) => {
            try {
                // Convert <pre><code> to pure <div> for mermaid
                const graphDef = block.textContent;
                const newDiv = document.createElement('div');
                newDiv.className = 'mermaid';
                newDiv.textContent = graphDef;
                block.parentElement.replaceWith(newDiv);
            } catch (e) { console.error(e); }
        });
        
        // Async run
        mermaid.run({ nodes: previewEl.querySelectorAll('.mermaid') });
    }
    
    // Image Load Listeners
    previewEl.querySelectorAll('img').forEach(img => {
        img.addEventListener('load', () => { if (!isScrolling) syncPreview(); });
    });
}

// --- Standard Editor Logic (Unchanged but included) ---

function setupImageRenderer() {
    const defaultRender = md.renderer.rules.image || function(tokens, idx, options, env, self) {
        return self.renderToken(tokens, idx, options, env, self);
    };
    md.renderer.rules.image = function (tokens, idx, options, env, self) {
        const token = tokens[idx];
        const srcIndex = token.attrIndex('src');
        if (srcIndex >= 0) {
            let src = token.attrs[srcIndex][1];
            if (currentSessionId && !src.startsWith('http') && !src.startsWith('//')) {
                const resolvedPath = resolveRelativePath(currentFilePath, src);
                token.attrs[srcIndex][1] = `/uploads/${currentSessionId}/${resolvedPath}`;
            }
        }
        return defaultRender(tokens, idx, options, env, self);
    };
}

function resolveRelativePath(baseFile, relativeUrl) {
    if (relativeUrl.startsWith('/')) return relativeUrl.slice(1);
    if (!baseFile) return relativeUrl;
    const stack = baseFile.split('/');
    stack.pop(); 
    const parts = relativeUrl.split('/');
    for (const part of parts) {
        if (part === '.' || part === '') continue;
        if (part === '..') { if (stack.length > 0) stack.pop(); } 
        else { stack.push(part); }
    }
    return stack.join('/');
}

function setupLineNumbers() {
    function inject(tokens, idx, options, env, self) {
        if (tokens[idx].map && tokens[idx].level === 0) {
            tokens[idx].attrSet('data-source-line', String(tokens[idx].map[0])); 
        }
        return self.renderToken(tokens, idx, options, env, self);
    }
    const rules = ['paragraph_open', 'heading_open', 'list_item_open', 'bullet_list_open', 'ordered_list_open', 'blockquote_open', 'table_open'];
    rules.forEach(rule => {
        const original = md.renderer.rules[rule] || function(tokens, idx, options, env, self) { return self.renderToken(tokens, idx, options, env, self); };
        md.renderer.rules[rule] = function(tokens, idx, options, env, self) {
            if (tokens[idx].map) tokens[idx].attrSet('data-source-line', String(tokens[idx].map[0]));
            return original(tokens, idx, options, env, self);
        };
    });
}

function updateLineNumbers() {
    const lines = editorEl.value.split('\n');
    mirrorEl.style.width = editorEl.clientWidth + 'px';
    mirrorEl.innerHTML = '';
    lines.forEach(line => {
        const div = document.createElement('div');
        div.textContent = line || '\u00A0'; 
        mirrorEl.appendChild(div);
    });
    lineHeights = [];
    let gutterHTML = '';
    const mirrorChildren = mirrorEl.children;
    for (let i = 0; i < mirrorChildren.length; i++) {
        const height = mirrorChildren[i].offsetHeight;
        lineHeights.push(height);
        gutterHTML += `<div style="height:${height}px">${i + 1}</div>`;
    }
    lineNumbersEl.innerHTML = gutterHTML;
}

function handleEditorScroll() {
    lineNumbersEl.scrollTop = editorEl.scrollTop;
    syncPreview();
}

function syncPreview() {
    if (isScrolling) return;
    isScrolling = true;
    if (editorEl.scrollTop === 0) { previewEl.scrollTop = 0; setTimeout(() => isScrolling = false, 50); return; }
    if (Math.abs(editorEl.scrollHeight - editorEl.scrollTop - editorEl.clientHeight) < 10) {
        previewEl.scrollTop = previewEl.scrollHeight;
        setTimeout(() => isScrolling = false, 50);
        return;
    }
    const scrollCenter = editorEl.scrollTop + (editorEl.clientHeight / 2);
    let accumulatedHeight = 20; 
    let currentLine = 0;
    for (let i = 0; i < lineHeights.length; i++) {
        accumulatedHeight += lineHeights[i];
        if (accumulatedHeight >= scrollCenter) { currentLine = i; break; }
    }
    const elements = document.querySelectorAll('[data-source-line]');
    let targetElement = null;
    let minDiff = Infinity;
    for (let el of elements) {
        const line = parseInt(el.getAttribute('data-source-line'), 10);
        const diff = Math.abs(line - currentLine);
        if (diff < minDiff) { minDiff = diff; targetElement = el; }
    }
    if (targetElement) {
        previewEl.scrollTop = targetElement.offsetTop - (previewEl.clientHeight / 2); 
    }
    setTimeout(() => { isScrolling = false; }, 50);
}

function handlePreviewDoubleClick(e) {
    const el = e.target.closest('[data-source-line]');
    if (!el) return;
    isScrolling = true;
    const lineIndex = parseInt(el.getAttribute('data-source-line'), 10);
    let newScrollTop = 20; 
    for (let i = 0; i < lineIndex; i++) { if (lineHeights[i]) newScrollTop += lineHeights[i]; }
    newScrollTop = newScrollTop - (editorEl.clientHeight / 2) + (lineHeights[lineIndex] || 24) / 2;
    editorEl.scrollTo({ top: newScrollTop, behavior: 'smooth' });
    highlightLine(lineIndex);
    setTimeout(() => { isScrolling = false; }, 600); 
}

function highlightLine(lineIndex) {
    const lines = editorEl.value.split('\n');
    let charIndex = 0;
    for (let i = 0; i < lineIndex; i++) { if (lines[i] !== undefined) charIndex += lines[i].length + 1; }
    const lineContent = lines[lineIndex];
    if (lineContent !== undefined) {
        editorEl.focus();
        editorEl.setSelectionRange(charIndex, charIndex + lineContent.length);
        editorEl.classList.remove('highlight-flash');
        void editorEl.offsetWidth; 
        editorEl.classList.add('highlight-flash');
    }
}
