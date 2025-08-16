/**
 * 資料清理工具單元測試
 */

const {
    cleanBusinessName,
    cleanPhoneNumber,
    cleanAddress,
    cleanWebsiteUrl,
    validateEmail,
    extractEmails,
    cleanBusinessHours,
    normalizeRating,
    normalizeReviewCount,
    cleanBusinessType
} = require('../../src/utils/dataCleaners');

describe('DataCleaners 單元測試', () => {
    
    describe('cleanBusinessName', () => {
        test('應該移除多餘空格', () => {
            expect(cleanBusinessName('  星巴克  咖啡  ')).toBe('星巴克 咖啡');
        });
        
        test('應該處理特殊字符', () => {
            expect(cleanBusinessName('Café@123')).toBe('Café@123');
        });
        
        test('應該處理空值', () => {
            expect(cleanBusinessName(null)).toBe('');
            expect(cleanBusinessName(undefined)).toBe('');
        });
    });
    
    describe('cleanPhoneNumber', () => {
        test('應該清理台灣電話格式', () => {
            expect(cleanPhoneNumber('(02) 2345-6789')).toBe('+886 2 2345 6789');
            expect(cleanPhoneNumber('02-2345-6789')).toBe('+886 2 2345 6789');
        });
        
        test('應該保留國際格式', () => {
            expect(cleanPhoneNumber('+886 2 2345 6789')).toBe('+886 2 2345 6789');
        });
        
        test('應該處理手機號碼', () => {
            expect(cleanPhoneNumber('0912-345-678')).toBe('+886 912 345 678');
        });
        
        test('應該處理無效電話', () => {
            expect(cleanPhoneNumber('200-400')).toBe('');
            expect(cleanPhoneNumber('abc')).toBe('');
        });
    });
    
    describe('cleanAddress', () => {
        test('應該清理地址格式', () => {
            expect(cleanAddress('  台北市  信義區  信義路  ')).toBe('台北市信義區信義路');
        });
        
        test('應該移除評分格式', () => {
            expect(cleanAddress('4.5(200)')).toBe('');
            expect(cleanAddress('4.5 (2,000)')).toBe('');
        });
        
        test('應該保留有效地址', () => {
            expect(cleanAddress('110台北市信義區信義路五段7號')).toBe('110台北市信義區信義路五段7號');
        });
    });
    
    describe('cleanWebsiteUrl', () => {
        test('應該添加協議', () => {
            expect(cleanWebsiteUrl('www.example.com')).toBe('https://www.example.com');
        });
        
        test('應該清理 URL 參數', () => {
            expect(cleanWebsiteUrl('https://example.com?utm_source=google'))
                .toBe('https://example.com');
        });
        
        test('應該處理 Facebook URL', () => {
            expect(cleanWebsiteUrl('facebook.com/page123'))
                .toBe('https://www.facebook.com/page123');
        });
    });
    
    describe('validateEmail', () => {
        test('應該驗證有效郵件', () => {
            expect(validateEmail('test@example.com')).toBe(true);
            expect(validateEmail('user.name@company.co.tw')).toBe(true);
        });
        
        test('應該拒絕無效郵件', () => {
            expect(validateEmail('notanemail')).toBe(false);
            expect(validateEmail('@example.com')).toBe(false);
            expect(validateEmail('test@')).toBe(false);
        });
    });
    
    describe('extractEmails', () => {
        test('應該提取多個郵件', () => {
            const text = 'Contact us at info@example.com or sales@example.com';
            expect(extractEmails(text)).toEqual(['info@example.com', 'sales@example.com']);
        });
        
        test('應該去重複', () => {
            const text = 'Email: test@example.com, contact: test@example.com';
            expect(extractEmails(text)).toEqual(['test@example.com']);
        });
        
        test('應該返回空陣列當無郵件時', () => {
            expect(extractEmails('No email here')).toEqual([]);
        });
    });
    
    describe('cleanBusinessHours', () => {
        test('應該格式化營業時間', () => {
            const hours = {
                '星期一': '09:00-18:00',
                '星期二': '09:00-18:00'
            };
            const result = cleanBusinessHours(hours);
            expect(result).toContain('星期一: 09:00-18:00');
            expect(result).toContain('星期二: 09:00-18:00');
        });
        
        test('應該處理休息日', () => {
            const hours = {
                '星期一': '休息',
                '星期二': '09:00-18:00'
            };
            const result = cleanBusinessHours(hours);
            expect(result).toContain('星期一: 休息');
        });
    });
    
    describe('normalizeRating', () => {
        test('應該正規化評分', () => {
            expect(normalizeRating(4.567)).toBe(4.6);
            expect(normalizeRating('4.5')).toBe(4.5);
            expect(normalizeRating(5.5)).toBe(5.0);
            expect(normalizeRating(-1)).toBe(0);
        });
        
        test('應該處理無效評分', () => {
            expect(normalizeRating('abc')).toBe(0);
            expect(normalizeRating(null)).toBe(0);
        });
    });
    
    describe('normalizeReviewCount', () => {
        test('應該正規化評論數', () => {
            expect(normalizeReviewCount('1,234')).toBe(1234);
            expect(normalizeReviewCount(500)).toBe(500);
            expect(normalizeReviewCount('(200)')).toBe(200);
        });
        
        test('應該處理無效值', () => {
            expect(normalizeReviewCount('abc')).toBe(0);
            expect(normalizeReviewCount(null)).toBe(0);
        });
    });
    
    describe('cleanBusinessType', () => {
        test('應該清理商家類型', () => {
            expect(cleanBusinessType('  餐廳  ')).toBe('餐廳');
            expect(cleanBusinessType('Coffee Shop')).toBe('Coffee Shop');
        });
        
        test('應該過濾無效類型', () => {
            expect(cleanBusinessType('4.5(200)')).toBe('');
            expect(cleanBusinessType('$$$')).toBe('');
        });
    });
});