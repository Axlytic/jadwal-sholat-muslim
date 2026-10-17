// ==============================
// Navbar — background muncul pas scroll
// ==============================
const navbar = document.getElementById('navbar');

window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 50);
});

// ==============================
// Mobile menu toggle
// ==============================
const navToggle = document.getElementById('navToggle');
const navMenu = document.getElementById('navMenu');

navToggle.addEventListener('click', () => {
    navMenu.classList.toggle('active');
    navToggle.classList.toggle('active');
});

// tutup menu kalo klik link
navMenu.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        navMenu.classList.remove('active');
        navToggle.classList.remove('active');
    });
});

// ==============================
// Smooth scroll buat anchor link
// ==============================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

// ==============================
// Highlight nav link sesuai section yang keliatan
// ==============================
const sections = document.querySelectorAll('section[id]');

function updateActiveNav() {
    const scrollY = window.scrollY + 120;

    sections.forEach(section => {
        const top = section.offsetTop;
        const height = section.offsetHeight;
        const id = section.getAttribute('id');
        const link = document.querySelector('.nav-link[href="#' + id + '"]');

        if (link) {
            if (scrollY >= top && scrollY < top + height) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        }
    });
}

window.addEventListener('scroll', updateActiveNav);

// ==============================
// Animasi scroll — elemen muncul pas masuk viewport
// ==============================
const scrollObserver = new IntersectionObserver(
    (entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                scrollObserver.unobserve(entry.target);
            }
        });
    },
    { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
);

document.querySelectorAll('.animate-on-scroll').forEach(el => {
    scrollObserver.observe(el);
});

// ==============================
// Counter — angka naik dari 0
// ==============================
function animateCounter(el) {
    const target = parseInt(el.dataset.count, 10);
    const duration = 1500; // ms
    const startTime = performance.now();

    function tick(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // easing biar nggak linear
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.floor(eased * target);

        if (progress < 1) {
            requestAnimationFrame(tick);
        } else {
            el.textContent = target;
        }
    }

    requestAnimationFrame(tick);
}

const statsSection = document.querySelector('.about-stats');
if (statsSection) {
    const statObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.querySelectorAll('.stat-number').forEach(animateCounter);
                    statObserver.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.5 }
    );
    statObserver.observe(statsSection);
}

// ==============================
// Skill bar — isi progress bar pas keliatan
// ==============================
const skillObserver = new IntersectionObserver(
    (entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate');
                skillObserver.unobserve(entry.target);
            }
        });
    },
    { threshold: 0.3 }
);

document.querySelectorAll('.skill-fill').forEach(bar => {
    skillObserver.observe(bar);
});

// ==============================
// Form kontak — feedback pas submit
// ==============================
const contactForm = document.getElementById('contactForm');

if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const btn = contactForm.querySelector('button[type="submit"]');
        const originalHTML = btn.innerHTML;

        btn.innerHTML = '<span>Terkirim ✓</span>';
        btn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        btn.disabled = true;

        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.style.background = '';
            btn.disabled = false;
            contactForm.reset();
        }, 2500);
    });
}
