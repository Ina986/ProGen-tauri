import { state, defaultSymbolRules } from './progen-state.js';
// ========================================
// 管理モード
// ========================================

const ADMIN_PASSWORD = 'progen2026';
// [moved to state] isAdminMode
let adminCurrentLabel = 'default';
let adminProofRules = [];
let adminSymbolRules = [];
let adminOptions = {};
let adminCurrentCategory = 'symbol';
let adminCurrentViewMode = 'edit';

const adminCategories = [
    { key: 'symbol', name: '記号・句読点', icon: '\uD83D\uDD23' },
    { key: 'notation', name: '表記変更', icon: '\uD83D\uDCDD', subCategories: ['basic', 'recommended'] },
    { key: 'difficult', name: '難読文字', icon: '\uD83D\uDD24' },
    { key: 'number', name: '数字', icon: '\uD83D\uDD22', isNumber: true },
    { key: 'pronoun', name: '人称', icon: '\uD83D\uDC64' },
    { key: 'character', name: '人物名', icon: '\uD83C\uDFF7\uFE0F' }
];
let adminNotationFilter = 'all';

// --- 認証ダイアログ ---

function showAdminAuthDialog() {
    const modal = document.getElementById('adminAuthModal');
    modal.style.display = 'flex';
    document.getElementById('adminPasswordInput').value = '';
    document.getElementById('adminAuthError').style.display = 'none';
    setTimeout(() => document.getElementById('adminPasswordInput').focus(), 100);
}

function closeAdminAuthDialog() {
    document.getElementById('adminAuthModal').style.display = 'none';
}

function authenticateAdmin() {
    const input = document.getElementById('adminPasswordInput').value;
    if (input === ADMIN_PASSWORD) {
        state.isAdminMode = true;
        closeAdminAuthDialog();
        showAdminPage();
    } else {
        document.getElementById('adminAuthError').style.display = 'block';
        document.getElementById('adminPasswordInput').value = '';
        document.getElementById('adminPasswordInput').focus();
    }
}

// --- 管理ページ表示/非表示 ---

async function showAdminPage() {
    const landing = document.getElementById('landingScreen');
    const main = document.getElementById('mainWrapper');
    const admin = document.getElementById('adminPage');

    // アニメーション付き遷移
    landing.classList.add('page-transition-out-zoom');
    setTimeout(() => {
        landing.style.display = 'none';
        landing.classList.remove('page-transition-out-zoom');
        main.style.display = 'none';

        admin.style.display = 'flex';
        admin.classList.add('page-transition-zoom-in');
        setTimeout(() => {
            admin.classList.remove('page-transition-zoom-in');
        }, 350);
    }, 250);

    adminCurrentCategory = 'symbol';
    adminCurrentViewMode = 'edit';
    document.getElementById('adminViewToggleBtn').textContent = '一覧表示';
    document.getElementById('adminTableModeContainer').classList.remove('active');
    document.getElementById('adminEditModeContainer').classList.add('active');
    await adminLoadRules(adminCurrentLabel);
    adminRenderCardMode();
    adminRenderOptions();
}

function goToHomeFromAdmin() {
    const admin = document.getElementById('adminPage');
    const landing = document.getElementById('landingScreen');

    admin.classList.add('page-transition-out-down');
    setTimeout(() => {
        admin.style.display = 'none';
        admin.classList.remove('page-transition-out-down');

        landing.style.display = 'flex';
        landing.classList.add('page-transition-up');
        setTimeout(() => {
            landing.classList.remove('page-transition-up');
        }, 350);
    }, 200);
}

// --- レーベル切替 ---

async function adminChangeLabel() {
    const sel = document.getElementById('adminLabelSelector');
    adminCurrentLabel = sel.value;
    await adminLoadRules(adminCurrentLabel);
    if (adminCurrentViewMode === 'list') {
        adminRenderListMode();
    } else {
        adminRenderCardMode();
    }
    adminRenderOptions();
}

// --- ルール読み込み ---

async function adminLoadRules(labelValue) {
    if (!window.electronAPI || !window.electronAPI.isElectron) {
        adminProofRules = [];
        adminSymbolRules = [...defaultSymbolRules];
        adminOptions = {};
        return;
    }
    try {
        const result = await window.electronAPI.readMasterRule(labelValue);
        if (result.success && result.data && result.data.proofRules) {
            adminProofRules = JSON.parse(JSON.stringify(result.data.proofRules.proof || []));
            adminSymbolRules = JSON.parse(JSON.stringify(result.data.proofRules.symbol || defaultSymbolRules));
            adminOptions = JSON.parse(JSON.stringify(result.data.proofRules.options || {}));
        } else {
            adminProofRules = [];
            adminSymbolRules = [...defaultSymbolRules];
            adminOptions = {};
            showAdminToast('ルール読み込みに失敗しました: ' + (result.error || ''), 'error');
        }
    } catch (e) {
        console.error('管理モード ルール読み込みエラー:', e);
        adminProofRules = [];
        adminSymbolRules = [...defaultSymbolRules];
        adminOptions = {};
        showAdminToast('ルール読み込みエラー', 'error');
    }
}

// --- カード形式描画（抽出プロンプトページと統一） ---

function adminRenderCardMode() {
    const grid = document.getElementById('adminCardGrid');
    grid.innerHTML = '';

    // サイドバー生成
    const sidebar = document.createElement('aside');
    sidebar.className = 'edit-sidebar';

    adminCategories.forEach(cat => {
        let activeCount, totalCount;
        if (cat.isNumber) {
            activeCount = 3;
            totalCount = 3;
        } else if (cat.key === 'symbol') {
            const rules = adminSymbolRules;
            activeCount = rules.filter(r => r.active !== false).length;
            totalCount = rules.length;
        } else if (cat.subCategories) {
            const rules = adminProofRules.filter(r => cat.subCategories.includes(r.category));
            activeCount = rules.filter(r => r.active !== false).length;
            totalCount = rules.length;
        } else {
            const rules = adminProofRules.filter(r => r.category === cat.key);
            activeCount = rules.filter(r => r.active !== false).length;
            totalCount = rules.length;
        }

        const btn = document.createElement('button');
        btn.className = 'edit-sidebar-item' + (adminCurrentCategory === cat.key ? ' active' : '');
        btn.setAttribute('data-category', cat.key);
        btn.innerHTML = `
            <span class="label">${cat.icon} ${cat.name}</span>
            <span class="count">${activeCount}/${totalCount}</span>
        `;
        btn.onclick = () => adminChangeCategory(cat.key);
        sidebar.appendChild(btn);
    });

    // 補助動詞チェックボックス（サイドバー下部）
    const auxRules = adminProofRules.filter(r => r.category === 'auxiliary');
    const auxActive = auxRules.some(r => r.active !== false);
    const auxDiv = document.createElement('div');
    auxDiv.style.marginTop = 'auto';
    auxDiv.innerHTML = `
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.8em; padding:10px 12px; border-top:1px solid #eee; color:#555;">
            <input type="checkbox" ${auxActive ? 'checked' : ''}
                   onchange="adminToggleAuxiliaryAll(this.checked)">
            <span>📖 補助動詞はひらく</span>
        </label>
    `;
    sidebar.appendChild(auxDiv);

    // 常用外漢字チェックボックス（管理モード）
    const nonJoyoDiv = document.createElement('div');
    nonJoyoDiv.innerHTML = `
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.8em; padding:10px 12px; border-top:1px solid #eee; color:#555;">
            <input type="checkbox" ${adminOptions.nonJoyoCheck !== false ? 'checked' : ''}
                   onchange="adminUpdateOption('nonJoyoCheck', this.checked)">
            <span>🔤 常用外漢字を検出</span>
        </label>
    `;
    sidebar.appendChild(nonJoyoDiv);

    grid.appendChild(sidebar);

    // メインエリア生成
    const main = document.createElement('main');
    main.className = 'edit-main';

    const selectedCat = adminCategories.find(c => c.key === adminCurrentCategory);
    if (selectedCat) {
        adminRenderMainContent(main, selectedCat);
    }

    grid.appendChild(main);
}

function adminRenderMainContent(main, cat) {
    // 表記変更カテゴリ（basic + recommended 統合）
    if (cat.subCategories) {
        adminRenderNotationMainContent(main, cat);
        return;
    }

    // 数字カテゴリ
    if (cat.isNumber) {
        adminRenderNumberMainContent(main, cat);
        return;
    }

    let rules;
    if (cat.key === 'symbol') {
        rules = adminSymbolRules;
    } else {
        rules = adminProofRules.filter(r => r.category === cat.key);
    }

    const activeCount = rules.filter(r => r.active !== false).length;
    const totalCount = rules.length;

    main.innerHTML = `
        <div class="edit-main-header">
            <h3>${cat.icon} ${cat.name} <span style="font-weight:normal; font-size:0.85em; color:#888;">(${activeCount}/${totalCount})</span></h3>
            <button class="add-btn" onclick="adminAddRule()">+ ルール追加</button>
        </div>
        <div class="edit-main-body"></div>
    `;

    const body = main.querySelector('.edit-main-body');

    if (rules.length === 0) {
        body.innerHTML = '<div class="edit-main-empty">ルールがありません</div>';
        return;
    }

    rules.forEach((rule, idx) => {
        const realIndex = cat.key === 'symbol' ? idx : adminProofRules.indexOf(rule);
        const card = document.createElement('div');
        card.className = 'edit-rule-card';
        card.onclick = (e) => {
            if (e.target.type !== 'checkbox' && !e.target.classList.contains('admin-delete-btn')) {
                openAdminEditModal(realIndex, cat.key);
            }
        };

        const displayDst = rule.dst === ' ' ? '(半角スペース)' : escapeHtml(rule.dst || '');

        // 難読漢字の処理
        if (cat.key === 'difficult' && !rule.userAdded) {
            // デフォルトルール → ひらく固定、ドロップダウンなし
            rule.mode = 'open';
            rule.active = true;
            card.innerHTML = `
                <button class="admin-delete-btn" onclick="event.stopPropagation(); adminDeleteRule(${realIndex}, '${cat.key}')" title="削除">\u00D7</button>
                <div class="edit-rule-top difficult-top">
                    <span class="difficult-mode-label">ひらく</span>
                    <div class="edit-rule-conversion">
                        <span class="edit-rule-src">${escapeHtml(rule.src || '')}</span>
                        <span class="edit-rule-arrow">\u2192</span>
                        <span class="edit-rule-dst">${displayDst}</span>
                    </div>
                    <button class="edit-rule-btn" onclick="event.stopPropagation(); openAdminEditModal(${realIndex}, '${cat.key}')">✎</button>
                </div>
                ${rule.note ? `<div class="edit-rule-note">${escapeHtml(rule.note)}</div>` : ''}
            `;
        } else if (cat.key === 'difficult' && rule.userAdded) {
            // ユーザー追加ルール → ドロップダウン表示
            if (!rule.mode) rule.mode = 'open';
            if (rule.mode === 'none') card.classList.add('inactive');
            card.innerHTML = `
                <button class="admin-delete-btn" onclick="event.stopPropagation(); adminDeleteRule(${realIndex}, '${cat.key}')" title="削除">\u00D7</button>
                <div class="edit-rule-top difficult-top">
                    <select class="difficult-mode-select" onclick="event.stopPropagation();" onchange="adminChangeDifficultMode(${realIndex}, this.value)">
                        <option value="open" ${rule.mode === 'open' ? 'selected' : ''}>ひらく</option>
                        <option value="ruby" ${rule.mode === 'ruby' ? 'selected' : ''}>ルビをつける</option>
                        <option value="none" ${rule.mode === 'none' ? 'selected' : ''}>そのまま</option>
                    </select>
                    <div class="edit-rule-conversion">
                        <span class="edit-rule-src">${escapeHtml(rule.src || '')}</span>
                        <span class="edit-rule-arrow">\u2192</span>
                        <span class="edit-rule-dst">${displayDst}</span>
                    </div>
                    <button class="edit-rule-btn" onclick="event.stopPropagation(); openAdminEditModal(${realIndex}, '${cat.key}')">✎</button>
                </div>
                ${rule.note ? `<div class="edit-rule-note">${escapeHtml(rule.note)}</div>` : ''}
            `;
        } else {
            if (rule.active === false) card.classList.add('inactive');
            card.innerHTML = `
                <button class="admin-delete-btn" onclick="event.stopPropagation(); adminDeleteRule(${realIndex}, '${cat.key}')" title="削除">\u00D7</button>
                <div class="edit-rule-top">
                    <input type="checkbox" class="edit-rule-checkbox" ${rule.active !== false ? 'checked' : ''}
                           onclick="event.stopPropagation(); adminToggleActive(${realIndex}, '${cat.key}', this.checked)">
                    <div class="edit-rule-conversion">
                        <span class="edit-rule-src">${escapeHtml(rule.src || '')}</span>
                        <span class="edit-rule-arrow">\u2192</span>
                        <span class="edit-rule-dst">${displayDst}</span>
                    </div>
                    <button class="edit-rule-btn" onclick="event.stopPropagation(); openAdminEditModal(${realIndex}, '${cat.key}')">✎</button>
                </div>
                ${rule.note ? `<div class="edit-rule-note">${escapeHtml(rule.note)}</div>` : ''}
            `;
        }

        body.appendChild(card);
    });
}

// 管理モード：表記変更カテゴリ専用描画
function adminRenderNotationMainContent(main, cat) {
    const notationRules = adminProofRules.filter(r => r.category === 'basic' || r.category === 'recommended');
    const activeCount = notationRules.filter(r => r.active !== false).length;
    const totalCount = notationRules.length;

    main.innerHTML = `
        <div class="edit-main-header">
            <h3>${cat.icon} ${cat.name} <span style="font-weight:normal; font-size:0.85em; color:#888;">(${activeCount}/${totalCount})</span></h3>
            <button class="add-btn" onclick="adminAddRuleWithCategory('basic')">+ ルール追加</button>
        </div>
        <div class="edit-main-body"></div>
    `;

    const body = main.querySelector('.edit-main-body');

    if (notationRules.length === 0) {
        body.innerHTML = '<div class="edit-main-empty">ルールがありません</div>';
    } else {
        // basic / recommended をセクション区切りで描画
        const sectionDefs = [
            { key: 'basic', name: categories.basic.name, color: categories.basic.color },
            { key: 'recommended', name: categories.recommended.name, color: categories.recommended.color }
        ];

        sectionDefs.forEach(sec => {
            const sectionRules = notationRules.filter(r => r.category === sec.key);
            if (sectionRules.length === 0) return;

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
                const realIndex = adminProofRules.indexOf(rule);
                const categoryKey = rule.category;
                const card = document.createElement('div');
                card.className = 'edit-rule-card';
                if (rule.active === false) card.classList.add('inactive');
                card.onclick = (e) => {
                    if (e.target.type !== 'checkbox' && !e.target.classList.contains('admin-delete-btn')) {
                        openAdminEditModal(realIndex, categoryKey);
                    }
                };
                const displayDst = rule.dst === ' ' ? '(半角スペース)' : escapeHtml(rule.dst || '');
                card.innerHTML = `
                    <button class="admin-delete-btn" onclick="event.stopPropagation(); adminDeleteRule(${realIndex}, '${categoryKey}')" title="削除">\u00D7</button>
                    <div class="edit-rule-top">
                        <input type="checkbox" class="edit-rule-checkbox" ${rule.active !== false ? 'checked' : ''}
                               onclick="event.stopPropagation(); adminToggleActive(${realIndex}, '${categoryKey}', this.checked)">
                        <div class="edit-rule-conversion">
                            <span class="edit-rule-src">${escapeHtml(rule.src || '')}</span>
                            <span class="edit-rule-arrow">\u2192</span>
                            <span class="edit-rule-dst">${displayDst}</span>
                        </div>
                        <button class="edit-rule-btn" onclick="event.stopPropagation(); openAdminEditModal(${realIndex}, '${categoryKey}')">✎</button>
                    </div>
                    ${rule.note ? `<div class="edit-rule-note">${escapeHtml(rule.note)}</div>` : ''}
                `;
                cardsContainer.appendChild(card);
            });

            section.appendChild(cardsContainer);
            body.appendChild(section);
        });
    }
}

function adminAddRuleWithCategory(category) {
    const newRule = { src: '', dst: '', note: '', active: true, category: category };
    adminProofRules.push(newRule);
    const newIndex = adminProofRules.length - 1;
    adminRenderCardMode();
    openAdminEditModal(newIndex, category);
}

// --- 表示モード切り替え（編集 ⇔ 一覧） ---

function adminToggleViewMode() {
    if (adminCurrentViewMode === 'edit') {
        adminCurrentViewMode = 'list';
        adminShowListMode();
    } else {
        adminCurrentViewMode = 'edit';
        adminShowEditMode();
    }
}

function adminShowEditMode() {
    document.getElementById('adminTableModeContainer').classList.remove('active');
    document.getElementById('adminEditModeContainer').classList.add('active');
    document.getElementById('adminViewToggleBtn').textContent = '一覧表示';
    adminRenderCardMode();
}

// 管理モード：数字カテゴリ専用描画
function adminRenderNumberMainContent(main, cat) {
    main.innerHTML = `
        <div class="edit-main-header">
            <h3>${cat.icon} ${cat.name} <span style="font-weight:normal; font-size:0.85em; color:#888;">(3/3)</span></h3>
        </div>
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
    baseSel.onchange = function() { adminOptions.state.numberRuleBase = parseInt(this.value); };
    numberBaseOptions.forEach((opt, i) => {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = opt;
        if (i === (adminOptions.state.numberRuleBase || 0)) option.selected = true;
        baseSel.appendChild(option);
    });
    baseBanner.appendChild(baseSel);
    body.appendChild(baseBanner);

    // 3つのサブルールカード
    Object.keys(numberSubRules).forEach(key => {
        const sub = numberSubRules[key];
        let currentVal;
        if (key === 'personCount') currentVal = adminOptions.state.numberRulePersonCount || 0;
        else if (key === 'thingCount') currentVal = adminOptions.state.numberRuleThingCount || 0;
        else currentVal = adminOptions.state.numberRuleMonth || 0;

        const card = document.createElement('div');
        card.className = 'number-card';

        const top = document.createElement('div');
        top.className = 'number-card-top';

        const label = document.createElement('span');
        label.className = 'number-rule-label';
        label.textContent = sub.name;

        const sel = document.createElement('select');
        sel.className = 'number-mode-select';
        sel.onclick = (e) => e.stopPropagation();
        sel.onchange = function() { adminChangeNumberMode(key, this.value); };
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

function adminChangeNumberMode(subRule, value) {
    const v = parseInt(value);
    if (subRule === 'personCount') adminOptions.state.numberRulePersonCount = v;
    else if (subRule === 'thingCount') adminOptions.state.numberRuleThingCount = v;
    else if (subRule === 'month') adminOptions.state.numberRuleMonth = v;
    adminRenderCardMode();
}

function adminShowListMode() {
    document.getElementById('adminEditModeContainer').classList.remove('active');
    document.getElementById('adminTableModeContainer').classList.add('active');
    document.getElementById('adminViewToggleBtn').textContent = '編集に戻る';
    adminRenderListMode();
}

function adminRenderListMode() {
    const grid = document.getElementById('adminCategoryGrid');
    grid.innerHTML = '';

    // カラム1: 表記変更
    const col1 = adminRenderListGroupedColumn('表記変更', [
        { key: 'basic', name: '表記変更', rules: adminProofRules.filter(r => r.category === 'basic' || r.category === 'recommended') }
    ]);
    grid.appendChild(col1);

    // カラム2: 補助動詞 + 人称 + 人物名
    const col2 = adminRenderListGroupedColumn('補助動詞・人称・人物名', [
        { key: 'auxiliary', name: '補助動詞', rules: adminProofRules.filter(r => r.category === 'auxiliary') },
        { key: 'pronoun', name: '人称', rules: adminProofRules.filter(r => r.category === 'pronoun') },
        { key: 'character', name: '人物名', rules: adminProofRules.filter(r => r.category === 'character') }
    ]);
    grid.appendChild(col2);

    // カラム3: 数字 + 難読文字
    const col3 = document.createElement('div');
    col3.className = 'category-box';

    // 数字サマリー
    const personVal = adminOptions.state.numberRulePersonCount || 0;
    const thingVal = adminOptions.state.numberRuleThingCount || 0;
    const monthVal = adminOptions.state.numberRuleMonth || 0;
    col3.innerHTML = `
        <div class="category-header" style="background:var(--copper);">
            <span>🔢 数字</span>
            <span class="count">3/3</span>
        </div>
        <div class="number-summary" style="cursor:pointer;" onclick="adminCurrentCategory='number'; adminCurrentViewMode='edit'; adminShowEditMode();">
            <div><span class="number-summary-label">基本</span>${numberBaseOptions[adminOptions.state.numberRuleBase] || numberBaseOptions[0]}</div>
            <div><span class="number-summary-label">人数</span>${numberSubRules.personCount.options[personVal]}</div>
            <div><span class="number-summary-label">戸数</span>${numberSubRules.thingCount.options[thingVal]}</div>
            <div><span class="number-summary-label">月</span>${numberSubRules.month.options[monthVal]}</div>
        </div>
    `;

    // 難読文字テーブル
    const difficultRules = adminProofRules.filter(r => r.category === 'difficult');
    const difficultSection = adminRenderListColumn('難読文字', difficultRules, 'difficult');
    // 難読文字のcategory-contentだけをcol3に追加
    col3.innerHTML += difficultSection.innerHTML;

    grid.appendChild(col3);
}

function adminRenderListGroupedColumn(title, categories) {
    const box = document.createElement('div');
    box.className = 'category-box';

    let html = `<div class="category-header recommended"><span>${title}</span></div>`;
    html += `<div class="category-content" style="overflow-y: auto;">`;

    categories.forEach(catDef => {
        if (catDef.rules.length === 0) return;
        const activeCount = catDef.rules.filter(r => r.active !== false).length;
        const countLabel = catDef.key === 'auxiliary' ? '' : ` <span style="color:#888;">(${activeCount}/${catDef.rules.length})</span>`;
        html += `
            <div class="sub-category-header" style="background:var(--surface-dim); padding:6px 10px; font-size:0.75em; font-weight:bold; color:var(--text-secondary); border-bottom:1px solid var(--border);">
                ${catDef.name}${countLabel}
            </div>
            <table class="category-table excel-style" data-category="${catDef.key}">
                <tbody></tbody>
            </table>
        `;
    });

    html += `</div>`;
    box.innerHTML = html;

    categories.forEach(catDef => {
        // 補助動詞は一括チェックボックス + 具体例表示のみ
        if (catDef.key === 'auxiliary') {
            const auxTable = box.querySelector(`table[data-category="auxiliary"]`);
            if (!auxTable) return;
            const isActive = catDef.rules.some(r => r.active !== false);
            const wrapper = document.createElement('div');
            wrapper.style.padding = '8px 10px';
            wrapper.innerHTML = `
                <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.85em; margin-bottom:6px;">
                    <input type="checkbox" ${isActive ? 'checked' : ''}
                           onchange="adminToggleAuxiliaryAll(this.checked)">
                    <span>補助動詞はひらく</span>
                </label>
                <div style="font-size:0.7em; color:#999; padding-left:22px;">
                    ${catDef.rules.map(r => `${escapeHtml(r.src || '')} → ${escapeHtml(r.dst || '')}`).join('、')}
                </div>
            `;
            auxTable.parentNode.replaceChild(wrapper, auxTable);
            return;
        }

        const tbody = box.querySelector(`table[data-category="${catDef.key}"] tbody`);
        if (!tbody) return;

        catDef.rules.forEach((rule) => {
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            if (rule.active === false) tr.classList.add('inactive');
            tr.innerHTML = `
                <td class="col-on"><input type="checkbox" ${rule.active !== false ? 'checked' : ''} disabled></td>
                <td class="col-src">${escapeHtml(rule.src || '')}</td>
                <td class="col-arrow">\u2192</td>
                <td class="col-dst">${escapeHtml(rule.dst === ' ' ? '(半角SP)' : (rule.dst || ''))}</td>
            `;
            tr.addEventListener('click', (e) => {
                if (e.target.type === 'checkbox') return;
                if (catDef.key === 'basic' || catDef.key === 'recommended') {
                    adminCurrentCategory = 'notation';
                } else {
                    adminCurrentCategory = catDef.key;
                }
                adminCurrentViewMode = 'edit';
                adminShowEditMode();
            });
            tbody.appendChild(tr);
        });
    });

    return box;
}

function adminRenderListColumn(title, rules, categoryKey) {
    // デフォルトルールはひらく固定
    rules.forEach(r => {
        if (!r.userAdded) { r.mode = 'open'; r.active = true; }
    });

    const defaultCount = rules.filter(r => !r.userAdded).length;
    const userAddedCount = rules.filter(r => r.userAdded).length;
    const headerNote = userAddedCount > 0
        ? `デフォルト${defaultCount}件：ひらく固定 ／ 追加${userAddedCount}件`
        : `すべてひらく`;

    const box = document.createElement('div');
    box.className = 'category-box';
    box.innerHTML = `
        <div class="category-header basic">
            <span>${title}（${headerNote}）</span>
            <span class="count">${rules.length}</span>
        </div>
        <div class="category-content">
            <table class="category-table excel-style">
                <tbody></tbody>
            </table>
        </div>
    `;

    const tbody = box.querySelector('tbody');
    rules.forEach((rule) => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        if (rule.userAdded && rule.mode === 'none') tr.classList.add('inactive');
        const modeLabel = rule.userAdded
            ? `<td class="col-status"><span class="diff-status-badge ${rule.mode}">${rule.mode === 'open' ? 'ひらく' : rule.mode === 'ruby' ? 'ルビ' : 'なし'}</span></td>`
            : `<td class="col-status"><span class="diff-status-badge open">ひらく</span></td>`;
        tr.innerHTML = `
            ${modeLabel}
            <td class="col-src">${escapeHtml(rule.src || '')}</td>
            <td class="col-arrow">\u2192</td>
            <td class="col-dst">${escapeHtml(rule.dst === ' ' ? '(半角SP)' : (rule.dst || ''))}</td>
        `;
        tr.addEventListener('click', () => {
            adminCurrentCategory = categoryKey;
            adminCurrentViewMode = 'edit';
            adminShowEditMode();
        });
        tbody.appendChild(tr);
    });

    return box;
}

// --- オプション描画 ---

function adminRenderOptions() {
    const optList = document.getElementById('adminOptionsList');
    const optionDefs = [
        { key: 'ngWordMasking', label: '伏字対応' },
        { key: 'punctuationToSpace', label: '句読点→半角スペース' },
        { key: 'difficultRuby', label: '難読漢字にルビ' },
        { key: 'typoCheck', label: '誤字チェック' },
        { key: 'missingCharCheck', label: '脱字チェック' },
        { key: 'nameRubyCheck', label: '人名ルビふり確認' },
        { key: 'nonJoyoCheck', label: '常用外漢字チェック' }
    ];
    let html = '';
    optionDefs.forEach(opt => {
        const checked = adminOptions[opt.key] ? 'checked' : '';
        html += `<div class="admin-option-item">
            <input type="checkbox" id="adminOpt_${opt.key}" ${checked} onchange="adminUpdateOption('${opt.key}', this.checked)">
            <label for="adminOpt_${opt.key}">${opt.label}</label>
        </div>`;
    });
    optList.innerHTML = html;
}

// --- カテゴリ切替 ---

function adminChangeCategory(cat) {
    adminCurrentCategory = cat;
    adminRenderCardMode();
}

// --- ルール操作 ---

function adminToggleActive(index, category, active) {
    if (category === 'symbol') {
        adminSymbolRules[index].active = active;
    } else {
        adminProofRules[index].active = active;
    }
    adminRenderCardMode();
}

function adminChangeDifficultMode(index, mode) {
    adminProofRules[index].mode = mode;
    adminProofRules[index].active = (mode !== 'none');
    adminRenderCardMode();
}

function adminToggleAuxiliaryAll(active) {
    adminProofRules.forEach(r => {
        if (r.category === 'auxiliary') {
            r.active = active;
        }
    });
    adminRenderCardMode();
}

function adminAddRule() {
    // 新規ルールを追加してから編集モーダルを開く
    let newIndex;
    if (adminCurrentCategory === 'symbol') {
        adminSymbolRules.push({ src: '', dst: '', note: '', active: true });
        newIndex = adminSymbolRules.length - 1;
    } else {
        const newRule = { src: '', dst: '', note: '', active: true, category: adminCurrentCategory };
        if (adminCurrentCategory === 'difficult') {
            newRule.mode = 'open';
            newRule.userAdded = true;
        }
        adminProofRules.push(newRule);
        newIndex = adminProofRules.length - 1;
    }
    adminRenderCardMode();
    openAdminEditModal(newIndex, adminCurrentCategory);
}

function adminDeleteRule(index, category) {
    if (!confirm('このルールを削除しますか？')) return;
    if (category === 'symbol') {
        adminSymbolRules.splice(index, 1);
    } else {
        adminProofRules.splice(index, 1);
    }
    adminRenderCardMode();
}

// --- 編集モーダル ---

function openAdminEditModal(index, category) {
    const modal = document.getElementById('adminEditModal');
    const rule = category === 'symbol' ? adminSymbolRules[index] : adminProofRules[index];
    if (!rule) return;

    document.getElementById('admin_edit_index').value = index;
    document.getElementById('admin_edit_category').value = category;
    document.getElementById('admin_edit_src').value = rule.src || '';
    document.getElementById('admin_edit_dst').value = rule.dst || '';
    document.getElementById('admin_edit_note').value = rule.note || '';

    const catInfo = adminCategories.find(c => c.key === category);
    document.getElementById('adminEditModalTitle').textContent = (catInfo ? catInfo.name + ' - ' : '') + 'ルール編集';

    modal.style.display = 'flex';
    setTimeout(() => document.getElementById('admin_edit_src').focus(), 100);
}

function closeAdminEditModal() {
    document.getElementById('adminEditModal').style.display = 'none';
}

function adminSaveFromModal() {
    const index = parseInt(document.getElementById('admin_edit_index').value);
    const category = document.getElementById('admin_edit_category').value;
    const src = document.getElementById('admin_edit_src').value;
    const dst = document.getElementById('admin_edit_dst').value;
    const note = document.getElementById('admin_edit_note').value;

    // バリデーション
    if (!src.trim()) {
        showToast('変換元を入力してください', 'warning');
        return;
    }
    if (!dst.trim() && category !== 'character') {
        showToast('変換先を入力してください', 'warning');
        return;
    }

    if (category === 'symbol') {
        adminSymbolRules[index].src = src;
        adminSymbolRules[index].dst = dst;
        adminSymbolRules[index].note = note;
    } else {
        adminProofRules[index].src = src;
        adminProofRules[index].dst = dst;
        adminProofRules[index].note = note;
    }

    closeAdminEditModal();
    adminRenderCardMode();
}

function adminDeleteFromModal() {
    const index = parseInt(document.getElementById('admin_edit_index').value);
    const category = document.getElementById('admin_edit_category').value;
    if (!confirm('このルールを削除しますか？')) return;

    if (category === 'symbol') {
        adminSymbolRules.splice(index, 1);
    } else {
        adminProofRules.splice(index, 1);
    }

    closeAdminEditModal();
    adminRenderCardMode();
}

// --- オプション変更 ---

function adminUpdateOption(key, value) {
    adminOptions[key] = value;
}

// --- 保存 ---

async function adminSaveRules() {
    if (!confirm('マスタールールを上書き保存しますか？\nレーベル: ' + adminCurrentLabel)) return;

    const data = {
        proofRules: {
            proof: adminProofRules,
            symbol: adminSymbolRules,
            options: adminOptions
        }
    };

    try {
        const result = await window.electronAPI.writeMasterRule(adminCurrentLabel, data);
        if (result.success) {
            showAdminToast('保存しました', 'success');
        } else {
            showAdminToast('保存に失敗しました: ' + (result.error || ''), 'error');
        }
    } catch (e) {
        console.error('管理モード 保存エラー:', e);
        showAdminToast('保存エラーが発生しました', 'error');
    }
}

// --- 新規レーベル ---

function showNewLabelDialog() {
    document.getElementById('newLabelModal').style.display = 'flex';
    document.getElementById('newLabelKey').value = '';
    document.getElementById('newLabelDisplayName').value = '';
    document.getElementById('newLabelError').style.display = 'none';
}

function closeNewLabelDialog() {
    document.getElementById('newLabelModal').style.display = 'none';
}

async function createNewLabel() {
    const key = document.getElementById('newLabelKey').value.trim();
    const displayName = document.getElementById('newLabelDisplayName').value.trim();
    const errorEl = document.getElementById('newLabelError');

    if (!key || !displayName) {
        errorEl.textContent = 'すべての項目を入力してください';
        errorEl.style.display = 'block';
        return;
    }

    if (!/^[a-z0-9_]+$/.test(key)) {
        errorEl.textContent = 'レーベルキーは英小文字・数字・アンダースコアのみ使用できます';
        errorEl.style.display = 'block';
        return;
    }

    // 既存チェック
    const sel = document.getElementById('adminLabelSelector');
    for (let i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === key) {
            errorEl.textContent = 'このレーベルキーは既に存在します';
            errorEl.style.display = 'block';
            return;
        }
    }

    try {
        const result = await window.electronAPI.createMasterLabel(key, displayName);
        if (result.success) {
            // 全ドロップダウンにオプション追加
            const allSelects = ['adminLabelSelector', 'labelSelector', 'landingLabelSelect', 'proofreadingLabelSelect'];
            allSelects.forEach(selId => {
                const s = document.getElementById(selId);
                if (s) {
                    const opt = document.createElement('option');
                    opt.value = key;
                    opt.textContent = displayName;
                    s.appendChild(opt);
                }
            });

            closeNewLabelDialog();
            showAdminToast('レーベル「' + displayName + '」を作成しました', 'success');

            // 新レーベルに切替
            sel.value = key;
            adminCurrentLabel = key;
            await adminLoadRules(key);
            adminRenderSidebar();
            adminRenderRules();
        } else {
            errorEl.textContent = '作成に失敗しました: ' + (result.error || '');
            errorEl.style.display = 'block';
        }
    } catch (e) {
        console.error('新規レーベル作成エラー:', e);
        errorEl.textContent = '作成中にエラーが発生しました';
        errorEl.style.display = 'block';
    }
}

// --- トースト通知 ---

function showAdminToast(message, type) {
    const existing = document.querySelector('.admin-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'admin-toast ' + (type || 'success');
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ========================================
// ドロップダウン動的生成（マスターから読み込み）
// ========================================

// マスターフォルダからレーベル一覧を取得してドロップダウンを生成
async function populateLabelDropdowns() {
    try {
        const result = await window.electronAPI.getMasterLabelList();
        if (!result.success || !result.labels) {
            console.error('レーベル一覧の取得に失敗:', result.error);
            return;
        }

        const labels = result.labels;

        // ソート: defaultを先頭に、その他はdisplayName順
        labels.sort((a, b) => {
            if (a.key === 'default') return -1;
            if (b.key === 'default') return 1;
            return a.displayName.localeCompare(b.displayName, 'ja');
        });

        // 各ドロップダウンにオプションを追加
        const dropdownIds = ['landingLabelSelect', 'labelSelector', 'proofreadingLabelSelect', 'adminLabelSelector'];

        dropdownIds.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (!select) return;

            // 既存のオプションをクリア
            select.innerHTML = '';

            // labelSelectorには先頭にプレースホルダーを追加
            if (selectId === 'labelSelector') {
                const placeholder = document.createElement('option');
                placeholder.value = '';
                placeholder.disabled = true;
                placeholder.style.display = 'none';
                placeholder.textContent = '---';
                select.appendChild(placeholder);
            }

            // レーベルオプションを追加
            labels.forEach(label => {
                const option = document.createElement('option');
                option.value = label.key;
                option.textContent = label.displayName;
                select.appendChild(option);
            });

            // デフォルト値を設定
            if (labels.length > 0) {
                select.value = 'default';
            }
        });

        console.log('ドロップダウンを生成しました:', labels.map(l => l.displayName));
    } catch (error) {
        console.error('ドロップダウン生成エラー:', error);
    }
}

// ページ読み込み時に初期化
document.addEventListener('DOMContentLoaded', async () => {
    // COMIC-POTハンドオフ: push型リスナー（ProGen起動済み時のsecond-instance用）
    if (window.electronAPI && window.electronAPI.onComicPotHandoff) {
        window.electronAPI.onComicPotHandoff((data) => {
            cpLoadFromHandoff(data);
        });
    }
    // COMIC-POTハンドオフ: pull型チェック（初回起動用）
    if (window.electronAPI && window.electronAPI.getComicPotHandoff) {
        console.log('[HANDOFF] pull型チェック開始');
        window.electronAPI.getComicPotHandoff().then((data) => {
            console.log('[HANDOFF] pull型レスポンス:', data);
            if (data) cpLoadFromHandoff(data);
        }).catch(err => {
            console.error('[HANDOFF] pull型エラー:', err);
        });
    } else {
        console.log('[HANDOFF] getComicPotHandoff APIなし');
    }

    await populateLabelDropdowns();
});


// ES Module exports
export { showAdminAuthDialog, closeAdminAuthDialog, authenticateAdmin, showAdminPage, goToHomeFromAdmin, adminChangeLabel, adminLoadRules, adminRenderCardMode, adminRenderMainContent, adminRenderNotationMainContent, adminAddRuleWithCategory, adminToggleViewMode, adminShowEditMode, adminRenderNumberMainContent, adminChangeNumberMode, adminShowListMode, adminRenderListMode, adminRenderListGroupedColumn, adminRenderListColumn, adminRenderOptions, adminChangeCategory, adminToggleActive, adminChangeDifficultMode, adminToggleAuxiliaryAll, adminAddRule, adminDeleteRule, openAdminEditModal, closeAdminEditModal, adminSaveFromModal, adminDeleteFromModal, adminUpdateOption, adminSaveRules, showNewLabelDialog, closeNewLabelDialog, createNewLabel, showAdminToast, populateLabelDropdowns };

// Expose to window for inline HTML handlers
Object.assign(window, { showAdminAuthDialog, closeAdminAuthDialog, authenticateAdmin, showAdminPage, goToHomeFromAdmin, adminChangeLabel, adminLoadRules, adminRenderCardMode, adminRenderMainContent, adminRenderNotationMainContent, adminAddRuleWithCategory, adminToggleViewMode, adminShowEditMode, adminRenderNumberMainContent, adminChangeNumberMode, adminShowListMode, adminRenderListMode, adminRenderListGroupedColumn, adminRenderListColumn, adminRenderOptions, adminChangeCategory, adminToggleActive, adminChangeDifficultMode, adminToggleAuxiliaryAll, adminAddRule, adminDeleteRule, openAdminEditModal, closeAdminEditModal, adminSaveFromModal, adminDeleteFromModal, adminUpdateOption, adminSaveRules, showNewLabelDialog, closeNewLabelDialog, createNewLabel, showAdminToast, populateLabelDropdowns });
