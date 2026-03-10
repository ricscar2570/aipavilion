/**
 * AI Pavilion - Admin Dashboard Component
 * Enterprise-grade admin interface with comprehensive management features
 * Production-ready with error handling and loading states
 */

export class AdminDashboard {
    constructor(apiUrl, authToken) {
        this.apiUrl = apiUrl;
        this.authToken = authToken;
        this.currentView = 'overview';
        this.data = {
            stats: null,
            stands: [],
            orders: [],
            analytics: null
        };
    }
    
    /**
     * Initialize dashboard
     */
    async init() {
        try {
            await this.loadDashboardData();
            this.render();
            this.attachEventListeners();
        } catch (error) {
            console.error('Dashboard init error:', error);
            this.showError('Failed to initialize dashboard');
        }
    }
    
    /**
     * Load all dashboard data
     */
    async loadDashboardData() {
        try {
            // Load overview stats
            const statsResponse = await this.apiCall('/admin/dashboard');
            this.data.stats = statsResponse;
            
            // Load stands
            const standsResponse = await this.apiCall('/admin/stands?limit=100');
            this.data.stands = standsResponse.stands || [];
            
            // Load analytics
            const analyticsResponse = await this.apiCall('/admin/analytics?days=30');
            this.data.analytics = analyticsResponse;
            
        } catch (error) {
            console.error('Load data error:', error);
            throw error;
        }
    }
    
    /**
     * Render dashboard UI
     */
    render() {
        const container = document.getElementById('admin-dashboard');
        if (!container) {
            console.error('Admin dashboard container not found');
            return;
        }
        
        container.innerHTML = `
            <div class="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50">
                <!-- Header -->
                <header class="glass-card sticky top-0 z-50">
                    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div class="flex justify-between items-center h-16">
                            <div class="flex items-center space-x-3">
                                <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                                    <span class="text-white font-bold text-xl">AI</span>
                                </div>
                                <div>
                                    <h1 class="text-xl font-bold text-gray-900">Admin Dashboard</h1>
                                    <p class="text-xs text-gray-500">AI Pavilion Management</p>
                                </div>
                            </div>
                            
                            <div class="flex items-center space-x-4">
                                <button class="p-2 rounded-lg hover:bg-gray-100 transition" id="refresh-btn" title="Refresh data">
                                    <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                                    </svg>
                                </button>
                                <button class="p-2 rounded-lg hover:bg-gray-100 transition" id="logout-btn" title="Logout">
                                    <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </header>
                
                <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <!-- Navigation Tabs -->
                    <div class="mb-8">
                        <div class="border-b border-gray-200">
                            <nav class="flex space-x-8">
                                <button class="nav-tab active" data-view="overview">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                                    </svg>
                                    <span>Overview</span>
                                </button>
                                <button class="nav-tab" data-view="stands">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                                    </svg>
                                    <span>Stands</span>
                                </button>
                                <button class="nav-tab" data-view="analytics">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"/>
                                    </svg>
                                    <span>Analytics</span>
                                </button>
                            </nav>
                        </div>
                    </div>
                    
                    <!-- Content Area -->
                    <div id="dashboard-content">
                        ${this.renderOverview()}
                    </div>
                </div>
            </div>
        `;
        
        this.addStyles();
    }
    
    /**
     * Render overview tab
     */
    renderOverview() {
        const stats = this.data.stats || {};
        
        return `
            <!-- Stats Cards -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                ${this.renderStatCard('Total Stands', stats.totalStands || 0, '🏢', 'purple')}
                ${this.renderStatCard('Total Users', stats.totalUsers || 0, '👥', 'blue')}
                ${this.renderStatCard('Total Orders', stats.totalOrders || 0, '📦', 'green')}
                ${this.renderStatCard('Revenue', `$${(stats.totalRevenue || 0).toFixed(2)}`, '💰', 'pink')}
            </div>
            
            <!-- Recent Activity -->
            <div class="glass-card rounded-2xl p-6 mb-8">
                <h2 class="text-xl font-bold text-gray-900 mb-4">Recent Activity</h2>
                ${this.renderRecentActivity(stats.recentActivity || [])}
            </div>
            
            <!-- Quick Actions -->
            <div class="glass-card rounded-2xl p-6">
                <h2 class="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button class="btn-primary text-center py-4" id="create-stand-btn">
                        ➕ Create New Stand
                    </button>
                    <button class="btn-primary text-center py-4" id="export-data-btn">
                        📊 Export Data
                    </button>
                    <button class="btn-primary text-center py-4" id="view-reports-btn">
                        📈 View Reports
                    </button>
                </div>
            </div>
        `;
    }
    
    /**
     * Render stat card
     */
    renderStatCard(label, value, icon, color) {
        const colors = {
            purple: 'from-purple-500 to-purple-600',
            blue: 'from-blue-500 to-blue-600',
            green: 'from-green-500 to-green-600',
            pink: 'from-pink-500 to-pink-600'
        };
        
        return `
            <div class="glass-card rounded-2xl p-6 hover-lift">
                <div class="flex items-center justify-between mb-4">
                    <div class="text-3xl">${icon}</div>
                    <div class="w-12 h-12 rounded-xl bg-gradient-to-br ${colors[color]} flex items-center justify-center">
                        <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
                        </svg>
                    </div>
                </div>
                <div class="text-3xl font-bold text-gray-900 mb-1">${value}</div>
                <div class="text-sm text-gray-600">${label}</div>
            </div>
        `;
    }
    
    /**
     * Render recent activity list
     */
    renderRecentActivity(activities) {
        if (!activities || activities.length === 0) {
            return '<p class="text-gray-500 text-center py-8">No recent activity</p>';
        }
        
        return `
            <div class="space-y-3">
                ${activities.map(activity => `
                    <div class="flex items-center justify-between p-4 bg-white/50 rounded-lg">
                        <div class="flex items-center space-x-3">
                            <div class="w-2 h-2 rounded-full bg-green-500"></div>
                            <div>
                                <p class="text-sm font-medium text-gray-900">
                                    ${activity.type === 'order' ? 'New Order' : 'Activity'}
                                </p>
                                <p class="text-xs text-gray-500">${activity.id}</p>
                            </div>
                        </div>
                        <div class="text-right">
                            <p class="text-sm font-semibold text-gray-900">$${activity.amount}</p>
                            <p class="text-xs text-gray-500">${new Date(activity.created_at).toLocaleDateString()}</p>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    /**
     * Render stands management tab
     */
    renderStandsView() {
        return `
            <div class="glass-card rounded-2xl p-6">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-gray-900">Stands Management</h2>
                    <button class="btn-primary" id="add-stand-btn">
                        ➕ Add Stand
                    </button>
                </div>
                
                <!-- Stands Table -->
                <div class="overflow-x-auto">
                    <table class="min-w-full">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Booth</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            ${this.data.stands.map(stand => `
                                <tr class="hover:bg-gray-50">
                                    <td class="px-6 py-4 text-sm text-gray-900">${stand.stand_id.substring(0, 12)}...</td>
                                    <td class="px-6 py-4 text-sm font-medium text-gray-900">${stand.name}</td>
                                    <td class="px-6 py-4 text-sm text-gray-500">${stand.booth_number}</td>
                                    <td class="px-6 py-4 text-sm text-gray-500">${stand.category}</td>
                                    <td class="px-6 py-4">
                                        <span class="px-2 py-1 text-xs rounded-full ${stand.status === 'approved' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">
                                            ${stand.status || 'approved'}
                                        </span>
                                    </td>
                                    <td class="px-6 py-4 text-sm space-x-2">
                                        <button class="text-blue-600 hover:text-blue-800" data-action="edit" data-id="${stand.stand_id}">Edit</button>
                                        <button class="text-red-600 hover:text-red-800" data-action="delete" data-id="${stand.stand_id}">Delete</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }
    
    /**
     * Render analytics tab
     */
    renderAnalyticsView() {
        const analytics = this.data.analytics || {};
        
        return `
            <div class="space-y-6">
                <div class="glass-card rounded-2xl p-6">
                    <h2 class="text-2xl font-bold text-gray-900 mb-6">Performance Analytics</h2>
                    
                    <!-- Top Stands -->
                    <div class="mb-8">
                        <h3 class="text-lg font-semibold text-gray-900 mb-4">Top Performing Stands</h3>
                        <div class="space-y-3">
                            ${(analytics.topStands || []).map((stand, index) => `
                                <div class="flex items-center justify-between p-4 bg-white/50 rounded-lg">
                                    <div class="flex items-center space-x-4">
                                        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">
                                            ${index + 1}
                                        </div>
                                        <div>
                                            <p class="font-medium text-gray-900">${stand.name}</p>
                                            <p class="text-sm text-gray-500">${stand.stand_id}</p>
                                        </div>
                                    </div>
                                    <div class="text-right">
                                        <p class="text-lg font-bold text-gray-900">${stand.views || 0}</p>
                                        <p class="text-sm text-gray-500">views</p>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Navigation tabs
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const view = e.currentTarget.dataset.view;
                this.switchView(view);
            });
        });
        
        // Refresh button
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refresh());
        }
        
        // Logout button
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }
    }
    
    /**
     * Switch view
     */
    switchView(view) {
        this.currentView = view;
        
        // Update active tab
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active');
            if (tab.dataset.view === view) {
                tab.classList.add('active');
            }
        });
        
        // Render content
        const contentArea = document.getElementById('dashboard-content');
        if (contentArea) {
            switch(view) {
                case 'overview':
                    contentArea.innerHTML = this.renderOverview();
                    break;
                case 'stands':
                    contentArea.innerHTML = this.renderStandsView();
                    this.attachStandsListeners();
                    break;
                case 'analytics':
                    contentArea.innerHTML = this.renderAnalyticsView();
                    break;
            }
        }
    }
    
    /**
     * Attach stands management listeners
     */
    attachStandsListeners() {
        // Edit/Delete buttons
        document.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const action = e.target.dataset.action;
                const id = e.target.dataset.id;
                
                if (action === 'delete') {
                    if (confirm('Are you sure you want to delete this stand?')) {
                        await this.deleteStand(id);
                    }
                }
            });
        });
    }
    
    /**
     * Delete stand
     */
    async deleteStand(standId) {
        try {
            await this.apiCall(`/admin/stands/${standId}`, 'DELETE');
            await this.loadDashboardData();
            this.switchView('stands');
            this.showSuccess('Stand deleted successfully');
        } catch (error) {
            this.showError('Failed to delete stand');
        }
    }
    
    /**
     * Refresh dashboard
     */
    async refresh() {
        try {
            await this.loadDashboardData();
            this.switchView(this.currentView);
            this.showSuccess('Dashboard refreshed');
        } catch (error) {
            this.showError('Failed to refresh dashboard');
        }
    }
    
    /**
     * Logout
     */
    logout() {
        // Clear auth token
        localStorage.removeItem('admin_token');
        window.location.href = '/admin/login';
    }
    
    /**
     * API call helper
     */
    async apiCall(endpoint, method = 'GET', body = null) {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.authToken}`
            }
        };
        
        if (body) {
            options.body = JSON.stringify(body);
        }
        
        const response = await fetch(`${this.apiUrl}${endpoint}`, options);
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        return await response.json();
    }
    
    /**
     * Show success message
     */
    showSuccess(message) {
        this.showNotification(message, 'success');
    }
    
    /**
     * Show error message
     */
    showError(message) {
        this.showNotification(message, 'error');
    }
    
    /**
     * Show notification
     */
    showNotification(message, type = 'info') {
        const colors = {
            success: 'bg-green-500',
            error: 'bg-red-500',
            info: 'bg-blue-500'
        };
        
        const notification = document.createElement('div');
        notification.className = `fixed top-20 right-4 z-50 ${colors[type]} text-white px-6 py-4 rounded-xl shadow-2xl`;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => notification.remove(), 3000);
    }
    
    /**
     * Add custom styles
     */
    addStyles() {
        if (document.getElementById('admin-dashboard-styles')) return;
        
        const styles = document.createElement('style');
        styles.id = 'admin-dashboard-styles';
        styles.textContent = `
            .nav-tab {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                padding: 0.75rem 0;
                border-bottom: 2px solid transparent;
                color: #6b7280;
                font-weight: 500;
                transition: all 0.2s;
                background: none;
                border-top: none;
                border-left: none;
                border-right: none;
                cursor: pointer;
            }
            
            .nav-tab:hover {
                color: #6366f1;
            }
            
            .nav-tab.active {
                color: #6366f1;
                border-bottom-color: #6366f1;
            }
            
            .nav-tab svg {
                width: 1.25rem;
                height: 1.25rem;
            }
        `;
        document.head.appendChild(styles);
    }
}

// Initialize on page load
if (typeof window !== 'undefined') {
    window.AdminDashboard = AdminDashboard;
}
