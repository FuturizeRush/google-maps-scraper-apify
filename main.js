/**
 * Apify Actor Entry Point
 * Google Maps Business Scraper - Extract 100+ business listings
 */

const { Actor, log } = require('apify');
const GoogleMapsScraper = require('./src/scraper/GoogleMapsScraper');

// Input validation function
const validateInput = (input) => {
    if (!input) {
        throw new Error('No input provided');
    }
    
    // Validate maxResults
    if (input.maxResults && input.maxResults > 200) {
        log.warning('maxResults capped at 200 (was ' + input.maxResults + ')');
        input.maxResults = 200;
    }
    
    // Clean searchQueries
    if (input.searchQueries) {
        input.searchQueries = input.searchQueries
            .filter(q => q && typeof q === 'string' && q.trim())
            .map(q => q.trim());
    }
    
    // Validate maxScrolls
    if (input.maxScrolls && input.maxScrolls > 100) {
        log.warning('maxScrolls capped at 100 (was ' + input.maxScrolls + ')');
        input.maxScrolls = 100;
    }
    
    return input;
};

Actor.main(async () => {
    // Get input
    let input = await Actor.getInput();
    log.info('Starting Google Maps Business Scraper');
    log.info('Input:', input);

    // Validate input
    input = validateInput(input);

    const {
        searchQueries = [],
        startUrls = [],
        maxResults = 100,
        language = 'en',
        scrapeDetails = false,
        scrapeEmails = false,
        maxScrolls = 50,
        proxyConfiguration = null,
        useMultiSearch = false,
        searchRegions = []
    } = input;

    // Validate that we have something to search
    if (searchQueries.length === 0 && startUrls.length === 0) {
        throw new Error('Please provide either searchQueries or startUrls');
    }

    // Setup proxy (disabled for now)
    const proxyConfig = null; // await Actor.createProxyConfiguration(proxyConfiguration);

    // Initialize dataset
    const dataset = await Actor.openDataset();
    
    // Statistics
    const stats = {
        totalSearches: 0,
        totalResults: 0,
        failedSearches: 0,
        startTime: Date.now()
    };

    // Process search queries
    for (const query of searchQueries) {
        try {
            log.info(`Processing search query: ${query}`);
            stats.totalSearches++;

            // Get proxy URL
            let proxyUrl = null;
            if (proxyConfig) {
                proxyUrl = await proxyConfig.newUrl();
            }
            
            // Create scraper instance
            const scraper = new GoogleMapsScraper({
                searchQuery: query,
                maxResults,
                language,
                headless: true,
                maxScrolls,
                scrapeDetails,
                scrapeEmails,
                proxyUrl
            });

            // Initialize and run scraper
            await scraper.init();
            
            let results;
            if (useMultiSearch && maxResults > 50) {
                // Use multi-region search for large result sets
                results = await scraper.searchMultipleQueries(query, searchRegions);
            } else {
                // Single search
                results = await scraper.search();
            }
            
            log.info(`Found ${results.length} results for "${query}"`);
            stats.totalResults += results.length;

            // Save results to dataset in batches
            const BATCH_SIZE = 50;
            for (let i = 0; i < results.length; i += BATCH_SIZE) {
                const batch = results.slice(i, i + BATCH_SIZE).map(business => ({
                    query,
                    timestamp: new Date().toISOString(),
                    ...business
                }));
                await dataset.pushData(batch);
            }

            // Clean up
            await scraper.close();

            // Be nice to Google
            await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (error) {
            log.error(`Failed to process query "${query}":`, error.message);
            log.error('Error stack:', error.stack);
            stats.failedSearches++;
            
            // Save error to dataset
            await dataset.pushData({
                query,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    // Process start URLs if provided
    for (const urlObj of startUrls) {
        try {
            const url = urlObj.url || urlObj;
            log.info(`Processing URL: ${url}`);
            stats.totalSearches++;

            // Extract search query from URL
            const urlParams = new URL(url);
            const searchPath = urlParams.pathname.split('/search/')[1];
            const searchQuery = searchPath ? decodeURIComponent(searchPath.split('/')[0]) : 'Direct URL';

            // Get proxy URL
            let proxyUrl = null;
            if (proxyConfig) {
                proxyUrl = await proxyConfig.newUrl();
            }

            // Create scraper instance
            const scraper = new GoogleMapsScraper({
                directUrl: url,
                searchQuery,
                maxResults,
                language,
                headless: true,
                maxScrolls,
                scrapeDetails,
                scrapeEmails,
                proxyUrl
            });

            // Initialize and run scraper
            await scraper.init();
            const results = await scraper.searchByUrl(url);
            
            log.info(`Found ${results.length} results from URL`);
            stats.totalResults += results.length;

            // Save results to dataset in batches
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

            // Clean up
            await scraper.close();

            // Be nice to Google
            await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (error) {
            log.error(`Failed to process URL "${urlObj.url || urlObj}":`, error.message);
            log.error('Error stack:', error.stack);
            stats.failedSearches++;
            
            // Save error to dataset
            await dataset.pushData({
                sourceUrl: urlObj.url,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    // Calculate final statistics
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

    // Save statistics to key-value store
    await Actor.setValue('STATS', finalStats);

    // Create summary
    const summary = {
        totalResults: stats.totalResults,
        totalSearches: stats.totalSearches,
        failedSearches: stats.failedSearches,
        duration: finalStats.duration,
        averageResultsPerSearch: finalStats.averageResultsPerSearch,
        successRate: finalStats.successRate
    };

    log.info('Summary:', summary);
    
    return summary;
});