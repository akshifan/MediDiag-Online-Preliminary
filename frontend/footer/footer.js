// Scroll to Top Functionality
class ScrollToTop {
    constructor() {
        this.scrollButton = document.getElementById('scroll-to-top');
        if (!this.scrollButton) return; // page has no footer/scroll button
        this.init();
    }

    init() {
        window.addEventListener('scroll', () => this.toggleScrollButton());
        this.scrollButton.addEventListener('click', () => this.scrollToTop());
    }

    toggleScrollButton() {
        if (window.pageYOffset > 300) {
            this.scrollButton.classList.add('visible');
        } else {
            this.scrollButton.classList.remove('visible');
        }
    }

    scrollToTop() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }
}

// Initialize scroll to top when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ScrollToTop();
});