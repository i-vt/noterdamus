// files.js - Handles Drag & Drop, File Scanning, and Explorer UI

import { uploadFiles, fetchFileList, deleteFile, renameFile } from './api.js';
import * as UI from './ui.js';

let fileExplorerEl;
let onFileSelectCallback;

export function initFileExplorer(elements, callbacks) {
    fileExplorerEl = elements.fileExplorer;
    const dropZone = elements.dropZone;
    const folderInput = elements.folderInput;
    
    onFileSelectCallback = callbacks.onFileSelect;

    dropZone.addEventListener('click', () => folderInput.click());
    folderInput.addEventListener('change', (e) => handleInputUpload(e.target.files, callbacks.sessionId));
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => handleDrop(e, callbacks.sessionId));
}

export async function refreshExplorer(sessionId, currentPath) {
    const files = await fetchFileList(sessionId);
    renderFileList(files, currentPath, sessionId);
}

function renderFileList(files, currentPath, sessionId) {
    fileExplorerEl.innerHTML = '';
    
    if (files.length === 0) {
        fileExplorerEl.innerHTML = '<div class="empty-msg">No files.</div>';
        return;
    }

    files.sort((a, b) => {
        if (a.name.endsWith('.md') && !b.name.endsWith('.md')) return -1;
        if (!a.name.endsWith('.md') && b.name.endsWith('.md')) return 1;
        return a.path.localeCompare(b.path);
    });

    files.forEach(file => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'file-item';
        if (currentPath === file.path) itemDiv.classList.add('active');

        const nameSpan = document.createElement('span');
        nameSpan.className = 'file-name';
        nameSpan.textContent = file.path;
        nameSpan.onclick = () => onFileSelectCallback(file.path);

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'file-actions';

        const renameBtn = document.createElement('button');
        renameBtn.innerHTML = '✎';
        renameBtn.title = "Rename or Move";
        renameBtn.onclick = (e) => {
            e.stopPropagation();
            handleRename(sessionId, file.path);
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '×';
        deleteBtn.title = "Delete";
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            handleDelete(sessionId, file.path);
        };

        actionsDiv.appendChild(renameBtn);
        actionsDiv.appendChild(deleteBtn);

        itemDiv.appendChild(nameSpan);
        itemDiv.appendChild(actionsDiv);
        fileExplorerEl.appendChild(itemDiv);
    });
}

// [MODIFIED] Use UI.prompt
async function handleRename(sessionId, oldPath) {
    const newPath = await UI.prompt(
        "Rename File", 
        `Enter new filename or path for '${oldPath}':`, 
        oldPath
    );
    
    if (newPath && newPath !== oldPath) {
        const success = await renameFile(sessionId, oldPath, newPath);
        if (success) {
            UI.showToast('File renamed successfully', 'success');
            refreshExplorer(sessionId, newPath);
        } else {
            UI.showToast('Rename failed. Name may be invalid.', 'error');
        }
    }
}

// [MODIFIED] Use UI.confirm
async function handleDelete(sessionId, path) {
    const confirmed = await UI.confirm(
        "Delete File", 
        `Are you sure you want to delete '${path}'? This cannot be undone.`,
        "Delete"
    );

    if (confirmed) {
        const success = await deleteFile(sessionId, path);
        if (success) {
            UI.showToast('File deleted', 'info');
            refreshExplorer(sessionId, null);
        } else {
            UI.showToast('Delete failed.', 'error');
        }
    }
}

async function handleInputUpload(fileList, sessionId) {
    const files = Array.from(fileList);
    await processAndUpload(files, sessionId);
}

async function handleDrop(e, sessionId) {
    e.preventDefault();
    document.getElementById('dropZone').classList.remove('drag-over');

    const items = e.dataTransfer.items;
    if (!items) return;

    const queue = [];
    for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry ? items[i].webkitGetAsEntry() : null;
        if (entry) queue.push(entry);
    }

    const files = [];
    while (queue.length > 0) {
        const entry = queue.shift();
        if (entry.isFile) {
            files.push(await getFileFromEntry(entry));
        } else if (entry.isDirectory) {
            queue.push(...await readDirectory(entry));
        }
    }

    if (files.length > 0) await processAndUpload(files, sessionId);
}

async function processAndUpload(files, sessionId) {
    UI.showToast(`Scanning ${files.length} files...`, 'info');

    const entries = files.map(file => {
        let path = file.fullPath || file.webkitRelativePath || file.name;
        if (path.startsWith('/')) path = path.substring(1);
        return { file, path };
    });

    if (entries.length > 0) {
        const firstPath = entries[0].path;
        const parts = firstPath.split('/');
        if (parts.length > 1) {
            const potentialRoot = parts[0] + '/';
            if (entries.every(e => e.path.startsWith(potentialRoot))) {
                entries.forEach(e => e.path = e.path.substring(potentialRoot.length));
            }
        }
    }

    const formData = new FormData();
    for (const entry of entries) {
        const safeName = entry.path.split('/').join('@@@');
        formData.append('files', entry.file, safeName);
    }

    const success = await uploadFiles(sessionId, formData);
    if (success) {
        UI.showToast('Upload successful', 'success');
        refreshExplorer(sessionId, null);
    } else {
        UI.showToast('Upload failed', 'error');
    }
}

function getFileFromEntry(entry) {
    return new Promise(resolve => {
        entry.file(file => { file.fullPath = entry.fullPath; resolve(file); });
    });
}

function readDirectory(entry) {
    return new Promise(resolve => {
        const reader = entry.createReader();
        const entries = [];
        const readEntries = () => {
            reader.readEntries(results => {
                if (results.length === 0) resolve(entries);
                else { entries.push(...results); readEntries(); }
            });
        };
        readEntries();
    });
}
