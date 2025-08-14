/**
 * Batch Email Extractor for parallel processing
 */

const { log } = require('apify');

class BatchEmailExtractor {
    constructor(page, config = {}) {
        this.page = page;
        this.config = {
            batchSize: config.batchSize || 5,
            timeout: config.timeout || 5000,
            maxRetries: config.maxRetries || 1
        };
    }
    
    /**
     * Extract emails from multiple businesses in parallel
     */
    async extractEmailsBatch(businesses) {
        const results = [];
        
        // Process in batches
        for (let i = 0; i < businesses.length; i += this.config.batchSize) {
            const batch = businesses.slice(i, i + this.config.batchSize);
            
            log.info(`Processing email batch ${Math.floor(i / this.config.batchSize) + 1} of ${Math.ceil(businesses.length / this.config.batchSize)}`);
            
            // Process batch in parallel
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
            
            // Small delay between batches
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