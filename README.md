# MiSub Fetch Proxy

可直接部署到 Vercel 的 MiSub Fetch Proxy。它在 Vercel Node.js Serverless Function 中抓取訂閱內容，並透傳 MiSub 讀取流量、到期時間與檔名所需的回應標頭。

## 部署

1. 將此專案匯入 [Vercel](https://vercel.com/new)。儲存庫已包含 `vercel.json`，Vercel 會自動辨識 `api/index.js` 為 Node.js Function，不需要設定 Build Command；完成匯入後即可部署，之後每次 push 到已連結分支會由 Vercel 自動重新部署。

	或在專案根目錄執行：

	```bash
	npx vercel deploy
	```

2. 部署完成後，代理入口為 `https://你的網域.vercel.app/api`。

## 使用

將訂閱網址 URL encode 後放到 `url` 參數：

```text
https://你的網域.vercel.app/api?url=https%3A%2F%2Fexample.com%2Fsubscription
```

可用 `ua` 指定上游 User-Agent；沒有指定時預設使用 `clash-verge/v2.4.3`：

```text
https://你的網域.vercel.app/api?ua=clash-verge%2Fv2.4.3&url=你的訂閱網址
```

支援 `GET`、`HEAD` 和瀏覽器 CORS 的 `OPTIONS` 預檢請求。僅允許代理 `http://` 與 `https://` 網址。

## 本地驗證

需要 Node.js 18 或更新版本：

```bash
npm test
```
