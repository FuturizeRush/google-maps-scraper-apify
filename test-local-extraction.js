/**
 * 本地測試 Google Maps DOM 結構和提取邏輯
 */

const puppeteer = require('puppeteer');

async function testLocalExtraction() {
    console.log('🚀 Testing Google Maps DOM structure locally...');
    
    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        
        // 搜尋餐廳
        const query = 'pizza restaurants in Chicago';
        const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
        
        console.log(`\n📍 Navigating to: ${searchUrl}`);
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 等待結果載入
        await page.waitForSelector('div[role="feed"]', { timeout: 10000 });
        
        // 測試提取邏輯
        console.log('\n🔍 Testing extraction logic...');
        
        const businesses = await page.evaluate(() => {
            const results = [];
            const links = document.querySelectorAll('a[href*="/maps/place/"]');
            
            // 只測試前3個
            for (let i = 0; i < Math.min(3, links.length); i++) {
                const link = links[i];
                const container = link.closest('div[jsaction*="mouseover:pane"]') ||
                                link.closest('div[data-cid]') ||
                                link.closest('div[jsaction]') || 
                                link.parentElement?.parentElement;
                
                if (!container) continue;
                
                // 收集所有文字內容以便分析
                const allTexts = [];
                const allSpans = container.querySelectorAll('span');
                allSpans.forEach(span => {
                    const text = span.textContent?.trim();
                    if (text) allTexts.push(text);
                });
                
                // 收集所有 div[class*="W4Efsd"] 的內容
                const detailDivs = container.querySelectorAll('div[class*="W4Efsd"]');
                const detailTexts = [];
                detailDivs.forEach(div => {
                    detailTexts.push(div.textContent?.trim());
                });
                
                // 獲取商家名稱
                const nameEl = container.querySelector('div[class*="fontHeadlineSmall"]') ||
                              container.querySelector('a[aria-label]');
                const name = nameEl?.textContent?.trim() || 
                           nameEl?.getAttribute('aria-label')?.trim() || '';
                
                results.push({
                    name,
                    allTexts,
                    detailTexts,
                    containerHTML: container.innerHTML.substring(0, 500),
                    url: link.href
                });
            }
            
            return results;
        });
        
        console.log('\n📊 Extracted data for analysis:');
        businesses.forEach((business, index) => {
            console.log(`\n${index + 1}. ${business.name}`);
            console.log('   All texts:', business.allTexts);
            console.log('   Detail texts:', business.detailTexts);
        });
        
        // 測試點擊進入詳細頁面
        if (businesses.length > 0) {
            console.log('\n🔗 Testing detail page extraction...');
            
            // 點擊第一個商家
            await page.click('a[href*="/maps/place/"]:first-child');
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // 提取詳細資訊
            const details = await page.evaluate(() => {
                const data = {};
                
                // 電話
                const phoneButton = document.querySelector('button[aria-label*="Phone"]') ||
                                  document.querySelector('button[aria-label*="phone"]');
                if (phoneButton) {
                    data.phone = phoneButton.getAttribute('aria-label');
                }
                
                // 網站
                const websiteButton = document.querySelector('a[aria-label*="Website"]') ||
                                    document.querySelector('a[aria-label*="website"]');
                if (websiteButton) {
                    data.website = websiteButton.href;
                }
                
                // 地址
                const addressButton = document.querySelector('button[aria-label*="Address"]') ||
                                    document.querySelector('button[data-item-id*="address"]');
                if (addressButton) {
                    data.address = addressButton.getAttribute('aria-label');
                }
                
                // 營業時間
                const hoursButton = document.querySelector('[aria-label*="Hours"]') ||
                                  document.querySelector('[aria-label*="hours"]');
                if (hoursButton) {
                    data.hours = hoursButton.textContent;
                }
                
                return data;
            });
            
            console.log('   Detailed info:', details);
            
            // 如果有網站，訪問並尋找 email
            if (details.website && !details.website.includes('google.com')) {
                console.log(`\n📧 Visiting website to find email: ${details.website}`);
                
                try {
                    const newPage = await browser.newPage();
                    await newPage.goto(details.website, { 
                        waitUntil: 'networkidle0',
                        timeout: 10000 
                    });
                    
                    const emails = await newPage.evaluate(() => {
                        // 尋找 email
                        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
                        const bodyText = document.body.innerText || document.body.textContent || '';
                        const foundEmails = bodyText.match(emailRegex) || [];
                        
                        // 也檢查 mailto 連結
                        const mailtoLinks = document.querySelectorAll('a[href^="mailto:"]');
                        mailtoLinks.forEach(link => {
                            const email = link.href.replace('mailto:', '').split('?')[0];
                            if (email && !foundEmails.includes(email)) {
                                foundEmails.push(email);
                            }
                        });
                        
                        // 過濾常見的無效 email
                        return foundEmails.filter(email => {
                            return !email.includes('example.com') &&
                                   !email.includes('sentry.io') &&
                                   !email.includes('wixpress.com') &&
                                   !email.includes('@2x.') &&
                                   !email.includes('@3x.');
                        });
                    });
                    
                    console.log('   Found emails:', emails);
                    await newPage.close();
                    
                } catch (error) {
                    console.log('   Failed to extract email:', error.message);
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        console.log('\n⏰ Browser will close in 10 seconds...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        await browser.close();
    }
}

// 執行測試
testLocalExtraction().catch(console.error);