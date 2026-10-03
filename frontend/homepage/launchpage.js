class LaunchPage {
  constructor() {
    this.initMedicalBackground();
    this.initAnimations();
    this.initPortalCards();
    this.initStatsCounter();
    this.initParallaxEffect();
  }

    initMedicalBackground() {
    const medicalIcons = ['❤️', '🩺', '💊', '🏥', '⏱️', '📋', '🔬', '💉'];
    let medicalBackground = document.querySelector('.medical-background');
    if (!medicalBackground) {
      medicalBackground = document.createElement('div');
      medicalBackground.className = 'medical-background';
      document.body.appendChild(medicalBackground);
    }

    medicalIcons.forEach((icon, index) => {
      const medicalIcon = document.createElement('div');
      medicalIcon.className = `medical-icon ${this.getIconClass(icon)}`;
      medicalIcon.textContent = icon;
      medicalIcon.style.animationDelay = `${index * 2}s`;
      medicalIcon.style.left = `${Math.random() * 90}%`;
      medicalIcon.style.top  = `${Math.random() * 90}%`;
      medicalBackground.appendChild(medicalIcon);
    });
  }

  getIconClass(icon) {
    const iconMap = {
      '❤️': 'heart',
      '🩺': 'stethoscope',
      '💊': 'pill',
      '🏥': 'hospital',
      '⏱️': 'time',
      '📋': 'clipboard',
      '🔬': 'microscope',
      '💉': 'syringe'
    };
    return iconMap[icon] || 'medical';
  }

  initAnimations() {
    // Enhanced Intersection Observer with staggered animations
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          // Stagger animation delays
          const delay = index * 0.1;
          entry.target.style.animation = `fadeInUp 0.8s ease-out ${delay}s forwards`;
          
          // Add special effects for portal cards
          if (entry.target.classList.contains('portal-card')) {
            this.animatePortalCard(entry.target, delay);
          }
          
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    // Observe all elements with animation class
    document.querySelectorAll('.animate-on-scroll').forEach(el => {
      observer.observe(el);
    });

    // Add hover sound effects for interactive elements
    this.initSoundEffects();
  }

  animatePortalCard(card, delay) {
    // Add ripple effect on appearance
    setTimeout(() => {
      const ripple = document.createElement('div');
      ripple.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        width: 0;
        height: 0;
        border-radius: 50%;
        background: rgba(59, 130, 246, 0.3);
        transform: translate(-50%, -50%);
        animation: ripple 1s ease-out;
        z-index: 1;
      `;
      
      card.style.position = 'relative';
      card.appendChild(ripple);
      
      setTimeout(() => {
        ripple.remove();
      }, 1000);
    }, delay * 1000);
  }

  initPortalCards() {
  const portalCards = document.querySelectorAll('.portal-card');

  portalCards.forEach((card, index) => {

    // Sequential appearance delay
    card.style.animationDelay = `${index * 0.2}s`;

    /*
     * IMPORTANT:
     * The CARD itself is NOT clickable.
     *
     * Only the "Continue as Patient" /
     * "Continue as Doctor" button navigates.
     */

    const portalButton = card.querySelector('.portal-btn');

    if (portalButton) {

      portalButton.addEventListener('click', (e) => {

        // Allow the <a href="..."> to perform
        // its normal navigation.
        e.stopPropagation();

        // Small button click animation only
        portalButton.style.transform = 'scale(0.96)';

        setTimeout(() => {
          portalButton.style.transform = '';
        }, 120);
      });
    }


    /*
     * Hover effect for the CARD.
     * Hovering is allowed, but clicking the card
     * does nothing.
     */

    card.addEventListener('mouseenter', () => {

      card.style.transform =
        'translateY(-8px) scale(1.01)';

      this.createHoverParticles(card);
    });


    card.addEventListener('mouseleave', () => {

      card.style.transform =
        'translateY(0) scale(1)';
    });


    /*
     * Mobile touch effect.
     * This is ONLY visual.
     * It does NOT navigate.
     */

    card.addEventListener('touchstart', () => {

      card.style.transform =
        'translateY(-4px) scale(1.005)';

    }, { passive: true });


    card.addEventListener('touchend', () => {

      card.style.transform =
        'translateY(0) scale(1)';

    }, { passive: true });

  });
}

  

  createHoverParticles(card) {
    const particles = 6;
    for (let i = 0; i < particles; i++) {
      const particle = document.createElement('div');
      particle.style.cssText = `
        position: absolute;
        width: 4px;
        height: 4px;
        background: var(--medical-blue);
        border-radius: 50%;
        pointer-events: none;
        z-index: 2;
      `;
      
      const angle = (i / particles) * Math.PI * 2;
      const distance = 60;
      const startX = 50;
      const startY = 50;
      
      particle.style.left = `${startX}%`;
      particle.style.top = `${startY}%`;
      
      card.appendChild(particle);
      
      // Animate particle
      const animation = particle.animate([
        {
          transform: `translate(0, 0) scale(1)`,
          opacity: 1
        },
        {
          transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px) scale(0)`,
          opacity: 0
        }
      ], {
        duration: 800,
        easing: 'ease-out'
      });
      
      animation.onfinish = () => particle.remove();
    }
  }

  initStatsCounter() {
    const statElements = document.querySelectorAll('.stat-number');
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          this.animateCounter(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    
    statElements.forEach(stat => observer.observe(stat));
  }

  animateCounter(element) {
    const target = parseInt(element.textContent);
    const duration = 2000;
    const step = target / (duration / 16);
    let current = 0;
    
    const timer = setInterval(() => {
      current += step;
      if (current >= target) {
        current = target;
        clearInterval(timer);
      }
      element.textContent = Math.floor(current).toLocaleString();
    }, 16);
  }

  initParallaxEffect() {
    // Add subtle parallax effect to medical background
    window.addEventListener('scroll', () => {
      const scrolled = window.pageYOffset;
      const medicalBackground = document.querySelector('.medical-background');
      if (medicalBackground) {
        medicalBackground.style.transform = `translateY(${scrolled * 0.5}px)`;
      }
    });
  }

  initSoundEffects() {
    // Add subtle sound effects for interactions (optional)
    const buttons = document.querySelectorAll('.btn, .portal-card');
    
    buttons.forEach(button => {
      button.addEventListener('click', () => {
        // You can add subtle click sounds here
        // this.playSound('click');
      });
      
      button.addEventListener('mouseenter', () => {
        // this.playSound('hover');
      });
    });
  }

  playSound(type) {
    // Implement sound effects if desired
    // This is a placeholder for sound implementation
  }
}

// Add CSS for ripple effect
const style = document.createElement('style');
style.textContent = `
  @keyframes ripple {
    to {
      width: 200%;
      height: 200%;
      opacity: 0;
    }
  }
  
  .medical-background {
    z-index: 0;
  }
  
  .hero-section > * {
    z-index: 2;
  }
`;
document.head.appendChild(style);

// Initialize launch page
document.addEventListener('DOMContentLoaded', () => {
  new LaunchPage();
});

// Add loading animation
window.addEventListener('load', () => {
  document.body.style.opacity = '0';
  document.body.style.transition = 'opacity 0.5s ease';
  
  setTimeout(() => {
    document.body.style.opacity = '1';
  }, 100);
});