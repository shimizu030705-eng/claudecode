/**
 * ============================================
 * Google Drive 操作
 * ============================================
 */

/**
 * URLからファイルIDを抽出
 * @param {string} url - Google DriveのURL
 * @returns {string} ファイルID
 */
function extractFileIdFromUrl(url) {
  if (!url) {
    throw new Error('URLが入力されていません');
  }

  // 既にIDだけの場合
  if (!url.includes('/')) {
    return url;
  }

  // パターン1: /file/d/{fileId}/view
  let match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }

  // パターン2: ?id={fileId}
  match = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }

  // パターン3: /open?id={fileId}
  match = url.match(/\/open\?id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }

  throw new Error(`URLからファイルIDを抽出できません: ${url}`);
}

/**
 * フォルダURLからフォルダIDを抽出
 * @param {string} url - Google DriveフォルダのURL
 * @returns {string} フォルダID
 */
function extractFolderIdFromUrl(url) {
  if (!url) {
    throw new Error('フォルダURLが入力されていません');
  }

  if (!url.includes('/')) {
    return url;
  }

  const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }

  throw new Error(`フォルダURLからIDを抽出できません: ${url}`);
}

/**
 * ファイルIDからBlobを取得
 * @param {string} fileId - ファイルID
 * @returns {Blob} ファイルのBlob
 */
function getFileFromDriveById(fileId) {
  try {
    const file = DriveApp.getFileById(fileId);
    return file.getBlob();
  } catch (error) {
    throw new Error(`Driveファイル取得エラー (ID: ${fileId}): ${error.message}`);
  }
}

/**
 * フォルダ内の指定ファイル名のBlobを取得
 * @param {string} folderId - フォルダID
 * @param {string} fileName - ファイル名
 * @returns {Blob} ファイルのBlob
 */
function getFileFromDriveByName(folderId, fileName) {
  try {
    const folder = DriveApp.getFolderById(folderId);
    const files = folder.getFilesByName(fileName);

    if (!files.hasNext()) {
      throw new Error(`ファイルが見つかりません: ${fileName}`);
    }

    const file = files.next();
    return file.getBlob();

  } catch (error) {
    throw new Error(`Driveファイル取得エラー: ${error.message}`);
  }
}

/**
 * DriveファイルオブジェクトをIDから取得
 * @param {string} fileId - ファイルID
 * @returns {File} Driveファイルオブジェクト
 */
function getDriveFileById(fileId) {
  try {
    return DriveApp.getFileById(fileId);
  } catch (error) {
    throw new Error(`Driveファイル取得エラー (ID: ${fileId}): ${error.message}`);
  }
}
