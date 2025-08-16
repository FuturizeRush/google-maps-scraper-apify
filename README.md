# Google Maps Business Scraper - Extract Business Data at Scale 🗺️

**Extract business listings from Google Maps with complete information including addresses, phone numbers, hours, emails, and more.** Built for Apify platform with enterprise-grade reliability.

[![Apify Actor](https://img.shields.io/badge/Apify-Actor-green)](https://apify.com/actors)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

## ✨ What You Can Extract

This Google Maps scraper extracts comprehensive business data including:

- **Business Information**: Name, ratings (1-5 stars), review counts, business type/category
- **Contact Details**: Phone numbers, websites, email addresses (from websites)
- **Location Data**: Complete addresses, Google Maps URLs, Place IDs, GPS coordinates
- **Operating Hours**: Full weekly schedules including 24-hour businesses
- **Price Levels**: Budget indicators ($, $$, $$$, $$$$)

## 🚀 Quick Start Guide

### 1. Deploy on Apify

```bash
# Clone the repository
git clone https://github.com/FuturizeRush/google-maps-scraper-apify.git

# Navigate to project
cd google-maps-scraper-apify

# Deploy to Apify
apify push
```

### 2. Basic Usage

Simply provide search queries to start extracting data:

```json
{
    "searchQueries": [
        "coffee shops Taipei",
        "restaurants Xinyi District",
        "7-11 convenience stores Taiwan"
    ]
}
```

### 3. View Results

Results are automatically saved to Apify Dataset in JSON format, ready for export to CSV, Excel, or API integration.

## 📊 Input Configuration

### Required Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `searchQueries` | Array | Search terms for Google Maps | `["starbucks taipei 101"]` |

### Optional Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `maxResults` | Number | 100 | Results per search (min: 50, max: 200) |
| `language` | String | "en" | Interface language (en, zh-TW, zh-CN, ja, ko, es, fr, de) |
| `scrapeDetails` | Boolean | true | Extract detailed information from each business page |
| `scrapeEmails` | Boolean | true | Attempt to extract emails from business websites |
| `maxScrolls` | Number | 50 | Maximum scroll attempts (min: 20, max: 100) |

### Example: Full Configuration

```json
{
    "searchQueries": [
        "hotels near Taipei Main Station",
        "night markets Taipei"
    ],
    "maxResults": 100,
    "language": "zh-TW",
    "scrapeDetails": true,
    "scrapeEmails": true,
    "maxScrolls": 50
}
```

## 📦 Output Data Format

Each business entry contains:

```json
{
    "query": "starbucks xinyi",
    "timestamp": "2025-08-16T00:00:00.000Z",
    "name": "Starbucks Coffee Taipei 101",
    "placeId": "ChIJxxxxxxxxxxxxxx",
    "latitude": 25.033976,
    "longitude": 121.564473,
    "rating": 4.2,
    "reviews": 1542,
    "address": "110 Taiwan, Taipei City, Xinyi District, Section 5, Xinyi Road, 7號",
    "businessType": "Coffee shop",
    "phone": "+886 2 8101 0701",
    "url": "https://maps.google.com/...",
    "website": "https://www.starbucks.com.tw",
    "hours": [
        "Monday: 07:00–22:00",
        "Tuesday: 07:00–22:00",
        "Wednesday: 07:00–22:00",
        "Thursday: 07:00–22:00",
        "Friday: 07:00–22:00",
        "Saturday: 07:00–22:00",
        "Sunday: 07:00–22:00"
    ],
    "hoursDetail": {
        "Monday": "07:00–22:00",
        "Tuesday": "07:00–22:00",
        "Wednesday": "07:00–22:00",
        "Thursday": "07:00–22:00",
        "Friday": "07:00–22:00",
        "Saturday": "07:00–22:00",
        "Sunday": "07:00–22:00"
    },
    "priceLevel": "$$",
    "email": "customer@starbucks.com.tw",
    "emails": ["customer@starbucks.com.tw"]
}
```

## 🎯 Use Cases

### Market Research
- Analyze competitor locations and ratings
- Identify market gaps in specific areas
- Track business density by category

### Lead Generation
- Extract contact information for B2B outreach
- Build targeted business lists by location
- Find businesses without websites (opportunities)

### Local SEO
- Gather business citations for SEO campaigns
- Monitor local business landscapes
- Track competitor presence in target areas

### Data Analysis
- Business distribution studies
- Rating and review analysis
- Operating hours patterns research

## 💡 Best Practices

### 1. Optimize Your Searches
- **Be Specific**: "Italian restaurants downtown Taipei" > "restaurants"
- **Use Local Language**: Search in the local language for better results
- **Include Location**: Always specify area/city for accurate results

### 2. Cost Optimization
- **Batch Searches**: Combine related searches to maximize efficiency
- **Set Appropriate Limits**: Use `maxResults: 50-100` for balanced cost/data ratio
- **Enable Details Selectively**: Only use `scrapeDetails: true` when needed

### 3. Data Quality
- **Verify Results**: Cross-check critical data points
- **Handle Missing Data**: Not all businesses have complete information
- **Regular Updates**: Re-scrape periodically for current data

## 🔧 Advanced Features

### Multi-Region Search
Enable broader coverage with region-specific searches:

```json
{
    "searchQueries": ["coffee shops"],
    "useMultiSearch": true,
    "searchRegions": ["Taipei North", "Taipei South", "Taipei East", "Taipei West"]
}
```

### Direct URL Scraping
Scrape specific Google Maps URLs directly:

```json
{
    "startUrls": [
        {"url": "https://www.google.com/maps/search/restaurants+taipei"}
    ]
}
```

## 📈 Performance Metrics

- **Speed**: ~30-60 seconds per 100 results
- **Success Rate**: 95%+ data extraction accuracy
- **Coverage**: Up to 120 results per search (Google's limit)
- **Languages**: 8 supported languages for international data

## 🛠️ Technical Details

- **Platform**: Apify Actor (Node.js 20)
- **Browser**: Puppeteer with Chrome
- **Storage**: Automatic dataset storage on Apify
- **Export Formats**: JSON, CSV, Excel, XML

## 📝 Important Notes

### Data Limits
- Google Maps typically shows maximum ~120 results per search
- Some businesses may not have all data fields available
- Email extraction requires visiting business websites (slower)

### Rate Limiting
- The scraper includes automatic retry mechanisms
- Built-in delays to avoid rate limiting
- No proxy required for standard usage

### Compliance
- Respect robots.txt and terms of service
- Use extracted data responsibly
- Consider GDPR/privacy regulations for email data

## 🤝 Support & Contribution

### Getting Help
- **Issues**: [GitHub Issues](https://github.com/FuturizeRush/google-maps-scraper-apify/issues)
- **Documentation**: This README and code comments
- **Apify Support**: [Apify Discord](https://discord.com/invite/jyEM2PRvMU)

### Contributing
We welcome contributions! Please:
1. Fork the repository
2. Create your feature branch
3. Test your changes thoroughly
4. Submit a pull request

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

Built with:
- [Apify SDK](https://sdk.apify.com/) - Web scraping and automation platform
- [Puppeteer](https://pptr.dev/) - Headless Chrome automation
- Google Maps data for business insights

---

**Ready to extract Google Maps data?** [Deploy on Apify](https://apify.com) and start gathering business intelligence today!