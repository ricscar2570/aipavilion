// Stand Card Component - Professional Grade
export class StandCard {
    static create(stand) {
        return `
            <div class="glass-card rounded-2xl overflow-hidden hover-lift cursor-pointer" data-stand-id="${stand.stand_id}">
                <div class="relative h-48 overflow-hidden">
                    <img 
                        src="${stand.image_url || 'https://via.placeholder.com/400x300?text=Stand'}" 
                        alt="${stand.name}"
                        class="w-full h-full object-cover transition-transform duration-300 hover:scale-110"
                    />
                    ${stand.is_sponsored ? '<div class="absolute top-4 right-4 badge badge-featured">⭐ Featured</div>' : ''}
                    ${stand.ar_enabled ? '<div class="absolute top-4 left-4 badge badge-ar">🥽 AR</div>' : ''}
                    ${stand.tour_enabled ? '<div class="absolute top-12 left-4 badge" style="background: #3b82f6; color: white;">🎪 360°</div>' : ''}
                </div>
                
                <div class="p-6">
                    <div class="flex items-start justify-between mb-3">
                        <h3 class="text-xl font-bold text-gray-900">${stand.name}</h3>
                        <div class="flex items-center space-x-1">
                            <svg class="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                            </svg>
                            <span class="text-sm font-semibold">${stand.rating || '4.5'}</span>
                        </div>
                    </div>
                    
                    <p class="text-gray-600 text-sm mb-4 line-clamp-2">${stand.description || 'Discover amazing products and experiences'}</p>
                    
                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-2">
                            <span class="text-xs text-gray-500">Booth ${stand.booth_number}</span>
                            ${stand.products && stand.products.length > 0 ? `
                                <span class="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">${stand.products.length} products</span>
                            ` : ''}
                        </div>
                        
                        <svg class="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                        </svg>
                    </div>
                </div>
            </div>
        `;
    }
}
