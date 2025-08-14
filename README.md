# Google Maps Business Scraper

Advanced Google Maps scraper capable of extracting 100+ business listings per search with comprehensive business information.

## 🚀 Key Features

- **100+ Results Per Search**: Aggressive scrolling strategy to maximize results (Google's limit ~120)
- **Comprehensive Data Extraction**: Names, ratings, reviews, addresses, phone numbers, websites, hours
- **Multi-language Support**: English, Chinese (Traditional/Simplified), Japanese, Korean, Spanish, French, German
- **Batch Processing**: Process multiple search queries or direct URLs
- **Proxy Support**: Built-in Apify proxy configuration
- **Smart Resource Blocking**: Blocks images, fonts, and trackers for faster scraping

## Quick Start

### Deploy to Apify

1. Push to Apify platform:
```bash
apify push
```

2. Or upload via Apify Console

### Input Configuration

#### Basic Example
```json
{
    "searchQueries": ["restaurants New York", "coffee shops Brooklyn"],
    "maxResults": 100,
    "language": "en"
}
```

#### Advanced Example
```json
{
    "searchQueries": ["restaurants Manhattan"],
    "maxResults": 120,
    "language": "en",
    "scrapeDetails": true,
    "maxScrolls": 50,
    "proxyConfiguration": {
        "useApifyProxy": true,
        "apifyProxyGroups": ["RESIDENTIAL"]
    }
}
```

## Output Schema

Each business record contains:

```json
{
    "name": "Business Name",
    "placeId": "ChIJxxxxxxxxxxxxxx",
    "rating": 4.5,
    "reviews": 234,
    "address": "123 Main St, New York, NY 10001",
    "businessType": "Restaurant",
    "priceLevel": "$$",
    "phone": "+1 212-555-1234",
    "website": "https://example.com",
    "url": "https://maps.google.com/maps/place/...",
    "query": "restaurants New York",
    "timestamp": "2024-01-13T12:00:00.000Z"
}
```

## Input Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `searchQueries` | Array | Required | List of search queries |
| `startUrls` | Array | [] | Direct Google Maps URLs to scrape |
| `maxResults` | Number | 100 | Maximum results per search (max ~120) |
| `language` | String | "en" | Language code for results |
| `scrapeDetails` | Boolean | false | Scrape detailed info from business pages |
| `maxScrolls` | Number | 50 | Maximum scroll attempts |
| `proxyConfiguration` | Object | null | Apify proxy configuration |

## Performance

- **Initial Load**: ~20 results
- **With Scrolling**: 60-120 results (location dependent)
- **Processing Speed**: ~30-60 seconds per search
- **Success Rate**: 95%+ with proper proxy configuration

## Best Practices

1. **Use Specific Queries**: "Italian restaurants Manhattan" yields better results than generic "restaurants"
2. **Enable Proxies**: Prevents rate limiting and improves success rate
3. **Batch Similar Searches**: Group searches by location or business type for efficiency
4. **Monitor Statistics**: Check the output statistics for success rates

## Support

For issues or questions, please create an issue in the repository.

## License

Apache-2.0