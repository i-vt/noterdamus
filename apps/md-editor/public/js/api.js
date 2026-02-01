// api.js - Handles server communication

export async function createSession() {
    const res = await fetch('/api/session');
    const data = await res.json();
    return data.sessionId;
}

// [NEW] Check if a session ID is valid on the server
export async function checkSession(sessionId) {
    try {
        const res = await fetch(`/api/session/${sessionId}`);
        if (!res.ok) return false;
        const data = await res.json();
        return data.valid;
    } catch (e) {
        return false;
    }
}

export async function uploadFiles(sessionId, formData) {
    const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'x-session-id': sessionId },
        body: formData
    });
    return res.ok;
}

export async function fetchFileList(sessionId) {
    const res = await fetch(`/api/files/${sessionId}`);
    return await res.json();
}

export async function readFile(sessionId, path) {
    const res = await fetch(`/api/read/${sessionId}?path=${encodeURIComponent(path)}`);
    return await res.text();
}

export async function saveFile(sessionId, path, content) {
    await fetch(`/api/save/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content })
    });
}

export async function deleteFile(sessionId, path) {
    const res = await fetch(`/api/delete/${sessionId}?path=${encodeURIComponent(path)}`, {
        method: 'DELETE'
    });
    return res.ok;
}

export async function renameFile(sessionId, oldPath, newPath) {
    const res = await fetch(`/api/rename/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath, newPath })
    });
    return res.ok;
}
