# ProGen - テキスト抽出・整形プロンプトジェネレータ

漫画・コミックのテキスト抽出→整形→校正の AI プロンプト生成デスクトップアプリ。
日本の出版（DTP）ワークフロー向け。

## 技術スタック

- **フロントエンド**: Vanilla JS (ES Modules) + HTML/CSS、フレームワークなし
- **バックエンド**: Rust + Tauri v2
- **画像処理**: `image` crate
- **PDF**: pdfjs-dist v4.9
- **インストーラ**: NSIS (Windows)
- **自動更新**: tauri-plugin-updater
- **CI/CD**: GitHub Actions (`v*` タグでリリースビルド・署名)

## プロジェクト構成

```
src/                          # フロントエンド
  index.html
  js/
    progen-main.js            # モジュールローダー
    progen-state.js           # 共有ステート管理
    tauri-bridge.js           # Tauri invoke ラッパ（window.electronAPI）
    progen-extraction.js      # 抽出プロンプト
    progen-proofreading.js    # 校正プロンプト
    progen-comicpot.js        # テキストエディタ（COMIC-POT連携）
    progen-check-simple.js    # 校正チェック（簡易）
    progen-check-variation.js # 校正チェック（表記ゆれ）
    progen-result-viewer.js   # 結果表示・校正データ保存・MojiQ起動
    progen-admin.js           # 管理者モード
    progen-json-browser.js    # JSONファイルブラウザ
    progen-landing.js         # ランディングページ
    progen-xml-gen.js         # XML生成
    progen-xml-templates.js   # XMLテンプレート
    progen-data.js            # データ定義
    progen-note-txt.js        # 注記テキスト

src-tauri/                    # Rustバックエンド
  src/
    main.rs                   # エントリポイント（lib.rsに委譲）
    lib.rs                    # メインロジック（30+ コマンドハンドラ）
  Cargo.toml
  tauri.conf.json

start.bat                     # ローカル開発用ランチャ（cargo run --release）
```

## バージョン管理

バージョンは以下を同時に更新する:

- `package.json` の `version`
- `src-tauri/tauri.conf.json` の `version`
- `src-tauri/Cargo.toml` の `version`

WebView2 キャッシュはバージョン変更時に `clear_webview2_cache_on_version_change` ([src-tauri/src/lib.rs](src-tauri/src/lib.rs)) が自動クリアする。JS 変更時に古いコードがキャッシュされる問題を防ぐため、必ずバージョンを上げてからリリースすること。

## ビルド & リリース

```bash
# ローカル起動
./dev.bat                              # 開発モード（Vite + tauri dev、HMR有効・推奨）
./start.bat                            # cargo run --release で起動（リリース挙動の確認用）
cd src-tauri && cargo check            # コンパイル確認
cd src-tauri && cargo build --release  # リリースビルド

# リリース（GitHub Actionsで自動ビルド）
git tag vX.Y.Z && git push origin vX.Y.Z
```

`dev.bat` は `npx tauri dev` を起動し、Vite dev サーバ（`http://localhost:1450`、[vite.config.mjs](vite.config.mjs)）を webview から読み込む。フロントエンド（`src/` 配下の HTML/CSS/JS）の変更は保存と同時にリロード（CSS は HMR で再読込のみ、JS は full reload）。Rust 側を変更した場合のみ tauri dev が自動で再ビルドする。本番ビルド時は [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json) の `frontendDist: "../src"` がそのまま使われ、Vite 由来のバンドルは介在しない（素のファイルを配信）。

リリースフロー: `v*` タグ push → GitHub Actions ([.github/workflows/release.yml](.github/workflows/release.yml)) → tauri-action が NSIS 署名ビルド → GitHub Releases に `latest.json` + `ProGen_X.Y.Z_x64-setup.exe` + `.sig` をアップロード。

## 外部連携

### COMIC-Bridge 連携
校正データ保存後、`launch_comic_bridge` ([src-tauri/src/lib.rs](src-tauri/src/lib.rs)) で `%LOCALAPPDATA%\Comic-Bridge\comic-bridge.exe --proofreading-json <path>` を起動。

### MojiQ 連携（v2.0.3 で追加）
校正データ保存成功モーダルの「MojiQで開く」ボタンから MojiQ アプリへ JSON ファイルパスを引き渡す。

- Rust コマンド: `launch_mojiq_with_calibration` ([src-tauri/src/lib.rs](src-tauri/src/lib.rs))
- MojiQ.exe の探索: `find_mojiq_path` で `Program Files` / `%LOCALAPPDATA%\Programs\MojiQ` / Desktop の `MojiQ_*/ver_*/MojiQ/dist/win-unpacked/MojiQ.exe` 等を順に探索
- 引数形式: `MojiQ.exe --calibration-json=<path>` （`=` 区切りで単一 argv 要素にすることで、Electron `second-instance` の `commandLine` 配列に `--allow-file-access-from-files` 等の Chromium 内部フラグが注入されてもパスを取り逃がさない）
- MojiQ 側は受信 JSON を `read-calibration-file` IPC で読み込み、`CalibrationPanel.openFile` 相当のロジックで校正チェックパネルへ表示。PDF 未読込時は「校正情報を受け取りました。pdfを読み込んで下さい」ダイアログを出して PDF 読込完了を待機。

## 比較モード／主要機能

1. **抽出プロンプト** — 原稿画像からテキスト抽出用 AI プロンプト生成
2. **整形プロンプト** — 抽出テキストの表記統一・整形プロンプト生成
3. **校正プロンプト** — 常用外漢字検出、表記ゆれ、誤字、ルビ検証（**UI は撤去済み**。JS ロジック (`progen-proofreading.js` ほか) は温存しているため将来の再有効化が可能）
4. **校正結果ビューワー** — JSON 形式の校正結果を読み込み、正誤／提案／コメントを整理表示・保存
5. **COMIC-POT** — テキストエディタ（ルビ対応、ドラッグ＆ドロップ編集、PDF ビューア連動）
6. **管理者モード** — マスタールール管理

## COMIC-POT エディタの UI 構造

ProGen の中核 UI。左に校正結果／画像ビューア、右にテキストエディタの 2 カラム構成。

### ヘッダー ([index.html](src/index.html) `<header class="cp-header">`)

左から: ホーム → 戻る → ツールバーグループ

- **ホーム** (`cpGoHomeFromEditor`): 編集中テキストや読み込み済み画像があれば警告モーダル `cpHomeConfirmModal` を表示し、確定で `_cpResetEditorState()` 経由でテキスト＋画像ビューアを完全リセットしてランディング画面へフェード遷移
- **戻る** (`goBackFromComicPotEditor`): 前画面（landing / mainWrapper など）へスライド遷移
- **ツールバー** (`.cp-toolbar`):
  - グループ 1: 開く (`cpHandleFileOpen` — `.txt` または `.pdf`) / **テキスト読み込み** (`cpBtnLoadText` — 同じ `cpHandleFileOpen`) / **校正データ** (`cpEnsureCalibrationButton` が `cpBtnLoadText` の直後に動的挿入) / セリフ読込 / 保存 / 別名保存
  - グループ 2: コピー / 変換
  - `cpHandleFileOpen` は拡張子で分岐: `.pdf` の場合は `cpViewerLoadPdfFile(file)` で `FileReader` 経由 `ArrayBuffer` → `viewerPdfBinaryCache` 投入 → `_expandPdfFiles` → `loadViewerImage(0)`、続けて `cpShowResultPanel()` + `cpSwitchPanelTab('viewer')` でビューアタブへ自動切替

### 校正結果パネル ([index.html](src/index.html) `#cpResultPanel`)

`cp-result-panel-header` の構成（左から右）:

1. **タブ群** `.cp-result-panel-tabs` — 正誤チェック / 提案チェック / ビューアー
2. **カテゴリフィルタ** `#cpPanelCategoryFilter` — ビューアタブ時は `disabled` でグレーアウト（hidden ではない）
3. **右端グループ** `.cp-header-right`（`margin-left: auto`）:
   - **ページ連動ピル** `#cpViewerSyncToggle` — simple/variation タブ時は `disabled` でグレーアウト。`cp-viewer-sync-pill` は元 viewer-main 内の絶対配置から `cp-result-panel-header` 内のインラインフロー配置に移行済み
   - **ズームコントロール** `.cp-viewer-zoom-controls` — 元 viewer-main 内の絶対配置から `cp-result-panel-header` 右端へ移動済み

タブ別の表示切替は `cpSwitchPanelTab(tab)` ([progen-comicpot.js](src/js/progen-comicpot.js#L732)) が担当。`display:none` での非表示ではなく `disabled` 属性によるグレーアウトに統一されている。

### ビューア本体 ([index.html](src/index.html) `#cpViewerBody`)

- ドロップゾーン (`cp-viewer-dropzone`): 画像未読込時のメッセージのみ（フォルダを開くボタンは撤去済み — ヘッダーやツールバーから操作）
- ナビ矢印 (`.cp-viewer-nav-arrow`): デフォルト `display:none`。`viewerFiles.length > 0` で親 `.cp-viewer-main` に `.has-files` クラスが付き、`display:flex` + hover で `opacity:1` になる挙動。`_updateNavArrows` ([progen-viewer.js](src/js/progen-viewer.js)) で同期、`cpViewerReset()` 内でも呼ばれる

### エディタコラム ([index.html](src/index.html) `#cpEditorColumn`)

`cp-editor-filerow` / `cp-editor-footer` / `cp-current-page-badge` などのステータス UI は撤去済み（関連 JS は `if (!el) return;` のガードで no-op 化）。

**コンテキストバー** `#cpContextBar` (`cp-context-bar.editing` クラス付き、背景白で常時表示):

- コピー (`#cpCopyBtnFloat`) — `.cp-copy-float` クラス。テキスト未読込時は `disabled` でグレーアウト
- ルビ付け (`#cpBtnRuby`) — 同上
- **ページ表示モードのセグメントタブ** `#cpShowAllPagesLabelWrap` (`.cp-result-panel-tabs.cp-pagemode-tabs`): 「全ページ」/「ページごと」の 2 ボタン。API は `cpSetPageMode('all' | 'single')` ([progen-comicpot.js](src/js/progen-comicpot.js))。旧 `cpToggleShowAllPages()` はラッパーとして残置（後方互換）。テキスト未読込時はラッパーに `.disabled` で薄表示

**ページテキストパネル** `#cpPageTextPanel`:

- パネルヘッダ (`cp-page-text-panel-header`) は撤去済み
- 表示は `cpRenderPageTextPanel(pageNum)` が担当
- 全ページモード: `.cp-page-section[data-page="N"]` を順に並べる。各セクション先頭に `.cp-page-section-header`（薄ブルー基調 `#e8f1fa` / 文字 `#2c5282`、現在ページも同色）。`scrollIntoView` でターゲットページへ滑らかスクロール
- ページごとモード: 該当ページのみを同じ `.cp-page-section` でラップして描画（全ページモードと同じ見た目）
- 両モードとも `.cp-page-text-block` は枠なし・連続表示・偶数番ブロックを `var(--surface-dim)` でゼブラ化 (`.cp-page-section .cp-page-text-block:nth-of-type(odd)` がブロック偶数番に対応 — ヘッダが 1 番目の子のため)
- 空状態 (`cp-page-text-empty-hint`) は撤去済み — 未読込／空ページ時は何も表示しない

### ルビ付け（contentEditable ブロック対応） ([progen-comicpot.js:2088-2122](src/js/progen-comicpot.js))

textarea が常時 `display:none` のため、選択範囲は `.cp-page-text-block`（contentEditable な div）から取得する必要がある:

- `document.addEventListener('selectionchange', _cpUpdateBlockSelectionFromDom)` で逐次キャプチャ
- 選択がブロック内かつ崩壊していなければ、Range API で算出した相対オフセット + `block.dataset.offset` で絶対オフセットを `_cpLastBlockSelection` に保持
- `cpOpenRubyModal` はこの保存値を優先使用（ボタン押下で focus 抜けても残る）
- `cpApplyRuby` は `cpEditTextArea.value` を直接置換（hidden textarea では `document.execCommand('insertText')` が機能しないため）し、`cpRenderPageTextPanel` で再描画

### ページハイパーリンクのジャンプ ([progen-comicpot.js:1344-1370](src/js/progen-comicpot.js))

校正結果テーブルの「1巻 16ページ」等のリンクは `cpJumpToExcerpt(pageText, excerptText)` を起動する。動作:

1. ページ番号抽出 → `cpJumpInTextarea` / `cpJumpInSelectMode` で内部選択を合わせる
2. `_cpLastReportedPage = pageNum` で連動状態を更新、`cpUpdateCurrentPageBadge` 呼び出し
3. `cpRenderPageTextPanel(pageNum)` でパネルを該当 `.cp-page-section-header` までスクロール（全ページモード）／該当ページに切替（ページごとモード）
4. `window.cpViewerJumpToPage(pageNum)` で画像ビューアも同ページに強制ジャンプ（連動トグル ON/OFF に関わらず実行 — リンクは明示操作のため）

## 外部パス依存（Gドライブ）

```
G:\共有ドライブ\CLLENN\編集部フォルダ\編集企画部\編集企画_C班(AT業務推進)\DTP制作部\JSONフォルダ        # 作品JSONデータ
G:\共有ドライブ\CLLENN\編集部フォルダ\編集企画部\編集企画_C班(AT業務推進)\DTP制作部\ProGen_Master_JSON  # マスターJSON
G:\共有ドライブ\CLLENN\編集部フォルダ\編集企画部\編集企画_C班(AT業務推進)\DTP制作部\JSON_Log            # JSONアクセスログ
G:\共有ドライブ\CLLENN\編集部フォルダ\編集企画部\写植・校正用テキストログ                              # 校正チェックデータ保存先
```

校正データ保存先パス構造:
`{TXT_FOLDER_BASE_PATH}/{label}/{work}/校正チェックデータ/{volume}巻.json`

## コーディング規約

- フロントエンド: Vanilla JS（TypeScript不使用）、ES Modules
- バックエンド: Rust 2021 edition
- インライン HTML の `onclick="..."` から呼ぶ関数は `progen-result-viewer.js` 末尾の `Object.assign(window, { ... })` で必ず `window` に公開すること（ES Module はトップレベル関数を自動公開しない）
- リリースプロファイル: LTO=thin、strip 有効、codegen-units=1
- コミットメッセージ: `feat:` / `fix:` / `docs:` / `chore:` プレフィックス + 日本語説明 + バージョン
