/* =========================================
   校正結果ビューア機能
========================================= */

import { state } from './progen-state.js';
let currentResultTab = 'variation'; // 'variation' or 'simple'
let currentSimpleDisplayMode = 'page'; // 'page' or 'category'
// state.currentSimpleData, state.currentVariationData は state に移動済み
let resultPickedState = new Map(); // ピックアップ状態: rowId → boolean
let resultRowData = new Map(); // 行データ: rowId → {category, page, excerpt, content, type}
let resultRowCounter = 0; // 行IDカウンター
let persistentPicked = new Map(); // タブ切り替えでも保持されるピックアップ状態: stableKey → boolean

// 安定キー生成（タブ切り替えでも一貫した識別子）
function makePickedKey(type, category, page, excerpt) {
    return `${type}|${category}|${page}|${excerpt}`;
}

// 校正データ保存用: TXTパスから取得した作品情報
let calibrationLabel = ''; // レーベル名
let calibrationWork = ''; // 作品名
let calibrationVolume = 0; // 巻数
let calibrationFolderBasePath = ''; // フォルダブラウザのベースパス
let calibrationExpandedLabel = { path: '', name: '' }; // 展開中のレーベル
let calibrationFolderSearchTimeout = null; // 検索デバウンス用
let calibrationAutoExpandFolder = ''; // フォルダブラウザ自動展開対象

// レーベル値→TXTフォルダ名マッピング（名前が異なるもののみ）
const labelToTxtFolderMapping = {
    'Nupu': 'NuPu',
    'Ropopo': 'Ropopo!',
    'オトメチカ': 'TLオトメチカ',
    'カゲキヤコミック': 'カゲキヤコミック',
    'もえスタビースト': 'もえスタビースト',
};

// ピックアップ状態の切り替え
function toggleResultPicked(rowId, checkbox) {
    resultPickedState.set(rowId, checkbox.checked);
    // 永続的な状態にも反映
    const data = resultRowData.get(rowId);
    if (data) {
        persistentPicked.set(makePickedKey(data.type, data.category, data.page, data.excerpt), checkbox.checked);
    }
}

// カテゴリ内の全チェックボックスを切り替え
function toggleCategoryPicked(masterCheckbox) {
    const card = masterCheckbox.closest('.result-category-card');
    const checkboxes = card.querySelectorAll('.result-row-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = masterCheckbox.checked;
        const rowId = cb.getAttribute('data-row-id');
        if (rowId) {
            resultPickedState.set(rowId, masterCheckbox.checked);
            const data = resultRowData.get(rowId);
            if (data) {
                persistentPicked.set(makePickedKey(data.type, data.category, data.page, data.excerpt), masterCheckbox.checked);
            }
        }
    });
}

// チェック状態を復元するための属性文字列を返す
function getCheckedAttr(type, category, page, excerpt) {
    return persistentPicked.get(makePickedKey(type, category, page, excerpt)) ? ' checked' : '';
}

// 全結果データを取得（保存用 — 提案・正誤の両方をまとめて返す）
function getPickedResultData() {
    const items = [];

    // 提案チェック（state.currentVariationData から構築）
    Object.values(state.currentVariationData).forEach(group => {
        Object.values(group.subGroups).forEach(sub => {
            sub.items.forEach(item => {
                const key = makePickedKey('variation', item.category, item.page, item.excerpt);
                items.push({
                    type: 'variation',
                    category: item.category,
                    page: item.page,
                    excerpt: item.excerpt,
                    content: item.content,
                    picked: persistentPicked.get(key) || false,
                    checkKind: getCheckKind(item.category, 'variation')
                });
            });
        });
    });

    // 正誤チェック（state.currentSimpleData から構築）
    state.currentSimpleData.forEach(item => {
        const key = makePickedKey('simple', item.category, item.page, item.excerpt);
        items.push({
            type: 'simple',
            category: item.category,
            page: item.page,
            excerpt: item.excerpt,
            content: item.content,
            picked: persistentPicked.get(key) || false,
            checkKind: getCheckKind(item.category, 'simple')
        });
    });

    return items;
}

// TXTパスから作品情報を抽出（校正データ保存用）
function extractCalibrationInfoFromPath(filePath, fileInfos) {
    try {
        if (!state.txtFolderBasePath || !filePath) return;

        // パス区切り文字を統一
        const normalizedBase = state.txtFolderBasePath.replace(/\\/g, '/');
        const normalizedPath = filePath.replace(/\\/g, '/');

        // ベースパスからの相対パスを取得
        if (!normalizedPath.startsWith(normalizedBase)) return;
        const relativePath = normalizedPath.substring(normalizedBase.length + 1); // 先頭の / を除去
        const parts = relativePath.split('/');

        // パス構造: レーベル / 作品名 / file.txt
        if (parts.length >= 3) {
            calibrationLabel = parts[0];
            calibrationWork = parts[1];
        }

        // 巻数をテキスト内の [XX巻] マーカーから検出
        let volumeFound = false;
        for (const fileInfo of fileInfos) {
            const volumeMatch = fileInfo.content.match(/\[(\d+)巻\]/);
            if (volumeMatch) {
                calibrationVolume = parseInt(volumeMatch[1]);
                volumeFound = true;
                break;
            }
        }

        // 巻数が見つからなかった場合は保存モーダルで入力してもらう
        if (!volumeFound) {
            calibrationVolume = 0;
        }

        console.log('校正データ情報:', { label: calibrationLabel, work: calibrationWork, volume: calibrationVolume });
    } catch (error) {
        console.error('作品情報の抽出に失敗:', error);
    }
}

// 校正データを保存（フォルダブラウザを表示）
async function saveCalibrationData() {
    if (!window.electronAPI || !window.electronAPI.isElectron) {
        showToast('この機能はElectronアプリでのみ使用できます', 'error');
        return;
    }

    // 結果データを事前チェック
    const items = getPickedResultData();
    if (items.length === 0) {
        showToast('保存するデータがありません。先に結果を貼り付けてください。', 'warning');
        return;
    }

    // 選択中のレーベルからTXTフォルダ名を取得（自動展開用）
    const currentLabel = document.getElementById('proofreadingLabelSelect')?.value ||
                         document.getElementById('labelSelector')?.value || '';
    calibrationAutoExpandFolder = labelToTxtFolderMapping[currentLabel] || currentLabel || '';

    // フォルダブラウザモーダルを開く
    const modal = document.getElementById('calibrationFolderModal');
    const tree = document.getElementById('calibrationFolderTree');
    const pathDisplay = document.getElementById('calibrationFolderCurrentPath');

    // 検索バーをリセット
    const searchInput = document.getElementById('calibrationFolderSearchInput');
    if (searchInput) searchInput.value = '';
    clearCalibrationFolderSearch();

    // 新規作品ボタンを非表示（レーベル展開後に表示）
    const newWorkBtn = document.getElementById('calibrationNewWorkBtn');
    if (newWorkBtn) newWorkBtn.style.display = 'none';

    // 展開中レーベル情報をリセット
    calibrationExpandedLabel = { path: '', name: '' };

    modal.style.display = 'flex';
    tree.innerHTML = '<div class="json-folder-loading">読み込み中...</div>';

    try {
        calibrationFolderBasePath = await window.electronAPI.getTxtFolderPath();
        pathDisplay.textContent = calibrationFolderBasePath;
        await loadCalibrationFolderContents(calibrationFolderBasePath, tree, 0);
    } catch (error) {
        tree.innerHTML = '<div class="json-folder-loading">読み込みに失敗しました: ' + error.message + '</div>';
    }
}

// フォルダブラウザモーダルを閉じる
function closeCalibrationFolderModal() {
    document.getElementById('calibrationFolderModal').style.display = 'none';
}

// フォルダ内容を読み込んでツリー表示（depth: 0=レーベル, 1=作品名）
async function loadCalibrationFolderContents(dirPath, container, depth) {
    const result = await window.electronAPI.listTxtDirectory(dirPath);
    if (!result.success) {
        container.innerHTML = '<div class="json-folder-loading">エラー: ' + result.error + '</div>';
        return;
    }

    container.innerHTML = '';
    const folders = result.items.filter(item => item.isDirectory).sort((a, b) => a.name.localeCompare(b.name, 'ja'));

    if (folders.length === 0) {
        container.innerHTML = '<div class="json-folder-loading">フォルダが空です</div>';
        return;
    }

    folders.forEach(item => {
        const wrapper = document.createElement('div');
        const itemEl = document.createElement('div');
        itemEl.className = 'json-folder-item folder';

        // トグル矢印
        const toggle = document.createElement('span');
        toggle.className = 'folder-toggle';
        toggle.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
        itemEl.appendChild(toggle);

        // フォルダアイコン
        const icon = document.createElement('span');
        icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
        itemEl.appendChild(icon);

        // フォルダ名
        const name = document.createElement('span');
        name.className = 'folder-name';
        name.textContent = item.name;
        itemEl.appendChild(name);

        // 作品名フォルダ（depth=1）の場合は「選択」ボタンを追加
        if (depth >= 1) {
            const selectBtn = document.createElement('button');
            selectBtn.className = 'btn btn-green btn-small';
            selectBtn.style.cssText = 'margin-left:auto; padding:2px 10px; font-size:0.8em;';
            selectBtn.textContent = '選択';
            selectBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // パスから レーベル / 作品名 を抽出
                selectCalibrationFolder(item.path, item.name);
            });
            itemEl.appendChild(selectBtn);
        }

        // 子要素コンテナ
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'json-folder-children';
        let isLoaded = false;

        const toggleFolder = async () => {
            const isExpanded = childrenContainer.classList.contains('expanded');
            if (!isExpanded) {
                toggle.classList.add('expanded');
                childrenContainer.classList.add('expanded');
                if (!isLoaded) {
                    childrenContainer.innerHTML = '<div class="json-folder-loading">読み込み中...</div>';
                    await loadCalibrationFolderContents(item.path, childrenContainer, depth + 1);
                    isLoaded = true;
                }
                // レーベルフォルダ（depth=0）展開時にフッターボタンを表示
                if (depth === 0) {
                    calibrationExpandedLabel = { path: item.path, name: item.name };
                    const newWorkBtn = document.getElementById('calibrationNewWorkBtn');
                    if (newWorkBtn) newWorkBtn.style.display = 'inline-flex';
                }
            } else {
                toggle.classList.remove('expanded');
                childrenContainer.classList.remove('expanded');
                // レーベルフォルダ閉じた場合はフッターボタンを非表示
                if (depth === 0) {
                    calibrationExpandedLabel = { path: '', name: '' };
                    const newWorkBtn = document.getElementById('calibrationNewWorkBtn');
                    if (newWorkBtn) newWorkBtn.style.display = 'none';
                }
            }
        };

        toggle.addEventListener('click', (e) => { e.stopPropagation(); toggleFolder(); });
        name.addEventListener('click', (e) => { e.stopPropagation(); toggleFolder(); });
        icon.addEventListener('click', (e) => { e.stopPropagation(); toggleFolder(); });

        wrapper.appendChild(itemEl);
        wrapper.appendChild(childrenContainer);
        container.appendChild(wrapper);

        // ルートレベルで自動展開対象のフォルダの場合、自動展開してスクロール
        if (depth === 0 && calibrationAutoExpandFolder && item.name === calibrationAutoExpandFolder) {
            setTimeout(async () => {
                await toggleFolder();
                itemEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                itemEl.style.backgroundColor = 'var(--ink-blue-light)';
                setTimeout(() => { itemEl.style.backgroundColor = ''; }, 2000);
            }, 100);
        }
    });

    // レーベル展開時（depth=0）: 子フォルダ一覧の末尾に「新規作品を登録」ボタンを追加
    if (depth === 0) {
        const newWorkBtn = document.createElement('div');
        newWorkBtn.style.cssText = 'padding:8px 12px; margin-top:4px;';
        newWorkBtn.innerHTML = '<button class="btn btn-outline" style="width:100%; padding:8px; font-size:0.85em; border-style:dashed;" onclick="showCalibrationNewWorkForm(\'' + dirPath.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + '\', \'' + dirPath.split(/[\\\\/]/).pop().replace(/'/g, "\\'") + '\')">＋ 新規作品を登録</button>';
        container.appendChild(newWorkBtn);
    }
}

// 作品名フォルダを選択 → 巻数入力モーダルへ
async function selectCalibrationFolder(folderPath, workName) {
    // パスからレーベル名を抽出（ベースパスの直下のフォルダ名）
    const basePath = await window.electronAPI.getTxtFolderPath();
    const relativePath = folderPath.replace(basePath, '').replace(/^[\\/]/, '');
    const parts = relativePath.split(/[\\/]/);
    const label = parts[0] || '';
    const work = parts.length >= 2 ? parts[parts.length - 1] : workName;

    calibrationLabel = label;
    calibrationWork = work;

    // フォルダブラウザを閉じて巻数入力モーダルを表示
    closeCalibrationFolderModal();

    document.getElementById('calibrationSavePath').textContent = label + ' / ' + work;
    document.getElementById('calibrationVolumeInput').value = calibrationVolume || 1;
    document.getElementById('calibrationSaveError').style.display = 'none';
    document.getElementById('calibrationSaveModal').style.display = 'flex';
}

// 校正データ保存モーダルを閉じる
function closeCalibrationSaveModal() {
    document.getElementById('calibrationSaveModal').style.display = 'none';
}

// 校正データ保存を実行
async function confirmCalibrationSave() {
    const volume = parseInt(document.getElementById('calibrationVolumeInput').value) || 0;
    const errorEl = document.getElementById('calibrationSaveError');

    if (!volume || volume < 1) {
        errorEl.textContent = '巻数を正しく入力してください';
        errorEl.style.display = '';
        return;
    }

    calibrationVolume = volume;

    // データの存在からチェック種別を決定（両方あれば both）
    const hasVariation = Object.keys(state.currentVariationData).length > 0;
    const hasSimple = state.currentSimpleData.length > 0;

    let saveKey;
    if (hasVariation && hasSimple) {
        saveKey = 'both';
    } else if (hasSimple) {
        saveKey = 'simple';
    } else {
        saveKey = 'variation';
    }

    // 結果データを取得
    const items = getPickedResultData();

    // 保存ボタンを無効化
    const confirmBtn = document.getElementById('calibrationSaveConfirmBtn');
    const originalText = confirmBtn.textContent;
    confirmBtn.disabled = true;
    confirmBtn.textContent = '保存中...';

    try {
        const result = await window.electronAPI.saveCalibrationData({
            label: calibrationLabel,
            work: calibrationWork,
            volume: calibrationVolume,
            checkType: saveKey,
            items: items
        });

        if (result.success) {
            closeCalibrationSaveModal();
            showCalibrationSaveSuccessModal(result.filePath);
        } else {
            errorEl.textContent = '保存に失敗しました: ' + result.error;
            errorEl.style.display = '';
        }
    } catch (error) {
        errorEl.textContent = '保存中にエラーが発生しました: ' + error.message;
        errorEl.style.display = '';
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = originalText;
    }
}

// 校正データ保存成功モーダル
let calibrationSavedFilePath = '';

function showCalibrationSaveSuccessModal(filePath) {
    calibrationSavedFilePath = filePath;
    document.getElementById('calibrationSaveSuccessPath').textContent = filePath;
    document.getElementById('calibrationSaveSuccessModal').style.display = 'flex';
}

function closeCalibrationSaveSuccessModal() {
    document.getElementById('calibrationSaveSuccessModal').style.display = 'none';
}

async function launchComicBridgeFromSave() {
    if (!window.electronAPI || !calibrationSavedFilePath) return;

    const btn = document.getElementById('launchComicBridgeBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = '起動中...';

    try {
        const result = await window.electronAPI.launchComicBridge(calibrationSavedFilePath);
        if (result.success) {
            closeCalibrationSaveSuccessModal();
        } else {
            showToast(result.error || 'COMIC-Bridgeの起動に失敗しました', 'error');
        }
    } catch (error) {
        showToast('COMIC-Bridgeの起動中にエラーが発生しました: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// 校正データ保存: 新規作品登録モーダルを表示
let calibrationNewWorkLabelPath = '';
let calibrationNewWorkLabelName = '';

function showCalibrationNewWorkForm(labelPath, labelName) {
    calibrationNewWorkLabelPath = labelPath;
    calibrationNewWorkLabelName = labelName;

    const labelInfo = document.getElementById('calibrationNewWorkLabelInfo');
    if (labelInfo) {
        labelInfo.innerHTML = '<span style="color:#888; font-weight:normal; font-size:0.9em;">レーベル：</span>' + escapeHtml(labelName);
    }
    const input = document.getElementById('calibrationNewWorkTitle');
    input.value = '';
    const modal = document.getElementById('calibrationNewWorkModal');
    // フォルダブラウザより前面に表示されるようz-indexを設定
    modal.style.zIndex = '1100';
    modal.style.display = 'flex';
    requestAnimationFrame(() => input.focus());
}

// 校正データ保存: 新規作品登録モーダルを閉じる
function closeCalibrationNewWorkModal() {
    document.getElementById('calibrationNewWorkModal').style.display = 'none';
}

// 校正データ保存: 新規作品を登録して保存先として選択
function registerCalibrationNewWork() {
    const title = document.getElementById('calibrationNewWorkTitle').value.trim();
    if (!title) {
        showToast('作品名を入力してください', 'warning');
        return;
    }

    // ファイル名に使えない文字をサニタイズ
    const sanitizedName = title.replace(/[<>:"/\\|?*]/g, '_').trim();
    if (!sanitizedName) {
        showToast('有効な作品名を入力してください', 'warning');
        return;
    }

    // パスを組み立て（フォルダはsave-calibration-dataハンドラが自動作成する）
    const workPath = calibrationNewWorkLabelPath + '\\' + sanitizedName;

    // モーダルを閉じて、巻数入力へ進む
    closeCalibrationNewWorkModal();
    selectCalibrationFolder(workPath, sanitizedName);
}

// 校正データ保存フォルダブラウザ: フッターの「新規作品を登録」ボタン
function startCalibrationNewWorkFromBrowser() {
    if (!calibrationExpandedLabel.name) {
        showToast('先にレーベルフォルダを展開してください', 'warning');
        return;
    }
    showCalibrationNewWorkForm(calibrationExpandedLabel.path, calibrationExpandedLabel.name);
}

// 校正データ保存フォルダブラウザ: 検索機能
function performCalibrationFolderSearch(query) {
    if (!query) {
        clearCalibrationFolderSearch();
        return;
    }

    const normalizedQuery = query.toLowerCase();
    const tree = document.getElementById('calibrationFolderTree');
    const searchResults = document.getElementById('calibrationFolderSearchResults');

    if (!tree || !searchResults) return;

    // フォルダツリー内の全アイテムを検索してフィルタリング
    const allItems = tree.querySelectorAll('.json-folder-item.folder');
    let matchCount = 0;

    allItems.forEach(item => {
        const nameEl = item.querySelector('.folder-name');
        const wrapper = item.parentElement;
        if (nameEl) {
            const name = nameEl.textContent.toLowerCase();
            if (name.includes(normalizedQuery)) {
                if (wrapper) wrapper.style.display = '';
                matchCount++;
            } else {
                if (wrapper) wrapper.style.display = 'none';
            }
        }
    });

    // 検索クリアボタンを表示
    const clearBtn = document.getElementById('calibrationFolderSearchClearBtn');
    if (clearBtn) clearBtn.style.display = 'block';
}

// 校正データ保存フォルダブラウザ: 検索クリア
function clearCalibrationFolderSearch() {
    const tree = document.getElementById('calibrationFolderTree');
    const searchResults = document.getElementById('calibrationFolderSearchResults');
    const clearBtn = document.getElementById('calibrationFolderSearchClearBtn');

    // 全アイテムを再表示
    if (tree) {
        const allWrappers = tree.children;
        for (let i = 0; i < allWrappers.length; i++) {
            allWrappers[i].style.display = '';
        }
    }

    if (searchResults) {
        searchResults.style.display = 'none';
        searchResults.innerHTML = '';
    }

    if (clearBtn) clearBtn.style.display = 'none';
}

// 校正データ保存フォルダブラウザ: イベントリスナー初期化
function initCalibrationFolderBrowser() {
    const searchInput = document.getElementById('calibrationFolderSearchInput');
    const searchClearBtn = document.getElementById('calibrationFolderSearchClearBtn');

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            if (calibrationFolderSearchTimeout) {
                clearTimeout(calibrationFolderSearchTimeout);
            }
            calibrationFolderSearchTimeout = setTimeout(() => {
                performCalibrationFolderSearch(query);
            }, 300);
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (calibrationFolderSearchTimeout) {
                    clearTimeout(calibrationFolderSearchTimeout);
                }
                performCalibrationFolderSearch(searchInput.value.trim());
            }
        });
    }

    if (searchClearBtn) {
        searchClearBtn.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            clearCalibrationFolderSearch();
        });
    }
}

// 結果ビューアページへ遷移（データがあればそのまま表示、なければモーダルを開く）
function goToResultViewerPage() {
    const hasVariation = Object.keys(state.currentVariationData).length > 0;
    const hasSimple = state.currentSimpleData.length > 0;

    if (hasVariation || hasSimple) {
        // データが残っている場合はモーダルなしで直接表示
        showResultViewerPage();
        // 表示可能なタブを選択して描画
        if (hasVariation && (currentResultTab === 'variation' || !hasSimple)) {
            switchResultTab('variation', true);
        } else if (hasSimple && (currentResultTab === 'simple' || !hasVariation)) {
            switchResultTab('simple', true);
        } else {
            switchResultTab(currentResultTab, true);
        }
        return;
    }

    // データがない場合は従来通りモーダルを開く
    // タブ選択を表示してモーダルを開く
    const tabSelector = document.getElementById('pasteModalTabSelector');
    if (tabSelector) tabSelector.style.display = 'flex';

    // タイトルをリセット
    const title = document.getElementById('resultPasteModalTitle');
    if (title) title.innerHTML = '<span class="svg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg></span> 結果を貼り付け';

    // デフォルトは正誤チェック
    pasteTargetType = null;
    pasteTextByType = { variation: '', simple: '' };
    selectPasteType('simple');

    document.getElementById('resultPasteArea').value = '';
    const modal = document.getElementById('resultPasteModal');
    modal.style.backdropFilter = 'none';
    modal.style.webkitBackdropFilter = 'none';
    modal.style.display = 'flex';
}

// 結果ビューアページを直接表示（モーダルなし）
function showResultViewerPage() {
    const resultViewer = document.getElementById('resultViewerPage');

    document.getElementById('landingScreen').style.display = 'none';
    document.getElementById('mainWrapper').style.display = 'none';
    document.getElementById('proofreadingPage').style.display = 'none';
    document.getElementById('adminPage').style.display = 'none';
    document.getElementById('comicPotEditorPage').style.display = 'none';
    document.getElementById('specSheetPage').style.display = 'none';

    resultViewer.style.display = 'block';
    resultViewer.classList.add('page-transition-zoom-in');
    setTimeout(() => {
        resultViewer.classList.remove('page-transition-zoom-in');
    }, 350);
}

// 結果ビューアからホームへ
function goToHomeFromResultViewer() {
    const resultViewer = document.getElementById('resultViewerPage');
    const landing = document.getElementById('landingScreen');

    resultViewer.classList.add('page-transition-out-down');
    setTimeout(() => {
        resultViewer.style.display = 'none';
        resultViewer.classList.remove('page-transition-out-down');

        landing.style.display = 'flex';
        landing.classList.add('page-transition-up');
        setTimeout(() => {
            landing.classList.remove('page-transition-up');
        }, 350);
    }, 200);
}

// 結果ビューアから校正プロンプトへ
function goToProofreadingFromResultViewer() {
    const resultViewer = document.getElementById('resultViewerPage');
    const proofreading = document.getElementById('proofreadingPage');

    resultViewer.classList.add('view-transition-out-right');
    setTimeout(() => {
        resultViewer.style.display = 'none';
        resultViewer.classList.remove('view-transition-out-right');

        proofreading.style.display = 'flex';
        proofreading.classList.add('view-transition-in-right');
        setTimeout(() => {
            proofreading.classList.remove('view-transition-in-right');
        }, 300);
    }, 250);
}

// 貼り付けモーダル用：タブごとのテキスト保持
let pasteTextByType = { variation: '', simple: '' };

// 貼り付けタイプを選択
function selectPasteType(type) {
    const textarea = document.getElementById('resultPasteArea');

    // 現在のタブの入力内容を保存
    if (pasteTargetType) {
        pasteTextByType[pasteTargetType] = textarea.value;
    } else if (currentResultTab) {
        pasteTextByType[currentResultTab] = textarea.value;
    }

    pasteTargetType = type;
    currentResultTab = type;

    // 切り替え先タブの内容を復元
    textarea.value = pasteTextByType[type] || '';

    // タブボタンの状態を更新
    document.querySelectorAll('.paste-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });
}

// 解析して結果ビューアに遷移
function parseAndGoToViewer() {
    // 現在のタブの入力内容を保存
    const textarea = document.getElementById('resultPasteArea');
    if (pasteTargetType) {
        pasteTextByType[pasteTargetType] = textarea.value;
    } else if (currentResultTab) {
        pasteTextByType[currentResultTab] = textarea.value;
    }

    const variationText = (pasteTextByType.variation || '').trim();
    const simpleText = (pasteTextByType.simple || '').trim();

    if (!variationText && !simpleText) {
        showToast('結果を貼り付けてください', 'warning');
        return;
    }

    let parsedTab = null;

    // 正誤チェック（simple）をパース
    if (simpleText) {
        const data = parseSimpleCSV(simpleText);
        if (data.length > 0) {
            state.currentSimpleData = data;
            parsedTab = 'simple';
        }
    }

    // 提案チェック（variation）をパース
    if (variationText) {
        const data = parseVariationCSV(variationText);
        if (data.length > 0) {
            const grouped = groupByCategory(data);
            state.currentVariationData = grouped;
            parsedTab = parsedTab || 'variation';
        }
    }

    if (!parsedTab) {
        showToast('解析できるデータがありません', 'warning');
        return;
    }

    // モーダルを閉じる
    closeResultPasteModal();

    // テキストエディタが表示中ならパネルを更新するだけ
    const editorPage = document.getElementById('comicPotEditorPage');
    if (editorPage && editorPage.style.display !== 'none') {
        // 貼り付けたタブに切り替えてから描画
        if (pasteTargetType) {
            cpSwitchPanelTab(pasteTargetType);
            pasteTargetType = null;
        } else if (parsedTab) {
            cpSwitchPanelTab(parsedTab);
        } else {
            cpRenderPanelContent();
            cpSetupPanelCategoryFilter();
        }
        return;
    }

    // 並列表示中なら並列ビューを再描画するだけ
    if (currentResultTab === 'parallel') {
        pasteTargetType = null;
        renderParallelView();
        return;
    }

    // 結果ビューアページに遷移
    showResultViewerPage();

    // 最初に表示するタブ（データがある方、両方あれば正誤チェック優先）
    currentResultTab = parsedTab;
    switchResultTab(currentResultTab, true);
}

// 結果貼り付けモーダルを開く（ビューア内から呼ばれる場合）
function openResultPasteModal() {
    // タブ選択を表示
    const tabSelector = document.getElementById('pasteModalTabSelector');
    if (tabSelector) tabSelector.style.display = 'flex';

    const title = document.getElementById('resultPasteModalTitle');
    if (title) title.innerHTML = '<span class="svg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg></span> 結果を貼り付け';

    document.getElementById('resultPasteArea').value = '';
    // 前回選択したタブを維持、初回は正誤チェック
    const defaultTab = pasteTargetType || 'simple';
    selectPasteType(defaultTab);
    const modal = document.getElementById('resultPasteModal');
    modal.style.backdropFilter = 'none';
    modal.style.webkitBackdropFilter = 'none';
    modal.style.display = 'flex';
}

// 結果貼り付けモーダルを閉じる
function closeResultPasteModal() {
    const modal = document.getElementById('resultPasteModal');
    modal.style.display = 'none';
    modal.style.backdropFilter = '';
    modal.style.webkitBackdropFilter = '';
}

let pasteTargetType = null; // 並列表示時の貼り付け先

// タブ切り替え
function switchResultTab(tab, forceRender = false) {
    const tabs = document.querySelectorAll('.result-tab');
    tabs.forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
    });

    const singleView = document.getElementById('singleViewContent');
    const parallelView = document.getElementById('parallelViewContent');
    const modeToggle = document.getElementById('simpleDisplayModeToggle');

    const previousTab = currentResultTab;
    const isSameTab = (previousTab === tab);

    // 同じタブで強制描画でない場合は何もしない
    if (isSameTab && !forceRender) return;

    currentResultTab = tab;

    // 表示内容を更新する関数
    function updateContent() {
        if (tab === 'parallel') {
            singleView.style.display = 'none';
            parallelView.style.display = 'flex';
            if (modeToggle) modeToggle.style.display = 'none';
            renderParallelView();
            setupParallelFilters();
        } else {
            parallelView.style.display = 'none';
            singleView.style.display = 'flex';
            if (modeToggle) modeToggle.style.display = (tab === 'simple') ? 'flex' : 'none';

            if (tab === 'variation') {
                if (Object.keys(state.currentVariationData).length > 0) {
                    setupSingleFilterForVariation();
                    renderCategoryTables(state.currentVariationData);
                } else {
                    showEmptyResultMessage();
                }
            } else {
                if (state.currentSimpleData.length > 0) {
                    setupSingleFilterForSimple();
                    renderSimpleResult(state.currentSimpleData);
                } else {
                    showEmptyResultMessage();
                }
            }
        }
    }

    // 強制描画または初回表示の場合はアニメーションなしで即座に更新
    if (forceRender || !previousTab || isSameTab) {
        updateContent();
        singleView.classList.add('content-fade-in');
        setTimeout(() => singleView.classList.remove('content-fade-in'), 200);
        return;
    }

    // 現在表示中のビューを取得
    const currentView = (previousTab === 'parallel') ? parallelView : singleView;
    const nextView = (tab === 'parallel') ? parallelView : singleView;

    // フェードアウト → フェードイン
    currentView.classList.add('content-fade-out');
    setTimeout(() => {
        currentView.classList.remove('content-fade-out');
        updateContent();
        nextView.classList.add('content-fade-in');
        setTimeout(() => {
            nextView.classList.remove('content-fade-in');
        }, 200);
    }, 150);
}

// 単一表示用フィルター設定（提案チェック）
function setupSingleFilterForVariation() {
    const categories = Object.keys(state.currentVariationData).sort((a, b) => {
        return (state.currentVariationData[a].order || 0) - (state.currentVariationData[b].order || 0);
    });
    populateCategoryFilter('singleCategoryFilter', categories);
    // フィルターをリセット
    const select = document.getElementById('singleCategoryFilter');
    if (select) select.value = 'all';
}

// 単一表示用フィルター設定（正誤チェック）
function setupSingleFilterForSimple() {
    const categories = [...new Set(state.currentSimpleData.map(item => item.category))].sort();
    populateCategoryFilter('singleCategoryFilter', categories);
    // フィルターをリセット
    const select = document.getElementById('singleCategoryFilter');
    if (select) select.value = 'all';
}

// 並列表示用フィルター設定
function setupParallelFilters() {
    // 提案チェック
    if (Object.keys(state.currentVariationData).length > 0) {
        const variationCategories = Object.keys(state.currentVariationData).sort((a, b) => {
            return (state.currentVariationData[a].order || 0) - (state.currentVariationData[b].order || 0);
        });
        populateCategoryFilter('variationCategoryFilter', variationCategories);
    }
    // 正誤チェック
    if (state.currentSimpleData.length > 0) {
        const simpleCategories = [...new Set(state.currentSimpleData.map(item => item.category))].sort();
        populateCategoryFilter('simpleCategoryFilter', simpleCategories);
    }
}

// 並列表示を更新
function renderParallelView() {
    // 並列表示では最初にまとめてリセットし、個別関数ではリセットしない
    resultRowCounter = 0;
    resultPickedState.clear();
    resultRowData.clear();

    // 提案チェック
    const variationArea = document.getElementById('variationDisplayArea');
    if (Object.keys(state.currentVariationData).length > 0) {
        renderCategoryTablesToElement(state.currentVariationData, variationArea);
        updateCountDisplay('variationCountDisplay', countVariationItems());
    } else {
        variationArea.innerHTML = '<div style="text-align:center; padding:40px;">'
            + '<button class="btn btn-purple" onclick="openResultPasteModalFor(\'variation\')" style="font-size:0.95em; padding:10px 24px;">'
            + '<span class="svg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span> 貼り付け</button>'
            + '</div>';
        updateCountDisplay('variationCountDisplay', 0);
    }

    // 正誤チェック
    const simpleArea = document.getElementById('simpleDisplayArea');
    if (state.currentSimpleData.length > 0) {
        renderSimpleResultToElement(state.currentSimpleData, simpleArea, true);
        updateCountDisplay('simpleCountDisplay', state.currentSimpleData.length);
    } else {
        simpleArea.innerHTML = '<div style="text-align:center; padding:40px;">'
            + '<button class="btn btn-purple" onclick="openResultPasteModalFor(\'simple\')" style="font-size:0.95em; padding:10px 24px;">'
            + '<span class="svg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span> 貼り付け</button>'
            + '</div>';
        updateCountDisplay('simpleCountDisplay', 0);
    }
}

// 提案チェックのアイテム数をカウント
function countVariationItems() {
    let count = 0;
    Object.values(state.currentVariationData).forEach(group => {
        Object.values(group.subGroups).forEach(sub => {
            count += sub.items.length;
        });
    });
    return count;
}

// 指定の要素にカテゴリテーブルを描画
function renderCategoryTablesToElement(grouped, container) {
    const sortedKeys = Object.keys(grouped).sort((a, b) => grouped[a].order - grouped[b].order);
    if (sortedKeys.length === 0) {
        container.innerHTML = '<p style="color:#999; text-align:center;">該当するデータがありません</p>';
        return;
    }

    let html = '';
    sortedKeys.forEach(category => {
        html += buildCategoryCardHtml(category, grouped[category]);
    });
    container.innerHTML = html;
}

// 指定の要素に正誤チェック結果を描画
function renderSimpleResultToElement(data, container, skipReset = false) {
    if (currentSimpleDisplayMode === 'page') {
        renderSimplePageOrderToElement(data, container, skipReset);
    } else {
        renderSimpleCategoryOrderToElement(data, container, skipReset);
    }
}

// 正誤チェック：ページ順を指定要素に描画
function renderSimplePageOrderToElement(data, container, skipReset = false) {
    if (!skipReset) {
        resultRowCounter = 0;
        resultPickedState.clear();
        resultRowData.clear();
    }
    const sorted = [...data].sort(compareByVolumeAndPage);
    let html = `<div class="result-simple-table-wrapper"><table class="result-table result-simple-table">
        <thead><tr><th style="width:36px;"></th><th style="width:60px;">ページ</th><th style="width:100px;">種別</th><th style="width:180px;">セリフ</th><th>指摘内容</th></tr></thead><tbody>`;
    sorted.forEach(item => {
        const rowId = 'rr_' + (resultRowCounter++);
        const checkedAttr = getCheckedAttr('simple', item.category, item.page, item.excerpt);
        resultPickedState.set(rowId, !!checkedAttr);
        resultRowData.set(rowId, { type: 'simple', category: item.category, page: item.page, excerpt: item.excerpt, content: item.content });
        const categoryColor = getSimpleCategoryColor(item.category);
        html += `<tr><td style="text-align:center;"><input type="checkbox" class="result-row-checkbox" data-row-id="${rowId}"${checkedAttr} onchange="toggleResultPicked('${rowId}', this)"></td>
            <td class="page-cell-clickable" style="text-align:center; font-weight:bold;" onclick="cpJumpToExcerpt('${escapeAttr(item.page)}', '${escapeAttr(item.excerpt)}')">${escapeHtml(item.page)}</td>
            <td><span class="category-badge" style="background:${categoryColor};">${escapeHtml(item.category)}</span></td>
            <td>${escapeHtml(item.excerpt)}</td><td>${escapeHtml(item.content)}</td></tr>`;
    });
    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

// 正誤チェック：カテゴリ別を指定要素に描画
function renderSimpleCategoryOrderToElement(data, container, skipReset = false) {
    if (!skipReset) {
        resultRowCounter = 0;
        resultPickedState.clear();
        resultRowData.clear();
    }
    const grouped = {};
    data.forEach(item => {
        const key = item.category;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(item);
    });
    const sortedKeys = Object.keys(grouped).sort();
    let html = '';
    let colorIndex = 0;
    sortedKeys.forEach(category => {
        const items = grouped[category];
        items.sort(compareByVolumeAndPage);
        const colorClass = getCategoryColorClass(colorIndex + 1);
        colorIndex++;
        html += `<div class="result-category-card ${colorClass}">
            <div class="result-category-header">
                <input type="checkbox" class="result-master-checkbox" onchange="toggleCategoryPicked(this)" onclick="event.stopPropagation()">
                <span class="result-category-toggle" onclick="toggleResultCategory(this.parentElement)">▼</span>
                <span class="result-category-name" onclick="toggleResultCategory(this.parentElement)">${escapeHtml(category)}</span>
                <span class="result-category-count" onclick="toggleResultCategory(this.parentElement)">(${items.length}件)</span>
            </div>
            <div class="result-category-body"><table class="result-table">
                <thead><tr><th style="width:36px;"></th><th style="width:60px;">ページ</th><th style="width:180px;">セリフ</th><th>指摘内容</th></tr></thead><tbody>`;
        items.forEach(item => {
            const rowId = 'rr_' + (resultRowCounter++);
            const checkedAttr = getCheckedAttr('simple', item.category, item.page, item.excerpt);
            resultPickedState.set(rowId, !!checkedAttr);
            resultRowData.set(rowId, { type: 'simple', category: item.category, page: item.page, excerpt: item.excerpt, content: item.content });
            html += `<tr><td style="text-align:center;"><input type="checkbox" class="result-row-checkbox" data-row-id="${rowId}"${checkedAttr} onchange="toggleResultPicked('${rowId}', this)"></td><td class="page-cell-clickable" style="text-align:center;" onclick="cpJumpToExcerpt('${escapeAttr(item.page)}', '${escapeAttr(item.excerpt)}')">${escapeHtml(item.page)}</td><td>${escapeHtml(item.excerpt)}</td><td>${escapeHtml(item.content)}</td></tr>`;
        });
        html += `</tbody></table></div></div>`;
    });
    container.innerHTML = html;
}

// 指定タブで貼り付けモーダルを開く（タブ切り替えUI付き、既存テキスト保持）
function openResultPasteModalFor(type) {
    // タブ選択UIを表示
    const tabSelector = document.getElementById('pasteModalTabSelector');
    if (tabSelector) tabSelector.style.display = 'flex';

    const title = document.getElementById('resultPasteModalTitle');
    if (title) title.innerHTML = '<span class="svg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg></span> 結果を貼り付け';

    // 指定タブを選択（既存テキストがあれば復元される）
    selectPasteType(type);

    const modal = document.getElementById('resultPasteModal');
    modal.style.backdropFilter = 'none';
    modal.style.webkitBackdropFilter = 'none';
    modal.style.display = 'flex';
}

// 空の結果メッセージを表示
function showEmptyResultMessage() {
    document.getElementById('resultDisplayArea').innerHTML = '<p style="color:#999; text-align:center; padding:40px;">「結果を貼り付け」ボタンからCSVデータを入力してください</p>';
    updateResultCountSimple(0);
}

// 結果件数表示を更新（シンプル版）
function updateResultCountSimple(count) {
    const countDisplay = document.getElementById('resultCountDisplay');
    if (countDisplay) {
        countDisplay.textContent = count > 0 ? `${count}件` : '';
    }
}

// 特定のカウント表示を更新
function updateCountDisplay(elementId, count) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = count > 0 ? `${count}件` : '';
    }
}

// 現在のタブの結果をクリア
function clearCurrentResult() {
    if (currentResultTab === 'variation') {
        state.currentVariationData = {};
    } else {
        state.currentSimpleData = [];
    }
    showEmptyResultMessage();
}

// 提案チェック結果をクリア（並列表示用）
function clearVariationResult() {
    state.currentVariationData = {};
    const area = document.getElementById('variationDisplayArea');
    area.innerHTML = '<p style="color:#999; text-align:center; padding:40px;">提案チェックの結果を貼り付け</p>';
    updateCountDisplay('variationCountDisplay', 0);
}

// 正誤チェック結果をクリア（並列表示用）
function clearSimpleResult() {
    state.currentSimpleData = [];
    const area = document.getElementById('simpleDisplayArea');
    area.innerHTML = '<p style="color:#999; text-align:center; padding:40px;">正誤チェックの結果を貼り付け</p>';
    updateCountDisplay('simpleCountDisplay', 0);
}

// 正誤チェックの表示モード切り替え
function switchSimpleDisplayMode(mode) {
    if (currentSimpleDisplayMode === mode) return; // 同じモードなら何もしない

    currentSimpleDisplayMode = mode;
    // 単一表示用・並列表示用両方のボタンを更新
    document.querySelectorAll('.display-mode-btn, .display-mode-btn-small').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // データがあれば再描画（アニメーション付き）
    if (state.currentSimpleData.length > 0) {
        const targetArea = (currentResultTab === 'parallel')
            ? document.getElementById('simpleDisplayArea')
            : document.getElementById('resultDisplayArea');

        targetArea.classList.add('content-fade-out');
        setTimeout(() => {
            targetArea.classList.remove('content-fade-out');

            if (currentResultTab === 'parallel') {
                renderSimpleResultToElement(state.currentSimpleData, targetArea);
            } else {
                renderSimpleResult(state.currentSimpleData);
            }

            targetArea.classList.add('content-fade-in');
            setTimeout(() => {
                targetArea.classList.remove('content-fade-in');
            }, 200);
        }, 150);
    }
}

// CSV解析して表示
function parseAndDisplayResult() {
    const text = document.getElementById('resultPasteArea').value.trim();
    if (!text) {
        showToast('結果を貼り付けてください', 'warning');
        return;
    }

    // 並列表示モードで貼り付け先が指定されている場合
    if (currentResultTab === 'parallel' && pasteTargetType) {
        if (pasteTargetType === 'variation') {
            const data = parseVariationCSV(text);
            if (data.length === 0) {
                showToast('解析できるデータがありません', 'warning');
                return;
            }
            const grouped = groupByCategory(data);
            state.currentVariationData = grouped;
            const area = document.getElementById('variationDisplayArea');
            renderCategoryTablesToElement(grouped, area);
            updateCountDisplay('variationCountDisplay', data.length);
        } else {
            const data = parseSimpleCSV(text);
            if (data.length === 0) {
                showToast('解析できるデータがありません', 'warning');
                return;
            }
            state.currentSimpleData = data;
            const area = document.getElementById('simpleDisplayArea');
            renderSimpleResultToElement(data, area);
            updateCountDisplay('simpleCountDisplay', data.length);
        }
        pasteTargetType = null;
        return;
    }

    // 単一表示モード（pasteTargetTypeが指定されている場合はそちらを優先）
    const effectiveTab = pasteTargetType || currentResultTab;
    if (effectiveTab === 'variation') {
        // 提案チェック: カテゴリ,ページ,セリフ,指摘内容
        const data = parseVariationCSV(text);
        if (data.length === 0) {
            showToast('解析できるデータがありません', 'warning');
            return;
        }
        const grouped = groupByCategory(data);
        state.currentVariationData = grouped; // データを保持
        renderCategoryTables(grouped);
        updateResultCountSimple(data.length);
    } else if (effectiveTab === 'simple') {
        // 正誤チェック: ページ,種別,セリフ,指摘内容
        const data = parseSimpleCSV(text);
        if (data.length === 0) {
            showToast('解析できるデータがありません', 'warning');
            return;
        }
        state.currentSimpleData = data;
        renderSimpleResult(data);
        updateResultCountSimple(data.length);
    }
}

// 巻数・ページ番号抽出ヘルパー関数
function extractVolumeAndPage(pageText) {
    let volumeNum = 0;
    let pageNum = 0;

    // 巻数を抽出（例: "8巻" → 8）
    const volumeMatch = pageText.match(/(\d+)巻/);
    if (volumeMatch) {
        volumeNum = parseInt(volumeMatch[1], 10);
    }

    // ページ番号を抽出（例: "3ページ" → 3, "4Page" → 4, "P5" → 5）
    const pageMatch = pageText.match(/(\d+)ページ/);
    if (pageMatch) {
        pageNum = parseInt(pageMatch[1], 10);
    } else {
        const pageEngMatch = pageText.match(/(\d+)\s*Page/i) || pageText.match(/P(\d+)/i);
        if (pageEngMatch) {
            pageNum = parseInt(pageEngMatch[1], 10);
        } else {
            // 数字のみの形式を試す
            const numMatch = pageText.match(/^\s*(\d+)\s*$/);
            if (numMatch) {
                pageNum = parseInt(numMatch[1], 10);
            }
        }
    }

    return { volumeNum, pageNum };
}

// ページテキストをP●●形式に変換（例: "3ページ" → "P3", "8巻 5ページ" → "8巻P5"）
function formatPageShort(pageText) {
    const volumeMatch = pageText.match(/(\d+)巻/);
    const pageMatch = pageText.match(/(\d+)ページ/);
    if (volumeMatch && pageMatch) {
        return `${volumeMatch[1]}巻P${pageMatch[1]}`;
    } else if (pageMatch) {
        return `P${pageMatch[1]}`;
    }
    const numMatch = pageText.match(/^\s*(\d+)\s*$/);
    if (numMatch) {
        return `P${numMatch[1]}`;
    }
    return pageText;
}

// ソート比較関数（巻数→ページ番号の順でソート）
function compareByVolumeAndPage(a, b) {
    if (a.volumeNum !== b.volumeNum) {
        return a.volumeNum - b.volumeNum;
    }
    return a.pageNum - b.pageNum;
}

// 提案チェック用CSV解析（カテゴリ,ページ,セリフ,指摘内容）
function parseVariationCSV(text) {
    const lines = text.split('\n').filter(line => line.trim());
    const result = [];

    // ヘッダー行をスキップ
    let startIndex = 0;
    if (lines[0] && (lines[0].includes('チェック項目') || lines[0].toLowerCase().includes('check'))) {
        startIndex = 1;
    }

    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = parseCSVLine(line);
        if (values.length >= 4) {
            const pageText = values[1].trim();
            const { volumeNum, pageNum } = extractVolumeAndPage(pageText);

            result.push({
                category: values[0].trim(),
                page: pageText,
                volumeNum: volumeNum,
                pageNum: pageNum,
                excerpt: values[2].trim(),
                content: values[3].trim()
            });
        }
    }

    return result;
}

// 正誤チェック用CSV解析（ページ,種別,セリフ,指摘内容）
function parseSimpleCSV(text) {
    const lines = text.split('\n').filter(line => line.trim());
    const result = [];

    // ヘッダー行をスキップ
    let startIndex = 0;
    if (lines[0] && (lines[0].includes('ページ') || lines[0].toLowerCase().includes('page'))) {
        startIndex = 1;
    }

    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = parseCSVLine(line);
        if (values.length >= 4) {
            // ページ番号・巻数を抽出（ソート用）
            const pageText = values[0].trim();
            const { volumeNum, pageNum } = extractVolumeAndPage(pageText);

            result.push({
                page: pageText,
                volumeNum: volumeNum,
                pageNum: pageNum,
                category: values[1].trim(),
                excerpt: values[2].trim(),
                content: values[3].trim()
            });
        }
    }

    return result;
}

// CSV行をパース（引用符内のカンマを考慮）
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);

    // 引用符を除去
    return result.map(v => v.replace(/^"|"$/g, ''));
}

// チェック項目でグループ化
function groupByCategory(data) {
    const grouped = {};
    data.forEach(item => {
        // サブ番号（①②③...⑳）をカテゴリ名から分離
        const subMatch = item.category.match(/^(.+?)([①-⑳])\s*$/);
        const baseCategory = subMatch ? subMatch[1].trim() : item.category.trim();
        const subLabel = subMatch ? subMatch[2] : '';

        // カテゴリ番号を抽出してソート用に使用
        const orderMatch = baseCategory.match(/^(\d+)\./);

        if (!grouped[baseCategory]) {
            grouped[baseCategory] = {
                order: orderMatch ? parseInt(orderMatch[1]) : 999,
                subGroups: {}
            };
        }

        const subKey = subLabel || '_default';
        if (!grouped[baseCategory].subGroups[subKey]) {
            grouped[baseCategory].subGroups[subKey] = { label: subLabel, items: [] };
        }
        grouped[baseCategory].subGroups[subKey].items.push(item);
    });
    return grouped;
}

// カテゴリカードのHTML生成（共通ヘルパー）
function buildCategoryCardHtml(baseCategory, group) {
    const colorClass = getCategoryColorClass(group.order);
    const subKeys = Object.keys(group.subGroups).sort();
    const totalCount = subKeys.reduce((sum, k) => sum + group.subGroups[k].items.length, 0);
    const hasMultipleSubs = subKeys.length > 1 || (subKeys.length === 1 && subKeys[0] !== '_default');

    let html = `
    <div class="result-category-card ${colorClass}">
        <div class="result-category-header">
            <input type="checkbox" class="result-master-checkbox" onchange="toggleCategoryPicked(this)" onclick="event.stopPropagation()">
            <span class="result-category-toggle" onclick="toggleResultCategory(this.parentElement)">▼</span>
            <span class="result-category-name" onclick="toggleResultCategory(this.parentElement)">${escapeHtml(baseCategory)}</span>
            <span class="result-category-count" onclick="toggleResultCategory(this.parentElement)">(${totalCount}件)</span>
        </div>
        <div class="result-category-body">`;

    subKeys.forEach(subKey => {
        const sub = group.subGroups[subKey];

        // サブグループが複数ある場合のみラベルを表示
        if (hasMultipleSubs && sub.label) {
            const uniqueExcerpts = [...new Set(sub.items.map(item => item.excerpt.replace(/[「」]/g, '').trim()).filter(Boolean))];
            const variantText = uniqueExcerpts.length > 4
                ? uniqueExcerpts.slice(0, 4).join(' / ') + ' …'
                : uniqueExcerpts.join(' / ');
            html += `<div class="result-sub-group-label"><span class="sub-group-number">${escapeHtml(sub.label)}</span><span class="sub-group-variants">${escapeHtml(variantText)}</span></div>`;
        }

        html += `
            <table class="result-table">
                <thead><tr>
                    <th style="width:36px;"></th>
                    <th style="width:80px;">ページ</th>
                    <th style="width:200px;">セリフ</th>
                    <th>指摘内容</th>
                </tr></thead>
                <tbody>`;

        sub.items.forEach(item => {
            const displayContent = item.content;

            const rowId = 'rr_' + (resultRowCounter++);
            const checkedAttr = getCheckedAttr('variation', item.category, item.page, item.excerpt);
            resultPickedState.set(rowId, !!checkedAttr);
            resultRowData.set(rowId, { type: 'variation', category: item.category, page: item.page, excerpt: item.excerpt, content: displayContent });
            html += `<tr>
                <td style="text-align:center;"><input type="checkbox" class="result-row-checkbox" data-row-id="${rowId}"${checkedAttr} onchange="toggleResultPicked('${rowId}', this)"></td>
                <td class="page-cell-clickable" onclick="cpJumpToExcerpt('${escapeAttr(item.page)}', '${escapeAttr(item.excerpt)}')">${escapeHtml(item.page)}</td>
                <td>${escapeHtml(item.excerpt)}</td>
                <td>${escapeHtml(displayContent)}</td>
            </tr>`;
        });

        html += `</tbody></table>`;
    });

    html += `</div></div>`;
    return html;
}

// カテゴリ別テーブルをレンダリング
function renderCategoryTables(grouped) {
    resultRowCounter = 0;
    resultPickedState.clear();
    resultRowData.clear();
    const container = document.getElementById('resultDisplayArea');

    // カテゴリを番号順にソート
    const sortedKeys = Object.keys(grouped).sort((a, b) => grouped[a].order - grouped[b].order);

    if (sortedKeys.length === 0) {
        container.innerHTML = '<p style="color:#999; text-align:center;">該当するデータがありません</p>';
        return;
    }

    let html = '';
    sortedKeys.forEach(category => {
        html += buildCategoryCardHtml(category, grouped[category]);
    });

    container.innerHTML = html;
}

// カテゴリ番号に応じた色クラスを返す
function getCategoryColorClass(order) {
    const colors = ['cat-blue', 'cat-green', 'cat-orange', 'cat-purple', 'cat-teal', 'cat-pink', 'cat-indigo', 'cat-red', 'cat-yellow', 'cat-gray'];
    return colors[(order - 1) % colors.length] || 'cat-gray';
}

// カテゴリの開閉トグル
function toggleResultCategory(header) {
    const card = header.parentElement;
    const body = card.querySelector('.result-category-body');
    const toggle = header.querySelector('.result-category-toggle');

    if (body.style.display === 'none') {
        body.style.display = 'block';
        toggle.textContent = '▼';
    } else {
        body.style.display = 'none';
        toggle.textContent = '▶';
    }
}

// ========== カテゴリフィルタリング機能 ==========

// フィルター用ドロップダウンにカテゴリを設定
function populateCategoryFilter(selectId, categories) {
    const select = document.getElementById(selectId);
    if (!select) return;

    // 既存のオプションをクリア（「すべて」以外）
    while (select.options.length > 1) {
        select.remove(1);
    }

    // カテゴリを追加
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        select.appendChild(option);
    });
}

// 単一表示用フィルター適用
function applySingleCategoryFilter() {
    const select = document.getElementById('singleCategoryFilter');
    const filterValue = select ? select.value : 'all';
    const targetArea = document.getElementById('resultDisplayArea');

    targetArea.classList.add('content-fade-out');
    setTimeout(() => {
        targetArea.classList.remove('content-fade-out');

        if (currentResultTab === 'variation') {
            renderCategoryTablesFiltered(state.currentVariationData, 'resultDisplayArea', filterValue);
        } else if (currentResultTab === 'simple') {
            renderSimpleResultFiltered(state.currentSimpleData, 'resultDisplayArea', filterValue);
        }

        targetArea.classList.add('content-fade-in');
        setTimeout(() => {
            targetArea.classList.remove('content-fade-in');
        }, 200);
    }, 150);
}

// 並列表示用フィルター適用（提案チェック）
function applyVariationCategoryFilter() {
    const select = document.getElementById('variationCategoryFilter');
    const filterValue = select ? select.value : 'all';
    const targetArea = document.getElementById('variationDisplayArea');

    targetArea.classList.add('content-fade-out');
    setTimeout(() => {
        targetArea.classList.remove('content-fade-out');
        renderCategoryTablesFiltered(state.currentVariationData, 'variationDisplayArea', filterValue);
        targetArea.classList.add('content-fade-in');
        setTimeout(() => {
            targetArea.classList.remove('content-fade-in');
        }, 200);
    }, 150);
}

// 並列表示用フィルター適用（正誤チェック）
function applySimpleCategoryFilter() {
    const select = document.getElementById('simpleCategoryFilter');
    const filterValue = select ? select.value : 'all';
    const targetArea = document.getElementById('simpleDisplayArea');

    targetArea.classList.add('content-fade-out');
    setTimeout(() => {
        targetArea.classList.remove('content-fade-out');
        renderSimpleResultFiltered(state.currentSimpleData, 'simpleDisplayArea', filterValue);
        targetArea.classList.add('content-fade-in');
        setTimeout(() => {
            targetArea.classList.remove('content-fade-in');
        }, 200);
    }, 150);
}

// フィルター付きカテゴリテーブルレンダリング
function renderCategoryTablesFiltered(grouped, containerId, filterValue) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // カテゴリを番号順にソート
    const sortedKeys = Object.keys(grouped).sort((a, b) => grouped[a].order - grouped[b].order);

    // フィルター適用
    const filteredKeys = filterValue === 'all'
        ? sortedKeys
        : sortedKeys.filter(key => key === filterValue);

    if (filteredKeys.length === 0) {
        container.innerHTML = '<p style="color:#999; text-align:center; padding:40px;">該当するデータがありません</p>';
        return;
    }

    let html = '';
    let totalCount = 0;

    filteredKeys.forEach(category => {
        const group = grouped[category];
        const subKeys = Object.keys(group.subGroups);
        totalCount += subKeys.reduce((sum, k) => sum + group.subGroups[k].items.length, 0);
        html += buildCategoryCardHtml(category, group);
    });

    container.innerHTML = html;

    // 件数表示を更新
    updateResultCount(containerId, totalCount, filterValue !== 'all');
}

// フィルター付き正誤チェック結果レンダリング
function renderSimpleResultFiltered(data, containerId, filterValue) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // フィルター適用
    const filteredData = filterValue === 'all'
        ? data
        : data.filter(item => item.category === filterValue);

    if (currentSimpleDisplayMode === 'page') {
        renderSimplePageOrderToContainer(filteredData, container);
    } else {
        renderSimpleCategoryOrderToContainer(filteredData, container);
    }

    // 件数表示を更新
    const countId = containerId === 'simpleDisplayArea' ? 'simpleCountDisplay' : 'resultCountDisplay';
    const countEl = document.getElementById(countId);
    if (countEl) {
        const suffix = filterValue !== 'all' ? ' (フィルター中)' : '';
        countEl.textContent = `${filteredData.length}件${suffix}`;
    }
}

// 結果件数表示を更新
function updateResultCount(containerId, count, isFiltered) {
    let countId;
    if (containerId === 'variationDisplayArea') {
        countId = 'variationCountDisplay';
    } else if (containerId === 'simpleDisplayArea') {
        countId = 'simpleCountDisplay';
    } else {
        countId = 'resultCountDisplay';
    }

    const countEl = document.getElementById(countId);
    if (countEl) {
        const suffix = isFiltered ? ' (フィルター中)' : '';
        countEl.textContent = `${count}件${suffix}`;
    }
}

// 正誤チェック：ページ順表示（コンテナ指定版）
function renderSimplePageOrderToContainer(data, container) {
    const sorted = [...data].sort(compareByVolumeAndPage);

    if (sorted.length === 0) {
        container.innerHTML = '<p style="color:#999; text-align:center; padding:40px;">該当するデータがありません</p>';
        return;
    }

    let html = `
        <div class="result-simple-table-wrapper">
            <table class="result-table result-simple-table">
                <thead>
                    <tr>
                        <th style="width:60px;">ページ</th>
                        <th style="width:100px;">種別</th>
                        <th style="width:180px;">セリフ</th>
                        <th>指摘内容</th>
                    </tr>
                </thead>
                <tbody>
    `;

    sorted.forEach(item => {
        const categoryColor = getSimpleCategoryColor(item.category);
        html += `
                    <tr>
                        <td style="text-align:center; font-weight:bold;">${escapeHtml(item.page)}</td>
                        <td><span class="category-badge" style="background:${categoryColor};">${escapeHtml(item.category)}</span></td>
                        <td>${escapeHtml(item.excerpt)}</td>
                        <td>${escapeHtml(item.content)}</td>
                    </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = html;
}

// 正誤チェック：カテゴリ別表示（コンテナ指定版）
function renderSimpleCategoryOrderToContainer(data, container) {
    const grouped = {};
    data.forEach(item => {
        const key = item.category || '未分類';
        if (!grouped[key]) {
            grouped[key] = [];
        }
        grouped[key].push(item);
    });

    const sortedKeys = Object.keys(grouped).sort();

    if (sortedKeys.length === 0) {
        container.innerHTML = '<p style="color:#999; text-align:center; padding:40px;">該当するデータがありません</p>';
        return;
    }

    let html = '';
    sortedKeys.forEach((category, idx) => {
        const items = grouped[category];
        const colorClass = getCategoryColorClass(idx + 1);
        const sortedItems = [...items].sort(compareByVolumeAndPage);

        html += `
        <div class="result-category-card ${colorClass}">
            <div class="result-category-header" onclick="toggleResultCategory(this)">
                <span class="result-category-toggle">▼</span>
                <span class="result-category-name">${escapeHtml(category)}</span>
                <span class="result-category-count">(${sortedItems.length}件)</span>
            </div>
            <div class="result-category-body">
                <table class="result-table">
                    <thead>
                        <tr>
                            <th style="width:80px;">ページ</th>
                            <th style="width:200px;">セリフ</th>
                            <th>指摘内容</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        sortedItems.forEach(item => {
            html += `
                        <tr>
                            <td>${escapeHtml(item.page)}</td>
                            <td>${escapeHtml(item.excerpt)}</td>
                            <td>${escapeHtml(item.content)}</td>
                        </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        </div>
        `;
    });

    container.innerHTML = html;
}

// 結果ビューアをクリア
function clearResultViewer() {
    document.getElementById('resultPasteArea').value = '';
    document.getElementById('resultDisplayArea').innerHTML = '<p style="color:#999; text-align:center;">結果を貼り付けて「解析して表示」をクリックしてください</p>';
    state.currentSimpleData = [];
}

// 正誤チェック結果の表示（ページ順/カテゴリ別切り替え対応）
function renderSimpleResult(data) {
    resultRowCounter = 0;
    resultPickedState.clear();
    resultRowData.clear();
    if (currentSimpleDisplayMode === 'page') {
        renderSimplePageOrder(data);
    } else {
        renderSimpleCategoryOrder(data);
    }
}

// 正誤チェック：ページ順表示
function renderSimplePageOrder(data) {
    const container = document.getElementById('resultDisplayArea');

    // ページ番号でソート
    const sorted = [...data].sort(compareByVolumeAndPage);

    if (sorted.length === 0) {
        container.innerHTML = '<p style="color:#999; text-align:center;">該当するデータがありません</p>';
        return;
    }

    let html = `
        <div class="result-simple-table-wrapper">
            <table class="result-table result-simple-table">
                <thead>
                    <tr>
                        <th style="width:36px;"></th>
                        <th style="width:60px;">ページ</th>
                        <th style="width:100px;">種別</th>
                        <th style="width:180px;">セリフ</th>
                        <th>指摘内容</th>
                    </tr>
                </thead>
                <tbody>
    `;

    sorted.forEach(item => {
        const rowId = 'rr_' + (resultRowCounter++);
        const checkedAttr = getCheckedAttr('simple', item.category, item.page, item.excerpt);
        resultPickedState.set(rowId, !!checkedAttr);
        resultRowData.set(rowId, { type: 'simple', category: item.category, page: item.page, excerpt: item.excerpt, content: item.content });
        const categoryColor = getSimpleCategoryColor(item.category);
        html += `
                    <tr>
                        <td style="text-align:center;"><input type="checkbox" class="result-row-checkbox" data-row-id="${rowId}"${checkedAttr} onchange="toggleResultPicked('${rowId}', this)"></td>
                        <td style="text-align:center; font-weight:bold;">${escapeHtml(item.page)}</td>
                        <td><span class="category-badge" style="background:${categoryColor};">${escapeHtml(item.category)}</span></td>
                        <td>${escapeHtml(item.excerpt)}</td>
                        <td>${escapeHtml(item.content)}</td>
                    </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = html;
}

// 正誤チェック：カテゴリ別表示
function renderSimpleCategoryOrder(data) {
    const container = document.getElementById('resultDisplayArea');

    // カテゴリでグループ化
    const grouped = {};
    data.forEach(item => {
        const key = item.category;
        if (!grouped[key]) {
            grouped[key] = [];
        }
        grouped[key].push(item);
    });

    // カテゴリ名でソート
    const sortedKeys = Object.keys(grouped).sort();

    if (sortedKeys.length === 0) {
        container.innerHTML = '<p style="color:#999; text-align:center;">該当するデータがありません</p>';
        return;
    }

    let html = '';
    let colorIndex = 0;

    sortedKeys.forEach(category => {
        const items = grouped[category];
        const count = items.length;
        const colorClass = getCategoryColorClass(colorIndex + 1);
        colorIndex++;

        // 各カテゴリ内でページ順にソート
        items.sort(compareByVolumeAndPage);

        html += `
        <div class="result-category-card ${colorClass}">
            <div class="result-category-header">
                <input type="checkbox" class="result-master-checkbox" onchange="toggleCategoryPicked(this)" onclick="event.stopPropagation()">
                <span class="result-category-toggle" onclick="toggleResultCategory(this.parentElement)">▼</span>
                <span class="result-category-name" onclick="toggleResultCategory(this.parentElement)">${escapeHtml(category)}</span>
                <span class="result-category-count" onclick="toggleResultCategory(this.parentElement)">(${count}件)</span>
            </div>
            <div class="result-category-body">
                <table class="result-table">
                    <thead>
                        <tr>
                            <th style="width:36px;"></th>
                            <th style="width:60px;">ページ</th>
                            <th style="width:180px;">セリフ</th>
                            <th>指摘内容</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        items.forEach(item => {
            const rowId = 'rr_' + (resultRowCounter++);
            const checkedAttr = getCheckedAttr('simple', item.category, item.page, item.excerpt);
            resultPickedState.set(rowId, !!checkedAttr);
            resultRowData.set(rowId, { type: 'simple', category: item.category, page: item.page, excerpt: item.excerpt, content: item.content });
            html += `
                        <tr>
                            <td style="text-align:center;"><input type="checkbox" class="result-row-checkbox" data-row-id="${rowId}"${checkedAttr} onchange="toggleResultPicked('${rowId}', this)"></td>
                            <td style="text-align:center;">${escapeHtml(item.page)}</td>
                            <td>${escapeHtml(item.excerpt)}</td>
                            <td>${escapeHtml(item.content)}</td>
                        </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        </div>
        `;
    });

    container.innerHTML = html;
}

// カテゴリからチェック種別（正誤/提案）を判定
// correctness = 正誤チェック（誤字・脱字・衍字・人物名誤記・単位誤り・伏字未適用・ルール未反映・助詞）
// proposal    = 提案チェック（人名ルビ・常用外漢字・熟字訓・当て字）
function getCheckKind(category, type) {
    if (type === 'variation') return 'proposal';
    const proposalCategories = ['人名ルビ', '常用外漢字', '熟字訓', '当て字'];
    return proposalCategories.includes(category) ? 'proposal' : 'correctness';
}

// 正誤チェックのカテゴリ色を取得
function getSimpleCategoryColor(category) {
    const colorMap = {
        '人名ルビ': '#3498db',
        '常用外漢字': '#e67e22',
        'ルール未反映': '#9b59b6',
        '誤字': '#e74c3c',
        '人物名誤記': '#1abc9c',
        '脱字': '#c0392b',
        '衍字': '#d35400',
        '助詞': '#2980b9'
    };
    return colorMap[category] || '#95a5a6';
}


// ES Module exports
export { makePickedKey, toggleResultPicked, toggleCategoryPicked, getCheckedAttr, getPickedResultData, extractCalibrationInfoFromPath, saveCalibrationData, closeCalibrationFolderModal, loadCalibrationFolderContents, selectCalibrationFolder, closeCalibrationSaveModal, confirmCalibrationSave, showCalibrationSaveSuccessModal, closeCalibrationSaveSuccessModal, launchComicBridgeFromSave, showCalibrationNewWorkForm, closeCalibrationNewWorkModal, registerCalibrationNewWork, startCalibrationNewWorkFromBrowser, performCalibrationFolderSearch, clearCalibrationFolderSearch, initCalibrationFolderBrowser, goToResultViewerPage, showResultViewerPage, goToHomeFromResultViewer, goToProofreadingFromResultViewer, selectPasteType, parseAndGoToViewer, openResultPasteModal, closeResultPasteModal, switchResultTab, setupSingleFilterForVariation, setupSingleFilterForSimple, setupParallelFilters, renderParallelView, countVariationItems, renderCategoryTablesToElement, renderSimpleResultToElement, renderSimplePageOrderToElement, renderSimpleCategoryOrderToElement, openResultPasteModalFor, showEmptyResultMessage, updateResultCountSimple, updateCountDisplay, clearCurrentResult, clearVariationResult, clearSimpleResult, switchSimpleDisplayMode, parseAndDisplayResult, extractVolumeAndPage, formatPageShort, compareByVolumeAndPage, parseVariationCSV, parseSimpleCSV, parseCSVLine, groupByCategory, buildCategoryCardHtml, renderCategoryTables, getCategoryColorClass, toggleResultCategory, populateCategoryFilter, applySingleCategoryFilter, applyVariationCategoryFilter, applySimpleCategoryFilter, renderCategoryTablesFiltered, renderSimpleResultFiltered, updateResultCount, renderSimplePageOrderToContainer, renderSimpleCategoryOrderToContainer, clearResultViewer, renderSimpleResult, renderSimplePageOrder, renderSimpleCategoryOrder, getCheckKind, getSimpleCategoryColor };

// Expose to window for inline HTML handlers
Object.assign(window, { labelToTxtFolderMapping, makePickedKey, toggleResultPicked, toggleCategoryPicked, getCheckedAttr, getPickedResultData, extractCalibrationInfoFromPath, saveCalibrationData, closeCalibrationFolderModal, loadCalibrationFolderContents, selectCalibrationFolder, closeCalibrationSaveModal, confirmCalibrationSave, showCalibrationSaveSuccessModal, closeCalibrationSaveSuccessModal, launchComicBridgeFromSave, showCalibrationNewWorkForm, closeCalibrationNewWorkModal, registerCalibrationNewWork, startCalibrationNewWorkFromBrowser, performCalibrationFolderSearch, clearCalibrationFolderSearch, initCalibrationFolderBrowser, goToResultViewerPage, showResultViewerPage, goToHomeFromResultViewer, goToProofreadingFromResultViewer, selectPasteType, parseAndGoToViewer, openResultPasteModal, closeResultPasteModal, switchResultTab, setupSingleFilterForVariation, setupSingleFilterForSimple, setupParallelFilters, renderParallelView, countVariationItems, renderCategoryTablesToElement, renderSimpleResultToElement, renderSimplePageOrderToElement, renderSimpleCategoryOrderToElement, openResultPasteModalFor, showEmptyResultMessage, updateResultCountSimple, updateResultCount, updateCountDisplay, clearCurrentResult, clearVariationResult, clearSimpleResult, switchSimpleDisplayMode, parseAndDisplayResult, extractVolumeAndPage, formatPageShort, compareByVolumeAndPage, parseVariationCSV, parseSimpleCSV, parseCSVLine, groupByCategory, buildCategoryCardHtml, renderCategoryTables, getCategoryColorClass, toggleResultCategory, populateCategoryFilter, applySingleCategoryFilter, applyVariationCategoryFilter, applySimpleCategoryFilter, renderCategoryTablesFiltered, renderSimpleResultFiltered, renderSimplePageOrderToContainer, renderSimpleCategoryOrderToContainer, clearResultViewer, renderSimpleResult, renderSimplePageOrder, renderSimpleCategoryOrder, getCheckKind, getSimpleCategoryColor });
