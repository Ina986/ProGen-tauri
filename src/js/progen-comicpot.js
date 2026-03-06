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

// ===== COMIC-POT スプリットビュー =====
let cpResultPanelVisible = false;
let cpPanelCurrentTab = 'simple';
let cpPanelWidthPercent = 50;
let cpIsResizing = false;

// ===== COMIC-POT DOM要素（遅延取得） =====
let cpEditTextArea, cpSelectModeEl, cpMoveButtonsEl, cpMoveCounterEl;
let cpBtnMoveUp, cpBtnMoveDown, cpBtnCopy, cpBtnToggleMode;
let cpBtnDeleteMark, cpBtnRuby, cpBtnConvert, cpBtnSave, cpBtnSaveAs;
let cpCopyBtnFloat, cpStatusCopyBtn, cpStatusInfo, cpFileNameDisplay;
let cpContextBar, cpContextModeLabel, cpContextModeHint;
let cpNotificationEl, cpNotificationInner;
let cpResultPanelEl, cpResultPanelBody, cpEditorColumn, cpResizeHandle;
let cpBtnTogglePanel, cpPanelSep, cpPanelTabVariation, cpPanelTabSimple, cpPanelCategoryFilter;

function cpInitDomRefs() {
    cpEditTextArea = document.getElementById('cpEditTextArea');
    cpSelectModeEl = document.getElementById('cpSelectMode');
    cpMoveButtonsEl = document.getElementById('cpMoveButtons');
    cpMoveCounterEl = document.getElementById('cpMoveCounter');
    cpBtnMoveUp = document.getElementById('cpBtnMoveUp');
    cpBtnMoveDown = document.getElementById('cpBtnMoveDown');
    cpBtnCopy = document.getElementById('cpBtnCopy');
    cpBtnToggleMode = document.getElementById('cpBtnToggleMode');
    cpBtnDeleteMark = document.getElementById('cpBtnDeleteMark');
    cpBtnRuby = document.getElementById('cpBtnRuby');
    cpBtnConvert = document.getElementById('cpBtnConvert');
    cpBtnSave = document.getElementById('cpBtnSave');
    cpBtnSaveAs = document.getElementById('cpBtnSaveAs');
    cpCopyBtnFloat = document.getElementById('cpCopyBtnFloat');
    cpContextBar = document.getElementById('cpContextBar');
    cpContextModeLabel = document.getElementById('cpContextModeLabel');
    cpContextModeHint = document.getElementById('cpContextModeHint');
    cpStatusCopyBtn = document.getElementById('cpStatusCopyBtn');
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
function goToComicPotEditor(source) {
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
    } else if (cpSourcePage === 'extraction' && state.manuscriptTxtFiles.length > 0) {
        cpBtnLoadSerif.style.display = '';
    } else {
        cpBtnLoadSerif.style.display = 'none';
    }

    // スプリットビュー: トグルボタンは常に表示（どのソースからでも校正パネルを開けるように）
    cpBtnTogglePanel.style.display = '';
    cpPanelSep.style.display = '';

    if (cpSourcePage === 'proofreading') {
        // 校正ページからの遷移時はデータがあれば自動表示
        if (Object.keys(state.currentVariationData).length > 0 || state.currentSimpleData.length > 0) {
            cpShowResultPanel();
        }
    } else {
        // extraction/handoff時はパネルを閉じた状態でスタート
        cpHideResultPanel();
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
function cpLoadFromHandoff(data) {
    let content = data.content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (content.charCodeAt(0) === 0xFEFF) content = content.substring(1); // BOM除去
    cpText = content;
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
    cpBtnTogglePanel.classList.add('cp-panel-active');

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
    cpRenderPanelContent();
    cpSetupPanelCategoryFilter();
}

function goToResultViewerPageFromEditor() {
    goToResultViewerPage();
}

function cpRenderPanelContent() {
    if (!cpResultPanelBody) return;

    if (cpPanelCurrentTab === 'variation') {
        if (Object.keys(state.currentVariationData).length > 0) {
            renderCategoryTablesToElement(state.currentVariationData, cpResultPanelBody);
        } else {
            cpResultPanelBody.innerHTML = '<div style="text-align:center; padding:40px;">'
                + '<p style="color:#999; margin-bottom:16px;">提案チェックのデータがありません</p>'
                + '<button class="btn btn-purple btn-small" onclick="openResultPasteModalFor(\'variation\')" style="margin-top:8px;">'
                + '<span class="svg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span> 貼り付け</button>'
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

    // 元のtextareaに適用（表示領域の中央に来るよう半分戻す）
    textarea.scrollTop = Math.max(0, scrollPos - textarea.clientHeight / 14);
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
    // [X巻YP] → ページYに設定, <<XPage>> → ページXに設定, ---------- → +1
    for (let i = 0; i < lines.length; i++) {
        const trimmedLine = lines[i].trim();
        const pageHeaderMatch = trimmedLine.match(/^\[(\d+)巻(\d+)P\]$/);
        const exportPageMatch = trimmedLine.match(/^<<(\d+)Page>>$/);
        const isDash = /^-{10}$/.test(trimmedLine);

        if (pageHeaderMatch || exportPageMatch || isDash) {
            let nextPage;
            if (pageHeaderMatch) {
                nextPage = parseInt(pageHeaderMatch[2], 10);
            } else if (exportPageMatch) {
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

    // ミラーdivでスクロール位置を正確に計算
    scrollTextareaToPosition(cpEditTextArea, targetPos);
    cpEditTextArea.focus();
    cpEditTextArea.setSelectionRange(targetPos, targetEnd);

    // 3秒後に選択解除
    clearTimeout(cpJumpHighlightTimer);
    cpJumpHighlightTimer = setTimeout(() => {
        const pos = cpEditTextArea.selectionEnd;
        cpEditTextArea.setSelectionRange(pos, pos);
    }, 3000);
}

function cpJumpInSelectMode(pageNum, searchText) {
    // チャンクからページを特定
    // [X巻YP] → ページYに設定, <<XPage>> → ページXに設定, ---------- → +1
    let currentPage = 1;
    let targetChunkIndex = -1;

    for (let i = 0; i < cpChunks.length; i++) {
        const chunk = cpChunks[i];
        if (chunk.type === 'separator') {
            const pageHeaderMatch = chunk.content.match(/^\[(\d+)巻(\d+)P\]$/);
            const exportPageMatch = chunk.content.match(/^<<(\d+)Page>>$/);

            if (pageHeaderMatch) {
                currentPage = parseInt(pageHeaderMatch[2], 10);
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

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

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
function cpShowNotify(message, color) {
    clearTimeout(cpNotifyTimer);
    cpNotificationInner.style.background = color || '#16a34a';
    cpNotificationInner.textContent = message;
    cpNotificationEl.classList.add('show');
    cpNotifyTimer = setTimeout(() => cpNotificationEl.classList.remove('show'), 1500);
}

// ===== パース =====
function cpParseTextToChunks(inputText) {
    if (!inputText) return [];

    const lines = inputText.split('\n');
    const parsed = [];
    let currentChunk = [];

    const pageHeaderPattern = /^\[\d+巻\d+P\]$/;
    const exportPagePattern = /^<<\d+Page>>$/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed.match(/^\[COMIC-POT(:\w+)?\]$/)) {
            continue;
        }

        if (pageHeaderPattern.test(trimmed) || exportPagePattern.test(trimmed)) {
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
    cpCopyBtnFloat.style.display = hasText ? 'block' : 'none';
    cpStatusCopyBtn.style.display = hasText ? 'inline-block' : 'none';

    // コンテキストバー更新
    cpContextBar.style.display = hasText ? 'flex' : 'none';
    if (cpIsEditing) {
        cpContextBar.classList.add('editing');
        cpContextModeLabel.textContent = '編集モード';
        cpContextModeHint.textContent = '▸ 選択モードへ';
        cpBtnDeleteMark.style.display = 'none';
        cpBtnRuby.style.display = 'inline-block';
    } else {
        cpContextBar.classList.remove('editing');
        cpContextModeLabel.textContent = '選択モード';
        cpContextModeHint.textContent = '▸ 編集モードへ';
        cpBtnDeleteMark.style.display = 'inline-block';
        cpBtnRuby.style.display = 'none';
    }

    cpUpdateToolbarState();

    if (cpIsEditing) {
        cpEditTextArea.style.display = 'block';
        cpSelectModeEl.style.display = 'none';
        cpEditTextArea.value = cpText;
        cpMoveButtonsEl.style.display = 'none';
    } else {
        cpEditTextArea.style.display = 'none';
        cpSelectModeEl.style.display = 'block';
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
        const ph = document.createElement('span');
        ph.style.color = '#6b7280';
        ph.style.fontSize = '13px';
        ph.textContent = 'テキストファイルを「ファイル」から開くか、編集モードでテキストを入力...';
        cpSelectModeEl.appendChild(ph);
        cpMoveButtonsEl.style.display = 'none';
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

    // 移動ボタン
    if (cpSelectedChunkIndex !== null && cpChunks[cpSelectedChunkIndex] && cpChunks[cpSelectedChunkIndex].type === 'dialogue') {
        cpMoveButtonsEl.style.display = 'flex';
        cpBtnMoveUp.disabled = cpSelectedChunkIndex === 0;
        cpBtnMoveDown.disabled = cpSelectedChunkIndex === cpChunks.length - 1;
        let cnt = 0;
        for (let i = 0; i <= cpSelectedChunkIndex; i++) {
            if (cpChunks[i].type === 'dialogue') cnt++;
        }
        cpMoveCounterEl.textContent = cnt;
    } else {
        cpMoveButtonsEl.style.display = 'none';
    }

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
            cpShowNotify('保存しました: ' + cpFileName, '#16a34a');
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
        // ファイル名を更新
        const parts = dialogResult.filePath.replace(/\\/g, '/').split('/');
        cpFileName = parts[parts.length - 1];
        cpFileNameDisplay.textContent = cpFileName;
        cpShowNotify('保存しました: ' + cpFileName, '#16a34a');
    } else {
        cpShowNotify('保存に失敗しました', '#ef4444');
    }
}

// ===== コピー =====
function cpHandleCopy() {
    if (!cpText || cpText.trim() === '') return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(cpText).then(() => {
            cpShowNotify('コピーしました！', '#16a34a');
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
    try { document.execCommand('copy'); cpShowNotify('コピーしました！', '#16a34a'); }
    catch (e) { alert('コピーに失敗しました。'); }
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
    document.getElementById('cpRubyResultPreview').textContent = '[' + selected + '](...)';

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

    const before = cpEditTextArea.value.substring(0, cpRubySelectionStart);
    const after = cpEditTextArea.value.substring(cpRubySelectionEnd);
    const replacement = '[' + cpRubySelectedText + '](' + rubyText + ')';

    const newText = before + replacement + after;
    const scrollTop = cpEditTextArea.scrollTop;
    cpEditTextArea.value = newText;

    let content = newText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
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
    let preview = header + '\n\n';
    let pageNum = startPage;
    let isFirst = true;

    for (const chunk of cpChunks) {
        if (chunk.type === 'separator') {
            if (!isFirst) {
                pageNum++;
            }
            preview += '[' + volume + '巻' + pageNum + 'P]\n';
            isFirst = false;
        } else {
            if (isFirst) {
                preview += '[' + volume + '巻' + pageNum + 'P]\n';
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

    const newChunks = [];
    let pageNum = startPage;
    let isFirst = true;

    for (const chunk of cpChunks) {
        if (chunk.type === 'separator') {
            if (!isFirst) {
                pageNum++;
            }
            newChunks.push({
                content: '[' + volume + '巻' + pageNum + 'P]',
                type: 'separator'
            });
            isFirst = false;
        } else {
            if (isFirst) {
                newChunks.push({
                    content: '[' + volume + '巻' + pageNum + 'P]',
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

    // テキストエリア入力
    cpEditTextArea.addEventListener('input', () => {
        let content = cpEditTextArea.value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        cpComicPotHeader = cpExtractComicPotHeader(content);
        cpText = content;
        cpChunks = cpParseTextToChunks(content);
        cpUpdateStatusBar();
        const hasText = cpText && cpText.trim() !== '';
        cpBtnCopy.disabled = !hasText;
        cpCopyBtnFloat.style.display = hasText ? 'block' : 'none';
        cpStatusCopyBtn.style.display = hasText ? 'inline-block' : 'none';
        cpBtnConvert.disabled = !hasText;
    });

    // ルビ入力のリアルタイムプレビュー
    document.getElementById('cpRubyInput').addEventListener('input', () => {
        const ruby = document.getElementById('cpRubyInput').value;
        const preview = document.getElementById('cpRubyResultPreview');
        if (ruby) {
            preview.textContent = '[' + cpRubySelectedText + '](' + ruby + ')';
        } else {
            preview.textContent = '[' + cpRubySelectedText + '](...)';
        }
    });

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

// ES Module exports
export { cpInitDomRefs, goToComicPotEditor, cpLoadSerifText, cpApplySerifFile, cpLoadAllSerifText, cpOpenSerifSelectModal, cpCloseSerifSelectModal, cpLoadFromHandoff, goBackFromComicPotEditor, cpToggleResultPanel, cpShowResultPanel, cpHideResultPanel, cpSwitchPanelTab, goToResultViewerPageFromEditor, cpRenderPanelContent, cpSetupPanelCategoryFilter, cpApplyPanelCategoryFilter, cpSetupResizeHandle, cpJumpToExcerpt, cpJumpInTextarea, cpJumpInSelectMode, cpShowNotify, cpParseTextToChunks, cpExtractComicPotHeader, cpReconstructText, cpRender, cpUpdateToolbarState, cpRenderSelectMode, cpRenderChunkContent, cpScrollToSelected, cpUpdateStatusBar, cpHandleFileOpen, cpHandleFileSave, cpHandleFileSaveAs, cpHandleCopy, cpFallbackCopy, cpToggleDeleteMark, cpOpenRubyModal, cpCloseRubyModal, cpApplyRuby, cpOpenConvertModal, cpCloseConvertModal, cpUpdateConvertPreview, cpApplyConvert, cpHandleChunkClick, cpMoveChunkUp, cpMoveChunkDown, cpSelectPreviousChunk, cpSelectNextChunk, cpDeleteSelectedChunk, cpHandleDragStart, cpHandleDragEnd, cpHandleDragOverChunk, cpHandleDragLeaveChunk, cpHandleDropChunk, cpToggleEditMode, cpGetChunkIndexFromCursorPosition, cpSetupEventListeners };

// Expose to window for inline HTML handlers
Object.assign(window, { cpInitDomRefs, goToComicPotEditor, cpLoadSerifText, cpApplySerifFile, cpLoadAllSerifText, cpOpenSerifSelectModal, cpCloseSerifSelectModal, cpLoadFromHandoff, goBackFromComicPotEditor, cpToggleResultPanel, cpShowResultPanel, cpHideResultPanel, cpSwitchPanelTab, goToResultViewerPageFromEditor, cpRenderPanelContent, cpSetupPanelCategoryFilter, cpApplyPanelCategoryFilter, cpSetupResizeHandle, cpJumpToExcerpt, cpJumpInTextarea, cpJumpInSelectMode, cpShowNotify, cpParseTextToChunks, cpExtractComicPotHeader, cpReconstructText, cpRender, cpUpdateToolbarState, cpRenderSelectMode, cpRenderChunkContent, cpScrollToSelected, cpUpdateStatusBar, cpHandleFileOpen, cpHandleFileSave, cpHandleFileSaveAs, cpHandleCopy, cpFallbackCopy, cpToggleDeleteMark, cpOpenRubyModal, cpCloseRubyModal, cpApplyRuby, cpOpenConvertModal, cpCloseConvertModal, cpUpdateConvertPreview, cpApplyConvert, cpHandleChunkClick, cpMoveChunkUp, cpMoveChunkDown, cpSelectPreviousChunk, cpSelectNextChunk, cpDeleteSelectedChunk, cpHandleDragStart, cpHandleDragEnd, cpHandleDragOverChunk, cpHandleDragLeaveChunk, cpHandleDropChunk, cpToggleEditMode, cpGetChunkIndexFromCursorPosition, cpSetupEventListeners });
