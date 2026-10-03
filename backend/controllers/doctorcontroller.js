
const Doctor = require('../models/doctor');
const Appointment = require('../models/appointment');
const Patient = require('../models/patient');

exports.getDashboard = async (req, res) => {
  try {
    const user = req && req.session ? req.session.user : null;
    if (!user) return res.redirect('/auth/login');

    const doctor = await Doctor.findByUserId(user.id);
    if (!doctor) {
      console.warn('Doctor profile not found for user', user && user.id);
      return res.redirect('/auth/login');
    }

    const appointments = await Appointment.findByDoctorId(doctor.id);
    const safeAppointments = appointments || [];

    const totalAppointments = safeAppointments.length;
    const pendingAppointments = safeAppointments.filter(a => a.status === 'scheduled').length;
    const completedAppointments = safeAppointments.filter(a => a.status === 'completed').length;

    res.render('doctor/dashboard', {
      title: 'Doctor Dashboard',
      user: req.session.user,
      doctor,
      appointments: safeAppointments.slice(0, 8),
      stats: {
        total: totalAppointments,
        pending: pendingAppointments,
        completed: completedAppointments
      }
    });
  } catch (error) {
    console.error('Doctor dashboard error:', error);
    res.status(500).render('error', { error: 'Internal server error' });
  }
};

exports.getAppointments = async (req, res) => {
  try {
    const user = req && req.session ? req.session.user : null;
    if (!user) return res.redirect('/auth/login');

    const doctor = await Doctor.findByUserId(user.id);
    if (!doctor) return res.redirect('/auth/login');

    const appointments = await Appointment.findByDoctorId(doctor.id);

    res.render('doctor/appointments', {
      title: 'My Appointments',
      user: req.session.user,
      doctor,
      appointments: appointments || []
    });
  } catch (error) {
    console.error('Doctor appointments error:', error);
    res.status(500).render('error', { error: 'Internal server error' });
  }
};

exports.updateAppointmentStatus = async (req, res) => {
  try {
    const { appointment_id, status, doctor_notes, prescription } = req.body;

    if (!req.session || !req.session.user || req.session.user.role !== 'doctor') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const doctor = await Doctor.findByUserId(req.session.user.id);
    if (!doctor) return res.status(401).json({ error: 'Unauthorized' });

    const existing = await Appointment.findById(appointment_id);
    if (!existing) return res.status(404).json({ error: 'Appointment not found' });
    if (Number(existing.doctor_id) !== Number(doctor.id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const appointment = await Appointment.updateStatus(
      appointment_id,
      status,
      doctor_notes,
      prescription
    );

    res.json({
      success: true,
      appointment,
      message: 'Appointment updated successfully'
    });
  } catch (error) {
    console.error('Appointment update error:', error);
    res.status(500).json({ error: 'Failed to update appointment' });
  }
};

exports.updateAvailability = async (req, res) => {
  try {
    if (!req.session || !req.session.user || req.session.user.role !== 'doctor') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const raw = req.body && req.body.availability;
    const isAvailable = raw === true || raw === 'true' || raw === 1 || raw === '1';

    const doctor = await Doctor.findByUserId(req.session.user.id);
    if (!doctor) return res.status(401).json({ error: 'Unauthorized' });

    const updated = await Doctor.updateAvailability(doctor.id, isAvailable);
    return res.json({ success: true, doctor: updated, message: 'Availability updated successfully' });
  } catch (error) {
    console.error('Availability update error:', error);
    return res.status(500).json({ error: 'Failed to update availability: ' + (error.message || '') });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = req && req.session ? req.session.user : null;
    if (!user) return res.redirect('/auth/login');

    const doctor = await Doctor.findByUserId(user.id);
    if (!doctor) {
      return res.render('doctor/profile', {
        title: 'My Profile',
        user: req.session.user,
        doctor: {},
        newProfile: true
      });
    }

    res.render('doctor/profile', {
      title: 'My Profile',
      user: req.session.user,
      doctor
    });
  } catch (error) {
    console.error('Get doctor profile error:', error);
    res.status(500).render('error', { error: 'Internal server error' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const user = req && req.session ? req.session.user : null;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const clean = (v) => {
      if (v === undefined || v === null) return undefined;
      const s = String(v).trim();
      return s === '' ? undefined : s;
    };
    const toIntOrUndef = (v) => {
      const s = clean(v);
      if (s === undefined) return undefined;
      const n = parseInt(s, 10);
      return Number.isNaN(n) ? undefined : n;
    };
    const toNumOrUndef = (v) => {
      const s = clean(v);
      if (s === undefined) return undefined;
      const n = parseFloat(s);
      return Number.isNaN(n) ? undefined : n;
    };

    const updateData = {
      full_name: clean(req.body.full_name),
      specialization: clean(req.body.specialization),
      license_number: clean(req.body.license_number),
      experience_years: toIntOrUndef(req.body.experience_years),
      phone: clean(req.body.phone),
      hospital_affiliation: clean(req.body.hospital_affiliation),
      consultation_fee: toNumOrUndef(req.body.consultation_fee),
    };

    const existing = await Doctor.findByUserId(user.id);
    if (!existing) {
      const created = await Doctor.create(user.id, updateData);
      return res.json({ success: true, doctor: created, message: 'Profile created' });
    }

    const updated = await Doctor.updateProfile(user.id, updateData);
    if (!updated) return res.status(404).json({ error: 'Doctor profile not found' });

    res.json({ success: true, doctor: updated, message: 'Profile updated' });
  } catch (error) {
    console.error('Update doctor profile error:', error);
    res.status(500).json({ error: 'Failed to update profile: ' + (error.message || '') });
  }
};

exports.markComplete = async (req, res) => {
  try {
    if (!req.session || !req.session.user || req.session.user.role !== 'doctor') {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const appointmentId = req.params.id;

    const doctor = await Doctor.findByUserId(req.session.user.id);
    if (!doctor) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const existing = await Appointment.findById(appointmentId);
    if (!existing) return res.status(404).json({ success: false, error: 'Not found' });
    if (Number(existing.doctor_id) !== Number(doctor.id)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const updated = await Appointment.markCompleted(appointmentId);
    return res.json({ success: !!updated });
  } catch (error) {
    console.error('Appointment completion error:', error);
    return res.status(500).json({ success: false });
  }
};