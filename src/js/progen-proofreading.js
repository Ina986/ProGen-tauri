/* =========================================
   校正TXT管理（校正専用ページは撤去済み）
   ========================================= */
import { state } from './progen-state.js';

function _joinProofreadingContent() {
    state.proofreadingContent = state.proofreadingFiles
        .map(f => f.content)
        .join('\n\n--- 次のファイル ---\n\n');
}

async function loadLabelRulesForProofreading(labelValue) {
    if (typeof loadMasterRule === 'function') {
        await loadMasterRule(labelValue);
    }
}
function updateProofreadingCheckItems() {}
function updateProofreadingOptionsLabel() {}

// 現行導線では下部バーがプロンプト生成を担当するため、この関数は状態同期のみ。
function updateProofreadingPrompt() {
    const outputEl = document.getElementById('proofreadingOutput');
    if (outputEl) outputEl.value = '';
    const copyBtn = document.getElementById('proofreadingCopyBtn');
    if (copyBtn) copyBtn.disabled = true;
    const geminiBtn = document.getElementById('proofreadingGeminiBtn');
    if (geminiBtn) geminiBtn.disabled = true;
}

function showProofreadingLoadNotification() {
    const existing = document.getElementById('proofreadingLoadToast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'proofreadingLoadToast';
    toast.className = 'proofreading-load-toast';
    toast.textContent = 'テキストを読み込みました';
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 220);
    }, 2200);
}

function renderProofreadingFileList() {
    const statusEl = document.getElementById('proofreadingFileStatus');
    const manageBtn = document.getElementById('proofreadingManageBtn');

    if (state.proofreadingFiles.length === 0) {
        if (statusEl) statusEl.textContent = '';
        if (manageBtn) manageBtn.style.display = 'none';
        return;
    }

    if (statusEl) {
        statusEl.innerHTML = '<span class="svg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>';
    }
    if (manageBtn) manageBtn.style.display = 'inline-block';
}

function loadProofreadingFiles(input) {
    addProofreadingTxt(input);
}

function removeProofreadingFile(index) {
    if (index < 0 || index >= state.proofreadingFiles.length) return;
    state.proofreadingFiles.splice(index, 1);
    _joinProofreadingContent();
    renderProofreadingFileList();
    renderProofreadingTxtFileList();
}

function clearProofreadingFiles() {
    state.proofreadingFiles = [];
    state.proofreadingContent = '';
    renderProofreadingFileList();
    renderProofreadingTxtFileList();
}

function openProofreadingTxtManageModal() {
    renderProofreadingTxtFileList();
    const modal = document.getElementById('proofreadingTxtManageModal');
    if (modal) modal.style.display = 'flex';
}

function closeProofreadingTxtManageModal() {
    const modal = document.getElementById('proofreadingTxtManageModal');
    if (modal) modal.style.display = 'none';
}

function renderProofreadingTxtFileList() {
    const listEl = document.getElementById('proofreadingTxtFileList');
    const totalInfoEl = document.getElementById('proofreadingTxtTotalInfo');
    if (!listEl) return;

    if (state.proofreadingFiles.length === 0) {
        listEl.innerHTML = '<p style="color:#999; text-align:center; padding:15px;">読み込まれたファイルはありません</p>';
        if (totalInfoEl) totalInfoEl.textContent = '';
        return;
    }

    let totalSize = 0;
    listEl.innerHTML = state.proofreadingFiles.map((file, index) => {
        const sizeKB = (file.size / 1024).toFixed(1);
        totalSize += file.size;
        return `
            <div class="txt-file-item">
                <div class="txt-file-info">
                    <span class="txt-file-icon"><span class="svg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="14" y2="17"/></svg></span></span>
                    <span class="txt-file-name">${file.name}</span>
                    <span class="txt-file-size">${sizeKB}KB</span>
                </div>
                <button class="txt-file-remove" onclick="removeProofreadingTxtFile(${index})">削除</button>
            </div>
        `;
    }).join('');

    if (totalInfoEl) {
        const totalKB = (totalSize / 1024).toFixed(1);
        totalInfoEl.textContent = `${state.proofreadingFiles.length}ファイル / 合計 ${totalKB}KB`;
    }
}

function addProofreadingTxt(input) {
    const files = Array.from(input.files || []);
    if (files.length === 0) return;

    let loadedCount = 0;
    const fileInfos = [];

    files.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            fileInfos[index] = {
                name: file.name,
                content: e.target.result,
                size: file.size
            };
            loadedCount++;

            if (loadedCount === files.length) {
                state.proofreadingFiles = state.proofreadingFiles.concat(fileInfos);
                _joinProofreadingContent();
                renderProofreadingFileList();
                renderProofreadingTxtFileList();

                if (typeof detectNonJoyoLinesWithPageInfo === 'function') {
                    const detectedLines = detectNonJoyoLinesWithPageInfo(state.proofreadingFiles);
                    state.proofreadingDetectedNonJoyoWords = detectedLines;
                    if (typeof showNonJoyoResultPopup === 'function') {
                        showNonJoyoResultPopup(detectedLines, true);
                    }
                }
                showProofreadingLoadNotification();
            }
        };
        reader.readAsText(file);
    });

    input.value = '';
}

function removeProofreadingTxtFile(index) {
    removeProofreadingFile(index);
}

function clearAllProofreadingTxt() {
    if (state.proofreadingFiles.length === 0) return;
    if (!confirm('すべてのセリフTXTファイルをクリアしますか？')) return;
    clearProofreadingFiles();
}

export {
    loadLabelRulesForProofreading,
    loadProofreadingFiles,
    renderProofreadingFileList,
    removeProofreadingFile,
    clearProofreadingFiles,
    openProofreadingTxtManageModal,
    closeProofreadingTxtManageModal,
    renderProofreadingTxtFileList,
    addProofreadingTxt,
    removeProofreadingTxtFile,
    clearAllProofreadingTxt,
    updateProofreadingPrompt,
    updateProofreadingCheckItems,
    updateProofreadingOptionsLabel
};

Object.assign(window, {
    loadLabelRulesForProofreading,
    loadProofreadingFiles,
    renderProofreadingFileList,
    removeProofreadingFile,
    clearProofreadingFiles,
    openProofreadingTxtManageModal,
    closeProofreadingTxtManageModal,
    renderProofreadingTxtFileList,
    addProofreadingTxt,
    removeProofreadingTxtFile,
    clearAllProofreadingTxt,
    updateProofreadingPrompt,
    updateProofreadingCheckItems,
    updateProofreadingOptionsLabel
});
