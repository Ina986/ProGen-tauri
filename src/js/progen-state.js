// progen-state.js
// 全モジュール間で共有されるミュータブルな状態を一元管理する

// デフォルト記号ルール（定数）
export const defaultSymbolRules = [
    { src: "･･･", dst: "…", note: "三点リーダ統一", active: true },
    { src: "・・", dst: "…", note: "中黒連続を三点リーダに", active: true },
    { src: "・", dst: " ", note: "中黒を半角スペースに", active: true },
    { src: "、", dst: " ", note: "読点を半角スペースに", active: true },
    { src: "~", dst: "～", note: "チルダを波ダッシュに", active: true },
    { src: "！！", dst: "!!", note: "連続は半角に", active: true },
    { src: "？？", dst: "??", note: "連続は半角に", active: true },
    { src: "！？", dst: "!?", note: "連続は半角に", active: true },
    { src: "？！", dst: "!?", note: "連続は半角に（!?に統一）", active: true },
    { src: "!", dst: "！", note: "単独は全角に", active: true },
    { src: "?", dst: "？", note: "単独は全角に", active: true }
];

// 共有ミュータブル状態
export const state = {
    // 校正ルール
    symbolRules: [...defaultSymbolRules],
    currentProofRules: [],
    currentViewMode: 'edit',

    // オプションフラグ
    optionNgWordMasking: true,
    optionPunctuationToSpace: true,
    optionDifficultRuby: false,
    optionTypoCheck: true,
    optionMissingCharCheck: true,
    optionNameRubyCheck: true,
    optionNonJoyoCheck: true,

    // 数字ルール
    numberRuleBase: 0,
    numberRulePersonCount: 0,
    numberRuleThingCount: 0,
    numberRuleMonth: 0,
    numberSubRulesEnabled: true,

    // 検出結果
    detectedNonJoyoWords: [],

    // 原稿TXTファイル
    manuscriptTxtFiles: [],
    txtGuideDismissed: false,

    // 校正ページ状態
    proofreadingFiles: [],
    proofreadingContent: '',
    currentProofreadingMode: 'simple',
    proofreadingDetectedNonJoyoWords: [],
    proofreadingSelectedNonJoyoIndexes: [],
    proofreadingReturnTo: 'landing',

    // ランディングページ状態
    landingProofreadingFiles: [],
    landingProofreadingContent: '',

    // JSONブラウザ状態
    currentLoadedJson: null,
    currentJsonPath: '',

    // 管理モード
    isAdminMode: false,

    // JSON新規作成時のモード（'extraction' or 'proofreading'）
    pendingNewCreationMode: null,

    // クロスモジュール共有変数
    currentEditCategory: 'symbol',
    outputFormatVolume: 1,
    outputFormatStartPage: 1,
    outputFormatSortMode: 'bottomToTop',
    txtFolderBasePath: '',
    currentSimpleData: [],
    currentVariationData: {},

    // COMIC-POTで校正JSON読み込み時の作品タイトル（自動選択用）
    pendingWorkTitle: '',
};
