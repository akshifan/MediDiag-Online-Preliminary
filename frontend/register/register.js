class RegisterForm {
  constructor() {
    this.currentRole = this.roleFromURL() || this.roleFromServer() || null;
    this.initEventListeners();
    this.setupPasswordStrength();
    this.initMedicalBackground();
    if (this.currentRole) this.selectRole(this.currentRole, true);
    else this.selectRole(null, false);
  }

  roleFromURL() {
    const raw = new URLSearchParams(window.location.search).get('role');
    return (raw === 'patient' || raw === 'doctor') ? raw : null;
  }

  roleFromServer() {
    const hidden = document.querySelector('input[type="hidden"][name="role"]');
    if (hidden && (hidden.value === 'patient' || hidden.value === 'doctor')) return hidden.value;
    const checked = document.querySelector('input[name="role"]:checked');
    if (checked && (checked.value === 'patient' || checked.value === 'doctor')) return checked.value;
    return null;
  }

  initEventListeners() {
    const form = document.getElementById('register-form');
    if (!form) return;

    form.querySelectorAll('input[name="role"]').forEach((input) => {
      input.addEventListener('change', () => {
        if (input.disabled) return;
        this.selectRole(input.value, false, true);
      });
    });

    form.querySelectorAll('.role-label').forEach((label) => {
      label.addEventListener('click', () => {
        const forId = label.getAttribute('for');
        if (!forId) return;
        const input = document.getElementById(forId);
        if (!input || input.disabled) return;
        input.checked = true;
        this.selectRole(input.value, false, true);
      });
    });

    const password = document.getElementById('password');
    const confirm = document.getElementById('confirm_password');
    if (confirm) confirm.addEventListener('input', () => this.validatePasswordMatch(password, confirm));
    form.addEventListener('submit', (e) => this.validateForm(e));
  }

  selectRole(role, lock, fromClick = false) {
    const form = document.getElementById('register-form');
    if (!form) return;

    // 1) Set radio state
    form.querySelectorAll('input[name="role"]').forEach((r) => {
      r.checked = (r.value === role);
      r.disabled = !!lock && r.value === role;
    });

    // 2) Show/hide role-specific blocks
    this.toggleRoleSpecificFields(role);

    // 3) Remove ALL stale hidden role inputs (critical — this was the bug)
    form.querySelectorAll('input[type="hidden"][name="role"]').forEach((el) => el.remove());

    // 4) If locked, inject a single fresh hidden input
    if (lock && role) {
      const hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = 'role';
      hidden.value = role;
      form.appendChild(hidden);
    }

    // 5) Update the "locked" banner
    const roleSection = form.querySelector('.role-selection');
    if (roleSection) {
      roleSection.querySelectorAll('.role-locked-message').forEach((el) => el.remove());
      if (lock && role) {
        const banner = document.createElement('div');
        banner.className = 'role-locked-message';
        banner.innerHTML = `Role locked as ${role}. <a href="/auth/register" class="change-role-link">Go back to change role</a>`;
        roleSection.appendChild(banner);
        roleSection.classList.add('role-selection-locked');
      } else {
        roleSection.classList.remove('role-selection-locked');
        if (fromClick) {
          const roleErr = roleSection.querySelector('.field-error.role-error');
          if (roleErr) roleErr.remove();
          roleSection.classList.remove('has-error');
        }
      }
    }
  }

  toggleRoleSpecificFields(role) {
    document.querySelectorAll('.doctor-field').forEach((f) => { f.style.display = role === 'doctor' ? 'block' : 'none'; });
    document.querySelectorAll('.patient-field').forEach((f) => { f.style.display = role === 'patient' ? 'block' : 'none'; });
    ['specialization', 'license_number', 'experience_years'].forEach((name) => {
      const el = document.getElementById(name);
      if (el) el.required = (role === 'doctor');
    });
  }

  setupPasswordStrength() {
    const p = document.getElementById('password');
    if (!p) return;
    p.addEventListener('input', () => {
      const bar = document.querySelector('.strength-bar');
      if (!bar) return;
      bar.className = 'strength-bar';
      if (p.value.length === 0) { bar.style.width = '0%'; return; }
      let s = 0;
      if (p.value.length >= 6) s++;
      if (p.value.length >= 8) s++;
      if (/[A-Z]/.test(p.value)) s++;
      if (/[0-9]/.test(p.value)) s++;
      if (/[^A-Za-z0-9]/.test(p.value)) s++;
      bar.classList.add(s <= 2 ? 'strength-weak' : s <= 4 ? 'strength-medium' : 'strength-strong');
    });
  }

  validatePasswordMatch(p, c) {
    if (!p || !c) return;
    c.style.borderColor = (p.value === c.value) ? '#10b981' : '#ef4444';
  }

  initMedicalBackground() {
    const bg = document.querySelector('.medical-background');
    if (!bg) return;
    ['❤️', '🩺', '💊', '🏥', '👤', '👨‍⚕️'].forEach((icon, i) => {
      const el = document.createElement('div');
      el.className = 'medical-icon';
      el.textContent = icon;
      el.style.animationDelay = (i * 2) + 's';
      el.style.left = (Math.random() * 90) + '%';
      el.style.top = (Math.random() * 90) + '%';
      bg.appendChild(el);
    });
  }

  validateForm(e) {
    const form = document.getElementById('register-form');
    if (!form) return true;
    const checked = form.querySelector('input[name="role"]:checked');
    const hidden = form.querySelector('input[type="hidden"][name="role"]');
    const roleValue = (checked && checked.value) || (hidden && hidden.value);
    if (!roleValue || (roleValue !== 'patient' && roleValue !== 'doctor')) {
      e.preventDefault();
      this.showRoleError('Please select a role: Patient or Doctor.');
      return false;
    }
    const p = document.getElementById('password');
    const c = document.getElementById('confirm_password');
    if (p && c && p.value !== c.value) { e.preventDefault(); this.showPasswordError('Passwords do not match.'); return false; }
    if (p && p.value.length < 6) { e.preventDefault(); this.showPasswordError('Password must be at least 6 characters long.'); return false; }
    return true;
  }

  showRoleError(msg) {
    const section = document.querySelector('.role-selection');
    if (!section) return;
    let err = section.querySelector('.field-error.role-error');
    if (!err) { err = document.createElement('div'); err.className = 'field-error role-error'; section.appendChild(err); }
    err.textContent = msg;
    section.classList.add('has-error');
  }

  showPasswordError(msg) {
    const c = document.getElementById('confirm_password');
    if (!c) return;
    let err = c.parentNode.querySelector('.field-error.password-error');
    if (!err) { err = document.createElement('div'); err.className = 'field-error password-error'; c.parentNode.appendChild(err); }
    err.textContent = msg;
    c.setAttribute('aria-invalid', 'true');
  }
}

document.addEventListener('DOMContentLoaded', () => new RegisterForm());