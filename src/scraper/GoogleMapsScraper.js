/**
 * Google Maps 商家爬蟲模組
 * 能夠提取 100+ 筆商家資訊
 * 針對 Apify Actor 部署最佳化
 */

const puppeteer = require('puppeteer');
const { log } = require('apify');
const BatchEmailExtractor = require('./BatchEmailExtractor');
const { 
    cleanUnicodeText, 
    extractBusinessType, 
    extractPriceLevel, 
    cleanBusinessHours, 
    validateAddress 
} = require('../utils/dataCleaners');

/**
 * Google Maps 爬蟲主類別
 */
class GoogleMapsScraper {
    /**
     * 建構函式 - 初始化爬蟲配置
     * @param {Object} config - 配置物件
     */
    constructor(config = {}) {
        // 配置參數設定
        this.config = {
            searchQuery: config.searchQuery || '',          // 搜尋關鍵字
            maxResults: config.maxResults || 100,           // 最大結果數量
            language: config.language || 'en',              // 界面語言
            headless: config.headless !== false,            // 是否無頭模式
            maxScrolls: config.maxScrolls || 100,           // 最大滾動次數
            scrapeDetails: config.scrapeDetails || false,   // 是否爬取詳細資訊
            scrapeEmails: config.scrapeEmails || false,     // 是否爬取電子郵件
            directUrl: config.directUrl || null,            // 直接網址
            maxRetries: config.maxRetries || 3,             // 最大重試次數
            retryDelay: config.retryDelay || 1000          // 重試延遲（毫秒）
        };
        
        this.browser = null;  // 瀏覽器實例
        this.results = [];     // 爬取結果陣列
        // 統計資訊
        this.stats = {
            loadedCount: 0,        // 已載入的結果數
            extractedCount: 0,     // 已提取的結果數
            scrollAttempts: 0,     // 滾動嘗試次數
            emailsExtracted: 0     // 已提取的電子郵件數
        };
    }

    /**
     * 重試機制（指數退避演算法）
     * 用於處理網路錯誤和超時問題
     */
    async retryWithBackoff(fn, maxRetries = 3, context = '') {
        let lastError;
        const retries = maxRetries || this.config.maxRetries || 3;
        
        for (let i = 0; i < retries; i++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                
                if (i === retries - 1) {
                    log.error(`${context} failed after ${retries} attempts:`, error.message);
                    throw error;
                }
                
                const delay = Math.min(1000 * Math.pow(2, i), 10000);
                log.warning(`${context} failed (attempt ${i + 1}/${retries}), retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw lastError;
    }

    /**
     * 初始化瀏覽器
     * 設置所有必要的瀏覽器參數和選項
     */
    async init() {
        log.info('Initializing Google Maps Scraper');
        log.debug('Configuration:', this.config);

        const launchOptions = {
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-blink-features=AutomationControlled',
                '--window-size=1920,1080',
                `--lang=${this.config.language}`,
                '--single-process',
                '--no-zygote'
            ],
            defaultViewport: null,
            ignoreDefaultArgs: ['--disable-extensions'],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
        };

        // No proxy support - direct connection only
        this.browser = await puppeteer.launch(launchOptions);
        log.info('Browser launched successfully');
    }

    /**
     * 使用查詢字串搜尋 Google Maps
     * @param {String} query - 搜尋查詢
     * @returns {Promise<Array>} - 商家結果陣列
     */
    async search(query) {
        if (query) {
            this.config.searchQuery = query;
        }

        if (!this.config.searchQuery && !this.config.directUrl) {
            throw new Error('Search query or direct URL required');
        }

        const page = await this.browser.newPage();
        
        try {
            await page.setViewport({ width: 1920, height: 1080 });

            // Set language
            await page.evaluateOnNewDocument((language) => {
                Object.defineProperty(navigator, 'language', {
                    get: function() { return language; }
                });
                Object.defineProperty(navigator, 'languages', {
                    get: function() { return [language]; }
                });
            }, this.config.language);

            // Block unnecessary resources
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                const resourceType = req.resourceType();
                const url = req.url();
                
                // Block tracking and analytics
                if (url.includes('google-analytics') || 
                    url.includes('googletagmanager') ||
                    url.includes('doubleclick') ||
                    url.includes('facebook') ||
                    url.includes('twitter')) {
                    req.abort();
                    return;
                }
                
                // Block images, fonts, media
                if (['image', 'font', 'media'].includes(resourceType)) {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            // Navigate to search page with retry
            const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(this.config.searchQuery)}?hl=${this.config.language}`;
            log.info(`Searching: ${this.config.searchQuery}`);
            log.info(`URL: ${searchUrl}`);

            // Special handling for non-ASCII URLs (Japanese, Korean, etc.)
            const isNonAsciiQuery = /[^\x00-\x7F]/.test(this.config.searchQuery);
            const navigationTimeout = isNonAsciiQuery ? 120000 : 90000;
            
            await this.retryWithBackoff(async () => {
                await page.goto(searchUrl, { 
                    waitUntil: 'domcontentloaded',  // Less strict for non-ASCII queries
                    timeout: navigationTimeout
                });
                // Additional wait for dynamic content
                await page.waitForSelector('div[role="feed"], [aria-label*="no results"], [aria-label*="沒有結果"], [aria-label*="結果なし"]', {
                    timeout: 30000
                }).catch(() => null);
            }, 2, 'Navigation to search page');
            
            // Wait for initial load
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Check if results are available
            const hasResults = await page.evaluate(() => {
                const feed = document.querySelector('div[role="feed"]');
                const noResults = document.querySelector('[aria-label*="no results"]') || 
                                 document.querySelector('[aria-label*="沒有結果"]');
                return feed && !noResults;
            });

            if (!hasResults) {
                log.info('No results found for this search');
                return [];
            }

            // Perform aggressive scrolling
            await this.performScrolling(page);

            // Extract businesses
            const businesses = await this.extractBusinesses(page);
            this.stats.extractedCount = businesses.length;

            // Scrape details if requested
            if (this.config.scrapeDetails && businesses.length > 0) {
                log.info('Scraping detailed information...');
                await this.scrapeBusinessDetails(page, businesses);
            }

            this.results = businesses;
            return businesses;

        } catch (error) {
            log.error('Search failed:', error);
            throw error;
        } finally {
            await page.close();
        }
    }

    /**
     * 使用直接網址搜尋
     * @param {String} url - Google Maps 網址
     * @returns {Promise<Array>} - 商家結果陣列
     */
    async searchByUrl(url) {
        const page = await this.browser.newPage();
        
        try {
            await page.setViewport({ width: 1920, height: 1080 });

            // Block unnecessary resources
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (['image', 'font', 'media'].includes(req.resourceType())) {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            log.info(`Loading URL: ${url}`);
            await this.retryWithBackoff(async () => {
                await page.goto(url, { 
                    waitUntil: 'networkidle2',
                    timeout: 60000  // 增加到 60 秒
                });
            }, 2, 'Navigation to URL');
            
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Perform scrolling and extraction
            await this.performScrolling(page);
            const businesses = await this.extractBusinesses(page);
            
            this.results = businesses;
            return businesses;

        } catch (error) {
            log.error('URL search failed:', error);
            throw error;
        } finally {
            await page.close();
        }
    }

    /**
     * 積極滾動策略
     * 使用多種方法確保載入所有結果
     */
    async performScrolling(page) {
        log.info('Starting aggressive scrolling...');
        
        let previousCount = 0;
        let currentCount = 0;
        let noChangeCount = 0;
        const maxScrolls = this.config.maxScrolls;

        for (let i = 0; i < maxScrolls; i++) {
            this.stats.scrollAttempts++;

            // 執行多種滾動方法
            await page.evaluate((scrollIndex) => {
                // 方法 1: 滾動結果容器
                const feed = document.querySelector('div[role="feed"]');
                if (feed) {
                    feed.scrollTop = feed.scrollHeight;
                }
                
                // 方法 2: 滾動到最後一個商家
                const links = document.querySelectorAll('a[href*="/maps/place/"]');
                if (links.length > 0) {
                    links[links.length - 1].scrollIntoView({ behavior: 'smooth' });
                }
                
                // 方法 3: 鍵盤模擬
                if (scrollIndex % 3 === 0) {
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
                }
                
                // 方法 4: 視窗滾動
                window.scrollBy(0, 1000);
            }, i);

            // 動態等待時間
            await new Promise(resolve => setTimeout(resolve, 500 + (i * 20)));

            // 檢查結果數量
            currentCount = await page.evaluate(() => {
                return document.querySelectorAll('a[href*="/maps/place/"]').length;
            });

            if (currentCount === previousCount) {
                noChangeCount++;

                // 嘗試點擊「更多」按鈕
                if (noChangeCount === 2) {
                    const clicked = await page.evaluate(() => {
                        const buttons = Array.from(document.querySelectorAll('button'));
                        const moreButton = buttons.find(btn => 
                            btn.textContent.includes('More') ||
                            btn.textContent.includes('more') ||
                            btn.textContent.includes('更多')
                        );
                        if (moreButton) {
                            moreButton.click();
                            return true;
                        }
                        return false;
                    });

                    if (clicked) {
                        log.info('Clicked "More" button');
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }

                // 如果卡住，嘗試更積極的滾動
                if (noChangeCount === 3) {
                    // 嘗試滾動父容器
                    await page.evaluate(() => {
                        const container = document.querySelector('div[role="main"]') || document.body;
                        container.scrollTop = container.scrollHeight;
                    });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
                // 8 次嘗試後沒有新結果則停止（更高容忍度）
                if (noChangeCount >= 8) {
                    log.info('No new results after multiple attempts, stopping scroll');
                    break;
                }
            } else {
                noChangeCount = 0;
            }

            // 進度更新
            if (i % 5 === 0) {
                log.info(`Scroll ${i + 1}: ${currentCount} results loaded`);
            }

            previousCount = currentCount;

            // 繼續滾動以取得盡可能多的結果
            // 只有真正達到限制時才停止
            if (currentCount >= 200) {
                log.info('Reached 200 results limit');
                break;
            }
        }

        this.stats.loadedCount = currentCount;
        log.info(`Scrolling complete: ${currentCount} results loaded`);
    }

    /**
     * 提取商家資訊
     * 從頁面 DOM 中解析所有商家資料
     */
    async extractBusinesses(page) {
        log.info('Extracting business information...');

        const businesses = await page.evaluate(() => {
            const results = [];
            const seen = new Set();

            // 取得所有商家連結
            const links = document.querySelectorAll('a[href*="/maps/place/"]');

            links.forEach((link, index) => {
                // 不限制提取，取得所有可用結果

                try {
                    const href = link.href;
                    
                    // 提取 Place ID - 支援多種 URL 格式
                    let placeId = null;
                    
                    // 方法 1: 標準 place URL
                    const placeUrlMatch = href.match(/\/place\/[^/]+\/([^/?]+)/);
                    if (placeUrlMatch && placeUrlMatch[1].startsWith('ChI')) {
                        // 清理 Place ID，移除查詢參數
                        placeId = placeUrlMatch[1].split('?')[0];
                    }
                    
                    // 方法 2: data 參數中的 ChIJ 格式  
                    if (!placeId) {
                        const dataMatch = href.match(/[!&]1s(ChI[^!&?]+)/);
                        if (dataMatch) {
                            // 清理 Place ID，移除查詢參數
                            placeId = dataMatch[1].split('?')[0];
                        }
                    }
                    
                    // 方法 3: !19s 參數
                    if (!placeId) {
                        const pidMatch = href.match(/!19s(ChI[^!&?]+)/);
                        if (pidMatch) {
                            // 清理 Place ID，移除查詢參數
                            placeId = pidMatch[1].split('?')[0];
                        }
                    }
                    
                    // 方法 4: DOM 元素的 data 屬性
                    if (!placeId) {
                        const dataPid = link.getAttribute('data-pid') || 
                                       link.getAttribute('data-place-id') ||
                                       link.getAttribute('data-value');
                        if (dataPid && dataPid.startsWith('ChI')) {
                            // 清理 Place ID，移除查詢參數
                            placeId = dataPid.split('?')[0];
                        }
                        
                        // 檢查父元素
                        if (!placeId && link.parentElement) {
                            const parentDataPid = link.parentElement.getAttribute('data-pid') || 
                                                link.parentElement.getAttribute('data-place-id');
                            if (parentDataPid && parentDataPid.startsWith('ChI')) {
                                // 清理 Place ID，移除查詢參數
                                placeId = parentDataPid.split('?')[0];
                            }
                        }
                    }
                    
                    // 方法 5: 十六進制 ID
                    if (!placeId) {
                        const hexMatch = href.match(/[!&]1s(0x[0-9a-f]+:0x[0-9a-f]+)/);
                        if (hexMatch) {
                            placeId = `hex_${hexMatch[1]}`;
                        }
                    }
                    
                    // 備用: 使用名稱和座標生成
                    if (!placeId) {
                        const coordMatch = href.match(/!3d([^!]+)!4d([^!]+)/);
                        const nameElement = link.querySelector('div');
                        const name = nameElement?.textContent?.trim() || '';
                        
                        if (name && coordMatch) {
                            const uniqueStr = `${name}_${coordMatch[1]}_${coordMatch[2]}`;
                            let hash = 0;
                            for (let i = 0; i < uniqueStr.length; i++) {
                                hash = ((hash << 5) - hash) + uniqueStr.charCodeAt(i);
                                hash = hash & hash;
                            }
                            placeId = `generated_${Math.abs(hash).toString(36)}`;
                        } else {
                            // 最後的備用
                            placeId = `fallback_${index}_${Date.now()}`;
                        }
                    }

                    // 最終清理 Place ID - 確保移除所有查詢參數
                    if (placeId && placeId.includes('?')) {
                        placeId = placeId.split('?')[0];
                    }
                    
                    // 跳過重複項目 - 使用 Place ID 作為主要去重依據
                    if (seen.has(placeId)) {
                        // 跳過重複的 Place ID
                        return;
                    }
                    seen.add(placeId);
                    
                    // 從網址提取座標
                    let latitude = null;
                    let longitude = null;
                    const coordMatch = href.match(/!3d([^!]+)!4d([^!]+)/);
                    if (coordMatch) {
                        latitude = parseFloat(coordMatch[1]);
                        longitude = parseFloat(coordMatch[2]);
                    }

                    // 取得容器元素 - 嘗試多個選擇器
                    const container = link.closest('div[jsaction*="mouseover:pane"]') ||
                                    link.closest('div[data-cid]') ||
                                    link.closest('div[jsaction]') || 
                                    link.parentElement?.parentElement?.parentElement ||
                                    link.parentElement?.parentElement;
                    if (!container) return;

                    // 提取商家名稱 (從容器取得更準確的名稱)
                    const finalNameElement = container.querySelector('div[class*="fontHeadlineSmall"]') ||
                                           container.querySelector('div[class*="fontBodyMedium"]') ||
                                           container.querySelector('[role="heading"]') ||
                                           link.querySelector('div');
                    
                    const businessName = finalNameElement?.textContent?.trim() || '';
                    if (!businessName) return; // 如果沒有名稱則跳過

                    // 提取評分
                    const ratingElement = container.querySelector('span[role="img"][aria-label*="star"]') ||
                                         container.querySelector('span[role="img"][aria-label*="Star"]') ||
                                         container.querySelector('span[role="img"][aria-label*="星"]') ||
                                         container.querySelector('span[class*="MW4etd"]');
                    const ratingText = ratingElement?.getAttribute('aria-label') || 
                                      ratingElement?.textContent || '';
                    const rating = parseFloat(ratingText.match(/[\d.]+/)?.[0] || '0');

                    // 提取評論數量
                    const reviewText = container.textContent || '';
                    const reviewMatch = reviewText.match(/\((\d+[,\d]*)\)/);
                    const reviews = reviewMatch ? 
                        parseInt(reviewMatch[1].replace(/,/g, '')) : 0;

                    // 從 W4Efsd 元素提取商家類型和地址
                    const detailDivs = container.querySelectorAll('div[class*="W4Efsd"]');
                    let businessType = '';
                    let address = '';
                    
                    detailDivs.forEach(div => {
                        const text = div.textContent || '';
                        const spans = div.querySelectorAll('span');
                        
                        if (spans.length > 0) {
                            // 收集所有 span 的文字
                            const allSpans = Array.from(spans).map(s => s.textContent?.trim()).filter(s => s);
                            
                            // 尋找商業類型 - 通常是第一個不包含評分和價格的 span
                            for (let i = 0; i < allSpans.length; i++) {
                                const span = allSpans[i];
                                // 強化邏輯，排除評分格式和價格範圍
                                if (span && 
                                    !span.match(/^\d+\.\d+/) && // 不是評分
                                    !span.match(/\d+\.\d+\s*\(\d+/) && // 不是評分加評論數格式
                                    !span.match(/\(\d+[\d,]*\)/) && // 不是評論數
                                    !span.includes('·') && 
                                    !span.match(/\$\d+/) && // 不是價格範圍如 $200-400
                                    !span.match(/^\$+$/) && // 不是價格級別
                                    !span.match(/¥\d+/) && // 不是日圓價格
                                    !span.match(/^[開營已關]/) && // 不是營業狀態
                                    !span.match(/AM|PM|時間|Hours/) && // 不是時間
                                    span.length > 1 && span.length < 50) {
                                    businessType = span;
                                    break;
                                }
                            }
                            
                            // 尋找地址 - 從後往前找，通常地址在後面
                            for (let i = allSpans.length - 1; i >= 0; i--) {
                                const spanText = allSpans[i];
                                
                                // 清理地址，移除開頭的 · 符號
                                const cleanedText = spanText?.replace(/^[·\s]+/, '').trim();
                                
                                // 排除營業時間等非地址資訊
                                if (cleanedText && 
                                    !cleanedText.match(/營業|已打烊|Opens|Closes|AM|PM|⋅|時間/) &&
                                    !cleanedText.match(/\$\d+/) && // 排除價格範圍
                                    (
                                        cleanedText.match(/\d+/) || // 包含數字（門牌）
                                        cleanedText.match(/[區市縣鄉鎮村里路街巷弄號樓]/) || // 中文地址關鍵字
                                        cleanedText.match(/Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Boulevard|Blvd|Lane|Ln|Way|Plaza|Place|Court|Ct/i) || // 英文地址關鍵字
                                        cleanedText.includes(',') // 包含逗號（城市分隔）
                                    )) {
                                    
                                    // 使用清理後的地址
                                    if (!address || cleanedText.length > address.length) {
                                        address = cleanedText;
                                    }
                                }
                            }
                        }
                    });
                    
                    // 如果還是沒有地址，嘗試從整個文字內容提取
                    if (!address) {
                        const fullText = detailDivs[0]?.textContent || '';
                        const parts = fullText.split('·').map(s => s.trim());
                        
                        // 從後往前找地址
                        for (let i = parts.length - 1; i >= 0; i--) {
                            const part = parts[i];
                            if (part && 
                                !part.match(/營業|已打烊|Opens|Closes|AM|PM|⋅/) &&
                                (part.match(/\d+/) || part.match(/[區市縣路街]/))) {
                                address = part;
                                break;
                            }
                        }
                        
                        if (!businessType && parts[0]) businessType = parts[0];
                    }


                    // Extract phone (improved regex to avoid false matches)
                    // Look for patterns like (312) 555-1234 or 312-555-1234 or +1 312 555 1234
                    const phoneMatch = container.textContent.match(/(\+?1?\s*\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/);
                    const phone = phoneMatch ? phoneMatch[1].trim() : '';

                    results.push({
                        name: businessName,
                        placeId,
                        latitude,
                        longitude,
                        rating,
                        reviews,
                        address,
                        businessType,
                        phone,
                        url: href
                    });

                } catch (error) {
                    log.error('Failed to extract business:', error);
                }
            });

            return results;
        });

        // Limit results after extraction if needed
        const limitedBusinesses = businesses.slice(0, this.config.maxResults);
        log.info(`Extracted ${businesses.length} unique businesses, returning ${limitedBusinesses.length}`);
        return limitedBusinesses;
    }

    /**
     * Scrape detailed information from business pages
     */
    async scrapeBusinessDetails(page, businesses) {
        // 處理所有傳入的 businesses，不再額外限制
        const businessesToProcess = businesses;
        
        // First, collect basic details from Google Maps pages
        log.info(`Scraping details for ${businessesToProcess.length} businesses...`);
        
        let successCount = 0;
        let failCount = 0;
        
        for (let i = 0; i < businessesToProcess.length; i++) {
            const business = businessesToProcess[i];
            
            try {
                log.info(`Scraping details for: ${business.name}`);
                
                // Navigate to business page with retry
                await this.retryWithBackoff(async () => {
                    await page.goto(business.url, { 
                        waitUntil: 'networkidle2',
                        timeout: 30000 
                    });
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }, 3, `Navigation to ${business.name}`);


                // 嘗試展開營業時間以取得完整的週間表
                const weeklyHours = await page.evaluate(async () => {
                    // 尋找並點擊營業時間按鈕以展開
                    const hoursButtons = [
                        ...document.querySelectorAll('button[data-item-id*="hour"]'),
                        ...document.querySelectorAll('button[aria-label*="Hours"]'),
                        ...document.querySelectorAll('button[aria-label*="hours"]'),
                        ...document.querySelectorAll('div[aria-label*="Hours"]'),
                        ...Array.from(document.querySelectorAll('button')).filter(btn => {
                            const text = (btn.textContent || '') + (btn.getAttribute('aria-label') || '');
                            return text.match(/\d{1,2}[:]\d{2}|AM|PM|Open|Closed|⋅/);
                        })
                    ];
                    
                    for (const button of hoursButtons) {
                        if (button && typeof button.click === 'function') {
                            try {
                                button.click();
                                // 等待展開
                                await new Promise(resolve => setTimeout(resolve, 1500));
                                
                                // 尋找展開的營業時間表格或列表
                                const hoursContainer = document.querySelector('table[class*="hour"]') ||
                                                      document.querySelector('div[role="dialog"] table') ||
                                                      document.querySelector('div[class*="hour"] ul') ||
                                                      document.querySelector('table tbody');
                                
                                if (hoursContainer) {
                                    const weeklyHours = {};
                                    
                                    // 先嘗試表格格式
                                    const rows = hoursContainer.querySelectorAll('tr');
                                    if (rows.length > 0) {
                                        rows.forEach(row => {
                                            const cells = row.querySelectorAll('td');
                                            if (cells.length >= 2) {
                                                const dayText = cells[0].textContent?.trim() || '';
                                                const hoursText = cells[1].textContent?.trim() || '';
                                                
                                                if (dayText && hoursText) {
                                                    weeklyHours[dayText] = hoursText;
                                                }
                                            }
                                        });
                                    }
                                    
                                    // 嘗試列表格式
                                    if (Object.keys(weeklyHours).length === 0) {
                                        const listItems = hoursContainer.querySelectorAll('li');
                                        listItems.forEach(item => {
                                            const text = item.textContent?.trim() || '';
                                            // 解析像 "Monday: 9:00 AM – 5:00 PM" 的格式
                                            const match = text.match(/^([^:]+):\s*(.+)$/);
                                            if (match) {
                                                weeklyHours[match[1].trim()] = match[2].trim();
                                            }
                                        });
                                    }
                                    
                                    // 如果存在對話框則關閉
                                    const closeBtn = document.querySelector('button[aria-label*="Close"]') ||
                                                   document.querySelector('div[role="dialog"] button[aria-label*="Back"]');
                                    if (closeBtn) closeBtn.click();
                                    
                                    return weeklyHours;
                                }
                                break;
                            } catch (e) {
                                console.log('Failed to expand hours:', e.message);
                            }
                        }
                    }
                    return null;
                }).catch(err => {
                    log.debug('Could not expand hours:', err.message);
                    return null;
                });

                // 提取額外詳情
                const details = await page.evaluate((weeklyHours) => {
                    const data = {};

                    // **重要：提取完整地址並正確格式化**
                    const addressButton = document.querySelector('button[data-item-id="address"]') ||
                                         document.querySelector('button[aria-label*="Address"]') ||
                                         document.querySelector('button[aria-label*="address"]') ||
                                         document.querySelector('button[aria-label*="地址"]');
                    if (addressButton) {
                        // 取得 aria-label 或 textContent
                        const ariaLabel = addressButton.getAttribute('aria-label');
                        const textContent = addressButton.textContent;
                        
                        // 優先使用 aria-label（通常更完整），否則使用 textContent
                        let addressText = '';
                        if (ariaLabel) {
                            // 移除 "Address: " 或 "地址：" 前綴
                            addressText = ariaLabel.replace(/^(Address|地址|주소|Địa chỉ|住所):\s*/i, '').trim();
                        } else if (textContent) {
                            addressText = textContent.trim();
                        }
                        
                        // 格式化地址 - 統一處理各國地址格式
                        if (addressText) {
                            // 清理多餘的空格和換行
                            addressText = addressText.replace(/\s+/g, ' ').trim();
                            
                            // 處理台灣地址格式
                            if (addressText.includes('Taiwan') || addressText.includes('台灣')) {
                                // 台灣地址格式：郵遞區號通常在最後
                                // 例如：No. 1, Sec. 1, Zhongshan S Rd, Zhongzheng District, Taipei City, Taiwan 100
                                // 保持原始格式，因為中文環境習慣郵遞區號在最後
                                data.address = addressText;
                            } else if (addressText.includes('Japan') || addressText.includes('日本')) {
                                // 日本地址：確保郵遞區號格式正確 (〒XXX-XXXX)
                                let formatted = addressText;
                                // 標準化郵遞區號格式
                                formatted = formatted.replace(/〒?(\d{3})-?(\d{4})/, '〒$1-$2');
                                // 如果有日本但沒有郵遞區號格式，嘗試找7位數字
                                if (!formatted.includes('〒')) {
                                    formatted = formatted.replace(/(\d{3})(\d{4})/, '〒$1-$2');
                                }
                                data.address = formatted;
                            } else if (addressText.includes('Korea') || addressText.includes('대한민국') || addressText.includes('South Korea')) {
                                // 韓國地址：郵遞區號通常是5位數字
                                const postalMatch = addressText.match(/\b(\d{5})\b/);
                                if (postalMatch) {
                                    const postal = postalMatch[1];
                                    // 如果郵遞區號不在開頭，移到開頭（韓國習慣）
                                    if (!addressText.startsWith(postal)) {
                                        const cleaned = addressText.replace(postal, '').replace(/,\s*,/, ',').replace(/^\s*,/, '').trim();
                                        data.address = `${postal} ${cleaned}`;
                                    } else {
                                        data.address = addressText;
                                    }
                                } else {
                                    data.address = addressText;
                                }
                            } else if (addressText.includes('United States') || addressText.includes('USA')) {
                                // 美國地址：郵遞區號通常在最後 (ZIP or ZIP+4)
                                // 確保格式正確，例如：123 Main St, City, ST 12345 or 12345-6789
                                data.address = addressText.replace(/(\d{5})(-\d{4})?/, '$1$2');
                            } else {
                                // 其他國家地址保持原樣，只清理多餘空格
                                data.address = addressText;
                            }
                            
                            // 最終清理：確保沒有多餘的逗號和空格
                            data.address = data.address
                                .replace(/,\s*,/g, ',')  // 移除重複逗號
                                .replace(/^\s*,/, '')     // 移除開頭逗號
                                .replace(/,\s*$/, '')     // 移除結尾逗號
                                .trim();
                        }
                    }

                    // Phone number
                    const phoneButton = Array.from(document.querySelectorAll('button[aria-label*="Phone"]'))
                        .concat(Array.from(document.querySelectorAll('button[aria-label*="phone"]')))
                        .concat(Array.from(document.querySelectorAll('button[aria-label*="電話"]')));
                    if (phoneButton.length > 0) {
                        data.phone = phoneButton[0].getAttribute('aria-label')?.replace(/[^\d+()-\s]/g, '').trim();
                    }

                    // Website
                    const websiteButton = Array.from(document.querySelectorAll('a[aria-label*="Website"]'))
                        .concat(Array.from(document.querySelectorAll('a[aria-label*="website"]')))
                        .concat(Array.from(document.querySelectorAll('a[aria-label*="網站"]')));
                    if (websiteButton.length > 0) {
                        data.website = websiteButton[0].href;
                    }

                    // Hours - 格式化為 array 格式
                    let hoursArray = [];
                    
                    // 如果已經有展開的週間營業時間，轉換為 array
                    if (weeklyHours && Object.keys(weeklyHours).length > 0) {
                        // 按照星期順序排列
                        const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
                        const dayOrderChinese = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
                        const dayOrderKorean = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
                        
                        // 先嘗試英文星期
                        for (const day of dayOrder) {
                            if (weeklyHours[day]) {
                                // 修復時間格式問題：分隔多個時間段
                                // 匹配格式如 12:00–15:0017:30–22:00，在兩個時間段之間加空格
                                const cleanedHours = weeklyHours[day]
                                    .replace(/(\d{1,2}:\d{2}[–-]\d{1,2}:\d{2})(\d{1,2}:\d{2}[–-]\d{1,2}:\d{2})/g, '$1 $2')
                                    .replace(/(\d{2}:\d{2})(\d{2}:\d{2})/g, '$1 $2');
                                hoursArray.push(`${day}: ${cleanedHours}`);
                            }
                        }
                        
                        // 如果沒有英文，嘗試中文
                        if (hoursArray.length === 0) {
                            for (const day of dayOrderChinese) {
                                if (weeklyHours[day]) {
                                    const cleanedHours = weeklyHours[day]
                                        .replace(/(\d{1,2}:\d{2}[–-]\d{1,2}:\d{2})(\d{1,2}:\d{2}[–-]\d{1,2}:\d{2})/g, '$1 $2')
                                        .replace(/(\d{2}:\d{2})(\d{2}:\d{2})/g, '$1 $2');
                                    hoursArray.push(`${day}: ${cleanedHours}`);
                                }
                            }
                        }
                        
                        // 如果還是沒有，直接使用原始順序
                        if (hoursArray.length === 0) {
                            for (const [day, hours] of Object.entries(weeklyHours)) {
                                // 過濾掉包含「營業時間可能不同」的特殊日期
                                if (!day.includes('營業時間可能不同')) {
                                    const cleanedDay = day.replace(/\([^)]+\)/, '').trim(); // 移除括號內容
                                    const cleanedHours = hours
                                        .replace(/(\d{1,2}:\d{2}[–-]\d{1,2}:\d{2})(\d{1,2}:\d{2}[–-]\d{1,2}:\d{2})/g, '$1 $2')
                                        .replace(/(\d{2}:\d{2})(\d{2}:\d{2})/g, '$1 $2')
                                        .replace('營業時間可能不同', '').trim();
                                    if (cleanedHours) {
                                        hoursArray.push(`${cleanedDay}: ${cleanedHours}`);
                                    }
                                }
                            }
                        }
                        
                        data.hours = hoursArray;
                        data.hoursDetail = weeklyHours; // 保存結構化資料供額外參考
                    } else {
                        // 否則嘗試從頁面提取當前顯示的營業時間
                        const hoursButtons = [
                            ...document.querySelectorAll('button[data-item-id*="hour"]'),
                            ...document.querySelectorAll('button[data-item-id*="oh"]'),
                            ...document.querySelectorAll('button[aria-label*="Hours"]'),
                            ...document.querySelectorAll('button[aria-label*="hours"]'),
                            ...document.querySelectorAll('button[aria-label*="營業時間"]'),
                            ...document.querySelectorAll('button[aria-label*="時間"]'),
                            ...document.querySelectorAll('div[aria-label*="Hours"]'),
                            ...document.querySelectorAll('span[aria-label*="Hours"]')
                        ];
                        
                        for (const element of hoursButtons) {
                            const text = (element.textContent || '') + (element.getAttribute('aria-label') || '');
                            if (text.match(/\d{1,2}[:]\d{2}|AM|PM|am|pm|時|点|시|giờ|Open|Closed|營業|打烊/)) {
                                const hoursText = element.getAttribute('aria-label') || element.textContent || '';
                                
                                if (hoursText && hoursText.length > 5) {
                                    const cleanedHours = hoursText
                                        .replace(/[\ue000-\uf8ff]/g, '')
                                        .replace(/[\ud83c-\ud83f][\udc00-\udfff]/g, '')
                                        .replace(/\s+/g, ' ')
                                        .trim();
                                    
                                    // 單一時間字串也包裝成 array
                                    data.hours = [cleanedHours];
                                    break;
                                }
                            }
                        }
                    }
                    
                    // Method 2: 如果還沒找到營業時間，搜尋包含時間模式的文字
                    if ((!data.hours || data.hours.length === 0)) {
                        const allElements = document.querySelectorAll('button, div, span');
                        for (const element of allElements) {
                            const text = element.textContent || '';
                            
                            // 檢查是否包含時間格式 (如 "7 AM to 10:30 PM")
                            if (text.match(/\d{1,2}\s*(:|：)\s*\d{2}\s*(AM|PM|am|pm)/)) {
                                // 確保不是太長的文字塊
                                if (text.length < 500) {
                                    const cleanedText = text
                                        .replace(/[\ue000-\uf8ff]/g, '')
                                        .replace(/\s+/g, ' ')
                                        .trim();
                                    data.hours = [cleanedText]; // 包裝成 array
                                    break;
                                }
                            }
                        }
                    }
                    
                    // Method 3: 尋找 "Open" 或 "Closed" 狀態
                    if ((!data.hours || data.hours.length === 0)) {
                        const statusElements = document.querySelectorAll('span, div');
                        for (const element of statusElements) {
                            const text = element.textContent || '';
                            if (text.match(/^(Open|Closed|營業中|已打烊|열림|닫힘)/)) {
                                // 嘗試獲取完整的營業時間資訊
                                const parent = element.parentElement;
                                if (parent) {
                                    const parentText = parent.textContent || '';
                                    if (parentText.includes('⋅') || parentText.includes('·')) {
                                        const cleanedText = parentText
                                            .replace(/[\ue000-\uf8ff]/g, '')
                                            .replace(/\s+/g, ' ')
                                            .trim();
                                        data.hours = [cleanedText]; // 包裝成 array
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    
                    // Price Level - 正確區分價格級別和實際價格
                    let priceFound = false;
                    
                    // Price Level 應該只是 $, $$, $$$, $$$$ 這種級別標示
                    // 而不是實際價格如 $100, ¥500 等
                    
                    // Method 1: 尋找價格級別元素（通常在資訊欄位中）
                    const priceLevelElements = [
                        ...document.querySelectorAll('span[aria-label*="Price level"]'),
                        ...document.querySelectorAll('span[aria-label*="price level"]'),
                        ...document.querySelectorAll('button[aria-label*="Price level"]'),
                        ...document.querySelectorAll('span[aria-label*="價格級別"]'),
                        ...document.querySelectorAll('span[aria-label*="가격 수준"]'),
                        ...document.querySelectorAll('[data-attrid*="price_level"]')
                    ];
                    
                    for (const element of priceLevelElements) {
                        const text = element.textContent?.trim() || '';
                        const ariaLabel = element.getAttribute('aria-label') || '';
                        
                        // 只接受純粹的價格級別符號（1-4個相同符號）
                        const levelMatch = (text + ' ' + ariaLabel).match(/(?:^|\s)([$·]{1,4})(?:\s|$)/);
                        if (levelMatch) {
                            const level = levelMatch[1];
                            // 確保是重複的符號（如 $$ 或 $$$），不是價格（如 $100）
                            if (/^(.)\1*$/.test(level) && level.length <= 4) {
                                data.priceLevel = level.replace(/·/g, '$');
                                priceFound = true;
                                break;
                            }
                        }
                    }
                    
                    // Method 2: 從一般 span 元素中尋找（但要更嚴格的驗證）
                    if (!priceFound) {
                        const allSpans = document.querySelectorAll('span');
                        
                        for (const span of allSpans) {
                            const text = span.textContent?.trim() || '';
                            
                            // 只接受純粹的重複符號 ($$, $$$, etc.)
                            if (/^[$·]{1,4}$/.test(text)) {
                                // 確保是重複的同一個符號
                                const uniqueChars = [...new Set(text)];
                                if (uniqueChars.length === 1 && text.length <= 4) {
                                    // 檢查附近是否有價格相關的上下文
                                    const parent = span.parentElement;
                                    const context = parent?.textContent?.toLowerCase() || '';
                                    
                                    // 避免誤抓實際價格（如果包含數字就不是價格級別）
                                    if (!context.match(/\d/) && 
                                        (context.includes('price') || context.includes('價') || 
                                         context.includes('level') || context.includes('級') ||
                                         // 或者這個元素有特殊樣式（表示是重要資訊）
                                         span.getAttribute('aria-label') || 
                                         span.closest('button[aria-label]'))) {
                                        data.priceLevel = text.replace(/·/g, '$');
                                        priceFound = true;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    
                    // Method 3: 從按鈕的 aria-label 屬性尋找價格描述
                    if (!priceFound) {
                        const buttons = document.querySelectorAll('button[aria-label]');
                        for (const button of buttons) {
                            const ariaLabel = button.getAttribute('aria-label') || '';
                            const buttonText = button.textContent?.trim() || '';
                            
                            // 檢查 aria-label 中的價格資訊
                            if (ariaLabel.toLowerCase().includes('price')) {
                                const priceMatch = ariaLabel.match(/[$·]{1,4}/);
                                if (priceMatch) {
                                    data.priceLevel = priceMatch[0].replace(/·/g, '$');
                                    priceFound = true;
                                    break;
                                }
                                // 檢查文字描述
                                if (ariaLabel.match(/expensive|moderate|inexpensive/i)) {
                                    data.priceLevel = ariaLabel.match(/very expensive/i) ? '$$$$' :
                                                     ariaLabel.match(/expensive/i) ? '$$$' :
                                                     ariaLabel.match(/moderate/i) ? '$$' : '$';
                                    priceFound = true;
                                    break;
                                }
                            }
                            
                            // 檢查按鈕文字是否為價格符號
                            if (buttonText.match(/^[$·]{1,4}$/)) {
                                data.priceLevel = buttonText.replace(/·/g, '$');
                                priceFound = true;
                                break;
                            }
                        }
                    }
                    
                    // Method 3: 從評論摘要或描述中提取
                    if (!priceFound) {
                        // Google Maps 有時在評論摘要中顯示價格
                        const reviewSummary = document.querySelector('[data-attrid*="review"]');
                        if (reviewSummary) {
                            const reviewText = reviewSummary.textContent || '';
                            const priceMatch = reviewText.match(/[$]{1,4}/);
                            if (priceMatch) {
                                data.priceLevel = priceMatch[0];
                                priceFound = true;
                            }
                        }
                    }
                    
                    // Method 4: 使用 XPath 尋找特定位置的價格
                    if (!priceFound) {
                        try {
                            // XPath: 尋找包含貨幣符號的文字節點
                            const xpathResult = document.evaluate(
                                '//text()[normalize-space(.)=translate(normalize-space(.), "0123456789.,", "") and contains(., "$")]',
                                document,
                                null,
                                XPathResult.FIRST_ORDERED_NODE_TYPE,
                                null
                            );
                            
                            if (xpathResult.singleNodeValue) {
                                const text = xpathResult.singleNodeValue.textContent?.trim();
                                if (text && text.match(/^[$]{1,4}$/)) {
                                    data.priceLevel = text;
                                    priceFound = true;
                                }
                            }
                        } catch (e) {
                            // XPath failed, continue
                        }
                    }
                    
                    // Method 5: 檢查多語言價格描述
                    if (!priceFound) {
                        const priceKeywords = {
                            en: ['expensive', 'moderate', 'inexpensive', 'cheap'],
                            zh: ['昂貴', '中等', '便宜', '實惠'],
                            ja: ['高価', '普通', '安い', 'リーズナブル'],
                            ko: ['비싼', '보통', '저렴', '싸다']
                        };
                        
                        const pageText = (document.body.textContent || '').toLowerCase();
                        
                        // 檢查各語言的價格描述
                        if (pageText.includes('very expensive') || pageText.includes('非常昂貴')) {
                            data.priceLevel = '$$$$';
                        } else if (pageText.includes('expensive') || pageText.includes('昂貴') || 
                                  pageText.includes('高価') || pageText.includes('비싼')) {
                            data.priceLevel = '$$$';
                        } else if (pageText.includes('moderate') || pageText.includes('中等') ||
                                  pageText.includes('普通') || pageText.includes('보통')) {
                            data.priceLevel = '$$';
                        } else if (pageText.includes('inexpensive') || pageText.includes('cheap') ||
                                  pageText.includes('便宜') || pageText.includes('安い') || 
                                  pageText.includes('저렴')) {
                            data.priceLevel = '$';
                        }
                    }
                    
                    // Business Type - 從詳細頁面提取，避免錯誤的評分數據
                    const typeElements = [
                        document.querySelector('button[jsaction*="category"]'),
                        document.querySelector('span[class*="DkEaL"]'),
                        document.querySelector('[data-value="category"]'),
                        ...Array.from(document.querySelectorAll('span')).filter(span => {
                            const text = span.textContent?.trim();
                            return text && text.length > 2 && text.length < 50 && 
                                   !text.match(/\d+\.\d+/) && // 不包含評分
                                   !text.match(/\(\d+[\d,]*\)/) && // 不包含評論數
                                   !text.includes('·') && 
                                   !text.match(/\$+/) && // 不包含價格
                                   !text.match(/^[開營已關]/) && // 不是營業狀態
                                   !text.match(/AM|PM|時間|Hours/) && // 不是時間相關
                                   !text.includes('拖曳即可變更') && // 排除介面文字
                                   !text.includes('Drag to reposition') && // 排除英文介面文字
                                   !text.includes('收合側邊面板') && // 排除側邊面板文字
                                   !text.includes('Collapse side panel') && // 排除英文側邊面板文字
                                   !text.includes('折叠侧边栏') && // 排除簡體中文
                                   !text.includes('사이드 패널 축소') && // 排除韓文
                                   !text.includes('サイドパネルを折りたたむ'); // 排除日文
                        })
                    ].filter(Boolean);
                    
                    for (const element of typeElements) {
                        const typeText = element.textContent?.trim();
                        if (typeText && typeText.length > 2 && typeText.length < 50) {
                            // 雙重檢查，確保不是評分格式或介面文字
                            if (!typeText.match(/^\d+\.\d+\s*\(\d+/) && 
                                !typeText.match(/\d+\.\d+/) && 
                                !typeText.includes('(') &&
                                !typeText.includes('拖曳即可變更') &&
                                !typeText.includes('Drag to reposition') &&
                                !typeText.includes('收合側邊面板') &&
                                !typeText.includes('Collapse side panel') &&
                                !typeText.includes('折叠侧边栏') &&
                                !typeText.includes('사이드 패널 축소') &&
                                !typeText.includes('サイドパネルを折りたたむ')) {
                                data.businessType = typeText;
                                break;
                            }
                        }
                    }

                    return data;
                }, weeklyHours); // 傳入weeklyHours參數

                // Merge details - 只更新有值的欄位，並清理資料
                if (details.address) {
                    business.address = validateAddress(details.address);
                }
                if (details.phone) {
                    business.phone = details.phone;
                }
                if (details.website) {
                    business.website = details.website;
                }
                if (details.hours) {
                    // hours 應該是 array 格式
                    if (Array.isArray(details.hours)) {
                        business.hours = details.hours;
                    } else if (typeof details.hours === 'string') {
                        // 如果還是字串，包裝成 array
                        business.hours = [cleanBusinessHours(details.hours)];
                    }
                }
                if (details.hoursDetail) {
                    // hoursDetail 保存結構化的物件格式
                    business.hoursDetail = details.hoursDetail;
                }
                if (details.priceLevel) {
                    business.priceLevel = extractPriceLevel(details.priceLevel);
                }
                if (details.businessType) {
                    business.businessType = extractBusinessType(details.businessType);
                }

                successCount++;
                
                // 進度更新
                if ((i + 1) % 5 === 0 || i === businessesToProcess.length - 1) {
                    log.info(`Processed ${i + 1}/${businessesToProcess.length} businesses (${successCount} success, ${failCount} failed)`);
                }

                // Be nice to Google (reduced delay)
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (error) {
                failCount++;
                log.error(`Failed to scrape details for ${business.name}:`, error.message);
                
                // 進度更新
                if ((i + 1) % 5 === 0 || i === businessesToProcess.length - 1) {
                    log.info(`Processed ${i + 1}/${businessesToProcess.length} businesses (${successCount} success, ${failCount} failed)`);
                }
            }
        }
        
        // Batch email extraction if requested
        if (this.config.scrapeEmails) {
            log.info('Extracting emails from websites in parallel...');
            const batchExtractor = new BatchEmailExtractor(page, {
                batchSize: 5,
                timeout: 5000
            });
            
            // Filter businesses with websites
            const businessesWithWebsites = businessesToProcess.filter(b => b.website && !b.website.includes('google.com'));
            
            if (businessesWithWebsites.length > 0) {
                const updatedBusinesses = await batchExtractor.extractEmailsBatch(businessesWithWebsites);
                
                // Update original businesses with email data
                updatedBusinesses.forEach(updated => {
                    const original = businesses.find(b => b.placeId === updated.placeId);
                    if (original) {
                        original.email = updated.email;
                        original.emails = updated.emails;
                        if (updated.emails && updated.emails.length > 0) {
                            this.stats.emailsExtracted += updated.emails.length;
                        }
                    }
                });
                
                log.info(`Extracted ${this.stats.emailsExtracted} emails total`);
            }
        }
    }

    /**
     * Multi-region search strategy to get 100+ results
     */
    async searchMultipleQueries(baseQuery, regions = []) {
        const allResults = [];
        const seenPlaceIds = new Set();
        
        // Default regions if not provided
        if (regions.length === 0) {
            regions = ['', 'North', 'South', 'East', 'West', 'Downtown', 'Near me'];
        }
        
        for (const region of regions) {
            const query = region ? `${baseQuery} ${region}` : baseQuery;
            log.info(`Searching: ${query}`);
            
            try {
                const results = await this.search(query);
                
                // Deduplicate results
                for (const business of results) {
                    if (!seenPlaceIds.has(business.placeId)) {
                        seenPlaceIds.add(business.placeId);
                        allResults.push(business);
                    }
                }
                
                log.info(`Found ${results.length} results for "${query}", total unique: ${allResults.length}`);
                
                // Stop if we have enough results
                if (allResults.length >= this.config.maxResults) {
                    break;
                }
                
                // Rate limiting between searches
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                log.error(`Failed to search "${query}": ${error.message}`);
            }
        }
        
        this.results = allResults.slice(0, this.config.maxResults);
        return this.results;
    }
    
    /**
     * Get statistics
     */
    getStats() {
        return {
            ...this.stats,
            finalResultCount: this.results.length
        };
    }

    /**
     * Close browser
     */
    async close() {
        if (this.browser) {
            try {
                // Close all pages first
                const pages = await this.browser.pages();
                await Promise.all(pages.map(page => page.close()));
                
                // Then close the browser
                await this.browser.close();
                this.browser = null;
                log.info('Browser closed');
            } catch (error) {
                log.warning('Error closing browser:', error);
                // Force close if regular close fails
                if (this.browser) {
                    this.browser = null;
                }
            }
        }
    }
}

module.exports = GoogleMapsScraper;