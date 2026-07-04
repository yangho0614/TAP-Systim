/**
 * ============================================================
 *  出缺勤與薪資後端 (Google Apps Script)
 *  請將本檔案內容貼到 Apps Script 專案的 Code.gs
 *  部署方式：發布 > 部署為網頁應用程式
 *    - 執行身分：我 (你自己的帳號)
 *    - 存取權限：任何人 (Anyone)
 *  部署後把網址填到 index.html / admin.html 的 GAS_URL 常數
 *
 *  每次修改本檔案後，記得到「部署」>「管理部署作業」建立新版本，
 *  否則前端呼叫到的還是舊版程式碼。
 * ============================================================
 */

// ⚠️ 請改成你自己的 Google Sheet ID（網址 /d/ 與 /edit 中間那一段）
const SPREADSHEET_ID = '1yE6GHpyLk83f6PxtS18hFos8-iTfUcgFpvBHqn6eYi8';

// ⚠️ 第一次執行 setupSheets() 時，會用這組帳密建立你的管理者登入帳號。
//    建立後可自行修改，之後修改這裡的值不會影響已建立的帳號。
const INITIAL_ADMIN_ACCOUNT = 'admin';
const INITIAL_ADMIN_PASSWORD = 'admin1234';

const SHEET_EMP = '員工';
const SHEET_LOG = '打卡紀錄';
const SHEET_SET = '設定';
const SHEET_HOLIDAY = '國定假日';
const SHEET_PAYROLL = '薪資紀錄';
const SHEET_ACCOUNT = '帳號';
const SHEET_COMPANY = '公司';
const SHEET_DEPT = '部門';
const SHEET_SHIFT = '班別';
const SHEET_SESSION = '登入工作階段';
const SHEET_REQUEST = '申請單';
const SHEET_COMP = '補休額度';
const SHEET_ANNUAL = '特休核定';
const SHEET_ANNOUNCE = '公告';
const SHEET_REST_MAKEUP = '例假日補假登記';

const EMP_HEADERS = ['員工ID', '姓名', '部門', '公司', '狀態', '建立時間',
                      '到職日', '投保級距', '本薪', '伙食津貼', '交通津貼', '職務加給', '全勤獎金',
                      '銀行', '銀行帳號', '備註', '公司ID', '部門ID', '班別ID', '手機', '可為代理人', '免打卡',
                      '身分證字號', '戶籍地', '眷屬人數'];
const LOG_HEADERS = ['紀錄ID', '員工ID', '姓名', '日期', '上班時間', '上班緯度', '上班經度', '上班狀態',
                      '下班時間', '下班緯度', '下班經度', '下班狀態', '來源', '備註', '更新時間',
                      '外出時間', '外出緯度', '外出經度', '外出狀態',
                      '返回時間', '返回緯度', '返回經度', '返回狀態'];
const SESSION_HEADERS = ['Token', '帳號ID', '員工ID', '角色', '到期時間', '建立時間'];
const REQUEST_HEADERS = ['申請ID', '類型', '員工ID', '姓名', '假別', '開始時間', '結束時間', '時數', '事由',
                          '狀態', '審核人', '審核意見', '申請時間', '審核時間', '代理人ID', '代理人姓名'];
const COMP_HEADERS = ['紀錄ID', '員工ID', '類型', '時數', '來源說明', '到期日', '建立時間'];
const ANNUAL_HEADERS = ['員工ID', '年度', '核定時數', '備註', '更新時間'];
const ANNOUNCE_HEADERS = ['公告ID', '標題', '內容', '公司ID', '置頂', '發布人', '狀態', '建立時間', '更新時間'];
const REST_MAKEUP_HEADERS = ['員工ID', '出勤日期', '補假日期', '登記人', '登記時間'];

// 假別 → 薪資扣款分類對映（事假100%／病假生理假50%／災防假0%／其他為有薪假不扣款）
const LEAVE_TYPES = ['特休', '補休', '事假', '病假', '生理假', '婚假', '喪假', '公假', '公傷病假', '產假', '產檢假', '陪產假', '家庭照顧假', '災防假'];
const HOLIDAY_HEADERS = ['日期', '名稱', '類型'];
const PAYROLL_HEADERS = ['月份', '員工ID',
  '平日1.34hr', '平日1.67hr', '休息日hr', '國定假日hr', '例假日hr',
  '三節獎金', '年終獎金', '績效獎金', '其他獎金',
  '事假hr', '病假hr', '災防假hr', '其他假hr', '特休結算工資',
  '業務費用', '業績', '其他費用26', '銷售獎金26', '扣款2',
  '其他扣款', '備註', '更新時間', '生理假全薪hr', '生理假半薪hr'];
const ACCOUNT_HEADERS = ['帳號ID', '員工ID', '帳號', '密碼雜湊', '鹽值', '角色', '狀態', '建立時間', '最後登入'];
const COMPANY_HEADERS = ['公司ID', '公司名稱', '統一編號', '地址', '負責人', '電話', '建立時間'];
const DEPT_HEADERS = ['部門ID', '部門名稱', '公司ID', '主管員工ID', '建立時間'];
const SHIFT_HEADERS = ['班別ID', '班別名稱', '上班時間', '下班時間', '午休扣除分鐘', '建立時間'];

const DEFAULT_SETTINGS = {
  storeName: '公司/門市',
  lat: '',
  lng: '',
  radius: 200,        // 允許誤差半徑（公尺）
  workStart: '09:00',
  workEnd: '18:00',
  lunchBreak: 60,      // 午休扣除分鐘數
  lateGrace: 5,        // 遲到寬限（分鐘）
  earlyGrace: 5,       // 早退寬限（分鐘）
  restDay: 6,          // 休息日（0=日 1=一 ... 6=六），依勞基法第36條，七日中一例一休
  mandatoryRestDay: 0, // 例假日（原則不可出勤，僅天災事變等特殊狀況例外）
  monthlyOtCap: 46,    // 平日加班工時上限（小時／月），經工會或勞資會議同意可延長至54，但不含國定假日及例假加班
  leaveUnit: 1,        // 請假最小單位（小時）：1 / 0.5 / 4（半天）
  compTimeExpireMonths: 6, // 補休使用期限（月）
  mandatoryRestPayMode: 'double' // 例假日出勤薪資算法：'double'=優於勞基法(時薪×2) / 'legal'=依勞基法(加發一日工資+超時比照平日加班費)
};

const PUBLIC_ACTIONS = ['login', 'setupSheets', 'getAccountOwnerName']; // 不需要登入就能呼叫的 action
const ADMIN_ONLY_ACTIONS = [
  'getAccounts', 'addEmployee', 'updateEmployee', 'deleteEmployee',
  'addManualRecord', 'adjustRecord', 'deleteRecord', 'updateSettings',
  'addHoliday', 'deleteHoliday', 'importOfficialHolidays', 'savePayrollMonth', 'registerMandatoryRestMakeup',
  'addCompany', 'updateCompany', 'deleteCompany',
  'addDepartment', 'updateDepartment', 'deleteDepartment',
  'addShift', 'updateShift', 'deleteShift',
  'createAccount', 'resetPassword', 'setAccountStatus', 'deleteAccount',
  'setAnnualLeave', 'getAnnualLeaveList', 'listAllRequests', 'estimateAnnualLeave', 'batchEstimateAnnualLeave', 'batchSaveAnnualLeave',
  // ⚠️ 以下為安全性補強：避免一般員工帳號直接呼叫拿到全部人的薪資/出缺勤/個資
  'getEmployees', 'getPayrollEntries', 'getMonthlySummary', 'getRecords', 'exportForPayroll',
  'getCompLedger', 'getDashboardStats', 'getMandatoryRestMakeups', 'getAnnualPayrollRegister',
  'addAnnouncement', 'updateAnnouncement', 'deleteAnnouncement'
];

/* ============================ 入口 ============================ */

function doGet(e) {
  try {
    const action = e.parameter.action;
    const token = e.parameter.token;
    if (PUBLIC_ACTIONS.indexOf(action) === -1) validateSession(token);
    if (ADMIN_ONLY_ACTIONS.indexOf(action) !== -1) requireAdmin(token);
    let result;
    switch (action) {
      case 'getEmployees': result = getEmployees(); break;
      case 'getSettings': result = getSettings(); break;
      case 'getMandatoryRestMakeups': result = getMandatoryRestMakeups(); break;
      case 'getAnnualPayrollRegister': result = getAnnualPayrollRegister(e.parameter.year); break;
      case 'getTodayStatus': result = getTodayStatus(e.parameter.employeeId); break;
      case 'getRecords': result = getRecords(e.parameter.month, e.parameter.employeeId); break;
      case 'getMonthlySummary': result = getMonthlySummary(e.parameter.month); break;
      case 'exportForPayroll': result = exportForPayroll(e.parameter.month); break;
      case 'getHolidays': result = getHolidays(); break;
      case 'getPayrollEntries': result = getPayrollEntries(e.parameter.month); break;
      case 'getCompanies': result = getCompanies(); break;
      case 'getDepartments': result = getDepartments(); break;
      case 'getShifts': result = getShifts(); break;
      case 'getAccounts': result = getAccounts(); break;
      case 'listMyRequests': result = listMyRequests(token); break;
      case 'listPendingApprovals': result = listPendingApprovals(token); break;
      case 'listAllRequests': result = listAllRequests(e.parameter.month, e.parameter.status); break;
      case 'getLeaveBalances': result = getLeaveBalances(token, e.parameter.employeeId); break;
      case 'getAnnualLeaveList': result = getAnnualLeaveList(e.parameter.year); break;
      case 'getAnnouncements': result = getAnnouncements(); break;
      case 'getMyPayslip': result = getMyPayslip(token, e.parameter.month); break;
      case 'getCompLedger': result = getCompLedger(e.parameter.employeeId); break;
      case 'getDashboardStats': result = getDashboardStats(); break;
      case 'estimateAnnualLeave': result = estimateAnnualLeave(e.parameter.employeeId, e.parameter.year, e.parameter.system); break;
      case 'batchEstimateAnnualLeave': result = batchEstimateAnnualLeave(e.parameter.year, e.parameter.system); break;
      case 'getMyProfile': result = getMyProfile(token); break;
      case 'getColleagueList': result = getColleagueList(); break;
      case 'getMyMenstrualLeaveStatus': result = getMyMenstrualLeaveStatus(token); break;
      default: return jsonOutput({ status: 'error', message: '未知的 action: ' + action });
    }
    return jsonOutput({ status: 'success', data: result });
  } catch (err) {
    return jsonOutput({ status: 'error', message: String(err.message || err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    if (PUBLIC_ACTIONS.indexOf(action) === -1) validateSession(body.token);
    if (ADMIN_ONLY_ACTIONS.indexOf(action) !== -1) requireAdmin(body.token);
    let result;
    switch (action) {
      case 'login': result = login(body); break;
      case 'getAccountOwnerName': result = getAccountOwnerName(body); break;
      case 'changePassword': result = changePassword(body); break;
      case 'clockIn': result = clockInOut(body, 'in'); break;
      case 'clockOut': result = clockInOut(body, 'out'); break;
      case 'addEmployee': result = addEmployee(body); break;
      case 'updateEmployee': result = updateEmployee(body); break;
      case 'deleteEmployee': result = deleteEmployee(body); break;
      case 'addManualRecord': result = addManualRecord(body); break;
      case 'adjustRecord': result = adjustRecord(body); break;
      case 'deleteRecord': result = deleteRecord(body); break;
      case 'updateSettings': result = updateSettings(body); break;
      case 'addHoliday': result = addHoliday(body); break;
      case 'deleteHoliday': result = deleteHoliday(body); break;
      case 'registerMandatoryRestMakeup': result = registerMandatoryRestMakeup(body); break;
      case 'importOfficialHolidays': result = importOfficialHolidays(body.year); break;
      case 'savePayrollMonth': result = savePayrollMonth(body); break;
      case 'addCompany': result = addCompany(body); break;
      case 'updateCompany': result = updateCompany(body); break;
      case 'deleteCompany': result = deleteCompany(body); break;
      case 'addDepartment': result = addDepartment(body); break;
      case 'updateDepartment': result = updateDepartment(body); break;
      case 'deleteDepartment': result = deleteDepartment(body); break;
      case 'addShift': result = addShift(body); break;
      case 'updateShift': result = updateShift(body); break;
      case 'deleteShift': result = deleteShift(body); break;
      case 'createAccount': result = createAccount(body); break;
      case 'resetPassword': result = resetPassword(body); break;
      case 'setAccountStatus': result = setAccountStatus(body); break;
      case 'deleteAccount': result = deleteAccount(body); break;
      case 'submitRequest': result = submitRequest(body); break;
      case 'cancelRequest': result = cancelRequest(body); break;
      case 'approveRequest': result = approveRequest(body); break;
      case 'rejectRequest': result = rejectRequest(body); break;
      case 'setAnnualLeave': result = setAnnualLeave(body); break;
      case 'batchSaveAnnualLeave': result = batchSaveAnnualLeave(body); break;
      case 'clockOutgo': result = clockOutgoReturn(body, 'outgo'); break;
      case 'clockReturn': result = clockOutgoReturn(body, 'return'); break;
      case 'addAnnouncement': result = addAnnouncement(body); break;
      case 'updateAnnouncement': result = updateAnnouncement(body); break;
      case 'deleteAnnouncement': result = deleteAnnouncement(body); break;
      case 'setupSheets': result = setupSheets(); break;
      default: return jsonOutput({ status: 'error', message: '未知的 action: ' + action });
    }
    return jsonOutput({ status: 'success', data: result });
  } catch (err) {
    return jsonOutput({ status: 'error', message: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ============================ 初始化與資料遷移 ============================ */
// 第一次使用前，於 Apps Script 編輯器手動執行一次 setupSheets()
function setupSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  ensureSheet(ss, SHEET_EMP, EMP_HEADERS);
  forceTextColumn(ss.getSheetByName(SHEET_EMP), 'O'); // 銀行帳號
  forceTextColumn(ss.getSheetByName(SHEET_EMP), 'T'); // 手機
  forceTextColumn(ss.getSheetByName(SHEET_EMP), 'W'); // 身分證字號
  ensureSheet(ss, SHEET_LOG, LOG_HEADERS);
  const logSheet = ss.getSheetByName(SHEET_LOG);
  ['D', 'E', 'I', 'O', 'P', 'T'].forEach(col => forceTextColumn(logSheet, col)); // 日期/上班/下班/更新/外出/返回時間
  ensureSheet(ss, SHEET_HOLIDAY, HOLIDAY_HEADERS);
  ensureSheet(ss, SHEET_PAYROLL, PAYROLL_HEADERS);
  ensureSheet(ss, SHEET_ACCOUNT, ACCOUNT_HEADERS);
  forceTextColumn(ss.getSheetByName(SHEET_ACCOUNT), 'C'); // 帳號
  ensureSheet(ss, SHEET_COMPANY, COMPANY_HEADERS);
  forceTextColumn(ss.getSheetByName(SHEET_COMPANY), 'C'); // 統一編號
  forceTextColumn(ss.getSheetByName(SHEET_COMPANY), 'F'); // 電話
  ensureSheet(ss, SHEET_DEPT, DEPT_HEADERS);
  ensureSheet(ss, SHEET_SHIFT, SHIFT_HEADERS);
  forceTextColumn(ss.getSheetByName(SHEET_SHIFT), 'C'); // 上班時間
  forceTextColumn(ss.getSheetByName(SHEET_SHIFT), 'D'); // 下班時間
  ensureSheet(ss, SHEET_SESSION, SESSION_HEADERS);
  ensureSheet(ss, SHEET_REQUEST, REQUEST_HEADERS);
  ensureSheet(ss, SHEET_COMP, COMP_HEADERS);
  ensureSheet(ss, SHEET_ANNUAL, ANNUAL_HEADERS);
  ensureSheet(ss, SHEET_ANNOUNCE, ANNOUNCE_HEADERS);
  ensureSheet(ss, SHEET_REST_MAKEUP, REST_MAKEUP_HEADERS);
  const setSheet = ensureSheet(ss, SHEET_SET, ['設定項', '值']);
  forceTextColumn(setSheet, 'B'); // 值欄純文字，避免 "09:00" 這類時間字串被自動轉換
  if (setSheet.getLastRow() < 2) {
    const rows = Object.keys(DEFAULT_SETTINGS).map(k => [k, DEFAULT_SETTINGS[k]]);
    setSheet.getRange(2, 1, rows.length, 2).setValues(rows);
  }

  migrateCompaniesAndDepartments();
  migrateHolidayType();
  bootstrapAdminAccount();

  return { message: '試算表結構已建立/確認完成，並已自動整理公司／部門資料與管理者帳號' };
}
function ensureSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const existingWidth = sheet.getLastColumn();
    if (existingWidth < headers.length) {
      const missing = headers.slice(existingWidth);
      sheet.getRange(1, existingWidth + 1, 1, missing.length).setValues([missing]);
    }
  }
  return sheet;
}
// 把整欄設成純文字格式，避免像手機、銀行帳號、統編這種「數字字串」被 Sheet 自動吃掉開頭0或轉型
function forceTextColumn(sheet, colLetter) {
  sheet.getRange(colLetter + ':' + colLetter).setNumberFormat('@');
}
// 安全讀取可能被誤判成時間格式的儲存格（如 "09:00" 被 Sheet 自動轉成時間序列值）
function safeTimeText(v, fallback) {
  if (!v) return fallback || '';
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Taipei', 'HH:mm');
  return String(v);
}
// 安全讀取可能被誤判成日期時間格式的儲存格（如 "2026-07-03 09:01:00" 被 Sheet 自動轉成 Date）
function safeDateTimeText(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');
  return String(v);
}
// 安全讀取可能被誤判成日期格式的儲存格（如 "2026-07-03" 被 Sheet 自動轉成 Date）
function safeDateOnlyText(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Taipei', 'yyyy-MM-dd');
  return String(v);
}

// 依現有員工資料裡的「公司」「部門」文字，自動建立公司/部門清單並回填員工的 公司ID/部門ID
function migrateCompaniesAndDepartments() {
  const empSheet = getSheet(SHEET_EMP);
  const rows = empSheet.getDataRange().getValues();
  if (rows.length < 2) return;

  const companies = getCompanies();
  const departments = getDepartments();
  const companyByName = {}; companies.forEach(c => companyByName[c.name] = c.id);
  const deptByKey = {}; departments.forEach(d => deptByKey[d.companyId + '||' + d.name] = d.id);

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    const companyName = String(r[3] || '').trim();
    const deptName = String(r[2] || '').trim();
    let companyId = r[16] || '';
    let deptId = r[17] || '';

    if (!companyId && companyName) {
      if (!companyByName[companyName]) {
        companyId = addCompany({ name: companyName }).id;
        companyByName[companyName] = companyId;
      } else {
        companyId = companyByName[companyName];
      }
    }
    if (!deptId && deptName) {
      const key = (companyId || '') + '||' + deptName;
      if (!deptByKey[key]) {
        deptId = addDepartment({ name: deptName, companyId: companyId || '' }).id;
        deptByKey[key] = deptId;
      } else {
        deptId = deptByKey[key];
      }
    }
    if (companyId && companyId !== r[16]) empSheet.getRange(i + 1, 17).setValue(companyId);
    if (deptId && deptId !== r[17]) empSheet.getRange(i + 1, 18).setValue(deptId);
  }
}
function migrateHolidayType() {
  const sheet = getSheet(SHEET_HOLIDAY);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] && !rows[i][2]) sheet.getRange(i + 1, 3).setValue('國定假日');
  }
}
function bootstrapAdminAccount() {
  const sheet = getSheet(SHEET_ACCOUNT);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][2] === INITIAL_ADMIN_ACCOUNT) return; // 已存在，不重複建立
  }
  const salt = makeSalt();
  const hash = hashPassword(INITIAL_ADMIN_PASSWORD, salt);
  sheet.appendRow(['ACC' + new Date().getTime(), '', INITIAL_ADMIN_ACCOUNT, hash, salt, 'admin', '啟用', nowStr(), '']);
}

/* ============================ 帳號與登入 ============================ */
function makeSalt() {
  return Utilities.getUuid().replace(/-/g, '');
}
function hashPassword(password, salt) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(password) + String(salt), Utilities.Charset.UTF_8);
  return bytes.map(b => ((b < 0 ? b + 256 : b).toString(16)).padStart(2, '0')).join('');
}
// 登入前使用：僅依帳號查詢對應員工姓名供畫面顯示確認，不驗證密碼
function getAccountOwnerName(body) {
  const account = String(body.account || '').trim();
  if (!account) throw new Error('請輸入帳號');
  const sheet = getSheet(SHEET_ACCOUNT);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][2]) !== account) continue;
    if (rows[i][6] !== '啟用') throw new Error('帳號已停用，請聯繫管理者');
    const employeeId = rows[i][1];
    if (!employeeId) return { name: '' };
    const emp = getEmployees(true).find(function (e) { return e.id === employeeId; });
    return { name: emp ? emp.name : '' };
  }
  throw new Error('查無此帳號');
}

function login(body) {
  const account = String(body.account || '').trim();
  const password = String(body.password || '');
  if (!account || !password) throw new Error('請輸入帳號與密碼');
  const sheet = getSheet(SHEET_ACCOUNT);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[2]) !== account) continue;
    if (r[6] !== '啟用') throw new Error('帳號已停用，請聯繫管理者');
    const hash = hashPassword(password, r[4]);
    if (hash !== r[3]) throw new Error('帳號或密碼錯誤');
    const token = Utilities.getUuid();
    const payload = { accountId: r[0], employeeId: r[1] || '', account: r[2], role: r[5] };
    // 登入有效期30天，session 存工作表（CacheService 只當作加速用快取）
    const expire = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    getSheet(SHEET_SESSION).appendRow([token, payload.accountId, payload.employeeId, payload.role,
      Utilities.formatDate(expire, 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss'), nowStr()]);
    CacheService.getScriptCache().put('sess_' + token, JSON.stringify(payload), 21600);
    sheet.getRange(i + 1, 9).setValue(nowStr());
    let employee = null;
    if (r[1]) {
      employee = getEmployees(true).find(e => e.id === r[1]) || null;
    }
    const isManager = r[1] ? getDepartments().some(d => d.managerId === r[1]) : false;
    return { token: token, role: r[5], employeeId: r[1] || '', account: r[2], employee: employee, isManager: isManager };
  }
  throw new Error('帳號或密碼錯誤');
}
function validateSession(token) {
  if (!token) throw new Error('請先登入');
  const raw = CacheService.getScriptCache().get('sess_' + token);
  if (raw) return JSON.parse(raw);
  // 快取沒有時，回頭查工作表（30天內有效）
  const rows = getSheet(SHEET_SESSION).getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (rows[i][0] !== token) continue;
    const exp = rows[i][4] instanceof Date ? rows[i][4] : new Date(String(rows[i][4]).replace(' ', 'T'));
    if (isNaN(exp.getTime()) || exp.getTime() < Date.now()) throw new Error('登入已逾時，請重新登入');
    const payload = { accountId: rows[i][1], employeeId: rows[i][2] || '', role: rows[i][3] };
    CacheService.getScriptCache().put('sess_' + token, JSON.stringify(payload), 21600);
    return payload;
  }
  throw new Error('登入已逾時，請重新登入');
}
function requireAdmin(token) {
  const sess = validateSession(token);
  if (sess.role !== 'admin') throw new Error('權限不足，僅限管理者操作');
  return sess;
}
function changePassword(body) {
  const sess = validateSession(body.token);
  const sheet = getSheet(SHEET_ACCOUNT);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === sess.accountId) {
      const oldHash = hashPassword(body.oldPassword || '', rows[i][4]);
      if (oldHash !== rows[i][3]) throw new Error('原密碼不正確');
      const salt = makeSalt();
      const hash = hashPassword(body.newPassword || '', salt);
      sheet.getRange(i + 1, 4, 1, 2).setValues([[hash, salt]]);
      return { updated: true };
    }
  }
  throw new Error('找不到帳號');
}
function getAccounts() {
  const sheet = getSheet(SHEET_ACCOUNT);
  const rows = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    out.push({ id: r[0], employeeId: r[1] || '', account: String(r[2]), role: r[5], status: r[6] || '啟用', createdAt: r[7], lastLogin: r[8] || '' });
  }
  return out;
}
function createAccount(body) {
  requireAdmin(body.token);
  const account = String(body.account || '').trim();
  if (!account) throw new Error('請輸入帳號');
  const sheet = getSheet(SHEET_ACCOUNT);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][2]) === account) throw new Error('此帳號已被使用');
  }
  const salt = makeSalt();
  const hash = hashPassword(body.password || Utilities.getUuid().slice(0, 8), salt);
  const id = 'ACC' + new Date().getTime();
  const newRow = sheet.getLastRow() + 1;
  sheet.getRange(newRow, 3).setNumberFormat('@'); // 帳號欄設為純文字，保留開頭 0
  sheet.appendRow([id, body.employeeId || '', account, hash, salt, body.role || 'employee', '啟用', nowStr(), '']);
  sheet.getRange(newRow, 3).setNumberFormat('@');
  return { id: id };
}
function deleteAccount(body) {
  requireAdmin(body.token);
  const sheet = getSheet(SHEET_ACCOUNT);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === body.accountId) {
      if (rows[i][5] === 'admin') {
        // 避免刪掉唯一的管理者帳號後無法登入
        let adminCount = 0;
        for (let j = 1; j < rows.length; j++) if (rows[j][5] === 'admin' && rows[j][6] === '啟用') adminCount++;
        if (adminCount <= 1) throw new Error('這是唯一的啟用管理者帳號，無法刪除');
      }
      sheet.deleteRow(i + 1);
      return { deleted: true };
    }
  }
  throw new Error('找不到帳號');
}
function resetPassword(body) {
  requireAdmin(body.token);
  const sheet = getSheet(SHEET_ACCOUNT);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === body.accountId) {
      const salt = makeSalt();
      const hash = hashPassword(body.newPassword || '', salt);
      sheet.getRange(i + 1, 4, 1, 2).setValues([[hash, salt]]);
      return { updated: true };
    }
  }
  throw new Error('找不到帳號');
}
function setAccountStatus(body) {
  requireAdmin(body.token);
  const sheet = getSheet(SHEET_ACCOUNT);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === body.accountId) {
      sheet.getRange(i + 1, 7).setValue(body.status || '啟用');
      return { updated: true };
    }
  }
  throw new Error('找不到帳號');
}

/* ============================ 公司 ============================ */
function getCompanies() {
  const sheet = getSheet(SHEET_COMPANY);
  const rows = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    out.push({ id: r[0], name: r[1], taxId: String(r[2] || ''), address: r[3] || '', owner: r[4] || '', phone: String(r[5] || '') });
  }
  return out;
}
function addCompany(body) {
  const sheet = getSheet(SHEET_COMPANY);
  const id = 'CO' + new Date().getTime() + Math.floor(Math.random() * 1000);
  sheet.appendRow([id, body.name || '', body.taxId || '', body.address || '', body.owner || '', body.phone || '', nowStr()]);
  return { id: id };
}
function updateCompany(body) {
  const sheet = getSheet(SHEET_COMPANY);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === body.id) {
      sheet.getRange(i + 1, 2, 1, 5).setValues([[body.name || '', body.taxId || '', body.address || '', body.owner || '', body.phone || '']]);
      return { updated: true };
    }
  }
  throw new Error('找不到公司：' + body.id);
}
function deleteCompany(body) {
  const inUse = getEmployees(true).some(e => e.companyId === body.id);
  if (inUse) throw new Error('此公司仍有員工使用中，請先將員工轉移到其他公司');
  const sheet = getSheet(SHEET_COMPANY);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === body.id) { sheet.deleteRow(i + 1); return { deleted: true }; }
  }
  throw new Error('找不到公司：' + body.id);
}

/* ============================ 部門 ============================ */
function getDepartments() {
  const sheet = getSheet(SHEET_DEPT);
  const rows = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    out.push({ id: r[0], name: r[1], companyId: r[2] || '', managerId: r[3] || '' });
  }
  return out;
}
function addDepartment(body) {
  const sheet = getSheet(SHEET_DEPT);
  const id = 'DEPT' + new Date().getTime() + Math.floor(Math.random() * 1000);
  sheet.appendRow([id, body.name || '', body.companyId || '', body.managerId || '', nowStr()]);
  return { id: id };
}
function updateDepartment(body) {
  const sheet = getSheet(SHEET_DEPT);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === body.id) {
      sheet.getRange(i + 1, 2, 1, 3).setValues([[body.name || '', body.companyId || '', body.managerId || '']]);
      return { updated: true };
    }
  }
  throw new Error('找不到部門：' + body.id);
}
function deleteDepartment(body) {
  const inUse = getEmployees(true).some(e => e.departmentId === body.id);
  if (inUse) throw new Error('此部門仍有員工使用中，請先將員工轉移到其他部門');
  const sheet = getSheet(SHEET_DEPT);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === body.id) { sheet.deleteRow(i + 1); return { deleted: true }; }
  }
  throw new Error('找不到部門：' + body.id);
}

/* ============================ 班別 ============================ */
function getShifts() {
  const sheet = getSheet(SHEET_SHIFT);
  const rows = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    out.push({ id: r[0], name: r[1], workStart: safeTimeText(r[2], '09:00'), workEnd: safeTimeText(r[3], '18:00'), lunchBreak: Number(r[4]) || 60 });
  }
  return out;
}
function addShift(body) {
  const sheet = getSheet(SHEET_SHIFT);
  const id = 'SHIFT' + new Date().getTime() + Math.floor(Math.random() * 1000);
  sheet.appendRow([id, body.name || '', body.workStart || '09:00', body.workEnd || '18:00', body.lunchBreak || 60, nowStr()]);
  return { id: id };
}
function updateShift(body) {
  const sheet = getSheet(SHEET_SHIFT);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === body.id) {
      sheet.getRange(i + 1, 2, 1, 4).setValues([[body.name || '', body.workStart || '09:00', body.workEnd || '18:00', body.lunchBreak || 60]]);
      return { updated: true };
    }
  }
  throw new Error('找不到班別：' + body.id);
}
function deleteShift(body) {
  const inUse = getEmployees(true).some(e => e.shiftId === body.id);
  if (inUse) throw new Error('此班別仍有員工使用中，請先將員工改為其他班別');
  const sheet = getSheet(SHEET_SHIFT);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === body.id) { sheet.deleteRow(i + 1); return { deleted: true }; }
  }
  throw new Error('找不到班別：' + body.id);
}

/* ============================ 員工 ============================ */
function empRowToObj(r) {
  return {
    id: r[0], name: r[1], department: r[2], company: r[3], status: r[4] || '在職',
    hireDate: formatDateCell(r[6]), insuranceGrade: Number(r[7]) || 0, baseSalary: Number(r[8]) || 0,
    mealAllowance: Number(r[9]) || 0, transportAllowance: Number(r[10]) || 0, positionAllowance: Number(r[11]) || 0,
    fullAttendanceBonus: Number(r[12]) || 0, bankName: r[13] || '', bankAccount: String(r[14] || ''), note: r[15] || '',
    companyId: r[16] || '', departmentId: r[17] || '', shiftId: r[18] || '', phone: String(r[19] || ''),
    canBeDelegate: r[20] === '否' ? false : true, exemptFromAttendance: r[21] === '是' ? true : false,
    nationalId: String(r[22] || ''), householdAddress: r[23] || '', dependentCount: Number(r[24]) || 0
  };
}
function formatDateCell(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Taipei', 'yyyy-MM-dd');
  return String(v);
}
function getEmployees(includeInactive) {
  const sheet = getSheet(SHEET_EMP);
  const rows = sheet.getDataRange().getValues();
  const companyMap = {}; getCompanies().forEach(c => companyMap[c.id] = c);
  const deptMap = {}; getDepartments().forEach(d => deptMap[d.id] = d);
  const shiftMap = {}; getShifts().forEach(s => shiftMap[s.id] = s);
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    const emp = empRowToObj(r);
    if (emp.companyId && companyMap[emp.companyId]) emp.company = companyMap[emp.companyId].name;
    if (emp.departmentId && deptMap[emp.departmentId]) emp.department = deptMap[emp.departmentId].name;
    if (emp.shiftId && shiftMap[emp.shiftId]) emp.shift = shiftMap[emp.shiftId];
    out.push(emp);
  }
  return includeInactive ? out : out.filter(e => e.status !== '離職');
}
function addEmployee(body) {
  const sheet = getSheet(SHEET_EMP);
  const id = 'EMP' + new Date().getTime();
  sheet.appendRow([id, body.name, body.department || '', body.company || '', '在職', new Date(),
    body.hireDate || '', body.insuranceGrade || 0, body.baseSalary || 0,
    body.mealAllowance || 0, body.transportAllowance || 0, body.positionAllowance || 0, body.fullAttendanceBonus || 0,
    body.bankName || '', body.bankAccount || '', body.note || '',
    body.companyId || '', body.departmentId || '', body.shiftId || '', body.phone || '',
    body.canBeDelegate === false ? '否' : '是', body.exemptFromAttendance === true ? '是' : '否',
    body.nationalId || '', body.householdAddress || '', body.dependentCount || 0]);
  return { id };
}
function updateEmployee(body) {
  const sheet = getSheet(SHEET_EMP);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === body.id) {
      sheet.getRange(i + 1, 2, 1, 24).setValues([[
        body.name, body.department, body.company, body.status || '在職', rows[i][5],
        body.hireDate || '', body.insuranceGrade || 0, body.baseSalary || 0,
        body.mealAllowance || 0, body.transportAllowance || 0, body.positionAllowance || 0, body.fullAttendanceBonus || 0,
        body.bankName || '', body.bankAccount || '', body.note || '',
        body.companyId || '', body.departmentId || '', body.shiftId || '', body.phone || '',
        body.canBeDelegate === false ? '否' : '是', body.exemptFromAttendance === true ? '是' : '否',
        body.nationalId || '', body.householdAddress || '', body.dependentCount || 0
      ]]);
      return { updated: true };
    }
  }
  throw new Error('找不到員工：' + body.id);
}
function deleteEmployee(body) {
  return updateEmployee({ ...body, status: '離職' });
}

/* ============================ 設定 ============================ */
function getSettings() {
  const sheet = getSheet(SHEET_SET);
  const rows = sheet.getDataRange().getValues();
  const s = Object.assign({}, DEFAULT_SETTINGS);
  const timeKeys = ['workStart', 'workEnd'];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0] || !s.hasOwnProperty(rows[i][0])) continue;
    s[rows[i][0]] = timeKeys.indexOf(rows[i][0]) !== -1 ? safeTimeText(rows[i][1], DEFAULT_SETTINGS[rows[i][0]]) : rows[i][1];
  }
  return s;
}
function updateSettings(body) {
  const sheet = getSheet(SHEET_SET);
  const rows = sheet.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < rows.length; i++) map[rows[i][0]] = i + 1;
  Object.keys(DEFAULT_SETTINGS).forEach(key => {
    if (body[key] === undefined) return;
    if (map[key]) sheet.getRange(map[key], 2).setValue(body[key]);
    else sheet.appendRow([key, body[key]]);
  });
  return { updated: true };
}

/* ============================ 打卡 ============================ */
function getSheet(name) {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
}
function todayStr() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
}
function nowStr() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');
}
function formatDistanceText(meters) {
  if (meters >= 1000) return (meters / 1000).toFixed(1) + '公里';
  return Math.round(meters) + '公尺';
}
function haversineMeters(lat1, lng1, lat2, lng2) {
  if (!lat1 || !lng1 || !lat2 || !lng2) return null;
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function findTodayRow(sheet, employeeId, date) {
  const rows = sheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (rows[i][1] === employeeId && safeDateOnlyText(rows[i][3]) === date) return i + 1;
  }
  return -1;
}
function getTodayStatus(employeeId) {
  const sheet = getSheet(SHEET_LOG);
  const rowIdx = findTodayRow(sheet, employeeId, todayStr());
  if (rowIdx === -1) return { clockedIn: false, clockedOut: false };
  const row = sheet.getRange(rowIdx, 1, 1, LOG_HEADERS.length).getValues()[0];
  return {
    clockedIn: !!row[4], clockedOut: !!row[8],
    checkInTime: safeDateTimeText(row[4]) || null, checkOutTime: safeDateTimeText(row[8]) || null,
    checkInStatus: row[7] || null, checkOutStatus: row[11] || null,
    outgoTime: safeDateTimeText(row[15]) || null, returnTime: safeDateTimeText(row[19]) || null
  };
}
function clockInOut(body, type) {
  const sess = validateSession(body.token);
  if (sess.role !== 'admin' && body.employeeId !== sess.employeeId) {
    throw new Error('無法為其他員工打卡');
  }
  const settings = getSettings();
  const sheet = getSheet(SHEET_LOG);
  const empSheet = getSheet(SHEET_EMP);
  const empRows = empSheet.getDataRange().getValues();
  let empName = '';
  for (let i = 1; i < empRows.length; i++) if (empRows[i][0] === body.employeeId) empName = empRows[i][1];
  if (!empName) throw new Error('找不到員工資料');

  const hasStoreCoord = settings.lat && settings.lng;
  const hasDeviceCoord = body.lat && body.lng;
  const dist = (hasStoreCoord && hasDeviceCoord) ? haversineMeters(Number(settings.lat), Number(settings.lng), Number(body.lat), Number(body.lng)) : null;
  const withinRange = dist === null ? true : dist <= Number(settings.radius || 200);
  const statusTag = !hasStoreCoord ? '未設定地理圍籬' : (!hasDeviceCoord ? '未取得定位資訊' : (withinRange ? '正常' : `超出範圍約${formatDistanceText(dist)}`));
  const now = nowStr();

  let rowIdx = findTodayRow(sheet, body.employeeId, todayStr());
  if (type === 'in') {
    if (rowIdx !== -1) {
      const existing = sheet.getRange(rowIdx, 5).getValue();
      if (existing) throw new Error('今天已經打過上班卡了 (' + safeDateTimeText(existing) + ')');
      sheet.getRange(rowIdx, 5, 1, 4).setValues([[now, body.lat || '', body.lng || '', statusTag]]);
      sheet.getRange(rowIdx, 13, 1, 3).setValues([[body.source || '', body.note || '', now]]);
    } else {
      const id = 'LOG' + new Date().getTime();
      sheet.appendRow([id, body.employeeId, empName, todayStr(), now, body.lat || '', body.lng || '', statusTag,
                        '', '', '', '', body.source || '', body.note || '', now]);
    }
  } else {
    if (rowIdx === -1 || !sheet.getRange(rowIdx, 5).getValue()) throw new Error('尚未打上班卡，無法打下班卡');
    const existingOut = sheet.getRange(rowIdx, 9).getValue();
    if (existingOut) throw new Error('今天已經打過下班卡了 (' + safeDateTimeText(existingOut) + ')');
    sheet.getRange(rowIdx, 9, 1, 4).setValues([[now, body.lat || '', body.lng || '', statusTag]]);
    sheet.getRange(rowIdx, 15).setValue(now);
  }
  return { time: now, distance: dist, withinRange, statusTag };
}

/* ============================ 紀錄查詢與補登 ============================ */
function getRecords(month, employeeId) {
  const sheet = getSheet(SHEET_LOG);
  const rows = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    if (month && safeDateOnlyText(r[3]).indexOf(month) !== 0) continue;
    if (employeeId && r[1] !== employeeId) continue;
    out.push(rowToRecord(r, i + 1));
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}
function rowToRecord(r, rowIndex) {
  return {
    rowIndex, id: r[0], employeeId: r[1], name: r[2], date: safeDateOnlyText(r[3]),
    checkIn: safeDateTimeText(r[4]), checkInLat: r[5], checkInLng: r[6], checkInStatus: r[7],
    checkOut: safeDateTimeText(r[8]), checkOutLat: r[9], checkOutLng: r[10], checkOutStatus: r[11],
    source: r[12], note: r[13], updatedAt: safeDateTimeText(r[14])
  };
}
function addManualRecord(body) {
  const sheet = getSheet(SHEET_LOG);
  const id = 'LOG' + new Date().getTime();
  sheet.appendRow([id, body.employeeId, body.name, body.date,
    body.checkIn || '', '', '', body.checkIn ? '管理員補登' : '',
    body.checkOut || '', '', '', body.checkOut ? '管理員補登' : '',
    'admin', body.note || '補登紀錄', nowStr()]);
  return { id };
}
function adjustRecord(body) {
  const sheet = getSheet(SHEET_LOG);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === body.id) {
      const rIdx = i + 1;
      if (body.checkIn !== undefined) sheet.getRange(rIdx, 5).setValue(body.checkIn);
      if (body.checkOut !== undefined) sheet.getRange(rIdx, 9).setValue(body.checkOut);
      if (body.note !== undefined) sheet.getRange(rIdx, 14).setValue(body.note);
      sheet.getRange(rIdx, 8).setValue('管理員修改');
      sheet.getRange(rIdx, 12).setValue('管理員修改');
      sheet.getRange(rIdx, 15).setValue(nowStr());
      return { updated: true };
    }
  }
  throw new Error('找不到紀錄：' + body.id);
}
function deleteRecord(body) {
  const sheet = getSheet(SHEET_LOG);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === body.id) { sheet.deleteRow(i + 1); return { deleted: true }; }
  }
  throw new Error('找不到紀錄：' + body.id);
}

/* ============================ 薪資紀錄 ============================ */
function getPayrollEntries(month) {
  const sheet = getSheet(SHEET_PAYROLL);
  const rows = sheet.getDataRange().getValues();
  const out = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0] || r[0] !== month) continue;
    out[r[1]] = {
      otWeekday134: Number(r[2]) || 0, otWeekday167: Number(r[3]) || 0, otRestDayHours: Number(r[4]) || 0,
      otHolidayHours: Number(r[5]) || 0, otMandatoryRestHours: Number(r[6]) || 0,
      festivalBonus: Number(r[7]) || 0, yearEndBonus: Number(r[8]) || 0, performanceBonus: Number(r[9]) || 0, otherBonus: Number(r[10]) || 0,
      personalLeave: Number(r[11]) || 0, sickLeave: Number(r[12]) || 0, disasterLeave: Number(r[13]) || 0, otherLeave: Number(r[14]) || 0,
      annualLeaveSettlement: Number(r[15]) || 0,
      businessExpense: Number(r[16]) || 0, salesPerformance: Number(r[17]) || 0, otherExpense26: Number(r[18]) || 0,
      salesBonus26: Number(r[19]) || 0, deduction26: Number(r[20]) || 0,
      otherDeduction: Number(r[21]) || 0, note: r[22] || '',
      menstrualLeave: Number(r[24]) || 0
    };
  }
  return out;
}
function savePayrollMonth(body) {
  const month = body.month;
  const entries = body.entries || {}; // { employeeId: {...fields} }
  const sheet = getSheet(SHEET_PAYROLL);
  const rows = sheet.getDataRange().getValues();
  const rowIndexByEmp = {};
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === month) rowIndexByEmp[rows[i][1]] = i + 1;
  }
  Object.keys(entries).forEach(empId => {
    const e = entries[empId] || {};
    const line = [month, empId,
      e.otWeekday134 || 0, e.otWeekday167 || 0, e.otRestDayHours || 0, e.otHolidayHours || 0, e.otMandatoryRestHours || 0,
      e.festivalBonus || 0, e.yearEndBonus || 0, e.performanceBonus || 0, e.otherBonus || 0,
      e.personalLeave || 0, e.sickLeave || 0, e.disasterLeave || 0, e.otherLeave || 0, e.annualLeaveSettlement || 0,
      e.businessExpense || 0, e.salesPerformance || 0, e.otherExpense26 || 0, e.salesBonus26 || 0, e.deduction26 || 0,
      e.otherDeduction || 0, e.note || '', nowStr(), e.menstrualLeave || 0];
    if (rowIndexByEmp[empId]) {
      sheet.getRange(rowIndexByEmp[empId], 1, 1, line.length).setValues([line]);
    } else {
      sheet.appendRow(line);
    }
  });
  return { saved: Object.keys(entries).length };
}

/* ============================ 國定假日／公司休假日 ============================ */
function getHolidays() {
  const sheet = getSheet(SHEET_HOLIDAY);
  const rows = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    const d = rows[i][0] instanceof Date ? Utilities.formatDate(rows[i][0], 'Asia/Taipei', 'yyyy-MM-dd') : String(rows[i][0]);
    out.push({ date: d, name: rows[i][1] || '', type: rows[i][2] || '國定假日' });
  }
  return out;
}
// 中華民國115年（西元2026年）政府行政機關辦公日曆表
// 資料來源：行政院人事行政總處 https://www.dgpa.gov.tw/information?uid=41&pid=12573
// ⚠️ 每年約6月底會公告次一年度日曆表，屆時請更新此份清單（或直接於「公司休假設定」手動增修）
const OFFICIAL_HOLIDAYS_2026 = [
  ['2026-01-01', '元旦'],
  ['2026-02-15', '小年夜'],
  ['2026-02-16', '除夕'],
  ['2026-02-17', '春節（初一）'],
  ['2026-02-18', '春節（初二）'],
  ['2026-02-19', '春節（初三）'],
  ['2026-02-20', '小年夜補假'],
  ['2026-02-27', '和平紀念日補假'],
  ['2026-02-28', '和平紀念日'],
  ['2026-04-03', '兒童節補假'],
  ['2026-04-04', '兒童節'],
  ['2026-04-05', '清明節'],
  ['2026-04-06', '清明節補假'],
  ['2026-05-01', '勞動節'],
  ['2026-06-19', '端午節'],
  ['2026-09-25', '中秋節'],
  ['2026-09-28', '教師節（孔子誕辰紀念日）'],
  ['2026-10-09', '國慶日補假'],
  ['2026-10-10', '國慶日'],
  ['2026-10-25', '台灣光復暨金門古寧頭大捷紀念日'],
  ['2026-10-26', '台灣光復暨金門古寧頭大捷紀念日補假'],
  ['2026-12-25', '行憲紀念日']
];
const OFFICIAL_HOLIDAYS_2027 = [
  ['2027-01-01', '開國紀念日（元旦）'],
  ['2027-02-04', '小年夜'],
  ['2027-02-05', '除夕'],
  ['2027-02-06', '春節（初一）'],
  ['2027-02-07', '春節（初二）'],
  ['2027-02-08', '春節（初三）'],
  ['2027-02-09', '春節初一、初二補假'],
  ['2027-02-10', '春節初一、初二補假'],
  ['2027-02-28', '和平紀念日'],
  ['2027-03-01', '和平紀念日補假'],
  ['2027-04-04', '兒童節'],
  ['2027-04-05', '清明節'],
  ['2027-04-06', '兒童節補假'],
  ['2027-04-30', '勞動節補假'],
  ['2027-05-01', '勞動節'],
  ['2027-06-09', '端午節'],
  ['2027-09-15', '中秋節'],
  ['2027-09-28', '教師節（孔子誕辰紀念日）'],
  ['2027-10-10', '國慶日'],
  ['2027-10-11', '國慶日補假'],
  ['2027-10-25', '台灣光復暨金門古寧頭大捷紀念日'],
  ['2027-12-24', '行憲紀念日補假'],
  ['2027-12-25', '行憲紀念日'],
  ['2027-12-31', '117年元旦補假（117年1/1逢週六）']
];
const OFFICIAL_HOLIDAYS_BY_YEAR = { '2026': OFFICIAL_HOLIDAYS_2026, '2027': OFFICIAL_HOLIDAYS_2027 };
function importOfficialHolidays(year) {
  const y = String(year);
  const list = OFFICIAL_HOLIDAYS_BY_YEAR[y];
  if (!list) throw new Error('目前系統內建的官方行事曆僅有 ' + Object.keys(OFFICIAL_HOLIDAYS_BY_YEAR).join('、') + ' 年度，其餘年度請至「公司休假設定」手動新增，或等行政院人事行政總處公告後再請開發者更新');
  const sheet = getSheet(SHEET_HOLIDAY);
  const existing = {};
  getHolidays().forEach(function (h) { existing[h.date] = true; });
  let added = 0, skipped = 0;
  list.forEach(function (item) {
    if (existing[item[0]]) { skipped++; return; }
    sheet.appendRow([item[0], item[1], '國定假日']);
    added++;
  });
  return { added: added, skipped: skipped, total: list.length };
}

function addHoliday(body) {
  const sheet = getSheet(SHEET_HOLIDAY);
  sheet.appendRow([body.date, body.name || '', body.type || '國定假日']);
  return { added: true };
}
function deleteHoliday(body) {
  const sheet = getSheet(SHEET_HOLIDAY);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const d = rows[i][0] instanceof Date ? Utilities.formatDate(rows[i][0], 'Asia/Taipei', 'yyyy-MM-dd') : String(rows[i][0]);
    if (d === body.date) { sheet.deleteRow(i + 1); return { deleted: true }; }
  }
  throw new Error('找不到該日期');
}

/* ============================ 月結彙總（出缺勤 → 時數，依員工班別計算） ============================ */
/* ============================ 例假日補假登記 ============================ */
function getMandatoryRestMakeups() {
  const sheet = getSheet(SHEET_REST_MAKEUP);
  const rows = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    out.push({
      employeeId: rows[i][0], workDate: formatDateCell(rows[i][1]),
      makeupDate: formatDateCell(rows[i][2]), registeredBy: rows[i][3] || '', registeredAt: formatDateTimeCell(rows[i][4])
    });
  }
  return out;
}
function registerMandatoryRestMakeup(body) {
  const sess = validateSession(body.token);
  if (!body.employeeId || !body.workDate) throw new Error('缺少必要資料');
  const sheet = getSheet(SHEET_REST_MAKEUP);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const wd = rows[i][1] instanceof Date ? Utilities.formatDate(rows[i][1], 'Asia/Taipei', 'yyyy-MM-dd') : String(rows[i][1]);
    if (rows[i][0] === body.employeeId && wd === body.workDate) {
      sheet.getRange(i + 1, 3, 1, 3).setValues([[body.makeupDate || '', sess.account || '', nowStr()]]);
      return { updated: true };
    }
  }
  sheet.appendRow([body.employeeId, body.workDate, body.makeupDate || '', sess.account || '', nowStr()]);
  return { added: true };
}

const MENSTRUAL_FULL_PAY_HOURS = 24; // 每年前3天(以8hr/天計)生理假全薪，勞基法第14條之1
// 計算某員工在指定月份「之前」（同一歷年，1/1起算）已使用的生理假時數
function getMenstrualLeaveUsedBeforeMonth(employeeId, month) {
  const year = month.slice(0, 4);
  const yearStart = year + '-01-01';
  const monthStart = month + '-01';
  const reqRows = getSheet(SHEET_REQUEST).getDataRange().getValues();
  let hours = 0;
  for (let i = 1; i < reqRows.length; i++) {
    const r = reqRows[i];
    if (r[1] !== '請假' || r[9] !== '已核准' || r[4] !== '生理假' || r[2] !== employeeId) continue;
    const start = formatDateTimeCell(r[5]).slice(0, 10);
    if (start >= yearStart && start < monthStart) hours += Number(r[7]) || 0;
  }
  return hours;
}
// 將本月生理假時數拆分為「全薪」與「半薪」兩部分
function splitMenstrualLeave(employeeId, month, thisMonthHours) {
  if (thisMonthHours <= 0) return { fullPayHours: 0, halfPayHours: 0 };
  const usedBefore = getMenstrualLeaveUsedBeforeMonth(employeeId, month);
  const remainingFullPay = Math.max(0, MENSTRUAL_FULL_PAY_HOURS - usedBefore);
  const fullPayHours = Math.min(thisMonthHours, remainingFullPay);
  return { fullPayHours: fullPayHours, halfPayHours: thisMonthHours - fullPayHours };
}
// 供員工請假時查詢：今年已使用生理假時數＋剩餘全薪額度
function getMyMenstrualLeaveStatus(token) {
  const sess = validateSession(token);
  if (!sess.employeeId) throw new Error('此帳號未綁定員工');
  const year = String(new Date().getFullYear());
  const reqRows = getSheet(SHEET_REQUEST).getDataRange().getValues();
  let usedThisYear = 0;
  const yearStart = year + '-01-01';
  const today = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  for (let i = 1; i < reqRows.length; i++) {
    const r = reqRows[i];
    if (r[1] !== '請假' || r[9] !== '已核准' || r[4] !== '生理假' || r[2] !== sess.employeeId) continue;
    const start = formatDateTimeCell(r[5]).slice(0, 10);
    if (start >= yearStart && start <= today) usedThisYear += Number(r[7]) || 0;
  }
  return { usedHours: usedThisYear, remainingFullPayHours: Math.max(0, MENSTRUAL_FULL_PAY_HOURS - usedThisYear) };
}

function getMonthlySummary(month) {
  const settings = getSettings();
  const holidayMap = {};
  getHolidays().forEach(h => { holidayMap[h.date] = h.type || '國定假日'; });
  const employees = getEmployees(true);
  const shiftMap = {}; getShifts().forEach(s => shiftMap[s.id] = s);
  const empScheduleMap = {};
  employees.forEach(e => {
    const shift = e.shiftId && shiftMap[e.shiftId] ? shiftMap[e.shiftId] : null;
    empScheduleMap[e.id] = {
      workStart: shift ? shift.workStart : settings.workStart,
      workEnd: shift ? shift.workEnd : settings.workEnd,
      lunchBreak: shift ? shift.lunchBreak : settings.lunchBreak
    };
  });
  const records = getRecords(month, null);
  const restDow = Number(settings.restDay);
  const mandatoryDow = Number(settings.mandatoryRestDay);

  const byEmp = {};
  records.forEach(r => {
    if (!r.checkIn || !r.checkOut) return;
    const key = r.employeeId;
    const sched = empScheduleMap[key] || { workStart: settings.workStart, workEnd: settings.workEnd, lunchBreak: settings.lunchBreak };
    const [ws, wsm] = String(sched.workStart).split(':').map(Number);
    const [we, wem] = String(sched.workEnd).split(':').map(Number);
    const standardMinutes = (we * 60 + wem) - (ws * 60 + wsm) - Number(sched.lunchBreak || 0);

    if (!byEmp[key]) byEmp[key] = {
      employeeId: r.employeeId, name: r.name, presentDays: 0,
      lateCount: 0, lateMinutes: 0, earlyLeaveCount: 0, earlyLeaveMinutes: 0,
      otWeekday134: 0, otWeekday167: 0, otRestDayHours: 0, otHolidayHours: 0, otMandatoryRestHours: 0,
      workedMinutesTotal: 0, flaggedDays: 0, mandatoryRestWarning: false, dailyOtExceedDays: [], mandatoryRestDates: []
    };
    const inD = new Date(r.checkIn.replace(' ', 'T'));
    const outD = new Date(r.checkOut.replace(' ', 'T'));
    if (isNaN(inD.getTime()) || isNaN(outD.getTime())) return;
    const dow = inD.getDay();
    const dateStr = r.date;
    let workedMinutes = (outD - inD) / 60000;
    const inMinOfDay = inD.getHours() * 60 + inD.getMinutes();
    const outMinOfDay = outD.getHours() * 60 + outD.getMinutes();
    if (inMinOfDay < 12 * 60 && outMinOfDay >= 13 * 60) workedMinutes -= Number(sched.lunchBreak || 0);
    workedMinutes = Math.max(0, workedMinutes);

    const e = byEmp[key];
    e.presentDays += 1;
    e.workedMinutesTotal += workedMinutes;
    if (String(r.checkInStatus).indexOf('超出範圍') === 0 || String(r.checkOutStatus).indexOf('超出範圍') === 0) e.flaggedDays += 1;

    const holidayType = holidayMap[dateStr]; // undefined | '國定假日' | '公司休假日'
    if (holidayType === '國定假日') {
      // 國定假日出勤：交由薪資系統依「加發一日工資＋超過8小時部分比照平日加班費率」計算
      e.otHolidayHours += workedMinutes / 60;
    } else if (dow === mandatoryDow) {
      // 例假日原則不可出勤，僅天災事變等特殊狀況例外（勞基法第40條），需人工確認並補休
      e.otMandatoryRestHours += workedMinutes / 60;
      e.mandatoryRestDates.push(dateStr);
    } else if (holidayType === '公司休假日' || dow === restDow) {
      // 休息日／公司自訂休假日出勤：依4/8/12小時級距（1.34/1.67/2.67倍）計算
      e.otRestDayHours += workedMinutes / 60;
    } else {
      const scheduledStart = new Date(inD); scheduledStart.setHours(ws, wsm, 0, 0);
      const scheduledEnd = new Date(inD); scheduledEnd.setHours(we, wem, 0, 0);
      const lateMin = Math.max(0, (inD - scheduledStart) / 60000 - Number(settings.lateGrace || 0));
      const earlyMin = Math.max(0, (scheduledEnd - outD) / 60000 - Number(settings.earlyGrace || 0));
      if (lateMin > 0) { e.lateCount += 1; e.lateMinutes += lateMin; }
      if (earlyMin > 0) { e.earlyLeaveCount += 1; e.earlyLeaveMinutes += earlyMin; }
      const overtimeMin = Math.max(0, workedMinutes - standardMinutes);
      e.otWeekday134 += Math.min(overtimeMin, 120) / 60;
      e.otWeekday167 += Math.max(0, overtimeMin - 120) / 60;
      if (overtimeMin > 240) { e.dailyOtExceedDays.push(dateStr); } // 平日單日加班超過4小時，法定上限提醒
    }
  });
  // 已核准的請假時數（依開始時間月份），對映到薪資扣款分類
  const leaveByEmp = {};
  const reqRows = getSheet(SHEET_REQUEST).getDataRange().getValues();
  for (let i = 1; i < reqRows.length; i++) {
    const r = reqRows[i];
    if (r[1] !== '請假' || r[9] !== '已核准') continue;
    const start = formatDateTimeCell(r[5]);
    if (String(start).indexOf(month) !== 0) continue;
    const empId = r[2];
    const hours = Number(r[7]) || 0;
    const lt = r[4];
    if (!leaveByEmp[empId]) leaveByEmp[empId] = { personalLeave: 0, sickLeave: 0, menstrualLeave: 0, disasterLeave: 0, paidLeave: 0 };
    if (lt === '事假' || lt === '家庭照顧假') leaveByEmp[empId].personalLeave += hours;
    else if (lt === '病假') leaveByEmp[empId].sickLeave += hours;
    else if (lt === '生理假') leaveByEmp[empId].menstrualLeave += hours;
    else if (lt === '災防假') leaveByEmp[empId].disasterLeave += hours;
    else leaveByEmp[empId].paidLeave += hours; // 特休/補休/婚/喪/公/公傷/產/產檢/陪產 等有薪假
    // 確保只有請假沒有打卡的員工也會出現在彙總
    if (!byEmp[empId]) {
      const empInfo = employees.find(x => x.id === empId);
      byEmp[empId] = {
        employeeId: empId, name: empInfo ? empInfo.name : r[3], presentDays: 0,
        lateCount: 0, lateMinutes: 0, earlyLeaveCount: 0, earlyLeaveMinutes: 0,
        otWeekday134: 0, otWeekday167: 0, otRestDayHours: 0, otHolidayHours: 0, otMandatoryRestHours: 0,
        workedMinutesTotal: 0, flaggedDays: 0, mandatoryRestWarning: false, dailyOtExceedDays: [], mandatoryRestDates: []
      };
    }
  }
  const exemptIds = {};
  employees.forEach(e => { if (e.exemptFromAttendance) exemptIds[e.id] = true; });
  const makeupSet = {}; // key: employeeId|workDate -> 補假日期是否已填
  getMandatoryRestMakeups().forEach(m => { makeupSet[m.employeeId + '|' + m.workDate] = !!m.makeupDate; });
  return Object.values(byEmp).filter(e => !exemptIds[e.employeeId]).map(e => {
    const unresolvedDates = e.mandatoryRestDates.filter(d => !makeupSet[e.employeeId + '|' + d]);
    return {
      ...e,
      lateMinutes: Math.round(e.lateMinutes), earlyLeaveMinutes: Math.round(e.earlyLeaveMinutes),
      otWeekday134: Math.round(e.otWeekday134 * 100) / 100, otWeekday167: Math.round(e.otWeekday167 * 100) / 100,
      otRestDayHours: Math.round(e.otRestDayHours * 100) / 100, otHolidayHours: Math.round(e.otHolidayHours * 100) / 100,
      otMandatoryRestHours: Math.round(e.otMandatoryRestHours * 100) / 100,
      monthlyOtHours: Math.round((e.otWeekday134 + e.otWeekday167) * 100) / 100,
      otCapExceeded: (e.otWeekday134 + e.otWeekday167) > Number(settings.monthlyOtCap || 46),
      dailyOtExceedDays: e.dailyOtExceedDays,
      dailyOtWarning: e.dailyOtExceedDays.length > 0,
      mandatoryRestDates: e.mandatoryRestDates,
      mandatoryRestUnresolvedDates: unresolvedDates,
      mandatoryRestWarning: unresolvedDates.length > 0,
      workedHoursTotal: Math.round(e.workedMinutesTotal / 60 * 100) / 100,
      personalLeave: leaveByEmp[e.employeeId] ? Math.round(leaveByEmp[e.employeeId].personalLeave * 100) / 100 : 0,
      sickLeave: leaveByEmp[e.employeeId] ? Math.round(leaveByEmp[e.employeeId].sickLeave * 100) / 100 : 0,
      menstrualLeave: leaveByEmp[e.employeeId] ? Math.round(leaveByEmp[e.employeeId].menstrualLeave * 100) / 100 : 0,
      menstrualLeaveUsedBefore: Math.round(getMenstrualLeaveUsedBeforeMonth(e.employeeId, month) * 100) / 100,
      disasterLeave: leaveByEmp[e.employeeId] ? Math.round(leaveByEmp[e.employeeId].disasterLeave * 100) / 100 : 0,
      paidLeave: leaveByEmp[e.employeeId] ? Math.round(leaveByEmp[e.employeeId].paidLeave * 100) / 100 : 0
    };
  });
}

/* ============================ 薪資印領清冊(全年度,依公司分組) ============================ */
function getAnnualPayrollRegister(year) {
  const employees = getEmployees(true);
  const settings = getSettings();
  const sheet = getSheet(SHEET_PAYROLL);
  const rows = sheet.getDataRange().getValues();
  const entriesByEmpMonth = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0] || String(r[0]).indexOf(String(year)) !== 0) continue;
    entriesByEmpMonth[r[1] + '|' + r[0]] = {
      otWeekday134: Number(r[2]) || 0, otWeekday167: Number(r[3]) || 0, otRestDayHours: Number(r[4]) || 0,
      otHolidayHours: Number(r[5]) || 0, otMandatoryRestHours: Number(r[6]) || 0,
      festivalBonus: Number(r[7]) || 0, yearEndBonus: Number(r[8]) || 0, performanceBonus: Number(r[9]) || 0, otherBonus: Number(r[10]) || 0,
      personalLeave: Number(r[11]) || 0, sickLeave: Number(r[12]) || 0, disasterLeave: Number(r[13]) || 0, otherLeave: Number(r[14]) || 0,
      annualLeaveSettlement: Number(r[15]) || 0,
      businessExpense: Number(r[16]) || 0, salesPerformance: Number(r[17]) || 0, otherExpense26: Number(r[18]) || 0,
      salesBonus26: Number(r[19]) || 0, deduction26: Number(r[20]) || 0,
      otherDeduction: Number(r[21]) || 0, note: r[22] || '',
      menstrualLeave: Number(r[24]) || 0
    };
  }
  const byCompany = {};
  employees.forEach(function (emp) {
    const monthly = [];
    for (let m = 1; m <= 12; m++) {
      const monthStr = year + '-' + String(m).padStart(2, '0');
      const entry = entriesByEmpMonth[emp.id + '|' + monthStr] || emptyPayrollEntry();
      const calc = calcPayrollForEmployee(emp, entry, settings, monthStr);
      monthly.push({
        month: monthStr, base: Number(emp.baseSalary) || 0,
        mealAllowance: Number(emp.mealAllowance) || 0, transportAllowance: Number(emp.transportAllowance) || 0,
        positionAllowance: Number(emp.positionAllowance) || 0, fullAttendanceBonus: Number(emp.fullAttendanceBonus) || 0,
        overtimePay: Math.round(calc.overtimePay), bonusTotal: Math.round(calc.bonusTotal),
        annualLeaveSettlement: Number(entry.annualLeaveSettlement || 0),
        payableTotal: Math.round(calc.payableTotal), laborFee: calc.laborFee, healthFee: calc.healthFee,
        leaveDeduct: Math.round(calc.leaveDeduct), otherDeduction: Number(entry.otherDeduction || 0), deductTotal: Math.round(calc.deductTotal),
        netPay: Math.round(calc.grandTotal)
      });
    }
    const yearTotal = monthly.reduce(function (acc, mo) {
      acc.base += mo.base; acc.mealAllowance += mo.mealAllowance; acc.transportAllowance += mo.transportAllowance;
      acc.positionAllowance += mo.positionAllowance; acc.fullAttendanceBonus += mo.fullAttendanceBonus;
      acc.overtimePay += mo.overtimePay; acc.bonusTotal += mo.bonusTotal; acc.annualLeaveSettlement += mo.annualLeaveSettlement;
      acc.payableTotal += mo.payableTotal; acc.laborFee += mo.laborFee; acc.healthFee += mo.healthFee;
      acc.leaveDeduct += mo.leaveDeduct; acc.otherDeduction += mo.otherDeduction; acc.deductTotal += mo.deductTotal;
      acc.netPay += mo.netPay;
      return acc;
    }, { base: 0, mealAllowance: 0, transportAllowance: 0, positionAllowance: 0, fullAttendanceBonus: 0, overtimePay: 0, bonusTotal: 0, annualLeaveSettlement: 0, payableTotal: 0, laborFee: 0, healthFee: 0, leaveDeduct: 0, otherDeduction: 0, deductTotal: 0, netPay: 0 });
    const key = emp.company || '其他';
    if (!byCompany[key]) byCompany[key] = [];
    byCompany[key].push({ employeeId: emp.id, name: emp.name, department: emp.department, nationalId: emp.nationalId || '', householdAddress: emp.householdAddress || '', monthly: monthly, yearTotal: yearTotal });
  });
  return byCompany;
}

function exportForPayroll(month) {
  const summary = getMonthlySummary(month);
  return {
    month,
    employees: summary.map(e => {
      const notes = [];
      if (e.flaggedDays > 0) notes.push(`${e.flaggedDays}天定位超出範圍`);
      if (e.otCapExceeded) notes.push(`平日加班已達${e.monthlyOtHours}小時，超過月上限請確認合法性`);
      if (e.mandatoryRestWarning) notes.push('有例假日出勤紀錄，請確認屬天災/突發狀況並已完成補休申報');
      return {
        name: e.name, employeeId: e.employeeId,
        otWeekday134: e.otWeekday134, otWeekday167: e.otWeekday167,
        otRestDayHours: e.otRestDayHours, otHolidayHours: e.otHolidayHours, otMandatoryRestHours: e.otMandatoryRestHours,
        note: notes.join('；')
      };
    })
  };
}

/* ============================ 外出／返回打卡 ============================ */
function clockOutgoReturn(body, kind) {
  const sess = validateSession(body.token);
  if (sess.role !== 'admin' && body.employeeId !== sess.employeeId) throw new Error('無法為其他員工打卡');
  const settings = getSettings();
  const sheet = getSheet(SHEET_LOG);
  const rowIdx = findTodayRow(sheet, body.employeeId, todayStr());
  if (rowIdx === -1 || !sheet.getRange(rowIdx, 5).getValue()) throw new Error('尚未打上班卡');
  if (sheet.getRange(rowIdx, 9).getValue()) throw new Error('已打下班卡，無法再記錄外出/返回');

  const hasStoreCoord = settings.lat && settings.lng;
  const hasDeviceCoord = body.lat && body.lng;
  const dist = (hasStoreCoord && hasDeviceCoord) ? haversineMeters(Number(settings.lat), Number(settings.lng), Number(body.lat), Number(body.lng)) : null;
  const withinRange = dist === null ? true : dist <= Number(settings.radius || 200);
  const statusTag = !hasStoreCoord ? '未設定地理圍籬' : (!hasDeviceCoord ? '未取得定位資訊' : (withinRange ? '正常' : `超出範圍約${formatDistanceText(dist)}`));
  const now = nowStr();

  if (kind === 'outgo') {
    if (sheet.getRange(rowIdx, 16).getValue()) throw new Error('今天已記錄過外出 (' + safeDateTimeText(sheet.getRange(rowIdx, 16).getValue()) + ')');
    sheet.getRange(rowIdx, 16, 1, 4).setValues([[now, body.lat || '', body.lng || '', statusTag]]);
  } else {
    if (!sheet.getRange(rowIdx, 16).getValue()) throw new Error('尚未記錄外出，無法記錄返回');
    if (sheet.getRange(rowIdx, 20).getValue()) throw new Error('今天已記錄過返回 (' + safeDateTimeText(sheet.getRange(rowIdx, 20).getValue()) + ')');
    sheet.getRange(rowIdx, 20, 1, 4).setValues([[now, body.lat || '', body.lng || '', statusTag]]);
  }
  sheet.getRange(rowIdx, 15).setValue(now);
  return { time: now, statusTag: statusTag };
}

/* ============================ 申請單（請假／加班換補休） ============================ */
function requestRowToObj(r) {
  return {
    id: r[0], type: r[1], employeeId: r[2], name: r[3], leaveType: r[4] || '',
    startTime: formatDateTimeCell(r[5]), endTime: formatDateTimeCell(r[6]), hours: Number(r[7]) || 0,
    reason: r[8] || '', status: r[9] || '待審核', reviewer: r[10] || '', reviewComment: r[11] || '',
    createdAt: formatDateTimeCell(r[12]), reviewedAt: formatDateTimeCell(r[13]),
    delegateId: r[14] || '', delegateName: r[15] || ''
  };
}
function formatDateTimeCell(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Taipei', 'yyyy-MM-dd HH:mm');
  return String(v);
}
function submitRequest(body) {
  const sess = validateSession(body.token);
  const employeeId = (sess.role === 'admin' && body.employeeId) ? body.employeeId : sess.employeeId;
  if (!employeeId) throw new Error('此帳號未綁定員工，無法申請');
  const emp = getEmployees(true).find(e => e.id === employeeId);
  if (!emp) throw new Error('找不到員工資料');
  const type = body.type; // 請假 / 換補休
  const hours = Number(body.hours) || 0;
  if (hours <= 0) throw new Error('時數必須大於 0');
  const settings = getSettings();
  const unit = Number(settings.leaveUnit) || 1;
  if (Math.round((hours / unit) * 100) % 100 !== 0) throw new Error('時數必須是 ' + unit + ' 小時的倍數');

  if (type === '請假') {
    if (LEAVE_TYPES.indexOf(body.leaveType) === -1) throw new Error('請選擇假別');
    if (!body.startTime || !body.endTime) throw new Error('請填寫起訖時間');
    const balances = calcBalances(employeeId);
    if (body.leaveType === '特休' && hours > balances.annualRemain) {
      throw new Error('特休剩餘 ' + balances.annualRemain + ' 小時，不足本次申請的 ' + hours + ' 小時');
    }
    if (body.leaveType === '補休' && hours > balances.compRemain) {
      throw new Error('補休剩餘 ' + balances.compRemain + ' 小時，不足本次申請的 ' + hours + ' 小時');
    }
  } else if (type === '換補休') {
    if (!body.startTime) throw new Error('請填寫加班日期');
  } else {
    throw new Error('未知的申請類型');
  }

  const id = 'REQ' + new Date().getTime();
  let delegateName = '';
  if (body.delegateId) {
    const delegate = getEmployees(true).find(e => e.id === body.delegateId);
    delegateName = delegate ? delegate.name : '';
  }
  getSheet(SHEET_REQUEST).appendRow([id, type, employeeId, emp.name, body.leaveType || '',
    body.startTime || '', body.endTime || '', hours, body.reason || '',
    '待審核', '', '', nowStr(), '', body.delegateId || '', delegateName]);
  return { id: id };
}
function cancelRequest(body) {
  const sess = validateSession(body.token);
  const sheet = getSheet(SHEET_REQUEST);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] !== body.id) continue;
    if (sess.role !== 'admin' && rows[i][2] !== sess.employeeId) throw new Error('只能取消自己的申請');
    if (rows[i][9] !== '待審核') throw new Error('此申請已審核，無法取消');
    sheet.getRange(i + 1, 10).setValue('已取消');
    sheet.getRange(i + 1, 14).setValue(nowStr());
    return { cancelled: true };
  }
  throw new Error('找不到申請單');
}
function myManagedEmployeeIds(sess) {
  // 回傳此登入者擔任主管的部門底下所有員工ID
  if (!sess.employeeId) return [];
  const deptIds = getDepartments().filter(d => d.managerId === sess.employeeId).map(d => d.id);
  if (deptIds.length === 0) return [];
  return getEmployees(true).filter(e => deptIds.indexOf(e.departmentId) !== -1).map(e => e.id);
}
function canReview(sess, employeeId) {
  if (sess.role === 'admin') return true;
  return myManagedEmployeeIds(sess).indexOf(employeeId) !== -1;
}
function reviewerName(sess) {
  if (sess.role === 'admin') return '管理者';
  const emp = getEmployees(true).find(e => e.id === sess.employeeId);
  return emp ? emp.name : '主管';
}
function approveRequest(body) {
  const sess = validateSession(body.token);
  const sheet = getSheet(SHEET_REQUEST);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] !== body.id) continue;
    const req = requestRowToObj(rows[i]);
    if (req.status !== '待審核') throw new Error('此申請已處理過');
    if (!canReview(sess, req.employeeId)) throw new Error('您沒有審核此申請的權限');
    if (sess.employeeId && sess.employeeId === req.employeeId && sess.role !== 'admin') throw new Error('不能審核自己的申請');

    sheet.getRange(i + 1, 10, 1, 2).setValues([['已核准', reviewerName(sess)]]);
    sheet.getRange(i + 1, 12).setValue(body.comment || '');
    sheet.getRange(i + 1, 14).setValue(nowStr());

    // 核准後的補休額度異動
    const settings = getSettings();
    if (req.type === '換補休') {
      const months = Number(settings.compTimeExpireMonths) || 6;
      const expire = new Date(); expire.setMonth(expire.getMonth() + months);
      getSheet(SHEET_COMP).appendRow(['CMP' + new Date().getTime(), req.employeeId, '加班轉入', req.hours,
        '加班日期 ' + req.startTime + '（單號 ' + req.id + '）',
        Utilities.formatDate(expire, 'Asia/Taipei', 'yyyy-MM-dd'), nowStr()]);
    }
    if (req.type === '請假' && req.leaveType === '補休') {
      getSheet(SHEET_COMP).appendRow(['CMP' + new Date().getTime(), req.employeeId, '請假使用', -req.hours,
        '補休假單 ' + req.id, '', nowStr()]);
    }
    return { approved: true };
  }
  throw new Error('找不到申請單');
}
function rejectRequest(body) {
  const sess = validateSession(body.token);
  const sheet = getSheet(SHEET_REQUEST);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] !== body.id) continue;
    const req = requestRowToObj(rows[i]);
    if (req.status !== '待審核') throw new Error('此申請已處理過');
    if (!canReview(sess, req.employeeId)) throw new Error('您沒有審核此申請的權限');
    sheet.getRange(i + 1, 10, 1, 2).setValues([['已駁回', reviewerName(sess)]]);
    sheet.getRange(i + 1, 12).setValue(body.comment || '');
    sheet.getRange(i + 1, 14).setValue(nowStr());
    return { rejected: true };
  }
  throw new Error('找不到申請單');
}
function listMyRequests(token) {
  const sess = validateSession(token);
  if (!sess.employeeId) return [];
  const rows = getSheet(SHEET_REQUEST).getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0] || rows[i][2] !== sess.employeeId) continue;
    out.push(requestRowToObj(rows[i]));
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 60);
}
function listPendingApprovals(token) {
  const sess = validateSession(token);
  const managed = sess.role === 'admin' ? null : myManagedEmployeeIds(sess);
  if (managed !== null && managed.length === 0) return [];
  const rows = getSheet(SHEET_REQUEST).getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0] || rows[i][9] !== '待審核') continue;
    if (managed !== null && managed.indexOf(rows[i][2]) === -1) continue;
    if (sess.role !== 'admin' && rows[i][2] === sess.employeeId) continue; // 自己的單不列入待審
    out.push(requestRowToObj(rows[i]));
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
function listAllRequests(month, status) {
  const rows = getSheet(SHEET_REQUEST).getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    const req = requestRowToObj(rows[i]);
    if (month && String(req.startTime).indexOf(month) !== 0 && String(req.createdAt).indexOf(month) !== 0) continue;
    if (status && req.status !== status) continue;
    out.push(req);
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/* ============================ 特休核定與額度查詢 ============================ */
/* ============================ 特休天數試算（依勞動基準法第38條，參考勞動部試算系統邏輯） ============================ */
// ⚠️ 僅供系統試算參考，正式天數仍請以勞動部官方試算系統或人資顧問確認：
//    https://calcr2.mol.gov.tw/RestDays
function leaveDaysByMonths(m) {
  if (m < 6) return 0;
  if (m < 12) return 3;
  const n = Math.floor(m / 12);
  if (n === 1) return 7;
  if (n === 2) return 10;
  if (n === 3 || n === 4) return 14;
  if (n >= 5 && n <= 9) return 15;
  if (n >= 10) return Math.min(30, n + 6);
  return 0;
}
function monthsBetween(from, to) {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}
function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}
function daysInYear(y) {
  return isLeapYear(y) ? 366 : 365;
}
// 週年制：以到職日為週期起點，回傳指定日期當下的特休天數
function calcAnnualLeaveAnniversary(hireDate, atDate) {
  const m = monthsBetween(hireDate, atDate);
  return leaveDaysByMonths(m);
}
// 歷年制：以每年1/1~12/31為週期，該年度橫跨到職紀念日前後兩個年資級距，依在職天數比例加權平均
function calcAnnualLeaveCalendarYear(hireDate, year) {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  const totalDays = daysInYear(year);

  if (hireDate > yearEnd) return 0; // 該年度尚未到職
  const effectiveStart = hireDate > yearStart ? hireDate : yearStart;

  if (hireDate.getFullYear() === year) {
    // 到職當年度：以「滿一年應有天數」按在職天數比例分配
    const workedDays = Math.floor((yearEnd - effectiveStart) / 86400000) + 1;
    const days = 7 * (workedDays / totalDays);
    return Math.round(days * 2) / 2; // 四捨五入至0.5天
  }

  // 非到職當年度：找出該年度內的到職紀念日，分段加權平均
  const anniv = new Date(year, hireDate.getMonth(), hireDate.getDate());
  if (anniv < yearStart || anniv > yearEnd) {
    // 保險判斷（正常不會發生），直接用年初的年資級距
    return calcAnnualLeaveAnniversary(hireDate, yearStart);
  }
  const beforeDays = Math.floor((anniv - yearStart) / 86400000); // 紀念日之前的天數（不含紀念日當天）
  const afterDays = totalDays - beforeDays; // 紀念日（含）之後的天數

  const beforeLeave = calcAnnualLeaveAnniversary(hireDate, new Date(anniv.getTime() - 86400000));
  const afterLeave = calcAnnualLeaveAnniversary(hireDate, anniv);

  const days = beforeLeave * (beforeDays / totalDays) + afterLeave * (afterDays / totalDays);
  return Math.round(days * 2) / 2;
}
function estimateAnnualLeave(employeeId, year, system) {
  const emp = getEmployees(true).find(function (e) { return e.id === employeeId; });
  if (!emp) throw new Error('找不到員工資料');
  if (!emp.hireDate) throw new Error('此員工尚未設定到職日，請先於員工資料補上');
  const hireDate = new Date(emp.hireDate + 'T00:00:00');
  const y = Number(year) || new Date().getFullYear();
  let days;
  if (system === 'calendar') {
    days = calcAnnualLeaveCalendarYear(hireDate, y);
  } else {
    days = calcAnnualLeaveAnniversary(hireDate, new Date(y, 11, 31));
  }
  return { days: days, hours: Math.round(days * 8 * 100) / 100, system: system || 'anniversary' };
}

function batchEstimateAnnualLeave(year, system) {
  const employees = getEmployees(true).filter(function (e) { return e.status === '在職'; });
  const y = Number(year) || new Date().getFullYear();
  const out = [];
  employees.forEach(function (emp) {
    if (!emp.hireDate) { out.push({ employeeId: emp.id, name: emp.name, days: null, hours: null, error: '未設定到職日' }); return; }
    const hireDate = new Date(emp.hireDate + 'T00:00:00');
    let days;
    if (system === 'calendar') days = calcAnnualLeaveCalendarYear(hireDate, y);
    else days = calcAnnualLeaveAnniversary(hireDate, new Date(y, 11, 31));
    out.push({ employeeId: emp.id, name: emp.name, days: days, hours: Math.round(days * 8 * 100) / 100, error: '' });
  });
  return out;
}
function batchSaveAnnualLeave(body) {
  const year = String(body.year);
  const items = body.items || []; // [{employeeId, hours}]
  const sheet = getSheet(SHEET_ANNUAL);
  const rows = sheet.getDataRange().getValues();
  const rowIndexByEmp = {};
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][1]) === year) rowIndexByEmp[rows[i][0]] = i + 1;
  }
  let saved = 0;
  items.forEach(function (item) {
    if (item.hours === null || item.hours === undefined) return;
    if (rowIndexByEmp[item.employeeId]) {
      sheet.getRange(rowIndexByEmp[item.employeeId], 3, 1, 3).setValues([[Number(item.hours) || 0, '批次試算帶入', nowStr()]]);
    } else {
      sheet.appendRow([item.employeeId, year, Number(item.hours) || 0, '批次試算帶入', nowStr()]);
    }
    saved++;
  });
  return { saved: saved };
}

function setAnnualLeave(body) {
  const sheet = getSheet(SHEET_ANNUAL);
  const rows = sheet.getDataRange().getValues();
  const year = String(body.year);
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === body.employeeId && String(rows[i][1]) === year) {
      sheet.getRange(i + 1, 3, 1, 3).setValues([[Number(body.hours) || 0, body.note || '', nowStr()]]);
      return { updated: true };
    }
  }
  sheet.appendRow([body.employeeId, year, Number(body.hours) || 0, body.note || '', nowStr()]);
  return { added: true };
}
function getAnnualLeaveList(year) {
  const y = String(year || new Date().getFullYear());
  const rows = getSheet(SHEET_ANNUAL).getDataRange().getValues();
  const granted = {};
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][1]) === y && rows[i][0]) granted[rows[i][0]] = { hours: Number(rows[i][2]) || 0, note: rows[i][3] || '' };
  }
  // 已用：當年度已核准的特休單
  const reqRows = getSheet(SHEET_REQUEST).getDataRange().getValues();
  const used = {};
  for (let i = 1; i < reqRows.length; i++) {
    const r = reqRows[i];
    if (r[1] === '請假' && r[4] === '特休' && r[9] === '已核准' && String(formatDateTimeCell(r[5])).indexOf(y) === 0) {
      used[r[2]] = (used[r[2]] || 0) + (Number(r[7]) || 0);
    }
  }
  return { year: y, granted: granted, used: used };
}
function calcBalances(employeeId) {
  const y = String(new Date().getFullYear());
  const annual = getAnnualLeaveList(y);
  const grantedH = annual.granted[employeeId] ? annual.granted[employeeId].hours : 0;
  const usedH = annual.used[employeeId] || 0;
  // 補休餘額 = 額度表加總（加班轉入為正、請假使用為負）
  const compRows = getSheet(SHEET_COMP).getDataRange().getValues();
  let comp = 0;
  let nearestExpire = '';
  for (let i = 1; i < compRows.length; i++) {
    if (compRows[i][1] !== employeeId) continue;
    comp += Number(compRows[i][3]) || 0;
    const exp = compRows[i][5] ? (compRows[i][5] instanceof Date ? Utilities.formatDate(compRows[i][5], 'Asia/Taipei', 'yyyy-MM-dd') : String(compRows[i][5])) : '';
    if (exp && (!nearestExpire || exp < nearestExpire) && (Number(compRows[i][3]) || 0) > 0) nearestExpire = exp;
  }
  return {
    annualGranted: grantedH, annualUsed: usedH, annualRemain: Math.max(0, grantedH - usedH),
    compRemain: Math.round(comp * 100) / 100, compNearestExpire: nearestExpire
  };
}
function getLeaveBalances(token, employeeId) {
  const sess = validateSession(token);
  const target = (sess.role === 'admin' && employeeId) ? employeeId : sess.employeeId;
  if (!target) throw new Error('此帳號未綁定員工');
  return calcBalances(target);
}

/* ============================ 公告 ============================ */
function announceRowToObj(r) {
  return {
    id: r[0], title: r[1], content: r[2], companyId: r[3] || '', pinned: !!r[4],
    author: r[5] || '', status: r[6] || '已發布', createdAt: formatDateTimeCell(r[7]), updatedAt: formatDateTimeCell(r[8])
  };
}
function getAnnouncements() {
  const rows = getSheet(SHEET_ANNOUNCE).getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0] || rows[i][6] !== '已發布') continue;
    out.push(announceRowToObj(rows[i]));
  }
  return out.sort((a, b) => (b.pinned - a.pinned) || b.createdAt.localeCompare(a.createdAt));
}
function getAnnouncementsAdmin() {
  const rows = getSheet(SHEET_ANNOUNCE).getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    out.push(announceRowToObj(rows[i]));
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
function addAnnouncement(body) {
  const sess = validateSession(body.token);
  const id = 'ANN' + new Date().getTime();
  getSheet(SHEET_ANNOUNCE).appendRow([id, body.title || '', body.content || '', body.companyId || '',
    body.pinned ? 1 : 0, reviewerName(sess), body.status || '已發布', nowStr(), nowStr()]);
  return { id: id };
}
function updateAnnouncement(body) {
  const sheet = getSheet(SHEET_ANNOUNCE);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === body.id) {
      sheet.getRange(i + 1, 2, 1, 7).setValues([[body.title || '', body.content || '', body.companyId || '',
        body.pinned ? 1 : 0, rows[i][5], body.status || '已發布', nowStr()]]);
      return { updated: true };
    }
  }
  throw new Error('找不到公告');
}
function deleteAnnouncement(body) {
  const sheet = getSheet(SHEET_ANNOUNCE);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === body.id) { sheet.deleteRow(i + 1); return { deleted: true }; }
  }
  throw new Error('找不到公告');
}

/* ============================ 薪資計算引擎（供員工查詢自己的薪資條使用） ============================ */
const INSURANCE_TABLE = [{"grade": 1500, "compLabor": 972, "compHealth": 1384, "compOccu": 60, "compPension": 90, "compTotal": 2506, "empLabor": 277, "empHealth": 443, "empTotal": 720}, {"grade": 3000, "compLabor": 972, "compHealth": 1384, "compOccu": 60, "compPension": 180, "compTotal": 2596, "empLabor": 277, "empHealth": 443, "empTotal": 720}, {"grade": 4500, "compLabor": 972, "compHealth": 1384, "compOccu": 60, "compPension": 270, "compTotal": 2686, "empLabor": 277, "empHealth": 443, "empTotal": 720}, {"grade": 6000, "compLabor": 972, "compHealth": 1384, "compOccu": 60, "compPension": 360, "compTotal": 2776, "empLabor": 277, "empHealth": 443, "empTotal": 720}, {"grade": 7500, "compLabor": 972, "compHealth": 1384, "compOccu": 60, "compPension": 450, "compTotal": 2866, "empLabor": 277, "empHealth": 443, "empTotal": 720}, {"grade": 8700, "compLabor": 972, "compHealth": 1384, "compOccu": 60, "compPension": 522, "compTotal": 2938, "empLabor": 277, "empHealth": 443, "empTotal": 720}, {"grade": 9900, "compLabor": 972, "compHealth": 1384, "compOccu": 60, "compPension": 594, "compTotal": 3010, "empLabor": 277, "empHealth": 443, "empTotal": 720}, {"grade": 11100, "compLabor": 972, "compHealth": 1384, "compOccu": 60, "compPension": 666, "compTotal": 3082, "empLabor": 277, "empHealth": 443, "empTotal": 720}, {"grade": 12540, "compLabor": 1097, "compHealth": 1384, "compOccu": 60, "compPension": 752, "compTotal": 3293, "empLabor": 313, "empHealth": 443, "empTotal": 756}, {"grade": 13500, "compLabor": 1182, "compHealth": 1384, "compOccu": 60, "compPension": 810, "compTotal": 3436, "empLabor": 338, "empHealth": 443, "empTotal": 781}, {"grade": 15840, "compLabor": 1386, "compHealth": 1384, "compOccu": 60, "compPension": 950, "compTotal": 3780, "empLabor": 396, "empHealth": 443, "empTotal": 839}, {"grade": 16500, "compLabor": 1444, "compHealth": 1384, "compOccu": 60, "compPension": 990, "compTotal": 3878, "empLabor": 413, "empHealth": 443, "empTotal": 856}, {"grade": 17280, "compLabor": 1512, "compHealth": 1384, "compOccu": 60, "compPension": 1037, "compTotal": 3993, "empLabor": 432, "empHealth": 443, "empTotal": 875}, {"grade": 17880, "compLabor": 1564, "compHealth": 1384, "compOccu": 60, "compPension": 1073, "compTotal": 4081, "empLabor": 447, "empHealth": 443, "empTotal": 890}, {"grade": 19047, "compLabor": 1666, "compHealth": 1384, "compOccu": 60, "compPension": 1143, "compTotal": 4253, "empLabor": 476, "empHealth": 443, "empTotal": 919}, {"grade": 20008, "compLabor": 1751, "compHealth": 1384, "compOccu": 60, "compPension": 1200, "compTotal": 4395, "empLabor": 500, "empHealth": 443, "empTotal": 943}, {"grade": 21009, "compLabor": 1838, "compHealth": 1384, "compOccu": 60, "compPension": 1261, "compTotal": 4543, "empLabor": 525, "empHealth": 443, "empTotal": 968}, {"grade": 22000, "compLabor": 1925, "compHealth": 1384, "compOccu": 60, "compPension": 1320, "compTotal": 4689, "empLabor": 550, "empHealth": 443, "empTotal": 993}, {"grade": 23100, "compLabor": 2022, "compHealth": 1384, "compOccu": 60, "compPension": 1386, "compTotal": 4852, "empLabor": 577, "empHealth": 443, "empTotal": 1020}, {"grade": 24000, "compLabor": 2100, "compHealth": 1384, "compOccu": 60, "compPension": 1440, "compTotal": 4984, "empLabor": 600, "empHealth": 443, "empTotal": 1043}, {"grade": 25250, "compLabor": 2210, "compHealth": 1384, "compOccu": 60, "compPension": 1515, "compTotal": 5169, "empLabor": 632, "empHealth": 443, "empTotal": 1075}, {"grade": 26400, "compLabor": 2310, "compHealth": 1384, "compOccu": 60, "compPension": 1584, "compTotal": 5338, "empLabor": 660, "empHealth": 443, "empTotal": 1103}, {"grade": 27600, "compLabor": 2415, "compHealth": 1384, "compOccu": 60, "compPension": 1656, "compTotal": 5515, "empLabor": 690, "empHealth": 443, "empTotal": 1133}, {"grade": 29500, "compLabor": 2581, "compHealth": 1428, "compOccu": 62, "compPension": 1770, "compTotal": 5841, "empLabor": 738, "empHealth": 458, "empTotal": 1196}, {"grade": 30300, "compLabor": 2651, "compHealth": 1466, "compOccu": 64, "compPension": 1818, "compTotal": 5999, "empLabor": 758, "empHealth": 470, "empTotal": 1228}, {"grade": 31800, "compLabor": 2783, "compHealth": 1539, "compOccu": 67, "compPension": 1908, "compTotal": 6297, "empLabor": 795, "empHealth": 493, "empTotal": 1288}, {"grade": 33300, "compLabor": 2914, "compHealth": 1611, "compOccu": 70, "compPension": 1998, "compTotal": 6593, "empLabor": 833, "empHealth": 516, "empTotal": 1349}, {"grade": 34800, "compLabor": 3045, "compHealth": 1684, "compOccu": 73, "compPension": 2088, "compTotal": 6890, "empLabor": 870, "empHealth": 540, "empTotal": 1410}, {"grade": 36300, "compLabor": 3176, "compHealth": 1757, "compOccu": 76, "compPension": 2178, "compTotal": 7187, "empLabor": 908, "empHealth": 563, "empTotal": 1471}, {"grade": 38200, "compLabor": 3342, "compHealth": 1849, "compOccu": 80, "compPension": 2292, "compTotal": 7563, "empLabor": 955, "empHealth": 592, "empTotal": 1547}, {"grade": 40100, "compLabor": 3509, "compHealth": 1940, "compOccu": 84, "compPension": 2406, "compTotal": 7939, "empLabor": 1002, "empHealth": 622, "empTotal": 1624}, {"grade": 42000, "compLabor": 3675, "compHealth": 2032, "compOccu": 88, "compPension": 2520, "compTotal": 8315, "empLabor": 1050, "empHealth": 651, "empTotal": 1701}, {"grade": 43900, "compLabor": 3841, "compHealth": 2124, "compOccu": 92, "compPension": 2634, "compTotal": 8691, "empLabor": 1098, "empHealth": 681, "empTotal": 1779}, {"grade": 45800, "compLabor": 4008, "compHealth": 2216, "compOccu": 96, "compPension": 2748, "compTotal": 9068, "empLabor": 1145, "empHealth": 710, "empTotal": 1855}, {"grade": 48200, "compLabor": 4008, "compHealth": 2332, "compOccu": 101, "compPension": 2892, "compTotal": 9333, "empLabor": 1145, "empHealth": 748, "empTotal": 1893}, {"grade": 50600, "compLabor": 4008, "compHealth": 2449, "compOccu": 106, "compPension": 3036, "compTotal": 9599, "empLabor": 1145, "empHealth": 785, "empTotal": 1930}, {"grade": 53000, "compLabor": 4008, "compHealth": 2565, "compOccu": 111, "compPension": 3180, "compTotal": 9864, "empLabor": 1145, "empHealth": 822, "empTotal": 1967}, {"grade": 55400, "compLabor": 4008, "compHealth": 2681, "compOccu": 116, "compPension": 3324, "compTotal": 10129, "empLabor": 1145, "empHealth": 859, "empTotal": 2004}, {"grade": 57800, "compLabor": 4008, "compHealth": 2797, "compOccu": 121, "compPension": 3468, "compTotal": 10394, "empLabor": 1145, "empHealth": 896, "empTotal": 2041}, {"grade": 60800, "compLabor": 4008, "compHealth": 2942, "compOccu": 128, "compPension": 3648, "compTotal": 10726, "empLabor": 1145, "empHealth": 943, "empTotal": 2088}, {"grade": 63800, "compLabor": 4008, "compHealth": 3087, "compOccu": 134, "compPension": 3828, "compTotal": 11057, "empLabor": 1145, "empHealth": 990, "empTotal": 2135}, {"grade": 66800, "compLabor": 4008, "compHealth": 3233, "compOccu": 140, "compPension": 4008, "compTotal": 11389, "empLabor": 1145, "empHealth": 1036, "empTotal": 2181}, {"grade": 69800, "compLabor": 4008, "compHealth": 3378, "compOccu": 147, "compPension": 4188, "compTotal": 11721, "empLabor": 1145, "empHealth": 1083, "empTotal": 2228}, {"grade": 72800, "compLabor": 4008, "compHealth": 3523, "compOccu": 153, "compPension": 4368, "compTotal": 12052, "empLabor": 1145, "empHealth": 1129, "empTotal": 2274}, {"grade": 76500, "compLabor": 4008, "compHealth": 3702, "compOccu": 153, "compPension": 4590, "compTotal": 12453, "empLabor": 1145, "empHealth": 1187, "empTotal": 2332}, {"grade": 80200, "compLabor": 4008, "compHealth": 3881, "compOccu": 153, "compPension": 4812, "compTotal": 12854, "empLabor": 1145, "empHealth": 1244, "empTotal": 2389}, {"grade": 83900, "compLabor": 4008, "compHealth": 4060, "compOccu": 153, "compPension": 5034, "compTotal": 13255, "empLabor": 1145, "empHealth": 1301, "empTotal": 2446}, {"grade": 87600, "compLabor": 4008, "compHealth": 4239, "compOccu": 153, "compPension": 5256, "compTotal": 13656, "empLabor": 1145, "empHealth": 1359, "empTotal": 2504}, {"grade": 92100, "compLabor": 4008, "compHealth": 4457, "compOccu": 153, "compPension": 5526, "compTotal": 14144, "empLabor": 1145, "empHealth": 1428, "empTotal": 2573}, {"grade": 96600, "compLabor": 4008, "compHealth": 4675, "compOccu": 153, "compPension": 5796, "compTotal": 14632, "empLabor": 1145, "empHealth": 1498, "empTotal": 2643}, {"grade": 101100, "compLabor": 4008, "compHealth": 4892, "compOccu": 153, "compPension": 6066, "compTotal": 15119, "empLabor": 1145, "empHealth": 1568, "empTotal": 2713}, {"grade": 105600, "compLabor": 4008, "compHealth": 5110, "compOccu": 153, "compPension": 6336, "compTotal": 15607, "empLabor": 1145, "empHealth": 1638, "empTotal": 2783}, {"grade": 110100, "compLabor": 4008, "compHealth": 5328, "compOccu": 153, "compPension": 6606, "compTotal": 16095, "empLabor": 1145, "empHealth": 1708, "empTotal": 2853}, {"grade": 115500, "compLabor": 4008, "compHealth": 5589, "compOccu": 153, "compPension": 6930, "compTotal": 16680, "empLabor": 1145, "empHealth": 1791, "empTotal": 2936}, {"grade": 120900, "compLabor": 4008, "compHealth": 5850, "compOccu": 153, "compPension": 7254, "compTotal": 17265, "empLabor": 1145, "empHealth": 1875, "empTotal": 3020}, {"grade": 126300, "compLabor": 4008, "compHealth": 6112, "compOccu": 153, "compPension": 7578, "compTotal": 17851, "empLabor": 1145, "empHealth": 1959, "empTotal": 3104}, {"grade": 131700, "compLabor": 4008, "compHealth": 6373, "compOccu": 153, "compPension": 7902, "compTotal": 18436, "empLabor": 1145, "empHealth": 2043, "empTotal": 3188}, {"grade": 137100, "compLabor": 4008, "compHealth": 6634, "compOccu": 153, "compPension": 8226, "compTotal": 19021, "empLabor": 1145, "empHealth": 2126, "empTotal": 3271}, {"grade": 142500, "compLabor": 4008, "compHealth": 6896, "compOccu": 153, "compPension": 8550, "compTotal": 19607, "empLabor": 1145, "empHealth": 2210, "empTotal": 3355}, {"grade": 147900, "compLabor": 4008, "compHealth": 7157, "compOccu": 153, "compPension": 8874, "compTotal": 20192, "empLabor": 1145, "empHealth": 2294, "empTotal": 3439}, {"grade": 150000, "compLabor": 4008, "compHealth": 7259, "compOccu": 153, "compPension": 9000, "compTotal": 20420, "empLabor": 1145, "empHealth": 2327, "empTotal": 3472}, {"grade": 156400, "compLabor": 4008, "compHealth": 7568, "compOccu": 153, "compPension": 9000, "compTotal": 20729, "empLabor": 1145, "empHealth": 2426, "empTotal": 3571}, {"grade": 162800, "compLabor": 4008, "compHealth": 7878, "compOccu": 153, "compPension": 9000, "compTotal": 21039, "empLabor": 1145, "empHealth": 2525, "empTotal": 3670}, {"grade": 169200, "compLabor": 4008, "compHealth": 8188, "compOccu": 153, "compPension": 9000, "compTotal": 21349, "empLabor": 1145, "empHealth": 2624, "empTotal": 3769}, {"grade": 175600, "compLabor": 4008, "compHealth": 8497, "compOccu": 153, "compPension": 9000, "compTotal": 21658, "empLabor": 1145, "empHealth": 2724, "empTotal": 3869}, {"grade": 182000, "compLabor": 4008, "compHealth": 8807, "compOccu": 153, "compPension": 9000, "compTotal": 21968, "empLabor": 1145, "empHealth": 2823, "empTotal": 3968}, {"grade": 189500, "compLabor": 4008, "compHealth": 9170, "compOccu": 153, "compPension": 9000, "compTotal": 22331, "empLabor": 1145, "empHealth": 2939, "empTotal": 4084}, {"grade": 197000, "compLabor": 4008, "compHealth": 9533, "compOccu": 153, "compPension": 9000, "compTotal": 22694, "empLabor": 1145, "empHealth": 3055, "empTotal": 4200}, {"grade": 204500, "compLabor": 4008, "compHealth": 9896, "compOccu": 153, "compPension": 9000, "compTotal": 23057, "empLabor": 1145, "empHealth": 3172, "empTotal": 4317}, {"grade": 212000, "compLabor": 4008, "compHealth": 10259, "compOccu": 153, "compPension": 9000, "compTotal": 23420, "empLabor": 1145, "empHealth": 3288, "empTotal": 4433}, {"grade": 219500, "compLabor": 4008, "compHealth": 10622, "compOccu": 153, "compPension": 9000, "compTotal": 23783, "empLabor": 1145, "empHealth": 3404, "empTotal": 4549}, {"grade": 228200, "compLabor": 4008, "compHealth": 11043, "compOccu": 153, "compPension": 9000, "compTotal": 24204, "empLabor": 1145, "empHealth": 3539, "empTotal": 4684}, {"grade": 236900, "compLabor": 4008, "compHealth": 11464, "compOccu": 153, "compPension": 9000, "compTotal": 24625, "empLabor": 1145, "empHealth": 3674, "empTotal": 4819}, {"grade": 245600, "compLabor": 4008, "compHealth": 11885, "compOccu": 153, "compPension": 9000, "compTotal": 25046, "empLabor": 1145, "empHealth": 3809, "empTotal": 4954}, {"grade": 254300, "compLabor": 4008, "compHealth": 12306, "compOccu": 153, "compPension": 9000, "compTotal": 25467, "empLabor": 1145, "empHealth": 3944, "empTotal": 5089}, {"grade": 263000, "compLabor": 4008, "compHealth": 12727, "compOccu": 153, "compPension": 9000, "compTotal": 25888, "empLabor": 1145, "empHealth": 4079, "empTotal": 5224}, {"grade": 273000, "compLabor": 4008, "compHealth": 13211, "compOccu": 153, "compPension": 9000, "compTotal": 26372, "empLabor": 1145, "empHealth": 4234, "empTotal": 5379}, {"grade": 283000, "compLabor": 4008, "compHealth": 13695, "compOccu": 153, "compPension": 9000, "compTotal": 26856, "empLabor": 1145, "empHealth": 4389, "empTotal": 5534}, {"grade": 293000, "compLabor": 4008, "compHealth": 14179, "compOccu": 153, "compPension": 9000, "compTotal": 27340, "empLabor": 1145, "empHealth": 4544, "empTotal": 5689}, {"grade": 303000, "compLabor": 4008, "compHealth": 14663, "compOccu": 153, "compPension": 9000, "compTotal": 27824, "empLabor": 1145, "empHealth": 4700, "empTotal": 5845}, {"grade": 313000, "compLabor": 4008, "compHealth": 15146, "compOccu": 153, "compPension": 9000, "compTotal": 28307, "empLabor": 1145, "empHealth": 4855, "empTotal": 6000}];
function findInsuranceGrade(grade) {
  if (!grade) return null;
  const exact = INSURANCE_TABLE.find(function (r) { return r.grade === Number(grade); });
  if (exact) return exact;
  const sorted = INSURANCE_TABLE.slice().sort(function (a, b) { return a.grade - b.grade; });
  const candidate = sorted.find(function (r) { return r.grade >= Number(grade); });
  return candidate || sorted[sorted.length - 1];
}
function emptyPayrollEntry() {
  return {
    otWeekday134: 0, otWeekday167: 0, otRestDayHours: 0, otHolidayHours: 0, otMandatoryRestHours: 0,
    festivalBonus: 0, yearEndBonus: 0, otherBonus: 0, performanceBonus: 0,
    personalLeave: 0, sickLeave: 0, menstrualLeave: 0, disasterLeave: 0, otherLeave: 0,
    annualLeaveSettlement: 0,
    businessExpense: 0, salesPerformance: 0, otherExpense26: 0, salesBonus26: 0, deduction26: 0,
    otherDeduction: 0, note: ''
  };
}
function calcRestDayPayGas(hourly, hours) {
  const h = Number(hours) || 0;
  if (h <= 0) return { pay: 0, countedHours: 0 };
  const counted = h <= 4 ? 4 : (h <= 8 ? 8 : (h <= 12 ? 12 : h));
  const t1 = Math.min(counted, 2), t2 = Math.min(Math.max(counted - 2, 0), 6), t3 = Math.max(counted - 8, 0);
  return { pay: hourly * 1.34 * t1 + hourly * 1.67 * t2 + hourly * 2.67 * t3, countedHours: counted };
}
function calcHolidayPayGas(hourly, dailyWage, hours) {
  const h = Number(hours) || 0;
  if (h <= 0) return { pay: 0 };
  const excess = Math.max(0, h - 8);
  const ot134 = Math.min(excess, 2), ot167 = Math.max(excess - 2, 0);
  return { pay: dailyWage + hourly * 1.34 * ot134 + hourly * 1.67 * ot167 };
}
function calcMandatoryRestPayGas(hourly, dailyWage, hours, mode) {
  const h = Number(hours) || 0;
  if (h <= 0) return 0;
  if (mode === 'legal') {
    return calcHolidayPayGas(hourly, dailyWage, h).pay; // 依勞基法：加發一日工資＋超過8小時比照平日加班費
  }
  return hourly * 2 * h; // 優於勞基法：時薪×2
}
function calcPayrollForEmployee(emp, entryRaw, settings, month) {
  const entry = Object.assign(emptyPayrollEntry(), entryRaw || {});
  const n = function (v) { const x = Number(v); return isNaN(x) ? 0 : x; };
  const base = n(emp.baseSalary); // 本薪已包含伙食/交通/職務加給/全勤獎金，以下4個欄位僅為拆解說明用途，不重複相加
  const hourly = base > 0 ? base / 240 : 0;
  const dailyWage = base > 0 ? base / 30 : 0;

  const weekdayOtPay = hourly * 1.34 * n(entry.otWeekday134) + hourly * 1.67 * n(entry.otWeekday167);
  const restDay = calcRestDayPayGas(hourly, entry.otRestDayHours);
  const holiday = calcHolidayPayGas(hourly, dailyWage, entry.otHolidayHours);
  const mandatoryRestMode = (settings && settings.mandatoryRestPayMode) || 'double';
  const mandatoryRestPay = calcMandatoryRestPayGas(hourly, dailyWage, entry.otMandatoryRestHours, mandatoryRestMode);
  const overtimePay = weekdayOtPay + restDay.pay + holiday.pay + mandatoryRestPay;

  const allowanceTotal = n(emp.mealAllowance) + n(emp.transportAllowance) + n(emp.positionAllowance) + n(emp.fullAttendanceBonus); // 僅供顯示參考，已含在本薪內
  const bonusTotal = n(entry.festivalBonus) + n(entry.yearEndBonus) + n(entry.otherBonus) + n(entry.performanceBonus);
  const payableTotal = base + bonusTotal + n(entry.annualLeaveSettlement) + overtimePay;

  const ins = findInsuranceGrade(emp.insuranceGrade);
  const laborFee = ins ? ins.empLabor : 0;
  const dependentCount = Math.min(n(emp.dependentCount), 3); // 眷屬保費同本人金額，超過3人以3人計
  const healthFee = ins ? ins.empHealth * (1 + dependentCount) : 0;
  const menstrualSplit = splitMenstrualLeave(emp.id, month, n(entry.menstrualLeave));
  const leaveDeduct = hourly * 1.0 * n(entry.personalLeave) + hourly * 0.5 * n(entry.sickLeave) + hourly * 0.5 * menstrualSplit.halfPayHours + hourly * 1.0 * n(entry.otherLeave);
  const deductTotal = laborFee + healthFee + leaveDeduct + n(entry.otherDeduction);

  const pay06 = payableTotal - deductTotal;
  const pay26 = n(entry.businessExpense) + n(entry.salesPerformance) + n(entry.otherExpense26) + n(entry.salesBonus26) - n(entry.deduction26);
  const grandTotal = pay06 + pay26;

  return {
    hourly: hourly, overtimePay: overtimePay, weekdayOtPay: weekdayOtPay, restDayPay: restDay.pay, holidayPay: holiday.pay,
    mandatoryRestPay: mandatoryRestPay, restDayCountedHours: restDay.countedHours,
    allowanceTotal: allowanceTotal, bonusTotal: bonusTotal, payableTotal: payableTotal,
    laborFee: laborFee, healthFee: healthFee, leaveDeduct: leaveDeduct, deductTotal: deductTotal,
    menstrualPaidHours: menstrualSplit.fullPayHours, menstrualHalfHours: menstrualSplit.halfPayHours,
    pay06: pay06, pay26: pay26, grandTotal: grandTotal
  };
}
// 供前台登入後背景刷新自己的最新員工資料（公司/部門/班別等），避免快取的登入資料過舊
function getMyProfile(token) {
  const sess = validateSession(token);
  if (!sess.employeeId) throw new Error('此帳號未綁定員工');
  const emp = getEmployees(true).find(function (e) { return e.id === sess.employeeId; });
  if (!emp) throw new Error('找不到員工資料');
  const isManager = getDepartments().some(function (d) { return d.managerId === sess.employeeId; });
  return { employee: emp, isManager: isManager };
}

// 供員工選擇「代理人」等場合使用，只回傳基本資訊，不含薪資/銀行帳號等敏感資料
function getColleagueList() {
  return getEmployees().filter(function (e) { return e.canBeDelegate !== false; }).map(function (e) {
    return { id: e.id, name: e.name, department: e.department, company: e.company };
  });
}

// 計算6號/26號實際發放日期：遇週六日或國定假日（不含公司休假日）自動往前推到最近的上班日
function getActualPayDate(year, month, day) {
  const holidaySet = {};
  getHolidays().forEach(h => { if (h.type === '國定假日') holidaySet[h.date] = true; });
  let d = new Date(year, month - 1, day);
  while (true) {
    const dow = d.getDay();
    const dateStr = Utilities.formatDate(d, 'Asia/Taipei', 'yyyy-MM-dd');
    if (dow !== 0 && dow !== 6 && !holidaySet[dateStr]) return dateStr;
    d.setDate(d.getDate() - 1);
  }
}

function getMyPayslip(token, month) {
  const sess = validateSession(token);
  if (!sess.employeeId) throw new Error('此帳號未綁定員工，無法查詢薪資條');
  const emp = getEmployees(true).find(function (e) { return e.id === sess.employeeId; });
  if (!emp) throw new Error('找不到員工資料');
  const entries = getPayrollEntries(month);
  const entry = entries[sess.employeeId] || emptyPayrollEntry();
  const settings = getSettings();
  const calc = calcPayrollForEmployee(emp, entry, settings, month);
  const [py, pm] = month.split('-').map(Number);
  const payDate06 = getActualPayDate(py, pm, 6);
  const payDate26 = getActualPayDate(py, pm, 26);
  return { employee: emp, entry: entry, calc: calc, month: month, payDate06: payDate06, payDate26: payDate26 };
}

/* ============================ 加班補休明細表 ============================ */
function getCompLedger(employeeId) {
  const rows = getSheet(SHEET_COMP).getDataRange().getValues();
  const employees = getEmployees(true);
  const nameMap = {}; employees.forEach(function (e) { nameMap[e.id] = e.name; });
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    if (employeeId && r[1] !== employeeId) continue;
    out.push({
      id: r[0], employeeId: r[1], name: nameMap[r[1]] || r[1], type: r[2], hours: Number(r[3]) || 0,
      note: r[4] || '', expireDate: r[5] ? (r[5] instanceof Date ? Utilities.formatDate(r[5], 'Asia/Taipei', 'yyyy-MM-dd') : String(r[5])) : '',
      createdAt: formatDateTimeCell(r[6])
    });
  }
  out.sort(function (a, b) { return a.createdAt.localeCompare(b.createdAt); });
  // 附加每人累計餘額（依時間序累加）
  const running = {};
  out.forEach(function (item) {
    running[item.employeeId] = (running[item.employeeId] || 0) + item.hours;
    item.balanceAfter = Math.round(running[item.employeeId] * 100) / 100;
  });
  return out.sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
}

/* ============================ Dashboard ============================ */
function getDashboardStats() {
  const employees = getEmployees();
  const today = todayStr();
  const logRows = getSheet(SHEET_LOG).getDataRange().getValues();
  let presentToday = 0, lateToday = 0;
  const settings = getSettings();
  for (let i = 1; i < logRows.length; i++) {
    if (safeDateOnlyText(logRows[i][3]) !== today) continue;
    if (logRows[i][4]) presentToday++;
  }
  const pendingRequests = listAllRequests(null, '待審核').length;
  const month = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM');
  const summary = getMonthlySummary(month);
  let otCapAlerts = 0, minWageAlerts = 0;
  const minWage = 29500;
  summary.forEach(function (e) {
    if (e.otCapExceeded) otCapAlerts++;
  });
  employees.forEach(function (e) {
    const recurring = Number(e.baseSalary || 0); // 本薪已包含伙食/交通/職務加給，不重複相加
    if (Number(e.baseSalary || 0) > 0 && recurring < minWage) minWageAlerts++;
  });
  const companies = getCompanies();
  const departments = getDepartments();
  return {
    employeeCount: employees.length, companyCount: companies.length, departmentCount: departments.length,
    presentToday: presentToday, absentToday: Math.max(0, employees.length - presentToday),
    pendingRequests: pendingRequests, otCapAlerts: otCapAlerts, minWageAlerts: minWageAlerts,
    month: month, monthlyOtHoursTotal: Math.round(summary.reduce(function (s, e) { return s + e.otWeekday134 + e.otWeekday167; }, 0) * 100) / 100
  };
}
