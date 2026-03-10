/**
 * AI Pavilion - Translation Service with Caching
 */

import { CONFIG } from '../config/config.js';
import { apiService } from './api.service.js';
import { getFromStorage, saveToStorage } from '../utils/helpers.js';
import { CACHE_KEYS, EVENT_TYPES } from '../utils/constants.js';

class TranslateService {
    constructor() {
        this.config = CONFIG.translate;
        this.cache = new Map();
        this.cacheKey = CACHE_KEYS.TRANSLATIONS;
        this.listeners = [];
        
        // Load cache from storage
        this.loadCacheFromStorage();
    }

    // ==================== CACHE MANAGEMENT ====================

    loadCacheFromStorage() {
        if (!this.config.cacheEnabled) return;

        const cached = getFromStorage(this.cacheKey, {});
        Object.entries(cached).forEach(([key, value]) => {
            // Check if cached item is still valid
            if (Date.now() - value.timestamp < this.config.cacheDuration) {
                this.cache.set(key, value);
            }
        });
    }

    saveCacheToStorage() {
        if (!this.config.cacheEnabled) return;

        const cacheObject = {};
        this.cache.forEach((value, key) => {
            cacheObject[key] = value;
        });
        saveToStorage(this.cacheKey, cacheObject);
    }

    getCacheKey(text, targetLanguage, sourceLanguage) {
        return `${sourceLanguage}:${targetLanguage}:${text.substring(0, 100)}`;
    }

    getFromCache(text, targetLanguage, sourceLanguage) {
        if (!this.config.cacheEnabled) return null;

        const key = this.getCacheKey(text, targetLanguage, sourceLanguage);
        const cached = this.cache.get(key);

        if (!cached) return null;

        // Check if expired
        if (Date.now() - cached.timestamp > this.config.cacheDuration) {
            this.cache.delete(key);
            return null;
        }

        return cached.translation;
    }

    saveToCache(text, targetLanguage, sourceLanguage, translation) {
        if (!this.config.cacheEnabled) return;

        const key = this.getCacheKey(text, targetLanguage, sourceLanguage);
        this.cache.set(key, {
            translation,
            timestamp: Date.now()
        });

        // Periodically save to storage
        this.saveCacheToStorage();
    }

    clearCache() {
        this.cache.clear();
        saveToStorage(this.cacheKey, {});
    }

    // ==================== EVENT SYSTEM ====================

    subscribe(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(cb => cb !== callback);
        };
    }

    _notifyListeners(event, data) {
        this.listeners.forEach(callback => {
            try {
                callback(event, data);
            } catch (error) {
                console.error('Error in translate listener:', error);
            }
        });
    }

    // ==================== TRANSLATION ====================

    async translate(text, targetLanguage, sourceLanguage = 'auto') {
        if (!this.config.enabled) {
            console.warn('Translation is disabled');
            return text;
        }

        if (!text || text.trim().length === 0) {
            return text;
        }

        // Check if target is same as source (if known)
        if (sourceLanguage !== 'auto' && sourceLanguage === targetLanguage) {
            return text;
        }

        try {
            // Check cache first
            const cached = this.getFromCache(text, targetLanguage, sourceLanguage);
            if (cached) {
                console.log('Translation from cache:', text.substring(0, 50));
                return cached;
            }

            // Translate via API
            console.log('Translating:', text.substring(0, 50), 'to', targetLanguage);
            const translation = await apiService.translateText(
                text,
                targetLanguage,
                sourceLanguage
            );

            // Save to cache
            this.saveToCache(text, targetLanguage, sourceLanguage, translation);

            return translation;

        } catch (error) {
            console.error('Translation error:', error);
            
            // Fallback to original text
            return text;
        }
    }

    async translateBatch(texts, targetLanguage, sourceLanguage = 'auto') {
        if (!this.config.enabled) {
            return texts;
        }

        try {
            const results = [];
            const textsToTranslate = [];
            const indices = [];

            // Check cache for each text
            for (let i = 0; i < texts.length; i++) {
                const text = texts[i];
                const cached = this.getFromCache(text, targetLanguage, sourceLanguage);
                
                if (cached) {
                    results[i] = cached;
                } else {
                    textsToTranslate.push(text);
                    indices.push(i);
                }
            }

            // Translate uncached texts
            if (textsToTranslate.length > 0) {
                const translations = await apiService.translateBatch(
                    textsToTranslate,
                    targetLanguage,
                    sourceLanguage
                );

                // Save to cache and results
                translations.forEach((translation, idx) => {
                    const originalIndex = indices[idx];
                    results[originalIndex] = translation;
                    this.saveToCache(
                        textsToTranslate[idx],
                        targetLanguage,
                        sourceLanguage,
                        translation
                    );
                });
            }

            return results;

        } catch (error) {
            console.error('Batch translation error:', error);
            return texts;
        }
    }

    // ==================== ELEMENT TRANSLATION ====================

    async translateElement(element, targetLanguage, sourceLanguage = 'auto') {
        if (!element) return;

        const originalText = element.getAttribute('data-original-text') || element.textContent;
        
        // Store original text if not stored
        if (!element.getAttribute('data-original-text')) {
            element.setAttribute('data-original-text', originalText);
        }

        // If translating back to original language, restore original
        if (targetLanguage === this.config.fallbackLanguage) {
            element.textContent = originalText;
            return;
        }

        try {
            const translation = await this.translate(originalText, targetLanguage, sourceLanguage);
            element.textContent = translation;
        } catch (error) {
            console.error('Element translation error:', error);
        }
    }

    async translateElements(selector, targetLanguage, sourceLanguage = 'auto') {
        const elements = document.querySelectorAll(selector);
        const texts = Array.from(elements).map(el => 
            el.getAttribute('data-original-text') || el.textContent
        );

        // Store original texts
        elements.forEach((el, i) => {
            if (!el.getAttribute('data-original-text')) {
                el.setAttribute('data-original-text', texts[i]);
            }
        });

        // If translating back to original, restore all
        if (targetLanguage === this.config.fallbackLanguage) {
            elements.forEach((el, i) => {
                el.textContent = texts[i];
            });
            return;
        }

        try {
            const translations = await this.translateBatch(texts, targetLanguage, sourceLanguage);
            
            elements.forEach((el, i) => {
                el.textContent = translations[i];
            });

            this._notifyListeners(EVENT_TYPES.LANGUAGE_CHANGED, { targetLanguage });

        } catch (error) {
            console.error('Elements translation error:', error);
        }
    }

    // ==================== PAGE TRANSLATION ====================

    async translatePage(targetLanguage, sourceLanguage = 'auto') {
        if (!this.config.enabled) {
            console.warn('Translation is disabled');
            return;
        }

        try {
            // Get all translatable elements
            const selectors = [
                '[data-translate]',
                'h1, h2, h3, h4, h5, h6',
                'p',
                'button:not([data-no-translate])',
                'label',
                'a:not([data-no-translate])',
                '.toast',
                '.modal-content'
            ];

            const selector = selectors.join(', ');
            await this.translateElements(selector, targetLanguage, sourceLanguage);

            // Update page language attribute
            document.documentElement.lang = targetLanguage;

            console.log('Page translated to:', targetLanguage);

        } catch (error) {
            console.error('Page translation error:', error);
            throw error;
        }
    }

    // ==================== LANGUAGE DETECTION ====================

    detectLanguage(text) {
        // Simple language detection based on character sets
        // In produzione, useresti AWS Comprehend o simili

        if (/[\u4e00-\u9fff]/.test(text)) return 'zh'; // Chinese
        if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'ja'; // Japanese
        if (/[\u0400-\u04ff]/.test(text)) return 'ru'; // Russian
        if (/[\u0600-\u06ff]/.test(text)) return 'ar'; // Arabic
        
        // For European languages, would need more sophisticated detection
        return 'en'; // Default fallback
    }

    // ==================== UTILITIES ====================

    isLanguageSupported(languageCode) {
        return this.config.supportedLanguages.includes(languageCode);
    }

    getSupportedLanguages() {
        return this.config.supportedLanguages;
    }

    getCurrentLanguage() {
        return document.documentElement.lang || this.config.fallbackLanguage;
    }

    setCurrentLanguage(languageCode) {
        if (!this.isLanguageSupported(languageCode)) {
            console.warn(`Language ${languageCode} is not supported`);
            return false;
        }

        document.documentElement.lang = languageCode;
        localStorage.setItem('preferred_language', languageCode);
        return true;
    }

    getPreferredLanguage() {
        // Check localStorage
        const stored = localStorage.getItem('preferred_language');
        if (stored && this.isLanguageSupported(stored)) {
            return stored;
        }

        // Check browser language
        const browserLang = navigator.language.split('-')[0];
        if (this.isLanguageSupported(browserLang)) {
            return browserLang;
        }

        // Fallback
        return this.config.fallbackLanguage;
    }

    // ==================== STATS ====================

    getCacheStats() {
        return {
            size: this.cache.size,
            enabled: this.config.cacheEnabled,
            duration: this.config.cacheDuration
        };
    }
}

// ==================== SINGLETON INSTANCE ====================

export const translateService = new TranslateService();

export default translateService;
