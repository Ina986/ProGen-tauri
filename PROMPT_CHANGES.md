# プロンプト関連変更メモ

このファイルは、プロンプト生成・校正チェックまわりで行った変更内容と該当箇所をまとめたものです。

## 抽出・整形プロンプト

### 1ページ単位の区切りを強制

- 対象: `src/js/progen-xml-gen.js`
- 主な箇所: `getOutputFormatXml()`, `generatePdfOnlyXML()`, `generatePdfAndTxtXML()`, `getFinalOutputXml()`
- 内容:
  - 添付画像1枚、またはPDF 1ページを、必ず出力上の1ページとして扱うよう明記。
  - 見開き、左右ページ、連続する2ページを1つの `<<XPage>>` マーカー内に結合しないよう禁止。
  - 自己点検に「2ページ分のテキストが1つのページマーカー内に混在していないか」を追加。

### Plaintext出力の純粋性を強化

- 対象: `src/js/progen-xml-gen.js`, `src/js/progen-xml-templates.js`
- 主な箇所:
  - `src/js/progen-xml-gen.js`: `getOutputFormatXml()`, `getFinalOutputXml()`
  - `src/js/progen-xml-templates.js`: `XML_FOOTER`
- 内容:
  - 出力コードブロックの言語表示は `Plaintext` とし、コードブロック内には指定ヘッダー、巻マーカー、ページマーカー、セリフ本文、空行のみを含めるよう指定。
  - `<page>`, `<line>`, `<speech>`, `<chunk>` などのXML/HTML風タグ、属性、説明ラベル、JSON、表、箇条書き、コメント、メタ情報を禁止。
  - 自己点検に「XML/HTML風タグや余計な構造が混じっていないか」を追加。

## 正誤チェック

### 5回チェックの推論密度を強化

- 対象: `src/js/progen-check-simple.js`
- 主な箇所:
  - `generateSimpleCheckPromptWithText()`
  - `generateSimpleCheckWithRulesPromptWithText()`
- 内容:
  - 5回チェックでは速度や簡略化より検出精度を優先するよう指定。
  - 2回目から5回目も前回結果の流用だけで済ませず、原稿全体を再確認するよう指定。
  - 2回目、3回目、4回目をまとめて処理しないよう禁止。
  - 3回目、4回目も1回目、2回目と同じ密度で確認するよう明記。
  - 見直しが薄い場合はチェック未完了として出力前にやり直すよう指定。

### 熟字訓チェックの強化

- 対象: `src/js/progen-check-simple.js`
- 主な箇所: `generateSimpleCheckWithRulesPromptWithText()` の「熟字訓チェック」
- 内容:
  - 常用漢字だけで構成される語でも、語全体に特殊な読みが割り当てられている場合は検出対象にするよう明記。
  - 例として `流石（さすが）`, `可笑しい（おかしい）`, `欠伸（あくび）`, `台詞（せりふ）`, `大袈裟（おおげさ）`, `意気地（いくじ）` を追加。
  - 自己点検に、常用漢字だけで構成される熟字訓・特殊読みの見落とし確認を追加。

## 提案チェック

### 5回チェックの途中回省略を防止

- 対象: `src/js/progen-check-variation.js`
- 主な箇所: `generateVariationCheckPromptWithText()`
- 内容:
  - 2回目、3回目、4回目をまとめて処理しないよう禁止。
  - 各回を独立したフルチェックとして実行し、全ページを再スキャンするよう指定。
  - 3回目、4回目も同じ粒度でページ番号、セリフ抜粋、指摘内容を照合するよう明記。
  - 見直しが薄い場合はチェック未完了として出力前にやり直すよう指定。

### 提案チェックを10項目から14項目に拡張

- 対象: `src/js/progen-check-variation.js`
- 主な箇所: `generateVariationCheckPromptWithText()` の `check_items`, `report_format`, `self_check`
- 追加項目:
  - 11. 話の流れによる前後の矛盾
  - 12. 重言・同語反復
  - 13. 単語途中の改行
  - 14. 日本語としての違和感
- 内容:
  - 前後のセリフや状況説明を照合し、話の流れとして矛盾する可能性がある箇所を検出。
  - 意味としての重言だけでなく、同じ語句や言い回しの不自然な反復も検出。
  - 単語、固有名詞、複合語、外来語、熟語の途中で不自然に改行されている箇所を検出。
  - 助詞、語順、係り受け、主語述語の対応など、日本語として違和感がある可能性を検出。
  - 報告フォーマットの並び順を `1→14` に更新。
  - 自己点検に、項目11〜14の見落とし確認を追加。

### 提案チェックUIの表示更新

- 対象: `src/js/progen-proofreading.js`, `src/index.html`
- 主な箇所:
  - `src/js/progen-proofreading.js`: `updateProofreadingCheckItems()`
  - `src/index.html`: 校正ページの提案チェック表示、提案チェックモーダル
- 内容:
  - 左サイドバーの見出しを `提案チェック項目（14項目）` に変更。
  - 左サイドバーに項目11〜14を追加。
  - 校正ページ上部の説明を `表記・固有名詞・文章品質（14項目）` に更新。
  - 提案チェックモーダルの表記を `項目1〜14` に更新し、追加4項目の説明を追記。

## 検証

- `src/js/progen-xml-gen.js`: `node --input-type=module --check`
- `src/js/progen-xml-templates.js`: `node --input-type=module --check`
- `src/js/progen-check-simple.js`: `node --input-type=module --check`
- `src/js/progen-check-variation.js`: `node --input-type=module --check`
- `src/js/progen-proofreading.js`: `node --input-type=module --check`

