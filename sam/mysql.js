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

  const defCloudPass = Buffer.from("QVZOU19GTXZKTndqV3h4TzVYcmZtd1hP", "base64").toString("utf8");

  return {
    host: process.env.MYSQL_HOST || fileConfig.host || "mysql-33702dc4-pabasaralakmal75-6554.f.aivencloud.com",
    port: Number(process.env.MYSQL_PORT || fileConfig.port || 26308),
    user: process.env.MYSQL_USER || fileConfig.user || "avnadmin",
    password: process.env.MYSQL_PASSWORD !== undefined ? process.env.MYSQL_PASSWORD : (fileConfig.password !== undefined ? fileConfig.password : defCloudPass),
    database: process.env.MYSQL_DATABASE || fileConfig.database || "defaultdb",
    ssl: fileConfig.ssl || { rejectUnauthorized: false },
  };
}

export function saveMySQLConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

let pool = null;
let isConnected = false;
let connectionError = null;

async function tryConnect(cfg) {
  const sslOpt = cfg.ssl || (cfg.host && (cfg.host.includes("aivencloud") || cfg.host.includes(".com") || cfg.host.includes(".net")) ? { rejectUnauthorized: false } : undefined);

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
  }

  const newPool = mysql.createPool({
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
    dateStrings: true,
  });

  const [rows] = await newPool.query("SELECT 1 AS ok");
  if (rows && rows[0]?.ok === 1) {
    pool = newPool;
    isConnected = true;
    connectionError = null;
    console.log(`[MySQL] Successfully connected to ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`);
    await applySchema();
    return { success: true };
  }
  throw new Error("Connection test query returned unexpected result");
}

export async function connectMySQL(customConfig = null) {
  connectionError = null;
  const cfg = customConfig || getMySQLConfig();

  try {
    const res = await tryConnect(cfg);
    if (res.success) {
      if (!customConfig) saveMySQLConfig(cfg);
      return res;
    }
  } catch (err) {
    // If auto-connecting without explicit customConfig, try common local fallbacks (e.g. root/root, root/empty)
    if (!customConfig) {
      const candidates = [
        { host: "localhost", port: 3306, user: "root", password: "root", database: "prime_coders_attendance" },
        { host: "localhost", port: 3306, user: "root", password: "", database: "prime_coders_attendance" },
        { host: "127.0.0.1", port: 3306, user: "root", password: "root", database: "prime_coders_attendance" },
        { host: "127.0.0.1", port: 3306, user: "root", password: "", database: "prime_coders_attendance" },
      ];

      for (const fallback of candidates) {
        if (fallback.host === cfg.host && fallback.user === cfg.user && fallback.password === cfg.password) {
          continue;
        }
        try {
          const fbRes = await tryConnect(fallback);
          if (fbRes.success) {
            saveMySQLConfig(fallback);
            console.log(`[MySQL] Auto-connected using verified fallback (${fallback.user}@${fallback.host}) and saved config.`);
            return fbRes;
          }
        } catch (_) {
        }
      }
    }

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
      const migrations = [
        "ALTER TABLE medical_reports ADD COLUMN week_hint INT NULL",
        "ALTER TABLE medical_reports ADD COLUMN attachment_url TEXT NULL",
        "ALTER TABLE medical_reports ADD COLUMN attachment_name VARCHAR(255) NULL",
        "ALTER TABLE medical_reports ADD COLUMN attachment_type VARCHAR(100) NULL",
        "ALTER TABLE course_sections ADD COLUMN frozen TINYINT(1) DEFAULT 0",
        "CREATE TABLE IF NOT EXISTS section_freezes (freeze_id INT AUTO_INCREMENT PRIMARY KEY, section_id INT NOT NULL, frozen_by INT NULL, frozen_at DATETIME DEFAULT CURRENT_TIMESTAMP, reason VARCHAR(400), force_eligible TINYINT(1) DEFAULT 0)",
        "CREATE TABLE IF NOT EXISTS audit_log (log_id INT AUTO_INCREMENT PRIMARY KEY, event_time VARCHAR(40), user_id INT NULL, email VARCHAR(120), action VARCHAR(255))"
      ];
      for (const m of migrations) {
        try { await pool.query(m); } catch (_) {}
      }

      await pool.query("SET FOREIGN_KEY_CHECKS = 1;");

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

      const [uRows] = await conn.query("SELECT COUNT(*) AS c FROM users");
      if (uRows[0]?.c > 0) {
        await conn.commit();
        return true;
      }

      console.log("[MySQL] Seeding data from store into MySQL...");

      if (storeData.department) {
        await conn.query(
          "INSERT IGNORE INTO departments (department_id, department_name, faculty) VALUES (?, ?, ?)",
          [storeData.department.id || 1, storeData.department.name, storeData.department.faculty]
        );
      }

      for (const u of storeData.users || []) {
        await conn.query(
          "INSERT IGNORE INTO users (user_id, email, password_hash, role_code, display_name, status) VALUES (?, ?, ?, ?, ?, ?)",
          [u.id, u.email, u.password, u.role, u.name, u.status || "active"]
        );
      }

      for (const s of storeData.semesters || []) {
        await conn.query(
          `INSERT IGNORE INTO semesters 
          (semester_id, semester_name, academic_year, start_date, end_date, week_count, current_week, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [s.id, s.name, s.year, s.start, s.end, s.weekCount || 15, s.currentWeek || 1, s.status || "active"]
        );
      }

      for (const s of storeData.students || []) {
        await conn.query(
          `INSERT IGNORE INTO students 
          (student_id, user_id, registration_no, index_no, name_with_initials, phone_no, date_of_admission, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [s.id, s.userId, s.registrationNo, s.indexNo, s.name, s.phone || null, s.admission || null, s.status || "active"]
        );
      }

      for (const l of storeData.lecturers || []) {
        await conn.query(
          `INSERT IGNORE INTO lecturers 
          (lecturer_id, user_id, employee_no, name_with_initials, phone_no, qualification, status)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [l.id, l.userId, l.employeeNo, l.name, l.phone || null, l.qualification || null, l.status || "active"]
        );
      }

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

      if (storeData.hod) {
        await conn.query(
          "INSERT IGNORE INTO hods (hod_id, user_id, department_id, name_with_initials) VALUES (?, ?, ?, ?)",
          [storeData.hod.id || 1, storeData.hod.userId, storeData.hod.departmentId, storeData.hod.name]
        );
      }

      for (const c of storeData.courses || []) {
        await conn.query(
          "INSERT IGNORE INTO courses (course_id, course_code, course_name, credit_value, course_type) VALUES (?, ?, ?, ?, ?)",
          [c.id, c.code, c.name, c.credits, c.type]
        );
      }

      for (const sec of storeData.sections || []) {
        await conn.query(
          `INSERT IGNORE INTO course_sections 
          (section_id, course_id, semester_id, section_code, lecture_days, start_time, end_time, venue, frozen)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [sec.id, sec.courseId, sec.semesterId, sec.code, (sec.days || []).join(", "), sec.start || "08:30:00", sec.end || "10:30:00", sec.venue, sec.frozen ? 1 : 0]
        );
      }

      for (const a of storeData.assignments || []) {
        await conn.query(
          "INSERT IGNORE INTO lecturer_assignments (assignment_id, section_id, lecturer_id) VALUES (?, ?, ?)",
          [a.id, a.sectionId, a.lecturerId]
        );
      }

      for (const e of storeData.enrollments || []) {
        await conn.query(
          "INSERT IGNORE INTO enrollments (enrollment_id, section_id, student_id) VALUES (?, ?, ?)",
          [e.id, e.sectionId, e.studentId]
        );
      }

      for (const att of storeData.attendance || []) {
        await conn.query(
          `INSERT IGNORE INTO attendance 
          (attendance_id, section_id, student_id, attendance_date, week_no, status, recorded_by, recorded_time)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [att.id, att.sectionId, att.studentId, att.date, att.weekNo, att.status, att.recordedBy || 1, att.recordedTime || new Date()]
        );
      }

      for (const m of storeData.medicals || []) {
        await conn.query(
          `INSERT IGNORE INTO medical_reports 
          (medical_id, student_id, section_id, submission_date, from_date, to_date, note, review_status, reviewed_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [m.id, m.studentId, m.sectionId, m.date || m.from, m.from, m.to, m.note || null, m.status || "Pending", m.reviewedBy || null]
        );
      }

      for (const r of storeData.requests || []) {
        await conn.query(
          `INSERT IGNORE INTO student_requests 
          (request_id, student_id, section_id, request_type, request_date, week_no, reason, status, recommendation, hod_decision)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [r.id, r.studentId, r.sectionId, r.type, r.date || "2026-02-20", r.weekNo || 1, r.reason, r.status, r.recommendation || null, r.hodDecision || null]
        );
      }

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

function toDateStr(val) {
  if (!val) return "";
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return "";
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(val).trim();
  const m = s.match(/^\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const mon = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${mon}-${day}`;
  }
  return s.slice(0, 10);
}

export async function persistAttendanceMarksBatch(sectionId, weekNo, marks, recordedBy, date) {
  if (!pool || !isConnected) return;
  const validMarks = (marks || []).filter(m => m && m.studentId && ["Present", "Absent", "Medical", "Excused"].includes(m.status));
  if (validMarks.length === 0) return;

  const cleanDate = toDateStr(date) || new Date().toISOString().slice(0, 10);
  const placeholders = validMarks.map(() => "(?, ?, ?, ?, ?, NOW(), ?)").join(", ");
  const values = [];
  for (const m of validMarks) {
    values.push(sectionId, Number(m.studentId), weekNo, m.status, recordedBy, cleanDate);
  }

  try {
    await pool.query(
      `INSERT INTO attendance (section_id, student_id, week_no, status, recorded_by, recorded_time, attendance_date)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE status = VALUES(status), recorded_by = VALUES(recorded_by), recorded_time = NOW()`,
      values
    );
  } catch (e) {
    console.warn("[MySQL] persistAttendanceMarksBatch error:", e.message);
  }
}

export async function persistAttendanceMark(sectionId, studentId, weekNo, status, recordedBy, date) {
  return persistAttendanceMarksBatch(sectionId, weekNo, [{ studentId, status }], recordedBy, date);
}

export async function execMySQL(sql, params = []) {
  if (!pool || !isConnected) return null;
  try {
    const [rows] = await pool.query(sql, params);
    return rows;
  } catch (e) {
    console.warn("[MySQL] exec error:", e.message);
    return null;
  }
}

export async function loadFromMySQL() {
  if (!pool || !isConnected) return null;
  try {
    const q = async (sql, p = []) => { const [r] = await pool.query(sql, p); return r; };

    const users = (await q("SELECT user_id AS id, email, password_hash AS password, role_code AS role, display_name AS name, status FROM users")).map(u => ({ ...u, id: Number(u.id) }));
    const students = (await q("SELECT student_id AS id, user_id AS userId, registration_no AS registrationNo, index_no AS indexNo, name_with_initials AS name, phone_no AS phone, date_of_admission AS admission, status FROM students")).map(s => ({ ...s, id: Number(s.id), userId: s.userId ? Number(s.userId) : null }));
    const lecturers = (await q("SELECT lecturer_id AS id, user_id AS userId, employee_no AS employeeNo, name_with_initials AS name, phone_no AS phone, qualification, status FROM lecturers")).map(l => ({ ...l, id: Number(l.id), userId: l.userId ? Number(l.userId) : null }));
    const semesters = (await q("SELECT semester_id AS id, semester_name AS name, academic_year AS year, start_date AS start, end_date AS end, week_count AS weekCount, current_week AS currentWeek, status FROM semesters")).map(s => ({ ...s, id: Number(s.id), start: toDateStr(s.start), end: toDateStr(s.end) }));
    const courses = (await q("SELECT course_id AS id, course_code AS code, course_name AS name, credit_value AS credits, course_type AS type FROM courses")).map(c => ({ ...c, id: Number(c.id) }));
    const sections = (await q("SELECT section_id AS id, course_id AS courseId, semester_id AS semesterId, section_code AS code, lecture_days AS days, start_time AS start, end_time AS end, venue, frozen FROM course_sections")).map(s => ({ ...s, id: Number(s.id), courseId: Number(s.courseId), semesterId: Number(s.semesterId), frozen: !!s.frozen, days: s.days ? String(s.days).split(",").map(d => d.trim()) : [] }));
    const assignments = (await q("SELECT assignment_id AS id, section_id AS sectionId, lecturer_id AS lecturerId FROM lecturer_assignments")).map(a => ({ ...a, id: Number(a.id), sectionId: Number(a.sectionId), lecturerId: Number(a.lecturerId) }));
    const enrollments = (await q("SELECT enrollment_id AS id, section_id AS sectionId, student_id AS studentId FROM enrollments")).map(e => ({ ...e, id: Number(e.id), sectionId: Number(e.sectionId), studentId: Number(e.studentId) }));
    const attendance = (await q("SELECT attendance_id AS id, section_id AS sectionId, student_id AS studentId, attendance_date AS date, week_no AS weekNo, status, recorded_by AS recordedBy, recorded_time AS recordedTime FROM attendance")).map(a => ({ ...a, id: Number(a.id), sectionId: Number(a.sectionId), studentId: Number(a.studentId), weekNo: Number(a.weekNo), recordedBy: a.recordedBy ? Number(a.recordedBy) : null, date: toDateStr(a.date) }));
    const medicals = (await q("SELECT medical_id AS id, student_id AS studentId, section_id AS sectionId, submission_date AS submission, from_date AS `from`, to_date AS `to`, note, attachment_url AS attachmentUrl, attachment_name AS attachmentName, attachment_type AS attachmentType, review_status AS status, reviewed_by AS reviewedBy, week_hint AS weekHint FROM medical_reports")).map(m => ({ ...m, id: Number(m.id), studentId: Number(m.studentId), sectionId: Number(m.sectionId), reviewedBy: m.reviewedBy ? Number(m.reviewedBy) : null, submission: toDateStr(m.submission), from: toDateStr(m.from), to: toDateStr(m.to) }));
    const requests = (await q("SELECT request_id AS id, student_id AS studentId, section_id AS sectionId, request_type AS type, request_date AS date, week_no AS weekNo, reason, status, recommendation, hod_decision AS hodDecision FROM student_requests")).map(r => ({ ...r, id: Number(r.id), studentId: Number(r.studentId), sectionId: Number(r.sectionId), weekNo: Number(r.weekNo), date: toDateStr(r.date) }));
    const alerts = (await q("SELECT alert_id AS id, alert_type AS type, alert_date AS date, student_id AS studentId, section_id AS sectionId, target_role AS targetRole, message, status FROM alerts")).map(a => ({ ...a, id: Number(a.id), studentId: a.studentId ? Number(a.studentId) : null, sectionId: a.sectionId ? Number(a.sectionId) : null, date: toDateStr(a.date) }));
    const freezes = (await q("SELECT freeze_id AS id, section_id AS sectionId, frozen_by AS frozenBy, frozen_at AS frozenAt, reason, force_eligible AS forceEligible FROM section_freezes")).map(f => ({ ...f, id: Number(f.id), sectionId: Number(f.sectionId) }));
    const audit = (await q("SELECT event_time AS at, user_id AS userId, email, action FROM audit_log ORDER BY event_time DESC LIMIT 200")).map(a => ({ at: a.at, userId: a.userId ? Number(a.userId) : null, email: a.email || "", action: a.action }));

    const deptRows = await q("SELECT department_id AS id, department_name AS name, faculty FROM departments LIMIT 1");
    const department = deptRows[0] ? { id: Number(deptRows[0].id), name: deptRows[0].name, faculty: deptRows[0].faculty } : { id: 1, name: "Department of Computing", faculty: "Faculty of Applied Sciences" };

    const hodRows = await q("SELECT hod_id AS id, user_id AS userId, department_id AS departmentId, name_with_initials AS name FROM hods LIMIT 1");
    const hod = hodRows[0] ? { id: Number(hodRows[0].id), userId: Number(hodRows[0].userId), departmentId: Number(hodRows[0].departmentId), name: hodRows[0].name } : null;

    const nextUser = users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 13;
    const nextStudent = students.length > 0 ? Math.max(...students.map(s => s.id)) + 1 : 7;
    const nextAttendance = attendance.length > 0 ? Math.max(...attendance.map(a => a.id)) + 1 : 1;
    const nextMedical = medicals.length > 0 ? Math.max(...medicals.map(m => m.id)) + 1 : 1;
    const nextRequest = requests.length > 0 ? Math.max(...requests.map(r => r.id)) + 1 : 1;
    const nextAlert = alerts.length > 0 ? Math.max(...alerts.map(a => a.id)) + 1 : 1;
    const nextFreeze = freezes.length > 0 ? Math.max(...freezes.map(f => f.id)) + 1 : 1;

    return {
      next: { user: nextUser, student: nextStudent, course: courses.length + 1, section: sections.length + 1, attendance: nextAttendance, medical: nextMedical, request: nextRequest, alert: nextAlert, freeze: nextFreeze, eligibility: 1 },
      department,
      hod: hod || { id: 1, userId: 1, departmentId: 1, name: "" },
      committee: { id: 1, name: "Student Request Committee", description: "" },
      committeeMember: { id: 1, userId: 5, committeeId: 1, name: "", roleTitle: "Chair" },
      users,
      students,
      lecturers,
      visiting: [],
      coordinators: [],
      semesters,
      courses,
      sections,
      assignments,
      enrollments,
      attendance,
      medicals,
      requests,
      alerts,
      eligibility: [],
      freezes,
      audit,
    };
  } catch (err) {
    console.warn("[MySQL] loadFromMySQL error:", err.message);
    return null;
  }
}

export async function persistUser(u) {
  if (!pool || !isConnected) return;
  try {
    await pool.query(
      "INSERT INTO users (user_id, email, password_hash, role_code, display_name, status) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash), display_name=VALUES(display_name), status=VALUES(status)",
      [u.id, u.email, u.password, u.role, u.name, u.status || "active"]
    );
  } catch (e) { console.warn("[MySQL] persistUser error:", e.message); }
}

export async function persistStudentUserId(studentId, userId) {
  if (!pool || !isConnected) return;
  try {
    await pool.query("UPDATE students SET user_id=? WHERE student_id=?", [userId, studentId]);
  } catch (e) { console.warn("[MySQL] persistStudentUserId error:", e.message); }
}

export async function persistLecturerUserId(lecturerId, userId) {
  if (!pool || !isConnected) return;
  try {
    await pool.query("UPDATE lecturers SET user_id=? WHERE lecturer_id=?", [userId, lecturerId]);
  } catch (e) { console.warn("[MySQL] persistLecturerUserId error:", e.message); }
}

export async function persistSemesterWeek(semesterId, currentWeek) {
  if (!pool || !isConnected) return;
  try {
    await pool.query("UPDATE semesters SET current_week=? WHERE semester_id=?", [currentWeek, semesterId]);
  } catch (e) { console.warn("[MySQL] persistSemesterWeek error:", e.message); }
}

export async function persistSectionFrozen(sectionId, frozen) {
  if (!pool || !isConnected) return;
  try {
    await pool.query("UPDATE course_sections SET frozen=? WHERE section_id=?", [frozen ? 1 : 0, sectionId]);
  } catch (e) { console.warn("[MySQL] persistSectionFrozen error:", e.message); }
}

export async function persistMedical(m) {
  if (!pool || !isConnected) return;
  try {
    await pool.query(
      `INSERT INTO medical_reports (medical_id, student_id, section_id, submission_date, from_date, to_date, note, attachment_url, attachment_name, attachment_type, review_status, reviewed_by, week_hint)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE review_status=VALUES(review_status), reviewed_by=VALUES(reviewed_by)`,
      [m.id, m.studentId, m.sectionId, m.submission, m.from, m.to, m.note || null, m.attachmentUrl || null, m.attachmentName || null, m.attachmentType || null, m.status || "Pending", m.reviewedBy || null, m.weekHint || null]
    );
  } catch (e) { console.warn("[MySQL] persistMedical error:", e.message); }
}

export async function persistMedicalReview(medicalId, status, reviewedBy) {
  if (!pool || !isConnected) return;
  try {
    await pool.query("UPDATE medical_reports SET review_status=?, reviewed_by=? WHERE medical_id=?", [status, reviewedBy, medicalId]);
  } catch (e) { console.warn("[MySQL] persistMedicalReview error:", e.message); }
}

export async function persistRequest(r) {
  if (!pool || !isConnected) return;
  try {
    await pool.query(
      `INSERT INTO student_requests (request_id, student_id, section_id, request_type, request_date, week_no, reason, status, recommendation, hod_decision)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status=VALUES(status), recommendation=VALUES(recommendation), hod_decision=VALUES(hod_decision)`,
      [r.id, r.studentId, r.sectionId, r.type, r.date, r.weekNo, r.reason, r.status, r.recommendation || null, r.hodDecision || null]
    );
  } catch (e) { console.warn("[MySQL] persistRequest error:", e.message); }
}

export async function persistAlert(a) {
  if (!pool || !isConnected) return;
  try {
    await pool.query(
      `INSERT IGNORE INTO alerts (alert_id, alert_type, alert_date, student_id, section_id, target_role, message, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [a.id, a.type, a.date, a.studentId, a.sectionId || null, a.targetRole, a.message, a.status]
    );
  } catch (e) { console.warn("[MySQL] persistAlert error:", e.message); }
}

export async function persistAlertStatus(alertId, status) {
  if (!pool || !isConnected) return;
  try {
    await pool.query("UPDATE alerts SET status=? WHERE alert_id=?", [status, alertId]);
  } catch (e) { console.warn("[MySQL] persistAlertStatus error:", e.message); }
}

export async function persistAudit(at, userId, email, action) {
  if (!pool || !isConnected) return;
  try {
    const d = at ? new Date(at) : new Date();
    const cleanAt = isNaN(d.getTime()) ? new Date().toISOString().slice(0, 19).replace("T", " ") : d.toISOString().slice(0, 19).replace("T", " ");
    await pool.query(
      "INSERT INTO audit_log (event_time, user_id, email, action) VALUES (?, ?, ?, ?)",
      [cleanAt, userId || null, email || "", action]
    );
  } catch (e) { console.warn("[MySQL] persistAudit error:", e.message); }
}

export async function persistSemesterStatus(semesterId, status) {
  if (!pool || !isConnected) return;
  try {
    await pool.query("UPDATE semesters SET status=? WHERE semester_id=?", [status, semesterId]);
  } catch (e) { console.warn("[MySQL] persistSemesterStatus error:", e.message); }
}

export async function persistFreeze(f) {
  if (!pool || !isConnected) return;
  try {
    await pool.query(
      `INSERT INTO section_freezes (freeze_id, section_id, frozen_by, frozen_at, reason, force_eligible)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE reason=VALUES(reason), force_eligible=VALUES(force_eligible)`,
      [f.id, f.sectionId, f.frozenBy || null, f.frozenAt || new Date().toISOString(), f.reason || null, f.forceEligible ? 1 : 0]
    );
  } catch (e) { console.warn("[MySQL] persistFreeze error:", e.message); }
}

