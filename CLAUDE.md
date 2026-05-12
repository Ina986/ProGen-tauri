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
./start.bat                            # cargo run --release で起動
cd src-tauri && cargo check            # コンパイル確認
cd src-tauri && cargo build --release  # リリースビルド

# リリース（GitHub Actionsで自動ビルド）
git tag vX.Y.Z && git push origin vX.Y.Z
```

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
3. **校正プロンプト** — 常用外漢字検出、表記ゆれ、誤字、ルビ検証
4. **校正結果ビューワー** — JSON 形式の校正結果を読み込み、正誤／提案／コメントを整理表示・保存
5. **COMIC-POT** — テキストエディタ（ルビ対応、ドラッグ＆ドロップ編集）
6. **管理者モード** — マスタールール管理

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
