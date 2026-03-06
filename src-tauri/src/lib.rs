use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

// ========================================
// ベースパス定義（Gドライブ）
// ========================================
const JSON_FOLDER_BASE_PATH: &str = r"G:\共有ドライブ\CLLENN\編集部フォルダ\編集企画部\編集企画_C班(AT業務推進)\DTP制作部\JSONフォルダ";
const MASTER_JSON_BASE_PATH: &str = r"G:\共有ドライブ\CLLENN\編集部フォルダ\編集企画部\編集企画_C班(AT業務推進)\DTP制作部\ProGen_Master_JSON";
const TXT_FOLDER_BASE_PATH: &str = r"G:\共有ドライブ\CLLENN\編集部フォルダ\編集企画部\写植・校正用テキストログ";
const UPDATE_FOLDER: &str = r"G:\共有ドライブ\CLLENN\編集部フォルダ\編集企画部\編集企画_C班(AT業務推進)\DTP制作部\App_installer";
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
    volume: String,
    #[serde(rename = "checkType")]
    check_type: String,
    items: Vec<serde_json::Value>,
}

// アプリ状態
struct AppState {
    master_rule_file_map: Mutex<HashMap<String, LabelInfo>>,
}

// ========================================
// ヘルパー関数
// ========================================

fn generate_label_key(folder_name: &str) -> String {
    let known_mappings: HashMap<&str, &str> = HashMap::from([
        ("\u{6C4E}\u{7528}\u{FF08}\u{6A19}\u{6E96}\u{FF09}", "default"),
        ("\u{30AB}\u{30B2}\u{30AD}\u{30E4}\u{30FB}\u{3082}\u{3048}\u{30B9}\u{30BF}", "kagekiya"),
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

fn compare_versions(v1: &str, v2: &str) -> std::cmp::Ordering {
    let p1: Vec<u32> = v1.split('.').filter_map(|s| s.parse().ok()).collect();
    let p2: Vec<u32> = v2.split('.').filter_map(|s| s.parse().ok()).collect();
    let max_len = p1.len().max(p2.len());
    for i in 0..max_len {
        let n1 = p1.get(i).copied().unwrap_or(0);
        let n2 = p2.get(i).copied().unwrap_or(0);
        match n1.cmp(&n2) {
            std::cmp::Ordering::Equal => continue,
            other => return other,
        }
    }
    std::cmp::Ordering::Equal
}

fn extract_version_from_filename(filename: &str) -> Option<String> {
    let lower = filename.to_lowercase();
    if !lower.ends_with(".exe") {
        return None;
    }
    let without_exe = &filename[..filename.len() - 4];
    let mut version_chars: Vec<char> = Vec::new();
    for c in without_exe.chars().rev() {
        if c.is_ascii_digit() || c == '.' {
            version_chars.push(c);
        } else {
            break;
        }
    }
    version_chars.reverse();
    let version: String = version_chars.into_iter().collect();
    let parts: Vec<&str> = version.split('.').collect();
    if parts.len() >= 2 && parts.iter().all(|p| !p.is_empty() && p.parse::<u32>().is_ok()) {
        Some(version)
    } else {
        None
    }
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
            let items: Vec<DirItem> = entries
                .flatten()
                .filter_map(|e| {
                    let ft = e.file_type().ok()?;
                    Some(DirItem {
                        name: e.file_name().to_string_lossy().to_string(),
                        path: e.path().to_string_lossy().to_string(),
                        is_directory: ft.is_dir(),
                        is_file: ft.is_file(),
                    })
                })
                .collect();
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
            let items: Vec<DirItem> = entries
                .flatten()
                .filter_map(|e| {
                    let ft = e.file_type().ok()?;
                    Some(DirItem {
                        name: e.file_name().to_string_lossy().to_string(),
                        path: e.path().to_string_lossy().to_string(),
                        is_directory: ft.is_dir(),
                        is_file: ft.is_file(),
                    })
                })
                .collect();
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
fn get_comicpot_handoff() -> Option<HandoffData> {
    check_and_process_handoff()
}

// ========================================
// 更新チェック
// ========================================

fn check_for_updates(app: &tauri::AppHandle, current_version: &str) {
    println!("\u{73FE}\u{5728}\u{306E}\u{30D0}\u{30FC}\u{30B8}\u{30E7}\u{30F3}: {}", current_version);
    let update_folder = Path::new(UPDATE_FOLDER);
    if !update_folder.exists() {
        println!("\u{66F4}\u{65B0}\u{30D5}\u{30A9}\u{30EB}\u{30C0}\u{304C}\u{898B}\u{3064}\u{304B}\u{308A}\u{307E}\u{305B}\u{3093}: {}", UPDATE_FOLDER);
        return;
    }
    let entries = match fs::read_dir(update_folder) {
        Ok(e) => e,
        Err(e) => {
            eprintln!("\u{66F4}\u{65B0}\u{30D5}\u{30A9}\u{30EB}\u{30C0}\u{306E}\u{8AAD}\u{307F}\u{8FBC}\u{307F}\u{30A8}\u{30E9}\u{30FC}: {}", e);
            return;
        }
    };

    let mut latest_version = current_version.to_string();
    let mut latest_installer: Option<String> = None;

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let lower = name.to_lowercase();
        if lower.starts_with("progen") && lower.ends_with(".exe") {
            if let Some(version) = extract_version_from_filename(&name) {
                if compare_versions(&version, &latest_version) == std::cmp::Ordering::Greater {
                    latest_version = version;
                    latest_installer = Some(name);
                }
            }
        }
    }

    if let Some(installer) = latest_installer {
        println!("\u{65B0}\u{30D0}\u{30FC}\u{30B8}\u{30E7}\u{30F3}\u{304C}\u{898B}\u{3064}\u{304B}\u{308A}\u{307E}\u{3057}\u{305F}: {} {}", latest_version, installer);
        let installer_path = PathBuf::from(UPDATE_FOLDER).join(&installer);

        use tauri_plugin_dialog::DialogExt;
        let yes = app
            .dialog()
            .message(format!(
                "\u{73FE}\u{5728}\u{306E}\u{30D0}\u{30FC}\u{30B8}\u{30E7}\u{30F3}: v{}\n\u{6700}\u{65B0}\u{30D0}\u{30FC}\u{30B8}\u{30E7}\u{30F3}: v{}\n\n\u{30A2}\u{30C3}\u{30D7}\u{30C7}\u{30FC}\u{30C8}\u{3092}\u{958B}\u{59CB}\u{3057}\u{307E}\u{3059}\u{304B}\u{FF1F}",
                current_version, latest_version
            ))
            .title("\u{30A2}\u{30C3}\u{30D7}\u{30C7}\u{30FC}\u{30C8}\u{306E}\u{304A}\u{77E5}\u{3089}\u{305B}")
            .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancelCustom(
                "\u{4ECA}\u{3059}\u{3050}\u{66F4}\u{65B0}".to_string(),
                "\u{5F8C}\u{3067}".to_string(),
            ))
            .blocking_show();

        if yes {
            let _ = Command::new(&installer_path).spawn();
            std::process::exit(0);
        }
    } else {
        println!("\u{66F4}\u{65B0}\u{306F}\u{3042}\u{308A}\u{307E}\u{305B}\u{3093}\u{FF08}\u{6700}\u{65B0}\u{30D0}\u{30FC}\u{30B8}\u{30E7}\u{30F3}\u{3067}\u{3059}\u{FF09}");
    }
}

// ========================================
// エントリーポイント
// ========================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let initial_map = scan_master_json_folder();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
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
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let version = app
                .config()
                .version
                .clone()
                .unwrap_or_else(|| "0.0.0".to_string());
            check_for_updates(&handle, &version);
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

    // --- compare_versions ---

    #[test]
    fn compare_versions_equal() {
        assert_eq!(compare_versions("1.2.1", "1.2.1"), std::cmp::Ordering::Equal);
    }

    #[test]
    fn compare_versions_greater() {
        assert_eq!(compare_versions("1.3.0", "1.2.1"), std::cmp::Ordering::Greater);
    }

    #[test]
    fn compare_versions_less() {
        assert_eq!(compare_versions("1.2.0", "1.2.1"), std::cmp::Ordering::Less);
    }

    #[test]
    fn compare_versions_different_length() {
        assert_eq!(compare_versions("1.2", "1.2.0"), std::cmp::Ordering::Equal);
        assert_eq!(compare_versions("1.2", "1.2.1"), std::cmp::Ordering::Less);
    }

    #[test]
    fn compare_versions_major() {
        assert_eq!(compare_versions("2.0.0", "1.9.9"), std::cmp::Ordering::Greater);
    }

    // --- extract_version_from_filename ---

    #[test]
    fn extract_version_standard() {
        assert_eq!(
            extract_version_from_filename("ProGen_1.2.1_x64-setup.exe"),
            None // "setup" is not a version
        );
    }

    #[test]
    fn extract_version_trailing() {
        assert_eq!(
            extract_version_from_filename("ProGen1.2.1.exe"),
            Some("1.2.1".to_string())
        );
    }

    #[test]
    fn extract_version_two_parts() {
        assert_eq!(
            extract_version_from_filename("App2.0.exe"),
            Some("2.0".to_string())
        );
    }

    #[test]
    fn extract_version_no_version() {
        assert_eq!(extract_version_from_filename("readme.txt"), None);
    }

    #[test]
    fn extract_version_not_exe() {
        assert_eq!(extract_version_from_filename("app1.2.3.msi"), None);
    }

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
