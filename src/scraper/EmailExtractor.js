/**
 * Email Extractor Module
 * Extracts emails from websites with rate limiting
 */

const { log } = require('apify');

class EmailExtractor {
    constructor(config = {}) {
        this.config = {
            maxEmailsPerSite: config.maxEmailsPerSite || 3,
            timeout: config.timeout || 5000, // Reduced from 10000
            rateLimitDelay: config.rateLimitDelay || 500, // Reduced from 2000
            maxRetries: config.maxRetries || 1, // Reduced from 2
            maxConcurrent: config.maxConcurrent || 3, // Process 3 sites at once
            searchContactPage: config.searchContactPage !== false
        };
        
        this.visitedUrls = new Set();
        this.emailCache = new Map();
        this.activeRequests = 0;
    }

    /**
     * Extract emails from a website
     */
    async extractEmailsFromWebsite(page, url) {
        // Check cache first
        if (this.emailCache.has(url)) {
            return this.emailCache.get(url);
        }
        
        // Skip if already visited
        if (this.visitedUrls.has(url)) {
            return [];
        }
        
        // Skip Google domains
        if (url.includes('google.com') || url.includes('goo.gl')) {
            return [];
        }
        
        this.visitedUrls.add(url);
        
        let retries = 0;
        while (retries < this.config.maxRetries) {
            try {
                // Rate limiting
                await new Promise(resolve => setTimeout(resolve, this.config.rateLimitDelay));
                
                // Create new page for website visit
                const newPage = await page.browser().newPage();
                
                // Set user agent to avoid bot detection
                await newPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
                
                // Block unnecessary resources
                await newPage.setRequestInterception(true);
                newPage.on('request', (req) => {
                    const resourceType = req.resourceType();
                    if (['image', 'media', 'font', 'stylesheet'].includes(resourceType)) {
                        req.abort();
                    } else {
                        req.continue();
                    }
                });
                
                // Navigate to website with reduced waiting
                await newPage.goto(url, {
                    waitUntil: 'domcontentloaded', // Changed from networkidle0
                    timeout: this.config.timeout
                });
                
                // Quick wait for dynamic content
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Extract emails from main page
                let emails = await newPage.evaluate(() => {
                    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
                    const foundEmails = new Set();
                    
                    // Search in text content
                    const bodyText = document.body.innerText || document.body.textContent || '';
                    const textEmails = bodyText.match(emailRegex) || [];
                    textEmails.forEach(email => foundEmails.add(email.toLowerCase()));
                    
                    // Search in mailto links
                    const mailtoLinks = document.querySelectorAll('a[href^="mailto:"]');
                    mailtoLinks.forEach(link => {
                        const email = link.href.replace('mailto:', '').split('?')[0].toLowerCase();
                        if (email) foundEmails.add(email);
                    });
                    
                    // Search in data attributes
                    const elementsWithData = document.querySelectorAll('[data-email], [data-contact]');
                    elementsWithData.forEach(elem => {
                        const dataEmail = elem.getAttribute('data-email') || elem.getAttribute('data-contact') || '';
                        const matches = dataEmail.match(emailRegex) || [];
                        matches.forEach(email => foundEmails.add(email.toLowerCase()));
                    });
                    
                    // Search in contact/about pages links
                    const contactLinks = Array.from(document.querySelectorAll('a')).filter(a => {
                        const href = a.href.toLowerCase();
                        const text = a.textContent.toLowerCase();
                        return href.includes('contact') || href.includes('about') || 
                               text.includes('contact') || text.includes('about');
                    });
                    
                    return Array.from(foundEmails);
                });
                
                // Filter out invalid emails
                let validEmails = this.filterValidEmails(emails);
                
                // If no emails found and searchContactPage is enabled, try contact page
                if (validEmails.length === 0 && this.config.searchContactPage) {
                    try {
                        const contactUrl = await this.findContactPageUrl(newPage);
                        if (contactUrl && !contactUrl.includes(url)) {
                            log.info(`Found contact page: ${contactUrl}`);
                            await newPage.goto(contactUrl, {
                                waitUntil: 'domcontentloaded',
                                timeout: 3000
                            });
                            await new Promise(resolve => setTimeout(resolve, 500));
                            
                            const contactEmails = await newPage.evaluate(() => {
                                const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
                                const bodyText = document.body.innerText || document.body.textContent || '';
                                return (bodyText.match(emailRegex) || []).map(e => e.toLowerCase());
                            });
                            
                            validEmails = this.filterValidEmails(contactEmails);
                        }
                    } catch (error) {
                        // Ignore contact page errors
                    }
                }
                
                // Cache results
                this.emailCache.set(url, validEmails);
                
                await newPage.close();
                
                log.info(`Extracted ${validEmails.length} emails from ${url}`);
                return validEmails.slice(0, this.config.maxEmailsPerSite);
                
            } catch (error) {
                retries++;
                log.warning(`Failed to extract emails from ${url} (attempt ${retries}): ${error.message}`);
                
                if (retries >= this.config.maxRetries) {
                    this.emailCache.set(url, []);
                    return [];
                }
                
                // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, this.config.rateLimitDelay * Math.pow(2, retries)));
            }
        }
        
        return [];
    }
    
    /**
     * Find contact page URL
     */
    async findContactPageUrl(page) {
        try {
            const contactUrl = await page.evaluate(() => {
                // Find contact links
                const links = Array.from(document.querySelectorAll('a'));
                const contactLink = links.find(a => {
                    const href = (a.href || '').toLowerCase();
                    const text = (a.textContent || '').toLowerCase();
                    return (href.includes('/contact') || href.includes('/about') || 
                           href.includes('/contact-us') || href.includes('/get-in-touch') ||
                           text.includes('contact') || text.includes('about us') ||
                           text.includes('get in touch'));
                });
                return contactLink ? contactLink.href : null;
            });
            return contactUrl;
        } catch (error) {
            return null;
        }
    }
    
    /**
     * Filter out invalid or unwanted emails
     */
    filterValidEmails(emails) {
        const blacklist = [
            'example.com',
            'sentry.io',
            'wixpress.com',
            'squarespace.com',
            'wordpress.com',
            'cloudflare.com',
            'googleapis.com',
            '@2x.',
            '@3x.',
            'noreply',
            'no-reply',
            'donotreply'
        ];
        
        return emails.filter(email => {
            // Check blacklist
            const lowerEmail = email.toLowerCase();
            for (const blocked of blacklist) {
                if (lowerEmail.includes(blocked)) {
                    return false;
                }
            }
            
            // Validate email format
            const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            return emailRegex.test(email);
        });
    }
    
    /**
     * Get statistics
     */
    getStats() {
        return {
            visitedUrls: this.visitedUrls.size,
            cachedEmails: this.emailCache.size,
            totalEmailsFound: Array.from(this.emailCache.values()).reduce((sum, emails) => sum + emails.length, 0)
        };
    }
}

module.exports = EmailExtractor;