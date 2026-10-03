const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patientcontroller');
const chatController = require('../controllers/chatcontroller');

const requirePatient = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'patient') {
    next();
  } else {
    res.redirect('/auth/login');
  }
};

router.get('/dashboard', requirePatient, patientController.getDashboard);
router.get('/doctors', requirePatient, patientController.getDoctors);
router.get('/doctors/:doctorId', requirePatient, patientController.getDoctorDetails);
router.get('/appointments', requirePatient, patientController.getAppointments);
router.get('/profile', requirePatient, patientController.getProfile);

router.post('/book-appointment', requirePatient, patientController.bookAppointment);
router.post('/cancel-appointment', requirePatient, patientController.cancelAppointment);
router.post('/profile', requirePatient, patientController.updateProfile);
router.post('/reschedule-appointment', requirePatient, patientController.rescheduleAppointment);

// AI chatbot on dashboard
router.get('/chat/messages', requirePatient, chatController.getMessages);
router.post('/chat/message', requirePatient, chatController.postMessage);

// Patient chats index (list of doctors the patient has chatted with)
router.get('/chats', requirePatient, chatController.getMyThreads);

// Patient â†” single-doctor chat
router.get('/chat/doctor/:doctorId', requirePatient, patientController.getChatWithDoctor);
router.get('/chat/doctor/:doctorId/messages', requirePatient, chatController.getDoctorChatMessages);
router.post('/chat/doctor/:doctorId/message', requirePatient, chatController.postDoctorChatMessage);

module.exports = router;

