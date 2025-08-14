/**
 * Simple test script for Google Maps Business Scraper
 * Run locally to verify the scraper works before deploying to Apify
 */

const GoogleMapsScraper = require('./src/scraper/GoogleMapsScraper');

async function runTest() {
    console.log('🚀 Testing Google Maps Business Scraper\n');
    
    const scraper = new GoogleMapsScraper({
        searchQuery: 'restaurants New York',
        maxResults: 50,
        language: 'en',
        headless: false,  // Set to false to see browser
        maxScrolls: 25
    });
    
    try {
        console.log('Initializing scraper...');
        await scraper.init();
        
        console.log('Starting search...');
        const results = await scraper.search();
        
        console.log(`\n✅ Test completed successfully!`);
        console.log(`Found ${results.length} businesses\n`);
        
        // Display first 3 results
        if (results.length > 0) {
            console.log('Sample results:');
            results.slice(0, 3).forEach((business, i) => {
                console.log(`\n${i + 1}. ${business.name}`);
                console.log(`   Rating: ${business.rating} ⭐ (${business.reviews} reviews)`);
                console.log(`   Address: ${business.address}`);
                console.log(`   Type: ${business.businessType}`);
            });
        }
        
        // Show statistics
        const stats = scraper.getStats();
        console.log('\n📊 Statistics:');
        console.log(`   Results loaded: ${stats.loadedCount}`);
        console.log(`   Results extracted: ${stats.extractedCount}`);
        console.log(`   Scroll attempts: ${stats.scrollAttempts}`);
        
        await scraper.close();
        
        if (results.length >= 50) {
            console.log('\n🎉 SUCCESS: Scraper is working correctly!');
            console.log('Ready for deployment to Apify.');
        } else {
            console.log('\n⚠️ Warning: Got fewer results than expected.');
            console.log('Check your internet connection and try again.');
        }
        
    } catch (error) {
        console.error('\n❌ Test failed:', error);
        await scraper.close();
        process.exit(1);
    }
}

// Run test
runTest();