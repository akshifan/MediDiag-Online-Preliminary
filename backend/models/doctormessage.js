const { query } = require('../config/db');

class DoctorMessage {

    static async create({
        patientId,
        doctorId,
        senderRole,
        message
    }) {
        const result = await query(
            `
            INSERT INTO doctor_chat_messages
                (
                    patient_id,
                    doctor_id,
                    sender_role,
                    message
                )
            VALUES ($1, $2, $3, $4)
            RETURNING
                id,
                patient_id,
                doctor_id,
                sender_role,
                message,
                is_read,
                created_at
            `,
            [
                patientId,
                doctorId,
                senderRole,
                message
            ]
        );

        return result.rows[0];
    }


    static async findThread(patientId, doctorId) {

        const result = await query(
            `
            SELECT
                id,
                patient_id,
                doctor_id,
                sender_role,
                message,
                is_read,
                created_at

            FROM doctor_chat_messages

            WHERE patient_id = $1
              AND doctor_id = $2

            ORDER BY created_at ASC, id ASC
            `,
            [
                patientId,
                doctorId
            ]
        );

        return result.rows;
    }


    static async markDoctorMessagesRead(patientId, doctorId) {

        await query(
            `
            UPDATE doctor_chat_messages

            SET is_read = TRUE

            WHERE patient_id = $1
              AND doctor_id = $2
              AND sender_role = 'doctor'
              AND is_read = FALSE
            `,
            [
                patientId,
                doctorId
            ]
        );
    }


    static async markPatientMessagesRead(patientId, doctorId) {

        await query(
            `
            UPDATE doctor_chat_messages

            SET is_read = TRUE

            WHERE patient_id = $1
              AND doctor_id = $2
              AND sender_role = 'patient'
              AND is_read = FALSE
            `,
            [
                patientId,
                doctorId
            ]
        );
    }


    static async getPatientThreads(patientId) {

        const result = await query(
            `
            SELECT
                m.doctor_id,
                d.full_name AS doctor_name,
                m.message AS last_message,
                m.created_at AS last_at,

                (
                    SELECT COUNT(*)
                    FROM doctor_chat_messages u

                    WHERE u.patient_id = m.patient_id
                      AND u.doctor_id = m.doctor_id
                      AND u.sender_role = 'doctor'
                      AND u.is_read = FALSE
                ) AS unread_count

            FROM doctor_chat_messages m

            JOIN doctors d
                ON d.id = m.doctor_id

            WHERE m.patient_id = $1

              AND m.id = (
                    SELECT m2.id

                    FROM doctor_chat_messages m2

                    WHERE m2.patient_id = m.patient_id
                      AND m2.doctor_id = m.doctor_id

                    ORDER BY
                        m2.created_at DESC,
                        m2.id DESC

                    LIMIT 1
              )

            ORDER BY
                m.created_at DESC,
                m.id DESC
            `,
            [patientId]
        );

        return result.rows;
    }


    static async getDoctorThreads(doctorId) {

        const result = await query(
            `
            SELECT
                m.patient_id,
                p.full_name AS patient_name,
                m.message AS last_message,
                m.created_at AS last_at,

                (
                    SELECT COUNT(*)
                    FROM doctor_chat_messages u

                    WHERE u.patient_id = m.patient_id
                      AND u.doctor_id = m.doctor_id
                      AND u.sender_role = 'patient'
                      AND u.is_read = FALSE
                ) AS unread_count

            FROM doctor_chat_messages m

            JOIN patients p
                ON p.id = m.patient_id

            WHERE m.doctor_id = $1

              AND m.id = (
                    SELECT m2.id

                    FROM doctor_chat_messages m2

                    WHERE m2.patient_id = m.patient_id
                      AND m2.doctor_id = m.doctor_id

                    ORDER BY
                        m2.created_at DESC,
                        m2.id DESC

                    LIMIT 1
              )

            ORDER BY
                m.created_at DESC,
                m.id DESC
            `,
            [doctorId]
        );

        return result.rows;
    }
}

module.exports = DoctorMessage;