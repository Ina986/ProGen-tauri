// progen-main.js
// ES Module エントリーポイント - 全モジュールを読み込む

import './progen-state.js';
import './progen-xml-templates.js';
import './progen-data.js';
import './progen-landing.js';
import './progen-extraction.js';
import './progen-xml-gen.js';
import './progen-check-simple.js';
import './progen-check-variation.js';
import './progen-proofreading.js';
import './progen-json-browser.js';
import './progen-admin.js';
import './progen-note-txt.js';
import './progen-result-viewer.js';
import './progen-comicpot.js';
import './progen-viewer.js';

// 全モジュール読み込み後に起動時の初期化を実行
window.init();
window.initJsonFolderBrowser();
window.initCalibrationFolderBrowser();

// ドロップゾーンの初期化
const txtUploadGroup = document.getElementById('txtUploadGroup');
if (txtUploadGroup) window.setupDropZone(txtUploadGroup, window.loadManuscriptTxt);

const txtManageDropZone = document.getElementById('txtManageDropZone');
if (txtManageDropZone) window.setupDropZone(txtManageDropZone, window.addManuscriptTxt);

const proofreadingTxtDropZone = document.getElementById('proofreadingTxtDropZone');
if (proofreadingTxtDropZone) window.setupDropZone(proofreadingTxtDropZone, window.addProofreadingTxt);
