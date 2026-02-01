// ui.js - Handles Modals, Toasts, and Notifications

const els = {
    toastContainer: document.getElementById('toastContainer'),
    modalOverlay: document.getElementById('modalOverlay'),
    modalTitle: document.getElementById('modalTitle'),
    modalMessage: document.getElementById('modalMessage'),
    modalInput: document.getElementById('modalInput'),
    modalConfirmBtn: document.getElementById('modalConfirmBtn'),
    modalCancelBtn: document.getElementById('modalCancelBtn'),
};

// --- Toast Notifications ---
export function showToast(message, type = 'info') { // type: 'info', 'success', 'error'
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;

    els.toastContainer.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => toast.classList.add('visible'));

    // Remove after 3s
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- Modals (Promise-based) ---

let resolveModal = null;

function openModal({ title, message, showInput = false, inputValue = '', confirmText = 'Confirm' }) {
    return new Promise((resolve) => {
        resolveModal = resolve;

        // Setup UI
        els.modalTitle.textContent = title;
        els.modalMessage.textContent = message;
        els.modalConfirmBtn.textContent = confirmText;
        
        if (showInput) {
            els.modalInput.value = inputValue;
            els.modalInput.classList.remove('hidden');
            setTimeout(() => els.modalInput.focus(), 50); // Focus after visible
        } else {
            els.modalInput.classList.add('hidden');
        }

        // Show
        els.modalOverlay.classList.remove('hidden');
    });
}

function closeModal(result) {
    els.modalOverlay.classList.add('hidden');
    if (resolveModal) {
        resolveModal(result);
        resolveModal = null;
    }
}

// Event Listeners for Modal
els.modalConfirmBtn.onclick = () => {
    const isInputVisible = !els.modalInput.classList.contains('hidden');
    const result = isInputVisible ? els.modalInput.value : true;
    closeModal(result);
};

els.modalCancelBtn.onclick = () => {
    closeModal(false);
};

els.modalInput.onkeydown = (e) => {
    if (e.key === 'Enter') els.modalConfirmBtn.click();
    if (e.key === 'Escape') els.modalCancelBtn.click();
};

// --- Public Modal Wrappers ---

export async function confirm(title, message, confirmText = 'Yes') {
    const result = await openModal({ title, message, confirmText });
    return !!result;
}

export async function prompt(title, message, initialValue = '') {
    const result = await openModal({ 
        title, 
        message, 
        showInput: true, 
        inputValue: initialValue,
        confirmText: 'Save'
    });
    // If canceled (false) return null
    return result === false ? null : result;
}
