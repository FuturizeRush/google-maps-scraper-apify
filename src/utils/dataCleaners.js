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
        .replace(/複製營業時間/g, '')
        .replace(/\bSee more hours\b/gi, '')
        .replace(/·\s*See more/gi, '')
        .replace(/,\s*複製營業時間/g, '')
        .replace(/,\s*Copy hours/gi, '')
        .trim();
    
    // 處理24小時營業格式
    if (cleaned.includes('24 小時營業') || cleaned.includes('24小時營業')) {
        // 如果只是單純的 "星期X、24 小時營業"，保持簡潔格式
        cleaned = cleaned
            .replace(/^(星期[一二三四五六日])[、，]\s*/g, '$1: ')
            .replace(/^(週[一二三四五六日])[、，]\s*/g, '$1: ');
    }
    
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

/**
 * 清理商家名稱
 */
function cleanBusinessName(name) {
    if (!name) return '';
    return name.trim().replace(/\s+/g, ' ');
}

/**
 * 清理電話號碼
 */
function cleanPhoneNumber(phone) {
    if (!phone) return '';
    
    // 移除價格範圍格式
    if (phone.match(/^\d{2,3}-\d{2,3}$/)) return '';
    
    // 移除非數字字符（保留 + 和空格）
    let cleaned = phone.replace(/[^\d+\s\-()]/g, '').trim();
    
    // 如果不包含數字，返回空
    if (!cleaned.match(/\d/)) return '';
    
    // 台灣電話格式轉換
    if (cleaned.match(/^0\d{1,2}[\s\-]?\d{3,4}[\s\-]?\d{3,4}$/)) {
        cleaned = cleaned.replace(/^0/, '+886 ');
        cleaned = cleaned.replace(/[\s\-]+/g, ' ');
    }
    
    // 台灣手機格式
    if (cleaned.match(/^09\d{2}[\s\-]?\d{3}[\s\-]?\d{3}$/)) {
        cleaned = cleaned.replace(/^0/, '+886 ');
        cleaned = cleaned.replace(/[\s\-]+/g, ' ');
    }
    
    return cleaned;
}

/**
 * 清理地址
 */
function cleanAddress(address) {
    if (!address) return '';
    
    // 移除評分格式
    if (address.match(/^[\d.]+\s*\([0-9,]+\)$/)) return '';
    
    // 清理多餘空格
    return address.trim().replace(/\s+/g, '');
}

/**
 * 清理網站 URL
 */
function cleanWebsiteUrl(url) {
    if (!url) return '';
    
    let cleaned = url.trim();
    
    // 添加協議
    if (!cleaned.match(/^https?:\/\//)) {
        if (cleaned.includes('facebook.com')) {
            cleaned = 'https://www.' + cleaned;
        } else if (cleaned.startsWith('www.')) {
            cleaned = 'https://' + cleaned;
        } else {
            cleaned = 'https://' + cleaned;
        }
    }
    
    // 移除 UTM 參數
    if (cleaned.includes('?')) {
        cleaned = cleaned.split('?')[0];
    }
    
    return cleaned;
}

/**
 * 驗證郵件地址
 */
function validateEmail(email) {
    if (!email) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * 從文字中提取郵件地址
 */
function extractEmails(text) {
    if (!text) return [];
    
    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    const matches = text.match(emailRegex) || [];
    
    // 去重複
    return [...new Set(matches)];
}

/**
 * 正規化評分
 */
function normalizeRating(rating) {
    if (!rating && rating !== 0) return 0;
    
    const num = parseFloat(rating);
    if (isNaN(num)) return 0;
    
    // 限制在 0-5 範圍內
    const normalized = Math.max(0, Math.min(5, num));
    
    // 四捨五入到小數點後一位
    return Math.round(normalized * 10) / 10;
}

/**
 * 正規化評論數
 */
function normalizeReviewCount(count) {
    if (!count && count !== 0) return 0;
    
    // 移除逗號和括號
    const cleaned = String(count).replace(/[,()]/g, '');
    const num = parseInt(cleaned, 10);
    
    return isNaN(num) ? 0 : num;
}

/**
 * 清理商家類型
 */
function cleanBusinessType(type) {
    if (!type) return '';
    
    const cleaned = type.trim();
    
    // 過濾掉看起來像評分或價格的文字
    if (cleaned.match(/^[\d.]+\s*\([0-9,]+\)$/)) return '';
    if (cleaned.match(/^\$+$/)) return '';
    
    return cleaned;
}

// 別名函數 (為了兼容性)
const normalizeAddress = validateAddress;
const normalizePhoneNumber = cleanPhoneNumber;
const normalizePriceLevel = extractPriceLevel;
const normalizeBusinessHours = cleanBusinessHours;

module.exports = {
    cleanUnicodeText,
    extractBusinessType,
    extractPriceLevel,
    cleanBusinessHours,
    validateAddress,
    // 新增的函數
    cleanBusinessName,
    cleanPhoneNumber,
    cleanAddress,
    cleanWebsiteUrl,
    validateEmail,
    extractEmails,
    normalizeRating,
    normalizeReviewCount,
    cleanBusinessType,
    // 別名
    normalizeAddress,
    normalizePhoneNumber,
    normalizePriceLevel,
    normalizeBusinessHours
};