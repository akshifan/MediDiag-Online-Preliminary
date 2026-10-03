const { query } = require('../config/db');

class Appointment {
  static async create(appointmentData) {
    const { patient_id, doctor_id, appointment_date, symptoms, preliminary_diagnosis } = appointmentData;

    const toNull = (v) => {
      if (v === undefined || v === null) return null;
      const s = String(v).trim();
      return s.length === 0 ? null : s;
    };

    const result = await query(
      `INSERT INTO appointments (patient_id, doctor_id, appointment_date, symptoms, preliminary_diagnosis, status)
       VALUES ($1, $2, $3, $4, $5, 'scheduled') RETURNING *`,
      [
        patient_id,
        doctor_id,
        toNull(appointment_date),
        toNull(symptoms),
        toNull(preliminary_diagnosis),
      ]
    );
    return result.rows[0];
  }

  static async findByPatientId(patientId) {
    const result = await query(
      `SELECT a.*, d.full_name as doctor_name, d.specialization
       FROM appointments a
       JOIN doctors d ON a.doctor_id = d.id
       WHERE a.patient_id = $1
       ORDER BY a.appointment_date DESC`,
      [patientId]
    );
    return result.rows;
  }

  static async findByDoctorId(doctorId) {
    const result = await query(
      `SELECT a.*, p.full_name as patient_name, p.phone as patient_phone
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       WHERE a.doctor_id = $1
       ORDER BY a.appointment_date DESC`,
      [doctorId]
    );
    return result.rows;
  }

  static async updateStatus(appointmentId, status, doctorNotes = null, prescription = null) {
    const result = await query(
      `UPDATE appointments
       SET status = $1, doctor_notes = $2, prescription = $3
       WHERE id = $4 RETURNING *`,
      [status, doctorNotes, prescription, appointmentId]
    );
    return result.rows[0];
  }

  static async findById(appointmentId) {
    const result = await query(
      `SELECT a.*, p.full_name as patient_name, d.full_name as doctor_name
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       JOIN doctors d ON a.doctor_id = d.id
       WHERE a.id = $1`,
      [appointmentId]
    );
    return result.rows[0];
  }

  static async markCompleted(id) {
    const sql = `
      UPDATE appointments
      SET status = 'completed'
      WHERE id = $1
      RETURNING *;
    `;
    const result = await query(sql, [id]);
    return result.rows[0];
  }

  static async rescheduleAppointment(id, newDate) {
    const sql = `
      UPDATE appointments
      SET appointment_date = $1, status = 'rescheduled'
      WHERE id = $2
      RETURNING *;
    `;
    const result = await query(sql, [newDate, id]);
    return result.rows[0];
  }
}

module.exports = Appointment;