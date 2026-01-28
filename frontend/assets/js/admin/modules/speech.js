import { API_BASE, getAuthToken } from '../core/api.js';
import { showToast, confirmAction } from '../core/ui.js';

let allRules = [];
let currentRuleId = null;
let isInitialized = false;

export function setupSpeechManagement() {
    loadRules();
    if (!isInitialized) {
        setupEventListeners();
        isInitialized = true;
    }
}

function setSpeechLoading(isLoading) {
    const content = document.getElementById('speech-content');
    const skeleton = document.getElementById('speech-skeleton');

    if (!content || !skeleton) return;

    if (isLoading) {
        content.style.display = 'none';
        skeleton.style.display = 'block';
    } else {
        content.style.display = 'block';
        skeleton.style.display = 'none';
    }
}

async function loadRules() {
    setSpeechLoading(true);

    try {
        const token = getAuthToken(); 
        // Note: getAuthToken() already includes "Bearer " prefix in string.
        // But fetch headers usually need explicit key.
        
        const response = await fetch(`${API_BASE}/api/speech/rules`, {
            headers: { 
                'Authorization': token // token is "Bearer ..."
            }
        });

        if (!response.ok) {
             const errData = await response.json();
             throw new Error(errData.error || 'Failed to fetch rules');
        }

        allRules = await response.json();
        renderRules(allRules);

    } catch (error) {
        console.error('Error loading speech rules:', error);
        const tableBody = document.getElementById('speech-table-body');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="5" class="error-cell">Error loading rules: ' + error.message + '</td></tr>';
        }
        showToast('Failed to load pronunciation rules', 'error');
    } finally {
        setSpeechLoading(false);
    }
}

function renderRules(rules) {
    const tableBody = document.getElementById('speech-table-body');
    if (!tableBody) return;

    if (rules.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="empty-cell">No pronunciation rules defined.</td></tr>';
        return;
    }

    tableBody.innerHTML = rules.map(rule => `
        <tr>
            <td style="font-weight: 600; color: #1e293b;">${escapeHtml(rule.pattern)}</td>
            <td style="font-family: monospace; color: #d946ef;">${escapeHtml(rule.replacement)}</td>
            <td><span class="badge badge-${getBadgeColor(rule.type)}">${rule.type}</span></td>
            <td style="color: #64748b;">${escapeHtml(rule.description || '-')}</td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn action-btn-edit" onclick="editSpeechRule(${rule.id})">
                        <span class="material-symbols-outlined">edit</span> Edit
                    </button>
                    <button class="action-btn action-btn-delete" onclick="deleteSpeechRule(${rule.id})">
                        <span class="material-symbols-outlined">delete</span> Delete
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function getBadgeColor(type) {
    switch (type) {
        case 'acronym': return 'warning';
        case 'brand': return 'info';
        case 'unit': return 'success';
        default: return 'secondary';
    }
}

function setupEventListeners() {
    // Search
    const searchInput = document.getElementById('speech-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = allRules.filter(r => 
                r.pattern.toLowerCase().includes(term) || 
                r.replacement.toLowerCase().includes(term) ||
                (r.description && r.description.toLowerCase().includes(term))
            );
            renderRules(filtered);
        });
    }

    // Modal Triggers
    const addBtn = document.getElementById('add-rule-btn');
    if (addBtn) addBtn.addEventListener('click', () => openSpeechModal());

    const closeBtn = document.getElementById('speech-modal-close');
    const cancelBtn = document.getElementById('speech-modal-cancel');
    if (closeBtn) closeBtn.addEventListener('click', closeSpeechModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeSpeechModal);

    const saveBtn = document.getElementById('speech-modal-save');
    if (saveBtn) saveBtn.addEventListener('click', saveSpeechRule);

    const testBtn = document.getElementById('speech-test-btn');
    if (testBtn) testBtn.addEventListener('click', testPronunciation);
}

function openSpeechModal(rule = null) {
    const modal = document.getElementById('speech-modal');
    const title = document.getElementById('speech-modal-title');
    const patternInput = document.getElementById('speech-pattern');
    const replacementInput = document.getElementById('speech-replacement');
    const typeSelect = document.getElementById('speech-type');
    const descInput = document.getElementById('speech-description');

    if (rule) {
        currentRuleId = rule.id;
        title.textContent = 'Edit Pronunciation Rule';
        patternInput.value = rule.pattern;
        replacementInput.value = rule.replacement;
        typeSelect.value = rule.type;
        descInput.value = rule.description || '';
    } else {
        currentRuleId = null;
        title.textContent = 'Add Pronunciation Rule';
        patternInput.value = '';
        replacementInput.value = '';
        typeSelect.value = 'general';
        descInput.value = '';
    }

    modal.classList.add('active');
}

function closeSpeechModal() {
    document.getElementById('speech-modal').classList.remove('active');
}

async function saveSpeechRule() {
    const pattern = document.getElementById('speech-pattern').value.trim();
    const replacement = document.getElementById('speech-replacement').value.trim();
    const type = document.getElementById('speech-type').value;
    const description = document.getElementById('speech-description').value.trim();

    if (!pattern || !replacement) {
        showToast('Pattern and Replacement are required', 'error');
        return;
    }

    const saveBtn = document.getElementById('speech-modal-save');
    saveBtn.classList.add('loading');

    const payload = { pattern, replacement, type, description };
    const method = currentRuleId ? 'PUT' : 'POST';
    const url = currentRuleId 
        ? `${API_BASE}/api/speech/rules/${currentRuleId}`
        : `${API_BASE}/api/speech/rules`;

    try {
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': getAuthToken()
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'Failed to save rule');

        showToast('Rule saved successfully', 'success');
        closeSpeechModal();
        loadRules(); // Refresh list

    } catch (error) {
        console.error('Error saving rule:', error);
        showToast(error.message, 'error');
    } finally {
        saveBtn.classList.remove('loading');
    }
}

async function testPronunciation() {
    const text = document.getElementById('speech-replacement').value.trim();
    if (!text) {
        showToast('Please enter replacement text first', 'warning');
        return;
    }

    const testBtn = document.getElementById('speech-test-btn');
    const originalContent = testBtn.innerHTML;
    
    // Set loading state
    testBtn.innerHTML = '<span class="material-symbols-outlined spin">sync</span>';
    testBtn.disabled = true;

    try {
        // Use direct fetch since we need blob response
        const response = await fetch(`${API_BASE}/tts/speak`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': getAuthToken()
            },
            body: JSON.stringify({ text })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || 'TTS generation failed');
        }

        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        
        await audio.play();
        
        // Cleanup
        audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
        };

    } catch (error) {
        console.error('TTS Error:', error);
        showToast(error.message, 'error');
    } finally {
        testBtn.innerHTML = originalContent;
        testBtn.disabled = false;
    }
}

// Global functions for inline onclick handlers
window.editSpeechRule = (id) => {
    const rule = allRules.find(r => r.id === id);
    if (rule) openSpeechModal(rule);
};

window.deleteSpeechRule = (id) => {
    confirmAction('Delete Rule', 'Are you sure you want to delete this pronunciation rule?', async () => {
        try {
            const response = await fetch(`${API_BASE}/api/speech/rules/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': getAuthToken() }
            });

            if (!response.ok) throw new Error('Failed to delete rule');

            showToast('Rule deleted successfully', 'success');
            loadRules();
        } catch (error) {
            console.error('Error deleting rule:', error);
            showToast('Failed to delete rule', 'error');
        }
    });
};

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
