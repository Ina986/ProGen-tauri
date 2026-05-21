// tauri-bridge.js
// Electron の preload.js (window.electronAPI) を Tauri の invoke で再現するブリッジ層
// progen.js は変更不要でそのまま動作する

(function () {
    const { invoke, convertFileSrc } = window.__TAURI__.core;
    const { listen } = window.__TAURI__.event;
    const { openUrl } = window.__TAURI__.opener;

    // asset://プロトコルでローカルファイルをimgのsrcに使える
    window.convertFileSrc = convertFileSrc;

    window.electronAPI = {
        // Electron環境フラグ（互換性のため true を維持）
        isElectron: true,

        // プラットフォーム情報
        platform: 'win32',

        // JSONフォルダのベースパスを取得
        getJsonFolderPath: () => invoke('get_json_folder_path'),

        // フォルダ内の一覧を取得
        listDirectory: (dirPath) => invoke('list_directory', { dirPath: dirPath || null }),

        // JSONファイルを読み込み
        readJsonFile: (filePath) => invoke('read_json_file', { filePath }),

        // JSONファイルを書き込み
        writeJsonFile: (filePath, data) => invoke('write_json_file', { filePath, data }),

        // マスタールールJSONを読み込み
        readMasterRule: (labelValue) => invoke('read_master_rule', { labelValue }),

        // マスタールールJSONをGドライブに書き込み
        writeMasterRule: (labelValue, data) => invoke('write_master_rule', { labelValue, data }),

        // 新規レーベルを作成
        createMasterLabel: (labelKey, displayName) => invoke('create_master_label', { labelKey, displayName }),

        // マスタールールのレーベル一覧を取得
        getMasterLabelList: () => invoke('get_master_label_list'),

        // 校正テキストログ側に作品フォルダを作成
        createTxtWorkFolder: (label, work) => invoke('create_txt_work_folder', { label, work }),

        // TXTフォルダのベースパスを取得
        getTxtFolderPath: () => invoke('get_txt_folder_path'),

        // TXTフォルダ内の一覧を取得
        listTxtDirectory: (dirPath) => invoke('list_txt_directory', { dirPath: dirPath || null }),

        // TXTファイルを読み込み
        readTxtFile: (filePath) => invoke('read_txt_file', { filePath }),

        // テキストファイルを指定パスに保存
        writeTextFile: (filePath, content) => invoke('write_text_file', { filePath, content }),

        // テキストファイル保存ダイアログを表示
        showSaveTextDialog: (defaultName) => invoke('show_save_text_dialog', { defaultName: defaultName || null }),

        // 仕様書PDF出力
        printToPDF: (htmlContent) => invoke('print_to_pdf', { htmlContent }),

        // 校正チェックデータを保存
        saveCalibrationData: (params) => invoke('save_calibration_data', { params }),

        // COMIC-Bridgeを起動
        launchComicBridge: (jsonFilePath) => invoke('launch_comic_bridge', { jsonFilePath }),

        // MojiQを起動して校正データJSONを渡す
        launchMojiqWithCalibration: (jsonFilePath) => invoke('launch_mojiq_with_calibration', { jsonFilePath }),

        // COMIC-POTハンドオフ受信（push通知）
        onComicPotHandoff: (callback) => {
            listen('comicpot-handoff', (event) => callback(event.payload));
        },

        // COMIC-POTハンドオフデータを要求（pull型）
        getComicPotHandoff: () => invoke('get_comicpot_handoff'),

        // 画像ビューアー
        showOpenImageFolderDialog: () => invoke('show_open_image_folder_dialog'),
        listImageFiles: (dirPath) => invoke('list_image_files', { dirPath }),
        listImageFilesFromPaths: (paths) => invoke('list_image_files_from_paths', { paths }),
        loadImagePreview: (filePath, maxSize) => invoke('load_image_preview', { filePath, maxSize: maxSize || 1600 }),
        readBinaryFileBase64: (filePath) => invoke('read_binary_file_base64', { filePath }),

        // D&Dで落とされたTXTファイルをパスから読み込み
        readDroppedTxtFiles: (paths) => invoke('read_dropped_txt_files', { paths }),

        // 校正結果JSONファイルを開いて読む
        openAndReadJsonDialog: () => invoke('open_and_read_json_dialog'),
        // 校正結果JSONファイル保存ダイアログ
        showSaveJsonDialog: (defaultName) => invoke('show_save_json_dialog', { defaultName: defaultName || null }),
    };

    // ===== グローバル Tauri D&D イベントリスナー =====
    // getCurrentWindow().onDragDropEvent() を使用（COMIC-Bridge と同じ方式）
    const _dragDropHandlers = [];

    window._registerDragDropHandler = function (handler) {
        _dragDropHandlers.push(handler);
    };

    // Tauri 2 の onDragDropEvent API を使用
    const { getCurrentWindow } = window.__TAURI__.window;
    const currentWindow = getCurrentWindow();

    // ===== カスタムタイトルバー用ウインドウコントロール =====
    async function confirmCloseWithUnsavedRules() {
        if (typeof window.hasUnsavedProofRules !== 'function' || !window.hasUnsavedProofRules()) {
            return true;
        }
        if (typeof window.confirmUnsavedProofRulesIfNeeded !== 'function') {
            return window.confirm('表記ルールの変更が保存されていません。保存せずにアプリを終了しますか？');
        }
        return await window.confirmUnsavedProofRulesIfNeeded('exit');
    }

    async function closeWindowAfterConfirm() {
        const confirmed = await confirmCloseWithUnsavedRules();
        if (!confirmed) return;

        if (typeof currentWindow.destroy === 'function') {
            await currentWindow.destroy();
        } else {
            await currentWindow.close();
        }
    }

    window.winMinimize = () => currentWindow.minimize();
    window.winToggleMaximize = async () => {
        const maximized = await currentWindow.isMaximized();
        if (maximized) currentWindow.unmaximize();
        else currentWindow.maximize();
    };
    window.winClose = () => closeWindowAfterConfirm();
    currentWindow.onCloseRequested(async (event) => {
        if (typeof window.hasUnsavedProofRules !== 'function' || !window.hasUnsavedProofRules()) return;

        event.preventDefault();
        await closeWindowAfterConfirm();
    });
    // 最大化状態が変わったら .is-maximized クラスを body に付与
    currentWindow.onResized(async () => {
        const m = await currentWindow.isMaximized();
        document.body.classList.toggle('is-maximized', m);
    });
    // 初期状態反映
    currentWindow.isMaximized().then((m) => {
        document.body.classList.toggle('is-maximized', m);
    });

    // ===== ヘッダーへアプリアイコン (左端) と ウインドウコントロール (右端) を注入 =====
    // 対象セレクタ: 各ヘッダー (.header-bar, .proofreading-header, .result-viewer-header, .cp-header)
    //              + ランディング画面 (.landing-screen)
    function buildAppIcon() {
        const img = document.createElement('img');
        img.src = 'logo/progen_p_icon.png';
        img.alt = '';
        img.className = 'header-app-icon';
        img.setAttribute('data-tauri-drag-region', '');
        return img;
    }
    function buildWindowControls() {
        const wrap = document.createElement('div');
        wrap.className = 'window-controls';
        wrap.innerHTML = `
            <button class="win-ctrl-btn" onclick="winMinimize()" title="最小化" aria-label="最小化">
                <svg viewBox="0 0 10 10" width="10" height="10"><rect x="0" y="4.5" width="10" height="1" fill="currentColor"/></svg>
            </button>
            <button class="win-ctrl-btn" onclick="winToggleMaximize()" title="最大化" aria-label="最大化">
                <svg class="win-ctrl-maximize-icon" viewBox="0 0 10 10" width="10" height="10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1"/></svg>
                <svg class="win-ctrl-restore-icon" viewBox="0 0 10 10" width="10" height="10"><rect x="2.5" y="0.5" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1"/><rect x="0.5" y="2.5" width="7" height="7" fill="var(--titlebar-bg, #fff)" stroke="currentColor" stroke-width="1"/></svg>
            </button>
            <button class="win-ctrl-btn win-ctrl-close" onclick="winClose()" title="閉じる" aria-label="閉じる">
                <svg viewBox="0 0 10 10" width="10" height="10"><line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" stroke-width="1"/><line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" stroke-width="1"/></svg>
            </button>
        `;
        return wrap;
    }

    // 子孫を再帰的にドラッグ領域化する。
    // インタラクティブ要素 (button/input/select/textarea/a) とその子孫はスキップ。
    // window-controls 配下と data-tauri-drag-region="false" の要素もスキップ。
    function markDraggableRecursive(el) {
        if (!el || el.nodeType !== 1) return;
        const tag = el.tagName.toLowerCase();
        if (tag === 'button' || tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'a') return;
        if (el.classList && el.classList.contains('window-controls')) return;
        if (el.classList && el.classList.contains('win-ctrl-btn')) return;
        if (el.getAttribute && el.getAttribute('data-tauri-drag-region') === 'false') return;
        el.setAttribute('data-tauri-drag-region', '');
        Array.from(el.children).forEach(markDraggableRecursive);
    }

    function injectHeaderTitlebar(el) {
        if (!el || el.dataset.titlebarInjected === '1') return;
        el.dataset.titlebarInjected = '1';
        el.insertBefore(buildAppIcon(), el.firstChild);
        el.appendChild(buildWindowControls());
        markDraggableRecursive(el);
    }

    // ランディング画面用: ヘッダー(.landing-header-bar)にウインドウコントロールのみ注入 / 全面ドラッグ可能
    function injectLandingTitlebar(landing) {
        if (!landing || landing.dataset.titlebarInjected === '1') return;
        landing.dataset.titlebarInjected = '1';
        const headerBar = landing.querySelector('.landing-header-bar');
        if (headerBar) {
            headerBar.appendChild(buildWindowControls());
        } else {
            // フォールバック: ヘッダーが無い場合は従来通り右上に絶対配置
            const controls = buildWindowControls();
            controls.classList.add('landing-window-controls');
            landing.appendChild(controls);
        }
        // ランディング画面全体を再帰的にドラッグ領域化（インタラクティブ要素は自動スキップ）
        markDraggableRecursive(landing);
    }

    function injectAllTitlebars() {
        // 通常ヘッダー (.landing-header-bar は landing 専用パスで処理するため除外)
        ['.header-bar:not(.landing-header-bar)', '.proofreading-header', '.result-viewer-header', '.cp-header'].forEach((sel) => {
            document.querySelectorAll(sel).forEach(injectHeaderTitlebar);
        });
        // ランディング画面
        document.querySelectorAll('.landing-screen').forEach(injectLandingTitlebar);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectAllTitlebars);
    } else {
        injectAllTitlebars();
    }
    // 動的に挿入された場合のフォールバック
    window.__injectAllTitlebars = injectAllTitlebars;

    currentWindow.onDragDropEvent((event) => {
        const payload = event.payload;

        if (payload.type === 'enter' || payload.type === 'over') {
            document.dispatchEvent(new CustomEvent('tauri-drag-enter'));
        } else if (payload.type === 'leave') {
            document.dispatchEvent(new CustomEvent('tauri-drag-leave'));
        } else if (payload.type === 'drop') {
            document.dispatchEvent(new CustomEvent('tauri-drag-leave'));
            const paths = payload.paths || [];
            if (paths.length === 0) return;
            // 登録されたハンドラを順に試す（最初にtrueを返したハンドラで処理終了）
            for (const handler of _dragDropHandlers) {
                if (handler(paths)) return;
            }
        }
    });

    // 外部リンクをデフォルトブラウザで開く（window.openを上書き）
    const originalOpen = window.open;
    window.open = function (url, target, features) {
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
            openUrl(url);
            return null;
        }
        return originalOpen.call(window, url, target, features);
    };

    // ===== Ctrl+A ブロック =====
    // アプリ内テキストがウインドウ全体で選択されるのを防ぐ。
    // 入力欄（input/textarea/contenteditable）内では従来通り動作させる。
    document.addEventListener('keydown', (e) => {
        if (!(e.ctrlKey || e.metaKey)) return;
        if (e.key !== 'a' && e.key !== 'A') return;
        const t = e.target;
        if (!t) { e.preventDefault(); return; }
        const tag = (t.tagName || '').toLowerCase();
        // type="checkbox" 等の編集対象でない input は除外
        const editableInputType = (tag === 'input')
            ? !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes((t.type || 'text').toLowerCase())
            : false;
        const isEditable = tag === 'textarea' || editableInputType || t.isContentEditable;
        if (!isEditable) {
            e.preventDefault();
        }
    }, true); // capture phase で先回りして既存ハンドラに食われる前に判定
})();
