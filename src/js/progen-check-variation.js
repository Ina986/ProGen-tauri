/* =========================================
   詳細チェック機能（項目1〜8）
   ========================================= */
import { state } from './progen-state.js';
let variationCheckTxtFiles = []; // 詳細チェック用のTXTファイル

// 詳細チェックモーダルを開く
function openVariationCheckModal() {
    variationCheckTxtFiles = [];
    renderVariationCheckFileList();
    updateVariationCheckSubmitBtn();
    document.getElementById('variationCheckModal').style.display = 'flex';
}

// 詳細チェックモーダルを閉じる
function closeVariationCheckModal() {
    document.getElementById('variationCheckModal').style.display = 'none';
    variationCheckTxtFiles = [];
}

// 詳細チェック用TXTファイル読み込み
function loadVariationCheckTxt(input) {
    const files = input.files;
    if (!files || files.length === 0) return;

    let loadedCount = 0;
    const totalFiles = files.length;

    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = function(e) {
            variationCheckTxtFiles.push({
                name: file.name,
                content: e.target.result,
                size: file.size
            });

            loadedCount++;
            if (loadedCount === totalFiles) {
                renderVariationCheckFileList();
                updateVariationCheckSubmitBtn();
            }
        };
        reader.readAsText(file, 'UTF-8');
    });

    input.value = '';
}

// 詳細チェック用ファイルリスト描画
function renderVariationCheckFileList() {
    const listEl = document.getElementById('variationCheckFileList');
    const statusEl = document.getElementById('variationCheckTxtStatus');

    if (variationCheckTxtFiles.length === 0) {
        listEl.innerHTML = '<p style="color:#999; text-align:center; padding:15px;">ファイルが選択されていません</p>';
        statusEl.textContent = '';
        return;
    }

    let html = '';
    let totalSize = 0;
    variationCheckTxtFiles.forEach((file, index) => {
        totalSize += file.size;
        const sizeStr = formatFileSize(file.size);
        html += `
            <div class="txt-file-item">
                <div class="txt-file-info">
                    <span class="txt-file-icon"><span class="svg-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="14" y2="17"/></svg></span></span>
                    <span class="txt-file-name">${escapeHtml(file.name)}</span>
                    <span class="txt-file-size">${sizeStr}</span>
                </div>
                <button class="txt-file-remove" onclick="removeVariationCheckTxt(${index})">削除</button>
            </div>
        `;
    });
    listEl.innerHTML = html;
    statusEl.textContent = `${variationCheckTxtFiles.length}ファイル選択済み`;
    statusEl.style.color = '#3498db';
}

// 詳細チェック用ファイル削除
function removeVariationCheckTxt(index) {
    if (index >= 0 && index < variationCheckTxtFiles.length) {
        variationCheckTxtFiles.splice(index, 1);
        renderVariationCheckFileList();
        updateVariationCheckSubmitBtn();
    }
}

// 送信ボタンの有効/無効を更新
function updateVariationCheckSubmitBtn() {
    const btn = document.getElementById('variationCheckSubmitBtn');
    btn.disabled = variationCheckTxtFiles.length === 0;
}

// 詳細チェックプロンプトを生成してGeminiで開く
function copyVariationCheckAndOpenGemini() {
    if (variationCheckTxtFiles.length === 0) {
        showToast('セリフTXTファイルを選択してください', 'warning');
        return;
    }

    const prompt = generateVariationCheckPromptFromFiles(variationCheckTxtFiles);
    navigator.clipboard.writeText(prompt).then(() => {
        const msg = document.getElementById('copyMsg');
        msg.style.opacity = 1;
        setTimeout(() => { msg.style.opacity = 0; }, 2000);
        closeVariationCheckModal();
        window.open('https://gemini.google.com/app', '_blank');
        if (typeof window.showResultPasteFloatingTab === 'function') {
            window.showResultPasteFloatingTab('variation');
        }
    });
}

// ランディング画面から詳細チェックを開始
function startVariationCheckFromLanding(input) {
    const files = input.files;
    if (!files || files.length === 0) return;

    let loadedCount = 0;
    const totalFiles = files.length;
    const tempFiles = [];

    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = function(e) {
            tempFiles.push({
                name: file.name,
                content: e.target.result,
                size: file.size
            });

            loadedCount++;
            if (loadedCount === totalFiles) {
                const prompt = generateVariationCheckPromptFromFiles(tempFiles);
                navigator.clipboard.writeText(prompt).then(() => {
                    window.open('https://gemini.google.com/app', '_blank');
                    if (typeof window.showResultPasteFloatingTab === 'function') {
                        window.showResultPasteFloatingTab('variation');
                    }
                });
            }
        };
        reader.readAsText(file, 'UTF-8');
    });

    input.value = '';
}

// ファイル配列から詳細チェックプロンプトを生成
function generateVariationCheckPromptFromFiles(files) {
    let manuscriptText = '';
    if (files.length === 1) {
        manuscriptText = files[0].content;
    } else {
        files.forEach((file, index) => {
            manuscriptText += `=== ${file.name} ===\n${file.content}\n\n`;
        });
    }

    return generateVariationCheckPromptWithText(manuscriptText);
}

// テキストを受け取って詳細チェックプロンプトを生成（項目1〜8）
function generateVariationCheckPromptWithText(manuscriptText) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<prompt>
    <system_role>
        あなたはプロの漫画編集者、および校閲担当AIです。
        ユーザーがチャット欄に入力（または貼り付け）したテキストを「漫画のセリフ原稿」として扱い、以下の定義されたルールに従って校正・推敲を行ってください。
    </system_role>

    <behavior_trigger>
        ユーザーからテキストが送信されたら、挨拶や前置きは省略し、直ちに以下の \`<process_instruction>\` に基づくチェックを開始してください。
    </behavior_trigger>

    <process_instruction>
        <task>入力された漫画のセリフ原稿について、表記・固有名詞・文章品質のチェックを5回実行してください。</task>

        <execution_details>
            <iterations>5</iterations>
            <reasoning_policy critical="true">
                <rule>5回のチェックでは、速度や簡略化よりも検出精度を優先し、各回で十分な内部推論と照合時間を使ってください。</rule>
                <rule>2回目〜5回目も前回結果の流用だけで済ませず、必ず原稿全体を再確認し、ページ番号・セリフ抜粋・指摘内容の妥当性を検証してください。</rule>
                <rule>2回目・3回目・4回目をまとめて処理したり、形式だけの「該当なし」で流したりしないでください。各回を独立したフルチェックとして実行してください。</rule>
                <rule>各回では、全ページを最初から最後まで再スキャンし、14項目すべてについて新規候補の有無を確認してください。途中回のチェック密度を下げることは禁止です。</rule>
                <rule>3回目・4回目は特に省略されやすいため、1回目・2回目と同じ粒度でページ番号、セリフ抜粋、指摘内容を照合してください。</rule>
                <rule>各回の見直しが薄い、前回結果を要約しただけ、または全ページ再確認を行っていない場合は、チェック未完了として扱い、出力前にやり直してください。</rule>
                <rule>「該当なし」と報告する場合も、該当箇所がないことを確認するための見直しを省略しないでください。</rule>
                <rule>内部推論や検証過程の文章は出力せず、指定されたテーブル形式の結果のみを出力してください。</rule>
            </reasoning_policy>
            <output_requirement>
                原稿全体に対して、指定された14のチェック項目すべて（網羅的）の視点から、表記・固有名詞・文章品質のチェックを合計5回繰り返してください。
                この繰り返しは、チェック漏れを防ぐための「見直し」プロセスとして機能させます。

                <b>■ 各回の実行内容：</b>
                <ul>
                    <li><b>1回目：</b> 14項目すべて（網羅的）の視点で原稿をチェックし、見つかった候補を報告してください。</li>
                    <li><b>2回目〜5回目：</b> 再度、14項目すべて（網羅的）の視点で原稿をチェックし、<b>前回までのチェックで見落としていた箇所や、新たに見つかった候補のみ</b>を報告してください。</li>
                </ul>

                <b>■ 報告ルール：</b>
                <b>各回のチェックが完了するごとに、</b>その回で見つかった表記・固有名詞の指摘候補を、後述の「報告フォーマット」に従ったテーブル形式で出力してください。
                <b>（重要）1回目〜5回目の経過出力も、最終リストと同一のテーブル形式（「チェック項目」「該当箇所 (ページ)」「セリフの抜粋」「指摘内容」の4列）で出力してください。</b>

                <b>（重要）その回の網羅的チェック（見直し）において、新たな指摘が1件もなかった場合でも、作業を省略せず、必ず「該当なし」と明記した上で報告してください。</b>

                最後に、5回分のすべての結果を統合し、重複を除いた網羅的な「最終指摘候補リスト」を、同様のテーブル形式で報告してください。
            </output_requirement>
        </execution_details>

        <special_notes>
            <title>チェック時の特記事項</title>

            <rule type="paging">
                <description>原稿のページカウントに関するルール</description>
                <condition check="yes">原稿に明示的なページ番号（例: P1, P2）がない場合、テキストブロックの区切りとして使用されている「-」が10個（----------）をページの区切りと見なしてください。</condition>
                <condition check="yes">その場合、最初のテキストブロックを「1ページ目」、次の「----------」の後のブロックを「2ページ目」としてカウントし、「該当箇所 (ページ)」列に報告してください。</condition>
            </rule>
            <rule type="loanword_choonpu">
                <description>外来語の長音記号については、以下のルールに従ってください。</description>
                <condition check="yes">長音記号の<b>有無</b>（例：「サーバー」と「サーバ」）は、チェック対象として<b>検出してください。</b></condition>
                <condition check="no">ただし、長音記号として使われる記号の<b>種類</b>（「ー」と「～」の違いなど）や、その記号自体の<b>全角・半角の違い</b>は、チェック対象外とし、<b>検出しないでください。</b></condition>
            </rule>
            <rule type="trademark_check">
                <description>固有名詞・商標チェックに関するルール</description>
                <condition check="yes">知名度の高低にかかわらず、実在する企業名・製品名・サービス名・店舗名・ブランド名を検出してください。</condition>
                <condition check="yes">固有名詞かどうか判断に迷う単語は、安全のため検出対象に含めてください。</condition>
                <condition check="no">地名（東京、渋谷、ハワイ等の国・都市・地域・ランドマーク）は検出対象外です。</condition>
                <condition check="no">明らかなパロディ表現（WcDonald's、Somy等の意図的なもじり）は検出対象外です。ただし、パロディか誤植か判断に迷う場合は検出してください。</condition>
            </rule>
            <reporting_instruction>報告の際は、該当箇所とセリフの抜粋を分かりやすく提示してください。</reporting_instruction>
            <reporting_instruction>固有名詞の報告時は、【固有名詞】のラベルと種類（企業名/製品名/サービス名/店舗名）を併記してください。</reporting_instruction>
            <rule type="shiteki_format">
                <description>「指摘内容」列の記載フォーマット</description>
                <condition>「指摘内容」列は簡潔に記載してください。以下のフォーマットに従ってください。</condition>
                <format_by_category>
                    <category items="1,2,3,4,5,6,7" label="表記の統一性チェック（項目1〜7）">
                        <format>「（別の表記A）」（出現ページ一覧）「（別の表記B）」（出現ページ一覧）との混在があります。</format>
                        <format_detail>各「別の表記」の後ろに、その表記が出現する全ページを（P●、P●）形式で付記してください。巻がある場合は（●巻P●、●巻P●）形式にしてください。</format_detail>
                    </category>
                    <category items="8" label="固有名詞・商標（項目8）">
                        <format>【固有名詞】種類（企業名/製品名/サービス名/店舗名/ブランド名）です。</format>
                    </category>
                    <category items="9" label="専門用語・事実の正確性（項目9）">
                        <format>正しい用語が特定できる場合は「正しくは「XXX」です。」、特定できない場合は「事実と異なる可能性あり。」等の短い表現</format>
                    </category>
                    <category items="10" label="未成年に関する表現チェック（項目10）">
                        <format>「（未成年を示す語句）」＋（描写の種類）です。</format>
                    </category>
                    <category items="11" label="話の流れの矛盾（項目11）">
                        <format>前後の描写と矛盾しています。</format>
                    </category>
                    <category items="12" label="重言・同語反復（項目12）">
                        <format>意味または語の重複があります。</format>
                    </category>
                    <category items="13" label="単語途中の改行（項目13）">
                        <format>単語の途中で改行されています。</format>
                    </category>
                    <category items="14" label="日本語としての違和感（項目14）">
                        <format>日本語として不自然な可能性があります。</format>
                    </category>
                </format_by_category>
                <note>長文での説明は不要です。上記フォーマットに従い、1行25文字以内を目安に簡潔に記載してください。</note>
            </rule>
        </special_notes>

        <paging_clarification>
            <title>ページカウントの補足ルール</title>
            <rule id="1">
                <case>空ページ（テキストがなく「----------」が連続する箇所）</case>
                <action>空ページも1ページとしてカウントしてください。</action>
                <example>「セリフA → ---------- → ---------- → セリフB」の場合、セリフAは1ページ目、セリフBは3ページ目です。</example>
            </rule>
            <rule id="2">
                <case>原稿の冒頭が「----------」なしでテキストから始まる場合</case>
                <action>そのテキストを1ページ目として扱ってください。</action>
            </rule>
            <rule id="3">
                <case>原稿の冒頭が「----------」で始まる場合</case>
                <action>冒頭の「----------」が1行のみの場合は、その直後のテキストを1ページ目として扱ってください。</action>
                <action>冒頭の「----------」が2行以上連続する場合は、連続する数だけ空ページがあると見なし、その後のテキストを該当ページ番号で報告してください。</action>
            </rule>
        </paging_clarification>

        <volume_format>
            <title>巻・ページ表記のあるフォーマットへの対応</title>
            <description>原稿に巻番号やページ番号が明示されている場合は、以下のルールに従ってください。</description>
            <rule id="1">
                <pattern>「[XX巻]」形式（例：[08巻]、[09巻]）</pattern>
                <action>巻の区切りとして認識し、該当箇所の報告時に「8巻 3ページ」のように巻番号を含めてください。</action>
            </rule>
            <rule id="2">
                <pattern>「&lt;&lt;XPage&gt;&gt;」形式（例：&lt;&lt;1Page&gt;&gt;、&lt;&lt;12Page&gt;&gt;）</pattern>
                <action>ページ番号として認識し、そのまま該当箇所の報告に使用してください。</action>
            </rule>
            <rule id="3">
                <case>複数巻が連続して入力された場合</case>
                <action>巻をまたいだ表記の不統一も検出対象としてください。</action>
                <example>8巻で「魔法」、9巻で「まほう」と表記されている場合、巻をまたいだ表記の不統一として報告してください。</example>
                <report_format>「該当箇所」列には「8巻 5ページ / 9巻 12ページ」のように、巻とページを明記してください。</report_format>
            </rule>
        </volume_format>

        <check_items>
            <title>チェック項目（14項目）</title>
            <item id="1">
                <name>文字種による違い</name>
                <description>同じ意味を持つ言葉で、漢字・ひらがな・カタカナの表記が混在している箇所。（例: 「して頂く」と「していただく」、「おすすめ」と「オススメ」）</description>
            </item>
            <item id="2">
                <name>送り仮名の違い</name>
                <description>同じ単語で送り仮名が統一されていない箇所。（例: 「申し込み」「申込み」「申込」）</description>
            </item>
            <item id="3">
                <name>外来語・アルファベット表記の違い</name>
                <description>長音符の有無、大文字・小文字、全角・半角、カタカナ・アルファベットの混在など。（例: 「サーバー」と「サーバ」、「Webサイト」と「WEBサイト」）</description>
            </item>
            <item id="4">
                <name>数字・漢数字の違い</name>
                <description>数字表記のルール：動詞名詞（動作や数量を伴う表現）は漢数字、それ以外はアラビア数字とする。このルールに従っていない箇所を指摘してください。（例：「一人」「二発」「三回」など動作・数量を伴う表現は漢数字が正しい。「3時」「10分」「5kg」など単なる数値・単位はアラビア数字が正しい。）</description>
            </item>
            <item id="5">
                <name>略称や別の表現</name>
                <description>同じ対象を指す言葉で、正式名称、略称、あるいは別の同義語が混在している箇所。（例: 「スマートフォン」と「スマホ」、「ホームページ」と「Webサイト」）</description>
            </item>
            <item id="6">
                <name>漢字の字体による違い</name>
                <description>同じ読み方で、異なる漢字が使われている箇所（異体字や、ニュアンスの違う同音異義語など）。（例: 「渡辺」と「渡邊」、「思う」と「想う」）</description>
            </item>
            <item id="7">
                <name>文体の違い</name>
                <description>ナレーションや特定のキャラクターのセリフ内で文体（丁寧語、常体、口語表現など）が不自然に混在している箇所。（例: 「私たち」と「我々」、「きちんと」と「ちゃんと」）</description>
            </item>
            <item id="8">
                <name>固有名詞・商標</name>
                <description>
                    セリフ内に実在する企業名・製品名・サービス名・店舗名・ブランド名が含まれている箇所。
                    知名度の高低にかかわらず、権利関係の確認が必要な可能性がある固有名詞をすべて検出する。
                    （例: 「LINEするね」→LINE、「ポカリ買ってくる」→ポカリ/ポカリスエット、「スタバ寄っていこう」→スタバ/スターバックス）
                </description>
                <detection_target>
                    <category>企業名（例: Google, ソニー, オリエンタルランド）</category>
                    <category>製品名・商品名（例: iPhone, ポカリスエット, うまい棒）</category>
                    <category>サービス名（例: LINE, YouTube, Instagram, Uber Eats）</category>
                    <category>店舗名・ブランド名（例: セブン-イレブン, ユニクロ, スターバックス）</category>
                </detection_target>
                <exclusion>
                    <item>地名（国、都市、地域、通り、ランドマーク等は対象外）</item>
                    <item>明らかなパロディ表現（WcDonald's、Somy等の意図的なもじりは対象外）</item>
                </exclusion>
                <note>固有名詞か判断に迷う場合は、安全のため検出対象に含めてください。</note>
            </item>
            <item id="9">
                <name>専門用語・事実の正確性</name>
                <description>
                    法律、医療、科学、警察、ビジネス等の専門分野において、用語の用法が不正確であったり、
                    実在の制度・法律・役職名・組織名・手続き等が現実と異なっている可能性がある箇所を検出する。
                </description>
                <detection_target>
                    <category>専門用語の誤用（例: 「心神耗弱」と「心神喪失」の取り違え、「判例」を個人の「前例」の意味で使用）</category>
                    <category>実在しない組織・役職名（例: 「保護観察局」→実在しない、正しくは「保護観察所」）</category>
                    <category>法的・制度的な不正確さ（例: 無罪判決者への「仮釈放」→仮釈放は有罪確定者が対象）</category>
                    <category>科学的・医学的な事実との矛盾（例: 明らかに不可能な症状や治療法の描写）</category>
                </detection_target>
                <exclusion>
                    <item>ファンタジーや超常現象など、作品世界の設定として意図的に現実と異なる描写</item>
                    <item>単純な誤字脱字（専門用語の誤用ではなく、一般的な変換ミス）</item>
                </exclusion>
                <note>専門用語や制度について少しでも正確性に疑問がある場合は、検出対象に含めてください。</note>
            </item>
            <item id="10">
                <name>未成年に関する表現チェック</name>
                <description>
                    未成年者が関わる犯罪行為や、未成年者への性的行為を明示的・暗示的に示唆する表現を検出する。
                    掲載基準やコンプライアンス上の問題となりうる箇所を事前に洗い出すためのチェック。
                </description>
                <detection_target>
                    <category>未成年であることを示す表現と性的行為の組み合わせ（例: 「高校生」「中学生」「○歳」等の年齢表記と性的描写が同一文脈に存在）</category>
                    <category>未成年者が加害者・被害者となる犯罪行為の明示的な描写（例: 未成年による暴力、窃盗、薬物使用等）</category>
                    <category>年齢を曖昧にしているが制服描写等から未成年と推定される状況での性的表現</category>
                    <category>児童・生徒を対象とした性的な言動や行為の描写</category>
                </detection_target>
                <keywords>
                    <word>小学生、中学生、高校生、○年生、○歳（18歳未満）</word>
                    <word>未成年、子供、少年、少女、児童、生徒</word>
                    <word>制服、ランドセル、学校</word>
                </keywords>
                <exclusion>
                    <item>年齢設定が18歳以上であることが明確に示されている場合</item>
                    <item>犯罪行為が作中で否定的に描かれ、教訓として機能している場合</item>
                    <item>過去の回想として言及されるだけで、直接的な描写がない場合</item>
                </exclusion>
                <note>少しでも問題となりうる可能性がある表現は、安全のため検出対象に含めてください。編集者による最終判断が必要な箇所として報告してください。</note>
            </item>
            <item id="11">
                <name>話の流れによる前後の矛盾</name>
                <description>
                    前後のセリフや状況説明を照合し、話の流れとして矛盾している可能性がある箇所を検出する。
                    単独の1文だけで判断せず、前後のページ・直前直後の発話・同じ場面内の情報を参照してください。
                </description>
                <detection_target>
                    <category>直前までの事実と食い違う発言（例: 「初めて来た」と言った直後に「前にも来た」）</category>
                    <category>人物関係・呼称・場所・時系列・所持品・状態の矛盾</category>
                    <category>同じ場面内で、できないはずの行動や不自然な反応が出ている箇所</category>
                </detection_target>
                <exclusion>
                    <item>キャラクターが意図的に嘘をついている、冗談を言っている、または演出上の含みとして成立している可能性が高い箇所</item>
                </exclusion>
                <note>断定できない場合は「矛盾の可能性あり」として、確認対象に含めてください。</note>
            </item>
            <item id="12">
                <name>重言・同語反復</name>
                <description>
                    意味としての重言だけでなく、同じ言葉・同じ言い回しが近い範囲で不自然に繰り返されている箇所を検出する。
                    判定は一つのセリフ・一つの発話ブロック内を中心に、同一ページ内の前後の別セリフも確認対象としてください。
                    ページをまたぐ反復は、同一人物の連続発話や同じ場面内で明らかにくどく見える場合のみ確認対象にしてください。
                    セリフとしての口癖や意図的な反復表現もありうるため、文脈上の自然さを確認してください。
                </description>
                <detection_target>
                    <category>意味が重複している表現（例: 「一番最初」「頭痛が痛い」「違和感を感じる」「今現在」「まず最初に」「もう一度再確認する」「後で後悔する」「返事を返信する」「犯罪を犯す」）</category>
                    <category>一つのセリフ内、または同一ページ内の前後の別セリフで、同じ語句や同じ意味の表現が不自然に繰り返されている箇所（例: 「私が自分で自分の目で見た」「絶対に必ず来て」「確認して、確認結果を確認する」）</category>
                    <category>近接する文で言い換えなしに同じ内容を続けて述べ、冗長に見える箇所</category>
                </detection_target>
                <exclusion>
                    <item>キャラクターの口癖、強調、畳みかけ、ギャグ、演出として明確に機能している反復</item>
                    <item>別々の人物の会話応答として自然な繰り返しや、ページをまたいだ通常の言い直し</item>
                </exclusion>
                <note>意味重複と語句反復のどちらに該当するか、指摘内容に簡潔に記載してください。</note>
            </item>
            <item id="13">
                <name>単語途中の改行</name>
                <description>
                    ひとつの単語・固有名詞・複合語・外来語・熟語が、途中で不自然に改行されている箇所を検出する。
                    吹き出し内の表示都合で改行されていても、単語の途中で切れて読みづらい場合は確認対象にしてください。
                </description>
                <detection_target>
                    <category>単語の途中で改行されている箇所（例: 「ありが\nとう」「スマー\nトフォン」）</category>
                    <category>固有名詞・人名・サービス名・専門用語の途中改行</category>
                    <category>助詞や語尾ではなく、語幹・熟語・外来語の内部で切れている箇所</category>
                </detection_target>
                <exclusion>
                    <item>詩的表現、叫び、ためらい、演出として意図的に分割されていると判断できる箇所</item>
                    <item>語の切れ目として自然な改行（文節・句・助詞の後など）</item>
                </exclusion>
                <note>指摘時は、改行を含む抜粋が分かるように記載してください。</note>
            </item>
            <item id="14">
                <name>日本語としての違和感</name>
                <description>
                    誤字脱字とは断定できないが、日本語として不自然、係り受けが曖昧、語順がぎこちない、助詞や接続が合っていない可能性がある箇所を検出する。
                </description>
                <detection_target>
                    <category>助詞・接続詞・語尾の不自然さ</category>
                    <category>係り受けや主語述語の対応が分かりづらい文</category>
                    <category>口語としてもやや不自然な語順・言い回し</category>
                    <category>文脈上、意味は取れるが読者が引っかかりそうな表現</category>
                </detection_target>
                <exclusion>
                    <item>キャラクター性、方言、幼児語、片言、演出として意図された崩しが明確な箇所</item>
                </exclusion>
                <note>断定しすぎず、「日本語として不自然な可能性あり」のように確認提案として報告してください。</note>
            </item>
            <sub_numbering>
                <rule>同一チェック項目内に複数の異なる揺れグループが検出された場合、チェック項目名の末尾に①②③...のサブ番号を必ず付けてグループを区別してください。</rule>
                <example>「していただく/して頂く」と「嫌/いや/イヤ」は両方「1. 文字種による違い」だが、異なるグループなので「1. 文字種による違い①」「1. 文字種による違い②」と区別する。</example>
                <example>揺れグループが1つしかない場合でも「1. 文字種による違い①」のように①を付けてください。</example>
            </sub_numbering>
        </check_items>

        <report_format>
            <title>報告フォーマット</title>

            <section type="each_round">
                <title>1回目〜5回目の各チェック結果</title>
                <instruction>各回のチェック結果は、最終統合リストと同一の形式で報告してください。</instruction>
                <instruction id="1">1．最初に「## ○回目チェック結果」という見出しを記載してください。</instruction>
                <instruction id="2">2．<b>4列の単一テーブル</b>として出力してください。列は「<b>チェック項目</b>」「<b>該当箇所 (ページ)</b>」「<b>セリフの抜粋</b>」「<b>指摘内容</b>」の順です。</instruction>
                <instruction id="3">3．チェック項目列には「1. 文字種による違い①」「1. 文字種による違い②」のように番号付きで記載してください。<b>同一チェック項目内で異なる揺れグループ（例：「していただく/して頂く」と「嫌/いや/イヤ」）には、①②③...のサブ番号を付けて区別してください。</b></instruction>
                <instruction id="4">4．<b>表記の揺れが検出された場合、その単語・表現が使われているすべての箇所</b>（両方の表記のすべての出現）を個別の行として記載してください。原稿内でその表現が登場するすべてのページを網羅してください。</instruction>
                <instruction id="5">5．テーブル全体を<b>チェック項目番号順（1→14）</b>でソートし、同一チェック項目内では<b>同じ表記ゆれのグループ（例：『お前』『おまえ』『オマエ』は同一グループ）に同じサブ番号①②③を付けてグループ化</b>し、各グループ内では<b>ページ番号の昇順</b>でソートしてください。</instruction>
                <instruction id="6">6．該当する指摘がないチェック項目は<b>省略</b>してください（行を作成しない）。</instruction>
                <instruction id="7">7．その回で新たに見つかった指摘が1件もなかった場合は、見出しの後に「該当なし」と記載してください。</instruction>
                <example>
                    <title>各回チェック結果の出力例</title>
                    <code>
## 1回目チェック結果

| チェック項目 | 該当箇所 (ページ) | セリフの抜粋 | 指摘内容 |
|---|---|---|---|
| 1. 文字種による違い① | 3ページ | 「していただく」 | 「して頂く」（P5、P8）との混在があります。 |
| 1. 文字種による違い① | 5ページ | 「して頂く」 | 「していただく」（P3、P12）との混在があります。 |
| 1. 文字種による違い② | 7ページ | 「嫌」 | 「いや」（P3）「イヤ」（P10）との混在があります。 |
| 1. 文字種による違い② | 3ページ | 「いや」 | 「嫌」（P7）「イヤ」（P10）との混在があります。 |
| 1. 文字種による違い② | 10ページ | 「イヤ」 | 「嫌」（P7）「いや」（P3）との混在があります。 |
| 3. 外来語・アルファベット表記の違い① | 10ページ | 「サーバー」 | 「サーバ」（P15）との混在があります。 |
| 4. 数字・漢数字の違い① | 6ページ | 「3回」 | 「三回」（P18）との混在があります。 |
| 5. 略称や別の表現① | 4ページ | 「スマホ」 | 「スマートフォン」（P9）との混在があります。 |
| 9. 専門用語・事実の正確性① | 11ページ | 「保護観察局」 | 正しくは「保護観察所」です。 |
| 10. 未成年に関する表現チェック① | 14ページ | 「高校生の彼女と…」 | 「高校生」＋性的描写です。 |
| 11. 話の流れによる前後の矛盾① | 17ページ | 「ここに来るのは初めて」 | 前後の描写と矛盾しています。 |
| 12. 重言・同語反復① | 19ページ | 「一番最初に」 | 意味の重複があります。 |
| 13. 単語途中の改行① | 21ページ | 「スマー／トフォン」 | 単語の途中で改行されています。 |
| 14. 日本語としての違和感① | 22ページ | 「彼に私は行かせた」 | 日本語として不自然な可能性があります。 |
                    </code>
                </example>
            </section>

            <section type="final_list">
                <title>最終統合リストのフォーマット</title>
                <instruction>5回分のチェック結果を統合した<b>最終統合リスト</b>は、以下の特別な形式で報告してください。</instruction>
                <instruction id="F1">1．最初に「## 最終統合リスト」という見出しを記載してください。</instruction>
                <instruction id="F2">2．<b>4列の単一テーブル</b>として出力してください。列は「<b>チェック項目</b>」「<b>該当箇所 (ページ)</b>」「<b>セリフの抜粋</b>」「<b>指摘内容</b>」の順です。</instruction>
                <instruction id="F3">3．チェック項目列には「1. 文字種による違い①」「1. 文字種による違い②」のように番号付きで記載してください。<b>同一チェック項目内で異なる揺れグループ（例：「していただく/して頂く」と「嫌/いや/イヤ」）には、①②③...のサブ番号を付けて区別してください。</b></instruction>
                <instruction id="F4">4．<b>表記の揺れが検出された場合、その単語・表現が使われているすべての箇所</b>（両方の表記のすべての出現）を個別の行として記載してください。原稿内でその表現が登場するすべてのページを網羅してください。</instruction>
                <instruction id="F5">5．テーブル全体を<b>チェック項目番号順（1→14）</b>でソートし、同一チェック項目内では<b>同じ表記ゆれのグループ（例：『お前』『おまえ』『オマエ』は同一グループ）に同じサブ番号①②③を付けてグループ化</b>し、各グループ内では<b>ページ番号の昇順</b>でソートしてください。</instruction>
                <instruction id="F6">6．該当する指摘がないチェック項目は<b>省略</b>してください（行を作成しない）。</instruction>
                <example>
                    <title>最終統合リストの出力例</title>
                    <code>
## 最終統合リスト

| チェック項目 | 該当箇所 (ページ) | セリフの抜粋 | 指摘内容 |
|---|---|---|---|
| 1. 文字種による違い① | 3ページ | 「していただく」 | 「して頂く」（P5、P8）との混在があります。 |
| 1. 文字種による違い① | 5ページ | 「して頂く」 | 「していただく」（P3、P12）との混在があります。 |
| 1. 文字種による違い② | 7ページ | 「嫌」 | 「いや」（P3）「イヤ」（P10）との混在があります。 |
| 1. 文字種による違い② | 3ページ | 「いや」 | 「嫌」（P7）「イヤ」（P10）との混在があります。 |
| 1. 文字種による違い② | 10ページ | 「イヤ」 | 「嫌」（P7）「いや」（P3）との混在があります。 |
| 2. 送り仮名の違い① | 8ページ | 「申込み」 | 「申し込み」（P12）との混在があります。 |
| 2. 送り仮名の違い① | 12ページ | 「申し込み」 | 「申込み」（P8）との混在があります。 |
| 4. 数字・漢数字の違い① | 6ページ | 「3回」 | 「三回」（P18）との混在があります。 |
| 4. 数字・漢数字の違い① | 18ページ | 「三回」 | 「3回」（P6）との混在があります。 |
| 5. 略称や別の表現① | 4ページ | 「スマホ」 | 「スマートフォン」（P9）との混在があります。 |
| 5. 略称や別の表現① | 9ページ | 「スマートフォン」 | 「スマホ」（P4）との混在があります。 |
| 6. 漢字の字体による違い① | 2ページ | 「渡辺」 | 「渡邊」（P13）との混在があります。 |
| 6. 漢字の字体による違い① | 13ページ | 「渡邊」 | 「渡辺」（P2）との混在があります。 |
| 7. 文体の違い① | 5ページ | 「我々」 | 「私たち」（P16）との混在があります。 |
| 7. 文体の違い① | 16ページ | 「私たち」 | 「我々」（P5）との混在があります。 |
| 8. 固有名詞・商標① | 15ページ | 「LINEするね」 | 【固有名詞】サービス名です。 |
| 9. 専門用語・事実の正確性① | 11ページ | 「保護観察局」 | 正しくは「保護観察所」です。 |
| 9. 専門用語・事実の正確性② | 20ページ | 「仮釈放された」 | 制度上の誤りの可能性あり。 |
| 10. 未成年に関する表現チェック① | 14ページ | 「高校生の彼女と…」 | 「高校生」＋性的描写です。 |
| 11. 話の流れによる前後の矛盾① | 17ページ | 「ここに来るのは初めて」 | 前後の描写と矛盾しています。 |
| 12. 重言・同語反復① | 19ページ | 「一番最初に」 | 意味の重複があります。 |
| 13. 単語途中の改行① | 21ページ | 「スマー／トフォン」 | 単語の途中で改行されています。 |
| 14. 日本語としての違和感① | 22ページ | 「彼に私は行かせた」 | 日本語として不自然な可能性があります。 |
                    </code>
                </example>
            </section>

            <format_constraint type="critical">
                <rule>このプロンプトはXML形式で記述されていますが、あなたの出力にXMLタグを使用しないでください。</rule>
                <rule>必ずMarkdownテーブル形式で出力してください。</rule>
                <rule><b>【重要】最終統合リストを含むすべての報告において、検出された表記ゆれ・指摘事項のすべての出現箇所を省略せずに記載してください。</b>「〜など」「他多数」といった省略表現は使用せず、該当するすべてのページとセリフを1行ずつ漏れなくテーブルに記載してください。</rule>
            </format_constraint>
        </report_format>

        <self_check>
            <title>出力前の内部検証（必須）</title>
            <mode>この検証プロセスは内部で実行し、結果は出力しないでください。</mode>

            <validation_checklist>
                <item id="V1">
                    <question>すべてのチェック結果が見出し付きで、テーブル形式（4列）になっているか？</question>
                    <on_fail>見出しと4列テーブル形式で修正する</on_fail>
                </item>
                <item id="V2">
                    <question>報告した指摘内容は、原稿内に複数の異なる表記が存在するか？（固有名詞は単独でも報告対象）</question>
                    <on_fail>単独表記のみの誤検出を除外する（固有名詞を除く）</on_fail>
                </item>
                <item id="V3">
                    <question>報告したページ番号とセリフ抜粋は原稿と一致しているか？</question>
                    <on_fail>原稿を再確認し修正する</on_fail>
                </item>
                <item id="V4">
                    <question>同じグループの指摘をすべて拾えているか？</question>
                    <on_fail>漏れている箇所を追加する</on_fail>
                </item>
                <item id="V5">
                    <question>チェック対象外（長音記号の種類等）を誤って報告していないか？</question>
                    <on_fail>対象外項目を除外する</on_fail>
                </item>
                <item id="V6">
                    <question>同一チェック項目内に複数の揺れグループがある場合、①②③のサブ番号で区別しているか？揺れグループが1つの場合でも①を付けているか？</question>
                    <on_fail>サブ番号を付与してグループを区別する（例：「1. 文字種による違い①」「1. 文字種による違い②」）</on_fail>
                </item>
                <item id="V7">
                    <question>項目11〜14（話の流れの矛盾、重言・同語反復、単語途中の改行、日本語としての違和感）を見落としていないか？</question>
                    <on_fail>原稿全体を文章品質の観点で再スキャンし、該当候補を追加する</on_fail>
                </item>
            </validation_checklist>

            <execution>すべての項目がOKになるまで内部で修正を繰り返し、完成版のみを出力してください。</execution>
        </self_check>

        <output_rules>
            <rule>上記の自己点検（V1〜V7）の検証過程は出力しないでください。</rule>
            <rule>1回目〜5回目の各テーブルと最終統合リストは、必ず出力してください。</rule>
        </output_rules>
    </process_instruction>

    <manuscript_data>
        <title>校正対象セリフ原稿</title>
        <instruction>以下のテキストが校正対象の漫画セリフ原稿です。上記のルールに従ってチェックを実行してください。</instruction>
        <raw_text><![CDATA[
${manuscriptText}
]]></raw_text>
    </manuscript_data>
</prompt>`;
}


// ES Module exports
export { openVariationCheckModal, closeVariationCheckModal, loadVariationCheckTxt, renderVariationCheckFileList, removeVariationCheckTxt, updateVariationCheckSubmitBtn, copyVariationCheckAndOpenGemini, startVariationCheckFromLanding, generateVariationCheckPromptFromFiles, generateVariationCheckPromptWithText };

// Expose to window for inline HTML handlers
Object.assign(window, { openVariationCheckModal, closeVariationCheckModal, loadVariationCheckTxt, renderVariationCheckFileList, removeVariationCheckTxt, updateVariationCheckSubmitBtn, copyVariationCheckAndOpenGemini, startVariationCheckFromLanding, generateVariationCheckPromptFromFiles, generateVariationCheckPromptWithText });
