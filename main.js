/**
 * Apify Actor 進入點
 * Google Maps 商家爬蟲 - 提取 100+ 商家列表
 */

const { Actor, log } = require('apify');
const GoogleMapsScraper = require('./src/scraper/GoogleMapsScraper');

// 輸入驗證函式
const validateInput = (input) => {
    if (!input) {
        throw new Error('No input provided');
    }
    
    // 驗證最大結果數量
    if (input.maxResults && input.maxResults > 200) {
        log.warning('maxResults capped at 200 (was ' + input.maxResults + ')');
        input.maxResults = 200;
    }
    
    // 清理搜尋查詢
    if (input.searchQueries) {
        input.searchQueries = input.searchQueries
            .filter(q => q && typeof q === 'string' && q.trim())
            .map(q => q.trim());
    }
    
    // 驗證最大滾動次數
    if (input.maxScrolls && input.maxScrolls > 100) {
        log.warning('maxScrolls capped at 100 (was ' + input.maxScrolls + ')');
        input.maxScrolls = 100;
    }
    
    return input;
};

Actor.main(async () => {
    // 取得輸入參數
    let input = await Actor.getInput();
    log.info('Starting Google Maps Business Scraper');
    log.info('Input:', input);

    // 驗證輸入參數
    input = validateInput(input);

    const {
        searchQueries = [],
        startUrls = [],
        maxResults = 100,
        language = 'en',
        scrapeDetails = true,
        scrapeEmails = true,
        maxScrolls = 50,
        useMultiSearch = false,
        searchRegions = []
    } = input;

    // 驗證是否有搜尋內容
    if (searchQueries.length === 0 && startUrls.length === 0) {
        throw new Error('Please provide either searchQueries or startUrls');
    }

    // 初始化資料集
    const dataset = await Actor.openDataset();
    
    // 統計資訊
    const stats = {
        totalSearches: 0,
        totalResults: 0,
        failedSearches: 0,
        startTime: Date.now()
    };

    // 處理搜尋查詢
    for (const query of searchQueries) {
        try {
            log.info(`Processing search query: ${query}`);
            stats.totalSearches++;
            
            // 建立爬蟲實例（不支援代理）
            const scraper = new GoogleMapsScraper({
                searchQuery: query,
                maxResults,
                language,
                headless: true,
                maxScrolls,
                scrapeDetails,
                scrapeEmails
            });

            // 初始化並執行爬蟲
            await scraper.init();
            
            let results;
            if (useMultiSearch && maxResults > 50) {
                // 對大結果集使用多區域搜尋
                results = await scraper.searchMultipleQueries(query, searchRegions);
            } else {
                // 單一搜尋
                results = await scraper.search();
            }
            
            log.info(`Found ${results.length} results for "${query}"`);
            stats.totalResults += results.length;

            // 批次儲存結果到資料集
            const BATCH_SIZE = 50;
            for (let i = 0; i < results.length; i += BATCH_SIZE) {
                const batch = results.slice(i, i + BATCH_SIZE).map(business => ({
                    query,
                    timestamp: new Date().toISOString(),
                    ...business
                }));
                await dataset.pushData(batch);
            }

            // 清理資源
            await scraper.close();

            // 對 Google 友好的延遲
            await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
            log.error(`Failed to process query "${query}":`, error.message);
            log.error('Error stack:', error.stack);
            stats.failedSearches++;
            
            // 儲存錯誤到資料集
            await dataset.pushData({
                query,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    // 處理起始網址（如果有提供）
    for (const urlObj of startUrls) {
        try {
            const url = urlObj.url || urlObj;
            log.info(`Processing URL: ${url}`);
            stats.totalSearches++;

            // 從網址提取搜尋查詢
            const urlParams = new URL(url);
            const searchPath = urlParams.pathname.split('/search/')[1];
            const searchQuery = searchPath ? decodeURIComponent(searchPath.split('/')[0]) : 'Direct URL';

            // 建立爬蟲實例（不支援代理）
            const scraper = new GoogleMapsScraper({
                directUrl: url,
                searchQuery,
                maxResults,
                language,
                headless: true,
                maxScrolls,
                scrapeDetails,
                scrapeEmails
            });

            // 初始化並執行爬蟲
            await scraper.init();
            const results = await scraper.searchByUrl(url);
            
            log.info(`Found ${results.length} results from URL`);
            stats.totalResults += results.length;

            // 批次儲存結果到資料集
            const BATCH_SIZE = 50;
            for (let i = 0; i < results.length; i += BATCH_SIZE) {
                const batch = results.slice(i, i + BATCH_SIZE).map(business => ({
                    sourceUrl: url,
                    query: searchQuery,
                    timestamp: new Date().toISOString(),
                    ...business
                }));
                await dataset.pushData(batch);
            }

            // 清理資源
            await scraper.close();

            // 對 Google 友好的延遲
            await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
            log.error(`Failed to process URL "${urlObj.url || urlObj}":`, error.message);
            log.error('Error stack:', error.stack);
            stats.failedSearches++;
            
            // 儲存錯誤到資料集
            await dataset.pushData({
                sourceUrl: urlObj.url,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    // 計算最終統計
    const duration = Math.round((Date.now() - stats.startTime) / 1000);
    const finalStats = {
        ...stats,
        duration: `${duration} seconds`,
        averageResultsPerSearch: stats.totalSearches > 0 ? 
            Math.round(stats.totalResults / stats.totalSearches) : 0,
        successRate: stats.totalSearches > 0 ? 
            `${Math.round(((stats.totalSearches - stats.failedSearches) / stats.totalSearches) * 100)}%` : '0%'
    };

    log.info('Scraping completed!');
    log.info('Final statistics:', finalStats);

    // 儲存統計到鍵值存儲
    await Actor.setValue('STATS', finalStats);

    // 建立摘要
    const summary = {
        totalResults: stats.totalResults,
        totalSearches: stats.totalSearches,
        failedSearches: stats.failedSearches,
        duration: finalStats.duration,
        averageResultsPerSearch: finalStats.averageResultsPerSearch,
        successRate: finalStats.successRate
    };

    log.info('Summary:', summary);
    
    // 確保所有資源正確關閉
    // 小延遲以確保所有非同步操作完成
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return summary;
});