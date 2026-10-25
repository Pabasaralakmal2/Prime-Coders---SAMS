import mysql from "mysql2/promise";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getMySQLConfig } from "./mysql.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const cfg = getMySQLConfig();
const aivenConfig = {
  host: cfg.host,
  port: cfg.port,
  user: cfg.user,
  password: cfg.password,
  database: cfg.database,
  ssl: { rejectUnauthorized: false },
  multipleStatements: true,
};

async function run() {
  console.log("Connecting to Aiven Cloud MySQL...");
  const conn = await mysql.createConnection(aivenConfig);
  console.log("Connected successfully to Aiven!");

  console.log("Applying schema...");
  let sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "")
    .replace(/CREATE DATABASE[\s\S]*?;/gi, "")
    .replace(/USE [\s\S]*?;/gi, "");

  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  await conn.query("SET FOREIGN_KEY_CHECKS = 0;");
  for (const st of statements) {
    try {
      await conn.query(st);
    } catch (e) {
      if (!e.message.includes("already exists")) {
        console.warn("Schema notice:", e.message.slice(0, 80));
      }
    }
  }

  try {
    await conn.query(`
      ALTER TABLE medical_reports 
      ADD COLUMN IF NOT EXISTS attachment_url VARCHAR(500),
      ADD COLUMN IF NOT EXISTS attachment_name VARCHAR(200),
      ADD COLUMN IF NOT EXISTS attachment_type VARCHAR(100);
    `);
  } catch (e) { }

  console.log("Inserting roles...");
  await conn.query(`
    INSERT IGNORE INTO roles (role_code, label) VALUES
    ('hod', 'Head of Department'),
    ('lecturer', 'Lecturer'),
    ('visiting', 'Visiting Lecturer'),
    ('coordinator', 'VL Coordinator'),
    ('committee', 'Request Committee Member'),
    ('dean', 'Dean of Faculty'),
    ('demo', 'Demonstrator'),
    ('student', 'Student');
  `);

  const store = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "store.json"), "utf8"));

  if (store.department) {
    await conn.query(
      "INSERT IGNORE INTO departments (department_id, department_name, faculty) VALUES (?, ?, ?)",
      [store.department.id || 1, store.department.name, store.department.faculty]
    );
  }

  for (const u of store.users || []) {
    await conn.query(
      "INSERT IGNORE INTO users (user_id, email, password_hash, role_code, display_name, status) VALUES (?, ?, ?, ?, ?, ?)",
      [u.id, u.email, u.password, u.role, u.name, u.status || "active"]
    );
  }

  for (const s of store.semesters || []) {
    await conn.query(
      "INSERT IGNORE INTO semesters (semester_id, semester_name, academic_year, start_date, end_date, week_count, current_week, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [s.id, s.name, s.year, s.start, s.end, s.weekCount || 15, s.currentWeek || 1, s.status || "active"]
    );
  }

  console.log(`Inserting ${store.students?.length} students...`);
  for (const s of store.students || []) {
    await conn.query(
      "INSERT IGNORE INTO students (student_id, user_id, registration_no, index_no, name_with_initials, phone_no, date_of_admission, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [s.id, s.userId, s.registrationNo, s.indexNo, s.name, s.phone || null, s.admission || null, s.status || "active"]
    );
  }

  for (const l of store.lecturers || []) {
    await conn.query(
      "INSERT IGNORE INTO lecturers (lecturer_id, user_id, employee_no, name_with_initials, phone_no, qualification, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [l.id, l.userId, l.employeeNo, l.name, l.phone || null, l.qualification || null, l.status || "active"]
    );
  }

  for (const c of store.courses || []) {
    await conn.query(
      "INSERT IGNORE INTO courses (course_id, course_code, course_name, credit_value, course_type) VALUES (?, ?, ?, ?, ?)",
      [c.id, c.code, c.name, c.credits, c.type]
    );
  }

  for (const sec of store.sections || []) {
    await conn.query(
      "INSERT IGNORE INTO course_sections (section_id, course_id, semester_id, section_code, lecture_days, start_time, end_time, venue, frozen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [sec.id, sec.courseId, sec.semesterId, sec.code || "A", sec.day || "Mon", sec.start || "08:00", sec.end || "10:00", sec.venue || "Hall", sec.frozen ? 1 : 0]
    );
  }

  for (const sec of store.sections || []) {
    if (sec.lecturerId) {
      await conn.query(
        "INSERT IGNORE INTO lecturer_assignments (section_id, lecturer_id) VALUES (?, ?)",
        [sec.id, sec.lecturerId]
      );
    }
  }

  console.log(`Inserting ${store.enrollments?.length} enrollments...`);
  for (const e of store.enrollments || []) {
    await conn.query(
      "INSERT IGNORE INTO enrollments (enrollment_id, section_id, student_id) VALUES (?, ?, ?)",
      [e.id, e.sectionId, e.studentId]
    );
  }

  console.log(`Inserting ${store.attendance?.length} attendance records in batches...`);
  const BATCH_SIZE = 500;
  for (let i = 0; i < (store.attendance || []).length; i += BATCH_SIZE) {
    const batch = store.attendance.slice(i, i + BATCH_SIZE);
    const values = [];
    const placeholders = batch.map((a) => {
      values.push(a.id, a.sectionId, a.studentId, a.date || "2026-03-01", a.week, a.status, a.markedBy || 1, a.date ? a.date + " 10:00:00" : "2026-03-01 10:00:00");
      return "(?, ?, ?, ?, ?, ?, ?, ?)";
    }).join(", ");
    await conn.query(
      `INSERT IGNORE INTO attendance (attendance_id, section_id, student_id, attendance_date, week_no, status, recorded_by, recorded_time) VALUES ${placeholders}`,
      values
    );
  }

  for (const m of store.medicals || []) {
    await conn.query(
      `INSERT IGNORE INTO medical_reports 
      (medical_id, student_id, section_id, submission_date, from_date, to_date, note, review_status, reviewed_by, attachment_url, attachment_name, attachment_type) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [m.id, m.studentId, m.sectionId, m.submission, m.from, m.to, m.note, m.status || "Pending", m.reviewedBy, m.attachmentUrl, m.attachmentName, m.attachmentType]
    );
  }

  for (const a of store.alerts || []) {
    await conn.query(
      `INSERT IGNORE INTO alerts (alert_id, alert_type, student_id, section_id, triggered_date, message, severity, status) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [a.id, a.type, a.studentId, a.sectionId || null, a.date, a.message, a.severity || "medium", a.status || "open"]
    );
  }

  await conn.query("SET FOREIGN_KEY_CHECKS = 1;");

  console.log("\n================ MIGRATION SUCCESSFUL! ================");
  const [[{ uCount }]] = await conn.query("SELECT COUNT(*) as uCount FROM users");
  const [[{ sCount }]] = await conn.query("SELECT COUNT(*) as sCount FROM students");
  const [[{ cCount }]] = await conn.query("SELECT COUNT(*) as cCount FROM courses");
  const [[{ eCount }]] = await conn.query("SELECT COUNT(*) as eCount FROM enrollments");
  const [[{ aCount }]] = await conn.query("SELECT COUNT(*) as aCount FROM attendance");
  const [[{ mCount }]] = await conn.query("SELECT COUNT(*) as mCount FROM medical_reports");
  console.log(`Users: ${uCount}`);
  console.log(`Students: ${sCount}`);
  console.log(`Courses: ${cCount}`);
  console.log(`Enrollments: ${eCount}`);
  console.log(`Attendance Records: ${aCount}`);
  console.log(`Medical Reports: ${mCount}`);
  console.log("=======================================================\n");

  await conn.end();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
