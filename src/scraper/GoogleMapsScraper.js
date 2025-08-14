/**
 * Google Maps Business Scraper Module
 * Scraper capable of extracting 100+ business listings
 * Optimized for Apify Actor deployment
 */

const puppeteer = require('puppeteer');
const { log } = require('apify');
const EmailExtractor = require('./EmailExtractor');
const BatchEmailExtractor = require('./BatchEmailExtractor');

class GoogleMapsScraper {
    constructor(config = {}) {
        this.config = {
            searchQuery: config.searchQuery || '',
            maxResults: config.maxResults || 100,
            language: config.language || 'en',
            headless: config.headless !== false,
            maxScrolls: config.maxScrolls || 100,
            scrapeDetails: config.scrapeDetails || false,
            scrapeEmails: config.scrapeEmails || false,
            proxyUrl: config.proxyUrl || null,
            directUrl: config.directUrl || null
        };
        
        this.browser = null;
        this.results = [];
        this.emailExtractor = new EmailExtractor({
            rateLimitDelay: 2000,
            maxEmailsPerSite: 3
        });
        this.stats = {
            loadedCount: 0,
            extractedCount: 0,
            scrollAttempts: 0,
            emailsExtracted: 0
        };
    }

    /**
     * Initialize browser with proxy support
     */
    async init() {
        log.info('Initializing Google Maps Scraper');
        log.debug('Configuration:', {
            ...this.config,
            proxyUrl: this.config.proxyUrl ? 'configured' : 'none'
        });

        const launchOptions = {
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
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

        // Disable proxy for now to avoid authentication issues
        // TODO: Implement proper Apify proxy handling later

        this.browser = await puppeteer.launch(launchOptions);
        log.info('Browser launched successfully');
    }

    /**
     * Search Google Maps with query
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

            // Navigate to search page
            const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(this.config.searchQuery)}?hl=${this.config.language}`;
            log.info(`Searching: ${this.config.searchQuery}`);
            log.info(`URL: ${searchUrl}`);

            await page.goto(searchUrl, { 
                waitUntil: 'domcontentloaded',
                timeout: 30000 
            });
            
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
     * Search by direct URL
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
            await page.goto(url, { 
                waitUntil: 'domcontentloaded',
                timeout: 30000 
            });
            
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
     * Aggressive scrolling strategy
     */
    async performScrolling(page) {
        log.info('Starting aggressive scrolling...');
        
        let previousCount = 0;
        let currentCount = 0;
        let noChangeCount = 0;
        const maxScrolls = this.config.maxScrolls;

        for (let i = 0; i < maxScrolls; i++) {
            this.stats.scrollAttempts++;

            // Execute multiple scroll methods
            await page.evaluate((scrollIndex) => {
                // Method 1: Scroll feed container
                const feed = document.querySelector('div[role="feed"]');
                if (feed) {
                    feed.scrollTop = feed.scrollHeight;
                }
                
                // Method 2: Scroll to last business
                const links = document.querySelectorAll('a[href*="/maps/place/"]');
                if (links.length > 0) {
                    links[links.length - 1].scrollIntoView({ behavior: 'smooth' });
                }
                
                // Method 3: Keyboard simulation
                if (scrollIndex % 3 === 0) {
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
                }
                
                // Method 4: Window scroll
                window.scrollBy(0, 1000);
            }, i);

            // Dynamic wait time
            await new Promise(resolve => setTimeout(resolve, 500 + (i * 20)));

            // Check result count
            currentCount = await page.evaluate(() => {
                return document.querySelectorAll('a[href*="/maps/place/"]').length;
            });

            if (currentCount === previousCount) {
                noChangeCount++;

                // Try clicking "More" button
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

                // Try more aggressive scrolling if stuck
                if (noChangeCount === 3) {
                    // Try to scroll the parent container
                    await page.evaluate(() => {
                        const container = document.querySelector('div[role="main"]') || document.body;
                        container.scrollTop = container.scrollHeight;
                    });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
                // Stop if no new results for 8 attempts (more tolerance)
                if (noChangeCount >= 8) {
                    log.info('No new results after multiple attempts, stopping scroll');
                    break;
                }
            } else {
                noChangeCount = 0;
            }

            // Progress update
            if (i % 5 === 0) {
                log.info(`Scroll ${i + 1}: ${currentCount} results loaded`);
            }

            previousCount = currentCount;

            // Continue scrolling to get as many results as possible
            // Only stop if we really reached the limit
            if (currentCount >= 200) {
                log.info('Reached 200 results limit');
                break;
            }
        }

        this.stats.loadedCount = currentCount;
        log.info(`Scrolling complete: ${currentCount} results loaded`);
    }

    /**
     * Extract business information
     */
    async extractBusinesses(page) {
        log.info('Extracting business information...');

        const businesses = await page.evaluate(() => {
            const results = [];
            const seen = new Set();

            // Get all business links
            const links = document.querySelectorAll('a[href*="/maps/place/"]');

            links.forEach((link, index) => {
                // Don't limit extraction, get all available results

                try {
                    const href = link.href;

                    // Extract Place ID
                    const placeIdMatch = href.match(/place\/([^/]+)\/([^/?]+)/);
                    const placeId = placeIdMatch ? placeIdMatch[2] : `place_${index}`;

                    // Skip duplicates
                    if (seen.has(placeId)) return;
                    seen.add(placeId);

                    // Get container element - try multiple selectors
                    const container = link.closest('div[jsaction*="mouseover:pane"]') ||
                                    link.closest('div[data-cid]') ||
                                    link.closest('div[jsaction]') || 
                                    link.parentElement?.parentElement?.parentElement ||
                                    link.parentElement?.parentElement;
                    if (!container) return;

                    // Extract business name
                    const nameElement = container.querySelector('div[class*="fontHeadlineSmall"]') ||
                                       container.querySelector('div[class*="fontBodyMedium"]') ||
                                       container.querySelector('[role="heading"]') ||
                                       link.querySelector('div');
                    
                    const name = nameElement?.textContent?.trim() || '';
                    if (!name) return; // Skip if no name

                    // Extract rating
                    const ratingElement = container.querySelector('span[role="img"][aria-label*="star"]') ||
                                         container.querySelector('span[role="img"][aria-label*="Star"]') ||
                                         container.querySelector('span[role="img"][aria-label*="星"]') ||
                                         container.querySelector('span[class*="MW4etd"]');
                    const ratingText = ratingElement?.getAttribute('aria-label') || 
                                      ratingElement?.textContent || '';
                    const rating = parseFloat(ratingText.match(/[\d.]+/)?.[0] || '0');

                    // Extract review count
                    const reviewText = container.textContent || '';
                    const reviewMatch = reviewText.match(/\((\d+[,\d]*)\)/);
                    const reviews = reviewMatch ? 
                        parseInt(reviewMatch[1].replace(/,/g, '')) : 0;

                    // Extract business type and address from W4Efsd divs
                    const detailDivs = container.querySelectorAll('div[class*="W4Efsd"]');
                    let businessType = '';
                    let address = '';
                    let priceLevel = '';
                    
                    detailDivs.forEach(div => {
                        const text = div.textContent || '';
                        const spans = div.querySelectorAll('span');
                        
                        if (spans.length > 0) {
                            // First span often contains business type
                            const firstSpan = spans[0]?.textContent?.trim() || '';
                            // Last span often contains address
                            const lastSpan = spans[spans.length - 1]?.textContent?.trim() || '';
                            
                            // Check for business type (usually first item)
                            if (firstSpan && !firstSpan.includes('·') && !businessType) {
                                businessType = firstSpan;
                            }
                            
                            // Check for address (contains street, city, or common address patterns)
                            // Avoid time strings like "Opens 11 AM" or "Closes 9 PM"
                            if (lastSpan && !lastSpan.match(/Opens|Closes|AM|PM|⋅/) && (
                                lastSpan.match(/\d+/) || // Contains numbers
                                lastSpan.includes(',') || // Contains commas (city, state)
                                lastSpan.match(/Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Boulevard|Blvd|Lane|Ln|Way|Plaza|Place|Court|Ct/i) ||
                                lastSpan.includes('Chicago') || lastSpan.includes('IL')
                            )) {
                                address = lastSpan;
                            }
                        }
                    });
                    
                    // Fallback: split by · and get parts
                    if (!address || !businessType) {
                        const fullText = detailDivs[0]?.textContent || '';
                        const parts = fullText.split('·').map(s => s.trim());
                        if (!businessType && parts[0]) businessType = parts[0];
                        if (!address && parts[parts.length - 1]) address = parts[parts.length - 1];
                    }

                    // Extract price level
                    const priceElement = container.querySelector('span[aria-label*="Price"]') ||
                                        container.querySelector('span[aria-label*="price"]') ||
                                        container.querySelector('span[aria-label*="價格"]');
                    priceLevel = priceElement?.textContent?.trim() || '';

                    // Extract phone (improved regex to avoid false matches)
                    // Look for patterns like (312) 555-1234 or 312-555-1234 or +1 312 555 1234
                    const phoneMatch = container.textContent.match(/(\+?1?\s*\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/);
                    const phone = phoneMatch ? phoneMatch[1].trim() : '';

                    results.push({
                        name,
                        placeId,
                        rating,
                        reviews,
                        address,
                        businessType,
                        priceLevel,
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
        const detailsLimit = Math.min(businesses.length, 50); // Increased limit
        const businessesToProcess = businesses.slice(0, detailsLimit);
        
        // First, collect basic details from Google Maps pages
        log.info(`Scraping details for ${businessesToProcess.length} businesses...`);
        
        for (let i = 0; i < businessesToProcess.length; i++) {
            const business = businesses[i];
            
            try {
                log.info(`Scraping details for: ${business.name}`);
                
                // Navigate to business page
                await page.goto(business.url, { 
                    waitUntil: 'domcontentloaded',
                    timeout: 15000 
                });
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Extract additional details
                const details = await page.evaluate(() => {
                    const data = {};

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

                    // Hours
                    const hoursElement = document.querySelector('[aria-label*="Hours"]') ||
                                        document.querySelector('[aria-label*="hours"]') ||
                                        document.querySelector('[aria-label*="營業時間"]');
                    if (hoursElement) {
                        data.hours = hoursElement.textContent;
                    }

                    return data;
                });

                // Merge details
                Object.assign(business, details);

                // Be nice to Google (reduced delay)
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (error) {
                log.error(`Failed to scrape details for ${business.name}:`, error.message);
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
                await new Promise(resolve => setTimeout(resolve, 2000));
                
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
            finalResultCount: this.results.length,
            emailStats: this.emailExtractor.getStats()
        };
    }

    /**
     * Close browser
     */
    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            log.info('Browser closed');
        }
    }
}

module.exports = GoogleMapsScraper;