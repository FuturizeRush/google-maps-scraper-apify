/**
 * Google Maps 爬蟲資料清理工具
 * 提供各種資料處理和標準化函式
 */

/**
 * 清理文字中的 Unicode 特殊字元
 * @param {String} text - 輸入文字
 * @returns {String} - 清理後的文字
 */
function cleanUnicodeText(text) {
    if (!text) return '';
    
    // 移除常見的 Unicode 控制字元
    let cleaned = text
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // 控制字元
        .replace(/[\uE000-\uF8FF]/g, '') // 私用區域
        .replace(/[\uFFF0-\uFFFF]/g, '') // 特殊字元
        .replace(/[\u200B-\u200D\uFEFF]/g, '') // 零寬字元
        .trim();
    
    // 將多個空格替換成單個空格
    cleaned = cleaned.replace(/\s+/g, ' ');
    
    return cleaned;
}

/**
 * 提取乾淨的商家類型（排除評分和數字）
 * @param {String} text - 輸入文字
 * @returns {String} - 商家類型
 */
function extractBusinessType(text) {
    if (!text) return '';
    
    // Skip if it looks like a rating (e.g., "4.6(1,636)")
    if (text.match(/^\d+\.\d+\s*\(\d+/)) return '';
    
    // Skip if it's just numbers
    if (text.match(/^[\d\s\.\,\(\)]+$/)) return '';
    
    // Clean and return
    return cleanUnicodeText(text);
}

/**
 * Extract price level from various formats
 */
function extractPriceLevel(text) {
    if (!text) return '';
    
    // Look for currency symbols
    const priceMatch = text.match(/[\$¥€£₹₩]+/);
    if (priceMatch) {
        return priceMatch[0];
    }
    
    // Look for price descriptors
    if (text.match(/expensive|moderate|inexpensive|cheap/i)) {
        const dollarCount = text.match(/expensive/i) ? '$$$$' :
                          text.match(/moderate/i) ? '$$' :
                          '$';
        return dollarCount;
    }
    
    return '';
}

/**
 * Clean and format business hours
 */
function cleanBusinessHours(text) {
    if (!text) return '';
    
    // Remove Unicode control characters
    let cleaned = cleanUnicodeText(text);
    
    // Remove "Copy open hours" and similar text
    cleaned = cleaned
        .replace(/Copy open hours/gi, '')
        .replace(/\bSee more hours\b/gi, '')
        .replace(/·\s*See more/gi, '')
        .trim();
    
    // Remove trailing commas
    cleaned = cleaned.replace(/,\s*$/, '');
    
    // If it's too short or looks corrupted, return empty
    if (cleaned.length < 5 || cleaned.match(/^[\u0080-\uFFFF]+$/)) {
        return '';
    }
    
    return cleaned;
}

/**
 * Validate and clean address
 */
function validateAddress(address) {
    if (!address) return '';
    
    // Clean Unicode
    let cleaned = cleanUnicodeText(address);
    
    // Check if it's a valid address (should have some text and possibly numbers)
    if (cleaned.length < 5) return '';
    
    // Remove business hours if accidentally included
    cleaned = cleaned
        .replace(/營業中.*$/i, '')
        .replace(/已打烊.*$/i, '')
        .replace(/Opens.*$/i, '')
        .replace(/Closes.*$/i, '')
        .replace(/⋅.*$/i, '')
        .trim();
    
    // Keep original format for most addresses
    // Only apply minimal formatting to avoid corrupting addresses
    
    // Japan address: ensure postal code format (〒XXX-XXXX) if present
    if (cleaned.includes('Japan') || cleaned.includes('日本')) {
        cleaned = cleaned.replace(/〒(\d{3})-?(\d{4})/, '〒$1-$2');
    }
    
    // Korea address: format postal code if needed
    if (cleaned.includes('Korea') || cleaned.includes('대한민국') || cleaned.includes('South Korea')) {
        // Korean postal codes are 5 digits - ensure proper formatting
        const postalMatch = cleaned.match(/\b(\d{5})\b/);
        if (postalMatch) {
            // Only move if it's clearly at the wrong position
            const postal = postalMatch[1];
            const postalIndex = cleaned.indexOf(postal);
            const totalLength = cleaned.length;
            
            // If postal code is in the last 20% of the address, it might need moving
            if (postalIndex > totalLength * 0.8 && !cleaned.startsWith(postal)) {
                cleaned = cleaned.replace(postal, '').replace(/,\s*,/, ',').trim();
                cleaned = `${postal} ${cleaned}`;
            }
        }
    }
    
    // Taiwan addresses: keep original format (postal codes traditionally appear at the end)
    // No changes needed for Taiwan
    
    return cleaned;
}

module.exports = {
    cleanUnicodeText,
    extractBusinessType,
    extractPriceLevel,
    cleanBusinessHours,
    validateAddress
};