'use strict';

// Locks viewport height into tokens: --vh-static (measured), --vh-lock (only grows). Re-measures on orientation change.
const lockViewportHeight = () => {
  const root = document.documentElement.style;
  const portrait = matchMedia('(orientation: portrait)');
  let height;
  const set = (name, px) => root.setProperty(name, `${px}px`);
  const measure = () => { height = innerHeight; set('--vh-static', height); set('--vh-lock', height); };
  const grow = () => { if (innerHeight <= height) return; height = innerHeight; set('--vh-lock', height); };
  portrait.addEventListener('change', () => { measure(); addEventListener('resize', measure, { once: true }); });
  addEventListener('resize', grow, { passive: true });
  measure();
};

// Fades blocks up as they enter; blocks entering together stagger by 120ms.
const revealOnScroll = (els) => {
  const observer = new IntersectionObserver((entries) => {
    entries.filter((e) => e.isIntersecting).forEach(({ target }, i) => {
      target.style.setProperty('--reveal-delay', `${i * 120}ms`);
      target.dataset.revealed = '';
      observer.unobserve(target);
    });
  }, { rootMargin: '0px 0px -10% 0px' });
  els.forEach((el) => observer.observe(el));
};

const closeMenuOnNavigate = (menu) => {
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) menu.hidePopover(); });
};

const toggleDisclosure = (button) => {
  button.addEventListener('click', () => {
    button.setAttribute('aria-expanded', button.getAttribute('aria-expanded') !== 'true');
  });
};

// Legacy copy for insecure contexts (plain http / LAN IP), where navigator.clipboard is undefined.
const copyViaSelection = (text) => {
  const field = Object.assign(document.createElement('textarea'), { value: text, readOnly: true });
  field.style.cssText = 'position:fixed;opacity:0;font-size:16px';
  document.body.append(field);
  field.setSelectionRange(0, text.length);
  field.select();
  const ok = document.execCommand('copy');
  field.remove();
  if (!ok) throw new Error('copy failed');
};

const copyText = async (text) => {
  if (window.isSecureContext && navigator.clipboard) return navigator.clipboard.writeText(text);
  copyViaSelection(text);
};

// Obfuscated email (data-u @ data-d): copies the address to the clipboard, falls back to mailto.
const copyEmail = (button) => {
  const label = button.textContent;
  let timer;
  button.addEventListener('click', async () => {
    const address = `${button.dataset.u}@${button.dataset.d}`;
    try {
      await copyText(address);
      button.textContent = 'Email copied';
    } catch {
      location.href = `mailto:${address}`;
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => { button.textContent = label; }, 2400);
  });
};

revealOnScroll(document.querySelectorAll('main > *'));
document.querySelectorAll('button[aria-controls][aria-expanded]').forEach(toggleDisclosure);
document.querySelectorAll('[data-is="nav-menu"]').forEach(closeMenuOnNavigate);
document.querySelectorAll('[data-copy][data-u][data-d]').forEach(copyEmail);
lockViewportHeight();
