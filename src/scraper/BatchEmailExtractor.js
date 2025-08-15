/**
 * 批次電子郵件提取器
 * 用於並行處理多個網站的電子郵件提取
 */

const { log } = require('apify');

/**
 * 批次電子郵件提取器類別
 */
class BatchEmailExtractor {
    /**
     * 建構函式
     * @param {Page} page - Puppeteer 頁面實例
     * @param {Object} config - 配置選項
     */
    constructor(page, config = {}) {
        this.page = page;  // Puppeteer 頁面實例
        this.config = {
            batchSize: config.batchSize || 5,      // 批次大小
            timeout: config.timeout || 5000,       // 超時時間（毫秒）
            maxRetries: config.maxRetries || 1     // 最大重試次數
        };
    }
    
    /**
     * 從多個商家網站並行提取電子郵件
     * @param {Array} businesses - 商家資料陣列
     * @returns {Promise<Array>} - 包含電子郵件的商家資料
     */
    async extractEmailsBatch(businesses) {
        const results = [];
        
        // 分批處理
        for (let i = 0; i < businesses.length; i += this.config.batchSize) {
            const batch = businesses.slice(i, i + this.config.batchSize);
            
            log.info(`Processing email batch ${Math.floor(i / this.config.batchSize) + 1} of ${Math.ceil(businesses.length / this.config.batchSize)}`);
            
            // 並行處理批次
            const batchPromises = batch.map(async (business) => {
                if (!business.website || business.website.includes('google.com')) {
                    return { ...business, email: null, emails: [] };
                }
                
                try {
                    const emails = await this.extractFromWebsite(business.website);
                    return {
                        ...business,
                        emails: emails,
                        email: emails[0] || null
                    };
                } catch (error) {
                    log.debug(`Failed to extract email for ${business.name}: ${error.message}`);
                    return { ...business, email: null, emails: [] };
                }
            });
            
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
            
            // 批次間的小延遲
            if (i + this.config.batchSize < businesses.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        return results;
    }
    
    /**
     * Extract emails from a single website
     */
    async extractFromWebsite(url) {
        const newPage = await this.page.browser().newPage();
        
        try {
            // Configure page for speed
            await newPage.setRequestInterception(true);
            newPage.on('request', (req) => {
                const resourceType = req.resourceType();
                if (['image', 'media', 'font', 'stylesheet'].includes(resourceType)) {
                    req.abort();
                } else {
                    req.continue();
                }
            });
            
            // Set shorter timeout
            await newPage.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: this.config.timeout
            });
            
            // Quick check for emails
            const emails = await newPage.evaluate(() => {
                const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
                const foundEmails = new Set();
                
                // Check text content
                const text = document.body.innerText || '';
                const matches = text.match(emailRegex) || [];
                matches.forEach(email => foundEmails.add(email.toLowerCase()));
                
                // Check mailto links
                document.querySelectorAll('a[href^="mailto:"]').forEach(link => {
                    const email = link.href.replace('mailto:', '').split('?')[0].toLowerCase();
                    if (email) foundEmails.add(email);
                });
                
                return Array.from(foundEmails);
            });
            
            await newPage.close();
            return this.filterValidEmails(emails);
            
        } catch (error) {
            await newPage.close();
            throw error;
        }
    }
    
    /**
     * Filter valid emails
     */
    filterValidEmails(emails) {
        const blacklist = ['example.com', 'sentry.io', 'wixpress.com', 'noreply', 'no-reply'];
        
        return emails.filter(email => {
            const lower = email.toLowerCase();
            return !blacklist.some(blocked => lower.includes(blocked)) &&
                   /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
        });
    }
}

module.exports = BatchEmailExtractor;