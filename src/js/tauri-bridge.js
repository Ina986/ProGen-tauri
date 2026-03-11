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
})();
