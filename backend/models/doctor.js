const { query } = require('../config/db');

class Doctor {
  static async create(userId, doctorData) {
    const {
      full_name, specialization, license_number,
      experience_years, phone, hospital_affiliation, consultation_fee,
    } = doctorData;

    const toNull = (v) => {
      if (v === undefined || v === null) return null;
      const s = String(v).trim();
      return s.length === 0 ? null : s;
    };

    const result = await query(
      `INSERT INTO doctors (user_id, full_name, specialization, license_number, experience_years, phone, hospital_affiliation, consultation_fee)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        userId,
        toNull(full_name),
        toNull(specialization),
        toNull(license_number),
        toNull(experience_years),
        toNull(phone),
        toNull(hospital_affiliation),
        toNull(consultation_fee),
      ]
    );
    return result.rows[0];
  }

  static async findById(id) {
    const result = await query(
      `SELECT d.*, u.email FROM doctors d
       JOIN users u ON d.user_id = u.id
       WHERE d.id = $1`,
      [id]
    );
    return result.rows[0];
  }

  static async findByUserId(userId) {
    const result = await query(
      `SELECT d.*, u.email FROM doctors d
       JOIN users u ON d.user_id = u.id
       WHERE d.user_id = $1`,
      [userId]
    );
    return result.rows[0];
  }

  static async getAllAvailable() {
    const result = await query(
      `SELECT d.*, u.email FROM doctors d
       JOIN users u ON d.user_id = u.id
       WHERE d.is_available = true`
    );
    return result.rows;
  }

  static async setAvailability(doctorId, isAvailable) {
    const result = await query(
      'UPDATE doctors SET is_available = $1 WHERE id = $2 RETURNING *',
      [isAvailable, doctorId]
    );
    return result.rows[0];
  }

  static async findBySpecialization(specialization) {
    const result = await query(
      `SELECT d.*, u.email FROM doctors d
       JOIN users u ON d.user_id = u.id
       WHERE d.specialization ILIKE $1 AND d.is_available = true`,
      [`%${specialization}%`]
    );
    return result.rows;
  }

  static async updateAvailability(doctorId, availability) {
    const isAvailable = Boolean(availability);
    const result = await query(
      'UPDATE doctors SET is_available = $1 WHERE id = $2 RETURNING *',
      [isAvailable, doctorId]
    );
    return result.rows[0];
  }

  static async updateProfile(userId, updateData) {
    const ALLOWED = [
      'full_name', 'specialization', 'license_number',
      'experience_years', 'phone', 'hospital_affiliation',
      'consultation_fee',
    ];

    const fields = [];
    const values = [];
    let paramCount = 1;

    ALLOWED.forEach((key) => {
      const v = updateData[key];
      if (v === undefined) return;
      if (v === null) return;
      if (typeof v === 'string' && v.trim() === '') return;

      fields.push(`${key} = $${paramCount}`);
      values.push(v);
      paramCount++;
    });

    if (fields.length === 0) {
      const r = await query(
        `SELECT d.*, u.email FROM doctors d
         JOIN users u ON d.user_id = u.id
         WHERE d.user_id = $1`,
        [userId]
      );
      return r.rows[0] || null;
    }

    values.push(userId);
    const result = await query(
      `UPDATE doctors
       SET ${fields.join(', ')}
       WHERE user_id = $${paramCount}
       RETURNING *`,
      values
    );
    return result.rows[0];
  }
}

module.exports = Doctor;

