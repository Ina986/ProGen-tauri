/* =========================================
   XML生成
   ========================================= */
import { state } from './progen-state.js';
function generateXML() {
    const labelText = document.getElementById('labelSelector').value || document.getElementById('labelSelectorText').textContent || '未選択';
    const dataType = document.getElementById('dataTypeSelector').value;

    // カテゴリ別にルールをグループ化してXML生成
    let rulesXML = '';

    Object.keys(categories).forEach(catKey => {
        const cat = categories[catKey];

        const rulesInCat = state.currentProofRules.filter(r => r.category === catKey && r.active);

        // 補助動詞カテゴリ：汎用ルールとして出力
        if (catKey === 'auxiliary') {
            if (rulesInCat.length === 0) return; // チェックボックスOFFの場合はスキップ
            rulesXML += `
            <group name="補助動詞のひらき">
                <instruction>補助動詞は基本的にひらがなで表記してください。</instruction>
                <instruction>補助動詞とは、本来の動詞としての意味が薄れ、他の動詞の後に付いて補助的な意味を添える動詞です。</instruction>
                <general_rule>「〜てもらう」「〜てほしい」「〜ていく」「〜てくる」「〜ておく」「〜てみる」「〜てあげる」「〜てくれる」など、動詞の連用形＋「て」の後に続く場合はひらがなにしてください。</general_rule>
                <examples description="以下は具体例です">`;
            rulesInCat.forEach(r => {
                rulesXML += `
                    <example><before>${escapeHtml(r.src)}</before><after>${escapeHtml(r.dst)}</after></example>`;
            });
            rulesXML += `
                </examples>
            </group>`;
            return;
        }

        // 数字カテゴリ：XML指示文として出力
        if (catKey === 'number') {
            const personOpt = numberSubRules.personCount.options[state.numberRulePersonCount];
            const thingOpt = numberSubRules.thingCount.options[state.numberRuleThingCount];
            const monthOpt = numberSubRules.month.options[state.numberRuleMonth];
            let baseInstruction;
            if (state.numberRuleBase === 1) {
                baseInstruction = 'すべてアラビア数字で統一して表記してください。';
            } else if (state.numberRuleBase === 2) {
                baseInstruction = 'すべて漢数字で統一して表記してください。';
            } else {
                baseInstruction = '基本的にアラビア数字で表記してください。ただし、動詞・名詞として使われる場合は漢数字で表記してください。';
            }
            rulesXML += `
            <group name="数字の表記">
                <instruction>${escapeHtml(baseInstruction)}</instruction>`;
            if (state.numberSubRulesEnabled) {
                rulesXML += `
                <sub_rule name="人数の表記">
                    <format>${escapeHtml(personOpt)}</format>
                    <note>初出の表記に統一してください。</note>
                </sub_rule>
                <sub_rule name="戸数の表記">
                    <format>${escapeHtml(thingOpt)}</format>
                    <note>初出の表記に統一してください。</note>
                </sub_rule>
                <sub_rule name="月の表記">
                    <format>${escapeHtml(monthOpt)}</format>
                    <note>初出の表記に統一してください。</note>
                </sub_rule>`;
            }
            rulesXML += `
            </group>`;
            return;
        }

        // 難読漢字カテゴリ：modeに応じてひらく/ルビを分けて出力
        if (catKey === 'difficult') {
            const allDifficult = state.currentProofRules.filter(r => r.category === 'difficult');
            // modeがない場合はactiveから推定
            allDifficult.forEach(r => { if (!r.mode) r.mode = r.active ? 'open' : 'none'; });

            const openRules = allDifficult.filter(r => r.mode === 'open');
            const rubyRules = allDifficult.filter(r => r.mode === 'ruby');

            // ひらく用グループ
            if (openRules.length > 0) {
                rulesXML += `
            <group name="難読漢字のひらき">
                <instruction>難読漢字は基本的にひらがなで表記してください。</instruction>
                <instruction>一般的に読みにくい漢字、常用漢字表にない漢字、または読み方が特殊な漢字はひらがなに置き換えてください。</instruction>
                <general_rule>文脈から意味が通じやすく、読者がスムーズに読めるようひらがなを優先してください。</general_rule>
                <examples description="以下は具体例です">`;
                openRules.forEach(r => {
                    rulesXML += `
                    <example><before>${escapeHtml(r.src)}</before><after>${escapeHtml(r.dst)}</after></example>`;
                });
                rulesXML += `
                </examples>
            </group>`;
            }

            // ルビ用グループ
            if (rubyRules.length > 0) {
                rulesXML += `
            <group name="難読漢字（ルビ用）">
                <instruction>このグループのルールは置換ではなく、[親文字](ルビ) の形式で出力してください。</instruction>
                <instruction>ルビは各難読漢字の初出時のみ付けてください。2回目以降の出現時は親文字のみ（ルビなし）で出力してください。</instruction>
                <example>初出：[嗚咽](おえつ)　→　2回目以降：嗚咽</example>`;
                rubyRules.forEach(r => {
                    const safeSrc = escapeHtml(r.src);
                    const safeDst = escapeHtml(r.dst);
                    rulesXML += `
                <rule type="ruby">
                    <kanji>${safeSrc}</kanji>
                    <reading>${safeDst}</reading>
                    <output_format>[${safeSrc}](${safeDst})</output_format>
                </rule>`;
                });
                rulesXML += `
            </group>`;
            }
            return;
        }

        // 人物名カテゴリは特別処理：addRubyがtrueのもののみルビ付け
        if (catKey === 'character') {
            // 人物名はactiveではなくaddRubyでフィルタ
            const allCharacters = state.currentProofRules.filter(r => r.category === 'character');
            // addRubyがundefinedの場合はtrueとして扱う（後方互換性）
            const rubyCharacters = allCharacters.filter(r => r.addRuby !== false);

            if (rubyCharacters.length === 0) return;

            rulesXML += `
            <group name="${cat.name}">
                <instruction>このグループのルールは置換ではなく、[親文字](ルビ) の形式で出力してください。</instruction>
                <instruction>ルビは各人物名の初出時のみ付けてください。2回目以降の出現時は親文字のみ（ルビなし）で出力してください。</instruction>
                <example>初出：[田中](たなか)　→　2回目以降：田中</example>`;

            rubyCharacters.forEach(r => {
                const safeSrc = escapeHtml(r.src);
                const safeDst = escapeHtml(r.dst);
                rulesXML += `
                <rule type="ruby">
                    <character>${safeSrc}</character>
                    <reading>${safeDst}</reading>
                    <output_format>[${safeSrc}](${safeDst})</output_format>
                </rule>`;
            });

            rulesXML += `
            </group>`;
            return;
        }

        if (rulesInCat.length === 0) return;

        rulesXML += `
            <group name="${cat.name}">`;

        rulesInCat.forEach(r => {
            const safeSrc = escapeHtml(r.src);
            const safeDst = escapeHtml(r.dst);
            const safeNote = escapeHtml(r.note);

            if (r.note && r.note.trim() !== "") {
                rulesXML += `
                <rule>
                    <before>${safeSrc}</before>
                    <after>${safeDst}</after>
                    <condition>${safeNote}</condition>
                </rule>`;
            } else {
                rulesXML += `
                <rule>
                    <before>${safeSrc}</before>
                    <after>${safeDst}</after>
                </rule>`;
            }
        });

        rulesXML += `
            </group>`;
    });

    // データ種類に応じて適切なXML生成関数を使用
    let finalXML;
    if (dataType === 'pdf_only') {
        finalXML = generatePdfOnlyXML(rulesXML);
    } else if (dataType === 'pdf_and_txt') {
        finalXML = generatePdfAndTxtXML(rulesXML);
    } else {
        finalXML = generateTxtOnlyXML(rulesXML);
    }
    document.getElementById('outputArea').value = finalXML;
}

// 見直しチェック用のXMLを生成
function getReviewCheckXml() {
    let xml = '';

    // 常用外漢字チェック：TXTがあり、検出結果がある場合のみ有効
    const hasNonJoyoWords = state.optionNonJoyoCheck && state.detectedNonJoyoWords.length > 0;

    if (state.optionTypoCheck || state.optionMissingCharCheck || state.optionNameRubyCheck || hasNonJoyoWords) {
        xml += `
        <additional_review_checks name="追加見直しチェック">
            <instruction>以下の項目についても追加でチェックを行い、該当箇所があれば後述の報告フォーマットに従って報告してください。</instruction>

            <paging_rules name="ページカウントルール">
                <rule>テキストブロックの区切りとして使用されている「----------」（ハイフン10個）をページの区切りと見なしてください。</rule>
                <rule>最初のテキストブロックを「1ページ目」、次の「----------」の後のブロックを「2ページ目」としてカウントしてください。</rule>
                <rule>空ページ（テキストがなく「----------」が連続する箇所）も1ページとしてカウントしてください。</rule>
                <volume_format>原稿に「[XX巻]」形式の巻番号がある場合は、「8巻 3ページ」のように巻番号も含めて報告してください。</volume_format>
            </paging_rules>`;

        if (state.optionTypoCheck) {
            xml += `
            <check_item name="誤字チェック">
                <description>漢字の変換ミス、タイプミスを検出します。</description>
                <examples>
                    <example>「行って」→「言って」（文脈に合わない漢字変換）</example>
                    <example>「意外」→「以外」（同音異義語の誤用）</example>
                </examples>
            </check_item>`;
        }
        if (state.optionMissingCharCheck) {
            xml += `
            <check_item name="脱字チェック">
                <description>文字の抜け落ちを検出します。</description>
                <examples>
                    <example>「ことじないか」→「ことじゃないか」（「ゃ」の脱落）</example>
                    <example>「だいじぶ」→「だいじょうぶ」（「ょう」の脱落）</example>
                </examples>
            </check_item>`;
        }

        if (state.optionNameRubyCheck) {
            xml += `
            <check_item name="人名ルビふり確認">
                <description>漢字表記の人物名が初めて登場した箇所について、ルビをふるかどうかの確認を促します。</description>
                <exclusion>肩書・役職名（例：「社長」「先生」「部長」など）は人名に該当しないため、対象外です。</exclusion>
                <exclusion>ひらがな・カタカナのみで表記された人名も対象外とします。</exclusion>
                <note>同一の名前が複数出てきた場合は、最初に登場したページのみを報告してください。</note>
            </check_item>`;
        }

        if (hasNonJoyoWords) {
            xml += `
            <check_item name="常用外漢字チェック">
                <description>以下の常用漢字表（2136字）に含まれない漢字を含む単語が検出されました。ルビの要否や表記の適切性を確認してください。</description>
                <detected_words>`;
            state.detectedNonJoyoWords.forEach(item => {
                xml += `
                    <word kanji="${escapeHtml(item.word)}" non_joyo="${item.nonJoyoChars.map(c => escapeHtml(c)).join(',')}" />`;
            });
            xml += `
                </detected_words>
                <check_points>
                    <point>読み手の対象年齢に対して適切な表記か</point>
                    <point>ルビを振る必要があるか</point>
                    <point>ひらがなに開くべきか</point>
                </check_points>
            </check_item>`;
        }

        // チェック項目のリストを動的に生成
        const checkTypes = ['誤字', '脱字', '人名ルビ'];
        if (hasNonJoyoWords) checkTypes.push('常用外漢字');

        let exampleRows = `| 誤字 | 3ページ目 | 「そんなこと言ってないよ」 | 「言って」→「行って」の可能性 |
| 脱字 | 5ページ目 | 「そうじないか？」 | 「じ」→「じゃ」の脱落 |
| 人名ルビ | 1ページ目 | 「田中さんが来た」 | 「田中」の初出：ルビ要否確認 |`;
        if (hasNonJoyoWords) {
            exampleRows += `
| 常用外漢字 | 2ページ目 | 「嗚咽を漏らす」 | 「嗚咽（おえつ）」にルビを付けてください |`;
        }

        xml += `
            <report_format name="報告フォーマット">
                <instruction>見直しチェックの結果は、以下のMarkdownテーブル形式で報告してください。</instruction>
                <columns>
                    <column name="チェック項目">${checkTypes.join('/')} のいずれか</column>
                    <column name="該当箇所">ページ番号（例：3ページ目、または 8巻 5ページ）</column>
                    <column name="セリフの抜粋">該当するセリフの一部を抜粋</column>
                    <column name="指摘内容">問題点と修正案（誤字・脱字の場合）、ルビ要否の確認（人名の場合）${hasNonJoyoWords ? '、「○○（読み）」にルビを付けてください の形式（常用外漢字の場合）' : ''}</column>
                </columns>
                <example><![CDATA[
| チェック項目 | 該当箇所 | セリフの抜粋 | 指摘内容 |
|------------|---------|------------|---------|
${exampleRows}
]]></example>
                <note>該当箇所がない場合は「該当なし」と報告してください。</note>
            </report_format>
        </additional_review_checks>`;
    }

    return xml;
}

// セリフTXTデータのXMLを生成（複数ファイル対応）
function getManuscriptTxtXml() {
    if (!state.manuscriptTxtFiles || state.manuscriptTxtFiles.length === 0) {
        return '';
    }

    // 複数ファイルの場合は結合して出力
    if (state.manuscriptTxtFiles.length === 1) {
        const file = state.manuscriptTxtFiles[0];
        const escapedText = file.content.replace(/]]>/g, ']]]]><![CDATA[>');
        return `
    <manuscript_text name="校正対象セリフデータ" source="${escapeHtml(file.name)}">
        <instruction>以下のテキストデータは校正対象となるセリフ原稿です。上記の校正ルールを適用して修正してください。</instruction>
        <raw_text><![CDATA[
${escapedText}
]]></raw_text>
    </manuscript_text>
`;
    } else {
        // 複数ファイルの場合
        let xml = `
    <manuscript_texts name="校正対象セリフデータ" file_count="${state.manuscriptTxtFiles.length}">
        <instruction>以下のテキストデータは校正対象となるセリフ原稿です。複数ファイルが含まれています。各ファイルを順番に処理し、上記の校正ルールを適用して修正してください。</instruction>`;

        state.manuscriptTxtFiles.forEach((file, index) => {
            const escapedText = file.content.replace(/]]>/g, ']]]]><![CDATA[>');
            xml += `
        <file number="${index + 1}" source="${escapeHtml(file.name)}">
            <raw_text><![CDATA[
${escapedText}
]]></raw_text>
        </file>`;
        });

        xml += `
    </manuscript_texts>
`;
        return xml;
    }
}

// 出力形式XMLを生成（COMIC-POT形式）
function getOutputFormatXml() {
    const vol = String(state.outputFormatVolume).padStart(2, '0');
    const startP = state.outputFormatStartPage;
    const p2 = startP + 1;
    return `<output_format>
            <instruction>テキストは、ヘッダー部分に「Plaintext」と表示されるコードブロックに書き込む</instruction>
            <instruction>出力の先頭行に [COMIC-POT:${state.outputFormatSortMode}] ヘッダーを記述する</instruction>
            <instruction>ヘッダーの次の行に [${vol}巻] のように巻番号マーカーを記述する（巻数=${state.outputFormatVolume}、2桁ゼロ埋め）</instruction>
            <instruction>各ページの先頭に &lt;&lt;${startP}Page&gt;&gt;、&lt;&lt;${p2}Page&gt;&gt;… のように &lt;&lt;ページ番号Page&gt;&gt; 形式のページマーカーを付与する（開始ページ=${startP}）</instruction>
            <instruction>ページ間に「----------」は使用せず、&lt;&lt;XPage&gt;&gt; マーカーをページ区切りとする</instruction>
            <instruction critical="true">【必須】吹き出し（フキダシ）ごとに1行の空白行を入れて区切る。これは絶対に守ること。</instruction>
            <instruction>出力するテキストには、ダブルクォーテーションや行番号など、余分な情報を追記しない</instruction>
            <instruction>ページに抽出対象となるテキストが一切存在しない場合は、次のページマーカーが直後に続くようにする</instruction>
        </output_format>
        <citation_marker_removal>
            <instruction>出力テキストから以下のシステムタグを完全に削除すること：</instruction>
            <target>[cite:...]、[cite_end]、[source:...]など、角括弧で囲まれた参照タグ</target>
            <target>脚注番号や参照元のファイル番号</target>
            <goal>人間が手書きで清書したかのような、システム的な注釈記号が一切ない純粋なテキストに仕上げる</goal>
        </citation_marker_removal>
        <example description="COMIC-POT形式の正しい出力例">
            <![CDATA[
[COMIC-POT:${state.outputFormatSortMode}]
[${vol}巻]
<<${startP}Page>>
気分は
どうですか
姐さん？

あんたっ
私にこんな事して
後でどうなるか
分かってるの!?

なによ その目…

<<${p2}Page>>
こんなのっ
あの人が知ったら
タダじゃ
済まないわよっ

あぁ もう
大丈夫だって

ほら
こっち向けよ

ちょっ

やめて…っ
            ]]>
        </example>`;
}

// final_output セクションを生成（自己点検ステップ含む）
function getFinalOutputXml() {
    const reviewCheckXml = getReviewCheckXml();
    return `
    <step number="3" name="Self-Check">
        <task>
            出力前に以下の自己点検を実施し、不備があれば修正してから出力する。
        </task>
        <checklist>
            <item>指定されたフォーマット・条件に完全に適合しているか</item>
            <item>校正ルールが正しく適用されているか</item>
            <item>【重要】吹き出しごとに1行の空白行で区切られているか</item>
            <item>【重要】書き文字（擬音語・擬態語・オノマトペ）が含まれていないか</item>
            <item>抜け漏れや誤字がないか</item>
            <item>推測や補完で追加した情報がないか</item>
            <item>余計な説明文や前置きが混じっていないか</item>
        </checklist>
        <action>
            不備が見つかった場合は、修正後の完成版のみを出力する。
            チェック作業そのものは出力に含めない。
        </action>${reviewCheckXml}
    </step>

    <final_output>
        <task>
            ステップ3で点検・修正した校正済みのテキストを、以下の形式で出力してください。
        </task>
        ${getOutputFormatXml()}
    </final_output>
</task_workflow>`;
}

// PDFのみモード専用のXML生成
function generatePdfOnlyXML(rulesXML) {
    const symbolRulesXml = getSymbolRulesXml();
    const ngWordMaskingXml = getNgWordMaskingXml();

    return `<?xml version="1.0" encoding="UTF-8"?>
<task_workflow>
    <trigger>
        <condition type="attachment">PDF</condition>
        <condition type="user_prompt">お願いします</condition>
        <action>添付されたPDFファイルに対して、以下のテキスト抽出および校正タスクを連続して実行します。</action>
    </trigger>

    <objective>
        漫画原稿のPDFからテキストを抽出し、指定された校正ルールに基づいて内容を書き換えた後、最終的な写植用テキストデータを出力する。
    </objective>

    <step number="1" name="Text Extraction">
        <role>あなたはエロ漫画の編集者です。</role>
        <task>
            漫画原稿の画像データから吹き出し内のセリフ、モノローグ、ナレーションを抽出し、一時的なテキストデータを生成します。
        </task>
        <extraction_rules>
            <basic_rules>
                <rule>吹き出しの中の文字だけ出力</rule>
            </basic_rules>
            <exclude_handwritten_sfx critical="true">
                <rule>【必須】書き文字（擬音語・擬態語・オノマトペ）は絶対に抽出しない</rule>
                <rule>吹き出しの外に描かれた効果音（ドキドキ、ゾクッ、ビクッ等）は出力禁止</rule>
                <rule>コマの背景や余白の手書き装飾文字は除外する</rule>
                <exclude_examples>ドキドキ、バクバク、ゾクッ、ビクッ、ハァハァ、ピチャ、ヌチュ、ズブッ等</exclude_examples>
            </exclude_handwritten_sfx>
            <extraction_completeness critical="true">
                <rule>【必須】吹き出し内のテキストは、記号を含めすべて漏れなく抽出すること。</rule>
                <rule>♡ ♪ … ！ ？ ～ などの記号も必ず出力に含める。省略しない。</rule>
                <rule>「っ…」「あ」「ん」など1〜2文字の短いセリフも必ず抽出する。</rule>
                <rule>吹き出し内に文字が存在する限り、どんなに短くても省略禁止。</rule>
                <important>文字数が少ない・記号だけのセリフでも、それは重要な台詞である。</important>
                <examples>
                    <must_extract>♡</must_extract>
                    <must_extract>っ…</must_extract>
                    <must_extract>あ</must_extract>
                    <must_extract>ん♡</must_extract>
                </examples>
            </extraction_completeness>
            <reading_order critical="true">
                <format>右とじ（日本の漫画標準形式）</format>
                <principle>右から左、上から下の順序で読む</principle>
                <panel_order>
                    <rule>ページ内のコマは「右上 → 左上 → 右下 → 左下」の順に処理する</rule>
                    <rule>同じ高さにあるコマは、右側のコマを先に処理する</rule>
                    <rule>段が変わったら（下に移動したら）、再び右側から処理する</rule>
                </panel_order>
                <balloon_order>
                    <rule>コマ内の吹き出しも「右上 → 左 → 下」の順に処理する</rule>
                    <rule>同じ高さにある吹き出しは、右側を先に出力する</rule>
                </balloon_order>
            </reading_order>
            <balloon_identification critical="true">
                <definition>「吹き出し」とは、輪郭線（枠線）で囲まれたひとつの閉じた領域のこと。</definition>
                <rule>同じ輪郭線の内側にあるテキストは、すべて「1つの吹き出し」として扱う。</rule>
                <rule>吹き出し内部での改行・行間・文字配置に関わらず、枠が同じなら同一の吹き出しである。</rule>
                <rule>輪郭線が別々であれば、たとえ近接していても「別の吹き出し」である。</rule>
                <caution>【注意】吹き出し内の改行位置で分割しないこと。枠線の境界のみが吹き出しの区切りである。</caution>
            </balloon_identification>
            <format_rules>
                <rule>画像データ内で改行されている位置で改行</rule>
                <rule critical="true">【必須】吹き出し（フキダシ）ごとに必ず1行の空白行を入れて区切る</rule>
            </format_rules>
            <symbol_replacement_rules>${symbolRulesXml}
            </symbol_replacement_rules>${ngWordMaskingXml}
        </extraction_rules>
    </step>

    <step number="2" name="Proofreading and Correction">
        <task>
            ステップ1で生成したテキスト全体に対し、以下の「proofreading_rules」を厳密に適用して、テキストを書き換えてください。
        </task>
        <proofreading_rules>
${rulesXML}
        </proofreading_rules>
    </step>
${getManuscriptTxtXml()}${getFinalOutputXml()}`;
}

// PDF+TXTモード専用のXML生成
function generatePdfAndTxtXML(rulesXML) {
    const symbolRulesXml = getSymbolRulesXml();
    const ngWordMaskingXml = getNgWordMaskingXml();

    return `<?xml version="1.0" encoding="UTF-8"?>
<task_workflow>
    <trigger>
        <condition type="attachment">PDF + Text File</condition>
        <condition type="user_prompt">お願いします</condition>
        <action>添付されたPDFとテキストファイルを照合し、校正タスクを実行します。</action>
    </trigger>

    <objective>
        PDFを「正解（読み順・行数）」、テキストファイルを「素材（文字情報）」として扱い、照合・修正後、校正ルールを適用して写植用データを出力する。
    </objective>

    <step number="1" name="Cross-Reference and Correction">
        <role>あなたはエロ漫画の編集者です。</role>
        <task>
            PDFを「正解（読み順・行数）」、テキストファイルを「素材（文字情報）」として照合・修正し、一時的なテキストデータを生成します。
        </task>
        <processing_rules>
            <basic_rules>
                <rule>PDFの視覚情報と照らし合わせ、テキストファイルの読み順ミスや抜け漏れを修正する</rule>
                <rule>PDFの吹き出し配置に基づき、正しい読み順に並べる</rule>
            </basic_rules>
            <exclude_handwritten_sfx critical="true">
                <rule>【必須】書き文字（擬音語・擬態語・オノマトペ）は含めない</rule>
                <rule>PDFに書き文字が見えても、それを出力に追加しない</rule>
                <rule>吹き出しの外の効果音（ドキドキ、ゾクッ、ビクッ等）は除外する</rule>
            </exclude_handwritten_sfx>
            <extraction_completeness critical="true">
                <rule>【必須】吹き出し内のテキストは、記号を含めすべて漏れなく出力すること。</rule>
                <rule>♡ ♪ … ！ ？ ～ などの記号も必ず出力に含める。省略しない。</rule>
                <rule>「っ…」「あ」「ん」など1〜2文字の短いセリフも必ず含める。</rule>
                <rule>吹き出し内に文字が存在する限り、どんなに短くても省略禁止。</rule>
                <important>文字数が少ない・記号だけのセリフでも、それは重要な台詞である。</important>
            </extraction_completeness>
            <reading_order critical="true">
                <format>右とじ（日本の漫画標準形式）</format>
                <principle>右から左、上から下の順序で読む</principle>
                <panel_order>
                    <rule>ページ内のコマは「右上 → 左上 → 右下 → 左下」の順に処理する</rule>
                    <rule>同じ高さにあるコマは、右側のコマを先に処理する</rule>
                    <rule>段が変わったら（下に移動したら）、再び右側から処理する</rule>
                </panel_order>
                <balloon_order>
                    <rule>コマ内の吹き出しも「右上 → 左 → 下」の順に処理する</rule>
                    <rule>同じ高さにある吹き出しは、右側を先に出力する</rule>
                </balloon_order>
            </reading_order>
            <balloon_identification critical="true">
                <definition>「吹き出し」とは、輪郭線（枠線）で囲まれたひとつの閉じた領域のこと。</definition>
                <rule>同じ輪郭線の内側にあるテキストは、すべて「1つの吹き出し」として扱う。</rule>
                <rule>吹き出し内部での改行・行間・文字配置に関わらず、枠が同じなら同一の吹き出しである。</rule>
                <rule>輪郭線が別々であれば、たとえ近接していても「別の吹き出し」である。</rule>
                <caution>【注意】吹き出し内の改行位置で分割しないこと。枠線の境界のみが吹き出しの区切りである。</caution>
            </balloon_identification>
            <format_rules>
                <rule>吹き出し内で改行されている位置で改行</rule>
                <rule critical="true">【必須】吹き出し（フキダシ）ごとに必ず1行の空白行を入れて区切る</rule>
            </format_rules>
            <symbol_replacement_rules>${symbolRulesXml}
            </symbol_replacement_rules>${ngWordMaskingXml}
        </processing_rules>
    </step>

    <step number="2" name="Proofreading and Correction">
        <task>
            ステップ1で生成したテキスト全体に対し、以下の「proofreading_rules」を厳密に適用して、テキストを書き換えてください。
        </task>
        <proofreading_rules>
${rulesXML}
        </proofreading_rules>
    </step>
${getManuscriptTxtXml()}${getFinalOutputXml()}`;
}

// TXTのみモード専用のXML生成
function generateTxtOnlyXML(rulesXML) {
    const symbolRulesXml = getSymbolRulesXml();
    const ngWordMaskingXml = getNgWordMaskingXml();

    return `<?xml version="1.0" encoding="UTF-8"?>
<task_workflow>
    <trigger>
        <condition type="attachment">Text File</condition>
        <condition type="user_prompt">お願いします</condition>
        <action>添付されたテキストファイルに対して、整形および校正タスクを実行します。</action>
    </trigger>

    <objective>
        添付テキストに対し、「校正ルール」および「フォーマットルール」を適用して全面的に書き換え、写植用データを出力する。
    </objective>

    <step number="1" name="Text Formatting">
        <role>あなたはエロ漫画の編集者です。</role>
        <task>
            添付テキストの内容を読み込み、フォーマットを整えます。
        </task>
        <formatting_rules>
            <format_rules>
                <rule>テキストデータ内で改行されている位置で改行</rule>
                <rule critical="true">【必須】吹き出し（フキダシ）ごとに必ず1行の空白行を入れて区切る</rule>
            </format_rules>
            <symbol_replacement_rules>${symbolRulesXml}
            </symbol_replacement_rules>${ngWordMaskingXml}
        </formatting_rules>
    </step>

    <step number="2" name="Proofreading and Correction">
        <task>
            ステップ1で整形したテキスト全体に対し、以下の「proofreading_rules」を厳密に適用して、テキストを書き換えてください。
        </task>
        <proofreading_rules>
${rulesXML}
        </proofreading_rules>
    </step>
${getManuscriptTxtXml()}${getFinalOutputXml()}`;
}

function copyToClipboard() {
    const text = document.getElementById('outputArea').value;
    navigator.clipboard.writeText(text).then(() => {
        const msg = document.getElementById('copyMsg');
        msg.style.opacity = 1;
        setTimeout(() => { msg.style.opacity = 0; }, 2000);
    });
}

// プレビューモーダル操作
function openPreviewModal() {
    generateXML(); // 最新状態を生成
    const text = document.getElementById('outputArea').value;
    document.getElementById('previewArea').textContent = text;
    document.getElementById('previewModal').style.display = 'flex';
    // 背景スクロールをロック
    document.body.style.overflow = 'hidden';
}

function closePreviewModal() {
    document.getElementById('previewModal').style.display = 'none';
    // 背景スクロールを解除
    document.body.style.overflow = '';
}

function copyFromPreview() {
    const text = document.getElementById('outputArea').value;
    navigator.clipboard.writeText(text).then(() => {
        const msg = document.getElementById('copyMsg');
        msg.style.opacity = 1;
        setTimeout(() => { msg.style.opacity = 0; }, 2000);
        closePreviewModal();
    });
}

// Geminiで開く（コピー後に新しいタブで開く）
function copyAndOpenGemini() {
    generateXML(); // 最新状態を生成
    const text = document.getElementById('outputArea').value;
    navigator.clipboard.writeText(text).then(() => {
        const msg = document.getElementById('copyMsg');
        msg.style.opacity = 1;
        setTimeout(() => { msg.style.opacity = 0; }, 2000);
    }).catch(err => {
        console.error('クリップボードコピー失敗:', err);
    });
    // Geminiを新しいタブで開く（クリップボード操作に依存しない）
    window.open('https://gemini.google.com/app', '_blank');
}


// ES Module exports
export { generateXML, getReviewCheckXml, getManuscriptTxtXml, getOutputFormatXml, getFinalOutputXml, generatePdfOnlyXML, generatePdfAndTxtXML, generateTxtOnlyXML, copyToClipboard, openPreviewModal, closePreviewModal, copyFromPreview, copyAndOpenGemini };

// Expose to window for inline HTML handlers
Object.assign(window, { generateXML, getReviewCheckXml, getManuscriptTxtXml, getOutputFormatXml, getFinalOutputXml, generatePdfOnlyXML, generatePdfAndTxtXML, generateTxtOnlyXML, copyToClipboard, openPreviewModal, closePreviewModal, copyFromPreview, copyAndOpenGemini });
