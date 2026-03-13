/* =========================================
   画像ビューアー（COMIC-POTエディタ左パネル）
   COMIC-Bridge SpecViewerPanel 風デザイン
   ========================================= */

// ===== PDF.js 読み込み =====
let pdfjsLib = null;
async function _ensurePdfJs() {
    if (pdfjsLib) return pdfjsLib;
    const mod = await import('./lib/pdf.min.mjs');
    pdfjsLib = mod;
    pdfjsLib.GlobalWorkerOptions.workerSrc = './js/lib/pdf.worker.min.mjs';
    return pdfjsLib;
}

// ===== 状態管理 =====
let viewerFiles = [];       // { name, path, size, isPdf?, pdfPage?, pdfPath? }
let viewerCurrentIndex = -1;
let viewerFolderPath = '';
let viewerZoomLevel = 0;    // 0 = fit, 1-N = zoom steps
let viewerZoomSteps = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0];
let viewerIsDragging = false;
let viewerDragStart = { x: 0, y: 0 };
let viewerScrollStart = { x: 0, y: 0 };
let viewerImageCache = new Map(); // path -> { dataUrl, originalWidth, originalHeight }
const VIEWER_CACHE_MAX = 10;
const VIEWER_PREVIEW_MAX_SIZE = 2000;
let viewerIsLoading = false;
let viewerPageSyncEnabled = false;
let viewerPdfDocCache = new Map(); // pdfPath -> PDFDocumentProxy

// ===== DOM参照 =====
function _vEl(id) { return document.getElementById(id); }

// ===== PDFファイルをページごとに展開 =====
function _isPdf(name) {
    return name.toLowerCase().endsWith('.pdf');
}

async function _expandPdfFiles(files) {
    const expanded = [];
    for (const file of files) {
        if (!_isPdf(file.name)) {
            expanded.push(file);
            continue;
        }
        try {
            const lib = await _ensurePdfJs();
            const assetUrl = window.convertFileSrc(file.path);
            const pdf = await lib.getDocument(assetUrl).promise;
            viewerPdfDocCache.set(file.path, pdf);
            for (let p = 1; p <= pdf.numPages; p++) {
                expanded.push({
                    name: file.name + ' (p.' + p + '/' + pdf.numPages + ')',
                    path: file.path + '#page=' + p,
                    size: file.size,
                    isPdf: true,
                    pdfPage: p,
                    pdfPath: file.path,
                });
            }
        } catch (e) {
            console.error('PDF展開エラー:', file.name, e);
        }
    }
    return expanded;
}

// ===== ファイルリストをセットして表示開始 =====
async function cpViewerSetFiles(files, folderPath) {
    if (!files || files.length === 0) return;
    viewerFolderPath = folderPath || '';
    viewerCurrentIndex = 0;
    viewerImageCache.clear();
    viewerPdfDocCache.clear();
    _showViewerCanvas();

    // PDFが含まれていればページ展開
    const hasPdf = files.some(f => _isPdf(f.name));
    viewerFiles = hasPdf ? await _expandPdfFiles(files) : files;

    loadViewerImage(0);
}

// ===== フォルダを開く =====
async function cpViewerOpenFolder() {
    const result = await window.electronAPI.showOpenImageFolderDialog();
    if (!result.success) return;

    viewerFolderPath = result.folderPath;
    const listResult = await window.electronAPI.listImageFiles(viewerFolderPath);
    if (!listResult.success || listResult.files.length === 0) {
        _vEl('cpViewerFilename').textContent = '画像ファイルが見つかりません';
        _vEl('cpViewerCounter').textContent = '';
        return;
    }
    cpViewerSetFiles(listResult.files, result.folderPath);
}

// ===== ドロップゾーン ↔ キャンバス 切替 =====
function _showViewerCanvas() {
    const dropzone = _vEl('cpViewerDropzone');
    const canvas = _vEl('cpViewerCanvas');
    if (dropzone) dropzone.style.display = 'none';
    if (canvas) canvas.style.display = '';
}
function _showViewerDropzone() {
    const dropzone = _vEl('cpViewerDropzone');
    const canvas = _vEl('cpViewerCanvas');
    if (dropzone) dropzone.style.display = 'flex';
    if (canvas) canvas.style.display = 'none';
}

// ===== 画像読み込み =====
async function loadViewerImage(index) {
    if (index < 0 || index >= viewerFiles.length) return;
    viewerCurrentIndex = index;

    const file = viewerFiles[index];
    const img = _vEl('cpViewerImage');
    const filenameEl = _vEl('cpViewerFilename');
    const counterEl = _vEl('cpViewerCounter');
    const loadingEl = _vEl('cpViewerLoading');

    filenameEl.textContent = file.name;
    counterEl.textContent = (index + 1) + ' / ' + viewerFiles.length;
    _updateNavArrows();
    _updateViewerMeta(null);

    // ページ同期（テキストメモ連動）
    if (viewerPageSyncEnabled && window.cpSyncToPage) {
        window.cpSyncToPage(index + 1);
    }

    // フロントエンドURLキャッシュチェック
    if (viewerImageCache.has(file.path)) {
        const cached = viewerImageCache.get(file.path);
        img.src = cached.assetUrl;
        img.style.opacity = '1';
        cpViewerZoomFit();
        _updateViewerMeta(cached);
        prefetchNeighbors(index);
        return;
    }

    // ローディング表示
    viewerIsLoading = true;
    img.style.opacity = '0.4';
    if (loadingEl) loadingEl.style.display = '';

    // PDF ページの場合
    if (file.isPdf) {
        try {
            const dataUrl = await _renderPdfPage(file.pdfPath, file.pdfPage);
            viewerIsLoading = false;
            if (loadingEl) loadingEl.style.display = 'none';
            img.src = dataUrl;
            img.style.opacity = '1';
            // サイズ取得のため onload を待つ
            img.onload = () => {
                const meta = { originalWidth: img.naturalWidth, originalHeight: img.naturalHeight };
                _cacheSet(file.path, meta, dataUrl);
                _updateViewerMeta(meta);
                img.onload = null;
            };
            cpViewerZoomFit();
            prefetchNeighbors(index);
        } catch (e) {
            viewerIsLoading = false;
            if (loadingEl) loadingEl.style.display = 'none';
            filenameEl.textContent = file.name + ' (PDF読み込みエラー)';
            img.style.opacity = '1';
        }
        return;
    }

    const result = await window.electronAPI.loadImagePreview(file.path, VIEWER_PREVIEW_MAX_SIZE);

    viewerIsLoading = false;
    if (loadingEl) loadingEl.style.display = 'none';

    if (!result.success) {
        filenameEl.textContent = file.name + ' (読み込みエラー)';
        img.style.opacity = '1';
        return;
    }

    // asset://プロトコルURL生成 + キャッシュ
    const assetUrl = window.convertFileSrc(result.filePath);
    _cacheSet(file.path, result, assetUrl);

    img.src = assetUrl;
    img.style.opacity = '1';
    cpViewerZoomFit();
    _updateViewerMeta(result);
    prefetchNeighbors(index);
}

// ===== PDFページレンダリング =====
async function _renderPdfPage(pdfPath, pageNum) {
    let pdf = viewerPdfDocCache.get(pdfPath);
    if (!pdf) {
        const lib = await _ensurePdfJs();
        const assetUrl = window.convertFileSrc(pdfPath);
        pdf = await lib.getDocument(assetUrl).promise;
        viewerPdfDocCache.set(pdfPath, pdf);
    }
    const page = await pdf.getPage(pageNum);
    const scale = VIEWER_PREVIEW_MAX_SIZE / Math.max(page.view[2], page.view[3]);
    const viewport = page.getViewport({ scale: Math.min(scale, 2) });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/png');
}

// ===== フロントエンドURLキャッシュ管理 =====
function _cacheSet(path, result, assetUrl) {
    if (viewerImageCache.size >= VIEWER_CACHE_MAX) {
        const firstKey = viewerImageCache.keys().next().value;
        viewerImageCache.delete(firstKey);
    }
    viewerImageCache.set(path, {
        assetUrl: assetUrl || window.convertFileSrc(result.filePath),
        originalWidth: result.originalWidth,
        originalHeight: result.originalHeight,
    });
}

// ===== メタデータ表示 =====
function _updateViewerMeta(data) {
    const metaEl = _vEl('cpViewerMeta');
    if (!metaEl) return;
    if (!data || !data.originalWidth) {
        metaEl.innerHTML = '';
        return;
    }
    metaEl.innerHTML =
        '<span>' + data.originalWidth + ' × ' + data.originalHeight + '</span>';
}

// ===== ナビゲーション矢印 =====
function _updateNavArrows() {
    const left = _vEl('cpViewerNavLeft');
    const right = _vEl('cpViewerNavRight');
    if (left) left.disabled = viewerCurrentIndex <= 0;
    if (right) right.disabled = viewerCurrentIndex >= viewerFiles.length - 1;
}

// ===== プリフェッチ =====
function prefetchNeighbors(index) {
    [-1, 1, -2, 2].forEach(async (offset) => {
        const i = index + offset;
        if (i < 0 || i >= viewerFiles.length) return;
        const f = viewerFiles[i];
        if (viewerImageCache.has(f.path)) return;
        if (f.isPdf) {
            try {
                const dataUrl = await _renderPdfPage(f.pdfPath, f.pdfPage);
                _cacheSet(f.path, { originalWidth: 0, originalHeight: 0 }, dataUrl);
            } catch (_) {}
            return;
        }
        const result = await window.electronAPI.loadImagePreview(f.path, VIEWER_PREVIEW_MAX_SIZE);
        if (result.success) _cacheSet(f.path, result);
    });
}

// ===== ナビゲーション =====
function cpViewerPrev() {
    if (viewerCurrentIndex > 0) loadViewerImage(viewerCurrentIndex - 1);
}

function cpViewerNext() {
    if (viewerCurrentIndex < viewerFiles.length - 1) loadViewerImage(viewerCurrentIndex + 1);
}

// ===== ズーム =====
function cpViewerZoom(direction) {
    const img = _vEl('cpViewerImage');
    if (!img || !img.src) return;

    if (viewerZoomLevel === 0) {
        const currentScale = img.offsetWidth / img.naturalWidth;
        if (direction > 0) {
            // 拡大: 現在のスケールより大きい最初のステップ
            let idx = viewerZoomSteps.findIndex(s => s > currentScale + 0.01);
            viewerZoomLevel = idx >= 0 ? idx + 1 : viewerZoomSteps.length;
        } else {
            // 縮小: 現在のスケールより小さい最後のステップ
            let idx = -1;
            for (let i = viewerZoomSteps.length - 1; i >= 0; i--) {
                if (viewerZoomSteps[i] < currentScale - 0.01) { idx = i; break; }
            }
            viewerZoomLevel = idx >= 0 ? idx + 1 : 1;
        }
    } else {
        viewerZoomLevel += direction;
    }
    viewerZoomLevel = Math.max(1, Math.min(viewerZoomSteps.length, viewerZoomLevel));

    const scale = viewerZoomSteps[viewerZoomLevel - 1];
    img.style.width = (img.naturalWidth * scale) + 'px';
    img.style.height = 'auto';
    img.style.maxWidth = 'none';
    img.style.maxHeight = 'none';

    _vEl('cpViewerZoomLevel').textContent = Math.round(scale * 100) + '%';

    const canvas = _vEl('cpViewerCanvas');
    if (canvas) {
        canvas.classList.add('zoomed');
        canvas.style.cursor = 'grab';
    }
}

function cpViewerZoomFit() {
    const img = _vEl('cpViewerImage');
    if (!img || !img.src) return;

    viewerZoomLevel = 0;
    img.style.width = '';
    img.style.height = '';
    img.style.maxWidth = '100%';
    img.style.maxHeight = '100%';
    _vEl('cpViewerZoomLevel').textContent = 'Fit';

    const canvas = _vEl('cpViewerCanvas');
    if (canvas) {
        canvas.classList.remove('zoomed');
        canvas.scrollTop = 0; canvas.scrollLeft = 0; canvas.style.cursor = '';
    }
}

// ===== ドラッグでスクロール =====
function setupViewerDrag() {
    const canvas = _vEl('cpViewerCanvas');
    if (!canvas) return;

    canvas.addEventListener('mousedown', (e) => {
        if (viewerZoomLevel === 0) return;
        if (e.button !== 0) return; // 左クリックのみ
        viewerIsDragging = true;
        viewerDragStart = { x: e.clientX, y: e.clientY };
        viewerScrollStart = { x: canvas.scrollLeft, y: canvas.scrollTop };
        canvas.style.cursor = 'grabbing';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!viewerIsDragging) return;
        const c = _vEl('cpViewerCanvas');
        if (!c) return;
        c.scrollLeft = viewerScrollStart.x - (e.clientX - viewerDragStart.x);
        c.scrollTop = viewerScrollStart.y - (e.clientY - viewerDragStart.y);
    });

    document.addEventListener('mouseup', () => {
        if (!viewerIsDragging) return;
        viewerIsDragging = false;
        const c = _vEl('cpViewerCanvas');
        if (c) c.style.cursor = '';
    });

    // ホイール: Ctrlでズーム、通常でページ送り
    canvas.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
            cpViewerZoom(e.deltaY < 0 ? 1 : -1);
        } else if (viewerZoomLevel === 0 && viewerFiles.length > 0) {
            // fitモードではホイールでページ送り
            e.preventDefault();
            if (e.deltaY > 0) cpViewerNext();
            else cpViewerPrev();
        }
    }, { passive: false });
}

// ===== キーボードナビゲーション =====
function handleViewerKeydown(e) {
    const viewerBody = _vEl('cpViewerBody');
    if (!viewerBody || viewerBody.style.display === 'none') return;

    // Ctrl+=/+ でズームイン、Ctrl+- でズームアウト、Ctrl+0 でフィット
    if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
            e.preventDefault();
            cpViewerZoom(1);
            return;
        } else if (e.key === '-') {
            e.preventDefault();
            cpViewerZoom(-1);
            return;
        } else if (e.key === '0') {
            e.preventDefault();
            cpViewerZoomFit();
            return;
        }
    }

    if ((e.key === 'ArrowLeft' || e.key === 'ArrowUp') && !e.shiftKey) {
        if (!e.target.matches('input, textarea, select')) {
            e.preventDefault();
            cpViewerPrev();
        }
    } else if ((e.key === 'ArrowRight' || e.key === 'ArrowDown') && !e.shiftKey) {
        if (!e.target.matches('input, textarea, select')) {
            e.preventDefault();
            cpViewerNext();
        }
    }
}

// ===== ドラッグ＆ドロップ（Tauri ネイティブ D&D） =====
function setupViewerDragDrop() {
    // ドラッグ中のビジュアルフィードバック
    document.addEventListener('tauri-drag-enter', () => {
        const viewer = _vEl('cpViewerBody');
        if (viewer && viewer.style.display !== 'none') {
            viewer.classList.add('drag-over');
        }
    });
    document.addEventListener('tauri-drag-leave', () => {
        const viewer = _vEl('cpViewerBody');
        if (viewer) viewer.classList.remove('drag-over');
    });

    // D&Dハンドラを登録（位置情報は使わず、ビューアー表示中なら処理する）
    const IMAGE_EXTS = ['.psd', '.jpg', '.jpeg', '.png', '.tif', '.tiff', '.bmp', '.gif', '.pdf'];
    window._registerDragDropHandler((paths) => {
        const viewer = _vEl('cpViewerBody');
        if (!viewer || viewer.style.display === 'none') return false;

        viewer.classList.remove('drag-over');

        // 画像ファイルまたはフォルダが含まれるか確認（TXTのみなら次のハンドラに委譲）
        const hasImageOrFolder = paths.some(p => {
            const ext = p.toLowerCase().split('.').pop();
            return IMAGE_EXTS.includes('.' + ext) || !p.includes('.');
        });
        if (!hasImageOrFolder) return false;

        // 画像ファイル/フォルダを処理
        window.electronAPI.listImageFilesFromPaths(paths).then(result => {
            if (result.success && result.files.length > 0) {
                cpViewerSetFiles(result.files, result.folderPath);
            }
        });
        return true;
    });
}

// ===== 初期化 =====
function cpViewerInit() {
    setupViewerDrag();
    setupViewerDragDrop();
    document.addEventListener('keydown', handleViewerKeydown);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cpViewerInit);
} else {
    cpViewerInit();
}

// ===== ページ同期トグル =====
function cpViewerTogglePageSync() {
    viewerPageSyncEnabled = !viewerPageSyncEnabled;
    const btn = _vEl('cpViewerSyncToggle');
    if (btn) {
        btn.classList.toggle('active', viewerPageSyncEnabled);
        btn.title = viewerPageSyncEnabled ? 'ページ連動 ON' : 'ページ連動 OFF';
    }
    // ONにした瞬間に現在のページを同期
    if (viewerPageSyncEnabled && viewerCurrentIndex >= 0 && window.cpSyncToPage) {
        window.cpSyncToPage(viewerCurrentIndex + 1);
    }
}

// ===== エクスポート =====
export { cpViewerOpenFolder, cpViewerPrev, cpViewerNext, cpViewerZoom, cpViewerZoomFit, cpViewerSetFiles, cpViewerTogglePageSync };

Object.assign(window, { cpViewerOpenFolder, cpViewerPrev, cpViewerNext, cpViewerZoom, cpViewerZoomFit, cpViewerSetFiles, cpViewerTogglePageSync });
