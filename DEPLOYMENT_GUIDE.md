# Deployment Guide - Google Maps Business Scraper

## 📦 Package Contents

This deployment package contains everything needed to run the Google Maps Business Scraper on Apify:

```
google-maps-business-scraper/
├── .actor/
│   ├── actor.json           # Actor configuration
│   ├── INPUT_SCHEMA.json   # Input UI configuration
│   └── Dockerfile          # Container setup
├── src/
│   └── scraper/
│       └── GoogleMapsScraper.js  # Core scraper (100+ results)
├── main.js                  # Apify Actor entry point
├── test.js                  # Local test script
├── package.json            # Dependencies
├── README.md               # Documentation
└── .gitignore             # Git ignore rules
```

## 🚀 Deployment Steps

### Option 1: Apify CLI (Recommended)

1. **Install Apify CLI** (if not already installed):
```bash
npm install -g apify-cli
```

2. **Login to Apify**:
```bash
apify login
```

3. **Navigate to this folder**:
```bash
cd "/Users/futurizerush/Documents/Claude Project 2025/Apify Actor 專案/Google Map Scraping Test/Apify - Google Map Business Scraper"
```

4. **Initialize and push**:
```bash
apify init
apify push
```

### Option 2: Manual Upload

1. **Create ZIP file**:
```bash
# From the parent directory
zip -r google-maps-business-scraper.zip "Apify - Google Map Business Scraper" -x "*/node_modules/*" "*.DS_Store"
```

2. **Upload to Apify Console**:
   - Go to [Apify Console](https://console.apify.com)
   - Click "Create new Actor"
   - Choose "Upload ZIP file"
   - Upload the created ZIP file

### Option 3: GitHub Integration

1. **Push to GitHub**:
```bash
git init
git add .
git commit -m "Initial commit - Google Maps Business Scraper"
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

2. **Connect in Apify**:
   - Go to Apify Console
   - Create new Actor
   - Choose "GitHub repository"
   - Connect your repository

## 🧪 Testing Before Deployment

1. **Install dependencies locally**:
```bash
npm install
```

2. **Run test script**:
```bash
npm test
```

3. **Expected output**:
   - Should find 50+ businesses
   - Browser window will open (headless: false)
   - Results will be displayed in console

## ⚙️ Configuration

### Input Parameters

Configure these in Apify Console or via API:

- `searchQueries`: Array of search terms (e.g., ["restaurants New York"])
- `maxResults`: Maximum results per search (default: 100, max: ~120)
- `language`: Language code (default: "en")
- `scrapeDetails`: Enable detailed scraping (slower but more data)
- `maxScrolls`: Number of scroll attempts (default: 50)
- `proxyConfiguration`: Apify proxy settings

### Recommended Settings

For best results:
```json
{
    "searchQueries": ["restaurants Manhattan"],
    "maxResults": 100,
    "language": "en",
    "maxScrolls": 50,
    "proxyConfiguration": {
        "useApifyProxy": true,
        "apifyProxyGroups": ["RESIDENTIAL"]
    }
}
```

## 📊 Performance Expectations

- **Results per search**: 60-120 (location dependent)
- **Time per search**: 30-60 seconds
- **Memory usage**: ~200-400 MB
- **Success rate**: 95%+ with proxies

## 🔍 Monitoring

After deployment:

1. **Check logs** in Apify Console for errors
2. **Monitor dataset** for results
3. **Review statistics** in key-value store
4. **Set up webhooks** for notifications

## ⚠️ Important Notes

1. **Proxy Usage**: Always use proxies in production to avoid rate limiting
2. **Costs**: Each run consumes compute units based on duration
3. **Limits**: Google Maps typically shows max ~120 results per search
4. **Updates**: Check for scraper updates if Google changes their UI

## 🆘 Troubleshooting

### Common Issues

1. **Few results returned**:
   - Increase `maxScrolls` to 75-100
   - Use more specific search queries
   - Check if location has enough businesses

2. **Timeout errors**:
   - Increase actor timeout in settings
   - Reduce `maxScrolls` if consistent
   - Enable residential proxies

3. **No results**:
   - Verify search query is valid
   - Check proxy configuration
   - Review logs for specific errors

## 📝 Support

For issues or questions:
- Check Apify Console logs
- Review the README.md
- Test locally with test.js
- Contact support with actor run ID

## ✅ Deployment Checklist

- [ ] Test locally with `npm test`
- [ ] Configure INPUT_SCHEMA.json if needed
- [ ] Set appropriate memory (512 MB recommended)
- [ ] Configure proxy settings
- [ ] Test with small batch first
- [ ] Monitor first few runs
- [ ] Set up error notifications

Ready to deploy! 🚀