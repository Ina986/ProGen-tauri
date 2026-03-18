/* =========================================
   JSONフォルダブラウザ機能（Gドライブ連携）
   ========================================= */

import { state, defaultSymbolRules } from './progen-state.js';
// グローバル状態
let jsonFolderBasePath = '';
let allJsonFilesCache = [];
// [moved to state] currentLoadedJson
// [moved to state] currentJsonPath
let jsonFolderSearchTimeout = null;
let jsonFolderBrowserMode = 'edit'; // 'edit' = 既存JSON読込, 'save' = 保存先選択
// state.pendingNewCreationMode は state に移動済み
let selectedSaveFolderPath = ''; // 保存先として選択されたフォルダパス
let pendingSaveAfterFolderSelect = false; // フォルダ選択後に保存を実行するか
let pendingSaveAsNew = false; // 別名保存フラグ
let targetExpandFolder = ''; // 自動展開対象のフォルダ名
let jsonFolderExpandedLabel = { path: '', name: '' }; // 展開中のレーベルフォルダ

// ランディング画面のレーベル選択をリセット
function resetLandingLabelSelector() {
    const landingLabel = document.getElementById('landingLabelSelect');
    if (landingLabel) landingLabel.value = '';
}

// ランディング画面からの新規作成（レーベル選択モーダルを開いて選択後に遷移）
function handleLandingNewCreation(mode) {
    state.pendingNewCreationMode = mode;
    openLabelSelectModal('landing');
}

// 新規作成を開始（直接メイン画面へ）
async function startNewCreation(mode) {
    // メイン画面のセレクターを初期化（新規作成なのでレーベル未選択状態）
    const selectorGroup = document.getElementById('labelSelectorGroup');
    const displayGroup = document.getElementById('labelDisplayGroup');
    if (selectorGroup) selectorGroup.style.display = 'flex';
    if (displayGroup) displayGroup.style.display = 'none';

    const mainSelector = document.getElementById('labelSelector');
    if (mainSelector) {
        mainSelector.value = '';
    }

    // ボタンテキストを「未選択」に
    const labelText = document.getElementById('labelSelectorText');
    if (labelText) {
        labelText.textContent = '未選択';
        labelText.classList.add('unselected');
    }

    // 表記ルールを初期化（レーベル選択後に読み込まれる）
    state.currentProofRules = [];
    symbolRules = [...defaultSymbolRules];

    // 保存先はまだ未設定（JSONに保存ボタンを押したときに選択）
    state.currentJsonPath = '';
    state.currentLoadedJson = null;

    // 校正モードの場合は直接校正ページへ遷移
    if (mode === 'proofreading') {
        // 校正ページのレーベル状態を未選択に設定
        const proofreadingLabelSelect = document.getElementById('proofreadingLabelSelect');
        const proofreadingLabelText = document.getElementById('proofreadingLabelSelectorText');
        if (proofreadingLabelSelect) {
            proofreadingLabelSelect.value = '';
        }
        if (proofreadingLabelText) {
            proofreadingLabelText.textContent = '未選択';
            proofreadingLabelText.classList.add('unselected');
        }

        // 校正ページのJSON表示はクリア
        const proofJsonIndicator = document.getElementById('proofreadingJsonIndicator');
        if (proofJsonIndicator) {
            proofJsonIndicator.style.display = 'none';
        }

        // ランディングから直接校正ページへ（アニメーション付き）
        const landing = document.getElementById('landingScreen');
        const main = document.getElementById('mainWrapper');
        const proofreading = document.getElementById('proofreadingPage');

        landing.classList.add('page-transition-out-zoom');
        setTimeout(() => {
            landing.style.display = 'none';
            main.style.display = 'none';
            landing.classList.remove('page-transition-out-zoom');

            proofreading.style.display = 'flex';
            proofreading.classList.add('page-transition-zoom-in');
            setTimeout(() => {
                proofreading.classList.remove('page-transition-zoom-in');
            }, 350);
        }, 250);

        // 校正ページの初期化
        state.currentProofreadingMode = 'simple';
        state.proofreadingReturnTo = 'landing';

        // モードボタンのアクティブ状態を更新
        document.querySelectorAll('.proofreading-mode-btn').forEach(btn => {
            if (btn.dataset.mode === 'simple') {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // チェック項目表示を更新
        updateProofreadingCheckItems();
        updateProofreadingOptionsLabel();
        renderProofreadingFileList();
        updateProofreadingPrompt();
        return;
    }

    const isFormatting = (mode === 'formatting');

    // 抽出モード / 整形モードの場合
    // ランディング画面を非表示にしてメイン画面を表示
    hideLandingScreen();

    // 画面表示を更新（編集モードで初期表示）
    state.currentViewMode = 'edit';
    renderTable();
    showEditMode();
    renderSymbolTable();
    generateXML();

    // JSONに保存ボタンを表示（新規作成なので「保存」）
    const saveBtn = document.getElementById('saveToJsonBtn');
    if (saveBtn) {
        saveBtn.textContent = '保存';
        saveBtn.style.display = 'inline-block';
    }

    // ヘッダーのJSON表示はクリア（まだ保存先未定）
    const jsonIndicator = document.getElementById('loadedJsonIndicator');
    if (jsonIndicator) {
        jsonIndicator.style.display = 'none';
    }

    // 校正ページのJSON表示もクリア
    const proofJsonIndicator = document.getElementById('proofreadingJsonIndicator');
    if (proofJsonIndicator) {
        proofJsonIndicator.style.display = 'none';
    }

    // 添付ファイルトグルとGeminiボタンをロック状態にする（レーベル選択後にロック解除）
    if (typeof disableDataTypeToggle === 'function') disableDataTypeToggle();
    const geminiBtn = document.getElementById('extractionGeminiBtn');
    if (geminiBtn) {
        geminiBtn.setAttribute('disabled', 'disabled');
    }

    // 整形モードの場合はTXTのみに設定
    if (isFormatting) {
        selectDataType('txt_only');
    }
}

// JSONフォルダブラウザを開く
async function openJsonFolderBrowser(mode = 'edit', autoExpandLabel = '') {
    if (!window.electronAPI || !window.electronAPI.isElectron) {
        showToast('この機能はElectronアプリでのみ使用できます', 'error');
        return;
    }

    jsonFolderBrowserMode = mode;
    selectedSaveFolderPath = '';
    jsonFolderExpandedLabel = { path: '', name: '' };

    // 自動展開対象のフォルダ名を設定
    targetExpandFolder = autoExpandLabel || '';

    const modal = document.getElementById('jsonFolderBrowserModal');

    // saveモード時のみ「新規作品を登録」ボタンを表示
    const newWorkBtn = document.getElementById('jsonFolderNewWorkBtn');
    if (newWorkBtn) {
        newWorkBtn.style.display = (mode === 'save') ? 'inline-flex' : 'none';
    }
    const folderTree = document.getElementById('jsonFolderTree');
    const currentPathDisplay = document.getElementById('jsonFolderCurrentPath');
    const searchInput = document.getElementById('jsonFolderSearchInput');
    const modalTitle = modal.querySelector('.modal-header span:first-child');

    // モードに応じてタイトルを変更
    if (modalTitle) {
        if (mode === 'save') {
            modalTitle.textContent = 'Gドライブ - 保存先を選択';
        } else {
            modalTitle.textContent = 'Gドライブ - JSONファイル選択';
        }
    }

    modal.style.display = 'flex';
    folderTree.innerHTML = '<div class="json-folder-loading">読み込み中...</div>';

    // 検索フィールドをリセット
    if (searchInput) {
        searchInput.value = '';
    }
    clearJsonFolderSearch();

    try {
        // ベースパスを取得
        jsonFolderBasePath = await window.electronAPI.getJsonFolderPath();
        currentPathDisplay.textContent = jsonFolderBasePath;

        // ルートフォルダの内容を読み込み
        await loadJsonFolderContents(jsonFolderBasePath, folderTree, true);

        // バックグラウンドでJSONファイル一覧をキャッシュ
        cacheAllJsonFiles(jsonFolderBasePath);
    } catch (error) {
        console.error('フォルダの読み込みに失敗:', error);
        folderTree.innerHTML = '<div class="json-folder-loading">読み込みに失敗しました: ' + error.message + '</div>';
    }
}

// JSONフォルダブラウザを閉じる
function closeJsonFolderBrowser() {
    const modal = document.getElementById('jsonFolderBrowserModal');
    modal.style.display = 'none';
}

// 読み込み済みJSONの紐づけを解除（編集中データは保持）
function clearLoadedJsonSelection() {
    const hadJsonSelection = Boolean(state.currentJsonPath);

    state.currentJsonPath = '';
    pendingSaveAfterFolderSelect = false;
    pendingSaveAsNew = false;
    selectedSaveFolderPath = '';

    const jsonIndicator = document.getElementById('loadedJsonIndicator');
    const jsonFilename = document.getElementById('loadedJsonFilename');
    if (jsonIndicator) jsonIndicator.style.display = 'none';
    if (jsonFilename) jsonFilename.textContent = '';

    const proofJsonIndicator = document.getElementById('proofreadingJsonIndicator');
    const proofJsonFilename = document.getElementById('proofreadingJsonFilename');
    if (proofJsonIndicator) proofJsonIndicator.style.display = 'none';
    if (proofJsonFilename) proofJsonFilename.textContent = '';

    const saveBtn = document.getElementById('saveToJsonBtn');
    const saveAsBtn = document.getElementById('saveAsJsonBtn');
    if (saveBtn) {
        saveBtn.textContent = '保存';
        saveBtn.style.display = 'inline-block';
    }
    if (saveAsBtn) {
        saveAsBtn.style.display = 'none';
    }

    if (typeof updateHeaderSaveButtons === 'function') {
        updateHeaderSaveButtons();
    }

    if (hadJsonSelection) {
        showToast('JSON選択をクリアしました', 'success');
    }
}

// フォルダ内容を読み込んで表示
async function loadJsonFolderContents(dirPath, container, isRootLevel = false) {
    const result = await window.electronAPI.listDirectory(dirPath);

    if (!result.success) {
        container.innerHTML = '<div class="json-folder-loading">エラー: ' + result.error + '</div>';
        return;
    }

    container.innerHTML = '';

    // フォルダを先に、ファイルを後に表示（アルファベット順）
    const folders = result.items.filter(item => item.isDirectory).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    const files = result.items.filter(item => item.isFile).sort((a, b) => a.name.localeCompare(b.name, 'ja'));

    const sortedItems = [...folders, ...files];

    if (sortedItems.length === 0) {
        container.innerHTML = '<div class="json-folder-loading">フォルダが空です</div>';
        return;
    }

    for (const item of sortedItems) {
        const itemEl = createJsonFolderItem(item, isRootLevel);
        container.appendChild(itemEl);
    }
}

// フォルダ/ファイル項目要素を作成
function createJsonFolderItem(item, isRootLevel = false) {
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
                    await loadJsonFolderContents(item.path, childrenContainer);
                    isLoaded = true;
                }
                // ルートレベルのフォルダ展開時、レーベル情報を記録
                if (isRootLevel) {
                    jsonFolderExpandedLabel = { path: item.path, name: item.name };
                }
            } else {
                toggle.classList.remove('expanded');
                childrenContainer.classList.remove('expanded');
                // ルートレベルのフォルダ折りたたみ時、レーベル情報をクリア
                if (isRootLevel && jsonFolderExpandedLabel.name === item.name) {
                    jsonFolderExpandedLabel = { path: '', name: '' };
                }
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

        // ルートレベルで自動展開対象のフォルダの場合、自動展開してスクロール
        if (isRootLevel && targetExpandFolder && item.name === targetExpandFolder) {
            // 少し遅延を入れて展開（DOM反映後）
            setTimeout(async () => {
                await toggleFolder();
                // フォルダをビューにスクロール
                itemEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // ハイライト効果
                itemEl.style.backgroundColor = 'var(--ink-blue-light)';
                setTimeout(() => {
                    itemEl.style.backgroundColor = '';
                }, 2000);
            }, 100);
        }

    } else {
        // ファイル
        itemEl.classList.add('file');

        const icon = document.createElement('span');

        if (item.name.toLowerCase().endsWith('.json')) {
            itemEl.classList.add('json-file');
            icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

            itemEl.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (jsonFolderBrowserMode === 'save') {
                    // 保存モード：既存JSONに上書きするか確認
                    await selectJsonForOverwrite(item.path, item.name);
                } else {
                    // 編集モード：JSONを読み込み
                    await loadJsonFileFromGdrive(item.path, item.name);
                }
            });
        } else {
            icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
            itemEl.style.opacity = '0.5';
            itemEl.style.cursor = 'default';
        }

        itemEl.appendChild(icon);

        const name = document.createElement('span');
        name.textContent = item.name;
        itemEl.appendChild(name);

        wrapper.appendChild(itemEl);
    }

    return wrapper;
}

// 全てのJSONファイルを再帰的に取得してキャッシュ
async function cacheAllJsonFiles(dirPath) {
    allJsonFilesCache = [];
    await collectJsonFilesRecursive(dirPath);
    console.log(`JSONファイルキャッシュ完了: ${allJsonFilesCache.length}件`);
}

// 再帰的にJSONファイルを収集
async function collectJsonFilesRecursive(dirPath) {
    try {
        const result = await window.electronAPI.listDirectory(dirPath);
        if (!result.success) return;

        for (const item of result.items) {
            if (item.isDirectory) {
                await collectJsonFilesRecursive(item.path);
            } else if (item.isFile && item.name.toLowerCase().endsWith('.json')) {
                // 相対パスを計算
                const relativePath = item.path.replace(jsonFolderBasePath, '').replace(/^[\\\/]/, '');
                allJsonFilesCache.push({
                    name: item.name,
                    path: item.path,
                    relativePath: relativePath
                });
            }
        }
    } catch (error) {
        console.error('ファイル収集エラー:', error);
    }
}

// 検索を実行
function performJsonFolderSearch(query) {
    if (!query) {
        clearJsonFolderSearch();
        return;
    }

    // 検索クエリを正規化（小文字に変換）
    const normalizedQuery = query.toLowerCase();

    // ファイル名で検索（部分一致）
    const results = allJsonFilesCache.filter(file => {
        return file.name.toLowerCase().includes(normalizedQuery) ||
               file.relativePath.toLowerCase().includes(normalizedQuery);
    });

    displayJsonFolderSearchResults(results, query);
}

// 検索結果を表示
function displayJsonFolderSearchResults(results, query) {
    const searchResultsContainer = document.getElementById('jsonFolderSearchResults');
    const folderTree = document.getElementById('jsonFolderTree');

    if (!searchResultsContainer) return;

    // フォルダツリーを非表示、検索結果を表示
    folderTree.style.display = 'none';
    searchResultsContainer.style.display = 'block';
    searchResultsContainer.innerHTML = '';

    if (results.length === 0) {
        searchResultsContainer.innerHTML = '<div class="json-folder-loading">検索結果がありません</div>';
        return;
    }

    // 結果件数を表示
    const countEl = document.createElement('div');
    countEl.className = 'json-search-result-count';
    countEl.textContent = `${results.length}件のJSONファイルが見つかりました`;
    searchResultsContainer.appendChild(countEl);

    // 検索結果を表示
    results.forEach(file => {
        const itemEl = document.createElement('div');
        itemEl.className = 'json-folder-item file json-file json-search-result-item';

        // アイコン
        const icon = document.createElement('span');
        icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
        itemEl.appendChild(icon);

        // ファイル名（ハイライト）
        const nameEl = document.createElement('span');
        nameEl.className = 'json-search-result-name';
        nameEl.innerHTML = highlightJsonSearchMatch(file.name, query);
        itemEl.appendChild(nameEl);

        // 相対パス
        const pathEl = document.createElement('div');
        pathEl.className = 'json-search-result-path';
        pathEl.innerHTML = highlightJsonSearchMatch(file.relativePath, query);
        itemEl.appendChild(pathEl);

        // クリックイベント
        itemEl.addEventListener('click', async () => {
            await loadJsonFileFromGdrive(file.path, file.name);
        });

        searchResultsContainer.appendChild(itemEl);
    });
}

// 検索クエリに一致する部分をハイライト
function highlightJsonSearchMatch(text, query) {
    if (!query) return escapeHtmlForJson(text);

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);

    if (index === -1) {
        return escapeHtmlForJson(text);
    }

    const before = text.substring(0, index);
    const match = text.substring(index, index + query.length);
    const after = text.substring(index + query.length);

    return escapeHtmlForJson(before) + '<mark class="json-search-highlight">' + escapeHtmlForJson(match) + '</mark>' + escapeHtmlForJson(after);
}

// HTMLエスケープ（JSON用）
function escapeHtmlForJson(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 検索をクリア
function clearJsonFolderSearch() {
    const searchResultsContainer = document.getElementById('jsonFolderSearchResults');
    const folderTree = document.getElementById('jsonFolderTree');

    if (searchResultsContainer) {
        searchResultsContainer.style.display = 'none';
        searchResultsContainer.innerHTML = '';
    }
    if (folderTree) {
        folderTree.style.display = 'block';
    }
}

// JSONファイルをGドライブから読み込み
async function loadJsonFileFromGdrive(filePath, fileName) {
    try {
        const result = await window.electronAPI.readJsonFile(filePath);

        if (!result.success) {
            showToast('JSONファイルの読み込みに失敗しました: ' + result.error, 'error');
            return;
        }

        console.log('JSONファイル読み込み成功:', fileName, result.data);

        // モーダルを閉じる
        closeJsonFolderBrowser();

        // グローバル状態に保存
        state.currentLoadedJson = result.data;
        state.currentJsonPath = filePath;

        // JSONデータを処理
        const { fallbackLabel } = await processLoadedJson(result.data, fileName);

        // モードに応じて遷移先を変更（通知より先に遷移）
        if (jsonFolderBrowserMode === 'proofreading') {
            goToProofreadingPageFromMain('simple');
        } else if (jsonFolderBrowserMode === 'formatting') {
            selectDataType('txt_only');
        }

        // 読み込み成功通知（フォールバック時はwarningで表示）
        if (fallbackLabel) {
            showToast(`"${fileName}" を読み込みました（表記ルールが未登録のため、${fallbackLabel}のルールを暫定表示しています）`, 'warning');
        } else {
            showToast(`"${fileName}" を読み込みました`, 'success');
        }

    } catch (error) {
        console.error('JSONファイルの読み込みに失敗:', error);
        showToast('JSONファイルの読み込みに失敗しました: ' + error.message, 'error');
    }
}

// 選択されたフォルダの情報を一時保存
let selectedFolderPath = '';
let selectedFolderName = '';

// フォルダを保存先として選択
async function selectFolderForSave(folderPath, folderName) {
    // フォルダ情報を保存
    selectedFolderPath = folderPath;
    selectedFolderName = folderName;

    // JSONフォルダブラウザを閉じる
    closeJsonFolderBrowser();

    // アクション選択モーダルを表示
    const modal = document.getElementById('folderActionModal');
    const folderNameEl = document.getElementById('folderActionFolderName');
    if (folderNameEl) {
        folderNameEl.textContent = `保存先: ${folderName}`;
    }

    modal.style.display = 'flex';
}

// アクション選択モーダルを閉じる
function closeFolderActionModal() {
    const modal = document.getElementById('folderActionModal');
    modal.style.display = 'none';
    pendingSaveAfterFolderSelect = false;
    pendingSaveAsNew = false;
}

// フォルダブラウザから直接新規作品登録を開始
function startNewWorkFromBrowser() {
    if (!jsonFolderExpandedLabel.name) {
        showToast('レーベルフォルダを展開してから「新規作品を登録」を押してください。', 'warning');
        return;
    }
    selectedFolderPath = jsonFolderExpandedLabel.path;
    selectedFolderName = jsonFolderExpandedLabel.name;
    closeJsonFolderBrowser();
    // 他のモーダルが完全に閉じてからフォームを表示
    setTimeout(() => showNewWorkForm(), 150);
}

// 新規作品登録フォームを表示
function showNewWorkForm() {
    closeFolderActionModal();

    // 他のモーダルオーバーレイが残っていないことを保証する
    const allModals = document.querySelectorAll('.modal-overlay');
    allModals.forEach(m => {
        if (m.id !== 'newWorkModal' && m.style.display !== 'none') {
            m.style.display = 'none';
        }
    });

    const modal = document.getElementById('newWorkModal');
    const input = document.getElementById('newWorkTitle');
    input.value = '';
    // フォルダ名をレーベルとして表示
    const folderInfo = document.getElementById('newWorkFolderInfo');
    if (folderInfo) {
        folderInfo.innerHTML = `<span style="color:#888; font-weight:normal; font-size:0.9em;">レーベル：</span>${escapeHtml(selectedFolderName)}`;
    }

    // backdrop-filterを無効化してChromium描画問題を回避
    modal.style.backdropFilter = 'none';
    modal.style.webkitBackdropFilter = 'none';
    modal.style.zIndex = '1100';
    modal.style.display = 'flex';

    // 入力フィールドがインタラクティブであることを保証
    input.style.pointerEvents = 'auto';
    input.style.position = 'relative';
    input.style.zIndex = '10';
    input.removeAttribute('disabled');
    input.removeAttribute('readonly');

    // リフローを強制してからフォーカス
    void modal.offsetHeight;

    setTimeout(() => {
        input.focus();
    }, 100);
}

// 新規作品登録モーダルを閉じる
function closeNewWorkModal() {
    const modal = document.getElementById('newWorkModal');
    modal.style.display = 'none';
    // インラインスタイルをリセット（次回CSSデフォルトが適用される）
    modal.style.backdropFilter = '';
    modal.style.webkitBackdropFilter = '';
    modal.style.zIndex = '';
    pendingSaveAfterFolderSelect = false;
    pendingSaveAsNew = false;
}

// 新規作品としてJSONを作成
async function createNewWorkJson() {
    const title = document.getElementById('newWorkTitle').value.trim();
    // レーベルは選択したフォルダ名を使用
    const label = selectedFolderName;

    if (!title) {
        showToast('作品名を入力してください', 'warning');
        return;
    }

    // ファイル名をサニタイズ
    const sanitizedName = title.replace(/[<>:"/\\|?*]/g, '_').trim();
    const fullFileName = sanitizedName + '.json';
    const fullPath = selectedFolderPath + '\\' + fullFileName;

    // 新規作品用のJSONを構築（新形式: proofRules + presetData）
    const newWorkJson = {
        proofRules: {
            proof: state.currentProofRules,
            symbol: state.symbolRules,
            options: {
                ngWordMasking: state.optionNgWordMasking,
                punctuationToSpace: state.optionPunctuationToSpace,
                difficultRuby: state.optionDifficultRuby,
                typoCheck: state.optionTypoCheck,
                missingCharCheck: state.optionMissingCharCheck,
                nameRubyCheck: state.optionNameRubyCheck,
                nonJoyoCheck: state.optionNonJoyoCheck,
                numberRulePersonCount: state.numberRulePersonCount,
                numberRuleThingCount: state.numberRuleThingCount,
                numberRuleMonth: state.numberRuleMonth,
                numberSubRulesEnabled: state.numberSubRulesEnabled
            }
        },
        presetData: {
            presets: {
                "デフォルト": []
            },
            fontSizeStats: {
                mostFrequent: 15,
                sizes: [],
                excludeRange: { min: 6.5, max: 8.5 }
            },
            strokeSizes: [],
            guides: { horizontal: [], vertical: [] },
            guideSets: [],
            selectedGuideSetIndex: 0,
            workInfo: {
                genre: "",
                label: label,
                authorType: "single",
                author: "",
                artist: "",
                original: "",
                title: title,
                subtitle: "",
                editor: "",
                volume: 1,
                storagePath: "",
                notes: ""
            },
            saveLocation: label || "",
            selectionRanges: []
        }
    };

    try {
        const result = await window.electronAPI.writeJsonFile(fullPath, newWorkJson);

        if (!result.success) {
            showToast('保存に失敗しました: ' + result.error, 'error');
            return;
        }

        // 校正テキストログ側にも作品フォルダを作成
        const txtLabel = labelToTxtFolderMapping[label] || label;
        const txtResult = await window.electronAPI.createTxtWorkFolder(txtLabel, sanitizedName);
        if (!txtResult.success) {
            console.warn('校正テキストログフォルダの作成に失敗:', txtResult.error);
        }

        // モーダルを閉じる
        closeNewWorkModal();

        // グローバル状態を更新
        state.currentJsonPath = fullPath;
        state.currentLoadedJson = newWorkJson;

        // ヘッダーにファイル名を表示
        const jsonIndicator = document.getElementById('loadedJsonIndicator');
        const jsonFilenameSpan = document.getElementById('loadedJsonFilename');
        if (jsonIndicator && jsonFilenameSpan) {
            jsonFilenameSpan.textContent = fullFileName;
            jsonIndicator.style.display = 'flex';
        }

        // 保存ボタンを表示
        const saveBtn = document.getElementById('saveToJsonBtn');
        const saveAsBtn = document.getElementById('saveAsJsonBtn');
        if (saveBtn) {
            saveBtn.style.display = '';
            saveBtn.textContent = '上書き保存';
        }
        if (saveAsBtn) {
            saveAsBtn.style.display = '';
        }

        showToast(`"${fullFileName}" を作成しました`, 'success');

    } catch (error) {
        console.error('新規作品登録エラー:', error);
        showToast('保存に失敗しました: ' + error.message, 'error');
    }

    pendingSaveAfterFolderSelect = false;
    pendingSaveAsNew = false;
}

// 既存JSONを上書き保存先として選択
async function selectJsonForOverwrite(jsonPath, jsonName) {
    const confirmOverwrite = confirm(`"${jsonName}" に上書き保存しますか？\n\n既存の内容にproofRulesが追加されます。`);

    if (!confirmOverwrite) {
        pendingSaveAfterFolderSelect = false;
        return;
    }

    try {
        // 既存のJSONを読み込み
        const result = await window.electronAPI.readJsonFile(jsonPath);

        if (!result.success) {
            showToast('JSONファイルの読み込みに失敗しました: ' + result.error, 'error');
            pendingSaveAfterFolderSelect = false;
            return;
        }

        // グローバル状態に保存（旧形式の場合は新形式に正規化）
        const data = result.data;
        if (data.presetData !== undefined) {
            state.currentLoadedJson = data;
        } else {
            const { proofRules: oldProof, ...rest } = data;
            state.currentLoadedJson = {
                proofRules: oldProof || { proof: [], symbol: [], options: {} },
                presetData: rest
            };
        }
        state.currentJsonPath = jsonPath;

        // モーダルを閉じる
        closeJsonFolderBrowser();

        // ヘッダーにファイル名を表示
        const jsonIndicator = document.getElementById('loadedJsonIndicator');
        const jsonFilenameSpan = document.getElementById('loadedJsonFilename');
        if (jsonIndicator && jsonFilenameSpan) {
            jsonFilenameSpan.textContent = jsonName;
            jsonIndicator.style.display = 'flex';
        }

        // 保存待ちの場合は保存を実行
        if (pendingSaveAfterFolderSelect) {
            pendingSaveAfterFolderSelect = false;
            await saveProofRulesToJson();
        }

    } catch (error) {
        console.error('JSONファイルの読み込みに失敗:', error);
        showToast('JSONファイルの読み込みに失敗しました: ' + error.message, 'error');
        pendingSaveAfterFolderSelect = false;
    }
}

// プリセットレーベル名と値のマッピング
const presetLabelMap = {
    '変更なし': 'default',
    '汎用': 'default',
    '汎用 (標準)': 'default',
    'Nupu': 'nupu',
    'カゲキヤコミック': 'kagekiya_comic',
    'もえスタビースト': 'moesta_beast',
    '＠夜噺': 'at_yobanashi',
    'オトメチカ': 'otomechika',
    'Spicomi': 'spicomi',
    'Ropopo': 'ropopo',
    'DEDEDE': 'dedede',
    'GG-COMICS': 'ggcomics',
    'コイパレ・キスカラ': 'koipare_kiskara',
    'カルコミ': 'karukomi',
    'コミックREBEL': 'default', // カスタムレーベルはdefaultにフォールバック
};

// レーベル名からプリセットレーベル値を検索
function findMatchingPresetLabel(labelName) {
    if (!labelName) return null;

    // 完全一致を検索
    if (presetLabelMap[labelName]) {
        return presetLabelMap[labelName];
    }

    // 部分一致を検索（大文字小文字無視）
    const lowerName = labelName.toLowerCase();
    for (const [key, value] of Object.entries(presetLabelMap)) {
        if (key.toLowerCase() === lowerName || lowerName.includes(key.toLowerCase())) {
            return value;
        }
    }

    return null;
}

// 読み込んだJSONを処理
async function processLoadedJson(data, fileName) {
    // 新形式（proofRules + presetData）と旧形式（フラット）の両方に対応
    const isNewFormat = data.presetData !== undefined;
    const presetData = isNewFormat ? data.presetData : data;

    // 1. workInfo.labelからレーベル名を取得
    const labelName = presetData.workInfo?.label || '';
    console.log('レーベル名:', labelName);

    // 2. 表記ルールがあれば読み込み
    const proofRules = data.proofRules;
    const hasProofRules = proofRules && proofRules.proof && Array.isArray(proofRules.proof) && proofRules.proof.length > 0;

    if (hasProofRules) {
        state.currentProofRules = proofRules.proof;
        // カテゴリがないルールにはデフォルトを設定、人物名にはaddRubyを設定
        state.currentProofRules.forEach(r => {
            if (!r.category) r.category = 'basic';
            // 人物名でaddRubyが未設定の場合はtrueに
            if (r.category === 'character' && r.addRuby === undefined) {
                r.addRuby = true;
            }
        });
    }
    if (proofRules) {
        if (proofRules.symbol && Array.isArray(proofRules.symbol)) {
            state.symbolRules = proofRules.symbol;
        }
        // オプション設定があれば読み込み
        if (proofRules.options) {
            const opts = proofRules.options;
            if (opts.ngWordMasking !== undefined) state.optionNgWordMasking = opts.ngWordMasking;
            if (opts.punctuationToSpace !== undefined) state.optionPunctuationToSpace = opts.punctuationToSpace;
            if (opts.difficultRuby !== undefined) state.optionDifficultRuby = opts.difficultRuby;
            if (opts.typoCheck !== undefined) state.optionTypoCheck = opts.typoCheck;
            if (opts.missingCharCheck !== undefined) state.optionMissingCharCheck = opts.missingCharCheck;
            if (opts.nameRubyCheck !== undefined) state.optionNameRubyCheck = opts.nameRubyCheck;
            if (opts.nonJoyoCheck !== undefined) state.optionNonJoyoCheck = opts.nonJoyoCheck;
            if (opts.numberRuleBase !== undefined) state.numberRuleBase = opts.numberRuleBase;
            if (opts.numberRulePersonCount !== undefined) state.numberRulePersonCount = opts.numberRulePersonCount;
            if (opts.numberRuleThingCount !== undefined) state.numberRuleThingCount = opts.numberRuleThingCount;
            if (opts.numberRuleMonth !== undefined) state.numberRuleMonth = opts.numberRuleMonth;
            if (opts.numberSubRulesEnabled !== undefined) state.numberSubRulesEnabled = opts.numberSubRulesEnabled;
        }
    }

    // 表記ルールが空の場合：レーベルのマスタールール → 汎用ルールにフォールバック
    let fallbackLabel = null;
    if (!hasProofRules) {
        fallbackLabel = '';
        if (labelName) {
            await loadMasterRule(labelName);
            if (state.currentProofRules.length > 0) {
                fallbackLabel = labelName;
            }
        }
        if (!fallbackLabel) {
            await loadMasterRule('変更なし');
            fallbackLabel = '変更なし';
        }
    }

    // 旧形式の場合は新形式に正規化してstate.currentLoadedJsonに保存
    if (!isNewFormat) {
        const { proofRules: oldProof, ...rest } = data;
        state.currentLoadedJson = {
            proofRules: oldProof || { proof: [], symbol: [], options: {} },
            presetData: rest
        };
    }

    // 3. レーベル表示を設定（JSONから読み込んだ場合は表示専用にする）
    const selectorGroup = document.getElementById('labelSelectorGroup');
    const displayGroup = document.getElementById('labelDisplayGroup');
    const displayText = document.getElementById('labelDisplayText');

    if (labelName) {
        // JSONにレーベル名がある場合：ドロップダウンを非表示、表示専用を表示
        if (selectorGroup) selectorGroup.style.display = 'none';
        if (displayGroup) displayGroup.style.display = 'flex';
        if (displayText) displayText.textContent = labelName;
    } else {
        // レーベル名がない場合：ドロップダウンを表示
        if (selectorGroup) selectorGroup.style.display = 'flex';
        if (displayGroup) displayGroup.style.display = 'none';
        const selector = document.getElementById('labelSelector');
        if (selector) selector.value = '';
    }

    // 4. ランディング画面を非表示にしてメイン画面を表示
    hideLandingScreen();

    // 5. 画面表示を更新（編集モードで初期表示）
    state.currentViewMode = 'edit';
    renderTable();
    showEditMode();
    renderSymbolTable();
    generateXML();

    // 6. JSON保存ボタンを表示（読み込み済みなので「上書き保存」）
    const saveBtn = document.getElementById('saveToJsonBtn');
    const saveAsBtn = document.getElementById('saveAsJsonBtn');
    if (saveBtn) {
        saveBtn.textContent = '上書き保存';
        saveBtn.style.display = 'inline-block';
    }
    if (saveAsBtn) {
        saveAsBtn.style.display = 'inline-block';
    }

    // 7. ヘッダーに読み込んだJSONファイル名を表示（抽出ページ）
    const jsonIndicator = document.getElementById('loadedJsonIndicator');
    const jsonFilenameSpan = document.getElementById('loadedJsonFilename');
    if (jsonIndicator && jsonFilenameSpan) {
        jsonFilenameSpan.textContent = fileName;
        jsonIndicator.style.display = 'flex';
    }

    // 8. 校正ページにもJSONファイル名を表示
    const proofJsonIndicator = document.getElementById('proofreadingJsonIndicator');
    const proofJsonFilename = document.getElementById('proofreadingJsonFilename');
    if (proofJsonIndicator && proofJsonFilename) {
        proofJsonFilename.textContent = fileName;
        proofJsonIndicator.style.display = 'flex';
    }

    // 9. 校正ページのオプションラベルを更新（JSON読み込み状態に応じて）
    updateProofreadingOptionsLabel();

    // 10. 添付ファイルトグルとGeminiボタンのロックを解除（JSONファイル読み込み時）
    if (typeof enableDataTypeToggle === 'function') enableDataTypeToggle();
    const geminiBtn = document.getElementById('extractionGeminiBtn');
    if (geminiBtn) {
        geminiBtn.removeAttribute('disabled');
    }

    return { fallbackLabel };
}

// 表記ルールをJSONに保存（最適化版：workInfoの直後に配置、オプションも保存）
async function saveProofRulesToJson() {
    if (!window.electronAPI || !window.electronAPI.isElectron) {
        showToast('この機能はElectronアプリでのみ使用できます', 'error');
        return;
    }

    // 保存先が未設定の場合、フォルダブラウザを開いて選択させる
    if (!state.currentJsonPath) {
        pendingSaveAfterFolderSelect = true;
        // 現在選択されているレーベルを取得して自動展開用に渡す
        const currentLabel = document.getElementById('labelSelector')?.value || '';
        await openJsonFolderBrowser('save', currentLabel);
        return;
    }

    // 確認ダイアログ
    if (!confirm('現在の表記ルールをJSONファイルに保存しますか？')) {
        return;
    }

    try {
        // 新形式（proofRules + presetData）で保存
        const updatedJson = {
            proofRules: {
                proof: state.currentProofRules,
                symbol: state.symbolRules,
                options: {
                    ngWordMasking: state.optionNgWordMasking,
                    punctuationToSpace: state.optionPunctuationToSpace,
                    difficultRuby: state.optionDifficultRuby,
                    typoCheck: state.optionTypoCheck,
                    missingCharCheck: state.optionMissingCharCheck,
                    nameRubyCheck: state.optionNameRubyCheck,
                    nonJoyoCheck: state.optionNonJoyoCheck,
                    numberRuleBase: state.numberRuleBase,
                    numberRulePersonCount: state.numberRulePersonCount,
                    numberRuleThingCount: state.numberRuleThingCount,
                    numberRuleMonth: state.numberRuleMonth
                }
            },
            presetData: state.currentLoadedJson.presetData || {}
        };

        const result = await window.electronAPI.writeJsonFile(state.currentJsonPath, updatedJson);

        if (!result.success) {
            showToast('保存に失敗しました: ' + result.error, 'error');
            return;
        }

        // グローバル状態を更新
        state.currentLoadedJson = updatedJson;

        showToast('表記ルールをJSONに保存しました', 'success');
    } catch (error) {
        console.error('JSON保存エラー:', error);
        showToast('保存に失敗しました: ' + error.message, 'error');
    }
}

// 表記ルールを別のJSONに保存（別名保存）
async function saveProofRulesToNewJson() {
    if (!window.electronAPI || !window.electronAPI.isElectron) {
        showToast('この機能はElectronアプリでのみ使用できます', 'error');
        return;
    }

    // 常にフォルダブラウザを開いて新しい保存先を選択させる
    pendingSaveAfterFolderSelect = true;
    pendingSaveAsNew = true; // 別名保存フラグ
    // 現在選択されているレーベルを取得して自動展開用に渡す
    const currentLabel = document.getElementById('labelSelector')?.value || '';
    await openJsonFolderBrowser('save', currentLabel);
}

// 新しいJSONファイルに保存（別名保存用）
async function saveToNewJsonFile(newPath, newFileName) {
    try {
        // 新形式（proofRules + presetData）で保存
        const baseJson = state.currentLoadedJson || {};
        const newJson = {
            proofRules: {
                proof: state.currentProofRules,
                symbol: state.symbolRules,
                options: {
                    ngWordMasking: state.optionNgWordMasking,
                    punctuationToSpace: state.optionPunctuationToSpace,
                    difficultRuby: state.optionDifficultRuby,
                    typoCheck: state.optionTypoCheck,
                    missingCharCheck: state.optionMissingCharCheck,
                    nameRubyCheck: state.optionNameRubyCheck,
                    nonJoyoCheck: state.optionNonJoyoCheck,
                    numberRuleBase: state.numberRuleBase,
                    numberRulePersonCount: state.numberRulePersonCount,
                    numberRuleThingCount: state.numberRuleThingCount,
                    numberRuleMonth: state.numberRuleMonth
                }
            },
            presetData: baseJson.presetData || {}
        };

        const result = await window.electronAPI.writeJsonFile(newPath, newJson);

        if (!result.success) {
            showToast('保存に失敗しました: ' + result.error, 'error');
            return;
        }

        showToast(`"${newFileName}" に保存しました`, 'success');
    } catch (error) {
        console.error('別名保存エラー:', error);
        showToast('保存に失敗しました: ' + error.message, 'error');
    }
}

// JSONフォルダブラウザのイベントリスナー設定
function initJsonFolderBrowser() {
    const closeBtn = document.getElementById('jsonFolderBrowserCloseBtn');
    const cancelBtn = document.getElementById('jsonFolderBrowserCancelBtn');
    const searchInput = document.getElementById('jsonFolderSearchInput');
    const searchClearBtn = document.getElementById('jsonFolderSearchClearBtn');

    if (closeBtn) {
        closeBtn.addEventListener('click', closeJsonFolderBrowser);
    }
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeJsonFolderBrowser);
    }

    // 検索入力イベント
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();

            // デバウンス処理
            if (jsonFolderSearchTimeout) {
                clearTimeout(jsonFolderSearchTimeout);
            }

            jsonFolderSearchTimeout = setTimeout(() => {
                performJsonFolderSearch(query);
            }, 300);
        });

        // Enterキーで検索
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (jsonFolderSearchTimeout) {
                    clearTimeout(jsonFolderSearchTimeout);
                }
                performJsonFolderSearch(searchInput.value.trim());
            }
        });
    }

    // 検索クリアボタン
    if (searchClearBtn) {
        searchClearBtn.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
            }
            clearJsonFolderSearch();
        });
    }

    // ESCキーで閉じる
    document.addEventListener('keydown', (e) => {
        const modal = document.getElementById('jsonFolderBrowserModal');
        if (e.key === 'Escape' && modal && modal.style.display === 'flex') {
            closeJsonFolderBrowser();
        }
    });
}

// 起動時の初期化は progen-main.js から実行（全モジュール読み込み後）


// ES Module exports
export { resetLandingLabelSelector, handleLandingNewCreation, startNewCreation, openJsonFolderBrowser, closeJsonFolderBrowser, clearLoadedJsonSelection, loadJsonFolderContents, createJsonFolderItem, cacheAllJsonFiles, collectJsonFilesRecursive, performJsonFolderSearch, displayJsonFolderSearchResults, highlightJsonSearchMatch, escapeHtmlForJson, clearJsonFolderSearch, loadJsonFileFromGdrive, selectFolderForSave, closeFolderActionModal, startNewWorkFromBrowser, showNewWorkForm, closeNewWorkModal, createNewWorkJson, selectJsonForOverwrite, findMatchingPresetLabel, processLoadedJson, saveProofRulesToJson, saveProofRulesToNewJson, saveToNewJsonFile, initJsonFolderBrowser };

// Expose to window for inline HTML handlers
Object.assign(window, { resetLandingLabelSelector, handleLandingNewCreation, startNewCreation, openJsonFolderBrowser, closeJsonFolderBrowser, clearLoadedJsonSelection, loadJsonFolderContents, createJsonFolderItem, cacheAllJsonFiles, collectJsonFilesRecursive, performJsonFolderSearch, displayJsonFolderSearchResults, highlightJsonSearchMatch, escapeHtmlForJson, clearJsonFolderSearch, loadJsonFileFromGdrive, selectFolderForSave, closeFolderActionModal, startNewWorkFromBrowser, showNewWorkForm, closeNewWorkModal, createNewWorkJson, selectJsonForOverwrite, findMatchingPresetLabel, processLoadedJson, saveProofRulesToJson, saveProofRulesToNewJson, saveToNewJsonFile, initJsonFolderBrowser });
