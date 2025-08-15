# Google Maps Business Scraper 🗺️

A powerful Apify Actor for extracting comprehensive business data from Google Maps. Capable of retrieving 100+ business listings per search with **complete addresses**, ratings, reviews, phone numbers, websites, and more.

## 🚀 Key Features

- **100+ Results Per Search**: Aggressive scrolling strategy to maximize results (Google's limit ~120)
- **Complete Address Extraction**: Full addresses with street, city, region, postal code (requires scrapeDetails)
- **Comprehensive Data**: Names, ratings, reviews, phone numbers, websites, business hours
- **Multi-language Support**: English, Chinese (Traditional/Simplified), Japanese, Korean, Spanish, French, German, Vietnamese
- **Smart Retry Mechanism**: Handles timeouts and network issues gracefully
- **Batch Processing**: Process multiple search queries or direct URLs
- **Smart Resource Blocking**: Blocks images, fonts, and trackers for faster scraping
- **No Proxy Required**: Direct connection for simplified deployment

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
| `scrapeDetails` | Boolean | true | Scrape detailed info from business pages (recommended for complete addresses) |
| `maxScrolls` | Number | 50 | Maximum scroll attempts |

## Performance

- **Initial Load**: ~20 results
- **With Scrolling**: 60-120 results (location dependent)
- **Timeout Handling**: 60-90 second navigation timeout with smart retry

## Best Practices

1. **Use Specific Queries**: "Italian restaurants Manhattan" yields better results than generic "restaurants"
2. **Batch Similar Searches**: Group searches by location or business type for efficiency
3. **Monitor Statistics**: Check the output statistics for success rates
4. **Respect Rate Limits**: Add delays between searches to avoid rate limiting
