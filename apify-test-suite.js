/**
 * Apify 測試套件執行器
 * 用於在 Apify 平台上執行所有測試
 */

const { Actor } = require('apify');

// 測試配置集合
const TEST_SUITE = {
    // 基礎功能測試
    basic: [
        {
            name: '中文搜尋測試',
            input: {
                searchQueries: ['台北 咖啡廳'],
                maxResults: 3,
                language: 'zh-TW',
                scrapeDetails: false
            },
            validate: (results) => {
                return results.length > 0 && 
                       results.every(r => r.name && r.placeId);
            }
        },
        {
            name: '英文搜尋測試',
            input: {
                searchQueries: ['restaurants taipei'],
                maxResults: 3,
                language: 'en',
                scrapeDetails: false
            },
            validate: (results) => {
                return results.length > 0;
            }
        }
    ],
    
    // 詳細資訊測試
    details: [
        {
            name: '詳細資訊爬取',
            input: {
                searchQueries: ['星巴克 信義'],
                maxResults: 2,
                scrapeDetails: true,
                scrapeEmails: false
            },
            validate: (results) => {
                return results.length > 0 &&
                       results.some(r => r.phone || r.website || r.hours);
            }
        }
    ],
    
    // 資料品質測試
    quality: [
        {
            name: 'Place ID 格式檢查',
            input: {
                searchQueries: ['便利商店 台北'],
                maxResults: 5,
                scrapeDetails: false
            },
            validate: (results) => {
                return results.every(r => 
                    r.placeId && !r.placeId.includes('?')
                );
            }
        },
        {
            name: '地址格式檢查',
            input: {
                searchQueries: ['醫院 台北'],
                maxResults: 3,
                scrapeDetails: true
            },
            validate: (results) => {
                return results.every(r => 
                    !r.address || !r.address.match(/^[\d.]+\s*\([0-9,]+\)$/)
                );
            }
        }
    ],
    
    // 邊界測試
    edge: [
        {
            name: '空結果測試',
            input: {
                searchQueries: ['xyzabc123 nowhere'],
                maxResults: 10,
                scrapeDetails: false
            },
            validate: (results) => {
                return results.length === 0 || results[0].error;
            }
        },
        {
            name: '大量結果測試',
            input: {
                searchQueries: ['餐廳'],
                maxResults: 50,
                scrapeDetails: false
            },
            validate: (results) => {
                return results.length >= 20;
            }
        }
    ]
};

Actor.main(async () => {
    console.log('🚀 開始 Apify 測試套件執行\n');
    
    const testResults = {
        passed: [],
        failed: [],
        errors: []
    };
    
    // 執行所有測試類別
    for (const [category, tests] of Object.entries(TEST_SUITE)) {
        console.log(`\n📋 測試類別: ${category.toUpperCase()}`);
        console.log('='.repeat(50));
        
        for (const test of tests) {
            console.log(`\n執行: ${test.name}`);
            
            try {
                // 取得輸入
                const input = test.input;
                
                // 執行爬蟲
                const { Actor: ActorClass } = require('apify');
                const { default: GoogleMapsScraper } = require('./src/scraper/GoogleMapsScraper');
                
                // 模擬 Actor 執行
                const dataset = await ActorClass.openDataset();
                const scraper = new GoogleMapsScraper(input);
                
                await scraper.init();
                const results = await scraper.search();
                
                // 儲存結果
                await dataset.pushData(results);
                
                // 驗證結果
                if (test.validate(results)) {
                    console.log(`✅ 通過: ${test.name}`);
                    testResults.passed.push({
                        category,
                        name: test.name,
                        resultCount: results.length
                    });
                } else {
                    console.log(`❌ 失敗: ${test.name}`);
                    testResults.failed.push({
                        category,
                        name: test.name,
                        reason: '驗證失敗'
                    });
                }
                
                await scraper.close();
                
            } catch (error) {
                console.log(`💥 錯誤: ${test.name} - ${error.message}`);
                testResults.errors.push({
                    category,
                    name: test.name,
                    error: error.message
                });
            }
            
            // 測試間隔
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    // 生成測試報告
    console.log('\n' + '='.repeat(60));
    console.log('📊 測試報告');
    console.log('='.repeat(60));
    
    const total = testResults.passed.length + testResults.failed.length + testResults.errors.length;
    const passRate = (testResults.passed.length / total * 100).toFixed(2);
    
    console.log(`\n總測試數: ${total}`);
    console.log(`✅ 通過: ${testResults.passed.length}`);
    console.log(`❌ 失敗: ${testResults.failed.length}`);
    console.log(`💥 錯誤: ${testResults.errors.length}`);
    console.log(`📈 通過率: ${passRate}%`);
    
    // 詳細失敗資訊
    if (testResults.failed.length > 0) {
        console.log('\n失敗測試:');
        testResults.failed.forEach(t => {
            console.log(`  - ${t.category}/${t.name}: ${t.reason}`);
        });
    }
    
    if (testResults.errors.length > 0) {
        console.log('\n錯誤測試:');
        testResults.errors.forEach(t => {
            console.log(`  - ${t.category}/${t.name}: ${t.error}`);
        });
    }
    
    // 儲存測試結果
    await Actor.setValue('TEST_RESULTS', {
        timestamp: new Date().toISOString(),
        results: testResults,
        passRate: passRate
    });
    
    // 判定整體結果
    if (passRate >= 90) {
        console.log('\n🎉 測試套件通過！');
    } else if (passRate >= 70) {
        console.log('\n⚠️ 測試套件部分通過');
    } else {
        console.log('\n❌ 測試套件失敗');
        throw new Error('Test suite failed');
    }
    
    return testResults;
});