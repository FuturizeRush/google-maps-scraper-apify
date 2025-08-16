/**
 * 負載測試腳本
 * 測試 Actor 在高負載下的表現
 */

const { Actor } = require('apify');

// 負載測試配置
const LOAD_TEST_SCENARIOS = {
    // 輕量級負載測試
    light: {
        concurrent: 3,
        iterations: 2,
        config: {
            searchQueries: ['咖啡廳 台北'],
            maxResults: 5,
            scrapeDetails: false
        }
    },
    
    // 中等負載測試
    medium: {
        concurrent: 5,
        iterations: 3,
        config: {
            searchQueries: ['餐廳 台北', '咖啡 新北', '酒吧 台中'],
            maxResults: 10,
            scrapeDetails: true
        }
    },
    
    // 重度負載測試
    heavy: {
        concurrent: 10,
        iterations: 2,
        config: {
            searchQueries: [
                '餐廳 信義區', '咖啡廳 大安區', '酒吧 中山區',
                '便利商店 松山區', '健身房 內湖區', '醫院 士林區',
                '銀行 北投區', '學校 文山區', '公園 南港區', '超市 萬華區'
            ],
            maxResults: 20,
            scrapeDetails: true,
            scrapeEmails: true
        }
    },
    
    // 壓力測試
    stress: {
        concurrent: 15,
        iterations: 1,
        config: {
            searchQueries: Array(20).fill(null).map((_, i) => `商店 台北 ${i}`),
            maxResults: 50,
            scrapeDetails: false
        }
    }
};

class LoadTester {
    constructor() {
        this.metrics = {
            totalRuns: 0,
            successfulRuns: 0,
            failedRuns: 0,
            totalDuration: 0,
            minDuration: Infinity,
            maxDuration: 0,
            avgDuration: 0,
            totalResults: 0,
            errors: [],
            responseTimes: [],
            throughput: 0
        };
    }
    
    async runSingleTest(config, testId) {
        const startTime = Date.now();
        let success = false;
        let resultCount = 0;
        let error = null;
        
        try {
            console.log(`  [${testId}] 開始執行...`);
            
            const run = await Actor.call(
                'futurizerush/google-maps-business-scraper',
                config,
                { 
                    memory: 2048, 
                    timeoutSecs: 300,
                    waitSecs: 0 // 不等待完成，立即返回
                }
            );
            
            // 等待執行完成
            await Actor.waitForFinish(run.id, { waitSecs: 300 });
            
            // 獲取結果
            const dataset = await Actor.openDataset(run.defaultDatasetId);
            const { items } = await dataset.getData();
            
            resultCount = items.length;
            success = true;
            
            console.log(`  [${testId}] ✅ 完成 - ${resultCount} 個結果`);
            
        } catch (err) {
            error = err.message;
            console.log(`  [${testId}] ❌ 失敗 - ${error}`);
            this.metrics.errors.push({ testId, error });
        }
        
        const duration = Date.now() - startTime;
        
        // 更新指標
        this.metrics.totalRuns++;
        if (success) {
            this.metrics.successfulRuns++;
            this.metrics.totalResults += resultCount;
        } else {
            this.metrics.failedRuns++;
        }
        
        this.metrics.totalDuration += duration;
        this.metrics.minDuration = Math.min(this.metrics.minDuration, duration);
        this.metrics.maxDuration = Math.max(this.metrics.maxDuration, duration);
        this.metrics.responseTimes.push(duration);
        
        return { success, duration, resultCount, error };
    }
    
    async runConcurrentTests(config, concurrent, batchId) {
        console.log(`\n批次 ${batchId}: 執行 ${concurrent} 個並發測試`);
        
        const promises = [];
        for (let i = 0; i < concurrent; i++) {
            const testId = `${batchId}-${i}`;
            promises.push(this.runSingleTest(config, testId));
        }
        
        const results = await Promise.all(promises);
        return results;
    }
    
    async runLoadScenario(scenarioName, scenario) {
        console.log('\n' + '='.repeat(60));
        console.log(`🔥 負載測試場景: ${scenarioName.toUpperCase()}`);
        console.log('='.repeat(60));
        console.log(`並發數: ${scenario.concurrent}`);
        console.log(`迭代次數: ${scenario.iterations}`);
        console.log(`搜尋查詢數: ${scenario.config.searchQueries.length}`);
        console.log(`每次最大結果: ${scenario.config.maxResults}`);
        
        const scenarioStartTime = Date.now();
        const batchResults = [];
        
        for (let i = 0; i < scenario.iterations; i++) {
            const batchResult = await this.runConcurrentTests(
                scenario.config,
                scenario.concurrent,
                `${scenarioName}-${i}`
            );
            batchResults.push(batchResult);
            
            // 批次間隔
            if (i < scenario.iterations - 1) {
                console.log('  等待 5 秒後執行下一批次...');
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
        
        const scenarioDuration = Date.now() - scenarioStartTime;
        
        // 計算場景統計
        const scenarioStats = {
            name: scenarioName,
            duration: scenarioDuration,
            totalTests: scenario.concurrent * scenario.iterations,
            successCount: batchResults.flat().filter(r => r.success).length,
            failureCount: batchResults.flat().filter(r => !r.success).length,
            avgResponseTime: batchResults.flat().reduce((sum, r) => sum + r.duration, 0) / 
                           (scenario.concurrent * scenario.iterations),
            throughput: (scenario.concurrent * scenario.iterations) / (scenarioDuration / 1000)
        };
        
        console.log(`\n場景 ${scenarioName} 完成:`);
        console.log(`  總測試數: ${scenarioStats.totalTests}`);
        console.log(`  成功: ${scenarioStats.successCount}`);
        console.log(`  失敗: ${scenarioStats.failureCount}`);
        console.log(`  平均響應時間: ${(scenarioStats.avgResponseTime / 1000).toFixed(2)} 秒`);
        console.log(`  吞吐量: ${scenarioStats.throughput.toFixed(2)} 測試/秒`);
        
        return scenarioStats;
    }
    
    async runAllLoadTests() {
        console.log('\n🚀 開始負載測試...\n');
        const startTime = Date.now();
        
        const scenarioResults = {};
        
        // 執行各種負載場景
        for (const [name, scenario] of Object.entries(LOAD_TEST_SCENARIOS)) {
            scenarioResults[name] = await this.runLoadScenario(name, scenario);
            
            // 場景間隔
            console.log('\n等待 10 秒後執行下一個場景...');
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
        
        const totalTime = Date.now() - startTime;
        
        // 計算整體指標
        this.metrics.avgDuration = this.metrics.totalDuration / this.metrics.totalRuns;
        this.metrics.throughput = this.metrics.totalRuns / (totalTime / 1000);
        
        // 計算百分位數
        const sortedTimes = this.metrics.responseTimes.sort((a, b) => a - b);
        this.metrics.p50 = sortedTimes[Math.floor(sortedTimes.length * 0.5)];
        this.metrics.p90 = sortedTimes[Math.floor(sortedTimes.length * 0.9)];
        this.metrics.p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)];
        this.metrics.p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)];
        
        // 生成報告
        this.generateLoadTestReport(scenarioResults, totalTime);
        
        // 保存結果
        await Actor.setValue('LOAD_TEST_RESULTS', {
            metrics: this.metrics,
            scenarios: scenarioResults,
            timestamp: new Date().toISOString()
        });
        
        return this.metrics;
    }
    
    generateLoadTestReport(scenarioResults, totalTime) {
        console.log('\n' + '='.repeat(60));
        console.log('📊 負載測試報告');
        console.log('='.repeat(60));
        
        console.log('\n🔢 整體統計:');
        console.log(`  總執行時間: ${(totalTime / 1000 / 60).toFixed(2)} 分鐘`);
        console.log(`  總測試數: ${this.metrics.totalRuns}`);
        console.log(`  成功: ${this.metrics.successfulRuns} (${((this.metrics.successfulRuns / this.metrics.totalRuns) * 100).toFixed(2)}%)`);
        console.log(`  失敗: ${this.metrics.failedRuns} (${((this.metrics.failedRuns / this.metrics.totalRuns) * 100).toFixed(2)}%)`);
        console.log(`  總結果數: ${this.metrics.totalResults}`);
        
        console.log('\n⏱️ 性能指標:');
        console.log(`  最小響應時間: ${(this.metrics.minDuration / 1000).toFixed(2)} 秒`);
        console.log(`  最大響應時間: ${(this.metrics.maxDuration / 1000).toFixed(2)} 秒`);
        console.log(`  平均響應時間: ${(this.metrics.avgDuration / 1000).toFixed(2)} 秒`);
        console.log(`  P50: ${(this.metrics.p50 / 1000).toFixed(2)} 秒`);
        console.log(`  P90: ${(this.metrics.p90 / 1000).toFixed(2)} 秒`);
        console.log(`  P95: ${(this.metrics.p95 / 1000).toFixed(2)} 秒`);
        console.log(`  P99: ${(this.metrics.p99 / 1000).toFixed(2)} 秒`);
        console.log(`  吞吐量: ${this.metrics.throughput.toFixed(2)} 測試/秒`);
        
        console.log('\n📈 場景結果:');
        Object.entries(scenarioResults).forEach(([name, stats]) => {
            const successRate = ((stats.successCount / stats.totalTests) * 100).toFixed(2);
            console.log(`\n  ${name.toUpperCase()}:`);
            console.log(`    成功率: ${successRate}%`);
            console.log(`    平均響應: ${(stats.avgResponseTime / 1000).toFixed(2)} 秒`);
            console.log(`    吞吐量: ${stats.throughput.toFixed(2)} 測試/秒`);
        });
        
        if (this.metrics.errors.length > 0) {
            console.log('\n❌ 錯誤摘要:');
            const errorTypes = {};
            this.metrics.errors.forEach(err => {
                errorTypes[err.error] = (errorTypes[err.error] || 0) + 1;
            });
            Object.entries(errorTypes).forEach(([error, count]) => {
                console.log(`  ${error}: ${count} 次`);
            });
        }
        
        // 性能建議
        console.log('\n💡 性能建議:');
        if (this.metrics.p95 > 60000) {
            console.log('  ⚠️ P95 響應時間超過 60 秒，建議優化爬蟲效率');
        }
        if (this.metrics.failedRuns / this.metrics.totalRuns > 0.1) {
            console.log('  ⚠️ 失敗率超過 10%，需要改進錯誤處理');
        }
        if (this.metrics.throughput < 0.5) {
            console.log('  ⚠️ 吞吐量較低，考慮增加並發處理能力');
        }
        
        console.log('\n' + '='.repeat(60));
    }
}

// Actor 主函數
Actor.main(async () => {
    const tester = new LoadTester();
    const results = await tester.runAllLoadTests();
    
    // 判定測試結果
    const successRate = results.successfulRuns / results.totalRuns;
    if (successRate >= 0.95) {
        console.log('\n✅ 負載測試通過！系統穩定性良好');
    } else if (successRate >= 0.80) {
        console.log('\n⚠️ 負載測試部分通過，存在一些穩定性問題');
    } else {
        console.log('\n❌ 負載測試失敗，系統穩定性不足');
        throw new Error('Load test failed - stability issues detected');
    }
    
    return results;
});