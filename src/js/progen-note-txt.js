/* =========================================
   補足文添削GEM起動
   ========================================= */
import { state } from './progen-state.js';
const NOTE_GEM_URL = 'https://gemini.google.com/gem/144RT7ETh0yOWFdRlWYmWLA_V0zJCWU3n';

function openNoteGem(inputId) {
    // 入力IDからプレフィックスを判断してルール情報を取得
    let srcId, dstId, srcLabel, dstLabel;

    if (inputId === 'edit_note') {
        srcId = 'edit_src';
        dstId = 'edit_dst';
        srcLabel = '修正前';
        dstLabel = '修正後';
    } else if (inputId === 'symbol_edit_note') {
        srcId = 'symbol_edit_src';
        dstId = 'symbol_edit_dst';
        srcLabel = '変換前';
        dstLabel = '変換後';
    } else if (inputId === 'admin_edit_note') {
        srcId = 'admin_edit_src';
        dstId = 'admin_edit_dst';
        srcLabel = '変換元';
        dstLabel = '変換先';
    }

    const srcInput = document.getElementById(srcId);
    const dstInput = document.getElementById(dstId);
    const noteInput = document.getElementById(inputId);

    const srcText = srcInput ? srcInput.value.trim() : '';
    const dstText = dstInput ? dstInput.value.trim() : '';
    const noteText = noteInput ? noteInput.value.trim() : '';

    // ルール情報と補足文をまとめてテキスト化
    let copyText = `【ルール情報】\n`;
    copyText += `${srcLabel}: ${srcText || '（未入力）'}\n`;
    copyText += `${dstLabel}: ${dstText || '（未入力）'}\n`;
    copyText += `\n【現在の補足文】\n`;
    copyText += noteText || '（未入力）';

    // クリップボードにコピー
    navigator.clipboard.writeText(copyText).then(() => {
        console.log('ルール情報と補足文をクリップボードにコピーしました');
    }).catch(err => {
        console.error('クリップボードコピーエラー:', err);
    });

    // GEMを新しいタブで開く
    window.open(NOTE_GEM_URL, '_blank');
}

/* =========================================
   TXTフォルダブラウザ（Gドライブ用）
   ========================================= */

// TXTフォルダブラウザ用の変数
// state.txtFolderBasePath は state に移動済み
let cachedTxtFiles = [];
let txtSearchTimeout = null;
let selectedTxtFiles = []; // 選択されたTXTファイルのリスト

// TXTソース選択モーダルを開く
function openTxtSourceSelectModal() {
    document.getElementById('txtSourceSelectModal').style.display = 'flex';

    // ドロップゾーンの初期化（初回のみ）
    const dropZone = document.getElementById('txtSourceDropZone');
    if (dropZone && !dropZone._dropZoneInitialized) {
        window.setupDropZone(dropZone, (fakeInput) => {
            closeTxtSourceSelectModal();
            window.loadProofreadingFiles(fakeInput);
        });
        dropZone._dropZoneInitialized = true;
    }
}

// TXTソース選択モーダルを閉じる
function closeTxtSourceSelectModal() {
    document.getElementById('txtSourceSelectModal').style.display = 'none';
}

// ローカルからTXTを選択
function selectTxtSourceLocal() {
    closeTxtSourceSelectModal();
    document.getElementById('proofreadingFileInput').click();
}

// ファイル追加ソース選択モーダル用の変数
let txtAddSourceMode = 'extraction'; // 'extraction' or 'proofreading'

// ファイル追加ソース選択モーダルを開く
function openTxtAddSourceSelectModal(mode) {
    txtAddSourceMode = mode;
    document.getElementById('txtAddSourceSelectModal').style.display = 'flex';
}

// ファイル追加ソース選択モーダルを閉じる
function closeTxtAddSourceSelectModal() {
    document.getElementById('txtAddSourceSelectModal').style.display = 'none';
}

// ローカルからファイルを追加
function selectTxtAddSourceLocal() {
    closeTxtAddSourceSelectModal();
    if (txtAddSourceMode === 'extraction') {
        document.getElementById('txtAddFile').click();
    } else {
        document.getElementById('proofreadingTxtAddFile').click();
    }
}

// Gドライブからファイルを追加（フォルダブラウザを開く）
async function openTxtAddFolderBrowser() {
    closeTxtAddSourceSelectModal();

    if (!window.electronAPI || !window.electronAPI.isElectron) {
        showToast('この機能はElectronアプリでのみ使用できます', 'error');
        return;
    }

    const modal = document.getElementById('txtFolderBrowserModal');
    const folderTree = document.getElementById('txtFolderTree');
    const currentPathDisplay = document.getElementById('txtFolderCurrentPath');
    const searchInput = document.getElementById('txtFolderSearchInput');

    modal.style.display = 'flex';
    folderTree.innerHTML = '<div class="json-folder-loading">読み込み中...</div>';

    // 選択をリセット
    selectedTxtFiles = [];
    updateTxtSelectionUI();

    // 検索フィールドをリセット
    if (searchInput) {
        searchInput.value = '';
    }
    clearTxtFolderSearch();

    // ファイル追加モードを設定（loadSelectedTxtFilesで使用）
    window.txtAddModeForFolderBrowser = txtAddSourceMode;

    try {
        // ベースパスを取得
        state.txtFolderBasePath = await window.electronAPI.getTxtFolderPath();
        currentPathDisplay.textContent = state.txtFolderBasePath;

        // ルートフォルダの内容を読み込み
        await loadTxtFolderContents(state.txtFolderBasePath, folderTree, true);

        // バックグラウンドでTXTファイル一覧をキャッシュ
        cacheTxtFiles(state.txtFolderBasePath);

        // 検索イベントを設定
        setupTxtFolderSearch();
    } catch (error) {
        console.error('TXTフォルダの読み込みに失敗:', error);
        folderTree.innerHTML = '<div class="json-folder-loading">読み込みに失敗しました: ' + error.message + '</div>';
    }
}

// TXTフォルダブラウザを開く（Gドライブ）
async function openTxtFolderBrowser() {
    closeTxtSourceSelectModal();

    if (!window.electronAPI || !window.electronAPI.isElectron) {
        showToast('この機能はElectronアプリでのみ使用できます', 'error');
        return;
    }

    const modal = document.getElementById('txtFolderBrowserModal');
    const folderTree = document.getElementById('txtFolderTree');
    const currentPathDisplay = document.getElementById('txtFolderCurrentPath');
    const searchInput = document.getElementById('txtFolderSearchInput');

    modal.style.display = 'flex';
    folderTree.innerHTML = '<div class="json-folder-loading">読み込み中...</div>';

    // 選択をリセット
    selectedTxtFiles = [];
    updateTxtSelectionUI();

    // 検索フィールドをリセット
    if (searchInput) {
        searchInput.value = '';
    }
    clearTxtFolderSearch();

    // 校正ページからの呼び出しはデフォルトで校正モード
    window.txtAddModeForFolderBrowser = 'proofreading';

    try {
        // ベースパスを取得
        state.txtFolderBasePath = await window.electronAPI.getTxtFolderPath();
        currentPathDisplay.textContent = state.txtFolderBasePath;

        // ルートフォルダの内容を読み込み
        await loadTxtFolderContents(state.txtFolderBasePath, folderTree, true);

        // バックグラウンドでTXTファイル一覧をキャッシュ
        cacheTxtFiles(state.txtFolderBasePath);

        // 検索イベントを設定
        setupTxtFolderSearch();
    } catch (error) {
        console.error('TXTフォルダの読み込みに失敗:', error);
        folderTree.innerHTML = '<div class="json-folder-loading">読み込みに失敗しました: ' + error.message + '</div>';
    }
}

// TXTフォルダブラウザを閉じる
function closeTxtFolderBrowser() {
    document.getElementById('txtFolderBrowserModal').style.display = 'none';
}

// TXTフォルダ内容を読み込んで表示
async function loadTxtFolderContents(dirPath, container, isRootLevel = false) {
    const result = await window.electronAPI.listTxtDirectory(dirPath);

    if (!result.success) {
        container.innerHTML = '<div class="json-folder-loading">エラー: ' + result.error + '</div>';
        return;
    }

    container.innerHTML = '';

    // フォルダを先に、ファイルを後に表示（アルファベット順）
    const folders = result.items.filter(item => item.isDirectory).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    const files = result.items.filter(item => item.isFile && item.name.toLowerCase().endsWith('.txt')).sort((a, b) => a.name.localeCompare(b.name, 'ja'));

    const sortedItems = [...folders, ...files];

    if (sortedItems.length === 0) {
        container.innerHTML = '<div class="json-folder-loading">フォルダが空です（またはTXTファイルがありません）</div>';
        return;
    }

    for (const item of sortedItems) {
        const itemEl = createTxtFolderItem(item, isRootLevel);
        container.appendChild(itemEl);
    }
}

// TXTフォルダ/ファイル項目要素を作成
function createTxtFolderItem(item, isRootLevel = false) {
    const wrapper = document.createElement('div');

    const itemEl = document.createElement('div');
    itemEl.className = 'json-folder-item';

    if (item.isDirectory) {
        // フォルダ
        itemEl.classList.add('folder');

        const toggle = document.createElement('span');
        toggle.className = 'folder-toggle';
        toggle.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
        itemEl.appendChild(toggle);

        const icon = document.createElement('span');
        icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
        itemEl.appendChild(icon);

        const name = document.createElement('span');
        name.className = 'folder-name';
        name.textContent = item.name;
        itemEl.appendChild(name);

        // 子要素コンテナ
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'json-folder-children';

        let isLoaded = false;

        // フォルダ名クリックで展開/折りたたみ
        const toggleFolder = async () => {
            const isExpanded = childrenContainer.classList.contains('expanded');

            if (!isExpanded) {
                toggle.classList.add('expanded');
                childrenContainer.classList.add('expanded');

                if (!isLoaded) {
                    childrenContainer.innerHTML = '<div class="json-folder-loading">読み込み中...</div>';
                    await loadTxtFolderContents(item.path, childrenContainer);
                    isLoaded = true;
                }
            } else {
                toggle.classList.remove('expanded');
                childrenContainer.classList.remove('expanded');
            }
        };

        toggle.addEventListener('click', async (e) => {
            e.stopPropagation();
            await toggleFolder();
        });

        name.addEventListener('click', async (e) => {
            e.stopPropagation();
            await toggleFolder();
        });

        icon.addEventListener('click', async (e) => {
            e.stopPropagation();
            await toggleFolder();
        });

        wrapper.appendChild(itemEl);
        wrapper.appendChild(childrenContainer);

    } else {
        // TXTファイル
        itemEl.classList.add('file');
        itemEl.classList.add('txt-file');
        itemEl.setAttribute('data-path', item.path);
        itemEl.setAttribute('data-name', item.name);

        // チェックボックス
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'txt-file-checkbox';
        checkbox.addEventListener('click', (e) => e.stopPropagation());
        checkbox.addEventListener('change', (e) => {
            toggleTxtFileSelection(item.path, item.name, e.target.checked, itemEl);
        });
        itemEl.appendChild(checkbox);

        const icon = document.createElement('span');
        icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
        itemEl.appendChild(icon);

        const name = document.createElement('span');
        name.className = 'file-name';
        name.textContent = item.name;
        itemEl.appendChild(name);

        // 行クリックでチェックボックスをトグル
        itemEl.addEventListener('click', (e) => {
            e.stopPropagation();
            checkbox.checked = !checkbox.checked;
            toggleTxtFileSelection(item.path, item.name, checkbox.checked, itemEl);
        });

        wrapper.appendChild(itemEl);
    }

    return wrapper;
}

// TXTファイルの選択をトグル
function toggleTxtFileSelection(filePath, fileName, isSelected, itemEl) {
    if (isSelected) {
        // 選択に追加
        if (!selectedTxtFiles.find(f => f.path === filePath)) {
            selectedTxtFiles.push({ path: filePath, name: fileName });
        }
        if (itemEl) itemEl.classList.add('selected');
    } else {
        // 選択から削除
        selectedTxtFiles = selectedTxtFiles.filter(f => f.path !== filePath);
        if (itemEl) itemEl.classList.remove('selected');
    }
    updateTxtSelectionUI();
}

// 選択UI更新
function updateTxtSelectionUI() {
    const countEl = document.getElementById('txtSelectCount');
    const loadBtn = document.getElementById('txtLoadSelectedBtn');

    if (selectedTxtFiles.length > 0) {
        countEl.textContent = `${selectedTxtFiles.length}件選択中`;
        loadBtn.style.display = 'inline-block';
    } else {
        countEl.textContent = '';
        loadBtn.style.display = 'none';
    }
}

// 選択したファイルを一括読み込み
async function loadSelectedTxtFiles() {
    if (selectedTxtFiles.length === 0) return;

    const loadBtn = document.getElementById('txtLoadSelectedBtn');
    loadBtn.disabled = true;
    loadBtn.textContent = '読み込み中...';

    const fileInfos = [];
    let errorCount = 0;

    for (const file of selectedTxtFiles) {
        try {
            const result = await window.electronAPI.readTxtFile(file.path);
            if (result.success) {
                fileInfos.push({
                    name: result.name,
                    content: result.data,
                    size: result.size
                });
            } else {
                errorCount++;
                console.error('ファイル読み込みエラー:', file.name, result.error);
            }
        } catch (error) {
            errorCount++;
            console.error('ファイル読み込みエラー:', file.name, error);
        }
    }

    if (fileInfos.length > 0) {
        // TXTパスから作品情報を抽出（校正データ保存用）
        if (selectedTxtFiles.length > 0 && state.txtFolderBasePath) {
            extractCalibrationInfoFromPath(selectedTxtFiles[0].path, fileInfos);
        }

        // ファイル追加モードに応じて適切なリストに追加
        if (window.txtAddModeForFolderBrowser === 'extraction') {
            // 抽出プロンプト用
            state.manuscriptTxtFiles = state.manuscriptTxtFiles.concat(fileInfos);
            updateNonJoyoDetection();
            renderTxtFileList();
            // ステータス更新
            const totalSize = state.manuscriptTxtFiles.reduce((sum, f) => sum + f.size, 0);
            document.getElementById('txtUploadStatus').textContent = `${state.manuscriptTxtFiles.length}ファイル (${formatFileSize(totalSize)})`;
            document.getElementById('txtManageBtn').style.display = 'inline-block';

            // Geminiボタンを有効化
            const geminiBtn = document.getElementById('extractionGeminiBtn');
            if (geminiBtn) {
                geminiBtn.removeAttribute('disabled');
            }
        } else {
            // 校正プロンプト用
            state.proofreadingFiles = state.proofreadingFiles.concat(fileInfos);
            state.proofreadingContent = state.proofreadingFiles.map(f => f.content).join('\n\n--- 次のファイル ---\n\n');
            renderProofreadingFileList();

            // 常用外漢字を検出
            const detectedLines = detectNonJoyoLinesWithPageInfo(state.proofreadingFiles);
            state.proofreadingDetectedNonJoyoWords = detectedLines;
            showNonJoyoResultPopup(detectedLines, true);

            updateProofreadingPrompt();
        }
    }

    loadBtn.disabled = false;
    loadBtn.textContent = '選択したファイルを読込';

    if (errorCount > 0) {
        showToast(`${fileInfos.length}件を読み込みました（${errorCount}件のエラー）`, 'warning');
    }

    // モードをリセット
    window.txtAddModeForFolderBrowser = null;

    closeTxtFolderBrowser();
}

// TXTファイル一覧をキャッシュ（検索用）
async function cacheTxtFiles(basePath) {
    cachedTxtFiles = [];
    await collectTxtFilesRecursive(basePath);
}

// 再帰的にTXTファイルを収集
async function collectTxtFilesRecursive(dirPath) {
    try {
        const result = await window.electronAPI.listTxtDirectory(dirPath);
        if (!result.success) return;

        for (const item of result.items) {
            if (item.isDirectory) {
                await collectTxtFilesRecursive(item.path);
            } else if (item.isFile && item.name.toLowerCase().endsWith('.txt')) {
                cachedTxtFiles.push({
                    name: item.name,
                    path: item.path,
                    relativePath: item.path.replace(state.txtFolderBasePath + '\\', '')
                });
            }
        }
    } catch (error) {
        console.error('TXTファイル収集エラー:', error);
    }
}

// TXTフォルダ検索の設定
function setupTxtFolderSearch() {
    const searchInput = document.getElementById('txtFolderSearchInput');
    if (!searchInput) return;

    // 既存のリスナーを削除して新しいリスナーを追加
    searchInput.removeEventListener('input', handleTxtFolderSearch);
    searchInput.addEventListener('input', handleTxtFolderSearch);
}

// TXTフォルダ検索ハンドラ
function handleTxtFolderSearch(e) {
    const query = e.target.value.trim();

    if (txtSearchTimeout) {
        clearTimeout(txtSearchTimeout);
    }

    if (!query) {
        clearTxtFolderSearch();
        return;
    }

    txtSearchTimeout = setTimeout(() => {
        searchTxtFiles(query);
    }, 300);
}

// TXTファイル検索
function searchTxtFiles(query) {
    const folderTree = document.getElementById('txtFolderTree');
    const searchResults = document.getElementById('txtFolderSearchResults');

    if (!query) {
        clearTxtFolderSearch();
        return;
    }

    const lowerQuery = query.toLowerCase();
    const matches = cachedTxtFiles.filter(file =>
        file.name.toLowerCase().includes(lowerQuery) ||
        file.relativePath.toLowerCase().includes(lowerQuery)
    );

    // フォルダツリーを非表示、検索結果を表示
    folderTree.style.display = 'none';
    searchResults.style.display = 'block';

    if (matches.length === 0) {
        searchResults.innerHTML = '<div class="json-folder-loading">該当するTXTファイルが見つかりません</div>';
        return;
    }

    searchResults.innerHTML = '';
    matches.forEach(file => {
        const isSelected = selectedTxtFiles.some(f => f.path === file.path);
        const escapedPath = file.path.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

        const itemEl = document.createElement('div');
        itemEl.className = 'json-folder-item file txt-file search-result-item' + (isSelected ? ' selected' : '');
        itemEl.setAttribute('data-path', file.path);
        itemEl.setAttribute('data-name', file.name);

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'txt-file-checkbox';
        checkbox.checked = isSelected;
        checkbox.addEventListener('click', (e) => e.stopPropagation());
        checkbox.addEventListener('change', (e) => {
            toggleTxtFileSelection(file.path, file.name, e.target.checked, itemEl);
        });

        const icon = document.createElement('span');
        icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>`;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'file-name';
        nameSpan.textContent = file.name;

        const pathSpan = document.createElement('span');
        pathSpan.className = 'search-result-path';
        pathSpan.textContent = file.relativePath;

        itemEl.appendChild(checkbox);
        itemEl.appendChild(icon);
        itemEl.appendChild(nameSpan);
        itemEl.appendChild(pathSpan);

        // 行クリックでチェックボックスをトグル
        itemEl.addEventListener('click', (e) => {
            e.stopPropagation();
            checkbox.checked = !checkbox.checked;
            toggleTxtFileSelection(file.path, file.name, checkbox.checked, itemEl);
        });

        searchResults.appendChild(itemEl);
    });
}

// TXTフォルダ検索をクリア
function clearTxtFolderSearch() {
    const folderTree = document.getElementById('txtFolderTree');
    const searchResults = document.getElementById('txtFolderSearchResults');
    const searchInput = document.getElementById('txtFolderSearchInput');

    if (folderTree) folderTree.style.display = 'block';
    if (searchResults) {
        searchResults.style.display = 'none';
        searchResults.innerHTML = '';
    }
    if (searchInput) searchInput.value = '';
}


// ES Module exports
export { openNoteGem, openTxtSourceSelectModal, closeTxtSourceSelectModal, selectTxtSourceLocal, openTxtAddSourceSelectModal, closeTxtAddSourceSelectModal, selectTxtAddSourceLocal, openTxtAddFolderBrowser, openTxtFolderBrowser, closeTxtFolderBrowser, loadTxtFolderContents, createTxtFolderItem, toggleTxtFileSelection, updateTxtSelectionUI, loadSelectedTxtFiles, cacheTxtFiles, collectTxtFilesRecursive, setupTxtFolderSearch, handleTxtFolderSearch, searchTxtFiles, clearTxtFolderSearch };

// Expose to window for inline HTML handlers
Object.assign(window, { openNoteGem, openTxtSourceSelectModal, closeTxtSourceSelectModal, selectTxtSourceLocal, openTxtAddSourceSelectModal, closeTxtAddSourceSelectModal, selectTxtAddSourceLocal, openTxtAddFolderBrowser, openTxtFolderBrowser, closeTxtFolderBrowser, loadTxtFolderContents, createTxtFolderItem, toggleTxtFileSelection, updateTxtSelectionUI, loadSelectedTxtFiles, cacheTxtFiles, collectTxtFilesRecursive, setupTxtFolderSearch, handleTxtFolderSearch, searchTxtFiles, clearTxtFolderSearch });
