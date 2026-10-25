import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "supabase.config.json");
const SCHEMA_PATH = path.join(__dirname, "schema.postgres.sql");

export function getPostgresConfig() {
  let fileConfig = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    } catch (e) {
      console.warn("Failed to parse supabase.config.json:", e.message);
    }
  }

  return {
    host: process.env.SUPABASE_HOST || fileConfig.host || "db.rleeygdtouvwskoxilfc.supabase.co",
    port: Number(process.env.SUPABASE_PORT || fileConfig.port || 5432),
    database: process.env.SUPABASE_DATABASE || fileConfig.database || "postgres",
    user: process.env.SUPABASE_USER || fileConfig.user || "postgres",
    password: process.env.SUPABASE_PASSWORD !== undefined ? process.env.SUPABASE_PASSWORD : (fileConfig.password || ""),
  };
}

export function savePostgresConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

let pool = null;
let isConnected = false;
let connectionError = null;

export async function connectPostgres(customConfig = null) {
  const cfg = customConfig || getPostgresConfig();
  connectionError = null;

  if (pool) {
    try { await pool.end(); } catch {}
    pool = null;
  }

  if (!cfg.password) {
    isConnected = false;
    connectionError = "Password required to connect to Supabase PostgreSQL.";
    return { success: false, error: connectionError };
  }

  try {
    pool = new Pool({
      host: cfg.host,
      port: cfg.port,
      database: cfg.database,
      user: cfg.user,
      password: cfg.password,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });

    const res = await pool.query("SELECT 1 AS ok");
    if (res.rows && res.rows[0]?.ok === 1) {
      isConnected = true;
      console.log(`[Supabase PostgreSQL] Connected to ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`);
      await applyPostgresSchema();
      return { success: true };
    }
  } catch (err) {
    isConnected = false;
    connectionError = err.message;
    console.warn(`[Supabase PostgreSQL] Connection error:`, err.message);
    return { success: false, error: err.message };
  }
}

export function getStatus() {
  const cfg = getPostgresConfig();
  return {
    connected: isConnected,
    database: cfg.database,
    host: cfg.host,
    user: cfg.user,
    error: connectionError,
  };
}

async function applyPostgresSchema() {
  if (!pool || !isConnected) return;
  try {
    if (fs.existsSync(SCHEMA_PATH)) {
      const sql = fs.readFileSync(SCHEMA_PATH, "utf8");
      await pool.query(sql);

      await pool.query(`
        INSERT INTO roles (role_code, label) VALUES
        ('hod', 'Head of Department'),
        ('lecturer', 'Lecturer'),
        ('visiting', 'Visiting Lecturer'),
        ('coordinator', 'VL Coordinator'),
        ('committee', 'Request Committee Member'),
        ('dean', 'Dean of Faculty'),
        ('student', 'Student')
        ON CONFLICT (role_code) DO NOTHING;
      `);
    }
  } catch (err) {
    console.warn("[Supabase Schema Notice]:", err.message);
  }
}

export async function syncFromStoreToPostgres(storeData) {
  if (!pool || !isConnected) return false;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const uRes = await client.query("SELECT COUNT(*) AS c FROM users");
    if (parseInt(uRes.rows[0]?.c, 10) > 0) {
      await client.query("COMMIT");
      return true;
    }

    console.log("[Supabase] Seeding store records into PostgreSQL...");

    if (storeData.department) {
      await client.query(
        "INSERT INTO departments (department_id, department_name, faculty) VALUES ($1, $2, $3) ON CONFLICT (department_id) DO NOTHING",
        [storeData.department.id || 1, storeData.department.name, storeData.department.faculty]
      );
    }

    for (const u of storeData.users || []) {
      await client.query(
        "INSERT INTO users (user_id, email, password_hash, role_code, display_name, status) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (user_id) DO NOTHING",
        [u.id, u.email, u.password, u.role, u.name, u.status || "active"]
      );
    }

    for (const s of storeData.semesters || []) {
      await client.query(
        `INSERT INTO semesters 
        (semester_id, semester_name, academic_year, start_date, end_date, week_count, current_week, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (semester_id) DO NOTHING`,
        [s.id, s.name, s.year, s.start, s.end, s.weekCount || 15, s.currentWeek || 1, s.status || "active"]
      );
    }

    for (const s of storeData.students || []) {
      await client.query(
        `INSERT INTO students 
        (student_id, user_id, registration_no, index_no, name_with_initials, phone_no, date_of_admission, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (student_id) DO NOTHING`,
        [s.id, s.userId, s.registrationNo, s.indexNo, s.name, s.phone || null, s.admission || null, s.status || "active"]
      );
    }

    for (const l of storeData.lecturers || []) {
      await client.query(
        `INSERT INTO lecturers 
        (lecturer_id, user_id, employee_no, name_with_initials, phone_no, qualification, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (lecturer_id) DO NOTHING`,
        [l.id, l.userId, l.employeeNo, l.name, l.phone || null, l.qualification || null, l.status || "active"]
      );
    }

    for (const c of storeData.courses || []) {
      await client.query(
        "INSERT INTO courses (course_id, course_code, course_name, credit_value, course_type) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (course_id) DO NOTHING",
        [c.id, c.code, c.name, c.credits, c.type]
      );
    }

    for (const sec of storeData.sections || []) {
      await client.query(
        `INSERT INTO course_sections 
        (section_id, course_id, semester_id, section_code, lecture_days, start_time, end_time, venue, frozen)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (section_id) DO NOTHING`,
        [sec.id, sec.courseId, sec.semesterId, sec.code || "", (sec.days || []).join(","), sec.start || "08:00", sec.end || "10:00", sec.venue || "Hall", sec.frozen ? true : false]
      );
    }

    for (const a of storeData.assignments || []) {
      await client.query(
        "INSERT INTO lecturer_assignments (assignment_id, section_id, lecturer_id) VALUES ($1, $2, $3) ON CONFLICT (section_id, lecturer_id) DO NOTHING",
        [a.id, a.sectionId, a.lecturerId]
      );
    }

    for (const e of storeData.enrollments || []) {
      await client.query(
        "INSERT INTO enrollments (enrollment_id, section_id, student_id) VALUES ($1, $2, $3) ON CONFLICT (section_id, student_id) DO NOTHING",
        [e.id, e.sectionId, e.studentId]
      );
    }

    for (const att of storeData.attendance || []) {
      await client.query(
        `INSERT INTO attendance 
        (attendance_id, section_id, student_id, attendance_date, week_no, status, recorded_by, recorded_time)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (student_id, section_id, attendance_date) DO UPDATE SET status = EXCLUDED.status, recorded_time = EXCLUDED.recorded_time`,
        [att.id, att.sectionId, att.studentId, att.date, att.weekNo, att.status, att.recordedBy || 1, att.recordedTime ? new Date(att.recordedTime) : new Date()]
      );
    }

    for (const m of storeData.medicals || []) {
      await client.query(
        `INSERT INTO medical_reports 
        (medical_id, student_id, section_id, submission_date, from_date, to_date, note, attachment_url, attachment_name, attachment_type, review_status, reviewed_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (medical_id) DO UPDATE SET review_status = EXCLUDED.review_status, reviewed_by = EXCLUDED.reviewed_by`,
        [m.id, m.studentId, m.sectionId, m.submission, m.from, m.to, m.note || null, m.attachmentUrl || null, m.attachmentName || null, m.attachmentType || null, m.status, m.reviewedBy]
      );
    }

    for (const r of storeData.requests || []) {
      await client.query(
        `INSERT INTO student_requests 
        (request_id, student_id, section_id, request_type, request_date, week_no, reason, status, recommendation, hod_decision)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (request_id) DO UPDATE SET status = EXCLUDED.status, recommendation = EXCLUDED.recommendation, hod_decision = EXCLUDED.hod_decision`,
        [r.id, r.studentId, r.sectionId, r.type, r.date || new Date().toISOString().slice(0, 10), r.weekNo || 1, r.reason, r.status, r.recommendation || null, r.hodDecision || null]
      );
    }

    await client.query("COMMIT");
    console.log("[Supabase] Seeding completed successfully!");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    console.warn("[Supabase Sync Error]:", err.message);
    return false;
  } finally {
    client.release();
  }
}
