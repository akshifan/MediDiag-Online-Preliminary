const chatController = require('./chatcontroller');

const doctorChats = chatController.doctorChats;
const doctorChatKey = chatController.doctorChatKey;

const Doctor = require('../models/doctor');
const Patient = require('../models/patient');
const DoctorMessage = require('../models/doctormessage');


/* =========================================================
   DOCTOR CHAT LIST
   /doctor/chats
   ========================================================= */

exports.listPatients = async (req, res) => {

    try {

        if (
            !req.session ||
            !req.session.user ||
            req.session.user.role !== 'doctor'
        ) {
            return res.redirect('/auth/login');
        }

        const doctor = await Doctor.findByUserId(
            req.session.user.id
        );

        if (!doctor) {
            return res.redirect('/auth/login');
        }

        const patients =
            await chatController.getDoctorThreadsData(
                doctor.id
            );

        return res.render('doctor/chat_list', {
            title: 'Patient Chats',
            patients,
            doctor,
            user: req.session.user,
            selectedPatientId: null
        });

    } catch (error) {

        console.error(
            'Doctor chat list error:',
            error
        );

        return res.status(500).render('error', {
            error: 'Internal server error'
        });
    }
};


/* =========================================================
   VIEW INDIVIDUAL PATIENT CHAT
   /doctor/chats/:patientId
   ========================================================= */

exports.viewPatient = async (req, res) => {

    try {

        /* ---------------------------------------------
           AUTHENTICATION
           --------------------------------------------- */

        if (
            !req.session ||
            !req.session.user ||
            req.session.user.role !== 'doctor'
        ) {
            return res.redirect('/auth/login');
        }


        /* ---------------------------------------------
           FIND LOGGED-IN DOCTOR
           --------------------------------------------- */

        const doctor = await Doctor.findByUserId(
            req.session.user.id
        );

        if (!doctor) {
            return res.redirect('/auth/login');
        }


        /* ---------------------------------------------
           PATIENT ID FROM URL
           
           IMPORTANT:
           This is the patients.id value, NOT users.id.
           --------------------------------------------- */

        const patientId = Number.parseInt(
            req.params.patientId,
            10
        );

        if (
            !Number.isInteger(patientId) ||
            patientId <= 0
        ) {
            return res.status(400).render('error', {
                error: 'Invalid patient ID'
            });
        }


        /* ---------------------------------------------
           FIND PATIENT BY PATIENT TABLE ID
           
           DO NOT USE:
           Patient.findByUserId(patientId)

           because the URL contains patients.id.
           --------------------------------------------- */

        let patient;

        if (typeof Patient.findById === 'function') {

            patient = await Patient.findById(
                patientId
            );

        } else {

            /*
             * Fallback if your Patient model does not
             * currently contain findById().
             */
            const { query } = require('../config/db');

            const result = await query(
                `
                SELECT *
                FROM patients
                WHERE id = $1
                LIMIT 1
                `,
                [patientId]
            );

            patient = result.rows[0] || null;
        }


        if (!patient) {

            return res.status(404).render('error', {
                error: 'Patient not found'
            });
        }


        /* ---------------------------------------------
           LOAD CHAT THREAD FROM DATABASE
           --------------------------------------------- */

        const messages =
            await DoctorMessage.findThread(
                patient.id,
                doctor.id
            );


        /* ---------------------------------------------
           MARK PATIENT MESSAGES AS READ
           --------------------------------------------- */

        await DoctorMessage.markPatientMessagesRead(
            patient.id,
            doctor.id
        );


        /* ---------------------------------------------
           RENDER CHAT PAGE
           --------------------------------------------- */

        return res.render('doctor/chat_view', {

            title: `Chat with ${patient.full_name}`,

            user: req.session.user,

            doctor,

            doctorId: doctor.id,

            patient,

            patientId: patient.id,

            messages: messages || []

        });

    } catch (error) {

        console.error(
            'Doctor chat view error:',
            error
        );

        return res.status(500).render('error', {
            error: 'Internal server error'
        });
    }
};


/* =========================================================
   SEND DOCTOR MESSAGE
   POST /doctor/chats/:patientId/message
   ========================================================= */

exports.postMessage = async (req, res) => {

    try {

        /* ---------------------------------------------
           AUTHENTICATION
           --------------------------------------------- */

        if (
            !req.session ||
            !req.session.user ||
            req.session.user.role !== 'doctor'
        ) {
            return res.status(401).json({
                error: 'Unauthorized'
            });
        }


        /* ---------------------------------------------
           FIND DOCTOR
           --------------------------------------------- */

        const doctor = await Doctor.findByUserId(
            req.session.user.id
        );

        if (!doctor) {
            return res.status(401).json({
                error: 'Unauthorized'
            });
        }


        /* ---------------------------------------------
           PATIENT ID
           --------------------------------------------- */

        const patientId = Number.parseInt(
            req.params.patientId,
            10
        );

        if (
            !Number.isInteger(patientId) ||
            patientId <= 0
        ) {
            return res.status(400).json({
                error: 'Invalid patient ID'
            });
        }


        /* ---------------------------------------------
           MESSAGE TEXT
           --------------------------------------------- */

        const text = String(
            req.body.text || ''
        ).trim();

        if (!text) {
            return res.status(400).json({
                error: 'Empty message'
            });
        }


        /* ---------------------------------------------
           VERIFY PATIENT EXISTS
           --------------------------------------------- */

        let patient;

        if (typeof Patient.findById === 'function') {

            patient = await Patient.findById(
                patientId
            );

        } else {

            const { query } = require('../config/db');

            const result = await query(
                `
                SELECT *
                FROM patients
                WHERE id = $1
                LIMIT 1
                `,
                [patientId]
            );

            patient = result.rows[0] || null;
        }


        if (!patient) {
            return res.status(404).json({
                error: 'Patient not found'
            });
        }


        /* ---------------------------------------------
           SAVE MESSAGE TO POSTGRESQL
           
           IMPORTANT:
           Previously this was saved only in the
           in-memory doctorChats Map.
           
           Now PostgreSQL is the source of truth.
           --------------------------------------------- */

        const savedMessage =
            await DoctorMessage.create({

                patientId: patient.id,

                doctorId: doctor.id,

                senderRole: 'doctor',

                message: text

            });


        /* ---------------------------------------------
           CONVERT DATABASE FORMAT TO FRONTEND FORMAT
           --------------------------------------------- */

        const message = {

            id: savedMessage.id,

            sender: savedMessage.sender_role,

            text: savedMessage.message,

            timestamp: savedMessage.created_at

        };


        /* ---------------------------------------------
           SOCKET.IO REAL-TIME MESSAGE
           --------------------------------------------- */

        const io = req.app.get('io');

        if (io) {

            io.to(
                `chat-${patient.id}-${doctor.id}`
            ).emit(
                'chat-message',
                message
            );
        }


        /* ---------------------------------------------
           RESPONSE
           --------------------------------------------- */

        return res.json({

            success: true,

            message

        });

    } catch (error) {

        console.error(
            'doctor postMessage error:',
            error
        );

        return res.status(500).json({
            error: 'Server error'
        });
    }
};