/**
 * 完整整合測試套件
 * 在 Apify 平台上執行全面測試
 */

const { Actor } = require('apify');

// 測試配置
const TEST_CONFIGS = {
    // 功能測試組
    functional: [
        {
            name: '基本搜尋測試',
            input: {
                searchQueries: ['咖啡廳 台北車站'],
                maxResults: 5,
                scrapeDetails: false,
                scrapeEmails: false
            },
            expectations: {
                minResults: 3,
                maxResults: 5,
                requiredFields: ['name', 'placeId', 'rating', 'address']
            }
        },
        {
            name: '詳細資訊爬取測試',
            input: {
                searchQueries: ['星巴克 信義區'],
                maxResults: 3,
                scrapeDetails: true,
                scrapeEmails: false
            },
            expectations: {
                minResults: 1,
                requiredFields: ['name', 'placeId', 'phone', 'website', 'hours', 'address']
            }
        },
        {
            name: '電子郵件提取測試',
            input: {
                searchQueries: ['餐廳 大安區'],
                maxResults: 3,
                scrapeDetails: true,
                scrapeEmails: true
            },
            expectations: {
                minResults: 1,
                requiredFields: ['name', 'placeId', 'email', 'emails']
            }
        },
        {
            name: '多語言測試',
            input: {
                searchQueries: ['restaurant taipei', 'レストラン 台北', '餐廳 台北'],
                maxResults: 2,
                language: 'zh-TW',
                scrapeDetails: false
            },
            expectations: {
                minResults: 3,
                requiredFields: ['name', 'placeId', 'rating']
            }
        },
        {
            name: 'URL 直接搜尋測試',
            input: {
                startUrls: [
                    { url: 'https://www.google.com/maps/search/pizza+taipei' }
                ],
                maxResults: 5,
                scrapeDetails: false
            },
            expectations: {
                minResults: 3,
                requiredFields: ['name', 'placeId', 'url']
            }
        }
    ],
    
    // 邊界測試組
    boundary: [
        {
            name: '最大結果數測試',
            input: {
                searchQueries: ['便利商店 台北'],
                maxResults: 100,
                scrapeDetails: false
            },
            expectations: {
                minResults: 50,
                maxResults: 100
            }
        },
        {
            name: '空搜尋結果測試',
            input: {
                searchQueries: ['xyzabc123456789 nowhere'],
                maxResults: 10,
                scrapeDetails: false
            },
            expectations: {
                minResults: 0,
                maxResults: 0,
                allowEmpty: true
            }
        },
        {
            name: '特殊字符測試',
            input: {
                searchQueries: ['café & bar 台北', '50嵐 板橋'],
                maxResults: 3,
                scrapeDetails: false
            },
            expectations: {
                minResults: 1,
                requiredFields: ['name', 'placeId']
            }
        }
    ],
    
    // 負載測試組
    load: [
        {
            name: '並發搜尋測試',
            input: {
                searchQueries: [
                    '咖啡廳 信義區',
                    '餐廳 大安區',
                    '酒吧 中山區',
                    '便利商店 松山區',
                    '健身房 內湖區'
                ],
                maxResults: 10,
                scrapeDetails: false
            },
            expectations: {
                minResults: 30,
                maxExecutionTime: 120000 // 2分鐘
            }
        },
        {
            name: '大量詳細資訊測試',
            input: {
                searchQueries: ['餐廳 台北'],
                maxResults: 20,
                scrapeDetails: true,
                scrapeEmails: false
            },
            expectations: {
                minResults: 15,
                maxExecutionTime: 180000 // 3分鐘
            }
        }
    ],
    
    // 資料品質測試組
    quality: [
        {
            name: 'Place ID 格式測試',
            input: {
                searchQueries: ['7-11 台北', '全家 台北'],
                maxResults: 5,
                scrapeDetails: false
            },
            validations: {
                placeId: (id) => {
                    return id && !id.includes('?') && 
                           (id.startsWith('ChI') || id.startsWith('hex_') || 
                            id.startsWith('generated_') || id.startsWith('fallback_'));
                }
            }
        },
        {
            name: '地址格式測試',
            input: {
                searchQueries: ['醫院 新北市'],
                maxResults: 5,
                scrapeDetails: true
            },
            validations: {
                address: (addr) => {
                    if (!addr) return true; // null 是可接受的
                    // 不應該是評分格式
                    return !addr.match(/^[\d.]+\s*\([0-9,]+\)$/);
                }
            }
        },
        {
            name: '電話格式測試',
            input: {
                searchQueries: ['銀行 台北'],
                maxResults: 5,
                scrapeDetails: true
            },
            validations: {
                phone: (phone) => {
                    if (!phone) return true; // null 是可接受的
                    // 不應該是價格範圍
                    return !phone.match(/^\d{2,3}-\d{2,3}$/);
                }
            }
        }
    ]
};

// 測試執行器
class TestRunner {
    constructor() {
        this.results = {
            passed: 0,
            failed: 0,
            total: 0,
            details: []
        };
    }
    
    async runTest(testConfig, category) {
        const testResult = {
            category,
            name: testConfig.name,
            status: 'running',
            startTime: Date.now(),
            errors: []
        };
        
        try {
            console.log(`\n🔧 執行測試: ${testConfig.name}`);
            
            // 在 Apify 上執行 Actor
            const run = await Actor.call(
                'futurizerush/google-maps-business-scraper',
                testConfig.input,
                { memory: 1024, timeoutSecs: 300 }
            );
            
            const dataset = await Actor.openDataset(run.defaultDatasetId);
            const { items } = await dataset.getData();
            
            testResult.endTime = Date.now();
            testResult.duration = testResult.endTime - testResult.startTime;
            testResult.resultCount = items.length;
            
            // 驗證期望
            if (testConfig.expectations) {
                const exp = testConfig.expectations;
                
                // 檢查結果數量
                if (exp.minResults !== undefined && items.length < exp.minResults) {
                    testResult.errors.push(`結果數量不足: ${items.length} < ${exp.minResults}`);
                }
                if (exp.maxResults !== undefined && items.length > exp.maxResults) {
                    testResult.errors.push(`結果數量過多: ${items.length} > ${exp.maxResults}`);
                }
                
                // 檢查必要欄位
                if (exp.requiredFields && items.length > 0) {
                    const missingFields = exp.requiredFields.filter(field => 
                        !items[0].hasOwnProperty(field)
                    );
                    if (missingFields.length > 0) {
                        testResult.errors.push(`缺少欄位: ${missingFields.join(', ')}`);
                    }
                }
                
                // 檢查執行時間
                if (exp.maxExecutionTime && testResult.duration > exp.maxExecutionTime) {
                    testResult.errors.push(`執行時間過長: ${testResult.duration}ms > ${exp.maxExecutionTime}ms`);
                }
            }
            
            // 資料驗證
            if (testConfig.validations) {
                items.forEach((item, index) => {
                    Object.entries(testConfig.validations).forEach(([field, validator]) => {
                        if (!validator(item[field])) {
                            testResult.errors.push(`項目 ${index} 的 ${field} 驗證失敗: ${item[field]}`);
                        }
                    });
                });
            }
            
            // 判定測試結果
            if (testResult.errors.length === 0) {
                testResult.status = 'passed';
                this.results.passed++;
                console.log(`✅ 測試通過: ${testConfig.name}`);
            } else {
                testResult.status = 'failed';
                this.results.failed++;
                console.log(`❌ 測試失敗: ${testConfig.name}`);
                testResult.errors.forEach(err => console.log(`   - ${err}`));
            }
            
        } catch (error) {
            testResult.status = 'error';
            testResult.error = error.message;
            this.results.failed++;
            console.log(`💥 測試錯誤: ${testConfig.name} - ${error.message}`);
        }
        
        this.results.total++;
        this.results.details.push(testResult);
        return testResult;
    }
    
    async runCategory(category, tests) {
        console.log(`\n${'='.repeat(50)}`);
        console.log(`📋 測試類別: ${category.toUpperCase()}`);
        console.log('='.repeat(50));
        
        for (const test of tests) {
            await this.runTest(test, category);
            // 測試間隔，避免過度請求
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    async runAllTests() {
        console.log('\n🚀 開始完整測試套件執行...\n');
        const startTime = Date.now();
        
        // 執行各類測試
        await this.runCategory('functional', TEST_CONFIGS.functional);
        await this.runCategory('boundary', TEST_CONFIGS.boundary);
        await this.runCategory('quality', TEST_CONFIGS.quality);
        await this.runCategory('load', TEST_CONFIGS.load);
        
        const totalTime = Date.now() - startTime;
        
        // 生成測試報告
        this.generateReport(totalTime);
        
        // 保存詳細結果
        await Actor.setValue('TEST_RESULTS', this.results);
        
        return this.results;
    }
    
    generateReport(totalTime) {
        console.log('\n' + '='.repeat(60));
        console.log('📊 測試報告');
        console.log('='.repeat(60));
        
        console.log(`\n總測試數: ${this.results.total}`);
        console.log(`✅ 通過: ${this.results.passed}`);
        console.log(`❌ 失敗: ${this.results.failed}`);
        console.log(`⏱️ 總執行時間: ${(totalTime / 1000).toFixed(2)} 秒`);
        console.log(`📈 成功率: ${((this.results.passed / this.results.total) * 100).toFixed(2)}%`);
        
        // 分類統計
        const categories = {};
        this.results.details.forEach(test => {
            if (!categories[test.category]) {
                categories[test.category] = { passed: 0, failed: 0, total: 0 };
            }
            categories[test.category].total++;
            if (test.status === 'passed') {
                categories[test.category].passed++;
            } else {
                categories[test.category].failed++;
            }
        });
        
        console.log('\n分類統計:');
        Object.entries(categories).forEach(([cat, stats]) => {
            const rate = ((stats.passed / stats.total) * 100).toFixed(2);
            console.log(`  ${cat}: ${stats.passed}/${stats.total} (${rate}%)`);
        });
        
        // 失敗測試詳情
        const failedTests = this.results.details.filter(t => t.status !== 'passed');
        if (failedTests.length > 0) {
            console.log('\n❌ 失敗測試詳情:');
            failedTests.forEach(test => {
                console.log(`\n  ${test.name} (${test.category}):`);
                if (test.errors && test.errors.length > 0) {
                    test.errors.forEach(err => console.log(`    - ${err}`));
                }
                if (test.error) {
                    console.log(`    - Error: ${test.error}`);
                }
            });
        }
        
        console.log('\n' + '='.repeat(60));
    }
}

// Actor 主函數
Actor.main(async () => {
    const runner = new TestRunner();
    const results = await runner.runAllTests();
    
    // 判定整體測試結果
    if (results.failed === 0) {
        console.log('\n🎉 所有測試通過！');
    } else if (results.passed / results.total >= 0.8) {
        console.log('\n⚠️ 大部分測試通過，但仍有需要修復的問題');
    } else {
        console.log('\n❌ 測試失敗率過高，需要立即修復');
        throw new Error('Too many tests failed');
    }
    
    return results;
});