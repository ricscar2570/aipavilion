// Hero Section Component - Professional Grade
export class HeroSection {
    static render() {
        return `
            <div class="relative overflow-hidden py-20 px-4 sm:px-6 lg:px-8">
                <div class="max-w-7xl mx-auto">
                    <div class="text-center">
                        <h1 class="text-5xl md:text-7xl font-extrabold text-white mb-6 animate-fade-in">
                            Welcome to the Future of
                            <span class="block gradient-text bg-white">Gaming Expos</span>
                        </h1>
                        
                        <p class="text-xl md:text-2xl text-white/90 mb-8 max-w-3xl mx-auto">
                            Explore stands in AR, take 360° virtual tours, and shop the latest games and merchandise
                        </p>
                        
                        <div class="flex flex-col sm:flex-row gap-4 justify-center mb-12">
                            <button class="btn-primary text-lg px-8 py-4">
                                🚀 Explore Stands
                            </button>
                            <button class="bg-white/20 backdrop-blur text-white px-8 py-4 rounded-xl font-semibold hover:bg-white/30 transition">
                                📱 Download App
                            </button>
                        </div>
                        
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
                            <div class="glass-card p-6 rounded-xl hover-lift">
                                <div class="text-3xl font-bold gradient-text bg-white mb-2">500+</div>
                                <div class="text-white/80 text-sm">Products</div>
                            </div>
                            <div class="glass-card p-6 rounded-xl hover-lift">
                                <div class="text-3xl font-bold gradient-text bg-white mb-2">50+</div>
                                <div class="text-white/80 text-sm">Exhibitors</div>
                            </div>
                            <div class="glass-card p-6 rounded-xl hover-lift">
                                <div class="text-3xl font-bold gradient-text bg-white mb-2">AR</div>
                                <div class="text-white/80 text-sm">3D Models</div>
                            </div>
                            <div class="glass-card p-6 rounded-xl hover-lift">
                                <div class="text-3xl font-bold gradient-text bg-white mb-2">360°</div>
                                <div class="text-white/80 text-sm">Tours</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Floating elements decoration -->
                <div class="absolute top-20 left-10 w-20 h-20 bg-purple-300/30 rounded-full blur-xl animate-pulse"></div>
                <div class="absolute bottom-20 right-10 w-32 h-32 bg-pink-300/30 rounded-full blur-xl animate-pulse delay-1000"></div>
            </div>
        `;
    }
}
