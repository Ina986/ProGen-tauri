/* =========================================
   COMIC-POT エディタ（フルテキストエディタ）
   ========================================= */

import { state } from './progen-state.js';

// 通知表示（元ファイルに定義なし — 簡易実装）
function cpShowNotification(message, type) {
    console.log(`[COMIC-POT ${type}] ${message}`);
}

// ===== COMIC-POT 状態管理 =====
let cpText = '';
let cpChunks = [];
let cpSelectedChunkIndex = null;
let cpFileName = '無題';
let cpFilePath = ''; // 保存先ファイルパス（上書き用）
let cpSavedText = ''; // 最後に保存/ロードした時点のテキスト（dirty判定用）
let cpIsEditing = false;
let cpComicPotHeader = '';
let cpDraggedChunkIndex = null;
let cpDragOverIndex = null;
let cpDropPosition = 'before';
let cpScrollPosition = 0;
let cpSourcePage = 'extraction'; // 遷移元ページ

// ルビモーダル用
let cpRubySelectionStart = 0;
let cpRubySelectionEnd = 0;
let cpRubySelectedText = '';
let cpRubyMode = localStorage.getItem('cpRubyMode') || 'comicpot'; // 'comicpot' | 'standard'

// ===== COMIC-POT スプリットビュー =====
let cpResultPanelVisible = false;
let cpPanelCurrentTab = 'simple';
let cpPanelWidthPercent = 50;
let cpIsResizing = false;

// ===== COMIC-POT DOM要素（遅延取得） =====
let cpEditTextArea, cpSelectModeEl;
let cpBtnCopy, cpBtnToggleMode;
let cpBtnDeleteMark, cpBtnRuby, cpBtnConvert, cpBtnSave, cpBtnSaveAs;
let cpCopyBtnFloat, cpStatusInfo, cpFileNameDisplay;
let cpContextBar, cpContextModeLabel, cpContextModeHint;
let cpNotificationEl, cpNotificationInner;
let cpResultPanelEl, cpResultPanelBody, cpEditorColumn, cpResizeHandle;
let cpBtnTogglePanel, cpPanelSep, cpPanelTabVariation, cpPanelTabSimple, cpPanelCategoryFilter;

function cpInitDomRefs() {
    cpEditTextArea = document.getElementById('cpEditTextArea');
    cpSelectModeEl = document.getElementById('cpSelectMode');
    cpBtnCopy = document.getElementById('cpBtnCopy');
    cpBtnToggleMode = document.getElementById('cpBtnToggleMode');
    cpBtnDeleteMark = document.getElementById('cpBtnDeleteMark');
    cpBtnRuby = document.getElementById('cpBtnRuby');
    cpBtnConvert = document.getElementById('cpBtnConvert');
    cpBtnSave = document.getElementById('cpBtnSave');
    cpBtnSaveAs = document.getElementById('cpBtnSaveAs');
    cpContextBar = document.getElementById('cpContextBar');
    cpContextModeLabel = document.getElementById('cpContextModeLabel');
    cpContextModeHint = document.getElementById('cpContextModeHint');
    cpCopyBtnFloat = document.getElementById('cpCopyBtnFloat');
    cpStatusInfo = document.getElementById('cpStatusInfo');
    cpFileNameDisplay = document.getElementById('cpFileNameDisplay');
    cpNotificationEl = document.getElementById('cpNotification');
    cpNotificationInner = document.getElementById('cpNotificationInner');
    // スプリットビュー用
    cpResultPanelEl = document.getElementById('cpResultPanel');
    cpResultPanelBody = document.getElementById('cpResultPanelBody');
    cpEditorColumn = document.getElementById('cpEditorColumn');
    cpResizeHandle = document.getElementById('cpResizeHandle');
    cpBtnTogglePanel = document.getElementById('cpBtnTogglePanel');
    cpPanelSep = document.getElementById('cpPanelSep');
    cpPanelTabVariation = document.getElementById('cpPanelTabVariation');
    cpPanelTabSimple = document.getElementById('cpPanelTabSimple');
    cpPanelCategoryFilter = document.getElementById('cpPanelCategoryFilter');
}

// ===== ページ遷移 =====
function goToComicPotEditor(source, options) {
    cpSourcePage = source || 'extraction';
    cpInitDomRefs();

    const editorPage = document.getElementById('comicPotEditorPage');

    // 全ページを非表示
    document.getElementById('landingScreen').style.display = 'none';
    document.getElementById('mainWrapper').style.display = 'none';
    document.getElementById('proofreadingPage').style.display = 'none';
    document.getElementById('adminPage').style.display = 'none';
    document.getElementById('resultViewerPage').style.display = 'none';
    document.getElementById('specSheetPage').style.display = 'none';

    editorPage.style.display = 'flex';
    editorPage.classList.add('page-transition-zoom-in');
    setTimeout(() => {
        editorPage.classList.remove('page-transition-zoom-in');
    }, 350);

    // イベントリスナーを初期化（初回のみ）
    cpSetupEventListeners();
    cpRender();

    // セリフ読込ボタン: 読み込み済みテキストがあれば表示
    const cpBtnLoadSerif = document.getElementById('cpBtnLoadSerif');
    if (cpSourcePage === 'proofreading' && state.proofreadingFiles.length > 0) {
        cpBtnLoadSerif.style.display = '';
    } else if ((cpSourcePage === 'extraction' || cpSourcePage === 'landing') && state.manuscriptTxtFiles.length > 0) {
        cpBtnLoadSerif.style.display = '';
    } else {
        cpBtnLoadSerif.style.display = 'none';
    }

    // スプリットビュー: トグルボタン（廃止済み — 校正結果パネルは常に表示）
    if (cpBtnTogglePanel) cpBtnTogglePanel.style.display = '';
    if (cpPanelSep) cpPanelSep.style.display = '';

    // 校正結果パネルをデフォルトで表示（データの有無に関わらず）
    cpShowResultPanel();

    // ランディングからの場合はビューアータブで開く
    if (options && options.showViewer) {
        cpSwitchPanelTab('viewer');
    }

    // 校正プロンプトからの遷移でテキストが1つだけなら自動読み込み
    if (cpSourcePage === 'proofreading' && state.proofreadingFiles.length === 1) {
        cpApplySerifFile(state.proofreadingFiles[0]);
    }
}

function cpLoadSerifText() {
    const files = cpSourcePage === 'proofreading' ? state.proofreadingFiles : state.manuscriptTxtFiles;
    if (!files || files.length === 0) {
        cpShowNotification('読み込み済みのセリフテキストがありません。', 'error');
        return;
    }
    if (files.length === 1) {
        cpApplySerifFile(files[0]);
    } else {
        cpOpenSerifSelectModal(files);
    }
}

function cpApplySerifFile(file) {
    if (cpText.trim() !== '') {
        if (!confirm('現在のテキストを上書きしますか？')) return;
    }
    cpText = file.content;
    cpSavedText = cpText;
    cpFilePath = '';
    cpFileName = file.name;
    cpComicPotHeader = cpExtractComicPotHeader(cpText);
    cpChunks = cpParseTextToChunks(cpText);
    cpSelectedChunkIndex = null;
    cpIsEditing = false;
    cpRender();
    cpShowNotification('「' + file.name + '」を読み込みました。', 'success');
}

function cpLoadAllSerifText() {
    const files = cpSourcePage === 'proofreading' ? state.proofreadingFiles : state.manuscriptTxtFiles;
    cpCloseSerifSelectModal();
    if (cpText.trim() !== '') {
        if (!confirm('現在のテキストを上書きしますか？')) return;
    }
    const combined = files.map(f => f.content).join('\n\n');
    cpText = combined;
    cpSavedText = cpText;
    cpFilePath = '';
    cpFileName = files[0].name + ' 他' + (files.length - 1) + '件';
    cpComicPotHeader = cpExtractComicPotHeader(cpText);
    cpChunks = cpParseTextToChunks(cpText);
    cpSelectedChunkIndex = null;
    cpIsEditing = false;
    cpRender();
    cpShowNotification(files.length + '件のセリフテキストをすべて読み込みました。', 'success');
}

function cpOpenSerifSelectModal(files) {
    const listEl = document.getElementById('cpSerifFileList');
    listEl.innerHTML = '';
    files.forEach((f, i) => {
        const sizeKB = (f.size / 1024).toFixed(1);
        const item = document.createElement('div');
        item.className = 'cp-serif-file-item';
        item.innerHTML = '<span class="cp-sf-name">' + f.name + '</span><span class="cp-sf-size">' + sizeKB + ' KB</span>';
        item.onclick = () => {
            cpCloseSerifSelectModal();
            cpApplySerifFile(f);
        };
        listEl.appendChild(item);
    });
    document.getElementById('cpSerifSelectModal').style.display = 'flex';
}

function cpCloseSerifSelectModal() {
    document.getElementById('cpSerifSelectModal').style.display = 'none';
}

/**
 * COMIC-POTハンドオフ: 外部プラグインから渡されたテキストをエディタに読み込み
 */
async function cpLoadFromHandoff(data) {
    let content = data.content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (content.charCodeAt(0) === 0xFEFF) content = content.substring(1); // BOM除去

    const fileInfo = {
        name: data.fileName,
        content: content,
        size: content.length
    };

    // 両方のファイルリストに追加（セリフテキスト読み込みと同等の扱い）
    state.manuscriptTxtFiles = state.manuscriptTxtFiles.concat([fileInfo]);
    state.proofreadingFiles = state.proofreadingFiles.concat([fileInfo]);

    // 抽出プロンプト側のUI更新
    updateNonJoyoDetection();
    renderTxtFileList();
    const totalSize = state.manuscriptTxtFiles.reduce((sum, f) => sum + f.size, 0);
    const statusEl = document.getElementById('txtUploadStatus');
    if (statusEl) statusEl.textContent = state.manuscriptTxtFiles.length + 'ファイル (' + formatFileSize(totalSize) + ')';
    const manageBtn = document.getElementById('txtManageBtn');
    if (manageBtn) manageBtn.style.display = 'inline-block';
    const geminiBtn = document.getElementById('extractionGeminiBtn');
    if (geminiBtn) geminiBtn.removeAttribute('disabled');

    // 校正プロンプト側のUI更新
    state.proofreadingContent = state.proofreadingFiles.map(f => f.content).join('\n\n--- 次のファイル ---\n\n');
    renderProofreadingFileList();
    const detectedLines = detectNonJoyoLinesWithPageInfo(state.proofreadingFiles);
    state.proofreadingDetectedNonJoyoWords = detectedLines;
    updateProofreadingPrompt();

    // 校正データ保存用のパス情報を抽出（ベースパス未取得なら先に取得）
    if (data.filePath) {
        if (!state.txtFolderBasePath && window.electronAPI && window.electronAPI.getTxtFolderPath) {
            try { state.txtFolderBasePath = await window.electronAPI.getTxtFolderPath(); } catch (e) { /* ignore */ }
        }
        if (state.txtFolderBasePath) {
            extractCalibrationInfoFromPath(data.filePath, [fileInfo]);
        }
    }

    // COMIC-POTエディタに読み込み＆遷移（従来動作）
    cpText = content;
    cpSavedText = cpText;
    cpFilePath = data.filePath;
    cpFileName = data.fileName;
    cpComicPotHeader = cpExtractComicPotHeader(cpText);
    cpChunks = cpParseTextToChunks(cpText);
    cpSelectedChunkIndex = null;
    cpIsEditing = false;
    goToComicPotEditor('extraction');
    cpShowNotification('COMIC-POTから「' + data.fileName + '」を受け取りました。', 'success');
}

function goBackFromComicPotEditor() {
    // スプリットビューをリセット
    cpHideResultPanel();
    cpPanelCurrentTab = 'simple';
    cpPanelWidthPercent = 50;

    // 作品タイトルが保存されていれば、JSONフォルダから自動選択を試みる
    const pendingTitle = state.pendingWorkTitle;
    if (pendingTitle) {
        state.pendingWorkTitle = ''; // 消費
        _autoSelectWorkJson(pendingTitle);
    }

    const editorPage = document.getElementById('comicPotEditorPage');
    if (cpSourcePage === 'proofreading') {
        const proofreadingPage = document.getElementById('proofreadingPage');
        editorPage.classList.add('page-transition-out-down');
        setTimeout(() => {
            editorPage.style.display = 'none';
            editorPage.classList.remove('page-transition-out-down');
            proofreadingPage.style.display = 'flex';
            proofreadingPage.classList.add('page-transition-up');
            setTimeout(() => { proofreadingPage.classList.remove('page-transition-up'); }, 350);
        }, 200);
    } else if (cpSourcePage === 'landing') {
        const landingScreen = document.getElementById('landingScreen');
        editorPage.classList.add('page-transition-out-down');
        setTimeout(() => {
            editorPage.style.display = 'none';
            editorPage.classList.remove('page-transition-out-down');
            landingScreen.style.display = 'flex';
            landingScreen.classList.add('page-transition-up');
            setTimeout(() => { landingScreen.classList.remove('page-transition-up'); }, 350);
        }, 200);
    } else {
        const mainWrapper = document.getElementById('mainWrapper');
        editorPage.classList.add('page-transition-out-down');
        setTimeout(() => {
            editorPage.style.display = 'none';
            editorPage.classList.remove('page-transition-out-down');
            mainWrapper.style.display = 'flex';
            mainWrapper.classList.add('page-transition-up');
            setTimeout(() => { mainWrapper.classList.remove('page-transition-up'); }, 350);
            updateHeaderSaveButtons();
        }, 200);
    }
}

// ===== 保存確認モーダル =====
let _cpSaveConfirmResolve = null;

function cpShowSaveConfirm() {
    return new Promise((resolve) => {
        _cpSaveConfirmResolve = resolve;
        const modal = document.getElementById('cpSaveConfirmModal');
        const filenameEl = document.getElementById('cpSaveConfirmFilename');
        const overwriteBtn = document.getElementById('cpSaveConfirmOverwrite');

        // ファイルパスがある場合はファイル名を表示＆上書きボタンを有効化
        if (cpFilePath) {
            filenameEl.textContent = cpFileName || cpFilePath;
            filenameEl.classList.add('show');
            overwriteBtn.style.display = '';
        } else {
            filenameEl.classList.remove('show');
            overwriteBtn.style.display = 'none';
        }

        modal.classList.add('show');
    });
}

function cpCloseSaveConfirm() {
    const modal = document.getElementById('cpSaveConfirmModal');
    modal.classList.remove('show');
    if (_cpSaveConfirmResolve) {
        _cpSaveConfirmResolve('cancel');
        _cpSaveConfirmResolve = null;
    }
}

async function cpSaveConfirmAction(action) {
    const modal = document.getElementById('cpSaveConfirmModal');
    modal.classList.remove('show');

    if (action === 'overwrite' && cpFilePath) {
        const result = await window.electronAPI.writeTextFile(cpFilePath, cpText);
        if (result.success) {
            cpSavedText = cpText;
            cpShowNotify('保存しました: ' + cpFileName, 'var(--sage)');
        } else {
            cpShowNotify('保存に失敗しました', '#ef4444');
            if (_cpSaveConfirmResolve) { _cpSaveConfirmResolve('cancel'); _cpSaveConfirmResolve = null; }
            return;
        }
    } else if (action === 'saveas') {
        const dialogResult = await window.electronAPI.showSaveTextDialog(cpFileName || '無題.txt');
        if (!dialogResult.success) {
            if (_cpSaveConfirmResolve) { _cpSaveConfirmResolve('cancel'); _cpSaveConfirmResolve = null; }
            return;
        }
        const saveResult = await window.electronAPI.writeTextFile(dialogResult.filePath, cpText);
        if (saveResult.success) {
            cpFilePath = dialogResult.filePath;
            cpSavedText = cpText;
            const parts = dialogResult.filePath.replace(/\\/g, '/').split('/');
            cpFileName = parts[parts.length - 1];
            cpFileNameDisplay.textContent = cpFileName;
            cpShowNotify('保存しました: ' + cpFileName, 'var(--sage)');
        } else {
            cpShowNotify('保存に失敗しました', '#ef4444');
            if (_cpSaveConfirmResolve) { _cpSaveConfirmResolve('cancel'); _cpSaveConfirmResolve = null; }
            return;
        }
    }
    // action === 'skip' は何もしない

    if (_cpSaveConfirmResolve) {
        _cpSaveConfirmResolve(action);
        _cpSaveConfirmResolve = null;
    }
}

// ===== テキストエディタ → 校正プロンプトへ遷移（実際の遷移処理） =====
async function _cpExecuteProofreadingTransition() {
    // テキストを校正プロンプトに引き継ぐ
    if (cpText && cpText.trim() !== '') {
        const fileInfo = {
            name: cpFileName || '無題.txt',
            content: cpText,
            size: new Blob([cpText]).size
        };
        state.proofreadingFiles = [fileInfo];
        state.proofreadingContent = cpText;
    }

    // スプリットビューをリセット
    cpHideResultPanel();
    cpPanelCurrentTab = 'simple';
    cpPanelWidthPercent = 50;

    // 校正プロンプトページのレーベルUIをボタン選択モードで表示
    const proofSelectorGroup = document.getElementById('proofreadingLabelSelectorGroup');
    const proofDisplayGroup = document.getElementById('proofreadingLabelDisplayGroup');
    if (proofSelectorGroup) proofSelectorGroup.style.display = 'flex';
    if (proofDisplayGroup) proofDisplayGroup.style.display = 'none';

    // テキストエディタで校正チェック結果JSONを開いていた場合、
    // 親の親フォルダ名（=作品タイトル）からJSONフォルダ内の作品JSONを自動選択
    if (state.pendingWorkTitle) {
        const title = state.pendingWorkTitle;
        state.pendingWorkTitle = '';
        await _autoSelectWorkJson(title);
    }

    // 校正プロンプトページへ遷移
    const editorPage = document.getElementById('comicPotEditorPage');
    const proofreadingPage = document.getElementById('proofreadingPage');
    editorPage.classList.add('page-transition-out-down');
    setTimeout(() => {
        editorPage.style.display = 'none';
        editorPage.classList.remove('page-transition-out-down');
        proofreadingPage.style.display = 'flex';
        proofreadingPage.classList.add('page-transition-up');
        setTimeout(() => { proofreadingPage.classList.remove('page-transition-up'); }, 350);
    }, 200);

    // 校正ページの状態を更新（_autoSelectWorkJson完了後にルール反映済み）
    renderProofreadingFileList();
    updateProofreadingPrompt();
    updateProofreadingCheckItems();

    // 常用外漢字を検出
    if (state.proofreadingFiles.length > 0) {
        const detectedLines = detectNonJoyoLinesWithPageInfo(state.proofreadingFiles);
        state.proofreadingDetectedNonJoyoWords = detectedLines;
        showNonJoyoResultPopup(detectedLines, true);
    }
}

// ===== テキストエディタ → 校正プロンプトへ遷移 =====
async function cpGoToProofreading() {
    // 編集モード中ならテキストエリアの内容を反映
    if (cpIsEditing) {
        let content = cpEditTextArea.value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        cpComicPotHeader = cpExtractComicPotHeader(content);
        cpText = content;
        cpChunks = cpParseTextToChunks(content);
    }

    // テキストに未保存の変更がある場合のみ保存確認モーダルを表示
    if (cpText && cpText.trim() !== '' && cpText !== cpSavedText) {
        const result = await cpShowSaveConfirm();
        if (result === 'cancel') return;
    }

    // テキストエディタでJSONを開いている場合はレーベル選択不要（遷移先で自動選択される）
    // それ以外でルールもレーベルも未設定の場合のみレーベル選択モーダルを表示
    const hasPendingJson = !!state.pendingWorkTitle;
    const proofLabel = document.getElementById('proofreadingLabelSelect');
    const hasRules = state.currentProofRules && state.currentProofRules.length > 0;
    const labelValue = proofLabel ? proofLabel.value : '';
    const hasLabel = labelValue && labelValue !== 'default';
    if (!hasPendingJson && !hasRules && !hasLabel) {
        state._cpPendingProofreadingTransition = _cpExecuteProofreadingTransition;
        openLabelSelectModal('comicpot-proofreading');
        return;
    }

    _cpExecuteProofreadingTransition();
}

// JSONフォルダから作品タイトルに一致するJSONを自動選択（state更新のみ、画面遷移なし）
async function _autoSelectWorkJson(workTitle) {
    if (!window.electronAPI || !window.electronAPI.isElectron) return;
    try {
        const basePath = await window.electronAPI.getJsonFolderPath();
        const rootResult = await window.electronAPI.listDirectory(basePath);
        if (!rootResult.success) return;

        // レーベルフォルダを走査して作品名.jsonを検索
        const labelFolders = rootResult.items.filter(i => i.isDirectory);
        for (const label of labelFolders) {
            const labelResult = await window.electronAPI.listDirectory(label.path);
            if (!labelResult.success) continue;
            const match = labelResult.items.find(i =>
                i.isFile && i.name.toLowerCase().endsWith('.json') &&
                i.name.replace(/\.json$/i, '') === workTitle
            );
            if (match) {
                // 自動選択
                // JSONを読み込んでstate更新
                const result = await window.electronAPI.readJsonFile(match.path);
                if (!result.success) continue;

                state.currentLoadedJson = result.data;
                state.currentJsonPath = match.path;

                // 表記ルールを読み込み
                const data = result.data;
                const isNewFormat = data.presetData !== undefined;
                const proofRules = data.proofRules;
                if (proofRules) {
                    if (proofRules.proof && Array.isArray(proofRules.proof)) {
                        state.currentProofRules = proofRules.proof;
                        state.currentProofRules.forEach(r => {
                            if (!r.category) r.category = 'basic';
                            if (r.category === 'character' && r.addRuby === undefined) r.addRuby = true;
                        });
                    }
                    if (proofRules.symbol && Array.isArray(proofRules.symbol)) {
                        state.symbolRules = proofRules.symbol;
                    }
                    if (proofRules.options) {
                        const opts = proofRules.options;
                        if (opts.ngWordMasking !== undefined) state.optionNgWordMasking = opts.ngWordMasking;
                        if (opts.punctuationToSpace !== undefined) state.optionPunctuationToSpace = opts.punctuationToSpace;
                        if (opts.difficultRuby !== undefined) state.optionDifficultRuby = opts.difficultRuby;
                        if (opts.typoCheck !== undefined) state.optionTypoCheck = opts.typoCheck;
                        if (opts.missingCharCheck !== undefined) state.optionMissingCharCheck = opts.missingCharCheck;
                        if (opts.nameRubyCheck !== undefined) state.optionNameRubyCheck = opts.nameRubyCheck;
                        if (opts.nonJoyoCheck !== undefined) state.optionNonJoyoCheck = opts.nonJoyoCheck;
                        if (opts.numberRulePersonCount !== undefined) state.numberRulePersonCount = opts.numberRulePersonCount;
                        if (opts.numberRuleThingCount !== undefined) state.numberRuleThingCount = opts.numberRuleThingCount;
                        if (opts.numberRuleMonth !== undefined) state.numberRuleMonth = opts.numberRuleMonth;
                        if (opts.numberSubRulesEnabled !== undefined) state.numberSubRulesEnabled = opts.numberSubRulesEnabled;
                    }
                }

                // 旧形式の場合は新形式に正規化
                if (!isNewFormat) {
                    const { proofRules: oldProof, ...rest } = data;
                    state.currentLoadedJson = {
                        proofRules: oldProof || { proof: [], symbol: [], options: {} },
                        presetData: rest
                    };
                }

                // レーベル情報を各ページのhidden inputに設定
                const presetData = isNewFormat ? data.presetData : data;
                const labelName = presetData.workInfo?.label || '';
                if (labelName) {
                    const landingLabel = document.getElementById('landingLabelSelect');
                    if (landingLabel) landingLabel.value = labelName;

                    const proofLabel = document.getElementById('proofreadingLabelSelect');
                    const proofLabelText = document.getElementById('proofreadingLabelSelectorText');
                    if (proofLabel) proofLabel.value = labelName;
                    if (proofLabelText) {
                        proofLabelText.textContent = labelName;
                        proofLabelText.classList.remove('unselected');
                    }
                }

                // JSON表示を更新
                const jsonIndicator = document.getElementById('loadedJsonIndicator');
                const jsonFilenameSpan = document.getElementById('loadedJsonFilename');
                if (jsonIndicator && jsonFilenameSpan) {
                    jsonFilenameSpan.textContent = match.name;
                    jsonIndicator.style.display = 'flex';
                }
                const proofJsonIndicator = document.getElementById('proofreadingJsonIndicator');
                const proofJsonFilename = document.getElementById('proofreadingJsonFilename');
                if (proofJsonIndicator && proofJsonFilename) {
                    proofJsonFilename.textContent = match.name;
                    proofJsonIndicator.style.display = 'flex';
                }

                // 校正ページのオプションラベルを更新
                if (typeof updateProofreadingOptionsLabel === 'function') {
                    updateProofreadingOptionsLabel();
                }

                return;
            }
        }
        console.log('自動選択: 一致する作品が見つかりませんでした: ' + workTitle);
    } catch (e) {
        console.error('自動選択エラー:', e);
    }
}

// ===== COMIC-POT スプリットビュー機能 =====

function cpToggleResultPanel() {
    if (cpResultPanelVisible) {
        cpHideResultPanel();
    } else {
        cpShowResultPanel();
    }
}

function cpShowResultPanel() {
    if (!cpResultPanelEl) return;
    cpResultPanelVisible = true;
    cpResultPanelEl.style.display = 'flex';
    cpResultPanelEl.style.width = cpPanelWidthPercent + '%';
    cpResizeHandle.style.display = 'block';
    if (cpBtnTogglePanel) cpBtnTogglePanel.classList.add('cp-panel-active');

    // 最適なタブを自動選択
    if (cpPanelCurrentTab === 'variation' && Object.keys(state.currentVariationData).length === 0 && state.currentSimpleData.length > 0) {
        cpPanelCurrentTab = 'simple';
    } else if (cpPanelCurrentTab === 'simple' && state.currentSimpleData.length === 0 && Object.keys(state.currentVariationData).length > 0) {
        cpPanelCurrentTab = 'variation';
    }
    cpPanelTabVariation.classList.toggle('active', cpPanelCurrentTab === 'variation');
    cpPanelTabSimple.classList.toggle('active', cpPanelCurrentTab === 'simple');

    cpRenderPanelContent();
    cpSetupPanelCategoryFilter();
}

function cpHideResultPanel() {
    if (!cpResultPanelEl) return;
    cpResultPanelVisible = false;
    cpResultPanelEl.style.display = 'none';
    cpResizeHandle.style.display = 'none';
    if (cpBtnTogglePanel) cpBtnTogglePanel.classList.remove('cp-panel-active');
}

function cpSwitchPanelTab(tab) {
    cpPanelCurrentTab = tab;
    cpPanelTabVariation.classList.toggle('active', tab === 'variation');
    cpPanelTabSimple.classList.toggle('active', tab === 'simple');
    const viewerTab = document.getElementById('cpPanelTabViewer');
    if (viewerTab) viewerTab.classList.toggle('active', tab === 'viewer');

    // ビューアーと校正結果の表示切替
    const viewerBody = document.getElementById('cpViewerBody');
    const filterEl = document.getElementById('cpPanelCategoryFilter');
    if (tab === 'viewer') {
        cpResultPanelBody.style.display = 'none';
        if (viewerBody) viewerBody.style.display = 'flex';
        if (filterEl) filterEl.style.display = 'none';
    } else {
        cpResultPanelBody.style.display = '';
        if (viewerBody) viewerBody.style.display = 'none';
        if (filterEl) filterEl.style.display = '';
        cpRenderPanelContent();
        cpSetupPanelCategoryFilter();
    }
}

function goToResultViewerPageFromEditor() {
    goToResultViewerPage();
}

function cpRenderPanelContent() {
    if (!cpResultPanelBody) return;

    const jsonLoadBtn = '<button class="btn btn-small" onclick="cpLoadResultJson()" style="margin-top:8px;">'
        + '<span class="svg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span> JSONを開く</button>';

    if (cpPanelCurrentTab === 'variation') {
        if (Object.keys(state.currentVariationData).length > 0) {
            renderCategoryTablesToElement(state.currentVariationData, cpResultPanelBody);
        } else {
            cpResultPanelBody.innerHTML = '<div style="text-align:center; padding:40px;">'
                + '<p style="color:#999; margin-bottom:16px;">提案チェックのデータがありません</p>'
                + '<button class="btn btn-purple btn-small" onclick="openResultPasteModalFor(\'variation\')" style="margin-top:8px;">'
                + '<span class="svg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span> 貼り付け</button>'
                + ' ' + jsonLoadBtn
                + '</div>';
        }
    } else {
        if (state.currentSimpleData.length > 0) {
            renderSimpleResultToElement(state.currentSimpleData, cpResultPanelBody);
        } else {
            cpResultPanelBody.innerHTML = '<div style="text-align:center; padding:40px;">'
                + '<p style="color:#999; margin-bottom:16px;">正誤チェックのデータがありません</p>'
                + '<button class="btn btn-purple btn-small" onclick="openResultPasteModalFor(\'simple\')" style="margin-top:8px;">'
                + '<span class="svg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span> 貼り付け</button>'
                + ' ' + jsonLoadBtn
                + '</div>';
        }
    }
}

function cpSetupPanelCategoryFilter() {
    if (!cpPanelCategoryFilter) return;

    while (cpPanelCategoryFilter.options.length > 1) {
        cpPanelCategoryFilter.remove(1);
    }
    cpPanelCategoryFilter.value = 'all';

    let categories = [];
    if (cpPanelCurrentTab === 'variation') {
        categories = Object.keys(state.currentVariationData).sort((a, b) => {
            return (state.currentVariationData[a].order || 0) - (state.currentVariationData[b].order || 0);
        });
    } else {
        categories = [...new Set(state.currentSimpleData.map(item => item.category))].sort();
    }

    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        cpPanelCategoryFilter.appendChild(option);
    });
}

function cpApplyPanelCategoryFilter() {
    const filterValue = cpPanelCategoryFilter.value;

    if (filterValue === 'all') {
        cpRenderPanelContent();
        return;
    }

    if (cpPanelCurrentTab === 'variation') {
        const filtered = {};
        Object.keys(state.currentVariationData).forEach(key => {
            if (key === filterValue) {
                filtered[key] = state.currentVariationData[key];
            }
        });
        renderCategoryTablesToElement(filtered, cpResultPanelBody);
    } else {
        const filtered = state.currentSimpleData.filter(item => item.category === filterValue);
        renderSimpleResultToElement(filtered, cpResultPanelBody);
    }
}

// ===== JSONブラウザ (MojiQ CalibrationPanel方式) =====
const CP_JSON_BASE_PATH = 'G:\\共有ドライブ\\CLLENN\\編集部フォルダ\\編集企画部\\写植・校正用テキストログ';
let cpJsonBrowserBasePath = '';
let cpJsonBrowserCurrentPath = '';
let cpJsonBrowserAllFiles = []; // 検索用キャッシュ（JSONファイル）
let cpJsonBrowserAllFolders = []; // 検索用キャッシュ（フォルダ）
let cpJsonBrowserSearchTimeout = null;

async function cpOpenJsonBrowser() {
    const modal = document.getElementById('cpJsonBrowserModal');
    if (!modal) return;
    modal.style.display = 'flex';

    const listEl = document.getElementById('cpJsonBrowserList');
    listEl.innerHTML = '<div class="cp-json-browser-empty">読み込み中...</div>';

    // 検索リセット
    const searchInput = document.getElementById('cpJsonBrowserSearchInput');
    if (searchInput) searchInput.value = '';
    cpJsonBrowserClearSearch();

    // ベースパスを試す
    const testResult = await window.electronAPI.listDirectory(CP_JSON_BASE_PATH);
    if (testResult.success) {
        cpJsonBrowserBasePath = CP_JSON_BASE_PATH;
    } else {
        cpJsonBrowserBasePath = 'C:\\';
    }
    await cpJsonBrowserLoadFolder(cpJsonBrowserBasePath);

    // バックグラウンドで全フォルダ＆JSONファイルをキャッシュ（検索用）
    cpJsonBrowserAllFiles = [];
    cpJsonBrowserAllFolders = [];
    _cpCacheJsonFilesRecursive(cpJsonBrowserBasePath);
}

function cpCloseJsonBrowser() {
    const modal = document.getElementById('cpJsonBrowserModal');
    if (modal) modal.style.display = 'none';
    if (cpJsonBrowserSearchTimeout) {
        clearTimeout(cpJsonBrowserSearchTimeout);
        cpJsonBrowserSearchTimeout = null;
    }
}

async function cpJsonBrowserLoadFolder(dirPath) {
    cpJsonBrowserCurrentPath = dirPath;
    const listEl = document.getElementById('cpJsonBrowserList');
    listEl.innerHTML = '<div class="cp-json-browser-empty">読み込み中...</div>';

    _cpUpdateBreadcrumb();

    try {
        const result = await window.electronAPI.listDirectory(dirPath);
        if (!result.success) {
            listEl.innerHTML = '<div class="cp-json-browser-empty">エラー: ' + _escHtml(result.error || '') + '</div>';
            return;
        }

        _cpRenderFolderList(result.items);
    } catch (error) {
        listEl.innerHTML = '<div class="cp-json-browser-empty">エラー: ' + _escHtml(String(error)) + '</div>';
    }
}

function _cpRenderFolderList(items) {
    const folders = items.filter(i => i.isDirectory).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    const files = items.filter(i => i.isFile && i.name.toLowerCase().endsWith('.json')).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    const allItems = [...folders, ...files];

    const listEl = document.getElementById('cpJsonBrowserList');
    if (allItems.length === 0) {
        listEl.innerHTML = '<div class="cp-json-browser-empty">データがありません</div>';
        return;
    }

    listEl.innerHTML = '';
    allItems.forEach(item => {
        const div = document.createElement('div');
        if (item.isDirectory) {
            div.className = 'cp-json-browser-item cp-json-browser-folder';
            div.innerHTML = '<span class="cp-json-browser-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span>'
                + '<span class="cp-json-browser-name">' + _escHtml(item.name) + '</span>';
            div.addEventListener('click', () => cpJsonBrowserOpenFolder(item.path));
        } else {
            div.className = 'cp-json-browser-item cp-json-browser-file';
            div.innerHTML = '<span class="cp-json-browser-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>'
                + '<span class="cp-json-browser-name">' + _escHtml(item.name) + '</span>';
            div.addEventListener('click', () => cpJsonBrowserOpenFile(item.path));
        }
        listEl.appendChild(div);
    });
}

function cpJsonBrowserOpenFolder(dirPath) {
    cpJsonBrowserLoadFolder(dirPath);
}

async function cpJsonBrowserOpenFile(filePath) {
    cpCloseJsonBrowser();
    // 親の親フォルダ名を作品タイトルとして保存（自動選択用）
    // パス例: .../作品名/サブフォルダ/check.json → parts[-3] = 作品名
    const parts = filePath.replace(/\\/g, '/').split('/');
    if (parts.length >= 3) {
        state.pendingWorkTitle = parts[parts.length - 3]; // 親の親フォルダ名
    }
    await _loadJsonFromPath(filePath);
}

function _cpUpdateBreadcrumb() {
    const breadcrumbEl = document.getElementById('cpJsonBrowserBreadcrumb');
    if (!breadcrumbEl || !cpJsonBrowserBasePath || !cpJsonBrowserCurrentPath) return;

    const normalizedBase = cpJsonBrowserBasePath.replace(/\\/g, '/');
    const normalizedCurrent = cpJsonBrowserCurrentPath.replace(/\\/g, '/');

    // 戻るボタンの有効/無効を更新
    const backBtn = document.getElementById('cpJsonBrowserBackBtn');
    if (backBtn) {
        const isAtRoot = normalizedCurrent === normalizedBase;
        backBtn.disabled = isAtRoot;
        backBtn.style.opacity = isAtRoot ? '0.3' : '1';
    }

    breadcrumbEl.innerHTML = '';

    // TOP
    const topSpan = document.createElement('span');
    topSpan.className = 'cp-json-browser-crumb cp-json-browser-crumb-root';
    topSpan.textContent = 'TOP';
    topSpan.addEventListener('click', () => cpJsonBrowserLoadFolder(cpJsonBrowserBasePath));
    breadcrumbEl.appendChild(topSpan);

    if (normalizedCurrent !== normalizedBase) {
        const relative = normalizedCurrent.substring(normalizedBase.length + 1);
        const parts = relative.split('/');
        let accumulated = cpJsonBrowserBasePath;

        parts.forEach((part, i) => {
            accumulated = accumulated + '\\' + part;
            const isLast = i === parts.length - 1;

            const sep = document.createElement('span');
            sep.className = 'cp-json-browser-crumb-sep';
            sep.textContent = '›';
            breadcrumbEl.appendChild(sep);

            const crumb = document.createElement('span');
            crumb.className = 'cp-json-browser-crumb' + (isLast ? ' cp-json-browser-crumb-current' : '');
            crumb.textContent = part;
            if (!isLast) {
                const targetPath = accumulated;
                crumb.addEventListener('click', () => cpJsonBrowserLoadFolder(targetPath));
            }
            breadcrumbEl.appendChild(crumb);
        });
    }
}

// ===== 検索機能 =====
async function _cpCacheJsonFilesRecursive(dirPath) {
    try {
        const result = await window.electronAPI.listDirectory(dirPath);
        if (!result.success) return;

        for (const item of result.items) {
            if (item.isDirectory) {
                // フォルダもキャッシュに追加
                const relativePath = item.path.replace(cpJsonBrowserBasePath, '').replace(/^[\\\/]/, '');
                cpJsonBrowserAllFolders.push({
                    name: item.name,
                    path: item.path,
                    relativePath: relativePath
                });
                await _cpCacheJsonFilesRecursive(item.path);
            } else if (item.isFile && item.name.toLowerCase().endsWith('.json')) {
                const relativePath = item.path.replace(cpJsonBrowserBasePath, '').replace(/^[\\\/]/, '');
                cpJsonBrowserAllFiles.push({
                    name: item.name,
                    path: item.path,
                    relativePath: relativePath
                });
            }
        }
    } catch (e) {
        console.error('JSON cache error:', e);
    }
}

function cpJsonBrowserFilter() {
    const input = document.getElementById('cpJsonBrowserSearchInput');
    const clearBtn = document.getElementById('cpJsonBrowserSearchClear');
    const query = (input?.value || '').trim();

    clearBtn.style.display = query ? 'block' : 'none';

    if (cpJsonBrowserSearchTimeout) clearTimeout(cpJsonBrowserSearchTimeout);

    if (!query) {
        cpJsonBrowserClearSearch();
        return;
    }

    cpJsonBrowserSearchTimeout = setTimeout(() => {
        _cpPerformSearch(query);
    }, 300);
}

function _cpPerformSearch(query) {
    const normalizedQuery = query.toLowerCase();
    // フォルダ名で検索（子階層すべてを含む）
    const folderResults = cpJsonBrowserAllFolders.filter(folder =>
        folder.name.toLowerCase().includes(normalizedQuery)
    );
    _cpDisplaySearchResults(folderResults, query);
}

function _cpDisplaySearchResults(results, query) {
    const searchResultsEl = document.getElementById('cpJsonBrowserSearchResults');
    const listEl = document.getElementById('cpJsonBrowserList');
    const navRow = document.querySelector('.cp-json-browser-nav-row');
    if (!searchResultsEl) return;

    listEl.style.display = 'none';
    if (navRow) navRow.style.display = 'none';
    searchResultsEl.style.display = 'block';
    searchResultsEl.innerHTML = '';

    if (results.length === 0) {
        searchResultsEl.innerHTML = '<div class="cp-json-browser-empty">検索結果がありません</div>';
        return;
    }

    const countEl = document.createElement('div');
    countEl.className = 'cp-json-browser-search-count';
    countEl.textContent = results.length + '件見つかりました';
    searchResultsEl.appendChild(countEl);

    results.forEach(folder => {
        const div = document.createElement('div');
        div.className = 'cp-json-browser-item cp-json-browser-folder cp-json-browser-search-result';

        const icon = document.createElement('span');
        icon.className = 'cp-json-browser-icon';
        icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
        div.appendChild(icon);

        const nameEl = document.createElement('span');
        nameEl.className = 'cp-json-browser-name';
        nameEl.innerHTML = _cpHighlightMatch(folder.name, query);
        div.appendChild(nameEl);

        const pathEl = document.createElement('div');
        pathEl.className = 'cp-json-browser-search-path';
        pathEl.innerHTML = _cpHighlightMatch(folder.relativePath, query);
        div.appendChild(pathEl);

        div.addEventListener('click', () => {
            // 検索をクリアしてフォルダに移動
            const searchInput = document.getElementById('cpJsonBrowserSearchInput');
            if (searchInput) searchInput.value = '';
            cpJsonBrowserClearSearch();
            cpJsonBrowserLoadFolder(folder.path);
        });
        searchResultsEl.appendChild(div);
    });
}

function _cpHighlightMatch(text, query) {
    if (!query) return _escHtml(text);
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const idx = lowerText.indexOf(lowerQuery);
    if (idx === -1) return _escHtml(text);
    return _escHtml(text.substring(0, idx))
        + '<mark class="cp-json-browser-highlight">' + _escHtml(text.substring(idx, idx + query.length)) + '</mark>'
        + _escHtml(text.substring(idx + query.length));
}

function cpJsonBrowserClearSearch() {
    const searchResultsEl = document.getElementById('cpJsonBrowserSearchResults');
    const listEl = document.getElementById('cpJsonBrowserList');
    const navRow = document.querySelector('.cp-json-browser-nav-row');
    const clearBtn = document.getElementById('cpJsonBrowserSearchClear');

    if (searchResultsEl) { searchResultsEl.style.display = 'none'; searchResultsEl.innerHTML = ''; }
    if (listEl) listEl.style.display = '';
    if (navRow) navRow.style.display = '';
    if (clearBtn) clearBtn.style.display = 'none';
}

// 互換用（HTMLから参照）
function cpJsonBrowserGoUp() {
    if (!cpJsonBrowserCurrentPath || !cpJsonBrowserBasePath) return;
    const normalizedBase = cpJsonBrowserBasePath.replace(/\\/g, '/');
    const normalizedCurrent = cpJsonBrowserCurrentPath.replace(/\\/g, '/');
    if (normalizedCurrent === normalizedBase) return;
    const parts = cpJsonBrowserCurrentPath.replace(/\//g, '\\').split('\\').filter(Boolean);
    parts.pop();
    let parent = parts.join('\\');
    if (parts.length === 1 && parts[0].endsWith(':')) parent += '\\';
    if (parent.length < cpJsonBrowserBasePath.length) return;
    cpJsonBrowserLoadFolder(parent);
}

function cpJsonBrowserRefresh() {
    if (cpJsonBrowserCurrentPath) cpJsonBrowserLoadFolder(cpJsonBrowserCurrentPath);
}

// 旧API互換（export用）
function cpJsonBrowserNavigate(dirPath) { cpJsonBrowserLoadFolder(dirPath); }
function cpJsonBrowserSelect() {} // no-op
function cpJsonBrowserOpen() {} // no-op

function _escHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ===== COMIC-Bridge形式のJSON変換 =====
function _convertBridgeItems(items) {
    return items.map(item => {
        const pageText = item.page || '';
        const vp = window.extractVolumeAndPage ? window.extractVolumeAndPage(pageText) : { volumeNum: 0, pageNum: 0 };
        return {
            category: item.category || '',
            page: pageText,
            volumeNum: vp.volumeNum,
            pageNum: vp.pageNum,
            excerpt: item.excerpt || '',
            content: item.content || '',
        };
    });
}

// ===== 校正結果JSON読み込み =====
function cpLoadResultJson() {
    cpOpenJsonBrowser();
}

async function _loadJsonFromPath(filePath) {
    try {
        const result = await window.electronAPI.readJsonFile(filePath);
        if (!result.success) {
            cpShowNotify('ファイルの読み込みに失敗しました', 'error');
            return;
        }
        const json = result.data;

        // フォーマット判定
        if (json.checks && (json.checks.variation || json.checks.simple)) {
            // COMIC-Bridge 写植確認形式: checkKindで正誤/提案を振り分け
            const allItems = [];
            if (json.checks.variation && json.checks.variation.items) allItems.push(...json.checks.variation.items);
            if (json.checks.simple && json.checks.simple.items) allItems.push(...json.checks.simple.items);
            const correctnessItems = _convertBridgeItems(allItems.filter(i => i.checkKind === 'correctness'));
            const proposalItems = _convertBridgeItems(allItems.filter(i => i.checkKind === 'proposal'));
            if (proposalItems.length > 0) {
                state.currentVariationData = window.groupByCategory ? window.groupByCategory(proposalItems) : {};
            }
            if (correctnessItems.length > 0) {
                state.currentSimpleData = correctnessItems;
            }
        } else if (json.type === 'progen-result') {
            if (json.variationData) state.currentVariationData = json.variationData;
            if (json.simpleData) state.currentSimpleData = json.simpleData;
        } else if (Array.isArray(json)) {
            state.currentSimpleData = json;
        } else if (json.variationData || json.simpleData) {
            if (json.variationData) state.currentVariationData = json.variationData;
            if (json.simpleData) state.currentSimpleData = json.simpleData;
        } else {
            cpShowNotify('不明なJSONフォーマットです', 'error');
            return;
        }

        // データがあるタブに自動切替
        const hasVariation = Object.keys(state.currentVariationData).length > 0;
        const hasSimple = state.currentSimpleData.length > 0;
        if (hasSimple) {
            cpPanelCurrentTab = 'simple';
        } else if (hasVariation) {
            cpPanelCurrentTab = 'variation';
        }

        // パネルを表示して更新
        cpShowResultPanel();

        const fileName = filePath.split(/[/\\]/).pop();
        cpShowNotify(fileName + ' を読み込みました', 'success');
    } catch (e) {
        cpShowNotify('JSONの解析に失敗しました: ' + e.message, 'error');
    }
}

// ===== 校正結果JSON保存 =====
async function cpSaveResultJson() {
    const data = {
        type: 'progen-result',
        variationData: state.currentVariationData,
        simpleData: state.currentSimpleData,
    };
    const jsonStr = JSON.stringify(data, null, 2);
    const result = await window.electronAPI.showSaveJsonDialog('校正結果.json');
    if (!result.success) return;
    const writeResult = await window.electronAPI.writeTextFile(result.filePath, jsonStr);
    if (writeResult.success) {
        cpShowNotify('保存しました', 'success');
    } else {
        cpShowNotify('保存に失敗しました', 'error');
    }
}

function cpSetupResizeHandle() {
    if (!cpResizeHandle) return;

    cpResizeHandle.addEventListener('mousedown', function(e) {
        e.preventDefault();
        cpIsResizing = true;
        cpResizeHandle.classList.add('cp-resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const mainArea = document.getElementById('cpMainArea');
        const mainRect = mainArea.getBoundingClientRect();

        function onMouseMove(e) {
            if (!cpIsResizing) return;
            const newWidth = e.clientX - mainRect.left;
            const percent = (newWidth / mainRect.width) * 100;
            const clamped = Math.max(20, Math.min(70, percent));
            cpPanelWidthPercent = clamped;
            cpResultPanelEl.style.width = clamped + '%';
        }

        function onMouseUp() {
            cpIsResizing = false;
            cpResizeHandle.classList.remove('cp-resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

// ===== ページジャンプ＆ハイライト =====
let cpJumpHighlightTimer = null;

// textareaの指定文字位置に正確にスクロールする
// 方式: 同サイズの隠しtextareaで位置を測定
function scrollTextareaToPosition(textarea, charPos) {
    const ghost = document.createElement('textarea');
    const cs = getComputedStyle(textarea);
    // 元のtextareaと同じレイアウトを再現
    ghost.style.cssText = `
        position:fixed; left:-9999px; top:0;
        width:${textarea.clientWidth}px;
        height:${textarea.clientHeight}px;
        font:${cs.font};
        line-height:${cs.lineHeight};
        letter-spacing:${cs.letterSpacing};
        word-wrap:${cs.wordWrap};
        white-space:${cs.whiteSpace};
        padding:${cs.padding};
        border:${cs.border};
        box-sizing:border-box;
        overflow:auto;
    `;
    ghost.value = textarea.value;
    document.body.appendChild(ghost);

    // ゴーストにカーソルを置いてブラウザにスクロールさせる
    ghost.setSelectionRange(charPos, charPos);
    ghost.focus();
    const scrollPos = ghost.scrollTop;

    document.body.removeChild(ghost);

    // 元のtextareaに適用（該当位置が最上部に来るようにする）
    textarea.scrollTop = scrollPos;
}

function cpJumpToExcerpt(pageText, excerptText) {
    // CP画面でテキストが読み込まれていなければ何もしない
    if (!cpText) return;

    const { pageNum } = extractVolumeAndPage(pageText);
    if (!pageNum || pageNum < 1) return;

    // excerptから括弧等を除去して検索用テキストを作成
    const searchText = excerptText.replace(/[「」『』]/g, '').replace(/\s+/g, '').trim();
    if (!searchText) return;

    if (cpIsEditing) {
        // ===== 編集モード（textarea） =====
        cpJumpInTextarea(pageNum, searchText);
    } else {
        // ===== セレクトモード（チャンク表示） =====
        cpJumpInSelectMode(pageNum, searchText);
    }
}

function cpJumpInTextarea(pageNum, searchText) {
    const text = cpEditTextArea.value;
    const lines = text.split('\n');
    let currentPage = 1;
    let pageStartChar = 0;
    let pageEndChar = text.length;
    let charPos = 0;

    // ページ区切りをカウントして対象ページの文字範囲を特定
    // [XX巻] → スキップ（巻マーカー）, <<XPage>> → ページXに設定, ---------- → +1
    for (let i = 0; i < lines.length; i++) {
        const trimmedLine = lines[i].trim();
        const isVolumeMarker = /^\[\d+巻\]$/.test(trimmedLine);
        const exportPageMatch = trimmedLine.match(/^<<(\d+)Page>>$/);
        const isDash = /^-{10}$/.test(trimmedLine);

        if (isVolumeMarker) {
            // 巻マーカーはスキップ（ページ番号に影響しない）
            pageStartChar = charPos + lines[i].length + 1;
            charPos += lines[i].length + 1;
            continue;
        }

        if (exportPageMatch || isDash) {
            let nextPage;
            if (exportPageMatch) {
                nextPage = parseInt(exportPageMatch[1], 10);
            } else {
                nextPage = currentPage + 1;
            }

            if (nextPage !== currentPage) {
                // 実際にページが変わる場合のみ終了判定
                if (currentPage === pageNum) {
                    pageEndChar = charPos;
                    break;
                }
                currentPage = nextPage;
            }
            // セパレータ行自体はスキップ
            pageStartChar = charPos + lines[i].length + 1;
        }
        charPos += lines[i].length + 1;
    }

    if (currentPage < pageNum) return; // ページが見つからない

    // ページ範囲内でexcerptを検索（空白・記号を除去して柔軟マッチ）
    const pageContent = text.substring(pageStartChar, pageEndChar);
    const normalizedPage = pageContent.replace(/\s+/g, '');
    const normalizedSearch = searchText.replace(/\s+/g, '');

    let matchStart = -1;
    let matchLen = 0;

    // 正規化された文字列でマッチ位置を探し、元テキスト上の位置に変換
    const normalIdx = normalizedPage.indexOf(normalizedSearch);
    if (normalIdx >= 0) {
        // 正規化インデックスを元テキストインデックスに変換
        let normCount = 0;
        let origIdx = 0;
        while (normCount < normalIdx && origIdx < pageContent.length) {
            if (!/\s/.test(pageContent[origIdx])) normCount++;
            origIdx++;
        }
        matchStart = pageStartChar + origIdx;

        // マッチ終了位置を探す
        let matchNormCount = 0;
        let matchOrigEnd = origIdx;
        while (matchNormCount < normalizedSearch.length && matchOrigEnd < pageContent.length) {
            if (!/\s/.test(pageContent[matchOrigEnd])) matchNormCount++;
            matchOrigEnd++;
        }
        matchLen = matchOrigEnd - origIdx;
    }

    const targetPos = matchStart >= 0 ? matchStart : pageStartChar;
    const targetEnd = matchStart >= 0 ? matchStart + matchLen : pageStartChar;

    // focus → 次フレームで setSelectionRange + scroll（focus()の自動スクロールが完了してから手動スクロールを適用）
    cpEditTextArea.focus();
    requestAnimationFrame(() => {
        cpEditTextArea.setSelectionRange(targetPos, targetEnd);
        scrollTextareaToPosition(cpEditTextArea, targetPos);
    });

    // 3秒後に選択解除
    clearTimeout(cpJumpHighlightTimer);
    cpJumpHighlightTimer = setTimeout(() => {
        const pos = cpEditTextArea.selectionEnd;
        cpEditTextArea.setSelectionRange(pos, pos);
    }, 3000);
}

function cpJumpInSelectMode(pageNum, searchText) {
    // チャンクからページを特定
    // [XX巻] → スキップ（巻マーカー）, <<XPage>> → ページXに設定, ---------- → +1
    let currentPage = 1;
    let targetChunkIndex = -1;

    for (let i = 0; i < cpChunks.length; i++) {
        const chunk = cpChunks[i];
        if (chunk.type === 'separator') {
            const isVolumeMarker = /^\[\d+巻\]$/.test(chunk.content);
            const exportPageMatch = chunk.content.match(/^<<(\d+)Page>>$/);

            if (isVolumeMarker) {
                // 巻マーカーはスキップ
            } else if (exportPageMatch) {
                currentPage = parseInt(exportPageMatch[1], 10);
            } else {
                currentPage++;
            }
            continue;
        }
        if (currentPage === pageNum) {
            // このページ内でexcerptを含むチャンクを探す
            const normalizedContent = chunk.content.replace(/\s+/g, '');
            const normalizedSearch = searchText.replace(/\s+/g, '');
            if (normalizedContent.includes(normalizedSearch)) {
                targetChunkIndex = i;
                break;
            }
            // 最初に見つかったこのページのチャンクを候補にしておく
            if (targetChunkIndex < 0) targetChunkIndex = i;
        } else if (currentPage > pageNum) {
            break;
        }
    }

    if (targetChunkIndex < 0) return;

    // 該当チャンク要素を探してスクロール＆ハイライト
    const el = cpSelectModeEl.querySelector(`[data-index="${targetChunkIndex}"]`);
    if (!el) return;

    // ページセパレータが直前にあればそこにスクロール（ページ表記を上部に表示）
    const scrollTarget = el.previousElementSibling && el.previousElementSibling.classList.contains('cp-chunk-separator')
        ? el.previousElementSibling : el;
    scrollTarget.scrollIntoView({ behavior: 'instant', block: 'start' });

    // 前回のハイライトをクリア
    clearTimeout(cpJumpHighlightTimer);
    const prevHighlight = cpSelectModeEl.querySelector('.cp-chunk-highlight');
    if (prevHighlight) prevHighlight.classList.remove('cp-chunk-highlight');

    el.classList.add('cp-chunk-highlight');
    cpJumpHighlightTimer = setTimeout(() => {
        el.classList.remove('cp-chunk-highlight');
    }, 3000);
}

// ===== 通知 =====
let cpNotifyTimer = null;
function cpShowNotify(message, type) {
    clearTimeout(cpNotifyTimer);
    const colors = {
        success: 'var(--sage)',
        error: 'var(--warm-red)',
        warning: '#d97706',
    };
    cpNotificationInner.style.background = colors[type] || type || 'var(--sage)';
    cpNotificationInner.textContent = message;
    cpNotificationEl.classList.add('show');
    cpNotifyTimer = setTimeout(() => cpNotificationEl.classList.remove('show'), 2500);
}

// ===== パース =====
function cpParseTextToChunks(inputText) {
    if (!inputText) return [];

    const lines = inputText.split('\n');
    const parsed = [];
    let currentChunk = [];

    const volumeMarkerPattern = /^\[\d+巻\]$/;
    const exportPagePattern = /^<<\d+Page>>$/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed.match(/^\[COMIC-POT(:\w+)?\]$/)) {
            continue;
        }

        if (volumeMarkerPattern.test(trimmed) || exportPagePattern.test(trimmed)) {
            if (currentChunk.length > 0) {
                parsed.push({ content: currentChunk.join('\n'), type: 'dialogue' });
                currentChunk = [];
            }
            parsed.push({ content: trimmed, type: 'separator' });
        }
        else if (/^-{10}$/.test(trimmed)) {
            if (currentChunk.length > 0) {
                parsed.push({ content: currentChunk.join('\n'), type: 'dialogue' });
                currentChunk = [];
            }
            parsed.push({ content: '----------', type: 'separator' });
        }
        else if (trimmed === '') {
            if (currentChunk.length > 0) {
                parsed.push({ content: currentChunk.join('\n'), type: 'dialogue' });
                currentChunk = [];
            }
        }
        else {
            currentChunk.push(line);
        }
    }

    if (currentChunk.length > 0) {
        parsed.push({ content: currentChunk.join('\n'), type: 'dialogue' });
    }

    return parsed;
}

function cpExtractComicPotHeader(content) {
    const lines = content.split('\n');
    for (const line of lines) {
        const match = line.trim().match(/^\[COMIC-POT(:\w+)?\]$/);
        if (match) return line.trim();
    }
    return '';
}

function cpReconstructText(chunkList) {
    let result = '';
    if (cpComicPotHeader) {
        result = cpComicPotHeader + '\n\n';
    }
    for (let i = 0; i < chunkList.length; i++) {
        result += chunkList[i].content;
        if (i < chunkList.length - 1) {
            const curr = chunkList[i];
            const next = chunkList[i + 1];
            if (curr.type === 'separator' || next.type === 'separator') {
                result += '\n';
            } else {
                result += '\n\n';
            }
        }
    }
    return result;
}

// ===== 表示更新 =====
function cpRender() {
    if (!cpEditTextArea) return;

    const hasText = cpText && cpText.trim() !== '';
    cpBtnCopy.disabled = !hasText;

    cpCopyBtnFloat.style.display = hasText ? 'flex' : 'none';

    // コンテキストバー更新
    cpContextBar.style.display = hasText ? 'flex' : 'none';
    const segSelect = document.getElementById('cpModeSegSelect');
    const segEdit = document.getElementById('cpModeSegEdit');
    if (cpIsEditing) {
        cpContextBar.classList.add('editing');
        if (segSelect) segSelect.classList.remove('active');
        if (segEdit) segEdit.classList.add('active');
        cpBtnDeleteMark.style.display = 'none';
        cpBtnRuby.style.display = 'inline-block';
    } else {
        cpContextBar.classList.remove('editing');
        if (segSelect) segSelect.classList.add('active');
        if (segEdit) segEdit.classList.remove('active');
        cpBtnDeleteMark.style.display = 'inline-block';
        cpBtnRuby.style.display = 'none';
    }

    cpUpdateToolbarState();

    if (cpIsEditing) {
        cpEditTextArea.style.display = 'block';
        cpSelectModeEl.style.display = 'none';
        cpEditTextArea.value = cpText;
    } else {
        cpEditTextArea.style.display = 'none';
        cpSelectModeEl.style.display = '';
        cpRenderSelectMode();
    }

    cpFileNameDisplay.textContent = cpFileName;
    cpUpdateStatusBar();
}

function cpUpdateToolbarState() {
    const hasText = cpText && cpText.trim() !== '';
    const hasDialogueSelected = !cpIsEditing && cpSelectedChunkIndex !== null
        && cpChunks[cpSelectedChunkIndex] && cpChunks[cpSelectedChunkIndex].type === 'dialogue';
    cpBtnDeleteMark.disabled = !hasDialogueSelected;
    cpBtnRuby.disabled = !cpIsEditing;
    cpBtnConvert.disabled = !hasText;
    cpBtnSave.disabled = !hasText;
    cpBtnSaveAs.disabled = !hasText;
}

function cpRenderSelectMode() {
    cpSelectModeEl.innerHTML = '';

    if (!cpText || cpChunks.length === 0) {
        const dz = document.createElement('div');
        dz.className = 'cp-viewer-dropzone';
        dz.innerHTML = '<div class="cp-viewer-dropzone-inner">'
            + '<div class="cp-viewer-dropzone-icon">'
            + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'
            + '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>'
            + '<polyline points="14 2 14 8 20 8"/>'
            + '<line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'
            + '</svg></div>'
            + '<p class="cp-viewer-dropzone-title">テキストファイルをドロップ</p>'
            + '<p class="cp-viewer-dropzone-sub">TXTファイルをドラッグ＆ドロップ</p>'
            + '<div class="cp-panel-dropzone-actions">'
            + '<button class="cp-viewer-dropzone-btn" onclick="cpHandleFileOpen()">'
            + '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>'
            + ' ファイルを開く</button>'
            + '<button class="cp-viewer-dropzone-btn" onclick="cpToggleEditMode()">'
            + '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>'
            + ' 編集モードで入力</button>'
            + '</div></div>';
        cpSelectModeEl.appendChild(dz);
        return;
    }

    const pre = document.createElement('pre');
    pre.style.cssText = 'white-space:pre-wrap;font-size:13px;margin:0;';

    cpChunks.forEach((chunk, index) => {
        if (index > 0) {
            const prev = cpChunks[index - 1];
            pre.appendChild(document.createTextNode(
                (prev.type === 'separator' || chunk.type === 'separator') ? '\n' : '\n\n'
            ));
        }

        // ドロップインジケーター（上）
        if (cpDragOverIndex === index && cpDraggedChunkIndex !== null && cpDropPosition === 'before') {
            const ind = document.createElement('div');
            ind.className = 'cp-drop-indicator';
            pre.appendChild(ind);
        }

        const span = document.createElement('span');
        span.className = 'cp-chunk';
        span.dataset.index = index;

        if (chunk.type === 'separator') {
            span.classList.add('cp-chunk-separator');
        } else {
            span.classList.add('cp-chunk-dialogue');
            if (chunk.content.trim().startsWith('//')) span.classList.add('cp-chunk-delete');
            if (cpSelectedChunkIndex === index) span.classList.add('cp-chunk-selected');
            if (cpDraggedChunkIndex === index) span.classList.add('cp-chunk-dragging');
            span.draggable = true;
            span.title = 'ドラッグして移動、クリックで選択';
            span.addEventListener('click', () => cpHandleChunkClick(index));
            span.addEventListener('dragstart', (e) => cpHandleDragStart(e, index));
            span.addEventListener('dragend', cpHandleDragEnd);
        }

        span.addEventListener('dragover', (e) => cpHandleDragOverChunk(e, index));
        span.addEventListener('dragleave', cpHandleDragLeaveChunk);
        span.addEventListener('drop', (e) => cpHandleDropChunk(e, index));

        cpRenderChunkContent(span, chunk);
        pre.appendChild(span);

        // ドロップインジケーター（下）
        if (cpDragOverIndex === index && cpDraggedChunkIndex !== null && cpDropPosition === 'after') {
            const ind = document.createElement('div');
            ind.className = 'cp-drop-indicator';
            pre.appendChild(ind);
        }
    });

    // 末尾ドロップエリア
    if (cpDraggedChunkIndex !== null && cpChunks.length > 0) {
        const dropArea = document.createElement('div');
        dropArea.style.cssText = 'height:48px;width:100%;';
        dropArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            cpDragOverIndex = cpChunks.length;
            cpDropPosition = 'after';
            cpRenderSelectMode();
        });
        dropArea.addEventListener('dragleave', () => {
            cpDragOverIndex = null;
            cpDropPosition = 'before';
            cpRenderSelectMode();
        });
        dropArea.addEventListener('drop', (e) => cpHandleDropChunk(e, cpChunks.length - 1));
        if (cpDragOverIndex === cpChunks.length) {
            const ind = document.createElement('div');
            ind.className = 'cp-drop-indicator';
            ind.style.width = '100%';
            dropArea.appendChild(ind);
        }
        pre.appendChild(dropArea);
    }

    cpSelectModeEl.appendChild(pre);

    cpUpdateToolbarState();
    cpScrollToSelected();
}

// ルビパターンをハイライト表示するためのレンダリング
function cpRenderChunkContent(span, chunk) {
    if (chunk.type === 'separator') {
        span.textContent = chunk.content;
        return;
    }

    const rubyPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
    const content = chunk.content;
    let lastIndex = 0;
    let match;

    while ((match = rubyPattern.exec(content)) !== null) {
        if (match.index > lastIndex) {
            span.appendChild(document.createTextNode(content.substring(lastIndex, match.index)));
        }
        const parentSpan = document.createElement('span');
        parentSpan.className = 'cp-ruby-highlight';
        parentSpan.textContent = match[1];
        span.appendChild(parentSpan);

        const rubySpan = document.createElement('span');
        rubySpan.className = 'cp-ruby-annotation';
        rubySpan.textContent = '(' + match[2] + ')';
        span.appendChild(rubySpan);

        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
        span.appendChild(document.createTextNode(content.substring(lastIndex)));
    }
    if (lastIndex === 0 && content.length === 0) {
        span.textContent = '';
    }
}

function cpScrollToSelected() {
    if (cpSelectedChunkIndex === null) return;
    const el = cpSelectModeEl.querySelector(`[data-index="${cpSelectedChunkIndex}"]`);
    if (!el) return;
    const elTop = el.offsetTop;
    const elBottom = elTop + el.offsetHeight;
    const scrollTop = cpSelectModeEl.scrollTop;
    const viewHeight = cpSelectModeEl.clientHeight;
    if (elTop < scrollTop) cpSelectModeEl.scrollTop = elTop - 20;
    else if (elBottom > scrollTop + viewHeight) cpSelectModeEl.scrollTop = elBottom - viewHeight + 20;
}

function cpUpdateStatusBar() {
    const dialogueCount = cpChunks.filter(c => c.type === 'dialogue').length;
    let info = '';
    if (cpChunks.length > 0) info = dialogueCount + ' 個のセリフ';
    if (cpSelectedChunkIndex !== null && cpChunks[cpSelectedChunkIndex] && cpChunks[cpSelectedChunkIndex].type === 'dialogue') {
        let num = 0;
        for (let i = 0; i <= cpSelectedChunkIndex; i++) {
            if (cpChunks[i].type === 'dialogue') num++;
        }
        info += ' | 選択中: #' + num;
    }
    if (cpIsEditing) {
        info += ' | 編集モード (Shift: 選択モードに切替)';
    } else {
        info += ' | 選択モード (Shift: 編集モードに切替, ↑↓: 選択, Shift+↑↓: 移動, Del: //切替)';
    }
    cpStatusInfo.textContent = info;
}

// ===== ファイル読み込み =====
function cpHandleFileOpen() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file && (file.type === 'text/plain' || file.name.endsWith('.txt'))) {
            cpFileName = file.name;
            // Electron環境ではFile.pathでフルパスが取得可能
            cpFilePath = file.path || '';
            const reader = new FileReader();
            reader.onload = (ev) => {
                let content = ev.target.result;
                content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                if (content.charCodeAt(0) === 0xFEFF) content = content.substring(1);
                cpComicPotHeader = cpExtractComicPotHeader(content);
                cpText = content;
                cpSavedText = cpText;
                cpChunks = cpParseTextToChunks(content);
                cpSelectedChunkIndex = null;
                cpIsEditing = false;
                cpRender();
            };
            reader.readAsText(file, 'UTF-8');
        }
    };
    input.click();
}

// ===== ファイル保存（上書き） =====
async function cpHandleFileSave() {
    if (!cpText || cpText.trim() === '') return;

    // 編集モード中ならテキストエリアの内容を反映
    if (cpIsEditing) {
        let content = cpEditTextArea.value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        cpComicPotHeader = cpExtractComicPotHeader(content);
        cpText = content;
        cpChunks = cpParseTextToChunks(content);
    }

    if (cpFilePath) {
        // 既存パスに上書き保存
        const result = await window.electronAPI.writeTextFile(cpFilePath, cpText);
        if (result.success) {
            cpSavedText = cpText;
            cpShowNotify('保存しました: ' + cpFileName, 'var(--sage)');
        } else {
            cpShowNotify('保存に失敗しました', '#ef4444');
        }
    } else {
        // パスが未設定の場合は「名前を付けて保存」
        await cpHandleFileSaveAs();
    }
}

// ===== ファイル保存（名前を付けて保存） =====
async function cpHandleFileSaveAs() {
    if (!cpText || cpText.trim() === '') return;

    // 編集モード中ならテキストエリアの内容を反映
    if (cpIsEditing) {
        let content = cpEditTextArea.value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        cpComicPotHeader = cpExtractComicPotHeader(content);
        cpText = content;
        cpChunks = cpParseTextToChunks(content);
    }

    const dialogResult = await window.electronAPI.showSaveTextDialog(cpFileName);
    if (!dialogResult.success) return; // キャンセル

    const saveResult = await window.electronAPI.writeTextFile(dialogResult.filePath, cpText);
    if (saveResult.success) {
        cpFilePath = dialogResult.filePath;
        cpSavedText = cpText;
        // ファイル名を更新
        const parts = dialogResult.filePath.replace(/\\/g, '/').split('/');
        cpFileName = parts[parts.length - 1];
        cpFileNameDisplay.textContent = cpFileName;
        cpShowNotify('保存しました: ' + cpFileName, 'var(--sage)');
    } else {
        cpShowNotify('保存に失敗しました', '#ef4444');
    }
}

// ===== コピー =====
function cpHandleCopy() {
    if (!cpText || cpText.trim() === '') return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(cpText).then(() => {
            cpShowNotify('コピーしました！', 'var(--sage)');
        }).catch(() => cpFallbackCopy());
    } else {
        cpFallbackCopy();
    }
}

function cpFallbackCopy() {
    const ta = document.createElement('textarea');
    ta.value = cpText;
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); cpShowNotify('コピーしました！', 'var(--sage)'); }
    catch (e) { showToast('コピーに失敗しました。', 'error'); }
    document.body.removeChild(ta);
}

// ===== // 削除マーク切替 =====
function cpToggleDeleteMark() {
    if (cpSelectedChunkIndex === null || !cpChunks[cpSelectedChunkIndex]) return;
    if (cpChunks[cpSelectedChunkIndex].type !== 'dialogue') return;

    const chunk = cpChunks[cpSelectedChunkIndex];
    const lines = chunk.content.split('\n');
    const allMarked = lines.every(l => l.trimStart().startsWith('//'));

    if (allMarked) {
        for (let i = 0; i < lines.length; i++) {
            lines[i] = lines[i].replace(/^(\s*)\/\/\s?/, '$1');
        }
        cpShowNotify('削除マークを解除しました', '#6366f1');
    } else {
        for (let i = 0; i < lines.length; i++) {
            if (!lines[i].trimStart().startsWith('//')) {
                lines[i] = '//' + lines[i];
            }
        }
        cpShowNotify('削除マークを付与しました', '#ef4444');
    }

    cpChunks[cpSelectedChunkIndex].content = lines.join('\n');
    cpText = cpReconstructText(cpChunks);
    cpChunks = cpParseTextToChunks(cpText);
    cpRenderSelectMode();
}

// ===== ルビ付け =====
function cpFormatRuby(parent, ruby) {
    if (cpRubyMode === 'standard') {
        return parent + '（' + ruby + '）';
    }
    return '[' + parent + '](' + ruby + ')';
}

function cpFormatRubyPlaceholder(parent) {
    if (cpRubyMode === 'standard') {
        return parent + '（...）';
    }
    return '[' + parent + '](...)';
}

function cpSwitchRubyMode(mode) {
    cpRubyMode = mode;
    localStorage.setItem('cpRubyMode', mode);

    // ボタンのactive状態を更新
    document.querySelectorAll('.cp-ruby-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.rubyMode === mode);
    });

    // プレビューを再描画
    cpUpdateRubyPreview();
}

function cpUpdateRubyPreview() {
    const ruby = document.getElementById('cpRubyInput').value;
    const preview = document.getElementById('cpRubyResultPreview');
    if (ruby) {
        preview.textContent = cpFormatRuby(cpRubySelectedText, ruby);
    } else {
        preview.textContent = cpFormatRubyPlaceholder(cpRubySelectedText);
    }
}

function cpOpenRubyModal() {
    if (!cpIsEditing) {
        cpShowNotify('編集モードで文字を選択してください', '#f59e0b');
        return;
    }

    const start = cpEditTextArea.selectionStart;
    const end = cpEditTextArea.selectionEnd;
    const selected = cpEditTextArea.value.substring(start, end);

    if (!selected || selected.trim() === '' || selected.includes('\n')) {
        cpShowNotify('ルビを付ける文字を選択してください（1行以内）', '#f59e0b');
        return;
    }

    cpRubySelectionStart = start;
    cpRubySelectionEnd = end;
    cpRubySelectedText = selected;

    document.getElementById('cpRubyParentPreview').textContent = selected;
    document.getElementById('cpRubyInput').value = '';
    document.getElementById('cpRubyResultPreview').textContent = cpFormatRubyPlaceholder(selected);

    // モードボタンの状態を復元
    document.querySelectorAll('.cp-ruby-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.rubyMode === cpRubyMode);
    });

    document.getElementById('cpRubyModal').classList.add('show');
    setTimeout(() => document.getElementById('cpRubyInput').focus(), 50);
}

function cpCloseRubyModal() {
    document.getElementById('cpRubyModal').classList.remove('show');
    if (cpIsEditing) cpEditTextArea.focus();
}

function cpApplyRuby() {
    const rubyText = document.getElementById('cpRubyInput').value.trim();
    if (!rubyText) {
        cpShowNotify('ルビを入力してください', '#f59e0b');
        return;
    }

    const replacement = cpFormatRuby(cpRubySelectedText, rubyText);
    const scrollTop = cpEditTextArea.scrollTop;

    // Undo対応: execCommand('insertText') でブラウザのundoスタックに載せる
    cpEditTextArea.focus();
    cpEditTextArea.setSelectionRange(cpRubySelectionStart, cpRubySelectionEnd);
    document.execCommand('insertText', false, replacement);

    let content = cpEditTextArea.value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    cpComicPotHeader = cpExtractComicPotHeader(content);
    cpText = content;
    cpChunks = cpParseTextToChunks(content);

    cpCloseRubyModal();

    const newCursorPos = cpRubySelectionStart + replacement.length;
    cpEditTextArea.setSelectionRange(newCursorPos, newCursorPos);
    cpEditTextArea.focus();
    cpEditTextArea.scrollTop = scrollTop;

    cpShowNotify('ルビを適用しました', '#7c3aed');
    cpUpdateStatusBar();
}

// ===== 形式変換 =====
function cpOpenConvertModal() {
    if (!cpText || cpText.trim() === '') return;

    const hasSeparators = cpChunks.some(c => c.type === 'separator');

    if (!hasSeparators && cpChunks.filter(c => c.type === 'dialogue').length <= 1) {
        cpShowNotify('変換対象のテキストがありません', '#f59e0b');
        return;
    }

    if (cpComicPotHeader) {
        const match = cpComicPotHeader.match(/\[COMIC-POT:(\w+)\]/);
        if (match) {
            document.getElementById('cpConvertSortMode').value = match[1];
        }
    }

    cpUpdateConvertPreview();
    document.getElementById('cpConvertModal').classList.add('show');
}

function cpCloseConvertModal() {
    document.getElementById('cpConvertModal').classList.remove('show');
}

function cpUpdateConvertPreview() {
    const sortMode = document.getElementById('cpConvertSortMode').value;
    const volume = parseInt(document.getElementById('cpConvertVolume').value) || 1;
    const startPage = parseInt(document.getElementById('cpConvertStartPage').value) || 1;

    const header = '[COMIC-POT:' + sortMode + ']';
    const volStr = String(volume).padStart(2, '0');
    let preview = header + '\n[' + volStr + '巻]\n';
    let pageNum = startPage;
    let isFirst = true;

    for (const chunk of cpChunks) {
        if (chunk.type === 'separator') {
            if (!isFirst) {
                pageNum++;
            }
            preview += '<<' + pageNum + 'Page>>\n';
            isFirst = false;
        } else {
            if (isFirst) {
                preview += '<<' + pageNum + 'Page>>\n';
                isFirst = false;
            }
            preview += chunk.content + '\n\n';
        }
    }

    document.getElementById('cpConvertPreview').textContent = preview.trimEnd();
}

function cpApplyConvert() {
    const sortMode = document.getElementById('cpConvertSortMode').value;
    const volume = parseInt(document.getElementById('cpConvertVolume').value) || 1;
    const startPage = parseInt(document.getElementById('cpConvertStartPage').value) || 1;

    cpComicPotHeader = '[COMIC-POT:' + sortMode + ']';

    const volStr = String(volume).padStart(2, '0');
    const newChunks = [];
    let pageNum = startPage;
    let isFirst = true;

    // 先頭に巻番号マーカーを挿入
    newChunks.push({
        content: '[' + volStr + '巻]',
        type: 'separator'
    });

    for (const chunk of cpChunks) {
        if (chunk.type === 'separator') {
            if (!isFirst) {
                pageNum++;
            }
            newChunks.push({
                content: '<<' + pageNum + 'Page>>',
                type: 'separator'
            });
            isFirst = false;
        } else {
            if (isFirst) {
                newChunks.push({
                    content: '<<' + pageNum + 'Page>>',
                    type: 'separator'
                });
                isFirst = false;
            }
            newChunks.push(chunk);
        }
    }

    cpText = cpReconstructText(newChunks);
    cpChunks = cpParseTextToChunks(cpText);
    cpSelectedChunkIndex = null;

    cpCloseConvertModal();
    cpRender();
    cpShowNotify('COMIC-POT形式に変換しました', '#6366f1');
}

// ===== チャンク操作 =====
function cpHandleChunkClick(index) {
    if (cpChunks[index] && cpChunks[index].type === 'dialogue') {
        cpSelectedChunkIndex = index;
        cpRenderSelectMode();
    }
}

function cpMoveChunkUp() {
    if (cpSelectedChunkIndex === null || cpSelectedChunkIndex === 0) return;
    const newChunks = [...cpChunks];
    const moving = newChunks.splice(cpSelectedChunkIndex, 1)[0];
    newChunks.splice(cpSelectedChunkIndex - 1, 0, moving);
    cpText = cpReconstructText(newChunks);
    cpChunks = cpParseTextToChunks(cpText);
    cpSelectedChunkIndex = cpSelectedChunkIndex - 1;
    cpRenderSelectMode();
}

function cpMoveChunkDown() {
    if (cpSelectedChunkIndex === null || cpSelectedChunkIndex === cpChunks.length - 1) return;
    const newChunks = [...cpChunks];
    const moving = newChunks.splice(cpSelectedChunkIndex, 1)[0];
    newChunks.splice(cpSelectedChunkIndex + 1, 0, moving);
    cpText = cpReconstructText(newChunks);
    cpChunks = cpParseTextToChunks(cpText);
    cpSelectedChunkIndex = cpSelectedChunkIndex + 1;
    cpRenderSelectMode();
}

function cpSelectPreviousChunk() {
    if (!cpChunks.length) return;
    if (cpSelectedChunkIndex === null) {
        for (let i = cpChunks.length - 1; i >= 0; i--) {
            if (cpChunks[i].type === 'dialogue') { cpSelectedChunkIndex = i; break; }
        }
    } else {
        for (let i = cpSelectedChunkIndex - 1; i >= 0; i--) {
            if (cpChunks[i].type === 'dialogue') { cpSelectedChunkIndex = i; break; return; }
        }
        cpRenderSelectMode(); return;
    }
    cpRenderSelectMode();
}

function cpSelectNextChunk() {
    if (!cpChunks.length) return;
    if (cpSelectedChunkIndex === null) {
        for (let i = 0; i < cpChunks.length; i++) {
            if (cpChunks[i].type === 'dialogue') { cpSelectedChunkIndex = i; break; }
        }
    } else {
        for (let i = cpSelectedChunkIndex + 1; i < cpChunks.length; i++) {
            if (cpChunks[i].type === 'dialogue') { cpSelectedChunkIndex = i; break; return; }
        }
        cpRenderSelectMode(); return;
    }
    cpRenderSelectMode();
}

function cpDeleteSelectedChunk() {
    if (cpSelectedChunkIndex === null || !cpChunks[cpSelectedChunkIndex]) return;
    if (cpChunks[cpSelectedChunkIndex].type === 'separator') return;
    const newChunks = [...cpChunks];
    const deletedIndex = cpSelectedChunkIndex;
    newChunks.splice(deletedIndex, 1);
    cpText = cpReconstructText(newChunks);
    cpChunks = cpParseTextToChunks(cpText);
    if (newChunks.length === 0) {
        cpSelectedChunkIndex = null;
    } else {
        let newSel = null;
        for (let i = deletedIndex - 1; i >= 0; i--) {
            if (cpChunks[i] && cpChunks[i].type === 'dialogue') { newSel = i; break; }
        }
        if (newSel === null) {
            for (let i = Math.min(deletedIndex, cpChunks.length - 1); i < cpChunks.length; i++) {
                if (cpChunks[i] && cpChunks[i].type === 'dialogue') { newSel = i; break; }
            }
        }
        cpSelectedChunkIndex = newSel;
    }
    cpRenderSelectMode();
}

// ===== ドラッグ&ドロップ =====
function cpHandleDragStart(e, index) {
    if (cpChunks[index].type === 'separator') return;
    cpDraggedChunkIndex = index;
    e.dataTransfer.effectAllowed = 'move';
    cpSelectModeEl.classList.add('dragging');
}

function cpHandleDragEnd() {
    cpDraggedChunkIndex = null;
    cpDragOverIndex = null;
    cpDropPosition = 'before';
    cpSelectModeEl.classList.remove('dragging');
    cpRenderSelectMode();
}

function cpHandleDragOverChunk(e, index) {
    e.preventDefault();
    if (cpDraggedChunkIndex === null) return;
    if (cpDraggedChunkIndex === index) {
        if (cpDragOverIndex !== null) { cpDragOverIndex = null; cpDropPosition = 'before'; cpRenderSelectMode(); }
        return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const pos = y < rect.height / 2 ? 'before' : 'after';
    if (cpDragOverIndex !== index || cpDropPosition !== pos) {
        cpDragOverIndex = index;
        cpDropPosition = pos;
        e.dataTransfer.dropEffect = 'move';
        cpRenderSelectMode();
    }
}

function cpHandleDragLeaveChunk() {}

function cpHandleDropChunk(e, dropIdx) {
    e.preventDefault();
    e.stopPropagation();
    if (cpDraggedChunkIndex === null || cpDraggedChunkIndex === dropIdx) {
        cpDraggedChunkIndex = null; cpDragOverIndex = null; cpDropPosition = 'before';
        cpSelectModeEl.classList.remove('dragging');
        cpRenderSelectMode(); return;
    }
    const newChunks = [...cpChunks];
    const dragged = newChunks[cpDraggedChunkIndex];
    newChunks.splice(cpDraggedChunkIndex, 1);
    let insertIdx = dropIdx;
    if (cpDropPosition === 'after') insertIdx = dropIdx + 1;
    if (cpDraggedChunkIndex < dropIdx) insertIdx -= 1;
    if (dropIdx === cpChunks.length - 1 && cpDropPosition === 'after') insertIdx = newChunks.length;
    insertIdx = Math.max(0, Math.min(insertIdx, newChunks.length));
    newChunks.splice(insertIdx, 0, dragged);
    cpText = cpReconstructText(newChunks);
    cpChunks = cpParseTextToChunks(cpText);
    cpSelectedChunkIndex = insertIdx;
    cpDraggedChunkIndex = null; cpDragOverIndex = null; cpDropPosition = 'before';
    cpSelectModeEl.classList.remove('dragging');
    cpRenderSelectMode();
}

// ===== モード切替 =====
function cpToggleEditMode() {
    if (cpIsEditing) {
        cpScrollPosition = cpEditTextArea.scrollTop;
        const cursorPos = cpEditTextArea.selectionStart;
        let content = cpEditTextArea.value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        cpComicPotHeader = cpExtractComicPotHeader(content);
        cpText = content;
        cpChunks = cpParseTextToChunks(content);
        const cursorChunkIndex = cpGetChunkIndexFromCursorPosition(cursorPos);
        cpIsEditing = false;
        cpSelectedChunkIndex = cursorChunkIndex;
        cpRender();
        setTimeout(() => { cpSelectModeEl.scrollTop = cpScrollPosition; }, 0);
    } else {
        cpScrollPosition = cpSelectModeEl.scrollTop;
        cpSelectedChunkIndex = null;
        cpIsEditing = true;
        cpRender();
        cpEditTextArea.focus();
        cpEditTextArea.scrollTop = cpScrollPosition;
    }
}

function cpGetChunkIndexFromCursorPosition(cursorPos) {
    if (!cpChunks.length || cursorPos < 0) return null;
    let pos = 0;
    if (cpComicPotHeader) pos = cpComicPotHeader.length + 2;
    for (let i = 0; i < cpChunks.length; i++) {
        const len = cpChunks[i].content.length;
        if (cursorPos >= pos && cursorPos <= pos + len) {
            return cpChunks[i].type === 'dialogue' ? i : null;
        }
        pos += len;
        if (i < cpChunks.length - 1) {
            pos += (cpChunks[i].type === 'separator' || cpChunks[i + 1].type === 'separator') ? 1 : 2;
        }
    }
    return null;
}

// ===== イベントリスナー設定（初回のみ） =====
let cpEventListenersSetup = false;

function cpSetupEventListeners() {
    if (cpEventListenersSetup) return;
    cpEventListenersSetup = true;

    // スプリットビュー: リサイズハンドル初期化
    cpSetupResizeHandle();

    // テキストエリアへのD&D（TXTファイルドロップで読み込み）
    if (window._registerDragDropHandler) {
        // ドラッグ中のビジュアルフィードバック
        document.addEventListener('tauri-drag-enter', () => {
            const editorPage = document.getElementById('comicPotEditorPage');
            if (editorPage && editorPage.style.display !== 'none') {
                cpEditorColumn.classList.add('drag-over');
            }
        });
        document.addEventListener('tauri-drag-leave', () => {
            cpEditorColumn.classList.remove('drag-over');
        });

        window._registerDragDropHandler((paths) => {
            cpEditorColumn.classList.remove('drag-over');

            const editorPage = document.getElementById('comicPotEditorPage');
            if (!editorPage || editorPage.style.display === 'none') return false;

            const txtPaths = paths.filter(p => p.toLowerCase().endsWith('.txt'));
            if (txtPaths.length === 0) return false;

            window.electronAPI.readDroppedTxtFiles(txtPaths).then(result => {
                if (!result.success || result.files.length === 0) return;
                if (result.files.length === 1) {
                    cpApplySerifFile(result.files[0]);
                } else {
                    cpOpenSerifSelectModal(result.files);
                }
            });
            return true;
        });
    }

    // テキストエリア入力
    cpEditTextArea.addEventListener('input', () => {
        let content = cpEditTextArea.value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        cpComicPotHeader = cpExtractComicPotHeader(content);
        cpText = content;
        cpChunks = cpParseTextToChunks(content);
        cpUpdateStatusBar();
        const hasText = cpText && cpText.trim() !== '';
        cpBtnCopy.disabled = !hasText;
    
        cpCopyBtnFloat.style.display = hasText ? 'flex' : 'none';
        cpBtnConvert.disabled = !hasText;
    });

    // ルビ入力のリアルタイムプレビュー
    document.getElementById('cpRubyInput').addEventListener('input', cpUpdateRubyPreview);

    // ルビモーダルでEnterキーで適用
    document.getElementById('cpRubyInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); cpApplyRuby(); }
        if (e.key === 'Escape') { e.preventDefault(); cpCloseRubyModal(); }
    });

    // 変換モーダルの入力変更でプレビュー更新
    document.getElementById('cpConvertSortMode').addEventListener('change', cpUpdateConvertPreview);
    document.getElementById('cpConvertVolume').addEventListener('input', cpUpdateConvertPreview);
    document.getElementById('cpConvertStartPage').addEventListener('input', cpUpdateConvertPreview);

    // キーボードショートカット
    let cpShiftPressed = false;
    let cpOtherKeyPressed = false;

    window.addEventListener('keydown', (e) => {
        // COMIC-POTエディタページがアクティブでなければ無視
        const editorPage = document.getElementById('comicPotEditorPage');
        if (!editorPage || editorPage.style.display === 'none') return;

        // モーダルが開いている場合は無視
        if (document.querySelector('.cp-modal-overlay.show')) return;

        // Ctrl+S: 保存
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            cpHandleFileSave();
            return;
        }

        if (e.key === 'Shift') {
            cpShiftPressed = true;
            cpOtherKeyPressed = false;
            return;
        }
        if (cpShiftPressed) cpOtherKeyPressed = true;

        if (cpIsEditing && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey) return;

        if (e.shiftKey && e.key === 'ArrowUp') {
            e.preventDefault(); cpMoveChunkUp();
        } else if (e.shiftKey && e.key === 'ArrowDown') {
            e.preventDefault(); cpMoveChunkDown();
        } else if (!e.shiftKey && e.key === 'ArrowUp' && !cpIsEditing) {
            e.preventDefault(); cpSelectPreviousChunk();
        } else if (!e.shiftKey && e.key === 'ArrowDown' && !cpIsEditing) {
            e.preventDefault(); cpSelectNextChunk();
        } else if (e.key === 'Backspace' && !cpIsEditing && cpSelectedChunkIndex !== null) {
            e.preventDefault(); cpDeleteSelectedChunk();
        } else if (e.key === 'Delete' && !cpIsEditing && cpSelectedChunkIndex !== null) {
            e.preventDefault(); cpToggleDeleteMark();
        }
    });

    window.addEventListener('keyup', (e) => {
        const editorPage = document.getElementById('comicPotEditorPage');
        if (!editorPage || editorPage.style.display === 'none') return;
        if (document.querySelector('.cp-modal-overlay.show')) return;
        if (e.key === 'Shift') {
            if (cpShiftPressed && !cpOtherKeyPressed) cpToggleEditMode();
            cpShiftPressed = false;
            cpOtherKeyPressed = false;
        }
    });
}

// ===== ビューアー連動: ページ同期 =====
function cpSyncToPage(pageNum) {
    if (!cpText) return;
    if (cpIsEditing) {
        cpJumpInTextarea(pageNum, '');
    } else {
        cpJumpInSelectMode(pageNum, '');
    }
}

// ES Module exports
export { cpInitDomRefs, goToComicPotEditor, cpLoadSerifText, cpApplySerifFile, cpLoadAllSerifText, cpOpenSerifSelectModal, cpCloseSerifSelectModal, cpLoadFromHandoff, goBackFromComicPotEditor, cpGoToProofreading, cpShowSaveConfirm, cpCloseSaveConfirm, cpSaveConfirmAction, cpToggleResultPanel, cpShowResultPanel, cpHideResultPanel, cpSwitchPanelTab, goToResultViewerPageFromEditor, cpRenderPanelContent, cpSetupPanelCategoryFilter, cpApplyPanelCategoryFilter, cpSetupResizeHandle, cpJumpToExcerpt, cpJumpInTextarea, cpJumpInSelectMode, cpSyncToPage, cpShowNotify, cpParseTextToChunks, cpExtractComicPotHeader, cpReconstructText, cpRender, cpUpdateToolbarState, cpRenderSelectMode, cpRenderChunkContent, cpScrollToSelected, cpUpdateStatusBar, cpHandleFileOpen, cpHandleFileSave, cpHandleFileSaveAs, cpHandleCopy, cpFallbackCopy, cpToggleDeleteMark, cpOpenRubyModal, cpCloseRubyModal, cpApplyRuby, cpSwitchRubyMode, cpOpenConvertModal, cpCloseConvertModal, cpUpdateConvertPreview, cpApplyConvert, cpHandleChunkClick, cpMoveChunkUp, cpMoveChunkDown, cpSelectPreviousChunk, cpSelectNextChunk, cpDeleteSelectedChunk, cpHandleDragStart, cpHandleDragEnd, cpHandleDragOverChunk, cpHandleDragLeaveChunk, cpHandleDropChunk, cpToggleEditMode, cpGetChunkIndexFromCursorPosition, cpSetupEventListeners, cpLoadResultJson, cpSaveResultJson, cpOpenJsonBrowser, cpCloseJsonBrowser, cpJsonBrowserNavigate, cpJsonBrowserSelect, cpJsonBrowserOpen, cpJsonBrowserFilter, cpJsonBrowserClearSearch, cpJsonBrowserGoUp, cpJsonBrowserRefresh, cpJsonBrowserOpenFolder, cpJsonBrowserOpenFile, cpJsonBrowserLoadFolder };

// Expose to window for inline HTML handlers
Object.assign(window, { cpInitDomRefs, goToComicPotEditor, cpLoadSerifText, cpApplySerifFile, cpLoadAllSerifText, cpOpenSerifSelectModal, cpCloseSerifSelectModal, cpLoadFromHandoff, goBackFromComicPotEditor, cpGoToProofreading, cpShowSaveConfirm, cpCloseSaveConfirm, cpSaveConfirmAction, cpToggleResultPanel, cpShowResultPanel, cpHideResultPanel, cpSwitchPanelTab, goToResultViewerPageFromEditor, cpRenderPanelContent, cpSetupPanelCategoryFilter, cpApplyPanelCategoryFilter, cpSetupResizeHandle, cpJumpToExcerpt, cpJumpInTextarea, cpJumpInSelectMode, cpSyncToPage, cpShowNotify, cpParseTextToChunks, cpExtractComicPotHeader, cpReconstructText, cpRender, cpUpdateToolbarState, cpRenderSelectMode, cpRenderChunkContent, cpScrollToSelected, cpUpdateStatusBar, cpHandleFileOpen, cpHandleFileSave, cpHandleFileSaveAs, cpHandleCopy, cpFallbackCopy, cpToggleDeleteMark, cpOpenRubyModal, cpCloseRubyModal, cpApplyRuby, cpSwitchRubyMode, cpOpenConvertModal, cpCloseConvertModal, cpUpdateConvertPreview, cpApplyConvert, cpHandleChunkClick, cpMoveChunkUp, cpMoveChunkDown, cpSelectPreviousChunk, cpSelectNextChunk, cpDeleteSelectedChunk, cpHandleDragStart, cpHandleDragEnd, cpHandleDragOverChunk, cpHandleDragLeaveChunk, cpHandleDropChunk, cpToggleEditMode, cpGetChunkIndexFromCursorPosition, cpSetupEventListeners, cpLoadResultJson, cpSaveResultJson, cpOpenJsonBrowser, cpCloseJsonBrowser, cpJsonBrowserNavigate, cpJsonBrowserSelect, cpJsonBrowserOpen, cpJsonBrowserFilter, cpJsonBrowserClearSearch, cpJsonBrowserGoUp, cpJsonBrowserRefresh, cpJsonBrowserOpenFolder, cpJsonBrowserOpenFile, cpJsonBrowserLoadFolder });
