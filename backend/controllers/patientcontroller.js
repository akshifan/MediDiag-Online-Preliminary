const Patient = require('../models/patient');
const Appointment = require('../models/appointment');
const Doctor = require('../models/doctor');
const axios = require('axios');

exports.getDashboard = async (req, res) => {
    try {
        console.log('========================================');
        console.log('[PATIENT DASHBOARD] Request received');
        console.log('[PATIENT DASHBOARD] Session ID:', req.sessionID);
        console.log('[PATIENT DASHBOARD] Session:', req.session);
        console.log('[PATIENT DASHBOARD] Session user:', req.session.user);

        // Check authentication
        if (!req.session.user) {
            console.log(
                '[PATIENT DASHBOARD] FAILED: No session user'
            );

            return res.redirect('/auth/login');
        }

        // Check role
        if (req.session.user.role !== 'patient') {
            console.log(
                '[PATIENT DASHBOARD] FAILED: Invalid role:',
                req.session.user.role
            );

            return res.redirect('/auth/login');
        }

        console.log(
            '[PATIENT DASHBOARD] Authenticated user:',
            req.session.user
        );

        // Find patient profile
        const patient = await Patient.findByUserId(
            req.session.user.id
        );

        console.log(
            '[PATIENT DASHBOARD] Patient record:',
            patient
        );

        if (!patient) {
            console.log(
                '[PATIENT DASHBOARD] FAILED: Patient profile not found for user ID:',
                req.session.user.id
            );

            return res.redirect('/auth/login');
        }

        // Load appointments
        const appointments =
            await Appointment.findByPatientId(patient.id);

        console.log(
            '[PATIENT DASHBOARD] Appointments:',
            appointments ? appointments.length : 0
        );

        console.log(
            '[PATIENT DASHBOARD] SUCCESS - Rendering dashboard'
        );
        console.log('========================================');

        return res.render('patient/dashboard', {
            title: 'Patient Dashboard',
            user: req.session.user,
            patient,
            appointments: appointments || [],
            currentPage: 'dashboard'
        });

    } catch (error) {
        console.error(
            '[PATIENT DASHBOARD] ERROR:',
            error
        );

        return res.status(500).render('error', {
            error: 'Internal server error'
        });
    }
};

exports.getDoctorDetails = async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'patient') {
      return res.redirect('/auth/login');
    }

    const doctorId = Number.parseInt(req.params.doctorId, 10);
    if (!Number.isInteger(doctorId) || doctorId <= 0) {
      return res.status(400).render('error', { error: 'Invalid doctor ID' });
    }

    const [doctor, patient] = await Promise.all([
      Doctor.findById(doctorId),
      Patient.findByUserId(req.session.user.id)
    ]);

    if (!doctor) return res.status(404).render('error', { error: 'Doctor not found' });
    if (!patient) return res.redirect('/auth/login');

    res.render('patient/doctor_detail', {
      title: `Dr. ${doctor.full_name}`,
      user: req.session.user,
      patient,
      doctor
    });
  } catch (error) {
    console.error('Doctor details error:', error);
    res.status(500).render('error', { error: 'Internal server error' });
  }
};

exports.getDoctors = async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'patient') {
      return res.redirect('/auth/login');
    }

    const doctors = await Doctor.getAllAvailable();
    const patient = await Patient.findByUserId(req.session.user.id);

    res.render('patient/doctors', {
      title: 'Find Doctors',
      user: req.session.user,
      patient,
      doctors: doctors || []
    });
  } catch (error) {
    console.error('Doctors list error:', error);
    res.status(500).render('error', { error: 'Internal server error' });
  }
};

exports.bookAppointment = async (req, res) => {
  try {
    const { doctor_id, appointment_date, symptoms } = req.body;

    if (!req.session.user || req.session.user.role !== 'patient') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const patient = await Patient.findByUserId(req.session.user.id);
    if (!patient) return res.status(401).json({ error: 'Patient profile not found' });

    let preliminary_diagnosis = '';
    try {
      const mlUrl = process.env.ML_SERVICE_URL || 'http://localhost:5000';
      const mlResponse = await axios.post(
        `${mlUrl}/analyze`,
        { symptoms },
        { timeout: Number(process.env.ML_TIMEOUT_MS || 8000) }
      );
      preliminary_diagnosis = mlResponse.data.diagnosis || '';
    } catch (mlError) {
      console.error('ML service error:', mlError.message || mlError);
      preliminary_diagnosis = 'Preliminary analysis unavailable. Please consult with doctor.';
    }

    const doctor = await Doctor.findById(doctor_id);
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

    const appointment = await Appointment.create({
      patient_id: patient.id,
      doctor_id,
      appointment_date,
      symptoms,
      preliminary_diagnosis
    });

    res.json({
      success: true,
      appointment,
      message: 'Appointment booked successfully'
    });
  } catch (error) {
    console.error('Appointment booking error:', error);
    res.status(500).json({ error: 'Failed to book appointment: ' + (error.message || '') });
  }
};

exports.getAppointments = async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'patient') {
      return res.redirect('/auth/login');
    }

    const patient = await Patient.findByUserId(req.session.user.id);
    if (!patient) return res.redirect('/auth/login');

    const appointments = await Appointment.findByPatientId(patient.id);

    res.render('patient/appointments', {
      title: 'My Appointments',
      user: req.session.user,
      patient,
      appointments: appointments || []
    });
  } catch (error) {
    console.error('Appointments error:', error);
    res.status(500).render('error', { error: 'Internal server error' });
  }
};

exports.getProfile = async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'patient') {
      return res.redirect('/auth/login');
    }

    const patient = await Patient.findByUserId(req.session.user.id);
    if (!patient) return res.redirect('/auth/login');

    res.render('patient/profile', {
      title: 'My Profile',
      user: req.session.user,
      patient
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).render('error', { error: 'Internal server error' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'patient') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const clean = (v) => {
      if (v === undefined || v === null) return undefined;
      const s = String(v).trim();
      return s === '' ? undefined : s;
    };

    const updateData = {
      full_name: clean(req.body.full_name),
      date_of_birth: clean(req.body.date_of_birth),
      gender: clean(req.body.gender),
      phone: clean(req.body.phone),
      address: clean(req.body.address),
      emergency_contact: clean(req.body.emergency_contact),
    };

    const updated = await Patient.updateProfile(req.session.user.id, updateData);
    if (!updated) return res.status(404).json({ error: 'Patient profile not found' });

    res.json({ success: true, patient: updated, message: 'Profile updated' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile: ' + (error.message || '') });
  }
};

exports.cancelAppointment = async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'patient') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { appointment_id } = req.body;
    if (!appointment_id) return res.status(400).json({ error: 'Missing appointment_id' });

    const patient = await Patient.findByUserId(req.session.user.id);
    if (!patient) return res.status(401).json({ error: 'Patient profile not found' });

    const appointment = await Appointment.findById(appointment_id);
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

    if (Number(appointment.patient_id) !== Number(patient.id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updated = await Appointment.updateStatus(appointment_id, 'cancelled', null, null);
    return res.json({ success: true, appointment: updated, message: 'Appointment cancelled' });
  } catch (error) {
    console.error('Cancel appointment error:', error);
    return res.status(500).json({ error: 'Failed to cancel appointment: ' + (error.message || '') });
  }
};

exports.rescheduleAppointment = async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'patient') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { appointment_id, new_date } = req.body;
    if (!appointment_id || !new_date) {
      return res.status(400).json({ error: 'Missing appointment_id or new_date' });
    }

    // Validate date
    const parsed = new Date(new_date);
    if (isNaN(parsed.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    const isoDate = parsed.toISOString();

    const patient = await Patient.findByUserId(req.session.user.id);
    if (!patient) return res.status(401).json({ error: 'Patient profile not found' });

    const appointment = await Appointment.findById(appointment_id);
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

    if (Number(appointment.patient_id) !== Number(patient.id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updated = await Appointment.rescheduleAppointment(appointment_id, isoDate);
    if (!updated) return res.status(400).json({ error: 'Could not reschedule' });

    return res.json({ success: true, appointment: updated });
  } catch (error) {
    console.error('Reschedule error:', error);
    return res.status(500).json({ error: 'Server error: ' + (error.message || '') });
  }
};


exports.getChatWithDoctor = async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'patient') {
      return res.redirect('/auth/login');
    }

    const doctorId = Number.parseInt(req.params.doctorId, 10);

    if (!Number.isInteger(doctorId) || doctorId <= 0) {
      return res.status(400).render('error', {
        error: 'Invalid doctor ID'
      });
    }

    // Get both doctor and logged-in patient
    const [doctor, patient] = await Promise.all([
      Doctor.findById(doctorId),
      Patient.findByUserId(req.session.user.id)
    ]);

    if (!doctor) {
      return res.status(404).render('error', {
        error: 'Doctor not found'
      });
    }

    if (!patient) {
      return res.redirect('/auth/login');
    }

    res.render('patient/chat', {
      title: 'Chat with Doctor',
      user: req.session.user,

      // Patient information required by chat.ejs
      patient,

      // Doctor information
      doctor,
      doctorId: doctor.id,
      doctorName: doctor.full_name,

      currentPage: 'chat'
    });

  } catch (error) {
    console.error('getChatWithDoctor error:', error);

    return res.status(500).render('error', {
      error: 'Internal server error'
    });
  }
};