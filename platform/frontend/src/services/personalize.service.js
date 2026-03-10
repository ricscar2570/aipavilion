/**
 * AI Pavilion - Personalization Service (Amazon Personalize Integration)
 */

import { CONFIG } from '../config/config.js';
import { apiService } from './api.service.js';
import { INTERACTION_TYPES } from '../utils/constants.js';

class PersonalizeService {
    constructor() {
        this.config = CONFIG.personalize;
        this.sessionId = this.generateSessionId();
        this.userId = null;
    }

    // ==================== SESSION ====================

    generateSessionId() {
        return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    setUserId(userId) {
        this.userId = userId;
    }

    getUserId() {
        return this.userId || this.sessionId;
    }

    // ==================== RECOMMENDATIONS ====================

    async getRecommendations(params = {}) {
        if (!this.config.enabled) {
            console.log('Personalize is disabled, using fallback recommendations');
            return this.getFallbackRecommendations();
        }

        try {
            const userId = this.getUserId();
            const recommendations = await apiService.getRecommendations(userId, params);

            // Filter by confidence score
            const filtered = recommendations.filter(rec => 
                !rec.score || rec.score >= this.config.minConfidenceScore
            );

            return filtered;

        } catch (error) {
            console.error('Personalize recommendations error:', error);
            return this.getFallbackRecommendations();
        }
    }

    getFallbackRecommendations() {
        // Simple fallback: return popular/trending items
        // In una implementazione reale, questi sarebbero caricati dal backend
        return [
            {
                itemId: 'stand-001',
                score: 0.9,
                reason: 'Popular'
            },
            {
                itemId: 'stand-002',
                score: 0.85,
                reason: 'Trending'
            },
            {
                itemId: 'stand-004',
                score: 0.8,
                reason: 'Featured'
            }
        ];
    }

    async getRelatedItems(itemId, maxResults = 10) {
        if (!this.config.enabled) {
            return [];
        }

        try {
            const recommendations = await this.getRecommendations({
                item_id: itemId,
                max_results: maxResults
            });

            return recommendations;

        } catch (error) {
            console.error('Related items error:', error);
            return [];
        }
    }

    async getPersonalizedRanking(items) {
        if (!this.config.enabled) {
            return items;
        }

        try {
            const userId = this.getUserId();
            const itemIds = items.map(item => item.id || item.stand_id);

            const ranked = await apiService.post('/personalize/rank', {
                user_id: userId,
                item_ids: itemIds
            });

            // Reorder original items based on ranking
            const rankedItems = ranked.map(rankedItem => 
                items.find(item => 
                    (item.id || item.stand_id) === rankedItem.itemId
                )
            ).filter(Boolean);

            return rankedItems;

        } catch (error) {
            console.error('Personalized ranking error:', error);
            return items;
        }
    }

    // ==================== EVENT TRACKING ====================

    async trackEvent(eventType, eventData = {}) {
        if (!this.config.enabled) {
            console.log('Event tracking disabled:', eventType);
            return;
        }

        try {
            const userId = this.getUserId();
            const event = {
                sessionId: this.sessionId,
                userId: userId,
                eventType: eventType,
                eventData: eventData,
                timestamp: Date.now(),
                properties: {
                    ...eventData,
                    userAgent: navigator.userAgent,
                    url: window.location.href
                }
            };

            await apiService.trackInteraction(
                userId,
                eventData.standId || eventData.itemId,
                eventType
            );

            console.log('Event tracked:', eventType, eventData);

        } catch (error) {
            console.error('Event tracking error:', error);
        }
    }

    async trackView(itemId, metadata = {}) {
        return this.trackEvent(INTERACTION_TYPES.VIEW, {
            itemId,
            standId: itemId,
            ...metadata
        });
    }

    async trackClick(itemId, metadata = {}) {
        return this.trackEvent(INTERACTION_TYPES.CLICK, {
            itemId,
            standId: itemId,
            ...metadata
        });
    }

    async trackAddToCart(itemId, metadata = {}) {
        return this.trackEvent(INTERACTION_TYPES.ADD_TO_CART, {
            itemId,
            standId: itemId,
            ...metadata
        });
    }

    async trackPurchase(items, metadata = {}) {
        return this.trackEvent(INTERACTION_TYPES.PURCHASE, {
            items,
            ...metadata
        });
    }

    // ==================== USER PROFILE ====================

    async getUserProfile() {
        if (!this.config.enabled) {
            return null;
        }

        try {
            const userId = this.getUserId();
            const profile = await apiService.get(`/personalize/profile/${userId}`);
            return profile;

        } catch (error) {
            console.error('Get user profile error:', error);
            return null;
        }
    }

    async updateUserProfile(attributes) {
        if (!this.config.enabled) {
            return;
        }

        try {
            const userId = this.getUserId();
            await apiService.put(`/personalize/profile/${userId}`, attributes);

        } catch (error) {
            console.error('Update user profile error:', error);
        }
    }

    // ==================== UTILITIES ====================

    isEnabled() {
        return this.config.enabled;
    }

    getConfig() {
        return this.config;
    }
}

// ==================== SINGLETON INSTANCE ====================

export const personalizeService = new PersonalizeService();

export default personalizeService;
