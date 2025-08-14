# 📋 Code Review 報告 - Google Maps Business Scraper

## 總體評分: 7.5/10

## ✅ 優點

### 1. 架構設計
- 模組化設計良好，主程式與爬蟲邏輯分離
- 使用 class-based 設計，易於維護和擴展
- 代理配置支援完善

### 2. 錯誤處理
- 每個搜尋查詢都有 try-catch 保護
- 失敗不會影響其他查詢的執行
- 錯誤資訊會記錄到 dataset

### 3. 效能優化
- 資源阻擋策略（圖片、追蹤器等）
- 動態等待時間策略
- 積極的捲動策略（50次）確保獲得 100+ 結果

### 4. 統計追蹤
- 完整的執行統計（成功率、平均結果數等）
- 統計資料儲存到 key-value store

## ⚠️ 發現的問題

### 🔴 嚴重問題

1. **預設語言設定錯誤**
```javascript
// main.js line 24
language = 'zh-TW',  // ❌ 應該預設為 'en'
```
**修正建議**: 改為 `language = 'en'`

2. **Puppeteer 在 Docker 中的問題**
- Dockerfile 使用基礎 Node 映像，缺少 Chrome 依賴
**修正建議**: 
```dockerfile
FROM apify/actor-node-puppeteer-chrome:20
```

### 🟡 中度問題

1. **缺少輸入驗證**
- `maxResults` 沒有上限驗證
- `searchQueries` 沒有內容驗證
**修正建議**: 加入輸入驗證邏輯

2. **記憶體管理**
- 大量結果時可能造成記憶體問題
- 沒有批次處理機制
**修正建議**: 實作批次儲存機制

3. **代理錯誤處理**
- 代理失敗時沒有重試機制
**修正建議**: 加入代理重試邏輯

### 🟢 輕微問題

1. **日誌一致性**
- 混用 `console.log` 和 `log.info`
**修正建議**: 統一使用 Apify 的 log

2. **硬編碼值**
- 等待時間 2000ms 硬編碼
**修正建議**: 改為可配置參數

3. **未使用的參數**
- `scrapeEmails` 參數實際未實作
**修正建議**: 實作或移除該參數

## 📝 修正建議

### 立即修正 (Priority 1)

1. **修正 main.js 的預設語言**:
```javascript
// Line 24
language = input.language || 'en',
```

2. **更新 Dockerfile**:
```dockerfile
FROM apify/actor-node-puppeteer-chrome:20
```

3. **加入輸入驗證**:
```javascript
// 在 main.js 中加入
const validateInput = (input) => {
    if (input.maxResults > 200) {
        throw new Error('maxResults cannot exceed 200');
    }
    if (input.searchQueries) {
        input.searchQueries = input.searchQueries.filter(q => q && q.trim());
    }
    return input;
};
```

### 建議改進 (Priority 2)

1. **實作批次儲存**:
```javascript
const BATCH_SIZE = 50;
const batch = [];
for (const business of results) {
    batch.push(business);
    if (batch.length >= BATCH_SIZE) {
        await dataset.pushData(batch);
        batch.length = 0;
    }
}
if (batch.length > 0) {
    await dataset.pushData(batch);
}
```

2. **統一日誌系統**:
```javascript
// GoogleMapsScraper.js
constructor(config = {}) {
    this.log = config.log || console;
    // ...
}
```

3. **加入重試機制**:
```javascript
const retryWithBackoff = async (fn, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
        }
    }
};
```

## 🔧 配置檔案問題

### INPUT_SCHEMA.json
- ✅ 結構正確
- ✅ 必要欄位都有預設值
- ⚠️ `maxScrolls` 最小值 10 可能太高

### actor.json
- ✅ 版本格式正確 (1.0)
- ✅ 資料集配置完善
- ⚠️ 缺少記憶體配置建議

## 📊 效能評估

| 項目 | 評分 | 說明 |
|------|------|------|
| 程式碼品質 | 8/10 | 結構清晰，但有改進空間 |
| 錯誤處理 | 7/10 | 基本完善，缺少重試機制 |
| 效能優化 | 8/10 | 資源阻擋和捲動策略良好 |
| 可維護性 | 8/10 | 模組化設計良好 |
| 文件完整性 | 6/10 | 缺少內部程式碼註解 |

## 🎯 下一步行動

1. **立即**: 修正預設語言和 Dockerfile
2. **今天**: 加入輸入驗證和批次儲存
3. **本週**: 實作重試機制和統一日誌
4. **未來**: 考慮加入更多資料擷取功能

## 結論

程式碼整體品質良好，架構設計合理。主要問題在於一些配置錯誤和缺少進階的錯誤處理機制。修正這些問題後，該 Actor 應該能穩定運行並提供良好的爬蟲效果。

**建議優先修正**:
1. Dockerfile 改用 puppeteer-chrome 映像
2. 預設語言改為英文
3. 加入基本的輸入驗證

完成這些修正後，Actor 的穩定性和可用性將大幅提升。