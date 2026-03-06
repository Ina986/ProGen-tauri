/* ===========================================
   Progen - テキスト抽出・成形プロンプトジェネレータ
   JavaScript
   =========================================== */

import { state } from './progen-state.js';
/* =========================================
   固定XMLパーツ (Gemini向けに最適化)
   ========================================= */
// データ種類に応じたXMLヘッダーを生成
function getXmlHeader(dataType) {
    const baseHeader = `<?xml version="1.0" encoding="UTF-8"?>
<task_workflow>
    <trigger>
        <condition type="attachment">${getAttachmentType(dataType)}</condition>
        <condition type="user_prompt">Execute Proofreading</condition>
        <action>Process the attached manga manuscript for text extraction and strict proofreading.</action>
    </trigger>

    <objective>
        ${getObjective(dataType)}
    </objective>

    <system_instructions>
        <instruction>あなたはプロの漫画編集者です。文脈を理解し、誤字脱字だけでなく、キャラクターの話し方の統一も行います。</instruction>
        <instruction>出力は指定されたフォーマットのみ行い、挨拶や解説は不要です。</instruction>
        <hallucination_prevention>
            <rule>提供された画像・テキスト情報のみを使用し、推測や補完は行わない</rule>
            <rule>読み取れない文字や不明な箇所は「※判読不能」と明記する</rule>
            <rule>情報が不足している場合は、不足している旨を明記する</rule>
            <rule>ステップバイステップで処理を進め、各ステップの結果を確認してから次に進む</rule>
        </hallucination_prevention>
    </system_instructions>

${getProcessingSteps(dataType)}`;
    return baseHeader;
}

function getAttachmentType(dataType) {
    switch(dataType) {
        case 'pdf_only': return 'PDF or Images';
        case 'pdf_and_txt': return 'PDF/Images + Text File';
        case 'txt_only': return 'Text File Only';
        default: return 'PDF or Images';
    }
}

function getObjective(dataType) {
    switch(dataType) {
        case 'pdf_only':
            return '漫画原稿のPDFからテキストを抽出し、指定された「校正ルール」に基づいて厳密にテキストを修正し、写植用データを出力する。';
        case 'pdf_and_txt':
            return 'PDFを「正解（読み順・行数）」、テキストファイルを「素材（文字情報）」として扱い、照合・修正後、校正ルールを適用して写植用データを出力する。';
        case 'txt_only':
            return '添付テキストに対し、「校正ルール」および「フォーマットルール」を適用して全面的に書き換え、写植用データを出力する。';
        default:
            return '漫画原稿からテキストを抽出し、校正ルールを適用して写植用データを出力する。';
    }
}

// 記号置換ルールからXMLを生成
function getSymbolRulesXml() {
    let xml = '';
    state.symbolRules.filter(r => r.active).forEach(r => {
        const fromVal = escapeHtml(r.src);
        const toVal = escapeHtml(r.dst);
        xml += `
                <rule><original>${fromVal}</original><replacement>${toVal}</replacement></rule>`;
    });
    // 感嘆符・疑問符の全角/半角ルールを追加
    xml += `
                <punctuation_rules>
                    <instruction>感嘆符・疑問符が連続する場合（!?、!!、??など）は半角で出力する</instruction>
                    <instruction>感嘆符・疑問符が単独の場合（！、？）は全角で出力する</instruction>
                    <example>単独：なに？　連続：なんだって!?</example>
                </punctuation_rules>`;
    return xml;
}

// NGワードリスト
const ngWordList = [
    { original: "ヴァギナ", replacement: "ヴァ〇ナ" },
    { original: "クリトリス", replacement: "ク〇トリス" },
    { original: "クリ", replacement: "ク〇" },
    { original: "クンニ", replacement: "ク〇ニ" },
    { original: "ザーメン", replacement: "ザ〇メン" },
    { original: "スカトロ", replacement: "スカ〇ロ" },
    { original: "スペルマ", replacement: "スペ〇マ" },
    { original: "レイプ", replacement: "レ〇プ" },
    { original: "ファック", replacement: "ファ〇ク" },
    { original: "イラマチオ", replacement: "イラ〇チオ" },
    { original: "マラ", replacement: "マ〇" },
    { original: "カリ", replacement: "カ〇" },
    { original: "ペニス", replacement: "ペ〇ス" },
    { original: "ちんこ", replacement: "ち〇こ" },
    { original: "チンコ", replacement: "チ〇コ" },
    { original: "ちんぽ", replacement: "ち〇ぽ" },
    { original: "チンポ", replacement: "チ〇ポ" },
    { original: "ちんちん", replacement: "ち〇ちん" },
    { original: "チンチン", replacement: "チ〇チン" },
    { original: "ちん毛", replacement: "ち〇毛" },
    { original: "チン毛", replacement: "チ〇毛" },
    { original: "ヤリマン", replacement: "ヤリマ〇" },
    { original: "まんこ", replacement: "ま〇こ" },
    { original: "手マン", replacement: "手マ〇" },
    { original: "マン筋", replacement: "マ〇筋" },
    { original: "粗チン", replacement: "粗チ〇" }
];

// 伏字対応のXMLを生成
function getNgWordMaskingXml() {
    if (!state.optionNgWordMasking) return '';
    let xml = `
            <ng_word_replacement_rules name="NGワード置き換えルール">`;
    ngWordList.forEach(w => {
        xml += `
                <rule><original>${w.original}</original><replacement>${w.replacement}</replacement></rule>`;
    });
    xml += `
            </ng_word_replacement_rules>`;
    return xml;
}

// 正誤チェック用：伏字対象NGワードリストをXML形式で生成
function getNgWordListXmlForCheck() {
    let xml = '';
    ngWordList.forEach(w => {
        xml += `                        <word><original>${w.original}</original><masked>${w.replacement}</masked></word>\n`;
    });
    return xml.trimEnd();
}

// 正誤チェック用：登録人物名リストをXML形式で生成
// ※チェックボックスの状態に関係なく、登録されている人物名はすべて対象
function getCharacterListXmlForCheck() {
    const characterRules = state.currentProofRules.filter(r => r.category === 'character');
    if (characterRules.length === 0) {
        return '';
    }
    let xml = '';
    characterRules.forEach(r => {
        xml += `                        <character><name>${escapeHtml(r.src)}</name><reading>${escapeHtml(r.dst)}</reading></character>\n`;
    });
    return xml.trimEnd();
}

// 句読点を半角スペースにするXMLを生成
function getPunctuationToSpaceXml() {
    if (!state.optionPunctuationToSpace) return '';
    return `
            <punctuation_to_space_rules name="句読点を半角スペースに変換">
                <instruction>句読点（。、）は半角スペースに置換してください。</instruction>
                <rule><original>。</original><replacement> </replacement></rule>
                <rule><original>、</original><replacement> </replacement></rule>
            </punctuation_to_space_rules>`;
}

function getProcessingSteps(dataType) {
    const symbolRulesXml = getSymbolRulesXml();
    const ngWordMaskingXml = getNgWordMaskingXml();
    const punctuationToSpaceXml = getPunctuationToSpaceXml();

    if (dataType === 'pdf_only') {
        return `    <step number="1" name="Text Extraction">
        <task>
            漫画原稿の画像データからテキスト（吹き出し、モノローグ、ナレーション）を抽出する。
        </task>
        <extraction_rules>
            <rule>手書きのセリフも可能な限り抽出するが、背景の看板などは除外する。</rule>
            <normalization_rules>${symbolRulesXml}
            </normalization_rules>${ngWordMaskingXml}${punctuationToSpaceXml}
        </extraction_rules>
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
                <must_extract>…っ</must_extract>
                <must_extract>！？</must_extract>
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
            <example>
ページ内のコマ配置例:
┌──────┬──────┐
│  ②  │  ①  │ ← 右(①)から左(②)
├──────┴──────┤
│      ③      │ ← 上から下
├──────┬──────┤
│  ⑤  │  ④  │ ← 右(④)から左(⑤)
└──────┴──────┘
出力順: ① → ② → ③ → ④ → ⑤
            </example>
        </reading_order>
        <exclude_handwritten_sfx critical="true">
            <rule>【必須】書き文字（擬音語・擬態語・オノマトペ）は絶対に抽出しない。</rule>
            <rule>吹き出しの外に描かれた効果音（ドキドキ、ゾクッ、ビクッ等）は出力禁止。</rule>
            <rule>コマの背景や余白に配置された手書きの装飾文字は除外する。</rule>
            <examples>
                <exclude>ドキドキ、バクバク、ゾクッ、ビクッ、ハァハァ、ピチャ、ヌチュ、ズブッ等</exclude>
                <include>吹き出し内のセリフ、モノローグ、ナレーションのみ</include>
            </examples>
        </exclude_handwritten_sfx>
        <balloon_identification critical="true">
            <definition>「吹き出し」とは、輪郭線（枠線）で囲まれたひとつの閉じた領域のこと。</definition>
            <rule>同じ輪郭線の内側にあるテキストは、すべて「1つの吹き出し」として扱う。</rule>
            <rule>吹き出し内部での改行・行間・文字配置に関わらず、枠が同じなら同一の吹き出しである。</rule>
            <rule>輪郭線が別々であれば、たとえ近接していても「別の吹き出し」である。</rule>
            <caution>【注意】吹き出し内の改行位置で分割しないこと。枠線の境界のみが吹き出しの区切りである。</caution>
        </balloon_identification>
        <balloon_separator critical="true">
            <rule>【必須】吹き出し（フキダシ）ごとに、必ず1行の空白行を入れて区切ること。</rule>
            <rule>吹き出し内の改行はそのまま維持し、吹き出しの終わりで空行を1行追加する。</rule>
            <example>
吹き出し1の1行目
吹き出し1の2行目
                        ← ここに空行（吹き出しの区切り）
吹き出し2の1行目
                        ← ここに空行（吹き出しの区切り）
吹き出し3の1行目
吹き出し3の2行目
吹き出し3の3行目
            </example>
        </balloon_separator>
    </step>`;
    } else if (dataType === 'pdf_and_txt') {
        return `    <step number="1" name="Cross-Reference and Correction">
        <task>
            PDFを「正解（読み順・行数）」、テキストファイルを「素材（文字情報）」として照合・修正する。
        </task>
        <processing_rules>
            <rule>PDFの視覚情報と照らし合わせ、テキストファイルの読み順ミスや抜け漏れを修正する。</rule>
            <normalization_rules>${symbolRulesXml}
            </normalization_rules>${ngWordMaskingXml}${punctuationToSpaceXml}
        </processing_rules>
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
        <balloon_separator critical="true">
            <rule>【必須】吹き出し（フキダシ）ごとに、必ず1行の空白行を入れて区切ること。</rule>
            <rule>吹き出し内の改行はそのまま維持し、吹き出しの終わりで空行を1行追加する。</rule>
            <example>
吹き出し1の1行目
吹き出し1の2行目
                        ← ここに空行（吹き出しの区切り）
吹き出し2の1行目
                        ← ここに空行（吹き出しの区切り）
吹き出し3の1行目
吹き出し3の2行目
吹き出し3の3行目
            </example>
        </balloon_separator>
    </step>`;
    } else { // txt_only
        return `    <step number="1" name="Text Formatting">
        <task>
            添付テキストの内容を読み込み、フォーマットを整える。
        </task>
        <formatting_rules>
            <normalization_rules>${symbolRulesXml}
            </normalization_rules>${ngWordMaskingXml}${punctuationToSpaceXml}
        </formatting_rules>
        <balloon_separator critical="true">
            <rule>【必須】吹き出し（フキダシ）ごとに、必ず1行の空白行を入れて区切ること。</rule>
            <rule>吹き出し内の改行はそのまま維持し、吹き出しの終わりで空行を1行追加する。</rule>
            <example>
吹き出し1の1行目
吹き出し1の2行目
                        ← ここに空行（吹き出しの区切り）
吹き出し2の1行目
                        ← ここに空行（吹き出しの区切り）
吹き出し3の1行目
吹き出し3の2行目
吹き出し3の3行目
            </example>
        </balloon_separator>
    </step>`;
    }
}

const XML_STEP2 = `
    <step number="2" name="Proofreading">
        <task>
            テキストに対し、以下の「Proofreading Rules」を適用する。
        </task>
        <important_notice>
            <item>ルールに「条件(condition)」がある場合は、前後の文脈を読んで適用すべきか判断すること。</item>
            <item>条件がないルールは、機械的に置換すること。</item>
            <item>ルールに該当しない箇所は、原文をそのまま維持すること（勝手に要約や改変をしない）。</item>
        </important_notice>
        <proofreading_rules>`;

const XML_FOOTER = `        </proofreading_rules>
    </step>

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
        </action>
    </step>

    <final_output>
        <format_requirements>
            <req>ヘッダーに「Plaintext」と表示されるコードブロックに出力する。</req>
            <req>ページ区切りは「----------」（ハイフン10個）とする。</req>
            <req critical="true">【必須】吹き出し（フキダシ）ごとに1行の空白行を入れて区切る。これは絶対に守ること。</req>
        </format_requirements>
        <citation_marker_removal>
            <instruction>出力テキストから以下のシステムタグを完全に削除すること：</instruction>
            <target>[cite:...]、[cite_end]、[source:...]など、角括弧で囲まれた参照タグ</target>
            <target>脚注番号や参照元のファイル番号</target>
            <goal>人間が手書きで清書したかのような、システム的な注釈記号が一切ない純粋なテキストに仕上げる</goal>
        </citation_marker_removal>
        <output_example description="吹き出しごとに空行で区切られた正しい出力例">
            <![CDATA[
Page 1
----------
気分はどうですか
姐さん？
            ← 吹き出し1の終わり（次に空行）

あんたっ
私にこんな事して
後でどうなるか
分かってるの!?
            ← 吹き出し2の終わり（次に空行）

なによ その目…

----------
Page 2
----------
（...続く...）
            ]]>
        </output_example>
    </final_output>
</task_workflow>`;


// ES Module exports
export { getXmlHeader, getAttachmentType, getObjective, getSymbolRulesXml, getNgWordMaskingXml, getNgWordListXmlForCheck, getCharacterListXmlForCheck, getPunctuationToSpaceXml, getProcessingSteps };

// Expose to window for inline HTML handlers
Object.assign(window, { getXmlHeader, getAttachmentType, getObjective, getSymbolRulesXml, getNgWordMaskingXml, getNgWordListXmlForCheck, getCharacterListXmlForCheck, getPunctuationToSpaceXml, getProcessingSteps });
