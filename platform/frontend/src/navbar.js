// Navbar interactive functionality
document.addEventListener('DOMContentLoaded', () => {
    // Mobile menu toggle
    const mobileToggle = document.getElementById('mobileMenuToggle');
    const navbarMenu = document.getElementById('navbarMenu');
    
    if (mobileToggle && navbarMenu) {
        mobileToggle.addEventListener('click', () => {
            navbarMenu.classList.toggle('active');
        });
    }
    
    // Update active link based on current route
    function updateActiveLink() {
        const currentHash = window.location.hash || '#/';
        const navLinks = document.querySelectorAll('.nav-link');
        
        navLinks.forEach(link => {
            const href = link.getAttribute('href');
            if (href === currentHash) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }
    
    // Update on hash change
    window.addEventListener('hashchange', updateActiveLink);
    updateActiveLink();
    
    // Cart button (placeholder)
    const cartBtn = document.getElementById('cartBtn');
    if (cartBtn) {
        cartBtn.addEventListener('click', () => {
            console.log('Cart clicked (not implemented yet)');
            alert('Cart feature coming soon!');
        });
    }
    
    // Login button (placeholder)
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            console.log('Login clicked (not implemented yet)');
            alert('Login feature coming soon!');
        });
    }
    
    console.log('✅ Navbar initialized');
});
