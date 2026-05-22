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
let cpIsEditing = true;
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
// 直近に .cp-page-text-block 上で確定した選択範囲（ボタン押下で focus が外れる前に保持しておく）
// { absStart, absEnd, text } | null
let _cpLastBlockSelection = null;
let _cpActiveChunkTextarea = null;
let _cpDraggedTextChunk = null;
let _cpDragOverTextChunk = null;

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

function cpEnsureCalibrationButton() {
    // テキスト読み込みボタンの直後に挿入。万一無ければ別名保存の後にフォールバック。
    const anchor = document.getElementById('cpBtnLoadText') || document.getElementById('cpBtnSaveAs');
    if (!anchor || document.getElementById('cpBtnCalibrationData')) return;

    const button = document.createElement('button');
    button.id = 'cpBtnCalibrationData';
    button.className = 'cp-toolbar-btn';
    button.title = '校正データを開く';
    button.innerHTML = '<span class="cp-toolbar-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"></path><rect x="9" y="3" width="6" height="4" rx="1"></rect><path d="M9 14l2 2 4-4"></path></svg></span>校正データ';
    button.addEventListener('click', cpLoadCalibrationData);
    anchor.insertAdjacentElement('afterend', button);
}

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
    cpEnsureCalibrationButton();

    const editorPage = document.getElementById('comicPotEditorPage');

    // 遷移元ページを検出（display !== 'none' のもの）
    const candidates = ['landingScreen', 'mainWrapper', 'proofreadingPage', 'resultViewerPage', 'specSheetPage'];
    const sourcePages = candidates
        .map(id => document.getElementById(id))
        .filter(el => el && el.style.display !== 'none' && getComputedStyle(el).display !== 'none');

    const showEditor = () => {
        editorPage.style.display = 'flex';
        editorPage.classList.add('cp-slide-in-right');
        setTimeout(() => editorPage.classList.remove('cp-slide-in-right'), 320);
    };

    if (sourcePages.length > 0) {
        // 遷移元を左へスライドアウト → 完了後にエディタを右からスライドイン
        sourcePages.forEach(p => p.classList.add('cp-slide-out-left'));
        setTimeout(() => {
            sourcePages.forEach(p => {
                p.style.display = 'none';
                p.classList.remove('cp-slide-out-left');
            });
            // 他の候補ページも一応非表示にしておく
            candidates.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
            showEditor();
        }, 220);
    } else {
        // 遷移元が見つからない（初回起動等）→ そのままエディタ表示
        candidates.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        showEditor();
    }

    // イベントリスナーを初期化（初回のみ）
    cpSetupEventListeners();
    const loadedPreloadedText = cpApplyPreloadedSerifText();
    cpRender();

    // セリフ読込ボタン: 読み込み済みテキストがあれば表示
    const cpBtnLoadSerif = document.getElementById('cpBtnLoadSerif');
    if (cpSourcePage === 'proofreading' && cpGetValidSerifFiles(state.proofreadingFiles).length > 0) {
        cpBtnLoadSerif.style.display = '';
    } else if (cpSourcePage === 'extraction' && cpGetValidSerifFiles(state.manuscriptTxtFiles).length > 0) {
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
    const validProofreadingFiles = cpGetValidSerifFiles(state.proofreadingFiles);
    if (!loadedPreloadedText && cpSourcePage === 'proofreading' && validProofreadingFiles.length === 1) {
        cpApplySerifFile(validProofreadingFiles[0]);
    }
}

function cpLoadSerifText() {
    const files = cpGetSerifFilesForCurrentSource();
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
    cpIsEditing = true;
    cpRender();
    cpShowNotification('「' + file.name + '」を読み込みました。', 'success');
}

function cpLoadAllSerifText() {
    const files = cpGetSerifFilesForCurrentSource();
    cpCloseSerifSelectModal();
    if (!files || files.length === 0) {
        cpShowNotification('読み込み済みのセリフテキストがありません。', 'error');
        return;
    }
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
    cpIsEditing = true;
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

function cpGetValidSerifFiles(files) {
    if (!Array.isArray(files)) return [];
    return files.filter(file => file && cpNormalizeTextContent(file.content).trim() !== '');
}

function cpGetSerifFilesForCurrentSource() {
    if (cpSourcePage === 'proofreading') {
        return cpGetValidSerifFiles(state.proofreadingFiles);
    }
    if (cpSourcePage === 'extraction') {
        return cpGetValidSerifFiles(state.manuscriptTxtFiles);
    }
    return [];
}

function cpNormalizeTextContent(content) {
    let normalized = String(content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (normalized.charCodeAt(0) === 0xFEFF) normalized = normalized.substring(1);
    return normalized;
}

function cpSetEditorTextFromSerifFile(file, options = {}) {
    const content = cpNormalizeTextContent(file && file.content);
    cpText = content;
    cpSavedText = cpText;
    cpFilePath = file && file.path ? file.path : '';
    cpFileName = file && file.name ? file.name : '無題';
    cpComicPotHeader = cpExtractComicPotHeader(cpText);
    cpChunks = cpParseTextToChunks(cpText);
    cpSelectedChunkIndex = null;
    cpIsEditing = true;
    if (options.flash && typeof cpFlashEditorNotice === 'function') {
        cpFlashEditorNotice(options.flash);
    }
}

function cpBuildCombinedSerifFile(files) {
    const safeFiles = Array.isArray(files) ? files : [];
    return {
        name: safeFiles.length > 1 ? safeFiles[0].name + ' 他 ' + (safeFiles.length - 1) + '件' : (safeFiles[0] && safeFiles[0].name) || '無題',
        content: safeFiles.map(f => cpNormalizeTextContent(f.content)).join('\n\n'),
        size: safeFiles.reduce((sum, f) => sum + (f.size || (f.content ? String(f.content).length : 0)), 0)
    };
}

function cpApplyPreloadedSerifText() {
    if (cpText && cpText.trim() !== '') return false;
    const files = cpGetSerifFilesForCurrentSource();
    if (!files || files.length === 0) return false;

    const file = files.length === 1 ? files[0] : cpBuildCombinedSerifFile(files);
    cpSetEditorTextFromSerifFile(file, { flash: '読み込み済みテキストを引き継ぎました' });
    return true;
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
    if (typeof updateTxtUploadStatus === 'function') updateTxtUploadStatus();
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
    cpIsEditing = true;
    goToComicPotEditor('extraction');
    cpShowNotification('COMIC-POTから「' + data.fileName + '」を受け取りました。', 'success');
}

// エディタ状態をリセット（テキスト・ファイル名・チャンク・画像ビューア）
function _cpResetEditorState() {
    cpText = '';
    cpSavedText = '';
    cpChunks = [];
    cpFileName = '無題';
    cpFilePath = '';
    cpComicPotHeader = '';
    if (cpEditTextArea) cpEditTextArea.value = '';
    _cpLastReportedPage = null;
    _cpLastBlockSelection = null;
    // 画像ビューアもリセット
    if (typeof window.cpViewerReset === 'function') window.cpViewerReset();
    // UI 反映（cpRender が文字数・ファイル名・パネル等を全て更新）
    if (typeof cpRender === 'function') cpRender();
}

// 画像が読み込まれているか（cpViewerCanvas が表示中＝画像 or PDF が入っている）
function _cpHasViewerImage() {
    const canvas = document.getElementById('cpViewerCanvas');
    if (!canvas) return false;
    // 初期 HTML は display:none、画像ロード後は display:'' に切り替わる
    return canvas.style.display !== 'none';
}

// ホームボタンの本体: モーダル確認後に呼ばれる実遷移処理
function _cpExecuteGoHome() {
    cpSourcePage = 'landing';

    // スプリットビューをリセット
    cpHideResultPanel();
    cpPanelCurrentTab = 'simple';
    cpPanelWidthPercent = 50;

    const pendingTitle = state.pendingWorkTitle;
    if (pendingTitle) {
        state.pendingWorkTitle = '';
        _autoSelectWorkJson(pendingTitle);
    }

    const editorPage = document.getElementById('comicPotEditorPage');
    const landingScreen = document.getElementById('landingScreen');

    // エディタを奥へフェードアウト → 完了後にランディングを手前にフェードイン
    editorPage.classList.add('cp-fade-out-back');
    setTimeout(() => {
        editorPage.style.display = 'none';
        editorPage.classList.remove('cp-fade-out-back');
        if (landingScreen) {
            landingScreen.style.display = 'flex';
            landingScreen.classList.add('cp-fade-in-front');
            setTimeout(() => landingScreen.classList.remove('cp-fade-in-front'), 320);
        }
    }, 340);
}

// ホームボタン: 遷移元に関わらずランディング画面（ホーム）へ戻る。
// 編集中テキストや読み込み済み画像がある場合は警告ダイアログを出し、確定でリセット→遷移。
async function cpGoHomeFromEditor() {
    const hasText = !!(cpText && cpText.length > 0);
    const hasImage = _cpHasViewerImage();
    const hasUnsavedRules = typeof window.hasUnsavedProofRules === 'function' && window.hasUnsavedProofRules();
    if (hasText || hasImage || hasUnsavedRules) {
        const confirmed = (typeof window.confirmHomeReset === 'function')
            ? await window.confirmHomeReset()
            : window.confirm('読み込みがリセットされます。よろしいですか？');
        if (!confirmed) return;
    }
    if (typeof window.resetProofreadingResultOnHome === 'function') {
        window.resetProofreadingResultOnHome();
    }
    if (typeof window.clearProofRulesSavedState === 'function') {
        window.clearProofRulesSavedState();
    }
    _cpResetEditorState();
    _cpExecuteGoHome();
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

    // 戻り先と display 値（mainWrapper のみ 'flex'、その他は 'flex'）を判定
    let targetId = 'mainWrapper';
    if (cpSourcePage === 'proofreading') targetId = 'proofreadingPage';
    else if (cpSourcePage === 'resultViewer') targetId = 'resultViewerPage';
    else if (cpSourcePage === 'landing') targetId = 'landingScreen';
    let targetEl = document.getElementById(targetId);
    if (!targetEl && targetId === 'proofreadingPage') {
        targetId = 'mainWrapper';
        targetEl = document.getElementById(targetId);
    }
    const targetDisplay = targetId === 'resultViewerPage' ? 'block' : 'flex';

    // エディタを右へスライドアウト → 完了後に戻り先を左からスライドイン
    editorPage.classList.add('cp-slide-out-right');
    setTimeout(() => {
        editorPage.style.display = 'none';
        editorPage.classList.remove('cp-slide-out-right');
        if (targetEl) {
            targetEl.style.display = targetDisplay;
            targetEl.classList.add('cp-slide-in-left');
            setTimeout(() => targetEl.classList.remove('cp-slide-in-left'), 320);
        }
        if (targetId === 'mainWrapper' && typeof updateHeaderSaveButtons === 'function') {
            updateHeaderSaveButtons();
        }
    }, 220);
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
            cpFileNameDisplay.textContent = 'テキストエディタ';
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

    // 校正専用ページは現在UIから撤去済み。存在しない場合はメイン画面のプロンプト生成バーへ戻す。
    const editorPage = document.getElementById('comicPotEditorPage');
    const proofreadingPage = document.getElementById('proofreadingPage');
    const mainWrapper = document.getElementById('mainWrapper');
    if (!editorPage) {
        return;
    }
    if (!proofreadingPage) {
        editorPage.classList.add('cp-slide-out-left');
        setTimeout(() => {
            editorPage.style.display = 'none';
            editorPage.classList.remove('cp-slide-out-left');

            ['landingScreen', 'resultViewerPage', 'specSheetPage'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });

            if (mainWrapper) {
                mainWrapper.style.display = 'flex';
                mainWrapper.classList.add('cp-slide-in-right');
                setTimeout(() => mainWrapper.classList.remove('cp-slide-in-right'), 320);
            }

            if (typeof updateHeaderSaveButtons === 'function') {
                updateHeaderSaveButtons();
            }
        }, 220);

        return;
    }

    editorPage.classList.add('cp-slide-out-left');
    setTimeout(() => {
        editorPage.style.display = 'none';
        editorPage.classList.remove('cp-slide-out-left');
        proofreadingPage.style.display = 'flex';
        proofreadingPage.classList.add('cp-slide-in-right');
        setTimeout(() => { proofreadingPage.classList.remove('cp-slide-in-right'); }, 320);
    }, 220);

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
                        if (opts.numberRuleBase !== undefined) state.numberRuleBase = opts.numberRuleBase;
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
                if (typeof window.markProofRulesSaved === 'function') {
                    window.markProofRulesSaved();
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
    const syncBtn = document.getElementById('cpViewerSyncToggle');
    if (tab === 'viewer') {
        cpResultPanelBody.style.display = 'none';
        if (viewerBody) viewerBody.style.display = 'flex';
        // ビューアー時: フィルタはグレーアウト、ページ連動は有効
        if (filterEl) filterEl.disabled = true;
        if (syncBtn) syncBtn.disabled = false;
    } else {
        cpResultPanelBody.style.display = '';
        if (viewerBody) viewerBody.style.display = 'none';
        // チェック時: フィルタは有効、ページ連動はグレーアウト
        if (filterEl) filterEl.disabled = false;
        if (syncBtn) syncBtn.disabled = true;
        cpRenderPanelContent();
        cpSetupPanelCategoryFilter();
    }
}

function goToResultViewerPageFromEditor() {
    const editorPage = document.getElementById('comicPotEditorPage');
    const resultViewer = document.getElementById('resultViewerPage');

    if (!editorPage || !resultViewer) {
        goToResultViewerPage();
        return;
    }

    editorPage.classList.add('cp-slide-out-left');
    setTimeout(() => {
        editorPage.style.display = 'none';
        editorPage.classList.remove('cp-slide-out-left');

        ['landingScreen', 'mainWrapper', 'proofreadingPage', 'specSheetPage'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        resultViewer.style.display = 'block';
        resultViewer.classList.add('cp-slide-in-right');
        setTimeout(() => resultViewer.classList.remove('cp-slide-in-right'), 320);

        if (typeof switchResultTab === 'function') {
            const hasVariation = Object.keys(state.currentVariationData).length > 0;
            const hasSimple = state.currentSimpleData.length > 0;
            if (hasVariation && !hasSimple) {
                switchResultTab('variation', true);
            } else {
                switchResultTab('simple', true);
            }
        }
    }, 220);
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
function cpLoadCalibrationData() {
    const currentLabel = document.getElementById('proofreadingLabelSelect')?.value
        || document.getElementById('labelSelector')?.value
        || '';

    const mappedLabel = window.labelToTxtFolderMapping?.[currentLabel] || currentLabel || '';
    if (typeof window.openCalibrationFolderPickerForLoad === 'function') {
        window.openCalibrationFolderPickerForLoad({
            autoExpandFolder: mappedLabel,
            onFileSelect: (filePath) => {
                _loadJsonFromPath(filePath);
            },
        });
        return;
    }

    cpOpenJsonBrowser();
}

function cpLoadResultJson() {
    cpLoadCalibrationData();
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
        if (typeof window.updateProofreadingResultButton === 'function') {
            window.updateProofreadingResultButton();
        }

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

    // excerptから括弧等を除去して検索用テキストを作成（excerpt 無しでもページジャンプは行う）
    const searchText = (excerptText || '').replace(/[「」『』]/g, '').replace(/\s+/g, '').trim();

    if (cpIsEditing) {
        // ===== 編集モード（textarea — 非表示でも内部選択を合わせておく） =====
        cpJumpInTextarea(pageNum, searchText);
    } else {
        // ===== セレクトモード（チャンク表示） =====
        cpJumpInSelectMode(pageNum, searchText);
    }

    // PsDesign 風パネル側: 該当する .cp-page-section（=cp-page-section-header）まで実スクロール。
    // 全ページモードでは render 内の scrollIntoView が動き、ページごとモードでは pageNum のページに切替わる。
    _cpLastReportedPage = pageNum;
    cpUpdateCurrentPageBadge(pageNum);
    cpRenderPageTextPanel(pageNum);

    // 画像ビューアも同ページに連動（連動トグルの状態に関わらず、リンク操作は明示的なので強制ジャンプ）
    if (typeof window.cpViewerJumpToPage === 'function') {
        try { window.cpViewerJumpToPage(pageNum); } catch (e) { /* viewer 未初期化なら無視 */ }
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
        // 全角数字・前後空白を許容（PsDesign 準拠）
        const exportPageMatch = trimmedLine.match(/^<<\s*([0-9０-９]+)\s*Page\s*>>$/i);
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
                nextPage = _cpToHalfWidthInt(exportPageMatch[1]);
                if (nextPage === null) nextPage = currentPage + 1;
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

// ===== ページマーカ走査ヘルパ（PsDesign 準拠・全角数字・空白許容） =====
const CP_PAGE_MARKER_RE = /<<\s*([0-9０-９]+)\s*Page\s*>>/gi;
function _cpToHalfWidthInt(s) {
    const half = String(s).replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    const n = parseInt(half, 10);
    return Number.isFinite(n) ? n : null;
}
// textarea 全体を走査してページ区間 [{page, start, markerEnd, end}] を返す
function cpScanPageRegions(text) {
    if (!text) return [];
    const regions = [];
    const re = new RegExp(CP_PAGE_MARKER_RE.source, CP_PAGE_MARKER_RE.flags);
    let prev = null;
    let m;
    while ((m = re.exec(text)) !== null) {
        const page = _cpToHalfWidthInt(m[1]);
        if (page === null) continue;
        if (prev) prev.end = m.index;
        prev = { page, start: m.index, markerEnd: m.index + m[0].length, end: text.length };
        regions.push(prev);
    }
    if (regions.length === 0) {
        regions.push({ page: 1, start: 0, markerEnd: 0, end: text.length });
    }
    return regions;
}
// 文字オフセットから所属ページ番号を返す（二分探索）
function cpPageForOffset(regions, offset) {
    if (!regions || regions.length === 0) return null;
    let lo = 0, hi = regions.length - 1, ans = regions[0].page;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const r = regions[mid];
        if (offset < r.start) hi = mid - 1;
        else if (offset >= r.end) lo = mid + 1;
        else { ans = r.page; break; }
    }
    return ans;
}

// ===== パース =====
function cpParseTextToChunks(inputText) {
    if (!inputText) return [];

    const lines = inputText.split('\n');
    const parsed = [];
    let currentChunk = [];

    const volumeMarkerPattern = /^\[\d+巻\]$/;
    const exportPagePattern = /^<<\s*[0-9０-９]+\s*Page\s*>>$/i;

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

// ===== Comic-Bridge 風: エディタ列ステータス表示ヘルパー =====
function cpUpdateEditorFileRow() {
    const nameEl = document.getElementById('cpEditorFileName');
    const dirtyEl = document.getElementById('cpEditorDirtyMark');
    if (!nameEl) return;
    if (cpFileName) {
        nameEl.textContent = cpFileName;
        nameEl.title = cpFilePath || cpFileName;
    } else if (cpText && cpText.length > 0) {
        nameEl.textContent = '(未保存)';
        nameEl.title = '';
    } else {
        nameEl.textContent = '未読込 — 「開く」または .txt をドロップ';
        nameEl.title = '';
    }
    if (dirtyEl) {
        const isDirty = cpText !== cpSavedText && cpText && cpText.length > 0;
        dirtyEl.style.display = isDirty ? '' : 'none';
    }
}

let _cpFlashEditorNoticeTimer = null;
function cpFlashEditorNotice(msg) {
    const el = document.getElementById('cpEditorFlashMsg');
    if (!el) return;
    el.textContent = msg || '';
    // CSS アニメーションを再トリガするためクラスを付け直す
    el.classList.remove('cp-editor-filerow-flash');
    void el.offsetWidth; // reflow
    el.classList.add('cp-editor-filerow-flash');
    clearTimeout(_cpFlashEditorNoticeTimer);
    _cpFlashEditorNoticeTimer = setTimeout(() => { el.textContent = ''; }, 1800);
}

function cpUpdateEditorFooter() {
    const footer = document.getElementById('cpEditorFooter');
    const charEl = document.getElementById('cpEditorCharCount');
    const lineEl = document.getElementById('cpEditorLineCount');
    const warnEl = document.getElementById('cpEditorUnsavedWarn');
    if (!footer) return;
    if (!cpText || cpText.length === 0) {
        footer.style.display = 'none';
        return;
    }
    footer.style.display = '';
    if (charEl) charEl.textContent = cpText.length.toLocaleString() + ' 文字';
    if (lineEl) lineEl.textContent = cpText.split('\n').length.toLocaleString() + ' 行';
    if (warnEl) {
        const dirty = cpText !== cpSavedText;
        warnEl.textContent = (!cpFilePath && dirty) ? '未保存 — 「別名保存」で書き出し' : '';
    }
}

function cpUpdateEditorEmptyState() {
    const empty = document.getElementById('cpEditorEmptyState');
    if (!empty) return;
    // 編集モード && テキスト空 のときのみ表示。
    // 選択モード時の空状態は cpSelectMode 内の既存ドロップゾーンが担当するため、
    // ここでは編集モード時のみ表示してプレースホルダの二重表示を防ぐ。
    const showEmpty = cpIsEditing && (!cpText || cpText.length === 0);
    empty.style.display = showEmpty ? '' : 'none';
}

// ===== 表示更新 =====
function cpRender() {
    if (!cpEditTextArea) return;

    // 並び替え機能を撤去したため常に編集モード固定
    cpIsEditing = true;

    const hasText = cpText && cpText.trim() !== '';
    cpBtnCopy.disabled = !hasText;

    // コピーボタンは常に表示（disabled でグレーアウト）
    if (cpCopyBtnFloat) {
        cpCopyBtnFloat.style.display = 'flex';
        cpCopyBtnFloat.disabled = !hasText;
    }

    // コンテキストバー: 未読込時でも常に表示（テキスト読込ボタンのみ有効、他はグレーアウト）
    cpContextBar.style.display = 'flex';
    cpContextBar.classList.add('editing');
    if (cpBtnRuby) cpBtnRuby.style.display = 'inline-block';

    cpUpdateToolbarState();

    // 常に textarea を表示
    // textarea はデータ保持用に DOM に残すが UI 上は非表示（PsDesign 風パネルが表示を担当）
    cpEditTextArea.style.display = 'none';
    if (cpSelectModeEl) cpSelectModeEl.style.display = 'none';
    cpEditTextArea.value = cpText;

    cpFileNameDisplay.textContent = 'テキストエディタ';
    cpUpdateStatusBar();

    // Comic-Bridge 風ステータス UI 更新
    cpUpdateEditorFileRow();
    cpUpdateEditorFooter();
    cpUpdateEditorEmptyState();
    // ページ連動バッジ更新（テキスト切替時）
    _cpLastReportedPage = null;
    cpUpdateCurrentPageBadge();
    // PsDesign 風: テキスト切替時に新パネルも初期化（折りたたみ状態復元 + 初回描画）
    cpInitPageTextPanel();
    cpRenderPageTextPanel(null);
}

function cpUpdateToolbarState() {
    const hasText = cpText && cpText.trim() !== '';
    // 並び替え撤去後は textarea 上の操作のみ。テキストがあれば常に有効。
    if (cpBtnRuby) cpBtnRuby.disabled = !hasText;
    cpBtnConvert.disabled = !hasText;
    cpBtnSave.disabled = !hasText;
    cpBtnSaveAs.disabled = !hasText;
    // コンテキストバー上のコピー・ページ表示モードタブも hasText に連動
    if (cpCopyBtnFloat) cpCopyBtnFloat.disabled = !hasText;
    const toggleWrap = document.getElementById('cpShowAllPagesLabelWrap');
    if (toggleWrap) toggleWrap.classList.toggle('disabled', !hasText);
    const allBtn = document.getElementById('cpPageModeAll');
    const singleBtn = document.getElementById('cpPageModeSingle');
    if (allBtn) allBtn.disabled = !hasText;
    if (singleBtn) singleBtn.disabled = !hasText;
}

function cpRenderSelectMode() {
    // 並び替え機能を撤去したため no-op（cpSelectModeEl は存在しない）
    if (!cpSelectModeEl) return;
    cpSelectModeEl.innerHTML = '';
    return;

    /* 旧 select モード描画ロジックは残置（再有効化時の参照用）
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
    */
}

// ルビパターンをハイライト表示するためのレンダリング
function cpRenderChunkContent(span, chunk) {
    if (chunk.type === 'separator') {
        span.textContent = chunk.content;
        return;
    }

    const rubyPattern = /｛([^｝]+)｝（([^）]+)）|\[([^\]]+)\]\(([^)]+)\)/g;
    const content = chunk.content;
    let lastIndex = 0;
    let match;

    while ((match = rubyPattern.exec(content)) !== null) {
        if (match.index > lastIndex) {
            span.appendChild(document.createTextNode(content.substring(lastIndex, match.index)));
        }
        const parentSpan = document.createElement('span');
        parentSpan.className = 'cp-ruby-highlight';
        const parentText = match[1] || match[3];
        const rubyText = match[2] || match[4];
        parentSpan.textContent = parentText;
        span.appendChild(parentSpan);

        const rubySpan = document.createElement('span');
        rubySpan.className = 'cp-ruby-annotation';
        rubySpan.textContent = '（' + rubyText + '）';
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
    // ステータスバー (#cpStatusInfo) は撤去済み — no-op（呼び出し側互換のためダミー関数を残す）
    if (!cpStatusInfo) return;
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

// ===== 見本PDF読み込み（ビューアへ） =====
function cpHandleFileOpen() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const lowerName = (file.name || '').toLowerCase();
        const isPdf = lowerName.endsWith('.pdf') || file.type === 'application/pdf';

        if (isPdf) {
            // PDF → ビューアへ読込（バイト経由）
            try {
                if (typeof window.cpViewerLoadPdfFile === 'function') {
                    await window.cpViewerLoadPdfFile(file);
                }
                // 校正結果パネルを開き、ビューアタブへ切替
                if (typeof cpShowResultPanel === 'function') cpShowResultPanel();
                if (typeof cpSwitchPanelTab === 'function') cpSwitchPanelTab('viewer');
                cpShowNotify('PDFを読み込みました: ' + file.name, 'var(--sage)');
            } catch (err) {
                console.error('PDF load failed:', err);
                cpShowNotify('PDFの読み込みに失敗しました', '#ef4444');
            }
            return;
        }

        cpShowNotify('対応形式は .pdf です', '#f59e0b');
    };
    input.click();
}

// ===== テキスト読み込み（.txt = エディタへ） =====
function cpHandleTextFileOpen() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const lowerName = (file.name || '').toLowerCase();
        const isTxt = lowerName.endsWith('.txt');

        if (isTxt) {
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
                cpIsEditing = true;
                cpRender();
                cpFlashEditorNotice('開きました: ' + cpFileName);
            };
            reader.readAsText(file, 'UTF-8');
            return;
        }

        cpShowNotify('対応形式は .txt です', '#f59e0b');
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
            cpFlashEditorNotice('保存しました');
            cpUpdateEditorFileRow();
            cpUpdateEditorFooter();
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
        cpFileNameDisplay.textContent = 'テキストエディタ';
        cpShowNotify('保存しました: ' + cpFileName, 'var(--sage)');
        cpFlashEditorNotice('保存しました: ' + cpFileName);
        cpUpdateEditorFileRow();
        cpUpdateEditorFooter();
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
            cpFlashEditorNotice('コピーしました');
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
    try { document.execCommand('copy'); cpShowNotify('コピーしました！', 'var(--sage)'); cpFlashEditorNotice('コピーしました'); }
    catch (e) { showToast('コピーに失敗しました。', 'error'); }
    document.body.removeChild(ta);
}

// ===== // 削除マーク切替 =====
function cpToggleDeleteMark() {
    // textarea 上の現在行 / 選択行に対して // を付与/解除（Comic-Bridge 互換）
    const ta = cpEditTextArea;
    if (!ta) return;
    const value = ta.value;
    if (!value) return;
    const selStart = ta.selectionStart;
    const selEnd = ta.selectionEnd;
    const savedScrollTop = ta.scrollTop;

    const lineStart = value.lastIndexOf('\n', selStart - 1) + 1;
    let lineEndIdx = value.indexOf('\n', selEnd);
    if (lineEndIdx === -1) lineEndIdx = value.length;

    const before = value.slice(0, lineStart);
    const target = value.slice(lineStart, lineEndIdx);
    const after = value.slice(lineEndIdx);
    const lines = target.split('\n');
    const allMarked = lines.every(l => l.startsWith('//'));
    const newLines = allMarked
        ? lines.map(l => l.slice(2))
        : lines.map(l => (l.startsWith('//') ? l : '//' + l));
    const newValue = before + newLines.join('\n') + after;

    ta.value = newValue;
    cpText = newValue;
    cpComicPotHeader = cpExtractComicPotHeader(newValue);
    cpChunks = cpParseTextToChunks(newValue);

    const delta = allMarked ? -2 : 2;
    const newSelStart = Math.max(lineStart, selStart + delta);
    const newSelEnd = selEnd + delta * lines.length;
    requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(newSelStart, newSelEnd);
        ta.scrollTop = savedScrollTop;
    });

    cpShowNotify(allMarked ? '削除マークを解除しました' : '削除マークを付与しました', allMarked ? '#6366f1' : '#ef4444');
    cpUpdateEditorFileRow();
    cpUpdateEditorFooter();
    return;
}

// ===== ルビ付け =====
function cpFormatRuby(parent, ruby) {
    if (cpRubyMode === 'standard') {
        return parent + '（' + ruby + '）';
    }
    return '｛' + parent + '｝（' + ruby + '）';
}

function cpFormatRubyPlaceholder(parent) {
    if (cpRubyMode === 'standard') {
        return parent + '（...）';
    }
    return '｛' + parent + '｝（...）';
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

// .cp-page-text-block 内の選択を絶対オフセット付きで保持する
// （ルビボタン押下時には focus が外れて選択が消えるので、selectionchange で逐次キャプチャしておく）
function _cpUpdateBlockSelectionFromDom() {
    const activeTextarea = document.activeElement && document.activeElement.closest
        ? document.activeElement.closest('.cp-page-textarea')
        : null;
    if (activeTextarea) {
        _cpActiveChunkTextarea = activeTextarea;
        const startInChunk = activeTextarea.selectionStart || 0;
        const endInChunk = activeTextarea.selectionEnd || 0;
        if (startInChunk !== endInChunk) {
            const blockOffset = parseInt(activeTextarea.dataset.offset || '0', 10);
            _cpLastBlockSelection = {
                absStart: blockOffset + startInChunk,
                absEnd: blockOffset + endInChunk,
                text: activeTextarea.value.substring(startInChunk, endInChunk),
            };
        }
        return;
    }

    const sel = window.getSelection && window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    let startEl = range.startContainer;
    if (startEl && startEl.nodeType !== 1) startEl = startEl.parentNode;
    const block = (startEl && startEl.closest) ? startEl.closest('.cp-page-text-block') : null;
    if (!block) return;
    let endEl = range.endContainer;
    if (endEl && endEl.nodeType !== 1) endEl = endEl.parentNode;
    if (!endEl || !endEl.closest || endEl.closest('.cp-page-text-block') !== block) return; // 同一ブロック内のみ対象

    const blockText = block.textContent || '';
    const blockOffset = parseInt(block.dataset.offset || '0', 10);
    const preStart = document.createRange();
    preStart.selectNodeContents(block);
    preStart.setEnd(range.startContainer, range.startOffset);
    const startInBlock = preStart.toString().length;
    const preEnd = document.createRange();
    preEnd.selectNodeContents(block);
    preEnd.setEnd(range.endContainer, range.endOffset);
    const endInBlock = preEnd.toString().length;
    if (startInBlock === endInBlock) return;

    const selectedText = blockText.substring(startInBlock, endInBlock);
    if (!selectedText || selectedText.includes('\n')) return;

    _cpLastBlockSelection = {
        absStart: blockOffset + startInBlock,
        absEnd: blockOffset + endInBlock,
        text: selectedText,
    };
}
document.addEventListener('selectionchange', _cpUpdateBlockSelectionFromDom);

function cpOpenRubyModal() {
    if (!cpIsEditing) {
        cpShowNotify('編集モードで文字を選択してください', '#f59e0b');
        return;
    }

    // 1) ブロック上の選択を優先（実 UI は contentEditable な .cp-page-text-block）
    // 2) フォールバックで textarea の selection を見る
    let start, end, selected;
    if (_cpLastBlockSelection) {
        start = _cpLastBlockSelection.absStart;
        end = _cpLastBlockSelection.absEnd;
        selected = _cpLastBlockSelection.text;
    } else {
        start = cpEditTextArea.selectionStart;
        end = cpEditTextArea.selectionEnd;
        selected = cpEditTextArea.value.substring(start, end);
    }

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

    // textarea は display:none のため execCommand は使えない。value を直接書き換える。
    const value = cpEditTextArea.value;
    const updated = value.substring(0, cpRubySelectionStart) + replacement + value.substring(cpRubySelectionEnd);

    cpEditTextArea.value = updated;
    let content = updated.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    cpComicPotHeader = cpExtractComicPotHeader(content);
    cpText = content;
    cpChunks = cpParseTextToChunks(content);

    // 1度使った選択は破棄（誤って次のルビ付けに使われないように）
    _cpLastBlockSelection = null;

    cpCloseRubyModal();

    // パネル側を再描画して反映
    cpRenderPageTextPanel(_cpLastReportedPage);

    cpShowNotify('ルビを適用しました', '#7c3aed');
    cpUpdateStatusBar();
    cpUpdateEditorFooter();
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
// 並び替え機能を撤去したため、常に編集モードのまま no-op
function cpToggleEditMode() {
    cpIsEditing = true;
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

    // 方向キーでのページ移動（cp-editor-column 内のフォーカス時のみ有効）
    if (cpEditorColumn) {
        cpEditorColumn.addEventListener('keydown', cpEditorColumnKeydown);
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

        if (cpCopyBtnFloat) { cpCopyBtnFloat.style.display = 'flex'; cpCopyBtnFloat.disabled = !hasText; }
        cpBtnConvert.disabled = !hasText;
        cpUpdateToolbarState();

        // Comic-Bridge 風ステータス UI を即時更新（dirty ●、文字数・行数）
        cpUpdateEditorFileRow();
        cpUpdateEditorFooter();
        cpUpdateEditorEmptyState();

        // ページ連動: 現在ページバッジ更新 + 必要ならビューア側もジャンプ
        cpHandleCursorPageChange();
        // PsDesign 風パネル: 編集による構造変化に追従（debounce）
        cpSchedulePageTextPanelRender();
    });

    // ページ連動の逆方向監視（カーソル移動・クリック・キーボード操作）
    cpEditTextArea.addEventListener('click', cpHandleCursorPageChange);
    cpEditTextArea.addEventListener('keyup', cpHandleCursorPageChange);
    document.addEventListener('selectionchange', () => {
        if (document.activeElement === cpEditTextArea) cpHandleCursorPageChange();
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

        // 並び替え機能を撤去したためチャンクナビゲーション系ショートカットは無効化
        // textarea のデフォルト動作（矢印キー・Backspace・Delete）に委譲
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
// ビューア → テキスト 一方向ジャンプ。suppress フラグで textarea → ビューアの逆同期を一時抑止
let _cpSyncSuppress = false;
function cpSyncToPage(pageNum) {
    if (!cpText) return;
    _cpSyncSuppress = true;
    try {
        if (cpIsEditing) {
            cpJumpInTextarea(pageNum, '');
        } else {
            cpJumpInSelectMode(pageNum, '');
        }
        cpUpdateCurrentPageBadge(pageNum);
        _cpLastReportedPage = pageNum;
        // PsDesign 風: 現在ページのテキストブロック表示パネルも追従
        cpRenderPageTextPanel(pageNum);
    } finally {
        // 直後の selectionchange / click イベントを取りこぼさないように次フレームで解除
        requestAnimationFrame(() => { _cpSyncSuppress = false; });
    }
}

// textarea のカーソル位置を監視し、所属ページが変わったらビューアを連動させる（逆同期）
let _cpLastReportedPage = null;
function cpHandleCursorPageChange() {
    if (_cpSyncSuppress) return;
    if (!cpEditTextArea) return;
    if (!cpText) return;
    const regions = cpScanPageRegions(cpEditTextArea.value);
    const page = cpPageForOffset(regions, cpEditTextArea.selectionStart);
    cpUpdateCurrentPageBadge(page);
    if (page === null) return;
    // ページが変わったら新パネルも追従描画（連動 OFF でもパネルは追従させる）
    const pageChanged = page !== _cpLastReportedPage;
    if (pageChanged) {
        _cpLastReportedPage = page;
        cpRenderPageTextPanel(page);
    }
    // 連動 ON のときだけビューアを動かす
    if (!window.viewerPageSyncEnabled) return;
    if (!pageChanged) return;
    if (typeof window.cpViewerJumpToPage === 'function') {
        window.cpViewerJumpToPage(page);
    }
}

// 現在ページバッジを更新（P{現在} / {全数}）
function cpUpdateCurrentPageBadge(pageOverride) {
    const badge = document.getElementById('cpCurrentPageBadge');
    if (!badge) return;
    if (!cpText || !cpEditTextArea) { badge.style.display = 'none'; return; }
    const regions = cpScanPageRegions(cpEditTextArea.value || cpText);
    const total = regions.length > 0 ? regions[regions.length - 1].page : 0;
    const offset = cpEditTextArea.selectionStart || 0;
    const current = (pageOverride != null) ? pageOverride : cpPageForOffset(regions, offset);
    if (!total || current == null) { badge.style.display = 'none'; return; }
    badge.style.display = '';
    badge.textContent = 'P' + current + ' / ' + total;
}

// ===== PsDesign 風: 現在ページのテキストブロック表示パネル =====
// 空行区切りで段落配列に分解（PsDesign txt-source.js の splitBlocksRaw 移植）
function cpSplitBlocksRaw(s) {
    if (!s) return [];
    return s
        .split(/\n\s*\n/)
        .map(p => p.replace(/^\n+|\n+$/g, ''))
        .filter(p => {
            if (!p.length) return false;
            const t = p.trim();
            // [XX巻] / ---------- 等のセパレータ行は段落として扱わない
            if (/^\[\d+巻\]$/.test(t)) return false;
            if (/^-{10}$/.test(t)) return false;
            // <<NPage>> マーカー単独行も除外（region 解析で既に消費されているが念のため）
            if (/^<<\s*[0-9０-９]+\s*Page\s*>>$/i.test(t)) return false;
            // [COMIC-POT] ヘッダ行も除外
            if (/^\[COMIC-POT(:\w+)?\]$/.test(t)) return false;
            return true;
        });
}

// 全テキストから Map<page, [{text, offset}]> を構築。offset は region.markerEnd を基点とした絶対オフセット
function cpBuildPageBlocks(text) {
    const map = new Map();
    if (!text) return map;
    const regions = cpScanPageRegions(text);
    for (const r of regions) {
        const slice = text.substring(r.markerEnd, r.end);
        const rawBlocks = cpSplitBlocksRaw(slice);
        if (!rawBlocks.length) continue;
        // 各ブロックの絶対オフセットを slice 内 indexOf で算出（同一段落が複数あっても先頭から順に進める）
        let searchFrom = 0;
        const blocks = rawBlocks.map(b => {
            const idx = slice.indexOf(b, searchFrom);
            const abs = (idx >= 0 ? idx : 0) + r.markerEnd;
            if (idx >= 0) searchFrom = idx + b.length;
            return { text: b, offset: abs };
        });
        if (!map.has(r.page)) map.set(r.page, []);
        map.get(r.page).push(...blocks);
    }
    return map;
}

// ブロック編集状態（cpRenderPageTextPanel より前に宣言して TDZ を回避）
let _cpEditingBlock = false;
let _cpEditingBlockEl = null;
// 表示モード: true=全ページ表示 / false=現在ページのみ（デフォルト: 全ページ）
let _cpShowAllPages = true;

function _cpUpdateTextFromEditorValue(updated) {
    cpEditTextArea.value = updated;
    cpText = updated;
    cpComicPotHeader = cpExtractComicPotHeader(updated);
    cpChunks = cpParseTextToChunks(updated);

    cpUpdateStatusBar();
    cpUpdateEditorFileRow();
    cpUpdateEditorFooter();
    cpUpdateEditorEmptyState();
    if (cpBtnCopy) cpBtnCopy.disabled = !cpText.trim();
    if (cpCopyBtnFloat) { cpCopyBtnFloat.style.display = 'flex'; cpCopyBtnFloat.disabled = !cpText.trim(); }
    if (cpBtnConvert) cpBtnConvert.disabled = !cpText.trim();
    cpUpdateToolbarState();
}

function _cpNormalizeEditorText(value) {
    return String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function _cpAutosizePageTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = Math.max(textarea.scrollHeight, 180) + 'px';
}

function _cpGetPageTextareaInfo(text, region) {
    const raw = text.substring(region.markerEnd, region.end);
    const leading = (raw.match(/^\n+/) || [''])[0].length;
    const trailing = (raw.match(/\n+$/) || [''])[0].length;
    const value = raw.substring(leading, raw.length - trailing);
    return { value, offset: region.markerEnd + leading };
}

function _cpReplacePageText(text, pageNum, pageContent) {
    const regions = cpScanPageRegions(text);
    const region = regions.find(r => r.page === pageNum);
    if (!region) return text;

    const before = text.substring(0, region.markerEnd);
    const after = text.substring(region.end);
    const normalizedPage = _cpNormalizeEditorText(pageContent).replace(/^\n+|\n+$/g, '');
    const prefix = region.markerEnd > region.start && !before.endsWith('\n') ? before + '\n' : before;
    const suffix = after && normalizedPage && !after.startsWith('\n') ? '\n' + after : after;
    return prefix + normalizedPage + suffix;
}

function _cpSyncTextareaSelection(textarea) {
    if (!textarea) return;
    _cpActiveChunkTextarea = textarea;
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    if (start === end) return;
    const blockOffset = parseInt(textarea.dataset.offset || '0', 10);
    _cpLastBlockSelection = {
        absStart: blockOffset + start,
        absEnd: blockOffset + end,
        text: textarea.value.substring(start, end),
    };
}

function _cpChunkRangesForPageText(value) {
    const text = _cpNormalizeEditorText(value);
    const rawBlocks = cpSplitBlocksRaw(text);
    let searchFrom = 0;
    return rawBlocks.map((block, index) => {
        const start = text.indexOf(block, searchFrom);
        const safeStart = start >= 0 ? start : searchFrom;
        const end = safeStart + block.length;
        searchFrom = end;
        const line = text.substring(0, safeStart).split('\n').length - 1;
        return { index, text: block, start: safeStart, end, line };
    });
}

function _cpRefreshPageEditorHandles(editor) {
    const textarea = editor && editor.querySelector ? editor.querySelector('.cp-page-textarea') : null;
    const gutter = editor && editor.querySelector ? editor.querySelector('.cp-page-text-gutter') : null;
    if (!textarea || !gutter) return;

    gutter.innerHTML = '';
    const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 21;
    const paddingTop = parseFloat(getComputedStyle(textarea).paddingTop) || 0;
    const chunks = _cpChunkRangesForPageText(textarea.value);
    chunks.forEach(chunk => {
        const handle = document.createElement('button');
        handle.type = 'button';
        handle.className = 'cp-text-chunk-handle cp-page-gutter-handle';
        handle.draggable = true;
        handle.dataset.chunkIndex = String(chunk.index);
        handle.dataset.pageNum = textarea.dataset.pageNum || '1';
        handle.title = 'ドラッグしてチャンクを並び替え';
        handle.setAttribute('aria-label', 'チャンクを並び替え');
        handle.textContent = '⋮⋮';
        handle.style.top = (paddingTop + chunk.line * lineHeight + 2) + 'px';

        handle.addEventListener('dragstart', (e) => {
            _cpEditingBlock = false;
            _cpEditingBlockEl = null;
            _cpDraggedTextChunk = { editor, index: chunk.index };
            handle.classList.add('dragging');
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(chunk.index));
            }
        });
        handle.addEventListener('dragend', () => {
            handle.classList.remove('dragging');
            _cpDraggedTextChunk = null;
            _cpClearChunkDropState();
        });
        handle.addEventListener('dragover', (e) => {
            if (!_cpDraggedTextChunk || _cpDraggedTextChunk.editor !== editor || _cpDraggedTextChunk.index === chunk.index) return;
            e.preventDefault();
            _cpClearChunkDropState();
            const rect = handle.getBoundingClientRect();
            const position = e.clientY > rect.top + rect.height / 2 ? 'after' : 'before';
            handle.classList.add(position === 'after' ? 'drop-after' : 'drop-before');
            _cpDragOverTextChunk = { editor, index: chunk.index, position };
        });
        handle.addEventListener('drop', (e) => {
            if (!_cpDraggedTextChunk || _cpDraggedTextChunk.editor !== editor) return;
            e.preventDefault();
            const target = _cpDragOverTextChunk || { editor, index: chunk.index, position: 'before' };
            _cpMoveChunkInPage(editor, _cpDraggedTextChunk.index, target.index, target.position);
            _cpDraggedTextChunk = null;
            _cpClearChunkDropState();
        });
        gutter.appendChild(handle);
    });
}

function _cpClearChunkDropState() {
    document.querySelectorAll('.cp-page-gutter-handle.drop-before, .cp-page-gutter-handle.drop-after').forEach(el => {
        el.classList.remove('drop-before', 'drop-after');
    });
    _cpDragOverTextChunk = null;
}

function _cpMoveChunkInPage(editor, fromIndex, toIndex, position) {
    const textarea = editor && editor.querySelector ? editor.querySelector('.cp-page-textarea') : null;
    if (!textarea) return;
    const chunks = _cpChunkRangesForPageText(textarea.value);
    if (!chunks[fromIndex] || !chunks[toIndex]) return;
    const moving = chunks[fromIndex].text;
    const reordered = chunks.map(c => c.text);
    reordered.splice(fromIndex, 1);
    let insertAt = toIndex;
    if (fromIndex < toIndex) insertAt -= 1;
    if (position === 'after') insertAt += 1;
    insertAt = Math.max(0, Math.min(reordered.length, insertAt));
    reordered.splice(insertAt, 0, moving);

    textarea.value = reordered.join('\n\n');
    _cpAutosizePageTextarea(textarea);
    _cpSyncPageTextareaToText(textarea);
    _cpRefreshPageEditorHandles(editor);
}

function _cpSyncPageTextareaToText(textarea) {
    if (!textarea || !cpEditTextArea) return;
    const pageNum = parseInt(textarea.dataset.pageNum || '1', 10);
    const updated = _cpReplacePageText(cpEditTextArea.value, pageNum, textarea.value);
    _cpUpdateTextFromEditorValue(updated);
    const regions = cpScanPageRegions(updated);
    const region = regions.find(r => r.page === pageNum);
    if (region) {
        const info = _cpGetPageTextareaInfo(updated, region);
        textarea.dataset.offset = String(info.offset);
    }
}

function _cpCreatePageEditorEl(region, targetPage) {
    const text = (cpEditTextArea && cpEditTextArea.value) ? cpEditTextArea.value : cpText;
    const info = _cpGetPageTextareaInfo(text, region);
    const section = document.createElement('div');
    section.className = 'cp-page-section';
    section.dataset.page = String(region.page);
    if (region.page === targetPage) section.classList.add('current-page');

    const hasMarker = region.markerEnd > region.start;
    if (hasMarker) {
        const header = document.createElement('div');
        header.className = 'cp-page-section-header';
        header.textContent = 'P' + region.page;
        section.appendChild(header);
    }

    const editor = document.createElement('div');
    editor.className = 'cp-page-plain-editor';
    editor.dataset.pageNum = String(region.page);

    const gutter = document.createElement('div');
    gutter.className = 'cp-page-text-gutter';

    const textarea = document.createElement('textarea');
    textarea.className = 'cp-page-textarea cp-page-textarea--plain';
    textarea.value = info.value;
    textarea.dataset.pageNum = String(region.page);
    textarea.dataset.offset = String(info.offset);
    textarea.spellcheck = false;
    textarea.rows = Math.max(8, info.value.split('\n').length + 1);

    editor.appendChild(gutter);
    editor.appendChild(textarea);
    section.appendChild(editor);

    requestAnimationFrame(() => {
        _cpAutosizePageTextarea(textarea);
        _cpRefreshPageEditorHandles(editor);
    });

    textarea.addEventListener('focus', () => {
        _cpEditingBlock = true;
        _cpEditingBlockEl = textarea;
        _cpActiveChunkTextarea = textarea;
    });
    textarea.addEventListener('select', () => _cpSyncTextareaSelection(textarea));
    textarea.addEventListener('keyup', () => _cpSyncTextareaSelection(textarea));
    textarea.addEventListener('mouseup', () => _cpSyncTextareaSelection(textarea));
    textarea.addEventListener('input', () => {
        _cpAutosizePageTextarea(textarea);
        _cpSyncPageTextareaToText(textarea);
        _cpRefreshPageEditorHandles(editor);
    });
    textarea.addEventListener('blur', () => {
        _cpEditingBlock = false;
        _cpEditingBlockEl = null;
        _cpSyncPageTextareaToText(textarea);
        _cpRefreshPageEditorHandles(editor);
    });
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.stopPropagation();
        }
    });

    return section;
}

function cpRenderPageTextPanel(pageNum) {
    const body = document.getElementById('cpPageTextPanelBody');
    if (!body) return;
    if (_cpEditingBlock) return;

    if (!cpText) {
        body.innerHTML = '';
        return;
    }

    const text = (cpEditTextArea && cpEditTextArea.value) ? cpEditTextArea.value : cpText;
    const regions = cpScanPageRegions(text);
    const hasMarkers = regions.length > 1 || (regions.length === 1 && regions[0].markerEnd > 0);
    const targetPage = (pageNum != null) ? pageNum : (regions[0] ? regions[0].page : 1);

    body.innerHTML = '';

    if (_cpShowAllPages && hasMarkers) {
        regions.forEach(region => {
            body.appendChild(_cpCreatePageEditorEl(region, targetPage));
        });
        if (pageNum != null) {
            const targetSec = body.querySelector('.cp-page-section[data-page="' + targetPage + '"]');
            if (targetSec && typeof targetSec.scrollIntoView === 'function') {
                targetSec.scrollIntoView({ block: 'start', behavior: 'smooth' });
            }
        }
    } else {
        const region = regions.find(r => r.page === targetPage) || regions[0];
        if (!region) return;
        body.appendChild(_cpCreatePageEditorEl(region, targetPage));
        body.scrollTop = 0;
    }
}

function cpSetPageMode(mode) {
    _cpShowAllPages = (mode !== 'single');
    const allBtn = document.getElementById('cpPageModeAll');
    const singleBtn = document.getElementById('cpPageModeSingle');
    if (allBtn) allBtn.classList.toggle('active', _cpShowAllPages);
    if (singleBtn) singleBtn.classList.toggle('active', !_cpShowAllPages);
    cpRenderPageTextPanel(_cpLastReportedPage);
    // ページごとモードに入ったら、方向キーでのページ移動が即座に効くようパネル本体へフォーカス
    if (!_cpShowAllPages) {
        const body = document.getElementById('cpPageTextPanelBody');
        if (body && typeof body.focus === 'function') {
            try { body.focus({ preventScroll: true }); } catch (e) { body.focus(); }
        }
    }
}

// 後方互換: 旧チェックボックス時代の関数名。現在は cpSetPageMode のラッパーとしてトグル動作。
function cpToggleShowAllPages() {
    cpSetPageMode(_cpShowAllPages ? 'single' : 'all');
}

// 方向キーでのページ移動（全ページ表示 OFF 時、cp-editor-column 内にフォーカスがあるとき）
function cpEditorColumnKeydown(e) {
    let dir = 0;
    switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':   dir = -1; break;
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown': dir = 1;  break;
        default: return;
    }

    // ブロック編集中: ビューア側の document keydown ハンドラへ伝播させない
    // （contentEditable は input/textarea/select 判定をすり抜け、ページが勝手に変わってしまうため）。
    // ブロック内のカーソル移動はブラウザの既定動作に任せる。
    if (_cpEditingBlock) { e.stopPropagation(); return; }

    if (_cpShowAllPages) return;                       // 全ページ表示時は通常挙動
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (e.target && e.target.matches && e.target.matches('input, textarea, select')) return;
    if (!cpText) return;

    const text = (cpEditTextArea && cpEditTextArea.value) ? cpEditTextArea.value : cpText;
    const regions = cpScanPageRegions(text);
    if (!regions || regions.length === 0) return;
    const pages = [...new Set(regions.map(r => r.page))].sort((a, b) => a - b);
    if (pages.length < 2) return;

    const cur = (_cpLastReportedPage != null) ? _cpLastReportedPage : pages[0];
    let idx = pages.indexOf(cur);
    if (idx < 0) idx = 0;
    const newIdx = dir > 0 ? Math.min(pages.length - 1, idx + 1) : Math.max(0, idx - 1);

    e.preventDefault();
    e.stopPropagation();
    if (newIdx === idx) return;

    const newPage = pages[newIdx];
    _cpLastReportedPage = newPage;
    cpRenderPageTextPanel(newPage);
    cpUpdateCurrentPageBadge(newPage);
    // 連動 ON のときはビューア画像もジャンプ（OFF のときはテキスト側のみ更新）
    if (window.viewerPageSyncEnabled && typeof window.cpViewerJumpToPage === 'function') {
        window.cpViewerJumpToPage(newPage);
    }
}

// ブロックの編集内容を textarea / cpText に反映
function cpCommitPageTextBlock(pageNum, blockIdx, el) {
    if (!cpEditTextArea) return;
    const textarea = el && el.matches && el.matches('.cp-page-textarea') ? el : (el && el.querySelector ? el.querySelector('.cp-page-textarea') : null);
    if (!textarea) return;
    _cpSyncPageTextareaToText(textarea);
    _cpLastBlockSelection = null;
    cpRenderPageTextPanel(_cpLastReportedPage);
}

function cpPageTextPanelToggle() {
    const panel = document.getElementById('cpPageTextPanel');
    if (!panel) return;
    const collapsed = panel.classList.toggle('collapsed');
    try { localStorage.setItem('cpPageTextPanelCollapsed', collapsed ? '1' : '0'); } catch (e) {}
}

// 初期化: localStorage の状態を復元 + トグルチェックボックスと JS 状態を同期
function cpInitPageTextPanel() {
    const panel = document.getElementById('cpPageTextPanel');
    if (!panel) return;
    try {
        if (localStorage.getItem('cpPageTextPanelCollapsed') === '1') {
            panel.classList.add('collapsed');
        }
    } catch (e) {}
    // セグメントタブの初期状態（HTML の .active）を真実の源とし、JS 状態と同期
    const allBtn = document.getElementById('cpPageModeAll');
    const singleBtn = document.getElementById('cpPageModeSingle');
    if (allBtn && singleBtn) {
        _cpShowAllPages = allBtn.classList.contains('active') || !singleBtn.classList.contains('active');
        allBtn.classList.toggle('active', _cpShowAllPages);
        singleBtn.classList.toggle('active', !_cpShowAllPages);
    }
    // 方向キーでのページ移動ハンドラを cp-editor-column に登録（冪等）
    const column = document.getElementById('cpEditorColumn');
    if (column && !column.dataset.arrowNavBound) {
        column.addEventListener('keydown', cpEditorColumnKeydown);
        column.dataset.arrowNavBound = '1';
    }
}

// テキスト編集中の再描画 debounce
let _cpPageTextPanelDebounce = null;
function cpSchedulePageTextPanelRender() {
    if (_cpPageTextPanelDebounce) clearTimeout(_cpPageTextPanelDebounce);
    _cpPageTextPanelDebounce = setTimeout(() => {
        _cpPageTextPanelDebounce = null;
        cpRenderPageTextPanel(_cpLastReportedPage);
    }, 200);
}

// ES Module exports
export { cpInitDomRefs, goToComicPotEditor, cpGoHomeFromEditor, cpLoadSerifText, cpApplySerifFile, cpLoadAllSerifText, cpOpenSerifSelectModal, cpCloseSerifSelectModal, cpLoadFromHandoff, goBackFromComicPotEditor, cpGoToProofreading, cpShowSaveConfirm, cpCloseSaveConfirm, cpSaveConfirmAction, cpToggleResultPanel, cpShowResultPanel, cpHideResultPanel, cpSwitchPanelTab, goToResultViewerPageFromEditor, cpRenderPanelContent, cpSetupPanelCategoryFilter, cpApplyPanelCategoryFilter, cpSetupResizeHandle, cpJumpToExcerpt, cpJumpInTextarea, cpJumpInSelectMode, cpSyncToPage, cpScanPageRegions, cpPageForOffset, cpUpdateCurrentPageBadge, cpHandleCursorPageChange, cpShowNotify, cpParseTextToChunks, cpExtractComicPotHeader, cpReconstructText, cpRender, cpUpdateToolbarState, cpRenderSelectMode, cpRenderChunkContent, cpScrollToSelected, cpUpdateStatusBar, cpHandleFileOpen, cpHandleTextFileOpen, cpHandleFileSave, cpHandleFileSaveAs, cpHandleCopy, cpFallbackCopy, cpToggleDeleteMark, cpOpenRubyModal, cpCloseRubyModal, cpApplyRuby, cpSwitchRubyMode, cpOpenConvertModal, cpCloseConvertModal, cpUpdateConvertPreview, cpApplyConvert, cpHandleChunkClick, cpMoveChunkUp, cpMoveChunkDown, cpSelectPreviousChunk, cpSelectNextChunk, cpDeleteSelectedChunk, cpHandleDragStart, cpHandleDragEnd, cpHandleDragOverChunk, cpHandleDragLeaveChunk, cpHandleDropChunk, cpToggleEditMode, cpGetChunkIndexFromCursorPosition, cpSetupEventListeners, cpLoadCalibrationData, cpLoadResultJson, cpSaveResultJson, cpOpenJsonBrowser, cpCloseJsonBrowser, cpJsonBrowserNavigate, cpJsonBrowserSelect, cpJsonBrowserOpen, cpJsonBrowserFilter, cpJsonBrowserClearSearch, cpJsonBrowserGoUp, cpJsonBrowserRefresh, cpJsonBrowserOpenFolder, cpJsonBrowserOpenFile, cpJsonBrowserLoadFolder, cpSplitBlocksRaw, cpBuildPageBlocks, cpRenderPageTextPanel, cpCommitPageTextBlock, cpPageTextPanelToggle, cpInitPageTextPanel, cpToggleShowAllPages, cpSetPageMode };

// Expose to window for inline HTML handlers
Object.assign(window, { cpInitDomRefs, goToComicPotEditor, cpGoHomeFromEditor, cpLoadSerifText, cpApplySerifFile, cpLoadAllSerifText, cpOpenSerifSelectModal, cpCloseSerifSelectModal, cpLoadFromHandoff, goBackFromComicPotEditor, cpGoToProofreading, cpShowSaveConfirm, cpCloseSaveConfirm, cpSaveConfirmAction, cpToggleResultPanel, cpShowResultPanel, cpHideResultPanel, cpSwitchPanelTab, goToResultViewerPageFromEditor, cpRenderPanelContent, cpSetupPanelCategoryFilter, cpApplyPanelCategoryFilter, cpSetupResizeHandle, cpJumpToExcerpt, cpJumpInTextarea, cpJumpInSelectMode, cpSyncToPage, cpScanPageRegions, cpPageForOffset, cpUpdateCurrentPageBadge, cpHandleCursorPageChange, cpShowNotify, cpParseTextToChunks, cpExtractComicPotHeader, cpReconstructText, cpRender, cpUpdateToolbarState, cpRenderSelectMode, cpRenderChunkContent, cpScrollToSelected, cpUpdateStatusBar, cpHandleFileOpen, cpHandleTextFileOpen, cpHandleFileSave, cpHandleFileSaveAs, cpHandleCopy, cpFallbackCopy, cpToggleDeleteMark, cpOpenRubyModal, cpCloseRubyModal, cpApplyRuby, cpSwitchRubyMode, cpOpenConvertModal, cpCloseConvertModal, cpUpdateConvertPreview, cpApplyConvert, cpHandleChunkClick, cpMoveChunkUp, cpMoveChunkDown, cpSelectPreviousChunk, cpSelectNextChunk, cpDeleteSelectedChunk, cpHandleDragStart, cpHandleDragEnd, cpHandleDragOverChunk, cpHandleDragLeaveChunk, cpHandleDropChunk, cpToggleEditMode, cpGetChunkIndexFromCursorPosition, cpSetupEventListeners, cpLoadCalibrationData, cpLoadResultJson, cpSaveResultJson, cpOpenJsonBrowser, cpCloseJsonBrowser, cpJsonBrowserNavigate, cpJsonBrowserSelect, cpJsonBrowserOpen, cpJsonBrowserFilter, cpJsonBrowserClearSearch, cpJsonBrowserGoUp, cpJsonBrowserRefresh, cpJsonBrowserOpenFolder, cpJsonBrowserOpenFile, cpJsonBrowserLoadFolder, cpSplitBlocksRaw, cpBuildPageBlocks, cpRenderPageTextPanel, cpCommitPageTextBlock, cpPageTextPanelToggle, cpInitPageTextPanel, cpToggleShowAllPages, cpSetPageMode });
