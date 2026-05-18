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
let viewerPageSyncEnabled = true; // 既定 ON（<<NPage>> マーカ付きテキストでは連動が期待されるため）
window.viewerPageSyncEnabled = viewerPageSyncEnabled; // 他モジュールから参照可能に
let viewerPdfDocCache = new Map(); // pdfPath -> PDFDocumentProxy
let viewerPdfBinaryCache = new Map(); // pdfPath -> Uint8Array

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
            const pdf = await _loadPdfDocument(file.path);
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
    viewerPdfBinaryCache.clear();
    _showViewerCanvas();

    // PDFが含まれていればページ展開
    const hasPdf = files.some(f => _isPdf(f.name));
    viewerFiles = hasPdf ? await _expandPdfFiles(files) : files;
    if (viewerFiles.length === 0) {
        if (window.cpShowNotify) window.cpShowNotify('PDFの読み込みに失敗しました', '#ef4444');
        return;
    }

    loadViewerImage(0);
}

// ===== フォルダを開く =====
async function cpViewerOpenFolder() {
    const result = await window.electronAPI.showOpenImageFolderDialog();
    if (!result.success) return;

    viewerFolderPath = result.folderPath;
    const listResult = await window.electronAPI.listImageFiles(viewerFolderPath);
    if (!listResult.success || listResult.files.length === 0) {
        if (window.cpShowNotify) window.cpShowNotify('画像ファイルが見つかりません', '#ef4444');
        return;
    }
    cpViewerSetFiles(listResult.files, result.folderPath);
}

// ===== ドロップゾーン / キャンバス 切替 =====
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

    if (filenameEl) filenameEl.textContent = file.name;
    if (counterEl) counterEl.textContent = (index + 1) + ' / ' + viewerFiles.length;
    _updateNavArrows();
    _updateViewerMeta(null);

    // ページ同期（テキストメモ連動）
    // _cpViewerSyncSuppress が立っているときは textarea→ビューア の逆同期由来なのでスキップ
    if (viewerPageSyncEnabled && window.cpSyncToPage && !window._cpViewerSyncSuppress) {
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
            if (filenameEl) filenameEl.textContent = file.name + ' (PDF読み込みエラー)';
            if (window.cpShowNotify) window.cpShowNotify('PDF読み込みエラー: ' + file.name, '#ef4444');
            img.style.opacity = '1';
        }
        return;
    }

    const result = await window.electronAPI.loadImagePreview(file.path, VIEWER_PREVIEW_MAX_SIZE);

    viewerIsLoading = false;
    if (loadingEl) loadingEl.style.display = 'none';

    if (!result.success) {
        if (filenameEl) filenameEl.textContent = file.name + ' (読み込みエラー)';
        if (window.cpShowNotify) window.cpShowNotify('読み込みエラー: ' + file.name, '#ef4444');
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
    const pdf = await _loadPdfDocument(pdfPath);
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
async function _loadPdfDocument(pdfPath) {
    let pdf = viewerPdfDocCache.get(pdfPath);
    if (pdf) return pdf;

    const lib = await _ensurePdfJs();

    try {
        let bytes = viewerPdfBinaryCache.get(pdfPath);
        if (!bytes) {
            const result = await window.electronAPI.readBinaryFileBase64(pdfPath);
            if (!result.success || !result.data) {
                throw new Error(result.error || 'Failed to read PDF bytes');
            }
            bytes = _base64ToUint8Array(result.data);
            viewerPdfBinaryCache.set(pdfPath, bytes);
        }
        pdf = await lib.getDocument({ data: bytes }).promise;
    } catch (fetchError) {
        console.warn('PDF binary load failed:', pdfPath, fetchError);
        pdf = await lib.getDocument(window.convertFileSrc(pdfPath)).promise;
    }

    viewerPdfDocCache.set(pdfPath, pdf);
    return pdf;
}

function _base64ToUint8Array(base64) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

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
    const hasFiles = viewerFiles.length > 0;
    // 未読込時は親に印を付けて CSS 側で display:none、読込済みのみ hover で出現
    const main = document.querySelector('.cp-viewer-main');
    if (main) main.classList.toggle('has-files', hasFiles);
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
    // ページ連動トグルの初期表示状態を viewerPageSyncEnabled に合わせる
    const btn = _vEl('cpViewerSyncToggle');
    if (btn) {
        btn.classList.toggle('active', viewerPageSyncEnabled);
        btn.title = viewerPageSyncEnabled ? 'ページ連動 ON' : 'ページ連動 OFF';
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cpViewerInit);
} else {
    cpViewerInit();
}

// ===== ページ同期トグル =====
function cpViewerTogglePageSync() {
    viewerPageSyncEnabled = !viewerPageSyncEnabled;
    window.viewerPageSyncEnabled = viewerPageSyncEnabled; // textarea 側から参照される
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

// ===== テキスト → ビューア 逆同期エントリ =====
// pageNum (1-based) に対応する viewerFiles のインデックスを推定して表示。
// ファイル順 = ページ順とみなす（PsDesign と同じ素朴な対応）。
// ===== ファイル入力経由で受け取った PDF (File オブジェクト) をビューアにロード =====
// <input type="file"> 経由ではファイルパスが取れないため、ArrayBuffer を直接読み込み、
// viewerPdfBinaryCache に登録してから PDF を展開する。
// （cpViewerSetFiles はキャッシュをクリアするため使えず、内部処理を直接実行）
async function cpViewerLoadPdfFile(file) {
    if (!file) return false;
    const bytes = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });

    // 既存状態をクリア（cpViewerSetFiles と同等）
    viewerFolderPath = '';
    viewerCurrentIndex = 0;
    viewerImageCache.clear();
    viewerPdfDocCache.clear();
    viewerPdfBinaryCache.clear();
    _showViewerCanvas();

    // バイトをキャッシュへ投入してから展開（_loadPdfDocument がディスクへフォールバックしない）
    const synthPath = '__blob__/' + file.name + '#' + file.size + '#' + Date.now();
    viewerPdfBinaryCache.set(synthPath, bytes);

    const expanded = await _expandPdfFiles([{ name: file.name, path: synthPath, size: file.size }]);
    if (expanded.length === 0) {
        if (window.cpShowNotify) window.cpShowNotify('PDFの読み込みに失敗しました', '#ef4444');
        return false;
    }
    viewerFiles = expanded;
    await loadViewerImage(0);
    return true;
}

// ===== ビューアの状態を完全リセット（読み込んだ画像・PDF・キャッシュ・表示を全クリア） =====
function cpViewerReset() {
    viewerFiles = [];
    viewerCurrentIndex = -1;
    viewerFolderPath = '';
    viewerZoomLevel = 0;
    viewerIsDragging = false;
    viewerImageCache.clear();
    viewerPdfDocCache.clear();
    viewerPdfBinaryCache.clear();

    const img = _vEl('cpViewerImage');
    if (img) { img.removeAttribute('src'); img.style.transform = ''; }
    const filenameEl = _vEl('cpViewerFilename');
    if (filenameEl) filenameEl.textContent = 'ファイル未選択';
    const counterEl = _vEl('cpViewerCounter');
    if (counterEl) counterEl.textContent = '';
    const metaEl = _vEl('cpViewerMeta');
    if (metaEl) metaEl.textContent = '';
    const zoomEl = _vEl('cpViewerZoomLevel');
    if (zoomEl) zoomEl.textContent = 'Fit';
    const loadingEl = _vEl('cpViewerLoading');
    if (loadingEl) loadingEl.style.display = 'none';

    // ドロップゾーンに戻す
    _showViewerDropzone();
    // ナビ矢印を非表示状態に同期
    _updateNavArrows();
}

function cpViewerJumpToPage(pageNum) {
    if (!Array.isArray(viewerFiles) || viewerFiles.length === 0) return;
    const idx = Math.max(0, Math.min(pageNum - 1, viewerFiles.length - 1));
    if (idx === viewerCurrentIndex) return;
    // suppress を立てて loadViewerImage 内の cpSyncToPage 二重発火を防ぐ
    window._cpViewerSyncSuppress = true;
    try { loadViewerImage(idx); }
    finally { requestAnimationFrame(() => { window._cpViewerSyncSuppress = false; }); }
}

// ===== エクスポート =====
export { cpViewerOpenFolder, cpViewerPrev, cpViewerNext, cpViewerZoom, cpViewerZoomFit, cpViewerSetFiles, cpViewerTogglePageSync, cpViewerJumpToPage, cpViewerReset, cpViewerLoadPdfFile };

Object.assign(window, { cpViewerOpenFolder, cpViewerPrev, cpViewerNext, cpViewerZoom, cpViewerZoomFit, cpViewerSetFiles, cpViewerTogglePageSync, cpViewerJumpToPage, cpViewerReset, cpViewerLoadPdfFile });
