use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use tauri::{Emitter, Manager};

// プレビューキャッシュ（メモリ: パス→キャッシュファイルパス）
static PREVIEW_CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn preview_cache() -> &'static Mutex<HashMap<String, String>> {
    PREVIEW_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

// ========================================
// ベースパス定義（Gドライブ）
// ========================================
const JSON_FOLDER_BASE_PATH: &str = r"G:\共有ドライブ\CLLENN\編集部フォルダ\編集企画部\編集企画_C班(AT業務推進)\DTP制作部\JSONフォルダ";
const MASTER_JSON_BASE_PATH: &str = r"G:\共有ドライブ\CLLENN\編集部フォルダ\編集企画部\編集企画_C班(AT業務推進)\DTP制作部\ProGen_Master_JSON";
const TXT_FOLDER_BASE_PATH: &str = r"G:\共有ドライブ\CLLENN\編集部フォルダ\編集企画部\写植・校正用テキストログ";
const HANDOFF_MARKER: &str = ".progen_handoff.txt";

// ========================================
// 型定義
// ========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LabelInfo {
    path: String,
    display_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LabelEntry {
    key: String,
    #[serde(rename = "displayName")]
    display_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DirItem {
    name: String,
    path: String,
    #[serde(rename = "isDirectory")]
    is_directory: bool,
    #[serde(rename = "isFile")]
    is_file: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct HandoffData {
    #[serde(rename = "filePath")]
    file_path: String,
    #[serde(rename = "fileName")]
    file_name: String,
    content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CalibrationParams {
    label: String,
    work: String,
    volume: u32,
    #[serde(rename = "checkType")]
    check_type: String,
    items: Vec<serde_json::Value>,
}

// アプリ状態
struct AppState {
    master_rule_file_map: Mutex<HashMap<String, LabelInfo>>,
}

// アップデート: 保留中の更新オブジェクトを保持
struct PendingUpdate {
    update: Mutex<Option<tauri_plugin_updater::Update>>,
}

// ========================================
// ヘルパー関数
// ========================================

fn generate_label_key(folder_name: &str) -> String {
    let known_mappings: HashMap<&str, &str> = HashMap::from([
        ("\u{6C4E}\u{7528}\u{FF08}\u{6A19}\u{6E96}\u{FF09}", "default"),
        ("\u{30AB}\u{30B2}\u{30AD}\u{30E4}\u{30B3}\u{30DF}\u{30C3}\u{30AF}", "kagekiya_comic"),
        ("\u{3082}\u{3048}\u{30B9}\u{30BF}\u{30D3}\u{30FC}\u{30B9}\u{30C8}", "moesta_beast"),
        ("\u{FF20}\u{591C}\u{564F}", "at_yobanashi"),
        ("\u{30AA}\u{30C8}\u{30E1}\u{30C1}\u{30AB}", "otomechika"),
        ("\u{4E59}\u{5973}\u{30C1}\u{30C3}\u{30AF}", "otomechikku"),
        ("GG-COMICS", "ggcomics"),
        ("\u{30B3}\u{30A4}\u{30D1}\u{30EC}\u{30FB}\u{30AD}\u{30B9}\u{30AB}\u{30E9}", "koipare_kiskara"),
        ("\u{30AB}\u{30EB}\u{30B3}\u{30DF}", "karukomi"),
    ]);
    if let Some(key) = known_mappings.get(folder_name) {
        return key.to_string();
    }
    folder_name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect()
}

fn scan_master_json_folder() -> HashMap<String, LabelInfo> {
    let mut map = HashMap::new();
    let base = Path::new(MASTER_JSON_BASE_PATH);
    if !base.exists() {
        eprintln!("マスターJSONフォルダが存在しません: {}", MASTER_JSON_BASE_PATH);
        return map;
    }
    if let Ok(entries) = fs::read_dir(base) {
        for entry in entries.flatten() {
            if let Ok(ft) = entry.file_type() {
                if ft.is_dir() {
                    let folder_name = entry.file_name().to_string_lossy().to_string();
                    let json_path = base.join(&folder_name).join(format!("{}.json", &folder_name));
                    if json_path.exists() {
                        let label_key = generate_label_key(&folder_name);
                        map.insert(
                            label_key,
                            LabelInfo {
                                path: format!("{}\\{}.json", &folder_name, &folder_name),
                                display_name: folder_name,
                            },
                        );
                    }
                }
            }
        }
    }
    println!(
        "マスターJSONマップを構築しました: {:?}",
        map.keys().collect::<Vec<_>>()
    );
    map
}

fn find_label_info<'a>(
    map: &'a HashMap<String, LabelInfo>,
    label_value: &str,
) -> Option<&'a LabelInfo> {
    if let Some(info) = map.get(label_value) {
        return Some(info);
    }
    map.values()
        .find(|info| info.display_name == label_value)
}


fn check_and_process_handoff() -> Option<HandoffData> {
    let desktop = std::env::var("USERPROFILE").ok()?;
    let marker_path = PathBuf::from(&desktop)
        .join("Desktop")
        .join("Script_Output")
        .join("COMIPO_text\u{62BD}\u{51FA}")
        .join(HANDOFF_MARKER);
    if !marker_path.exists() {
        return None;
    }
    let raw = fs::read_to_string(&marker_path).ok()?;
    let _ = fs::remove_file(&marker_path);
    let txt_file_path = raw.trim().trim_start_matches('\u{FEFF}').to_string();
    if txt_file_path.is_empty() || !Path::new(&txt_file_path).exists() {
        eprintln!("ハンドオフ対象ファイルが見つかりません: {}", txt_file_path);
        return None;
    }
    let content = fs::read_to_string(&txt_file_path).ok()?;
    let file_name = Path::new(&txt_file_path)
        .file_name()?
        .to_string_lossy()
        .to_string();
    println!("COMIC-POTハンドオフ検出: {}", file_name);
    Some(HandoffData {
        file_path: txt_file_path,
        file_name,
        content,
    })
}

fn get_default_symbol_rules() -> Vec<serde_json::Value> {
    serde_json::from_str(
        r#"[
        {"src":"･･･","dst":"…","note":"三点リーダ統一","active":true},
        {"src":"・・","dst":"…","note":"中黒連続を三点リーダに","active":true},
        {"src":"・","dst":" ","note":"中黒を半角スペースに","active":true},
        {"src":"、","dst":" ","note":"読点を半角スペースに","active":true},
        {"src":"~","dst":"〜","note":"チルダを波ダッシュに","active":true},
        {"src":"！！","dst":"!!","note":"連続は半角に","active":true},
        {"src":"？？","dst":"??","note":"連続は半角に","active":true},
        {"src":"！？","dst":"!?","note":"連続は半角に","active":true},
        {"src":"？！","dst":"!?","note":"連続は半角に（!?に統一）","active":true},
        {"src":"!","dst":"！","note":"単独は全角に","active":true},
        {"src":"?","dst":"？","note":"単独は全角に","active":true}
    ]"#,
    )
    .unwrap_or_default()
}

// ========================================
// Tauri コマンド
// ========================================

#[tauri::command]
fn get_json_folder_path() -> String {
    JSON_FOLDER_BASE_PATH.to_string()
}

#[tauri::command]
fn list_directory(dir_path: Option<String>) -> serde_json::Value {
    let target = dir_path.unwrap_or_else(|| JSON_FOLDER_BASE_PATH.to_string());
    match fs::read_dir(&target) {
        Ok(entries) => {
            let mut items: Vec<DirItem> = Vec::new();
            for entry in entries {
                if let Ok(e) = entry {
                    let path = e.path();
                    items.push(DirItem {
                        name: e.file_name().to_string_lossy().to_string(),
                        path: path.to_string_lossy().to_string(),
                        is_directory: path.is_dir(),
                        is_file: path.is_file(),
                    });
                }
            }
            serde_json::json!({ "success": true, "items": items, "currentPath": target })
        }
        Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
    }
}

#[tauri::command]
fn read_json_file(file_path: String) -> serde_json::Value {
    match fs::read_to_string(&file_path) {
        Ok(raw) => match serde_json::from_str::<serde_json::Value>(&raw) {
            Ok(data) => serde_json::json!({ "success": true, "data": data, "rawData": raw }),
            Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
        },
        Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
    }
}

#[tauri::command]
fn write_json_file(file_path: String, data: serde_json::Value) -> serde_json::Value {
    match serde_json::to_string_pretty(&data) {
        Ok(json_str) => match fs::write(&file_path, json_str) {
            Ok(()) => serde_json::json!({ "success": true }),
            Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
        },
        Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
    }
}

#[tauri::command]
fn read_master_rule(label_value: String, state: tauri::State<'_, AppState>) -> serde_json::Value {
    let map = state.master_rule_file_map.lock().unwrap();
    match find_label_info(&map, &label_value) {
        Some(info) => {
            let full_path = PathBuf::from(MASTER_JSON_BASE_PATH).join(&info.path);
            match fs::read_to_string(&full_path) {
                Ok(raw) => match serde_json::from_str::<serde_json::Value>(&raw) {
                    Ok(data) => serde_json::json!({ "success": true, "data": data }),
                    Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
                },
                Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
            }
        }
        None => serde_json::json!({ "success": false, "error": format!("Unknown label: {}", label_value) }),
    }
}

#[tauri::command]
fn write_master_rule(
    label_value: String,
    data: serde_json::Value,
    state: tauri::State<'_, AppState>,
) -> serde_json::Value {
    let map = state.master_rule_file_map.lock().unwrap();
    match find_label_info(&map, &label_value) {
        Some(info) => {
            let full_path = PathBuf::from(MASTER_JSON_BASE_PATH).join(&info.path);
            match serde_json::to_string_pretty(&data) {
                Ok(json_str) => match fs::write(&full_path, json_str) {
                    Ok(()) => serde_json::json!({ "success": true }),
                    Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
                },
                Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
            }
        }
        None => serde_json::json!({ "success": false, "error": format!("Unknown label: {}", label_value) }),
    }
}

#[tauri::command]
fn create_master_label(
    label_key: String,
    display_name: String,
    state: tauri::State<'_, AppState>,
) -> serde_json::Value {
    let folder_path = PathBuf::from(MASTER_JSON_BASE_PATH).join(&display_name);
    if let Err(e) = fs::create_dir_all(&folder_path) {
        return serde_json::json!({ "success": false, "error": e.to_string() });
    }
    let file_path = folder_path.join(format!("{}.json", &display_name));

    let generic_path = PathBuf::from(MASTER_JSON_BASE_PATH)
        .join("\u{6C4E}\u{7528}\u{FF08}\u{6A19}\u{6E96}\u{FF09}")
        .join("\u{6C4E}\u{7528}\u{FF08}\u{6A19}\u{6E96}\u{FF09}.json");
    let template: serde_json::Value = if generic_path.exists() {
        fs::read_to_string(&generic_path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_else(default_template)
    } else {
        default_template()
    };

    match serde_json::to_string_pretty(&template) {
        Ok(json_str) => match fs::write(&file_path, json_str) {
            Ok(()) => {
                let mut map = state.master_rule_file_map.lock().unwrap();
                map.insert(
                    label_key,
                    LabelInfo {
                        path: format!("{}\\{}.json", &display_name, &display_name),
                        display_name,
                    },
                );
                serde_json::json!({ "success": true })
            }
            Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
        },
        Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
    }
}

fn default_template() -> serde_json::Value {
    serde_json::json!({
        "proofRules": {
            "proof": [],
            "symbol": get_default_symbol_rules(),
            "options": {
                "ngWordMasking": true,
                "punctuationToSpace": true,
                "difficultRuby": false,
                "typoCheck": true,
                "missingCharCheck": true,
                "nameRubyCheck": true
            }
        }
    })
}

#[tauri::command]
fn get_master_label_list(state: tauri::State<'_, AppState>) -> serde_json::Value {
    let new_map = scan_master_json_folder();
    let mut map = state.master_rule_file_map.lock().unwrap();
    *map = new_map;
    let labels: Vec<LabelEntry> = map
        .iter()
        .map(|(key, info)| LabelEntry {
            key: key.clone(),
            display_name: info.display_name.clone(),
        })
        .collect();
    serde_json::json!({ "success": true, "labels": labels })
}

#[tauri::command]
fn create_txt_work_folder(label: String, work: String) -> serde_json::Value {
    let work_folder = PathBuf::from(TXT_FOLDER_BASE_PATH).join(&label).join(&work);
    match fs::create_dir_all(&work_folder) {
        Ok(()) => serde_json::json!({ "success": true, "path": work_folder.to_string_lossy() }),
        Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
    }
}

#[tauri::command]
fn get_txt_folder_path() -> String {
    TXT_FOLDER_BASE_PATH.to_string()
}

#[tauri::command]
fn list_txt_directory(dir_path: Option<String>) -> serde_json::Value {
    let target = dir_path.unwrap_or_else(|| TXT_FOLDER_BASE_PATH.to_string());
    match fs::read_dir(&target) {
        Ok(entries) => {
            let mut items: Vec<DirItem> = Vec::new();
            for entry in entries {
                if let Ok(e) = entry {
                    let path = e.path();
                    items.push(DirItem {
                        name: e.file_name().to_string_lossy().to_string(),
                        path: path.to_string_lossy().to_string(),
                        is_directory: path.is_dir(),
                        is_file: path.is_file(),
                    });
                }
            }
            serde_json::json!({ "success": true, "items": items, "currentPath": target })
        }
        Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
    }
}

#[tauri::command]
fn read_txt_file(file_path: String) -> serde_json::Value {
    match fs::read_to_string(&file_path) {
        Ok(data) => {
            let size = fs::metadata(&file_path).map(|m| m.len()).unwrap_or(0);
            let name = Path::new(&file_path)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            serde_json::json!({ "success": true, "data": data, "size": size, "name": name })
        }
        Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
    }
}

#[tauri::command]
fn write_text_file(file_path: String, content: String) -> serde_json::Value {
    match fs::write(&file_path, &content) {
        Ok(()) => serde_json::json!({ "success": true, "filePath": file_path }),
        Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
    }
}

#[tauri::command]
async fn show_save_text_dialog(
    default_name: Option<String>,
    app: tauri::AppHandle,
) -> serde_json::Value {
    use tauri_plugin_dialog::DialogExt;
    let default = default_name.unwrap_or_else(|| "\u{7121}\u{984C}.txt".to_string());
    let result = app
        .dialog()
        .file()
        .set_file_name(&default)
        .add_filter("\u{30C6}\u{30AD}\u{30B9}\u{30C8}\u{30D5}\u{30A1}\u{30A4}\u{30EB}", &["txt"])
        .add_filter("\u{3059}\u{3079}\u{3066}\u{306E}\u{30D5}\u{30A1}\u{30A4}\u{30EB}", &["*"])
        .blocking_save_file();
    match result {
        Some(path) => serde_json::json!({ "success": true, "filePath": path.to_string() }),
        None => serde_json::json!({ "success": false, "canceled": true }),
    }
}

#[tauri::command]
async fn print_to_pdf(html_content: String, app: tauri::AppHandle) -> serde_json::Value {
    use tauri_plugin_dialog::DialogExt;
    let result = app
        .dialog()
        .file()
        .set_file_name("\u{4ED5}\u{69D8}\u{66F8}.pdf")
        .add_filter("PDF\u{30D5}\u{30A1}\u{30A4}\u{30EB}", &["pdf"])
        .blocking_save_file();
    let save_path = match result {
        Some(path) => path.to_string().to_string(),
        None => return serde_json::json!({ "success": false, "canceled": true }),
    };

    // 一時HTMLファイルに書き出し
    let temp_dir = std::env::temp_dir();
    let temp_html = temp_dir.join("progen_spec_sheet.html");
    if let Err(e) = fs::write(&temp_html, &html_content) {
        return serde_json::json!({ "success": false, "error": format!("一時ファイル作成エラー: {}", e) });
    }

    // Edge (Chromium) のパスを探す
    let edge_path = find_edge_executable();
    let edge_path = match edge_path {
        Some(p) => p,
        None => {
            // Edge が見つからない場合はHTMLとして保存にフォールバック
            let _ = fs::copy(&temp_html, &save_path);
            let _ = fs::remove_file(&temp_html);
            return serde_json::json!({ "success": true, "filePath": save_path, "warning": "Edge が見つからないため HTML として保存しました" });
        }
    };

    // Edge headless で HTML → PDF 変換
    let output = Command::new(&edge_path)
        .args([
            "--headless",
            "--disable-gpu",
            "--no-sandbox",
            &format!("--print-to-pdf={}", save_path),
            "--print-to-pdf-no-header",
            &temp_html.to_string_lossy(),
        ])
        .output();

    let _ = fs::remove_file(&temp_html);

    match output {
        Ok(result) => {
            if Path::new(&save_path).exists() {
                serde_json::json!({ "success": true, "filePath": save_path })
            } else {
                let stderr = String::from_utf8_lossy(&result.stderr);
                serde_json::json!({ "success": false, "error": format!("PDF生成に失敗しました: {}", stderr) })
            }
        }
        Err(e) => serde_json::json!({ "success": false, "error": format!("Edge の起動に失敗しました: {}", e) }),
    }
}

fn find_edge_executable() -> Option<String> {
    let candidates = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ];
    for path in &candidates {
        if Path::new(path).exists() {
            return Some(path.to_string());
        }
    }
    // PATH から探す
    if let Ok(output) = Command::new("where").arg("msedge").output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        if let Some(line) = stdout.lines().next() {
            let p = line.trim();
            if !p.is_empty() && Path::new(p).exists() {
                return Some(p.to_string());
            }
        }
    }
    None
}

#[tauri::command]
fn save_calibration_data(params: CalibrationParams) -> serde_json::Value {
    let calibration_folder = PathBuf::from(TXT_FOLDER_BASE_PATH)
        .join(&params.label)
        .join(&params.work)
        .join("\u{6821}\u{6B63}\u{30C1}\u{30A7}\u{30C3}\u{30AF}\u{30C7}\u{30FC}\u{30BF}");

    if let Err(e) = fs::create_dir_all(&calibration_folder) {
        return serde_json::json!({ "success": false, "error": e.to_string() });
    }

    let file_name = format!("{}\u{5DFB}.json", params.volume);
    let file_path = calibration_folder.join(&file_name);

    let mut json_data: serde_json::Value = if file_path.exists() {
        fs::read_to_string(&file_path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_else(|| new_calibration_json(&params))
    } else {
        new_calibration_json(&params)
    };

    let now = chrono_now_iso();

    if let Some(checks) = json_data.get_mut("checks") {
        if params.check_type == "both" {
            let variation_items: Vec<serde_json::Value> = params
                .items
                .iter()
                .filter(|item| item.get("type").and_then(|t| t.as_str()) == Some("variation"))
                .cloned()
                .map(|mut v| {
                    v.as_object_mut().map(|o| o.remove("type"));
                    v
                })
                .collect();
            let simple_items: Vec<serde_json::Value> = params
                .items
                .iter()
                .filter(|item| item.get("type").and_then(|t| t.as_str()) == Some("simple"))
                .cloned()
                .map(|mut v| {
                    v.as_object_mut().map(|o| o.remove("type"));
                    v
                })
                .collect();
            if !variation_items.is_empty() {
                checks["variation"] =
                    serde_json::json!({ "updatedAt": now, "items": variation_items });
            }
            if !simple_items.is_empty() {
                checks["simple"] =
                    serde_json::json!({ "updatedAt": now, "items": simple_items });
            }
        } else {
            let clean_items: Vec<serde_json::Value> = params
                .items
                .into_iter()
                .map(|mut v| {
                    v.as_object_mut().map(|o| o.remove("type"));
                    v
                })
                .collect();
            checks[&params.check_type] =
                serde_json::json!({ "updatedAt": now, "items": clean_items });
        }
    }

    match serde_json::to_string_pretty(&json_data) {
        Ok(json_str) => match fs::write(&file_path, json_str) {
            Ok(()) => {
                serde_json::json!({ "success": true, "filePath": file_path.to_string_lossy() })
            }
            Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
        },
        Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
    }
}

fn new_calibration_json(params: &CalibrationParams) -> serde_json::Value {
    let now = chrono_now_iso();
    serde_json::json!({
        "label": params.label,
        "work": params.work,
        "volume": params.volume,
        "createdAt": now,
        "checks": {},
        "_note": {
            "checkKind": "correctness = \u{6B63}\u{8AA4}\u{30C1}\u{30A7}\u{30C3}\u{30AF} / proposal = \u{63D0}\u{6848}\u{30C1}\u{30A7}\u{30C3}\u{30AF}"
        }
    })
}

fn chrono_now_iso() -> String {
    use std::time::SystemTime;
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    let mut y = 1970i64;
    let mut remaining_days = (secs / 86400) as i64;
    loop {
        let days_in_year =
            if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 { 366 } else { 365 };
        if remaining_days < days_in_year {
            break;
        }
        remaining_days -= days_in_year;
        y += 1;
    }
    let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
    let month_days = [
        31,
        if leap { 29 } else { 28 },
        31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
    ];
    let mut m = 0usize;
    for (i, &d) in month_days.iter().enumerate() {
        if remaining_days < d as i64 {
            m = i;
            break;
        }
        remaining_days -= d as i64;
    }
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.000Z",
        y,
        m + 1,
        remaining_days + 1,
        hours,
        minutes,
        seconds
    )
}

#[tauri::command]
fn launch_comic_bridge(json_file_path: String) -> serde_json::Value {
    let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let exe_path = PathBuf::from(&local_app_data)
        .join("Comic-Bridge")
        .join("comic-bridge.exe");
    if !exe_path.exists() {
        return serde_json::json!({ "success": false, "error": "COMIC-Bridge\u{304C}\u{30A4}\u{30F3}\u{30B9}\u{30C8}\u{30FC}\u{30EB}\u{3055}\u{308C}\u{3066}\u{3044}\u{307E}\u{305B}\u{3093}" });
    }
    match Command::new(&exe_path)
        .args(["--proofreading-json", &json_file_path])
        .spawn()
    {
        Ok(_) => serde_json::json!({ "success": true }),
        Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
    }
}

#[tauri::command]
async fn respond_to_update(accepted: bool, app: tauri::AppHandle) {
    if !accepted {
        // 「後で」を選択 → 保留中の更新をクリア
        let pending = app.state::<PendingUpdate>();
        let mut update = pending.update.lock().unwrap();
        *update = None;
        return;
    }

    // 保留中の更新オブジェクトを取り出す
    let update = {
        let pending = app.state::<PendingUpdate>();
        let mut guard = pending.update.lock().unwrap();
        guard.take()
    };

    let update = match update {
        Some(u) => u,
        None => {
            eprintln!("更新オブジェクトが見つかりません");
            let _ = app.emit("update-error", "更新情報が見つかりません。アプリを再起動してください。");
            return;
        }
    };

    // ダウンロード開始を通知
    println!("更新のダウンロードを開始します...");
    let _ = app.emit("update-downloading", serde_json::json!({}));

    match update.download_and_install(|_, _| {}, || {}).await {
        Ok(()) => {
            println!("更新のインストールが完了しました。再起動します。");
            app.restart();
        }
        Err(e) => {
            eprintln!("更新のインストールに失敗しました: {}", e);
            let _ = app.emit("update-error", e.to_string());
        }
    }
}

#[tauri::command]
fn get_comicpot_handoff() -> Option<HandoffData> {
    check_and_process_handoff()
}

// ========================================
// 更新チェック (GitHub Releases)
// ========================================

async fn check_for_updates(app: tauri::AppHandle) {
    use tauri_plugin_updater::UpdaterExt;

    let current_version = app
        .config()
        .version
        .clone()
        .unwrap_or_else(|| "0.0.0".to_string());
    println!("現在のバージョン: {}", current_version);

    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            eprintln!("Updater初期化エラー: {}", e);
            return;
        }
    };
    let update = match updater.check().await {
        Ok(Some(update)) => update,
        Ok(None) => {
            println!("更新はありません（最新バージョンです）");
            return;
        }
        Err(e) => {
            eprintln!("更新チェックエラー: {}", e);
            return;
        }
    };

    let new_version = update.version.clone();
    println!("新バージョンが見つかりました: {}", new_version);

    // 更新オブジェクトをstateに保存（respond_to_updateコマンドで使用）
    {
        let pending = app.state::<PendingUpdate>();
        let mut guard = pending.update.lock().unwrap();
        *guard = Some(update);
    }

    // フロントエンドに更新情報を送信
    let _ = app.emit("update-available", serde_json::json!({
        "currentVersion": current_version,
        "newVersion": new_version,
    }));
    // ダウンロード・インストールはrespond_to_updateコマンドで実行される
}

// ========================================
// 画像ビューアー
// ========================================

const IMAGE_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "tif", "tiff", "bmp", "gif", "psd", "webp", "pdf",
];

#[tauri::command]
fn list_image_files(dir_path: String) -> serde_json::Value {
    let path = Path::new(&dir_path);
    if !path.is_dir() {
        return serde_json::json!({ "success": false, "error": "ディレクトリが見つかりません" });
    }
    let mut files: Vec<serde_json::Value> = Vec::new();
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if !p.is_file() {
                continue;
            }
            if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                if IMAGE_EXTENSIONS.contains(&ext.to_lowercase().as_str()) {
                    let name = p.file_name().unwrap_or_default().to_string_lossy().to_string();
                    let size = fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
                    files.push(serde_json::json!({
                        "name": name,
                        "path": p.to_string_lossy().to_string(),
                        "size": size,
                    }));
                }
            }
        }
    }
    // 自然順ソート
    files.sort_by(|a, b| {
        let na = a["name"].as_str().unwrap_or("");
        let nb = b["name"].as_str().unwrap_or("");
        natord_cmp(na, nb)
    });
    serde_json::json!({ "success": true, "files": files })
}

/// 自然順比較（数字を数値として比較）
fn natord_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    let mut ai = a.chars().peekable();
    let mut bi = b.chars().peekable();
    loop {
        match (ai.peek(), bi.peek()) {
            (None, None) => return std::cmp::Ordering::Equal,
            (None, Some(_)) => return std::cmp::Ordering::Less,
            (Some(_), None) => return std::cmp::Ordering::Greater,
            (Some(&ac), Some(&bc)) => {
                if ac.is_ascii_digit() && bc.is_ascii_digit() {
                    let an = collect_number(&mut ai);
                    let bn = collect_number(&mut bi);
                    match an.cmp(&bn) {
                        std::cmp::Ordering::Equal => continue,
                        other => return other,
                    }
                } else {
                    let al = ac.to_lowercase().next().unwrap_or(ac);
                    let bl = bc.to_lowercase().next().unwrap_or(bc);
                    match al.cmp(&bl) {
                        std::cmp::Ordering::Equal => {
                            ai.next();
                            bi.next();
                        }
                        other => return other,
                    }
                }
            }
        }
    }
}

fn collect_number(iter: &mut std::iter::Peekable<std::str::Chars>) -> u64 {
    let mut n: u64 = 0;
    while let Some(&c) = iter.peek() {
        if c.is_ascii_digit() {
            n = n.saturating_mul(10).saturating_add(c as u64 - '0' as u64);
            iter.next();
        } else {
            break;
        }
    }
    n
}

#[tauri::command]
fn list_image_files_from_paths(paths: Vec<String>) -> serde_json::Value {
    let mut files: Vec<serde_json::Value> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for p in &paths {
        let path = Path::new(p);
        if path.is_dir() {
            if let Ok(entries) = fs::read_dir(path) {
                for entry in entries.flatten() {
                    let ep = entry.path();
                    if !ep.is_file() { continue; }
                    if let Some(ext) = ep.extension().and_then(|e| e.to_str()) {
                        if IMAGE_EXTENSIONS.contains(&ext.to_lowercase().as_str()) {
                            let ps = ep.to_string_lossy().to_string();
                            if seen.insert(ps.clone()) {
                                let name = ep.file_name().unwrap_or_default().to_string_lossy().to_string();
                                let size = fs::metadata(&ep).map(|m| m.len()).unwrap_or(0);
                                files.push(serde_json::json!({ "name": name, "path": ps, "size": size }));
                            }
                        }
                    }
                }
            }
        } else if path.is_file() {
            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                if IMAGE_EXTENSIONS.contains(&ext.to_lowercase().as_str()) {
                    let ps = path.to_string_lossy().to_string();
                    if seen.insert(ps.clone()) {
                        let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                        let size = fs::metadata(path).map(|m| m.len()).unwrap_or(0);
                        files.push(serde_json::json!({ "name": name, "path": ps, "size": size }));
                    }
                }
            }
        }
    }

    files.sort_by(|a, b| {
        let na = a["name"].as_str().unwrap_or("");
        let nb = b["name"].as_str().unwrap_or("");
        natord_cmp(na, nb)
    });

    let folder_path = if let Some(first) = files.first() {
        Path::new(first["path"].as_str().unwrap_or(""))
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default()
    } else {
        String::new()
    };

    serde_json::json!({ "success": true, "files": files, "folderPath": folder_path })
}

#[tauri::command]
fn read_dropped_txt_files(paths: Vec<String>) -> serde_json::Value {
    let mut files: Vec<serde_json::Value> = Vec::new();
    for p in &paths {
        let path = Path::new(p);
        if !path.is_file() { continue; }
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        if ext != "txt" { continue; }
        if let Ok(content) = fs::read_to_string(path) {
            let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
            let size = fs::metadata(path).map(|m| m.len()).unwrap_or(0);
            files.push(serde_json::json!({ "name": name, "content": content, "size": size }));
        }
    }
    serde_json::json!({ "success": true, "files": files })
}

#[tauri::command]
async fn load_image_preview(file_path: String, max_size: u32) -> serde_json::Value {
    // 非同期でブロッキング処理を実行（UIフリーズ防止）
    match tauri::async_runtime::spawn_blocking(move || {
        load_image_preview_sync(&file_path, max_size)
    }).await {
        Ok(result) => result,
        Err(e) => serde_json::json!({ "success": false, "error": format!("タスクエラー: {}", e) }),
    }
}

fn load_image_preview_sync(file_path: &str, max_size: u32) -> serde_json::Value {
    let path = Path::new(file_path);
    if !path.is_file() {
        return serde_json::json!({ "success": false, "error": "ファイルが見つかりません" });
    }

    // PDFはフロントエンド（PDF.js）で処理するためスキップ
    if let Some(ext) = path.extension() {
        if ext.to_ascii_lowercase() == "pdf" {
            return serde_json::json!({ "success": false, "error": "PDF is handled by frontend" });
        }
    }

    // ディスクキャッシュキーを生成（ファイルパス + 更新日時 + maxSize）
    let modified_secs = fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let file_name = path.file_stem().unwrap_or_default().to_string_lossy();
    let cache_key = format!("{}_{}", file_path, modified_secs);
    let cache_filename = format!("progen_preview_{}_{}_{}",
        file_name.chars().take(50).collect::<String>(),
        modified_secs, max_size);

    // メモリキャッシュチェック
    if let Ok(cache) = preview_cache().lock() {
        if let Some(cached_path) = cache.get(&cache_key) {
            if Path::new(cached_path).exists() {
                // キャッシュヒット: 元画像のサイズを返す
                let (ow, oh) = get_original_dimensions(path);
                return serde_json::json!({
                    "success": true,
                    "filePath": cached_path,
                    "originalWidth": ow,
                    "originalHeight": oh,
                });
            }
        }
    }

    // ディスクキャッシュチェック
    let cache_dir = std::env::temp_dir();
    let cache_path = cache_dir.join(format!("{}.jpg", cache_filename));
    if cache_path.exists() {
        let cache_path_str = cache_path.to_string_lossy().to_string();
        if let Ok(mut cache) = preview_cache().lock() {
            cache.insert(cache_key, cache_path_str.clone());
        }
        let (ow, oh) = get_original_dimensions(path);
        return serde_json::json!({
            "success": true,
            "filePath": cache_path_str,
            "originalWidth": ow,
            "originalHeight": oh,
        });
    }

    // キャッシュなし: 画像を生成
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();

    let img = if ext == "psd" {
        match load_psd_image(path) {
            Ok(i) => i,
            Err(e) => return serde_json::json!({ "success": false, "error": e }),
        }
    } else {
        let data = match fs::read(path) {
            Ok(d) => d,
            Err(e) => return serde_json::json!({ "success": false, "error": e.to_string() }),
        };
        match image::load_from_memory(&data) {
            Ok(i) => i,
            Err(e) => return serde_json::json!({ "success": false, "error": format!("画像読み込みエラー: {}", e) }),
        }
    };

    encode_preview_to_disk(&img, max_size, &cache_path, &cache_key)
}

/// PSDファイルのヘッダーからオリジナルサイズを取得
fn get_original_dimensions(path: &Path) -> (u32, u32) {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    if ext == "psd" {
        if let Ok(data) = fs::read(path) {
            if data.len() >= 26 && &data[0..4] == b"8BPS" {
                let h = u32::from_be_bytes([data[14], data[15], data[16], data[17]]);
                let w = u32::from_be_bytes([data[18], data[19], data[20], data[21]]);
                return (w, h);
            }
        }
        (0, 0)
    } else {
        // 通常画像: imageクレートのdimensions(メタデータのみ読む)
        image::image_dimensions(path).unwrap_or((0, 0))
    }
}

/// PSDファイルからDynamicImageを構築（compositeイメージ）
fn load_psd_image(path: &Path) -> Result<image::DynamicImage, String> {
    let data = fs::read(path).map_err(|e| e.to_string())?;

    if data.len() < 26 || &data[0..4] != b"8BPS" {
        return Err("不正なPSDファイル".to_string());
    }

    let version = u16::from_be_bytes([data[4], data[5]]);
    let channels = u16::from_be_bytes([data[12], data[13]]) as usize;
    let height = u32::from_be_bytes([data[14], data[15], data[16], data[17]]) as usize;
    let width = u32::from_be_bytes([data[18], data[19], data[20], data[21]]) as usize;
    let depth = u16::from_be_bytes([data[22], data[23]]);

    if depth != 8 || width == 0 || height == 0 {
        return Err(format!("未対応のPSD (depth={}, {}x{})", depth, width, height));
    }

    let len_size = if version == 2 { 8 } else { 4 };
    let mut offset = 26;

    // Color Mode Data
    if offset + 4 > data.len() { return Err("PSD解析エラー".to_string()); }
    let cm_len = u32::from_be_bytes([data[offset], data[offset+1], data[offset+2], data[offset+3]]) as usize;
    offset += 4 + cm_len;

    // Image Resources
    if offset + 4 > data.len() { return Err("PSD解析エラー".to_string()); }
    let ir_len = u32::from_be_bytes([data[offset], data[offset+1], data[offset+2], data[offset+3]]) as usize;
    offset += 4 + ir_len;

    // Layer and Mask Information
    if offset + len_size > data.len() { return Err("PSD解析エラー".to_string()); }
    let lm_len = if version == 2 {
        u64::from_be_bytes([data[offset], data[offset+1], data[offset+2], data[offset+3],
                           data[offset+4], data[offset+5], data[offset+6], data[offset+7]]) as usize
    } else {
        u32::from_be_bytes([data[offset], data[offset+1], data[offset+2], data[offset+3]]) as usize
    };
    offset += len_size + lm_len;

    // Image Data Section
    if offset + 2 > data.len() { return Err("PSD解析エラー".to_string()); }
    let compression = u16::from_be_bytes([data[offset], data[offset+1]]);
    offset += 2;

    let ch_count = channels.min(4);
    let pixels = width * height;

    let channel_data: Vec<Vec<u8>> = if compression == 0 {
        let mut chs = Vec::new();
        for _c in 0..ch_count {
            if offset + pixels > data.len() { return Err("PSD解析エラー".to_string()); }
            chs.push(data[offset..offset + pixels].to_vec());
            offset += pixels;
        }
        for _ in ch_count..channels { offset += pixels; }
        chs
    } else if compression == 1 {
        let row_count = height * channels;
        if offset + row_count * 2 > data.len() { return Err("PSD解析エラー".to_string()); }
        let mut byte_counts = Vec::with_capacity(row_count);
        for i in 0..row_count {
            let pos = offset + i * 2;
            byte_counts.push(u16::from_be_bytes([data[pos], data[pos+1]]) as usize);
        }
        offset += row_count * 2;

        let mut chs: Vec<Vec<u8>> = Vec::new();
        for c in 0..channels {
            let mut ch_buf = Vec::with_capacity(pixels);
            for row in 0..height {
                let bc = byte_counts[c * height + row];
                if offset + bc > data.len() { return Err("PSD解析エラー".to_string()); }
                decode_packbits(&data[offset..offset + bc], &mut ch_buf, width);
                offset += bc;
            }
            if c < ch_count { chs.push(ch_buf); }
        }
        chs
    } else {
        return Err(format!("未対応の圧縮形式: {}", compression));
    };

    let mut rgba = vec![255u8; pixels * 4];
    if ch_count >= 3 {
        for i in 0..pixels {
            rgba[i * 4]     = channel_data[0].get(i).copied().unwrap_or(0);
            rgba[i * 4 + 1] = channel_data[1].get(i).copied().unwrap_or(0);
            rgba[i * 4 + 2] = channel_data[2].get(i).copied().unwrap_or(0);
            if ch_count >= 4 {
                rgba[i * 4 + 3] = channel_data[3].get(i).copied().unwrap_or(255);
            }
        }
    } else if ch_count == 1 {
        for i in 0..pixels {
            let v = channel_data[0].get(i).copied().unwrap_or(0);
            rgba[i * 4] = v;
            rgba[i * 4 + 1] = v;
            rgba[i * 4 + 2] = v;
        }
    }

    Ok(image::DynamicImage::ImageRgba8(
        image::RgbaImage::from_raw(width as u32, height as u32, rgba)
            .unwrap_or_else(|| image::RgbaImage::new(1, 1))
    ))
}

fn decode_packbits(src: &[u8], dst: &mut Vec<u8>, expected: usize) {
    let mut i = 0;
    let mut written = 0;
    while i < src.len() && written < expected {
        let n = src[i] as i8;
        i += 1;
        if n >= 0 {
            let count = (n as usize) + 1;
            let end = (i + count).min(src.len());
            let take = count.min(expected - written);
            dst.extend_from_slice(&src[i..i + take]);
            written += take;
            i = end;
        } else if n > -128 {
            let count = (-n as usize) + 1;
            if i < src.len() {
                let val = src[i];
                i += 1;
                let take = count.min(expected - written);
                dst.extend(std::iter::repeat(val).take(take));
                written += take;
            }
        }
        // n == -128: no-op
    }
}

/// 画像をリサイズしてディスクキャッシュに保存、ファイルパスを返す
fn encode_preview_to_disk(
    img: &image::DynamicImage,
    max_size: u32,
    cache_path: &Path,
    cache_key: &str,
) -> serde_json::Value {
    let (ow, oh) = (img.width(), img.height());
    let resized = if ow > max_size || oh > max_size {
        img.resize(max_size, max_size, image::imageops::FilterType::CatmullRom)
    } else {
        img.clone()
    };

    // JPEG品質92でディスクに保存
    let jpeg_encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(
        match fs::File::create(cache_path) {
            Ok(f) => std::io::BufWriter::new(f),
            Err(e) => return serde_json::json!({ "success": false, "error": format!("キャッシュ書き込みエラー: {}", e) }),
        },
        92,
    );
    if resized.write_with_encoder(jpeg_encoder).is_err() {
        return serde_json::json!({ "success": false, "error": "JPEG変換に失敗しました" });
    }

    let cache_path_str = cache_path.to_string_lossy().to_string();

    // メモリキャッシュに登録
    if let Ok(mut cache) = preview_cache().lock() {
        cache.insert(cache_key.to_string(), cache_path_str.clone());
    }

    serde_json::json!({
        "success": true,
        "filePath": cache_path_str,
        "originalWidth": ow,
        "originalHeight": oh,
    })
}

#[tauri::command]
async fn show_open_image_folder_dialog(app: tauri::AppHandle) -> serde_json::Value {
    use tauri_plugin_dialog::DialogExt;
    let result = app.dialog().file().set_title("画像フォルダを選択").blocking_pick_folder();
    match result {
        Some(path) => serde_json::json!({ "success": true, "folderPath": path.to_string() }),
        None => serde_json::json!({ "success": false, "canceled": true }),
    }
}

// ========================================
// 校正結果JSONファイル保存・読み込み
// ========================================

#[tauri::command]
async fn show_save_json_dialog(
    default_name: Option<String>,
    app: tauri::AppHandle,
) -> serde_json::Value {
    use tauri_plugin_dialog::DialogExt;
    let default = default_name.unwrap_or_else(|| "校正結果.json".to_string());
    let result = app
        .dialog()
        .file()
        .set_file_name(&default)
        .add_filter("JSON files", &["json"])
        .blocking_save_file();
    match result {
        Some(path) => serde_json::json!({ "success": true, "filePath": path.to_string() }),
        None => serde_json::json!({ "success": false, "canceled": true }),
    }
}

#[tauri::command]
async fn open_and_read_json_dialog(app: tauri::AppHandle) -> serde_json::Value {
    use tauri_plugin_dialog::DialogExt;
    let mut builder = app
        .dialog()
        .file()
        .set_title("校正結果JSONを開く")
        .add_filter("JSON files", &["json"]);

    // COMIC-Bridgeと共通のデフォルトパス
    let default_dir = Path::new("G:/共有ドライブ/CLLENN/編集部フォルダ/編集企画部/写植・校正用テキストログ/テキスト抽出");
    if default_dir.is_dir() {
        builder = builder.set_directory(default_dir);
    }

    let result = builder
        .blocking_pick_file();
    match result {
        Some(file_path) => {
            let path_str = file_path.to_string();
            match fs::read_to_string(&path_str) {
                Ok(content) => serde_json::json!({
                    "success": true,
                    "filePath": path_str,
                    "content": content
                }),
                Err(e) => serde_json::json!({
                    "success": false,
                    "error": format!("読み込みエラー: {}", e)
                }),
            }
        }
        None => serde_json::json!({ "success": false, "canceled": true }),
    }
}

// ========================================
// エントリーポイント
// ========================================

/// WebView2のキャッシュをバージョンアップ時にクリアする。
/// 自動更新後にWebView2が古いJSバイトコードを返す問題を防止。
fn clear_webview2_cache_on_version_change(app_handle: &tauri::AppHandle) {
    let app_version = app_handle.package_info().version.to_string();
    let data_dir = match app_handle.path().app_local_data_dir() {
        Ok(dir) => dir,
        Err(_) => return,
    };

    let version_file = data_dir.join(".cache_version");

    // 前回のバージョンと比較
    let prev_version = fs::read_to_string(&version_file).unwrap_or_default();
    if prev_version.trim() == app_version {
        return; // 同一バージョン → キャッシュクリア不要
    }

    // バージョンが変わった → WebView2キャッシュを削除
    let webview_dir = data_dir.join("EBWebView").join("Default");
    for cache_dir in &["Cache", "Code Cache"] {
        let target = webview_dir.join(cache_dir);
        if target.exists() {
            let _ = fs::remove_dir_all(&target);
        }
    }

    // 現在のバージョンを記録
    let _ = fs::write(&version_file, &app_version);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let initial_map = scan_master_json_folder();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
                if let Some(data) = check_and_process_handoff() {
                    let _ = app.emit("comicpot-handoff", &data);
                }
            }
        }))
        .manage(AppState {
            master_rule_file_map: Mutex::new(initial_map),
        })
        .manage(PendingUpdate {
            update: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            get_json_folder_path,
            list_directory,
            read_json_file,
            write_json_file,
            read_master_rule,
            write_master_rule,
            create_master_label,
            get_master_label_list,
            create_txt_work_folder,
            get_txt_folder_path,
            list_txt_directory,
            read_txt_file,
            write_text_file,
            show_save_text_dialog,
            print_to_pdf,
            save_calibration_data,
            launch_comic_bridge,
            get_comicpot_handoff,
            respond_to_update,
            list_image_files,
            list_image_files_from_paths,
            load_image_preview,
            show_open_image_folder_dialog,
            read_dropped_txt_files,
            open_and_read_json_dialog,
            show_save_json_dialog,
        ])
        .setup(|app| {
            // WebView2キャッシュクリア（バージョンアップ時）
            clear_webview2_cache_on_version_change(app.handle());

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                check_for_updates(handle).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ========================================
// テスト
// ========================================

#[cfg(test)]
mod tests {
    use super::*;

    // --- generate_label_key ---

    #[test]
    fn generate_label_key_known_mapping() {
        assert_eq!(generate_label_key("GG-COMICS"), "ggcomics");
    }

    #[test]
    fn generate_label_key_unknown() {
        assert_eq!(generate_label_key("My-Label_01"), "my_label_01");
    }

    #[test]
    fn generate_label_key_unicode() {
        // Unknown unicode gets converted to underscores
        let result = generate_label_key("テスト");
        assert!(result.chars().all(|c| c == '_' || c.is_ascii_alphanumeric()));
    }

    // --- chrono_now_iso ---

    #[test]
    fn chrono_now_iso_format() {
        let iso = chrono_now_iso();
        // Format: YYYY-MM-DDTHH:MM:SS.000Z
        assert_eq!(iso.len(), 24);
        assert!(iso.ends_with(".000Z"));
        assert_eq!(&iso[4..5], "-");
        assert_eq!(&iso[7..8], "-");
        assert_eq!(&iso[10..11], "T");
        assert_eq!(&iso[13..14], ":");
        assert_eq!(&iso[16..17], ":");
    }

    // --- find_edge_executable ---

    #[test]
    fn find_edge_executable_returns_some_on_windows() {
        // This test will pass on machines with Edge installed
        let result = find_edge_executable();
        if let Some(path) = &result {
            assert!(Path::new(path).exists());
        }
        // On CI without Edge, result may be None — that's OK
    }

    // --- default_template ---

    #[test]
    fn default_template_structure() {
        let tmpl = default_template();
        assert!(tmpl.get("proofRules").is_some());
        let rules = &tmpl["proofRules"];
        assert!(rules.get("proof").is_some());
        assert!(rules.get("symbol").is_some());
        assert!(rules.get("options").is_some());
        assert!(rules["options"]["ngWordMasking"].as_bool() == Some(true));
    }

    // --- get_default_symbol_rules ---

    #[test]
    fn default_symbol_rules_not_empty() {
        let rules = get_default_symbol_rules();
        assert!(!rules.is_empty());
        // Each rule should have src, dst, note, active
        for rule in &rules {
            assert!(rule.get("src").is_some());
            assert!(rule.get("dst").is_some());
            assert!(rule.get("active").is_some());
        }
    }
}
