// =============================================
// The Fifth Table — Main JavaScript
// =============================================

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initMobileMenu();
  initFilterBar();
  initEnquiryForm();
  initScrollAnimations();
  initCarousels();
  initProductLinks();
});

// =============================================
// NAVBAR — scroll effect
// =============================================
function initNavbar() {
  const header = document.getElementById('site-header');
  if (!header) return;

  const onScroll = () => {
    if (window.scrollY > 40) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// =============================================
// MOBILE MENU — hamburger toggle
// =============================================
function initMobileMenu() {
  const toggle = document.getElementById('menu-toggle');
  const navLinks = document.getElementById('nav-links');
  if (!toggle || !navLinks) return;

  toggle.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('open');
    toggle.classList.toggle('open', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  // Mobile: tap on top-level Equipment item to toggle its dropdown
  navLinks.querySelectorAll('.nav-item.has-dropdown > a').forEach(link => {
    link.addEventListener('click', (e) => {
      if (window.innerWidth <= 768) {
        e.preventDefault();
        const parent = link.closest('.nav-item');
        parent.classList.toggle('dropdown-open');
      }
    });
  });

  // Mobile: tap on dropdown li items that have a sub-dropdown
  navLinks.querySelectorAll('.dropdown li:has(> .sub-dropdown) > a').forEach(link => {
    link.addEventListener('click', (e) => {
      if (window.innerWidth <= 768) {
        e.preventDefault();
        const parent = link.closest('li');
        parent.classList.toggle('dropdown-open');
      }
    });
  });

  // Close menu when a leaf link is clicked (not a dropdown/sub-dropdown trigger)
  navLinks.querySelectorAll('.dropdown li:not(:has(> .sub-dropdown)) > a, .sub-dropdown a, .nav-item:not(.has-dropdown) > a').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
      toggle.classList.remove('open');
      document.body.style.overflow = '';
    });
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!toggle.contains(e.target) && !navLinks.contains(e.target)) {
      navLinks.classList.remove('open');
      toggle.classList.remove('open');
      document.body.style.overflow = '';
    }
  });
}

// =============================================
// FILTER BAR — products page
// =============================================
function initFilterBar() {
  const filterBtns = document.querySelectorAll('.filter-btn');
  if (!filterBtns.length) return;

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Update active state
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.dataset.filter;
      filterProducts(filter);
    });
  });
}

function filterProducts(filter) {
  const sections = document.querySelectorAll('.category-section[data-category]');
  const cards = document.querySelectorAll('.product-detail-card[data-tags]');

  if (filter === 'all') {
    sections.forEach(s => s.style.display = '');
    cards.forEach(c => c.style.display = '');
    return;
  }

  sections.forEach(section => {
    const hasMatch = Array.from(section.querySelectorAll('.product-detail-card[data-tags]'))
      .some(card => card.dataset.tags.split(',').includes(filter));
    section.style.display = hasMatch ? '' : 'none';
  });

  cards.forEach(card => {
    const tags = card.dataset.tags.split(',');
    card.style.display = tags.includes(filter) ? '' : 'none';
  });
}

// =============================================
// PRODUCT LINKS — add View Details buttons
// =============================================
function initProductLinks() {
  document.querySelectorAll('.product-detail-card[id]').forEach(card => {
    const id = card.id;
    const body = card.querySelector('.product-detail-body');
    if (!body || body.querySelector('.btn-view-details')) return;

    const enquireBtn = body.querySelector('.btn-outline');
    if (!enquireBtn) return;

    const viewBtn = document.createElement('a');
    viewBtn.href = `product.html?id=${id}`;
    viewBtn.className = 'btn btn-primary btn-view-details';
    viewBtn.textContent = 'View Details';

    const btnRow = document.createElement('div');
    btnRow.className = 'product-btn-row';
    enquireBtn.parentNode.insertBefore(btnRow, enquireBtn);
    btnRow.appendChild(viewBtn);
    btnRow.appendChild(enquireBtn);
  });
}

// =============================================
// ENQUIRY FORM — submission handler
// =============================================

function initEnquiryForm() {
  const form = document.getElementById('enquiry-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = form.querySelector('[type="submit"]');
    if (['localhost', '127.0.0.1', ''].includes(window.location.hostname)) {
      alert('This is a local preview. Enquiries will be available once the website is hosted. You can email thisvishnurajnair@gmail.com now.');
      return;
    }
    const originalText = btn.textContent;

    btn.textContent = 'Sending...';
    btn.disabled = true;

    const data = new FormData(form);
    data.set('form-name', 'enquiry');

    try {
      const response = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(data).toString()
      });
      if (!response.ok) throw new Error('Enquiry submission failed.');
      showFormSuccess(form);
    } catch (err) {
      btn.textContent = originalText;
      btn.disabled = false;
      alert('Something went wrong. Please try again or contact us directly.');
    }
  });
}

function showFormSuccess(form) {
  form.innerHTML = `
    <div class="form-success visible">
      <div style="font-size:3rem;margin-bottom:16px;">✅</div>
      <h3>Enquiry Sent!</h3>
      <p style="color:#6B6B6B;font-size:0.92rem;line-height:1.7;">
        Thank you for reaching out to The Fifth Table<br />
        We'll get back to you within <strong>24 business hours</strong>.
      </p>
    </div>
  `;
}

// =============================================
// SCROLL ANIMATIONS — fade-in on scroll
// =============================================
function initScrollAnimations() {
  const animateEls = document.querySelectorAll(
    '.product-card, .product-detail-card, .category-card, .why-card'
  );

  if (!animateEls.length) return;

  // Add initial state
  animateEls.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(24px)';
    el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        // Stagger the animations
        setTimeout(() => {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
        }, i * 60);
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -40px 0px'
  });

  animateEls.forEach(el => observer.observe(el));
}

// =============================================
// PRODUCT IMAGE CAROUSELS
// =============================================
function initCarousels() {
  document.querySelectorAll('.product-carousel').forEach(carousel => {
    const track = carousel.querySelector('.carousel-track');
    const slides = carousel.querySelectorAll('.carousel-slide');
    const prevBtn = carousel.querySelector('.carousel-btn.prev');
    const nextBtn = carousel.querySelector('.carousel-btn.next');
    const dotsContainer = carousel.querySelector('.carousel-dots');

    if (!track || slides.length === 0) return;

    if (slides.length === 1) {
      carousel.classList.add('carousel-single');
      return;
    }

    let current = 0;

    // Build dots
    slides.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
      dot.setAttribute('aria-label', 'Go to image ' + (i + 1));
      dot.addEventListener('click', () => goTo(i));
      dotsContainer.appendChild(dot);
    });

    function goTo(index) {
      current = (index + slides.length) % slides.length;
      track.style.transform = `translateX(-${current * 100}%)`;
      dotsContainer.querySelectorAll('.carousel-dot').forEach((d, i) => {
        d.classList.toggle('active', i === current);
      });
    }

    prevBtn.addEventListener('click', () => goTo(current - 1));
    nextBtn.addEventListener('click', () => goTo(current + 1));

    // Touch/swipe support
    let startX = 0;
    carousel.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    carousel.addEventListener('touchend', e => {
      const diff = startX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 40) goTo(diff > 0 ? current + 1 : current - 1);
    }, { passive: true });
  });
}

// =============================================
// SMOOTH SCROLL for anchor links
// =============================================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    const href = anchor.getAttribute('href');
    if (!href || href === '#') return;
    const target = document.getElementById(href.slice(1));
    if (target) {
      e.preventDefault();
      const offset = 88; // account for fixed header
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
});
