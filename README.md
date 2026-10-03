# MediDiag - Preliminary Diagnosis Web Application

A comprehensive medical diagnosis platform connecting patients with healthcare professionals through AI-powered preliminary diagnosis and appointment booking system.

## Features

### For Patients
- AI-powered symptom checker and preliminary diagnosis
- Doctor search and appointment booking
- Medical records management
- Live chat support
- Prescription tracking

### For Doctors
- Patient management dashboard
- Appointment scheduling and management
- E-prescription system
- Collaboration tools
- Patient analytics

## Technology Stack

- **Backend**: Node.js, Express.js
- **Frontend**: EJS, CSS3, JavaScript
- **Database**: PostgreSQL
- **AI/ML**: Python, Flask, scikit-learn
- **Real-time**: Socket.io

## Installation

### Prerequisites
- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- Python (v3.8 or higher)

### Setup Instructions

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd preliminary-diagnosis-webapp
   ```

## Bug fix: role was undefined during registration

If a user clicks a link like `/auth/register?role=doctor` the registration form previously *disabled* the role radio input to lock the choice. Disabled inputs are not submitted with the form which caused `req.body.role` to be undefined server-side and prevented doctor registrations from being processed.

What I fixed:
- The backend now passes the `role` query parameter into the template so server-side rendering matches the requested role.
- The frontend still visually locks the role, but now also appends a hidden `input[name="role"]` to guarantee the role value is included in the POST body.
- The server validates that a role is present and shows an error when it's missing.

How to test locally:
1. Start the server (e.g., `npm start` or your local dev command).
2. Open your browser and visit `/auth/register?role=doctor`.
3. Ensure the form shows the role locked and the hidden input is present (you can inspect via devtools -> elements).
4. Submit the form; on success you should be redirected to `/doctor/dashboard` and the database should contain a doctor profile.


# scripts/

`package.json` references `scripts/wait-for-ml.ps1` in the `wait-ml` script.

If that file already exists in your repository, keep it.

If it does not exist, you can either:
- create it, or
- delete the `wait-ml` script from `package.json` (it is optional).

Minimum behavior it must provide: poll `http://localhost:5000/health`
until it returns 200, with a timeout, so that `npm run ml-health` can be
called immediately after starting the ML service.