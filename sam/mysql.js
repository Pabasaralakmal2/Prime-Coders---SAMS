import mysql from "mysql2/promise";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "mysql.config.json");
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

export function getMySQLConfig() {
  let fileConfig = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    } catch (e) {
      console.warn("Failed to parse mysql.config.json:", e.message);
    }
  }

  return {
    host: process.env.MYSQL_HOST || fileConfig.host || "localhost",
    port: Number(process.env.MYSQL_PORT || fileConfig.port || 3306),
    user: process.env.MYSQL_USER || fileConfig.user || "root",
    password: process.env.MYSQL_PASSWORD !== undefined ? process.env.MYSQL_PASSWORD : (fileConfig.password || ""),
    database: process.env.MYSQL_DATABASE || fileConfig.database || "prime_coders_attendance",
  };
}

export function saveMySQLConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

let pool = null;
let isConnected = false;
let connectionError = null;

export async function connectMySQL(customConfig = null) {
  const cfg = customConfig || getMySQLConfig();
  connectionError = null;
  const sslOpt = cfg.ssl || (cfg.host && (cfg.host.includes("aivencloud") || cfg.host.includes(".com") || cfg.host.includes(".net")) ? { rejectUnauthorized: false } : undefined);

  try {
    // Try to ensure database exists (works on local MySQL, gracefully skips on managed cloud MySQL)
    try {
      const rootConn = await mysql.createConnection({
        host: cfg.host,
        port: cfg.port,
        user: cfg.user,
        password: cfg.password,
        ssl: sslOpt,
        connectTimeout: 5000,
      });
      await rootConn.query(
        `CREATE DATABASE IF NOT EXISTS \`${cfg.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
      );
      await rootConn.end();
    } catch (_) {
      // Cloud providers like Aiven already have the database created
    }

    // Now create pool with database
    pool = mysql.createPool({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      ssl: sslOpt,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      multipleStatements: true,
    });

    // Test query
    const [rows] = await pool.query("SELECT 1 AS ok");
    if (rows && rows[0]?.ok === 1) {
      isConnected = true;
      console.log(`[MySQL] Successfully connected to ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`);
      
      // Ensure tables exist
      await applySchema();
      return { success: true };
    }
  } catch (err) {
    isConnected = false;
    connectionError = err.message;
    console.warn(`[MySQL] Connection failed:`, err.message);
    return { success: false, error: err.message };
  }
}

export function getStatus() {
  const cfg = getMySQLConfig();
  return {
    connected: isConnected,
    database: cfg.database,
    host: cfg.host,
    port: cfg.port || 3306,
    user: cfg.user,
    error: connectionError,
  };
}

async function applySchema() {
  if (!pool) return;
  try {
    if (fs.existsSync(SCHEMA_PATH)) {
      let sql = fs.readFileSync(SCHEMA_PATH, "utf8");
      // Strip line comments and block comments
      sql = sql
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/--.*$/gm, "")
        .replace(/CREATE DATABASE[\s\S]*?;/gi, "")
        .replace(/USE [\s\S]*?;/gi, "");

      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      await pool.query("SET FOREIGN_KEY_CHECKS = 0;");

      for (const statement of statements) {
        try {
          await pool.query(statement);
        } catch (stmtErr) {
          if (!stmtErr.message.includes("already exists") && !stmtErr.message.includes("Duplicate")) {
            console.warn("[MySQL Schema Notice]", stmtErr.message.slice(0, 100));
          }
        }
      }

      await pool.query("SET FOREIGN_KEY_CHECKS = 1;");

      // Ensure standard roles exist
      await pool.query(`
        INSERT IGNORE INTO roles (role_code, label) VALUES
        ('hod', 'Head of Department'),
        ('lecturer', 'Lecturer'),
        ('visiting', 'Visiting Lecturer'),
        ('coordinator', 'VL Coordinator'),
        ('committee', 'Request Committee Member'),
        ('dean', 'Dean of Faculty'),
        ('student', 'Student');
      `);
    }
  } catch (err) {
    console.warn("[MySQL applySchema error]:", err.message);
  }
}

export async function syncFromStoreToMySQL(storeData) {
  if (!pool || !isConnected) return false;
  try {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Check if users table already has records
      const [uRows] = await conn.query("SELECT COUNT(*) AS c FROM users");
      if (uRows[0]?.c > 0) {
        await conn.commit();
        return true; // Already seeded
      }

      console.log("[MySQL] Seeding data from store into MySQL...");

      // Department
      if (storeData.department) {
        await conn.query(
          "INSERT IGNORE INTO departments (department_id, department_name, faculty) VALUES (?, ?, ?)",
          [storeData.department.id || 1, storeData.department.name, storeData.department.faculty]
        );
      }

      // Users
      for (const u of storeData.users || []) {
        await conn.query(
          "INSERT IGNORE INTO users (user_id, email, password_hash, role_code, display_name, status) VALUES (?, ?, ?, ?, ?, ?)",
          [u.id, u.email, u.password, u.role, u.name, u.status || "active"]
        );
      }

      // Semesters
      for (const s of storeData.semesters || []) {
        await conn.query(
          `INSERT IGNORE INTO semesters 
          (semester_id, semester_name, academic_year, start_date, end_date, week_count, current_week, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [s.id, s.name, s.year, s.start, s.end, s.weekCount || 15, s.currentWeek || 1, s.status || "active"]
        );
      }

      // Students
      for (const s of storeData.students || []) {
        await conn.query(
          `INSERT IGNORE INTO students 
          (student_id, user_id, registration_no, index_no, name_with_initials, phone_no, date_of_admission, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [s.id, s.userId, s.registrationNo, s.indexNo, s.name, s.phone || null, s.admission || null, s.status || "active"]
        );
      }

      // Lecturers
      for (const l of storeData.lecturers || []) {
        await conn.query(
          `INSERT IGNORE INTO lecturers 
          (lecturer_id, user_id, employee_no, name_with_initials, phone_no, qualification, status)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [l.id, l.userId, l.employeeNo, l.name, l.phone || null, l.qualification || null, l.status || "active"]
        );
      }

      // Committees
      if (storeData.committee) {
        await conn.query(
          "INSERT IGNORE INTO committees (committee_id, committee_name, description) VALUES (?, ?, ?)",
          [storeData.committee.id || 1, storeData.committee.name, storeData.committee.description]
        );
      }
      if (storeData.committeeMember) {
        await conn.query(
          "INSERT IGNORE INTO committee_members (member_id, user_id, committee_id, name_with_initials, role_title) VALUES (?, ?, ?, ?, ?)",
          [storeData.committeeMember.id || 1, storeData.committeeMember.userId, storeData.committeeMember.committeeId, storeData.committeeMember.name, storeData.committeeMember.roleTitle]
        );
      }

      // HOD
      if (storeData.hod) {
        await conn.query(
          "INSERT IGNORE INTO hods (hod_id, user_id, department_id, name_with_initials) VALUES (?, ?, ?, ?)",
          [storeData.hod.id || 1, storeData.hod.userId, storeData.hod.departmentId, storeData.hod.name]
        );
      }

      // Courses
      for (const c of storeData.courses || []) {
        await conn.query(
          "INSERT IGNORE INTO courses (course_id, course_code, course_name, credit_value, course_type) VALUES (?, ?, ?, ?, ?)",
          [c.id, c.code, c.name, c.credits, c.type]
        );
      }

      // Sections
      for (const sec of storeData.sections || []) {
        await conn.query(
          `INSERT IGNORE INTO course_sections 
          (section_id, course_id, semester_id, section_code, lecture_days, start_time, end_time, venue, frozen)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [sec.id, sec.courseId, sec.semesterId, sec.code, (sec.days || []).join(", "), sec.start || "08:30:00", sec.end || "10:30:00", sec.venue, sec.frozen ? 1 : 0]
        );
      }

      // Assignments
      for (const a of storeData.assignments || []) {
        await conn.query(
          "INSERT IGNORE INTO lecturer_assignments (assignment_id, section_id, lecturer_id) VALUES (?, ?, ?)",
          [a.id, a.sectionId, a.lecturerId]
        );
      }

      // Enrollments
      for (const e of storeData.enrollments || []) {
        await conn.query(
          "INSERT IGNORE INTO enrollments (enrollment_id, section_id, student_id) VALUES (?, ?, ?)",
          [e.id, e.sectionId, e.studentId]
        );
      }

      // Attendance
      for (const att of storeData.attendance || []) {
        await conn.query(
          `INSERT IGNORE INTO attendance 
          (attendance_id, section_id, student_id, attendance_date, week_no, status, recorded_by, recorded_time)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [att.id, att.sectionId, att.studentId, att.date, att.weekNo, att.status, att.recordedBy || 1, att.recordedTime || new Date()]
        );
      }

      // Medicals
      for (const m of storeData.medicals || []) {
        await conn.query(
          `INSERT IGNORE INTO medical_reports 
          (medical_id, student_id, section_id, submission_date, from_date, to_date, note, review_status, reviewed_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [m.id, m.studentId, m.sectionId, m.date || m.from, m.from, m.to, m.note || null, m.status || "Pending", m.reviewedBy || null]
        );
      }

      // Requests
      for (const r of storeData.requests || []) {
        await conn.query(
          `INSERT IGNORE INTO student_requests 
          (request_id, student_id, section_id, request_type, request_date, week_no, reason, status, recommendation, hod_decision)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [r.id, r.studentId, r.sectionId, r.type, r.date || "2026-02-20", r.weekNo || 1, r.reason, r.status, r.recommendation || null, r.hodDecision || null]
        );
      }

      // Alerts
      for (const al of storeData.alerts || []) {
        await conn.query(
          `INSERT IGNORE INTO alerts 
          (alert_id, alert_type, alert_date, student_id, section_id, target_role, message, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [al.id, al.type, al.date, al.studentId, al.sectionId || null, al.targetRole, al.message, al.status]
        );
      }

      await conn.commit();
      console.log("[MySQL] Seeding completed successfully.");
      return true;
    } catch (txErr) {
      await conn.rollback();
      console.warn("[MySQL] Seeding transaction error:", txErr.message);
      return false;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.warn("[MySQL] Sync error:", err.message);
    return false;
  }
}

export async function persistAttendanceMark(sectionId, studentId, weekNo, status, recordedBy, date) {
  if (!pool || !isConnected) return;
  try {
    await pool.query(
      `INSERT INTO attendance (section_id, student_id, week_no, status, recorded_by, recorded_time, attendance_date)
       VALUES (?, ?, ?, ?, ?, NOW(), ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), recorded_by = VALUES(recorded_by), recorded_time = NOW()`,
      [sectionId, studentId, weekNo, status, recordedBy, date]
    );
  } catch (e) {
    console.warn("[MySQL] persistAttendanceMark error:", e.message);
  }
}
