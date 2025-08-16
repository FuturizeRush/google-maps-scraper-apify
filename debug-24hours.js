/**
 * 調試腳本：詳細觀察24小時營業商家的資料格式
 */

const puppeteer = require('puppeteer');

(async () => {
    console.log('='.repeat(80));
    console.log('24小時營業商家營業時間格式調試');
    console.log('='.repeat(80));
    
    const browser = await puppeteer.launch({
        headless: false,  // 顯示瀏覽器方便觀察
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--window-size=1920,1080'
        ],
        defaultViewport: null
    });

    const page = await browser.newPage();
    
    // 直接訪問7-11的Google Maps頁面
    const url = 'https://www.google.com/maps/place/7-ELeven+%E9%91%AB%E5%8F%B0%E5%8C%97%E9%96%80%E5%B8%82/data=!4m7!3m6!1s0x3442a98a2643192f:0x4c405c16ac234e81!8m2!3d25.0461351!4d121.5187329!16s%2Fg%2F11gslv6858!19sChIJLxlDJoqpQjQRgU4jrBZcQEw?authuser=0&hl=zh-TW&rclk=1';
    
    console.log('\n訪問URL:', url);
    await page.goto(url, { waitUntil: 'networkidle2' });
    
    // 等待頁面載入
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('\n=== 步驟1: 尋找所有可能包含營業時間的元素 ===\n');
    
    const hoursElements = await page.evaluate(() => {
        const results = [];
        
        // 1. 尋找所有可能的營業時間按鈕
        const possibleSelectors = [
            'button[data-item-id*="hour"]',
            'button[data-item-id*="oh"]',
            'button[aria-label*="Hours"]',
            'button[aria-label*="hours"]',
            'button[aria-label*="營業時間"]',
            'button[aria-label*="時間"]',
            'div[aria-label*="Hours"]',
            'div[aria-label*="hours"]',
            'span[aria-label*="Hours"]',
            'span[aria-label*="hours"]'
        ];
        
        possibleSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                results.push({
                    selector: selector,
                    tagName: el.tagName,
                    textContent: el.textContent?.trim(),
                    ariaLabel: el.getAttribute('aria-label'),
                    dataItemId: el.getAttribute('data-item-id'),
                    className: el.className,
                    innerHTML: el.innerHTML.substring(0, 200) // 前200字符
                });
            });
        });
        
        // 2. 搜尋包含"24"或"小時"的所有元素
        const allElements = document.querySelectorAll('*');
        Array.from(allElements).forEach(el => {
            const text = el.textContent || '';
            if ((text.includes('24') && text.includes('小時')) || 
                (text.includes('24') && text.includes('hour'))) {
                // 只記錄小於500字符的元素（避免太大的容器）
                if (text.length < 500 && !results.find(r => r.element === el)) {
                    results.push({
                        selector: 'contains-24h',
                        tagName: el.tagName,
                        textContent: text.trim(),
                        ariaLabel: el.getAttribute('aria-label'),
                        className: el.className,
                        parentTag: el.parentElement?.tagName
                    });
                }
            }
        });
        
        return results;
    });
    
    console.log('找到的營業時間相關元素:');
    hoursElements.forEach((el, i) => {
        console.log(`\n元素 ${i + 1}:`);
        console.log(`  選擇器: ${el.selector}`);
        console.log(`  標籤: ${el.tagName}`);
        console.log(`  文字: ${el.textContent}`);
        console.log(`  aria-label: ${el.ariaLabel}`);
        if (el.dataItemId) console.log(`  data-item-id: ${el.dataItemId}`);
    });
    
    console.log('\n=== 步驟2: 嘗試點擊營業時間按鈕 ===\n');
    
    // 嘗試點擊營業時間按鈕
    const clickResult = await page.evaluate(async () => {
        // 優先尋找最可能的按鈕
        const buttons = [
            ...document.querySelectorAll('button[data-item-id*="hour"]'),
            ...document.querySelectorAll('button[aria-label*="營業時間"]'),
            ...document.querySelectorAll('button[aria-label*="Hours"]'),
            ...Array.from(document.querySelectorAll('button')).filter(btn => {
                const text = (btn.textContent || '') + (btn.getAttribute('aria-label') || '');
                return text.includes('24') && (text.includes('小時') || text.includes('hour'));
            })
        ];
        
        if (buttons.length > 0) {
            const button = buttons[0];
            const beforeClick = {
                text: button.textContent,
                ariaLabel: button.getAttribute('aria-label')
            };
            
            // 點擊按鈕
            button.click();
            
            // 等待展開
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            return {
                success: true,
                buttonInfo: beforeClick,
                buttonCount: buttons.length
            };
        }
        
        return {
            success: false,
            message: '未找到營業時間按鈕'
        };
    });
    
    console.log('點擊結果:', clickResult);
    
    if (clickResult.success) {
        console.log('\n=== 步驟3: 檢查展開後的營業時間資訊 ===\n');
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const expandedHours = await page.evaluate(() => {
            const results = {
                tables: [],
                lists: [],
                dialogs: [],
                allTexts: []
            };
            
            // 1. 尋找表格
            const tables = document.querySelectorAll('table');
            tables.forEach(table => {
                const rows = [];
                table.querySelectorAll('tr').forEach(tr => {
                    const cells = [];
                    tr.querySelectorAll('td, th').forEach(td => {
                        cells.push(td.textContent?.trim());
                    });
                    if (cells.length > 0) {
                        rows.push(cells);
                    }
                });
                if (rows.length > 0) {
                    results.tables.push({
                        className: table.className,
                        rows: rows
                    });
                }
            });
            
            // 2. 尋找列表
            const lists = document.querySelectorAll('ul, ol');
            lists.forEach(list => {
                const items = [];
                list.querySelectorAll('li').forEach(li => {
                    const text = li.textContent?.trim();
                    if (text && (text.includes(':') || text.includes('24'))) {
                        items.push(text);
                    }
                });
                if (items.length > 0) {
                    results.lists.push({
                        className: list.className,
                        items: items
                    });
                }
            });
            
            // 3. 尋找對話框
            const dialogs = document.querySelectorAll('div[role="dialog"], div[aria-modal="true"]');
            dialogs.forEach(dialog => {
                const text = dialog.textContent?.trim();
                if (text && text.length < 2000) {
                    results.dialogs.push({
                        className: dialog.className,
                        text: text.substring(0, 500)
                    });
                }
            });
            
            // 4. 收集所有包含星期的文字
            const weekDays = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日', 
                              'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
            const allElements = document.querySelectorAll('*');
            allElements.forEach(el => {
                const text = el.textContent?.trim();
                if (text && text.length < 200) {
                    for (const day of weekDays) {
                        if (text.includes(day)) {
                            results.allTexts.push({
                                tag: el.tagName,
                                text: text
                            });
                            break;
                        }
                    }
                }
            });
            
            return results;
        });
        
        console.log('展開後的營業時間資訊:');
        
        if (expandedHours.tables.length > 0) {
            console.log('\n表格資料:');
            expandedHours.tables.forEach((table, i) => {
                console.log(`  表格 ${i + 1}:`);
                table.rows.forEach(row => {
                    console.log(`    ${row.join(' | ')}`);
                });
            });
        }
        
        if (expandedHours.lists.length > 0) {
            console.log('\n列表資料:');
            expandedHours.lists.forEach((list, i) => {
                console.log(`  列表 ${i + 1}:`);
                list.items.forEach(item => {
                    console.log(`    - ${item}`);
                });
            });
        }
        
        if (expandedHours.dialogs.length > 0) {
            console.log('\n對話框資料:');
            expandedHours.dialogs.forEach((dialog, i) => {
                console.log(`  對話框 ${i + 1}:`);
                console.log(`    ${dialog.text.substring(0, 200)}...`);
            });
        }
        
        if (expandedHours.allTexts.length > 0) {
            console.log('\n包含星期的文字:');
            // 去重
            const uniqueTexts = [...new Set(expandedHours.allTexts.map(t => t.text))];
            uniqueTexts.slice(0, 10).forEach(text => {
                console.log(`  - ${text}`);
            });
        }
    }
    
    console.log('\n=== 步驟4: 分析當前頁面狀態 ===\n');
    
    // 截圖保存
    await page.screenshot({ path: 'debug-24hours-screenshot.png', fullPage: false });
    console.log('已保存截圖: debug-24hours-screenshot.png');
    
    // 保持瀏覽器開啟10秒以便觀察
    console.log('\n瀏覽器將在10秒後關閉，請觀察頁面...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    await browser.close();
    console.log('\n調試完成！');
})();