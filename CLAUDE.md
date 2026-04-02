# ProGen - テキスト抽出・整形プロンプトジェネレータ

漫画・コミックのテキスト抽出→整形→校正のAIプロンプト生成デスクトップアプリ。
日本の出版（DTP）ワークフロー向け。

## 技術スタック

- **フロントエンド**: Vanilla JS (ES Modules) + HTML/CSS、フレームワークなし
- **バックエンド**: Rust + Tauri v2
- **画像処理**: `image` crate（PSD含む）
- **PDF**: pdfjs-dist v4.9
- **インストーラ**: NSIS (Windows)
- **CI/CD**: GitHub Actions (`v*` タグでリリースビルド)

## プロジェクト構成

```
src/                  # フロントエンド
  js/
    progen-main.js        # モジュールローダー
    progen-state.js       # 共有ステート管理
    tauri-bridge.js       # Tauri IPC ブリッジ（旧Electron互換レイヤー）
    progen-extraction.js  # 抽出プロンプト
    progen-proofreading.js # 校正プロンプト
    progen-comicpot.js    # テキストエディタ（COMIC-POT連携）
    progen-check-simple.js    # 校正チェック（簡易）
    progen-check-variation.js # 校正チェック（表記ゆれ）
    progen-admin.js       # 管理者モード
    progen-json-browser.js # JSONファイルブラウザ
    progen-result-viewer.js # 結果表示
    progen-landing.js     # ランディングページ
    progen-xml-gen.js     # XML生成
    progen-xml-templates.js # XMLテンプレート
    progen-data.js        # データ定義
    progen-note-txt.js    # 注記テキスト
  css/progen.css
  index.html

src-tauri/            # Rustバックエンド
  src/
    main.rs           # エントリポイント（lib.rsに委譲）
    lib.rs            # メインロジック（~1500行、25+コマンドハンドラ）
  Cargo.toml
  tauri.conf.json
```

## バージョン管理

- 正式バージョン: `src-tauri/tauri.conf.json` と `src-tauri/Cargo.toml` の `version`（現在 1.8.7）
- `package.json` の `version` は同期されていない（1.5.0）

## ビルド & リリース

```bash
# 開発
cd src-tauri && cargo build

# テスト
cd src-tauri && cargo test

# リリース（GitHub Actionsで自動ビルド）
git tag v1.x.x && git push origin v1.x.x
```

リリースフロー: `v*` タグ push → GitHub Actions → NSIS署名ビルド → GitHub Releases + auto-updater JSON

## 主要機能（3モード）

1. **抽出プロンプト** - 原稿画像からテキスト抽出用AIプロンプト生成
2. **整形プロンプト** - 抽出テキストの表記統一・整形プロンプト生成
3. **校正プロンプト** - 常用外漢字検出、表記ゆれ、誤字、ルビ検証

追加機能:
- COMIC-POTテキストエディタ（ルビ対応、ドラッグ＆ドロップ編集）
- 画像ビューア（PSD対応、メモリ+ディスクキャッシュ）
- JSONファイル管理（Google共有ドライブ連携）
- PDF仕様書エクスポート（Edge headless利用）
- 管理者モード（マスタールール管理）

## 外部パス依存（Gドライブ）

```
G:\共有ドライブ\CLLENN\...\DTP制作部\JSONフォルダ       # 作品JSONデータ
G:\共有ドライブ\CLLENN\...\DTP制作部\ProGen_Master_JSON # マスターJSON
G:\共有ドライブ\CLLENN\...\写植・校正用テキストログ       # テキストログ
```

## コーディング規約

- フロントエンド: Vanilla JS（TypeScript不使用）、ES Modules
- バックエンド: Rust 2021 edition
- コミットメッセージ: `feat:` / `fix:` プレフィックス + 日本語説明 + バージョン
- リリースプロファイル: LTO有効、strip、codegen-units=1
