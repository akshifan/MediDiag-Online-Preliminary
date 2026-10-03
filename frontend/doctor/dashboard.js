/* MediDiag Doctor Dashboard
 * Handles dashboard-only interactive behavior.
 * Appointment history itself is rendered server-side and paginated on the appointments page.
 */
(function () {
  'use strict';

  function initAvailability() {
    const toggle = document.getElementById('availability-toggle');
    const label = document.getElementById('availability-label');
    const error = document.getElementById('availability-error');
    if (!toggle) return;

    let saving = false;

    toggle.addEventListener('change', async function () {
      if (saving) return;
      saving = true;
      const nextValue = toggle.checked;
      if (error) error.style.display = 'none';

      try {
        const response = await fetch('/doctor/update-availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ availability: nextValue })
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Unable to update availability');
        }

        if (label) {
          label.textContent = nextValue
            ? 'You are currently available for appointments.'
            : 'You are currently unavailable for appointments.';
        }
      } catch (err) {
        console.error('Availability update failed:', err);
        toggle.checked = !nextValue;
        if (error) {
          error.textContent = err.message || 'Could not update availability. Please try again.';
          error.style.display = 'block';
        }
      } finally {
        saving = false;
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (document.querySelector('.doctor-dashboard')) {
      initAvailability();
    }
  });
})();
