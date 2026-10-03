
/* ==========================================================================
   MediDiag â€” navbar.js
   Right-side drawer, backdrop click to close, ESC to close.
   ========================================================================== */

class Navbar {
  constructor() {
    this.navbar = document.querySelector('.navbar');
    this.mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    this.navbarNav = document.querySelector('.navbar-nav');
    this.userMenu = document.querySelector('.user-menu');
    this.userTrigger = document.querySelector('.user-trigger');
    this.userDropdown = document.querySelector('.user-dropdown');
    this.mobileMenuClose = document.querySelector('.mobile-menu-close');
    this.init();
  }

      init() {
    // Safety: clear any stale scroll-lock class or inline styles
    document.body.classList.remove('nav-open');
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.height = '';
    document.documentElement.style.overflow = '';

    window.addEventListener('scroll', () => this.handleScroll(), { passive: true });

    if (this.mobileMenuBtn) {
      this.mobileMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleMobileMenu();
      });
    }

    if (this.mobileMenuClose) {
      this.mobileMenuClose.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.closeMobileMenu();
      });
    }

    if (this.userTrigger) {
      this.userTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.innerWidth > 768) this.toggleUserDropdown();
      });
    }

    document.addEventListener('click', (e) => this.handleClickOutside(e));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeMobileMenu();
    });

    if (this.navbarNav) {
      this.navbarNav.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') this.closeMobileMenu();
      });

      // Click the ::after pseudo (top-right X) â€” treat as close
      this.navbarNav.addEventListener('click', (e) => {
        const rect = this.navbarNav.getBoundingClientRect();
        const topRightX = rect.right - 20;
        const topRightY = rect.top + 20;
        if (
          Math.abs(e.clientX - topRightX) < 30 &&
          Math.abs(e.clientY - topRightY) < 30
        ) {
          this.closeMobileMenu();
        }
      });
    }

    this.setActiveNavLink();
    this.initUserAvatar();

    window.addEventListener('resize', () => this.handleResize(), { passive: true });
  }

  handleScroll() {
    if (window.scrollY > 100) this.navbar?.classList.add('scrolled');
    else this.navbar?.classList.remove('scrolled');
  }

    toggleMobileMenu() {
    const isOpen = this.navbarNav?.classList.toggle('active');
    this.mobileMenuBtn?.classList.toggle('active', isOpen);
    document.body.classList.toggle('nav-open', isOpen);
    if (this.mobileMenuBtn) {
      this.mobileMenuBtn.innerHTML = isOpen ? '<span aria-hidden="true">&times;</span>' : '<span aria-hidden="true">&#9776;</span>';
      this.mobileMenuBtn.setAttribute('aria-expanded', String(!!isOpen));
    }
  }

  closeMobileMenu() {
    this.navbarNav?.classList.remove('active');
    this.mobileMenuBtn?.classList.remove('active');
    document.body.classList.remove('nav-open');
    // Always clear any inline scroll locks
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.height = '';
    document.documentElement.style.overflow = '';
    if (this.mobileMenuBtn) this.mobileMenuBtn.innerHTML = '<span aria-hidden="true">&#9776;</span>';
      this.mobileMenuBtn.setAttribute('aria-expanded', 'false');
  }

  toggleUserDropdown() {
    this.userDropdown?.classList.toggle('active');
    document.querySelectorAll('.user-dropdown').forEach((d) => {
      if (d !== this.userDropdown) d.classList.remove('active');
    });
  }

  closeUserDropdown() {
    this.userDropdown?.classList.remove('active');
  }

  handleClickOutside(e) {
    // Close drawer if click is outside it and outside the toggle button
    if (
      this.navbarNav?.classList.contains('active') &&
      !e.target.closest('.navbar-nav') &&
      !e.target.closest('.mobile-menu-btn')
    ) {
      this.closeMobileMenu();
    }

    if (!e.target.closest('.user-menu')) {
      this.closeUserDropdown();
    }
  }

  setActiveNavLink() {
    const path = window.location.pathname;
    const PUBLIC = ['/', '/about', '/features', '/faqs', '/contact'];
    const links = document.querySelectorAll('.navbar-nav a');
    links.forEach((link) => {
      const href = link.getAttribute('href');
      const isPublic = PUBLIC.includes(href);
      if (isPublic && path === href) link.classList.add('active');
      else if (!isPublic && href && path.startsWith(href)) link.classList.add('active');
      else link.classList.remove('active');
    });
  }

  initUserAvatar() {
    const avatar = document.querySelector('.user-avatar');
    if (avatar && !avatar.textContent.trim()) {
      const name =
        avatar.getAttribute('data-name') ||
        localStorage.getItem('userName') ||
        'U';
      avatar.textContent = name.charAt(0).toUpperCase();
    }
  }

  handleResize() {
    if (window.innerWidth > 768) this.closeMobileMenu();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.navbar = new Navbar();
});