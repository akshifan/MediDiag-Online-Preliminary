const express = require('express');
const router = express.Router();
const doctorController = require('../controllers/doctorcontroller');
const doctorChatController = require('../controllers/doctorchatcontroller');

const requireDoctor = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.role === 'doctor') {
    next();
  } else {
    res.redirect('/auth/login');
  }
};

router.get('/dashboard', requireDoctor, doctorController.getDashboard);
router.get('/appointments', requireDoctor, doctorController.getAppointments);
router.get('/profile', requireDoctor, doctorController.getProfile);
router.post('/profile', requireDoctor, doctorController.updateProfile);

router.get('/chats', requireDoctor, doctorChatController.listPatients);
router.get('/chats/:patientId', requireDoctor, doctorChatController.viewPatient);
router.post('/chats/:patientId/message', requireDoctor, doctorChatController.postMessage);

router.post('/update-appointment', requireDoctor, doctorController.updateAppointmentStatus);
router.post('/update-availability', requireDoctor, doctorController.updateAvailability);
router.post('/appointments/:id/complete', requireDoctor, doctorController.markComplete);

module.exports = router;