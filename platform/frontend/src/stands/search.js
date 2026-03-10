/**
 * Search Module
 */
import { apiService } from '../core/api.js';
import { escapeHtml } from '../core/helpers.js';
import { renderStandCard } from './card.js';

class SearchModule {
    constructor() {
        this.searchResults = [];
        this.searchQuery = '';
    }

    async search(query) {
        if (!query || query.trim().length < 2) {
            return [];
        }

        this.searchQuery = query.trim();
        console.log('🔍 Searching for:', this.searchQuery);

        try {
            const results = await apiService.searchStands(this.searchQuery);
            this.searchResults = results;
            return results;
        } catch (error) {
            console.error('Search error:', error);
            return [];
        }
    }

    renderSearchPage(container) {
        container.innerHTML = `
            <div class="search-container">
                <div class="search-header">
                    <h1>🔍 Search Stands</h1>
                    <p>Find the perfect gaming experience</p>
                </div>

                <div class="search-box">
                    <input 
                        type="text" 
                        id="searchInput" 
                        class="search-input" 
                        placeholder="Search by name, category, or tags..."
                        autocomplete="off"
                    />
                    <button id="searchBtn" class="search-btn">Search</button>
                </div>

                <div id="searchResults" class="search-results">
                    <p class="search-hint">Enter a search term to find stands</p>
                </div>
            </div>
        `;

        this.attachSearchEventListeners();
    }

    attachSearchEventListeners() {
        const searchInput = document.getElementById('searchInput');
        const searchBtn = document.getElementById('searchBtn');
        const searchResults = document.getElementById('searchResults');

        if (!searchInput || !searchBtn || !searchResults) return;

        // Search on button click
        searchBtn.addEventListener('click', async () => {
            const query = searchInput.value;
            await this.performSearch(query, searchResults);
        });

        // Search on Enter key
        searchInput.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                const query = searchInput.value;
                await this.performSearch(query, searchResults);
            }
        });

        // Live search (debounced)
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(async () => {
                const query = e.target.value;
                if (query.length >= 2) {
                    await this.performSearch(query, searchResults);
                } else if (query.length === 0) {
                    searchResults.innerHTML = '<p class="search-hint">Enter a search term to find stands</p>';
                }
            }, 500);
        });

        console.log('✅ Search listeners attached');
    }

    async performSearch(query, resultsContainer) {
        if (!query || query.trim().length < 2) {
            resultsContainer.innerHTML = '<p class="search-hint">Please enter at least 2 characters</p>';
            return;
        }

        resultsContainer.innerHTML = '<div class="loading">Searching...</div>';

        const results = await this.search(query);

        if (results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="no-results">
                    <p>No stands found for "${escapeHtml(query)}"</p>
                    <p class="search-hint">Try different keywords</p>
                </div>
            `;
            return;
        }

        resultsContainer.innerHTML = `
            <div class="results-header">
                <p>Found ${results.length} stand${results.length !== 1 ? 's' : ''} for "${escapeHtml(query)}"</p>
            </div>
            <div class="stands-grid">
                ${results.map(stand => this.renderSearchResultCard(stand)).join('')}
            </div>
        `;

        this.attachResultCardListeners();
    }

    renderSearchResultCard(stand) {
        return renderStandCard(stand);
    }

    attachResultCardListeners() {
        const cards = document.querySelectorAll('.search-results .stand-card');
        
        cards.forEach(card => {
            card.style.cursor = 'pointer';
            
            card.addEventListener('click', () => {
                const standId = card.getAttribute('data-stand-id');
                if (standId) {
                    window.location.hash = `#/stands/${standId}`;
                }
            });

            card.addEventListener('mouseenter', () => {
                card.style.transform = 'translateY(-5px)';
                card.style.transition = 'transform 0.3s ease';
            });

            card.addEventListener('mouseleave', () => {
                card.style.transform = 'translateY(0)';
            });
        });
    }
}

export default SearchModule;
