# CHIA Camino 2026

一個可部署到 GitHub Pages 的手機版朝聖之路行動首頁，包含：

- 公開版行程概要
- 每日旅行記帳
- 6／7／8 萬元預算切換與進度條
- 依類別統計、CSV 匯出、JSON 備份與還原
- 緊急求助資訊
- 離線快取（首次開啟後，基本頁面可離線使用）

## 重要安全說明

不要將護照影本、身分證字號、完整保單、信用卡照片、機票／車票 QR Code、訂位代號、住宿完整地址或 Google Drive 私人文件連結放進這個資料夾。

記帳資料使用瀏覽器 `localStorage`，只存在使用者目前的裝置與瀏覽器，不會寫進 GitHub。請定期使用「備份 JSON」。

## 部署到 GitHub Pages

1. 登入 GitHub，建立新的 repository，例如 `camino-2026`。
2. 將本資料夾內的所有檔案上傳到 repository 根目錄。
3. 到 **Settings → Pages**。
4. 在 **Build and deployment** 選擇 **Deploy from a branch**。
5. Branch 選 `main`，資料夾選 `/ (root)`，按 Save。
6. 等待約一至數分鐘，GitHub 會顯示網站網址。

## 手機使用

用 Safari 或 Chrome 開啟網站後，可加入主畫面。網站第一次完整開啟後，基本頁面可離線讀取；新增記帳也不需要網路。
