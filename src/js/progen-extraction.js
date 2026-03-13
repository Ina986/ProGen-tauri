/* =========================================
   レーベル選択ポップアップ
   ========================================= */
import { state } from './progen-state.js';
let currentLabelSelectMode = 'extraction'; // 'extraction', 'proofreading', or 'landing'

// レーベル選択ポップアップを開く
function openLabelSelectModal(mode) {
    currentLabelSelectMode = mode;
    const modal = document.getElementById('labelSelectModal');
    modal.style.display = 'flex';

    // 現在選択中のレーベルをハイライト
    let currentLabel = '';
    if (mode === 'extraction') {
        currentLabel = document.getElementById('labelSelector').value;
    } else if (mode === 'proofreading' || mode === 'comicpot-proofreading') {
        currentLabel = document.getElementById('proofreadingLabelSelect').value;
    } else if (mode === 'landing') {
        currentLabel = document.getElementById('landingLabelSelect').value;
    }

    document.querySelectorAll('.label-select-btn').forEach(btn => {
        btn.classList.remove('selected');
        if (btn.getAttribute('data-label') === currentLabel) {
            btn.classList.add('selected');
        }
    });
}

// レーベル選択ポップアップを閉じる
function closeLabelSelectModal() {
    document.getElementById('labelSelectModal').style.display = 'none';
    state.pendingNewCreationMode = null;
    state._cpPendingProofreadingTransition = null;
}

// ポップアップからレーベルを選択
async function selectLabelFromPopup(label) {
    if (currentLabelSelectMode === 'extraction') {
        // 抽出ページ
        document.getElementById('labelSelector').value = label;
        const textEl = document.getElementById('labelSelectorText');
        textEl.textContent = label;
        textEl.classList.remove('unselected');
        closeLabelSelectModal();
        await changeLabel();

        // 添付ファイルトグルのロックを解除
        if (typeof enableDataTypeToggle === 'function') enableDataTypeToggle();

        // Geminiボタンのロックを解除
        const geminiBtn = document.getElementById('extractionGeminiBtn');
        if (geminiBtn) {
            geminiBtn.removeAttribute('disabled');
        }
    } else if (currentLabelSelectMode === 'proofreading') {
        // 校正ページ
        document.getElementById('proofreadingLabelSelect').value = label;
        const textEl = document.getElementById('proofreadingLabelSelectorText');
        textEl.textContent = label;
        textEl.classList.remove('unselected');
        closeLabelSelectModal();
        await changeProofreadingLabel();
    } else if (currentLabelSelectMode === 'comicpot-proofreading') {
        // テキストエディタ → 校正プロンプト遷移時のレーベル選択
        document.getElementById('proofreadingLabelSelect').value = label;
        const textEl = document.getElementById('proofreadingLabelSelectorText');
        textEl.textContent = label;
        textEl.classList.remove('unselected');
        // コールバックを退避してからモーダルを閉じる（closeでクリアされるため）
        const fn = state._cpPendingProofreadingTransition;
        closeLabelSelectModal();
        await changeProofreadingLabel();
        if (fn) fn();
    } else if (currentLabelSelectMode === 'landing') {
        // ランディング画面 → レーベル選択後に即ページ遷移
        document.getElementById('landingLabelSelect').value = label;
        const mode = state.pendingNewCreationMode;
        state.pendingNewCreationMode = null;
        document.getElementById('labelSelectModal').style.display = 'none';
        if (mode === 'extraction') {
            await startExtraction();
        } else if (mode === 'formatting') {
            await startFormatting();
        } else if (mode === 'proofreading') {
            await startProofreading();
        }
    }
}

// レーベル選択ボタンのテキストを更新
function updateLabelSelectorButtonText(label) {
    const extractionText = document.getElementById('labelSelectorText');
    const proofreadingText = document.getElementById('proofreadingLabelSelectorText');

    if (extractionText) extractionText.textContent = label || '選択してください';
    if (proofreadingText) proofreadingText.textContent = label || '選択してください';
}

// レーベル切り替え
async function changeLabel() {
    const label = document.getElementById('labelSelector').value;
    await loadMasterRule(label);
    // 検索クリア（サイドバー検索がある場合）
    const searchBox = document.getElementById('searchBox');
    const sidebarSearch = document.getElementById('sidebarSearchInput');
    if (searchBox) searchBox.value = '';
    if (sidebarSearch) sidebarSearch.value = '';
    currentSearchText = '';
    renderTable();
    refreshCurrentView();
    generateXML();

    // ボタンテキスト更新
    updateLabelSelectorButtonText(label);
}

// 検索フィルタリング＆カード再描画
function filterRules() {
    renderEditCardMode();
}

// カテゴリ定義（グローバル）
const editCategories = [
    { key: 'symbol', name: '記号・句読点', icon: '<span class="svg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg></span>', isSymbol: true },
    { key: 'notation', name: '表記変更', icon: '<span class="svg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span>', subCategories: ['basic', 'recommended'] },
    { key: 'difficult', name: '難読文字', icon: '<span class="svg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg></span>' },
    { key: 'number', name: '数字', icon: '<span class="svg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg></span>', isNumber: true },
    { key: 'pronoun', name: '人称', icon: '<span class="svg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>' },
    { key: 'character', name: '人物名', icon: '<span class="svg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg></span>' }
];

// currentEditCategory は state に移動済み
// 表記変更カテゴリ内のフィルター ('all', 'basic', 'recommended')
let currentNotationFilter = 'all';

// 検索テキスト（サイドバー用）
let currentSearchText = '';

// 編集モード - サイドバー＋メイン描画
function renderEditCardMode() {
    const grid = document.getElementById('editCardGrid');
    const filterText = currentSearchText.toLowerCase();

    grid.innerHTML = '';

    // サイドバー生成
    const sidebar = document.createElement('aside');
    sidebar.className = 'edit-sidebar';

    // ビュー切り替え（サイドバー上部）
    const viewToggle = document.createElement('div');
    viewToggle.className = 'sidebar-view-toggle';
    viewToggle.innerHTML = `
        <button class="sidebar-view-btn active" data-view="edit">
            <span class="svg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg></span>
            カード
        </button>
        <button class="sidebar-view-btn" data-view="list" onclick="toggleViewMode()">
            <span class="svg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg></span>
            一覧
        </button>
    `;
    sidebar.appendChild(viewToggle);

    editCategories.forEach(cat => {
        // ルール数カウント
        let activeCount, totalCount;
        if (cat.isNumber) {
            activeCount = state.numberSubRulesEnabled ? 4 : 1;
            totalCount = 4;
        } else {
            let rules;
            if (cat.isSymbol) {
                rules = state.symbolRules;
            } else if (cat.subCategories) {
                rules = state.currentProofRules.filter(r => cat.subCategories.includes(r.category));
            } else {
                rules = state.currentProofRules.filter(r => r.category === cat.key);
            }
            if (cat.key === 'difficult') {
                activeCount = rules.filter(r => r.userAdded ? (r.mode && r.mode !== 'none') : true).length;
            } else {
                activeCount = rules.filter(r => r.active).length;
            }
            totalCount = rules.length;
        }

        const btn = document.createElement('button');
        btn.className = 'edit-sidebar-item' + (state.currentEditCategory === cat.key ? ' active' : '');
        btn.setAttribute('data-category', cat.key);
        btn.innerHTML = `
            <span class="label">${cat.icon} ${cat.name}</span>
            <span class="count">${activeCount}/${totalCount}</span>
        `;
        btn.onclick = () => selectEditCategory(cat.key);
        sidebar.appendChild(btn);
    });

    // サイドバー下部のコントロール群
    const bottomControls = document.createElement('div');
    bottomControls.style.marginTop = 'auto';

    // 検索バー（サイドバー下部）
    const searchDiv = document.createElement('div');
    searchDiv.className = 'sidebar-search sidebar-search-bottom';
    searchDiv.innerHTML = `
        <div class="search-bar sidebar-search-bar">
            <span class="search-icon"><span class="svg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span></span>
            <input type="text" id="sidebarSearchBox" placeholder="検索..." value="${escapeHtml(currentSearchText)}" oninput="filterRulesFromSidebar(this.value)">
        </div>
    `;
    bottomControls.appendChild(searchDiv);

    // 補助動詞チェックボックス
    const auxRules = state.currentProofRules.filter(r => r.category === 'auxiliary');
    const auxActive = auxRules.some(r => r.active);
    const auxDiv = document.createElement('div');
    auxDiv.innerHTML = `
        <label style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; font-size:0.8em; padding:10px 12px 10px 26px; border-top:1px solid #eee; color:#555;">
            <span style="display:flex; align-items:center; gap:8px;"><span class="svg-icon" style="width:1.2em; min-width:1.2em; display:inline-flex; justify-content:center;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></span> 補助動詞はひらく</span>
            <input type="checkbox" ${auxActive ? 'checked' : ''}
                   onchange="toggleAuxiliaryAll(this.checked)">
        </label>
    `;
    bottomControls.appendChild(auxDiv);

    // 仕様書リンク
    const linksDiv = document.createElement('div');
    linksDiv.className = 'sidebar-text-links';
    linksDiv.innerHTML = `
        <a href="#" onclick="goToSpecSheetPage(); return false;">
            <span class="svg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="12" y2="18"/></svg></span> 仕様書
        </a>
    `;
    bottomControls.appendChild(linksDiv);

    sidebar.appendChild(bottomControls);

    grid.appendChild(sidebar);

    // メインエリア生成
    const main = document.createElement('main');
    main.className = 'edit-main';

    const selectedCat = editCategories.find(c => c.key === state.currentEditCategory);
    if (selectedCat) {
        renderEditMainContent(main, selectedCat, filterText);
    }

    grid.appendChild(main);

    // DOMに追加された後に保存ボタンの表示を更新
    updateHeaderSaveButtons();
}

// サイドバー検索からのフィルタリング
function filterRulesFromSidebar(value) {
    currentSearchText = value;
    renderEditCardMode();
}

// ヘッダーの保存ボタン表示を更新
// ※フローティングボタンはmainWrapper内にあるため、mainWrapper非表示時は自動的に隠れる
function updateHeaderSaveButtons() {
    const headerSaveBtn = document.getElementById('headerSaveToJsonBtn');
    const headerSaveAsBtn = document.getElementById('headerSaveAsJsonBtn');
    const saveGroup = document.getElementById('actionBarSaveGroup');

    if (headerSaveBtn) {
        if (typeof state.currentJsonPath !== 'undefined' && state.currentJsonPath) {
            headerSaveBtn.style.display = 'inline-flex';
            headerSaveBtn.innerHTML = '<span class="svg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></span> 上書き保存';
        } else {
            headerSaveBtn.style.display = 'inline-flex';
            headerSaveBtn.innerHTML = '<span class="svg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></span> 保存';
        }
    }
    if (headerSaveAsBtn) {
        if (typeof state.currentJsonPath !== 'undefined' && state.currentJsonPath) {
            headerSaveAsBtn.style.display = 'inline-flex';
        } else {
            headerSaveAsBtn.style.display = 'none';
        }
    }
    if (saveGroup) {
        saveGroup.style.display = 'flex';
    }
}

// メインコンテンツ描画
function renderEditMainContent(main, cat, filterText) {
    // 表記変更カテゴリ（basic + recommended 統合）
    if (cat.subCategories) {
        renderNotationMainContent(main, cat, filterText);
        return;
    }
    // 数字カテゴリ
    if (cat.isNumber) {
        renderNumberMainContent(main, cat);
        return;
    }

    // ルール取得
    let rules;
    if (cat.isSymbol) {
        rules = state.symbolRules;
    } else {
        rules = state.currentProofRules.filter(r => r.category === cat.key);
    }

    // 検索フィルタ適用
    const filteredRules = rules.filter(rule => {
        if (!filterText) return true;
        return rule.src.toLowerCase().includes(filterText) ||
               rule.dst.toLowerCase().includes(filterText) ||
               (rule.note && rule.note.toLowerCase().includes(filterText));
    });

    // 難読漢字：デフォルトは常にひらく固定、ユーザー追加分はモード依存
    if (cat.key === 'difficult') {
        filteredRules.forEach(r => {
            if (!r.userAdded) { r.mode = 'open'; r.active = true; }
        });
    }
    const activeCount = filteredRules.filter(r => r.active).length;
    const totalCount = filteredRules.length;

    const addBtnClick = cat.isSymbol ? 'openSymbolAddModal()' : `openAddModalWithCategory('${cat.key}')`;
    const catColor = cat.isSymbol ? '#7c5caa' : (categories[cat.key] ? categories[cat.key].color : '#64748b');
    main.innerHTML = `
        <div class="notation-section-header" style="border-left: 3px solid ${catColor};">${cat.name}</div>
        <div class="edit-main-body"></div>
    `;

    const body = main.querySelector('.edit-main-body');

    if (filteredRules.length === 0) {
        if (filterText) {
            body.innerHTML = `<div class="edit-main-empty">検索結果がありません</div>`;
        } else {
            body.innerHTML = `
                <div class="edit-main-empty-state">
                    <div class="empty-state-text">ルールがありません</div>
                    <div class="edit-rule-card add-card" onclick="${addBtnClick}">
                        <span class="add-card-icon">＋</span><span class="add-card-text">ルール追加</span>
                    </div>
                </div>`;
        }
        return;
    }

    // ルールカード描画
    filteredRules.forEach((rule, localIdx) => {
        let cardEl;
        if (cat.isSymbol) {
            const idx = state.symbolRules.indexOf(rule);
            cardEl = renderSymbolRuleCard(rule, idx, filterText);
        } else if (cat.key === 'difficult') {
            const idx = state.currentProofRules.indexOf(rule);
            cardEl = renderDifficultRuleCard(rule, idx, filterText);
        } else if (cat.key === 'character') {
            const idx = state.currentProofRules.indexOf(rule);
            cardEl = renderCharacterRuleCard(rule, idx, filterText);
        } else {
            const idx = state.currentProofRules.indexOf(rule);
            cardEl = renderProofRuleCard(rule, idx, filterText);
        }
        if (cardEl) body.appendChild(cardEl);
    });

    // 追加カード（点線）
    if (!filterText) {
        const addCard = document.createElement('div');
        addCard.className = 'edit-rule-card add-card';
        if (cat.isSymbol) {
            addCard.onclick = () => { openSymbolAddModal(); };
        } else {
            addCard.onclick = () => { openAddModalWithCategory(cat.key); };
        }
        addCard.innerHTML = '<span class="add-card-icon">＋</span><span class="add-card-text">ルール追加</span>';
        body.appendChild(addCard);
    }
}

// 表記変更カテゴリ専用描画
function renderNotationMainContent(main, cat, filterText) {
    const notationRules = state.currentProofRules.filter(r => r.category === 'basic' || r.category === 'recommended');

    // 検索フィルタ適用
    const filterFn = (rule) => {
        if (!filterText) return true;
        return rule.src.toLowerCase().includes(filterText) ||
               rule.dst.toLowerCase().includes(filterText) ||
               (rule.note && rule.note.toLowerCase().includes(filterText));
    };
    const filteredRules = notationRules.filter(filterFn);
    const activeCount = filteredRules.filter(r => r.active).length;
    const totalCount = filteredRules.length;

    main.innerHTML = `<div class="edit-main-body"></div>`;

    const body = main.querySelector('.edit-main-body');

    if (filteredRules.length === 0) {
        body.innerHTML = `<div class="edit-main-empty">${filterText ? '検索結果がありません' : 'ルールがありません'}</div>`;
    } else {
        // basic / recommended をセクション区切りで描画
        const sectionDefs = [
            { key: 'basic', name: categories.basic.name, color: categories.basic.color },
            { key: 'recommended', name: categories.recommended.name, color: categories.recommended.color }
        ];

        sectionDefs.forEach(sec => {
            const sectionRules = filteredRules.filter(r => r.category === sec.key);
            if (sectionRules.length === 0 && filterText) return;

            const section = document.createElement('div');
            section.className = 'notation-section';

            const header = document.createElement('div');
            header.className = 'notation-section-header';
            header.textContent = sec.name;
            header.style.borderLeft = `3px solid ${sec.color}`;
            section.appendChild(header);

            const cardsContainer = document.createElement('div');
            cardsContainer.className = 'notation-section-cards';

            sectionRules.forEach(rule => {
                const idx = state.currentProofRules.indexOf(rule);
                const cardEl = renderProofRuleCard(rule, idx, filterText);
                if (cardEl) cardsContainer.appendChild(cardEl);
            });

            // 追加カード（点線）
            if (!filterText) {
                const addCard = document.createElement('div');
                addCard.className = 'edit-rule-card add-card';
                addCard.onclick = () => { openAddModalWithCategory(sec.key); };
                addCard.innerHTML = '<span class="add-card-icon">＋</span><span class="add-card-text">ルール追加</span>';
                cardsContainer.appendChild(addCard);
            }

            section.appendChild(cardsContainer);
            body.appendChild(section);
        });
    }
}

// 数字カテゴリ専用描画
function renderNumberMainContent(main, cat) {
    const catColor = categories[cat.key] ? categories[cat.key].color : '#64748b';
    main.innerHTML = `
        <div class="notation-section-header" style="border-left: 3px solid ${catColor};">${cat.name}</div>
        <div class="edit-main-body"></div>
    `;
    const body = main.querySelector('.edit-main-body');

    // ベースルール選択
    const baseBanner = document.createElement('div');
    baseBanner.className = 'number-base-rule';
    baseBanner.innerHTML = '<span class="number-rule-label">基本ルール</span>';
    const baseSel = document.createElement('select');
    baseSel.className = 'number-mode-select';
    baseSel.style.marginLeft = '8px';
    baseSel.onclick = (e) => e.stopPropagation();
    baseSel.onchange = function() { state.numberRuleBase = parseInt(this.value); generateXML(); };
    numberBaseOptions.forEach((opt, i) => {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = opt;
        if (i === state.numberRuleBase) option.selected = true;
        baseSel.appendChild(option);
    });
    baseBanner.appendChild(baseSel);
    body.appendChild(baseBanner);

    // サブルール一括ON/OFFトグル
    const toggleDiv = document.createElement('div');
    toggleDiv.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:8px 14px; margin-bottom:8px; background:var(--surface-dim); border-radius:6px; border:1px solid var(--border-strong);';
    toggleDiv.innerHTML = `
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.85em; color:#555;">
            <input type="checkbox" ${state.numberSubRulesEnabled ? 'checked' : ''} onchange="toggleNumberSubRules(this.checked)">
            <span>サブルール指定（人数・戸数・月）</span>
        </label>
    `;
    body.appendChild(toggleDiv);

    // 3つのサブルールカード
    Object.keys(numberSubRules).forEach(key => {
        const sub = numberSubRules[key];
        let currentVal;
        if (key === 'personCount') currentVal = state.numberRulePersonCount;
        else if (key === 'thingCount') currentVal = state.numberRuleThingCount;
        else currentVal = state.numberRuleMonth;

        const card = document.createElement('div');
        card.className = 'number-card';
        if (!state.numberSubRulesEnabled) {
            card.style.opacity = '0.4';
            card.style.pointerEvents = 'none';
        }

        const top = document.createElement('div');
        top.className = 'number-card-top';

        const label = document.createElement('span');
        label.className = 'number-rule-label';
        label.textContent = sub.name;

        const sel = document.createElement('select');
        sel.className = 'number-mode-select';
        sel.onclick = (e) => e.stopPropagation();
        sel.onchange = function() { changeNumberMode(key, this.value); };
        sub.options.forEach((opt, i) => {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = opt;
            if (i === currentVal) option.selected = true;
            sel.appendChild(option);
        });

        top.appendChild(label);
        top.appendChild(sel);
        card.appendChild(top);

        const note = document.createElement('div');
        note.className = 'number-card-note';
        note.textContent = '初出に統一';
        card.appendChild(note);

        body.appendChild(card);
    });
}

// カテゴリ選択
function selectEditCategory(categoryKey) {
    state.currentEditCategory = categoryKey;
    renderEditCardMode();
}

// 人物名ルールカード生成（ルビトグル付き）
function renderCharacterRuleCard(rule, index, filterText) {
    // addRubyプロパティがない場合はactiveから推定（後方互換性）
    if (rule.addRuby === undefined) {
        rule.addRuby = rule.active !== false;
    }

    const card = document.createElement('div');
    card.className = 'edit-rule-card character-card';
    card.onclick = (e) => {
        if (e.target.type !== 'checkbox' && !e.target.classList.contains('ruby-toggle')) {
            openEditModal(index);
        }
    };

    card.innerHTML = `
        <div class="edit-rule-top">
            <div class="edit-rule-conversion">
                <span class="edit-rule-src">${escapeHtml(rule.src)}</span>
                <span class="edit-rule-arrow">→</span>
                <span class="edit-rule-dst">${escapeHtml(rule.dst)}</span>
            </div>
            <button class="edit-rule-btn" onclick="event.stopPropagation(); openEditModal(${index})">✎</button>
        </div>
        <div class="character-ruby-row">
            <label class="ruby-toggle-label" onclick="event.stopPropagation();">
                <input type="checkbox" class="ruby-toggle" ${rule.addRuby ? 'checked' : ''}
                       onchange="event.stopPropagation(); toggleCharacterRuby(${index}, this.checked)">
                <span class="ruby-toggle-text">ルビを付ける</span>
            </label>
        </div>
    `;

    return card;
}

// 人物名のルビトグル切り替え
function toggleCharacterRuby(index, value) {
    if (index >= 0 && index < state.currentProofRules.length) {
        state.currentProofRules[index].addRuby = value;
        generateXML();
    }
}

// 校正ルールカード生成
function renderProofRuleCard(rule, index, filterText) {
    const card = document.createElement('div');
    card.className = 'edit-rule-card' + (rule.active ? '' : ' inactive');
    card.onclick = (e) => {
        if (e.target.type !== 'checkbox') openEditModal(index);
    };

    card.innerHTML = `
        <div class="edit-rule-top">
            <input type="checkbox" class="edit-rule-checkbox" ${rule.active ? 'checked' : ''}
                   onclick="event.stopPropagation(); toggleRule(${index})">
            <div class="edit-rule-conversion">
                <span class="edit-rule-src">${escapeHtml(rule.src)}</span>
                <span class="edit-rule-arrow">→</span>
                <span class="edit-rule-dst">${escapeHtml(rule.dst)}</span>
            </div>
            <button class="edit-rule-btn" onclick="event.stopPropagation(); openEditModal(${index})">✎</button>
        </div>
        ${rule.note ? `<div class="edit-rule-note">${escapeHtml(rule.note)}</div>` : ''}
    `;

    return card;
}

// 難読漢字ルールカード生成（3択セレクト：ひらく/ルビ/なし）
function renderDifficultRuleCard(rule, index, filterText) {
    const card = document.createElement('div');

    // ユーザー追加ルール → ドロップダウン表示
    if (rule.userAdded) {
        if (!rule.mode) rule.mode = 'open';
        card.className = 'edit-rule-card difficult-card' + (rule.mode === 'none' ? ' inactive' : '');
        card.onclick = (e) => {
            if (e.target.tagName !== 'SELECT') openEditModal(index);
        };
        card.innerHTML = `
            <div class="edit-rule-top difficult-top">
                <select class="difficult-mode-select" onclick="event.stopPropagation();" onchange="changeDifficultMode(${index}, this.value)">
                    <option value="open" ${rule.mode === 'open' ? 'selected' : ''}>ひらく</option>
                    <option value="ruby" ${rule.mode === 'ruby' ? 'selected' : ''}>ルビをつける</option>
                    <option value="none" ${rule.mode === 'none' ? 'selected' : ''}>そのまま</option>
                </select>
                <div class="edit-rule-conversion">
                    <span class="edit-rule-src">${escapeHtml(rule.src)}</span>
                    <span class="edit-rule-arrow">→</span>
                    <span class="edit-rule-dst">${escapeHtml(rule.dst)}</span>
                </div>
                <button class="edit-rule-btn" onclick="event.stopPropagation(); openEditModal(${index})">✎</button>
            </div>
            ${rule.note ? `<div class="edit-rule-note">${escapeHtml(rule.note)}</div>` : ''}
        `;
    } else {
        // デフォルトルール → ひらく固定、ドロップダウンなし
        rule.mode = 'open';
        rule.active = true;
        card.className = 'edit-rule-card difficult-card';
        card.onclick = () => openEditModal(index);
        card.innerHTML = `
            <div class="edit-rule-top difficult-top">
                <span class="difficult-mode-label">ひらく</span>
                <div class="edit-rule-conversion">
                    <span class="edit-rule-src">${escapeHtml(rule.src)}</span>
                    <span class="edit-rule-arrow">→</span>
                    <span class="edit-rule-dst">${escapeHtml(rule.dst)}</span>
                </div>
                <button class="edit-rule-btn" onclick="event.stopPropagation(); openEditModal(${index})">✎</button>
            </div>
            ${rule.note ? `<div class="edit-rule-note">${escapeHtml(rule.note)}</div>` : ''}
        `;
    }

    return card;
}

// 難読漢字のモード変更
function changeDifficultMode(index, mode) {
    state.currentProofRules[index].mode = mode;
    state.currentProofRules[index].active = (mode !== 'none'); // ひらく・ルビどちらも有効
    refreshCurrentView();
    generateXML();
}

function changeNumberMode(subRule, value) {
    const v = parseInt(value);
    if (subRule === 'personCount') state.numberRulePersonCount = v;
    else if (subRule === 'thingCount') state.numberRuleThingCount = v;
    else if (subRule === 'month') state.numberRuleMonth = v;
    refreshCurrentView();
    generateXML();
}

function toggleNumberSubRules(checked) {
    state.numberSubRulesEnabled = checked;
    renderEditCardMode();
    generateXML();
}

// 記号ルールカード生成
function renderSymbolRuleCard(rule, index, filterText) {
    const card = document.createElement('div');
    card.className = 'edit-rule-card' + (rule.active ? '' : ' inactive');
    card.onclick = (e) => {
        if (e.target.type !== 'checkbox') openSymbolEditModal(index);
    };

    // 半角スペースを見やすく表示
    const displayDst = rule.dst === ' ' ? '(半角スペース)' : rule.dst;

    card.innerHTML = `
        <div class="edit-rule-top">
            <input type="checkbox" class="edit-rule-checkbox" ${rule.active ? 'checked' : ''}
                   onclick="event.stopPropagation(); toggleSymbolRule(${index})">
            <div class="edit-rule-conversion">
                <span class="edit-rule-src">${escapeHtml(rule.src)}</span>
                <span class="edit-rule-arrow">→</span>
                <span class="edit-rule-dst">${escapeHtml(displayDst)}</span>
            </div>
            <button class="edit-rule-btn" onclick="event.stopPropagation(); openSymbolEditModal(${index})">✎</button>
        </div>
        ${rule.note ? `<div class="edit-rule-note">${escapeHtml(rule.note)}</div>` : ''}
    `;

    return card;
}

// カテゴリ指定で追加モーダルを開く
function openAddModalWithCategory(category) {
    document.getElementById('edit_index').value = '-1'; // -1 = 新規追加
    document.getElementById('edit_category').value = category;
    document.getElementById('edit_src').value = '';
    document.getElementById('edit_dst').value = '';
    document.getElementById('edit_note').value = '';

    // モーダルヘッダーを「新規追加」に変更
    const modalHeader = document.querySelector('#editModal .modal-header span:first-child');
    if (modalHeader) modalHeader.textContent = category === 'character' ? '人物名の追加' : '新規ルールの追加';

    // 削除ボタンを非表示
    const deleteBtn = document.querySelector('#editModal .btn-red');
    if (deleteBtn) deleteBtn.style.display = 'none';

    // カテゴリに応じてラベルを変更
    updateModalLabels(category);

    document.getElementById('editModal').style.display = 'flex';
    setTimeout(() => {
        document.getElementById('edit_src').focus();
    }, 100);
}

// モーダルのラベルをカテゴリに応じて変更
function updateModalLabels(category) {
    // modal-body内の構造: hidden input(1) + input-group(2:カテゴリ) + input-group(3:src) + input-group(4:dst) + input-group(5:note) + input-group(6:難読モード)
    const srcLabel = document.querySelector('#editModal .modal-body .input-group:nth-child(3) label');
    const dstLabel = document.querySelector('#editModal .modal-body .input-group:nth-child(4) label');
    const noteLabel = document.querySelector('#editModal .modal-body .input-group:nth-child(5) label');
    const noteInput = document.getElementById('edit_note');
    const difficultModeGroup = document.getElementById('edit_difficult_mode_group');
    // 補足文添削ボタン
    const noteGemBtn = document.querySelector('#editModal .modal-body .input-group:nth-child(5) .btn-gem');

    if (category === 'character') {
        if (srcLabel) srcLabel.textContent = '名前';
        if (dstLabel) dstLabel.textContent = '読み（ルビ）';
        if (noteLabel) noteLabel.textContent = 'メモ';
        if (noteInput) noteInput.placeholder = '任意のメモ';
        if (difficultModeGroup) difficultModeGroup.style.display = 'none';
        // 人名ルールは補足文添削ボタン不要
        if (noteGemBtn) noteGemBtn.style.display = 'none';
    } else if (category === 'difficult') {
        if (srcLabel) srcLabel.textContent = '難読漢字';
        if (dstLabel) dstLabel.textContent = 'ひらがな読み';
        if (noteLabel) noteLabel.textContent = 'メモ';
        if (noteInput) noteInput.placeholder = '任意のメモ';
        if (difficultModeGroup) difficultModeGroup.style.display = 'block';
        if (noteGemBtn) noteGemBtn.style.display = 'inline-block';
    } else {
        if (srcLabel) srcLabel.textContent = '修正前の言葉 (before)';
        if (dstLabel) dstLabel.textContent = '修正後の言葉 (after)';
        if (noteLabel) noteLabel.textContent = '条件・メモ (condition)';
        if (noteInput) noteInput.placeholder = '空欄なら無条件で置換されます';
        if (difficultModeGroup) difficultModeGroup.style.display = 'none';
        if (noteGemBtn) noteGemBtn.style.display = 'inline-block';
    }
}

// 記号ルール追加モーダルを開く（編集モーダルを追加モードで使用）
function openSymbolAddModal() {
    document.getElementById('symbol_edit_index').value = '-1'; // -1 = 新規追加
    document.getElementById('symbol_edit_category').value = 'symbol'; // カテゴリをリセット
    document.getElementById('symbol_edit_src').value = '';
    document.getElementById('symbol_edit_dst').value = '';
    document.getElementById('symbol_edit_note').value = '';
    document.getElementById('symbolEditModal').style.display = 'flex';
    setTimeout(() => {
        document.getElementById('symbol_edit_src').focus();
    }, 100);
}

// 記号モーダルから別カテゴリに切り替え
function switchFromSymbolModal(category) {
    if (category === 'symbol') return; // 記号のままなら何もしない

    // 記号モーダルを閉じる
    document.getElementById('symbolEditModal').style.display = 'none';

    // 入力中の値を引き継ぐ
    const src = document.getElementById('symbol_edit_src').value;
    const dst = document.getElementById('symbol_edit_dst').value;
    const note = document.getElementById('symbol_edit_note').value;

    // 通常モーダルを新規追加モードで開く
    document.getElementById('edit_index').value = '-1';
    document.getElementById('edit_category').value = category;
    document.getElementById('edit_src').value = src;
    document.getElementById('edit_dst').value = dst;
    document.getElementById('edit_note').value = note;

    // モーダルヘッダーを「新規追加」に変更
    const modalHeader = document.querySelector('#editModal .modal-header span:first-child');
    if (modalHeader) modalHeader.textContent = '新規ルールの追加';

    // 削除ボタンを非表示
    const deleteBtn = document.querySelector('#editModal .btn-red');
    if (deleteBtn) deleteBtn.style.display = 'none';

    document.getElementById('editModal').style.display = 'flex';

    // 記号モーダルのカテゴリ選択を元に戻す
    document.getElementById('symbol_edit_category').value = 'symbol';
}

// 通常モーダルから記号モーダルに切り替え、またはカテゴリ変更時のラベル更新
function switchFromEditModal(category) {
    // 新規追加モードの場合のみ切り替え・ラベル変更を許可
    const editIndex = document.getElementById('edit_index').value;
    if (editIndex !== '-1') {
        // 編集モードの場合は選択を元に戻す
        showToast('既存ルールのカテゴリ変更はできません', 'warning');
        document.getElementById('edit_category').value = 'basic';
        return;
    }

    // 記号以外ならラベルを更新して終了
    if (category !== 'symbol') {
        updateModalLabels(category);
        return;
    }

    // 通常モーダルを閉じる
    document.getElementById('editModal').style.display = 'none';

    // 入力中の値を引き継ぐ
    const src = document.getElementById('edit_src').value;
    const dst = document.getElementById('edit_dst').value;
    const note = document.getElementById('edit_note').value;

    // 記号モーダルを新規追加モードで開く
    document.getElementById('symbol_edit_index').value = '-1';
    document.getElementById('symbol_edit_category').value = 'symbol';
    document.getElementById('symbol_edit_src').value = src;
    document.getElementById('symbol_edit_dst').value = dst;
    document.getElementById('symbol_edit_note').value = note;

    document.getElementById('symbolEditModal').style.display = 'flex';
}

// 旧テーブル描画 (互換用)
function renderTable() {
    renderEditCardMode();
}

// HTMLエスケープ (表示用)
function escapeHtml(str) {
    if(!str) return '';
    return str.replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
}

// onclick属性内に安全に文字列を渡すためのエスケープ
function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\\/g, '\\\\');
}

/* =========================================
   仕様書ページ
   ========================================= */
let specSheetSourcePage = 'extraction'; // 遷移元ページ

function goToSpecSheetPage() {
    specSheetSourcePage = 'extraction';
    const page = document.getElementById('specSheetPage');

    // 全ページを非表示
    document.getElementById('landingScreen').style.display = 'none';
    document.getElementById('mainWrapper').style.display = 'none';
    document.getElementById('proofreadingPage').style.display = 'none';
    document.getElementById('adminPage').style.display = 'none';
    document.getElementById('resultViewerPage').style.display = 'none';

    // テーブル生成
    renderSpecSheetTable();

    page.style.display = 'flex';
    page.classList.add('page-transition-zoom-in');
    setTimeout(() => page.classList.remove('page-transition-zoom-in'), 350);
}

function goBackFromSpecSheet() {
    const page = document.getElementById('specSheetPage');
    page.style.display = 'none';
    document.getElementById('mainWrapper').style.display = 'flex';
    document.getElementById('mainWrapper').classList.add('page-transition');
    setTimeout(() => document.getElementById('mainWrapper').classList.remove('page-transition'), 350);
    updateHeaderSaveButtons();
}

function goToHomeFromSpecSheet() {
    const page = document.getElementById('specSheetPage');
    page.style.display = 'none';
    const landing = document.getElementById('landingScreen');
    landing.style.display = 'flex';
    landing.classList.add('page-transition-up');
    setTimeout(() => landing.classList.remove('page-transition-up'), 350);
}

function renderSpecSheetTable() {
    let html = '';
    let rowNum = 1;

    html += '<table class="spec-sheet-table">';
    html += '<colgroup><col class="spec-col-rownum"><col class="spec-col-cat"><col class="spec-col-correct"><col class="spec-col-incorrect"><col class="spec-col-note"></colgroup>';

    // Excel風カラムヘッダー（A, B, C, D）
    html += '<thead>';
    html += '<tr class="spec-col-header"><th></th><th>A</th><th>B</th><th>C</th><th>D</th></tr>';
    html += '</thead><tbody>';

    // タイトル行
    html += `<tr><td class="spec-rownum">${rowNum++}</td><td colspan="4" class="spec-title-row">■ 統一表記・ルール一覧</td></tr>`;
    html += `<tr><td class="spec-rownum">${rowNum++}</td><td colspan="4" class="spec-spacer"></td></tr>`;

    // === 記号置換ルール ===
    const activeSymbols = state.symbolRules.filter(r => r.active);
    if (activeSymbols.length > 0) {
        html += `<tr><td class="spec-rownum">${rowNum++}</td><td class="spec-cat-label" style="background:#e8f5e9; border-right:2px solid #4caf50;">●記号置換</td><td colspan="3" class="spec-cat-desc">記号・句読点の置換ルール</td></tr>`;

        // ヘッダー
        html += `<tr class="spec-data-header"><td class="spec-rownum">${rowNum++}</td><td>分類</td><td>統一表記 (〇)</td><td>非推奨 (×)</td><td>備考</td></tr>`;

        activeSymbols.forEach(rule => {
            html += '<tr>';
            html += `<td class="spec-rownum">${rowNum++}</td>`;
            html += '<td class="spec-cell-type">置換</td>';
            html += `<td class="spec-cell-correct">${escapeHtml(rule.dst)}</td>`;
            html += `<td class="spec-cell-incorrect">${escapeHtml(rule.src)}</td>`;
            html += `<td class="spec-cell-note">${escapeHtml(rule.note || '')}</td>`;
            html += '</tr>';
        });

        html += `<tr><td class="spec-rownum">${rowNum++}</td><td colspan="4" class="spec-spacer"></td></tr>`;
    }

    // === 各カテゴリのルール ===
    const categoryOrder = ['basic', 'recommended', 'auxiliary', 'difficult', 'number', 'pronoun', 'character'];

    categoryOrder.forEach(catKey => {
        const catDef = categories[catKey];
        if (!catDef) return;
        const catRules = state.currentProofRules.filter(r => r.category === catKey && r.active);
        if (catRules.length === 0) return;

        // カテゴリ見出し
        html += `<tr><td class="spec-rownum">${rowNum++}</td><td class="spec-cat-label" style="background:${catDef.color}15; border-right:2px solid ${catDef.color};">●${escapeHtml(catDef.name)}</td><td colspan="3" class="spec-cat-desc"></td></tr>`;

        // データヘッダー
        html += `<tr class="spec-data-header"><td class="spec-rownum">${rowNum++}</td><td>分類</td><td>統一表記 (〇)</td><td>非推奨 (×)</td><td>備考</td></tr>`;

        catRules.forEach(rule => {
            html += '<tr>';
            html += `<td class="spec-rownum">${rowNum++}</td>`;
            let typeLabel = '表記統一';
            if (catKey === 'auxiliary') typeLabel = '補助動詞';
            else if (catKey === 'difficult') typeLabel = '難読';
            else if (catKey === 'number') typeLabel = '数字';
            else if (catKey === 'pronoun') typeLabel = '人称';
            else if (catKey === 'character') typeLabel = '人物名';
            html += `<td class="spec-cell-type">${typeLabel}</td>`;
            html += `<td class="spec-cell-correct">${escapeHtml(rule.dst || '')}</td>`;
            html += `<td class="spec-cell-incorrect">${escapeHtml(rule.src || '')}</td>`;
            html += `<td class="spec-cell-note">${escapeHtml(rule.note || '')}</td>`;
            html += '</tr>';
        });

        html += `<tr><td class="spec-rownum">${rowNum++}</td><td colspan="4" class="spec-spacer"></td></tr>`;
    });

    // === 数字サブルール ===
    const numSubItems = [];
    numSubItems.push({ name: '基本ルール', value: numberBaseOptions[state.numberRuleBase] || numberBaseOptions[0] });
    if (state.numberSubRulesEnabled) {
        if (typeof state.numberRulePersonCount !== 'undefined' && numberSubRules.personCount) {
            numSubItems.push({ name: numberSubRules.personCount.name, value: numberSubRules.personCount.options[state.numberRulePersonCount] || '' });
        }
        if (typeof state.numberRuleThingCount !== 'undefined' && numberSubRules.thingCount) {
            numSubItems.push({ name: numberSubRules.thingCount.name, value: numberSubRules.thingCount.options[state.numberRuleThingCount] || '' });
        }
        if (typeof state.numberRuleMonth !== 'undefined' && numberSubRules.month) {
            numSubItems.push({ name: numberSubRules.month.name, value: numberSubRules.month.options[state.numberRuleMonth] || '' });
        }
    }
    if (numSubItems.length > 0) {
        html += `<tr><td class="spec-rownum">${rowNum++}</td><td class="spec-cat-label" style="background:${categories.number.color}15; border-right:2px solid ${categories.number.color};">●数字サブルール</td><td colspan="3" class="spec-cat-desc"></td></tr>`;
        numSubItems.forEach(entry => {
            html += '<tr>';
            html += `<td class="spec-rownum">${rowNum++}</td>`;
            html += `<td class="spec-cell-type">${escapeHtml(entry.name)}</td>`;
            html += `<td class="spec-cell-correct" colspan="2">${escapeHtml(entry.value)}</td>`;
            html += '<td class="spec-cell-note"></td>';
            html += '</tr>';
        });
    }

    html += '</tbody></table>';
    document.getElementById('specSheetBody').innerHTML = html;
}

async function exportSpecSheetPDF() {
    if (!window.electronAPI || !window.electronAPI.printToPDF) {
        showToast('PDF出力はElectron環境でのみ使用できます', 'error');
        return;
    }

    // 現在の仕様書テーブルHTMLを取得
    const tableHtml = document.getElementById('specSheetBody').innerHTML;
    if (!tableHtml) {
        showToast('仕様書の内容がありません。先にレーベルを選択してください。', 'warning');
        return;
    }

    // A4 1ページに収まるスタンドアロンHTMLを構築
    const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
@page { size: A4; margin: 8mm; }
body { font-family: 'Meiryo', 'Yu Gothic', sans-serif; margin: 0; padding: 0; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
th, td { border: 1px solid #d1d5db; }
.spec-col-rownum { width: 24px; }
.spec-col-cat { width: 80px; }
.spec-col-correct { width: 100px; }
.spec-col-incorrect { width: 100px; }
.spec-col-header th { background: #f3f4f6; color: #6b7280; text-align: center; font-size: 7px; padding: 1px; }
.spec-rownum { background: #f3f4f6; color: #9ca3af; text-align: center; font-size: 7px; padding: 1px; }
.spec-title-row { font-weight: bold; font-size: 10px; padding: 4px 6px; background: #f0fdf4; border-bottom: 2px solid #16a34a; color: #166534; }
.spec-spacer { background: #f9fafb; height: 3px; padding: 0; }
.spec-cat-label { font-weight: bold; padding: 3px 6px; font-size: 8px; }
.spec-cat-desc { padding: 3px 6px; font-size: 7px; color: #6b7280; }
.spec-data-header td { background: #16a34a; color: #fff; font-weight: bold; text-align: center; padding: 2px 4px; font-size: 7px; }
.spec-cell-type { padding: 2px 4px; font-size: 7px; color: #6b7280; }
.spec-cell-correct { padding: 2px 4px; font-weight: bold; text-align: center; color: #1d4ed8; background: #eff6ff; font-size: 8px; }
.spec-cell-incorrect { padding: 2px 4px; text-align: center; color: #9ca3af; background: #f9fafb; font-size: 8px; }
.spec-cell-note { padding: 2px 4px; font-size: 7px; color: #6b7280; }
</style></head><body>${tableHtml}</body></html>`;

    const result = await window.electronAPI.printToPDF(fullHtml);
    if (result.success) {
        showToast('PDFを保存しました: ' + result.filePath, 'success');
    } else if (!result.canceled) {
        showToast('PDF出力に失敗しました: ' + (result.error || ''), 'error');
    }
}

// ルール操作
function toggleRule(index) {
    state.currentProofRules[index].active = !state.currentProofRules[index].active;
    // データの同期
    updateMasterData();
    renderTable();
    refreshCurrentView();
    generateXML();
}

function toggleAuxiliaryAll(active) {
    state.currentProofRules.forEach(r => {
        if (r.category === 'auxiliary') {
            r.active = active;
        }
    });
    updateMasterData();
    renderTable();
    refreshCurrentView();
    generateXML();
}

function addNewRule() {
    const category = document.getElementById('new_category').value;
    const src = document.getElementById('new_target').value.trim();
    const dst = document.getElementById('new_replace').value.trim();
    const note = document.getElementById('new_note').value.trim();

    if(!src || !dst) { showToast('言葉を入力してください', 'warning'); return; }

    // 先頭に追加して目立たせる
    const newRule = { src, dst, note, active: true, category };
    if (category === 'difficult') {
        newRule.mode = 'open';
        newRule.userAdded = true;
    }
    state.currentProofRules.unshift(newRule);

    document.getElementById('new_target').value = '';
    document.getElementById('new_replace').value = '';
    document.getElementById('new_note').value = '';
    document.getElementById('searchBox').value = ''; // 検索解除して新アイテムを表示
    // 編集モードのカテゴリ選択を追加したカテゴリに切り替え
    state.currentEditCategory = category;

    updateMasterData();
    renderTable();
    refreshCurrentView();
    generateXML();
}

/* =========================================
   編集モーダル機能
   ========================================= */
function openEditModal(index) {
    const item = state.currentProofRules[index];
    document.getElementById('edit_index').value = index;
    document.getElementById('edit_category').value = item.category || 'basic';
    document.getElementById('edit_src').value = item.src;
    document.getElementById('edit_dst').value = item.dst;
    document.getElementById('edit_note').value = item.note || '';

    // 難読漢字のモード設定
    const difficultModeSelect = document.getElementById('edit_difficult_mode');
    if (difficultModeSelect) {
        difficultModeSelect.value = item.mode || 'open';
    }

    // モーダルヘッダーを「ルールの編集」に変更
    const modalHeader = document.querySelector('#editModal .modal-header span:first-child');
    if (modalHeader) modalHeader.textContent = item.category === 'character' ? '人物名の編集' : 'ルールの編集';

    // 削除ボタンを表示
    const deleteBtn = document.querySelector('#editModal .btn-red');
    if (deleteBtn) deleteBtn.style.display = 'inline-block';

    // カテゴリに応じてラベルを変更
    updateModalLabels(item.category || 'basic');

    document.getElementById('editModal').style.display = 'flex';
    // フォーカス
    setTimeout(() => document.getElementById('edit_dst').focus(), 100);
}

function closeModal() {
    document.getElementById('editModal').style.display = 'none';
}

function saveEdit() {
    const index = parseInt(document.getElementById('edit_index').value);
    const category = document.getElementById('edit_category').value;
    const src = document.getElementById('edit_src').value;
    const dst = document.getElementById('edit_dst').value;
    const note = document.getElementById('edit_note').value;
    const difficultMode = document.getElementById('edit_difficult_mode').value;

    if (!src.trim()) {
        showToast(category === 'character' ? '名前を入力してください' : '修正前の言葉を入力してください', 'warning');
        return;
    }

    // 人物名以外はdst必須（人物名はルビなので空でもOKの場合がある）
    if (!dst.trim() && category !== 'character') {
        showToast('修正後の言葉を入力してください', 'warning');
        return;
    }

    if (index === -1) {
        // 新規追加
        const newRule = {
            src: src,
            dst: dst,
            note: note,
            active: true,
            category: category
        };
        // 人物名の場合はaddRubyを追加
        if (category === 'character') {
            newRule.addRuby = true;
        }
        // 難読漢字の場合はmodeとuserAddedを追加
        if (category === 'difficult') {
            newRule.mode = difficultMode;
            newRule.userAdded = true;
        }
        state.currentProofRules.push(newRule);
        // 追加したカテゴリを選択状態にする（basic/recommendedはnotationにマッピング）
        if (category === 'basic' || category === 'recommended') {
            state.currentEditCategory = 'notation';
        } else {
            state.currentEditCategory = category;
        }
    } else {
        // 既存ルールの更新
        state.currentProofRules[index].category = category;
        state.currentProofRules[index].src = src;
        state.currentProofRules[index].dst = dst;
        state.currentProofRules[index].note = note;
        // 難読漢字の場合はmodeを更新
        if (category === 'difficult') {
            state.currentProofRules[index].mode = difficultMode;
        }
    }

    updateMasterData();
    closeModal();
    renderTable();
    refreshCurrentView();
    generateXML();
}

function deleteFromEdit() {
    if(!confirm("本当にこのルールを削除しますか？")) return;
    const index = parseInt(document.getElementById('edit_index').value);
    state.currentProofRules.splice(index, 1);

    updateMasterData();
    closeModal();
    renderTable();
    refreshCurrentView();
    generateXML();
}

// 現在のリストをマスターデータにも反映する関数
function updateMasterData() {
    // マスタールールは外部JSONで管理するため、セッション中の変更はstate.currentProofRulesのみに保持
    // （保存はJSONファイルへの書き出しで行う）
}

/* =========================================
   記号置換ルール機能
   ========================================= */
function renderSymbolTable() {
    // 編集モードのカードグリッドで描画するため、ここでは何もしない
    // 互換性のため関数は残す
    renderEditCardMode();
}

function toggleSymbolRule(index) {
    state.symbolRules[index].active = !state.symbolRules[index].active;
    renderSymbolTable();
    generateXML();
}

function addSymbolRule() {
    const src = document.getElementById('new_symbol_src').value.trim();
    const dst = document.getElementById('new_symbol_dst').value; // スペースを許容するためtrimしない
    const note = document.getElementById('new_symbol_note').value.trim();

    if(!src || dst === '') { showToast('変換前と変換後を入力してください', 'warning'); return; }

    state.symbolRules.unshift({ src, dst, note, active: true });

    document.getElementById('new_symbol_src').value = '';
    document.getElementById('new_symbol_dst').value = '';
    document.getElementById('new_symbol_note').value = '';

    renderSymbolTable();
    generateXML();
}

function openSymbolEditModal(index) {
    const item = state.symbolRules[index];
    document.getElementById('symbol_edit_index').value = index;
    document.getElementById('symbol_edit_src').value = item.src;
    document.getElementById('symbol_edit_dst').value = item.dst;
    document.getElementById('symbol_edit_note').value = item.note || '';
    document.getElementById('symbolEditModal').style.display = 'flex';
    setTimeout(() => document.getElementById('symbol_edit_dst').focus(), 100);
}

function closeSymbolModal() {
    document.getElementById('symbolEditModal').style.display = 'none';
}

function saveSymbolEdit() {
    const index = parseInt(document.getElementById('symbol_edit_index').value);
    const src = document.getElementById('symbol_edit_src').value.trim();
    const dst = document.getElementById('symbol_edit_dst').value; // スペースを許容
    const note = document.getElementById('symbol_edit_note').value.trim();

    if (!src || dst === '') {
        showToast('変換前と変換後を入力してください', 'warning');
        return;
    }

    if (index === -1) {
        // 新規追加
        state.symbolRules.unshift({ src, dst, note, active: true });
    } else {
        // 編集
        state.symbolRules[index].src = src;
        state.symbolRules[index].dst = dst;
        state.symbolRules[index].note = note;
    }

    closeSymbolModal();
    renderSymbolTable();
    generateXML();
}

function deleteSymbolFromEdit() {
    const index = parseInt(document.getElementById('symbol_edit_index').value);
    if (index === -1) return; // 新規追加モードでは削除不可

    if(!confirm("本当にこのルールを削除しますか？")) return;
    state.symbolRules.splice(index, 1);

    closeSymbolModal();
    renderSymbolTable();
    generateXML();
}


// ES Module exports
export { openLabelSelectModal, closeLabelSelectModal, selectLabelFromPopup, updateLabelSelectorButtonText, changeLabel, filterRules, renderEditCardMode, filterRulesFromSidebar, updateHeaderSaveButtons, renderEditMainContent, renderNotationMainContent, renderNumberMainContent, selectEditCategory, renderCharacterRuleCard, toggleCharacterRuby, renderProofRuleCard, renderDifficultRuleCard, changeDifficultMode, changeNumberMode, toggleNumberSubRules, renderSymbolRuleCard, openAddModalWithCategory, updateModalLabels, openSymbolAddModal, switchFromSymbolModal, switchFromEditModal, renderTable, escapeHtml, escapeAttr, goToSpecSheetPage, goBackFromSpecSheet, goToHomeFromSpecSheet, renderSpecSheetTable, exportSpecSheetPDF, toggleRule, toggleAuxiliaryAll, addNewRule, openEditModal, closeModal, saveEdit, deleteFromEdit, updateMasterData, renderSymbolTable, toggleSymbolRule, addSymbolRule, openSymbolEditModal, closeSymbolModal, saveSymbolEdit, deleteSymbolFromEdit };

// Expose to window for inline HTML handlers
Object.assign(window, { openLabelSelectModal, closeLabelSelectModal, selectLabelFromPopup, updateLabelSelectorButtonText, changeLabel, filterRules, renderEditCardMode, filterRulesFromSidebar, updateHeaderSaveButtons, renderEditMainContent, renderNotationMainContent, renderNumberMainContent, selectEditCategory, renderCharacterRuleCard, toggleCharacterRuby, renderProofRuleCard, renderDifficultRuleCard, changeDifficultMode, changeNumberMode, toggleNumberSubRules, renderSymbolRuleCard, openAddModalWithCategory, updateModalLabels, openSymbolAddModal, switchFromSymbolModal, switchFromEditModal, renderTable, escapeHtml, escapeAttr, goToSpecSheetPage, goBackFromSpecSheet, goToHomeFromSpecSheet, renderSpecSheetTable, exportSpecSheetPDF, toggleRule, toggleAuxiliaryAll, addNewRule, openEditModal, closeModal, saveEdit, deleteFromEdit, updateMasterData, renderSymbolTable, toggleSymbolRule, addSymbolRule, openSymbolEditModal, closeSymbolModal, saveSymbolEdit, deleteSymbolFromEdit });
