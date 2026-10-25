import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { connectMySQL, getStatus as getMySQLStatus, syncFromStoreToMySQL, saveMySQLConfig, persistAttendanceMark } from "./mysql.js";
import { connectPostgres, getStatus as getPostgresStatus, syncFromStoreToPostgres, savePostgresConfig } from "./postgres.js";
import { parseExcelWorkbook, importExcelDataIntoDb } from "./excel-importer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = fs.existsSync(path.join(__dirname, "..", "public", "index.html")) ? path.join(__dirname, "..", "public") : path.join(__dirname, "public");
const STORE = path.join(__dirname, "data", "store.json");
const PORT = process.env.PORT || 8080;
const HOST = "0.0.0.0";
const SECRET = "prime-coders-sam-demo";

// Supabase Storage config
function getSupabaseStorageConfig() {
  let fileCfg = {};
  try {
    fileCfg = JSON.parse(fs.readFileSync(path.join(__dirname, "supabase.config.json"), "utf8"));
  } catch (_) { /* no config yet */ }
  return {
    projectUrl: process.env.SUPABASE_PROJECT_URL || fileCfg.projectUrl,
    anonKey: process.env.SUPABASE_ANON_KEY || fileCfg.anonKey,
    storageBucket: process.env.SUPABASE_STORAGE_BUCKET || fileCfg.storageBucket || "Medicals",
  };
}

/**
 * Upload a Buffer to Supabase Storage and return the public URL.
 * Resolves to null if config is missing or upload fails (falls back silently).
 */
function uploadToSupabaseStorage(fileBuffer, fileName, mimeType) {
  const cfg = getSupabaseStorageConfig();
  return new Promise((resolve) => {
    if (!cfg?.projectUrl || !cfg?.anonKey || !cfg?.storageBucket) {
      resolve(null);
      return;
    }
    const bucket = encodeURIComponent(cfg.storageBucket);
    const safeName = Date.now() + "_" + path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
    const urlPath = `/storage/v1/object/${bucket}/${safeName}`;
    const projectHost = cfg.projectUrl.replace(/^https?:\/\//, "");
    const options = {
      hostname: projectHost,
      path: urlPath,
      method: "POST",
      headers: {
        "Authorization": `Bearer ${_sbCfg.anonKey}`,
        "apikey": _sbCfg.anonKey,
        "Content-Type": mimeType || "application/octet-stream",
        "Content-Length": fileBuffer.length,
        "x-upsert": "true",
      },
    };
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (c) => body += c);
      res.on("end", () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          const publicUrl = `${_sbCfg.projectUrl}/storage/v1/object/public/${_sbCfg.storageBucket}/${safeName}`;
          resolve({ publicUrl, safeName });
        } else {
          console.error("[Supabase Storage] upload failed:", res.statusCode, body);
          resolve(null);
        }
      });
    });
    req.on("error", (e) => { console.error("[Supabase Storage] request error:", e.message); resolve(null); });
    req.write(fileBuffer);
    req.end();
  });
}

const sessions = new Map();

function hashPassword(password, salt = crypto.randomBytes(8).toString("hex")) {
  const hash = crypto.createHash("sha256").update(salt + password).digest("hex");
  return `${salt}:${hash}`;
}
function checkPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const next = crypto.createHash("sha256").update(salt + password).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(next));
}

function seed() {
  const pw = hashPassword("prime123");
  const users = [
    { id: 1, email: "hod@rjt.ac.lk", password: pw, role: "hod", name: "Dr. K. A. S. H. Kulathilake", status: "active" },
    { id: 2, email: "lecturer@rjt.ac.lk", password: pw, role: "lecturer", name: "Ms. K. Silva", status: "active" },
    { id: 3, email: "visiting@example.com", password: pw, role: "visiting", name: "Mr. J. Fernando", status: "active" },
    { id: 4, email: "coordinator@rjt.ac.lk", password: pw, role: "coordinator", name: "Ms. A. Jayawardena", status: "active" },
    { id: 5, email: "committee@rjt.ac.lk", password: pw, role: "committee", name: "Mr. S. Rathnayake", status: "active" },
    { id: 6, email: "dean@rjt.ac.lk", password: pw, role: "dean", name: "Prof. H. Wickrama", status: "active" },
    { id: 7, email: "s.perera@rjt.ac.lk", password: pw, role: "student", name: "S. Perera", status: "active" },
    { id: 8, email: "m.fernando@rjt.ac.lk", password: pw, role: "student", name: "M. Fernando", status: "active" },
    { id: 9, email: "a.kumara@rjt.ac.lk", password: pw, role: "student", name: "A. Kumara", status: "active" },
    { id: 10, email: "n.dias@rjt.ac.lk", password: pw, role: "student", name: "N. Dias", status: "active" },
    { id: 11, email: "t.jayasuriya@rjt.ac.lk", password: pw, role: "student", name: "T. Jayasuriya", status: "active" },
    { id: 12, email: "r.bandara@rjt.ac.lk", password: pw, role: "student", name: "R. Bandara", status: "active" },
  ];
  const students = [
    { id: 1, userId: 7, registrationNo: "ICT/2025/101", indexNo: "7001", name: "S. Perera", phone: "0710000001", admission: "2025-02-01", status: "active" },
    { id: 2, userId: 8, registrationNo: "ICT/2025/102", indexNo: "7002", name: "M. Fernando", phone: "0710000002", admission: "2025-02-01", status: "active" },
    { id: 3, userId: 9, registrationNo: "ICT/2025/103", indexNo: "7003", name: "A. Kumara", phone: "0710000003", admission: "2025-02-01", status: "active" },
    { id: 4, userId: 10, registrationNo: "ICT/2025/104", indexNo: "7004", name: "N. Dias", phone: "0710000004", admission: "2025-02-01", status: "active" },
    { id: 5, userId: 11, registrationNo: "ICT/2025/105", indexNo: "7005", name: "T. Jayasuriya", phone: "0710000005", admission: "2025-02-01", status: "active" },
    { id: 6, userId: 12, registrationNo: "ICT/2025/106", indexNo: "7006", name: "R. Bandara", phone: "0710000006", admission: "2025-02-01", status: "active" },
  ];
  const lecturers = [
    { id: 1, userId: 2, employeeNo: "EMP-2201", name: "Ms. K. Silva", phone: "0711000001", qualification: "MSc", status: "active" },
    { id: 2, userId: 3, employeeNo: "VL-1108", name: "Mr. J. Fernando", phone: "0772000002", qualification: "BSc", status: "active" },
    { id: 3, userId: 4, employeeNo: "EMP-2210", name: "Ms. A. Jayawardena", phone: "0711000003", qualification: "MPhil", status: "active" },
  ];
  const db = {
    next: { user: 13, student: 7, course: 4, section: 4, attendance: 1, medical: 7, request: 2, alert: 1, freeze: 1, eligibility: 1 },
    department: { id: 1, name: "Department of Computing", faculty: "Faculty of Applied Sciences" },
    hod: { id: 1, userId: 1, departmentId: 1, name: "Dr. K. A. S. H. Kulathilake" },
    committee: { id: 1, name: "Student Request Committee", description: "Reviews medicals and attendance requests. Cannot edit marks." },
    committeeMember: { id: 1, userId: 5, committeeId: 1, name: "Mr. S. Rathnayake", roleTitle: "Chair" },
    users,
    students,
    lecturers,
    visiting: [{ id: 1, lecturerId: 2, organization: "External", expertise: "Web systems", coordinatorId: 1 }],
    coordinators: [{ id: 1, lecturerId: 3, roleTitle: "VL Coordinator", assignedArea: "Year 1 computing" }],
    semesters: [{
      id: 1, name: "Year 1 Semester 2", year: "2025/2026",
      start: "2026-01-05", end: "2026-04-19", weekCount: 15, currentWeek: 8, status: "active",
    }],
    courses: [
      { id: 1, code: "ICT1407", name: "Database Systems", credits: 3, type: "Core" },
      { id: 2, code: "ICT1204", name: "Programming Fundamentals", credits: 3, type: "Core" },
      { id: 3, code: "ICT1302", name: "Web Technologies", credits: 2, type: "Core" },
    ],
    sections: [
      { id: 1, courseId: 1, semesterId: 1, code: "A", days: ["Mon", "Wed"], start: "08:30", end: "10:30", venue: "Lab 2", frozen: false },
      { id: 2, courseId: 2, semesterId: 1, code: "A", days: ["Tue", "Thu"], start: "10:30", end: "12:30", venue: "Hall B", frozen: false },
      { id: 3, courseId: 3, semesterId: 1, code: "A", days: ["Fri"], start: "13:00", end: "16:00", venue: "Lab 1", frozen: false },
    ],
    assignments: [
      { id: 1, sectionId: 1, lecturerId: 1 },
      { id: 2, sectionId: 2, lecturerId: 1 },
      { id: 3, sectionId: 3, lecturerId: 2 },
    ],
    enrollments: [],
    attendance: [],
    medicals: [],
    requests: [
      { id: 1, studentId: 5, sectionId: 1, type: "Excuse", date: "2026-02-20", weekNo: 7, reason: "Represented the faculty at an inter-university event.", status: "Pending", recommendation: "", hodDecision: "" },
    ],
    alerts: [],
    eligibility: [],
    freezes: [],
    audit: [],
  };
  for (const s of students) {
    for (const sec of db.sections) db.enrollments.push({ id: db.enrollments.length + 1, sectionId: sec.id, studentId: s.id });
  }
  const pattern = {
    1: ["Present", "Present", "Present", "Present", "Present", "Present", "Present"],
    2: ["Absent", "Present", "Absent", "Absent", "Present", "Absent", "Absent"],
    3: ["Present", "Present", "Present", "Present", "Absent", "Absent", "Absent"],
    4: ["Medical", "Present", "Medical", "Present", "Present", "Present", "Present"],
    5: ["Present", "Excused", "Present", "Present", "Present", "Absent", "Present"],
    6: ["Present", "Present", "Present", "Present", "Present", "Present", "Absent"],
  };
  let aid = 1;
  for (const sec of [1]) {
    for (let w = 1; w <= 7; w++) {
      const date = weekDate(db.semesters[0].start, w);
      for (const s of students) {
        db.attendance.push({
          id: aid++, sectionId: sec, studentId: s.id, date, weekNo: w,
          status: pattern[s.id][w - 1], recordedBy: 2, recordedTime: date + "T09:00:00",
        });
      }
    }
  }
  db.next.attendance = aid;
  const meds = [];
  for (let i = 0; i < 6; i++) {
    meds.push({
      id: i + 1, studentId: 4, sectionId: 2, submission: "2026-02-18",
      from: "2026-02-0" + ((i % 7) + 1), to: "2026-02-0" + ((i % 7) + 1),
      note: "Clinic note " + (i + 1), status: i < 4 ? "Approved" : "Pending", reviewedBy: i < 4 ? 5 : null,
    });
  }
  db.medicals = meds;
  db.next.medical = 7;
  recalcAll(db);
  raiseAlerts(db);
  return db;
}

function weekDate(start, week) {
  const d = new Date(start + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + (week - 1) * 7);
  return d.toISOString().slice(0, 10);
}

function load() {
  if (!fs.existsSync(STORE)) {
    fs.mkdirSync(path.dirname(STORE), { recursive: true });
    const db = seed();
    fs.writeFileSync(STORE, JSON.stringify(db, null, 2));
    return db;
  }
  return JSON.parse(fs.readFileSync(STORE, "utf8"));
}
let db = load();
function save() {
  try {
    fs.writeFileSync(STORE, JSON.stringify(db, null, 2));
  } catch (_) {
    // Vercel serverless functions have a read-only filesystem
  }
}

function publicUser(u) {
  const lec = lecturerByUser(u.id);
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    name: u.name,
    status: u.status,
    isLecturer: !!lec,
    lecturerId: lec ? lec.id : null,
    lecturerDesignation: lec?.designation || (lec ? (lec.role === "demo" ? "Demonstrator" : (lec.isVisiting ? "Visiting Lecturer" : (u.role === "hod" ? "Senior Lecturer & HOD" : "Lecturer"))) : (u.role === "demo" ? "Demonstrator" : null)),
  };
}
function userById(id) { return db.users.find((u) => u.id === id); }
function studentByUser(uid) { return db.students.find((s) => s.userId === uid); }
function lecturerByUser(uid) { return db.lecturers.find((l) => l.userId === uid); }

function sectionView(sec) {
  const course = db.courses.find((c) => c.id === sec.courseId);
  const sem = db.semesters.find((s) => s.id === sec.semesterId);
  const assigned = db.assignments.filter((a) => a.sectionId === sec.id).map((a) => db.lecturers.find((l) => l.id === a.lecturerId)?.name);
  const assignedLecIds = db.assignments.filter((a) => a.sectionId === sec.id).map((a) => a.lecturerId);
  const count = db.enrollments.filter((e) => e.sectionId === sec.id).length;
  return { ...sec, course, semester: sem, lecturers: assigned, lecturerIds: assignedLecIds, students: count };
}

function canEditAttendance(user, section, weekNo) {
  if (section.frozen && user.role !== "hod") return "This course section is frozen.";
  const sem = db.semesters.find((s) => s.id === section.semesterId);
  if (user.role === "hod") return null;
  if (user.role !== "lecturer" && user.role !== "visiting" && user.role !== "demo") return "Only a lecturer or demonstrator or the HOD can record attendance.";
  const lec = lecturerByUser(user.id);
  const assigned = db.assignments.some((a) => a.sectionId === section.id && a.lecturerId === lec?.id);
  if (!assigned) return "You can edit only sections assigned to you.";
  if (sem.currentWeek > 14 || weekNo > 14) return "Lecturer editing closes after Week 14. Only the HOD may change marks.";
  if (weekNo > sem.currentWeek) return "You cannot mark a week that has not started.";
  return null;
}

function countsFor(studentId, sectionId) {
  const rows = db.attendance.filter((a) => a.studentId === studentId && a.sectionId === sectionId);
  const c = { present: 0, absent: 0, medical: 0, excused: 0, total: rows.length };
  for (const r of rows) {
    if (r.status === "Present") c.present++;
    else if (r.status === "Absent") c.absent++;
    else if (r.status === "Medical") c.medical++;
    else if (r.status === "Excused") c.excused++;
  }
  const attended = c.present + c.medical + c.excused;
  c.percentage = c.total ? Math.round((attended / c.total) * 1000) / 10 : 0;
  return c;
}

function recalcAll(database = db) {
  database.eligibility = [];
  let id = 1;
  for (const e of database.enrollments) {
    const sec = database.sections.find((s) => s.id === e.sectionId);
    const c = countsForStore(database, e.studentId, e.sectionId);
    const freeze = database.freezes.find((f) => f.sectionId === e.sectionId && f.forceEligible);
    const eligible = freeze ? true : c.percentage >= 80;
    database.eligibility.push({
      id: id++, studentId: e.studentId, sectionId: e.sectionId, semesterId: sec.semesterId,
      present: c.present, absent: c.absent, medical: c.medical, excused: c.excused,
      total: c.total, percentage: c.percentage, eligible, exception: freeze ? "Course frozen — HOD recorded eligibility." : "",
      calculated: new Date().toISOString(),
    });
  }
  database.next.eligibility = id;
}
function countsForStore(database, studentId, sectionId) {
  const rows = database.attendance.filter((a) => a.studentId === studentId && a.sectionId === sectionId);
  const c = { present: 0, absent: 0, medical: 0, excused: 0, total: rows.length };
  for (const r of rows) {
    if (r.status === "Present") c.present++;
    else if (r.status === "Absent") c.absent++;
    else if (r.status === "Medical") c.medical++;
    else if (r.status === "Excused") c.excused++;
  }
  const attended = c.present + c.medical + c.excused;
  c.percentage = c.total ? Math.round((attended / c.total) * 1000) / 10 : 0;
  return c;
}

function raiseAlerts(database = db) {
  for (const sec of database.sections) {
    const sids = database.enrollments.filter((e) => e.sectionId === sec.id).map((e) => e.studentId);
    for (const sid of sids) {
      const rows = database.attendance
        .filter((a) => a.sectionId === sec.id && a.studentId === sid)
        .sort((a, b) => a.date.localeCompare(b.date));
      let run = 0;
      for (const r of rows) run = r.status === "Absent" ? run + 1 : 0;
      if (run >= 3) {
        const exists = database.alerts.some((a) => a.type === "3-day" && a.studentId === sid && a.sectionId === sec.id && a.status !== "Handled");
        if (!exists) {
          const stu = database.students.find((s) => s.id === sid);
          database.alerts.push({
            id: database.next.alert++, type: "3-day", date: new Date().toISOString().slice(0, 10),
            studentId: sid, sectionId: sec.id, targetRole: "lecturer",
            message: `${stu.name} has three consecutive absences in ${courseCode(database, sec)}.`,
            status: "New",
          });
        }
      }
    }
  }
  const byStudent = {};
  for (const m of database.medicals) byStudent[m.studentId] = (byStudent[m.studentId] || 0) + 1;
  for (const [sid, n] of Object.entries(byStudent)) {
    if (n >= 6) {
      const id = Number(sid);
      const exists = database.alerts.some((a) => a.type === "6-medical" && a.studentId === id && a.status !== "Handled");
      if (!exists) {
        const stu = database.students.find((s) => s.id === id);
        database.alerts.push({
          id: database.next.alert++, type: "6-medical", date: new Date().toISOString().slice(0, 10),
          studentId: id, sectionId: null, targetRole: "committee",
          message: `${stu.name} has submitted ${n} medical reports.`,
          status: "New",
        });
      }
    }
  }
}
function courseCode(database, sec) {
  const c = database.courses.find((c) => c.id === sec.courseId);
  const code = sec.code && sec.code !== "A" ? (" " + sec.code) : "";
  return (c?.code || "") + code;
}

function visibleSections(user) {
  if (user.role === "hod" || user.role === "dean" || user.role === "committee") return db.sections.map(sectionView);
  if (user.role === "coordinator") {
    const vlIds = db.visiting.filter((v) => v.coordinatorId && db.coordinators.some((c) => c.lecturerId === lecturerByUser(user.id)?.id && c.id === v.coordinatorId)).map((v) => v.lecturerId);
    const secIds = db.assignments.filter((a) => vlIds.includes(a.lecturerId)).map((a) => a.sectionId);
    return db.sections.filter((s) => secIds.includes(s.id)).map(sectionView);
  }
  if (user.role === "lecturer" || user.role === "visiting" || user.role === "demo") {
    const lec = lecturerByUser(user.id);
    const secIds = db.assignments.filter((a) => a.lecturerId === lec?.id).map((a) => a.sectionId);
    return db.sections.filter((s) => secIds.includes(s.id)).map(sectionView);
  }
  const stu = studentByUser(user.id);
  const secIds = db.enrollments.filter((e) => e.studentId === stu?.id).map((e) => e.sectionId);
  return db.sections.filter((s) => secIds.includes(s.id)).map(sectionView);
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach((p) => {
    const [k, ...r] = p.trim().split("=");
    if (k) out[k] = decodeURIComponent(r.join("="));
  });
  return out;
}
function currentUser(req) {
  const token = parseCookies(req).sam;
  if (!token || !sessions.has(token)) return null;
  const id = sessions.get(token);
  return userById(id) || null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}
function send(res, code, data, headers = {}) {
  const body = typeof data === "string" ? data : JSON.stringify(data);
  res.writeHead(code, { "content-type": typeof data === "string" ? "text/html; charset=utf-8" : "application/json", "cache-control": "no-store", ...headers });
  res.end(body);
}

function audit(user, action) {
  db.audit.unshift({ at: new Date().toISOString(), userId: user?.id || null, email: user?.email || "", action });
  db.audit = db.audit.slice(0, 200);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    let file = url.pathname === "/" ? "/index.html" : url.pathname;
    const full = path.normalize(path.join(PUBLIC, file));
    if (!full.startsWith(PUBLIC) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      send(res, 404, "Not found");
      return;
    }
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".pdf": "application/pdf"
    };
    res.writeHead(200, { "content-type": types[path.extname(full)] || "application/octet-stream" });
    fs.createReadStream(full).pipe(res);
  } catch (err) {
    send(res, 500, { error: err.message || "Server error" });
  }
});

async function handleApi(req, res, url) {
  const user = currentUser(req);
  if (req.method === "POST" && url.pathname === "/api/login") {
    const body = await readBody(req);
    const found = db.users.find((u) => u.email.toLowerCase() === String(body.email || "").toLowerCase());
    if (!found || !checkPassword(String(body.password || ""), found.password)) {
      send(res, 401, { error: "Email or password is not recognised." });
      return;
    }
    const token = crypto.randomBytes(24).toString("hex");
    sessions.set(token, found.id);
    audit(found, "login");
    save();
    send(res, 200, { user: publicUser(found) }, { "set-cookie": `sam=${token}; HttpOnly; Path=/; SameSite=Lax` });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/logout") {
    const token = parseCookies(req).sam;
    sessions.delete(token);
    send(res, 200, { ok: true }, { "set-cookie": "sam=; HttpOnly; Path=/; Max-Age=0" });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/mysql/status") {
    send(res, 200, getMySQLStatus());
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/mysql/connect") {
    const body = await readBody(req);
    const result = await connectMySQL(body);
    if (result.success) {
      saveMySQLConfig(body);
      await syncFromStoreToMySQL(db);
    }
    send(res, result.success ? 200 : 400, { ...getMySQLStatus(), error: result.error });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/supabase/status") {
    send(res, 200, getPostgresStatus());
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/supabase/connect") {
    const body = await readBody(req);
    const result = await connectPostgres(body);
    if (result.success) {
      savePostgresConfig(body);
      await syncFromStoreToPostgres(db);
    }
    send(res, result.success ? 200 : 400, { ...getPostgresStatus(), error: result.error });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/db/status") {
    send(res, 200, { mysql: getMySQLStatus(), supabase: getPostgresStatus() });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/auth/unregistered-lecturers") {
    const list = db.lecturers
      .filter((l) => {
        if (!l.userId) return true; // no linked user yet
        const u = db.users.find((u) => u.id === l.userId);
        if (!u) return true; // user deleted
        if (u.role === "hod") return false; // HOD already has full access
        return false; // active user means already activated
      })
      .map((l) => ({
        id: l.id,
        name: l.name,
        qualification: l.qualification,
        designation: l.designation || (l.role === "demo" ? "Demonstrator" : "Lecturer"),
        role: l.role || "lecturer",
        isVisiting: !!l.isVisiting
      }));
    send(res, 200, { lecturers: list });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/auth/check-student-reg") {
    const reg = String(url.searchParams.get("reg") || "").trim().toUpperCase();
    const stu = db.students.find((s) => s.registrationNo.toUpperCase() === reg);
    if (!stu) { send(res, 404, { error: "No student found with registration number " + reg }); return; }
    const already = stu.userId && db.users.some((u) => u.id === stu.userId);
    send(res, 200, { found: true, name: stu.name, indexNo: stu.indexNo, alreadyRegistered: !!already });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/auth/register-student") {
    const body = await readBody(req);
    const regNo = String(body.registrationNo || "").trim().toUpperCase();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "").trim();

    if (!regNo.startsWith("ICT/")) {
      send(res, 400, { error: "Registration number must follow the format ICT/2024/001" });
      return;
    }
    if (!email.includes("@") || (!email.endsWith(".ac.lk") && !email.includes(".edu."))) {
      send(res, 400, { error: "You must use your university email address (ending with .ac.lk)" });
      return;
    }
    if (password.length < 5) {
      send(res, 400, { error: "Password must be at least 5 characters long." });
      return;
    }

    const stu = db.students.find((s) => s.registrationNo.toUpperCase() === regNo);
    if (!stu) {
      send(res, 404, { error: `Student registration number ${regNo} not found in university records.` });
      return;
    }
    if (stu.userId && db.users.some((u) => u.id === stu.userId)) {
      send(res, 400, { error: `An account for ${regNo} is already registered. Please sign in with your email.` });
      return;
    }
    if (db.users.some((u) => u.email.toLowerCase() === email)) {
      send(res, 400, { error: `Email ${email} is already in use by another account.` });
      return;
    }

    const newUserId = db.next.user++;
    const newUser = {
      id: newUserId,
      email,
      password: hashPassword(password),
      role: "student",
      name: stu.name,
      status: "active",
    };
    db.users.push(newUser);
    stu.userId = newUserId;
    stu.status = "active";
    audit(newUser, `First-time student activation (${regNo})`);
    save();

    const token = crypto.randomBytes(24).toString("hex");
    sessions.set(token, newUser.id);
    send(res, 200, { user: publicUser(newUser), message: "Account created successfully!" }, { "set-cookie": `sam=${token}; HttpOnly; Path=/; SameSite=Lax` });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/auth/register-lecturer") {
    const body = await readBody(req);
    const lecturerId = Number(body.lecturerId);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "").trim();

    if (!email.includes("@") || (!email.endsWith(".ac.lk") && !email.includes(".edu."))) {
      send(res, 400, { error: "Lecturers must use their official university email address (ending with .ac.lk)" });
      return;
    }
    if (password.length < 5) {
      send(res, 400, { error: "Password must be at least 5 characters long." });
      return;
    }

    const lec = db.lecturers.find((l) => l.id === lecturerId);
    if (!lec) {
      send(res, 404, { error: "Lecturer profile not found." });
      return;
    }
    if (lec.userId && db.users.some((u) => u.id === lec.userId)) {
      send(res, 400, { error: `An account for ${lec.name} is already activated.` });
      return;
    }
    if (db.users.some((u) => u.email.toLowerCase() === email)) {
      send(res, 400, { error: `Email ${email} is already in use.` });
      return;
    }

    const newUserId = db.next.user++;
    const role = lec.role === "demo" ? "demo" : (lec.isVisiting ? "visiting" : "lecturer");
    const newUser = {
      id: newUserId,
      email,
      password: hashPassword(password),
      role,
      name: lec.name,
      status: "active",
    };
    db.users.push(newUser);
    lec.userId = newUserId;
    lec.status = "active";
    audit(newUser, `First-time lecturer activation (${lec.name})`);
    save();

    const token = crypto.randomBytes(24).toString("hex");
    sessions.set(token, newUser.id);
    send(res, 200, { user: publicUser(newUser), message: "Account created successfully!" }, { "set-cookie": `sam=${token}; HttpOnly; Path=/; SameSite=Lax` });
    return;
  }
  if (!user) { send(res, 401, { error: "Sign in required." }); return; }

  if (req.method === "GET" && url.pathname === "/api/me") {
    send(res, 200, { user: publicUser(user), department: db.department });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/bootstrap") {
    const sections = visibleSections(user);
    const stu = studentByUser(user.id);
    const elig = db.eligibility.filter((e) => {
      if (user.role === "student") return e.studentId === stu?.id;
      return sections.some((s) => s.id === e.sectionId);
    }).map(enrichElig);
    const alerts = db.alerts.filter((a) => {
      if (user.role === "hod" || user.role === "dean") return true;
      if (user.role === "committee") return a.targetRole === "committee";
      if (user.role === "lecturer" || user.role === "visiting" || user.role === "coordinator" || user.role === "demo") {
        return a.targetRole === "lecturer" && sections.some((s) => s.id === a.sectionId);
      }
      return false;
    });
    send(res, 200, {
      user: publicUser(user),
      department: db.department,
      semesters: db.semesters,
      sections,
      courses: db.courses,
      students: user.role === "student" ? db.students.filter((s) => s.id === stu.id) : (user.role === "dean" || user.role === "hod" || user.role === "committee" || user.role === "coordinator" ? db.students : studentsIn(sections)),
      eligibility: elig,
      alerts,
      medicals: filterMedicals(user),
      requests: filterRequests(user),
      freezes: db.freezes,
      visiting: db.visiting.map((v) => ({ ...v, lecturer: db.lecturers.find((l) => l.id === v.lecturerId)?.name, coordinator: db.coordinators.find((c) => c.id === v.coordinatorId) })),
      audit: user.role === "hod" ? db.audit.slice(0, 12) : [],
    });
    return;
  }

  const att = url.pathname.match(/^\/api\/attendance\/(\d+)$/);
  if (req.method === "GET" && att) {
    const section = db.sections.find((s) => s.id === Number(att[1]));
    if (!section || !visibleSections(user).some((s) => s.id === section.id)) { send(res, 403, { error: "Not allowed." }); return; }
    const stu = studentByUser(user.id);
    const rows = db.attendance.filter((a) => a.sectionId === section.id && (user.role !== "student" || a.studentId === stu.id));
    const enrolled = db.enrollments.filter((e) => e.sectionId === section.id).map((e) => db.students.find((s) => s.id === e.studentId)).filter((s) => user.role !== "student" || s.id === stu.id);
    send(res, 200, { section: sectionView(section), rows, students: enrolled, canEdit: !canEditAttendance(user, section, db.semesters.find((s) => s.id === section.semesterId).currentWeek) });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/attendance") {
    const body = await readBody(req);
    const section = db.sections.find((s) => s.id === Number(body.sectionId));
    if (!section) { send(res, 404, { error: "Section not found." }); return; }
    const weekNo = Number(body.weekNo);
    const reason = canEditAttendance(user, section, weekNo);
    if (reason) { send(res, 403, { error: reason }); return; }
    const date = body.date || weekDate(db.semesters.find((s) => s.id === section.semesterId).start, weekNo);
    const allowed = new Set(["Present", "Absent", "Medical", "Excused"]);
    for (const mark of body.marks || []) {
      if (!allowed.has(mark.status)) continue;
      const enrolled = db.enrollments.some((e) => e.sectionId === section.id && e.studentId === Number(mark.studentId));
      if (!enrolled) continue;
      const existing = db.attendance.find((a) => a.sectionId === section.id && a.studentId === Number(mark.studentId) && a.weekNo === weekNo);
      if (existing) {
        existing.status = mark.status;
        existing.recordedBy = user.id;
        existing.recordedTime = new Date().toISOString();
        existing.date = date;
      } else {
        db.attendance.push({
          id: db.next.attendance++, sectionId: section.id, studentId: Number(mark.studentId),
          date, weekNo, status: mark.status, recordedBy: user.id, recordedTime: new Date().toISOString(),
        });
      }
    }
    recalcAll();
    raiseAlerts();
    audit(user, `attendance section ${section.id} week ${weekNo}`);
    save();
    send(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/medicals") {
    if (user.role !== "student") { send(res, 403, { error: "Only students submit medical reports." }); return; }
    const body = await readBody(req);
    const stu = studentByUser(user.id);
    const section = db.sections.find((s) => s.id === Number(body.sectionId));
    if (!section || !db.enrollments.some((e) => e.sectionId === section.id && e.studentId === stu.id)) {
      send(res, 400, { error: "Pick one of your sections." }); return;
    }
    const sem = db.semesters.find((s) => s.id === section.semesterId);
    const submitted = new Date().toISOString().slice(0, 10);
    const from = String(body.from || "");
    const late = (new Date(submitted) - new Date(from)) / 86400000 > 14;
    if (late && !body.force) {
      send(res, 400, { error: "Medical reports should be submitted within two weeks of the absence." });
      return;
    }
    let attachmentUrl = null;
    let attachmentName = null;
    let attachmentType = null;

    if (body.fileBase64 && body.fileName) {
      const fileBuffer = Buffer.from(body.fileBase64, "base64");
      const mimeType = String(body.fileType || "application/octet-stream").slice(0, 100);
      attachmentName = String(body.fileName).slice(0, 200);
      attachmentType = mimeType;

      // Try Supabase Storage first
      const sbResult = await uploadToSupabaseStorage(fileBuffer, body.fileName, mimeType);
      if (sbResult) {
        attachmentUrl = sbResult.publicUrl;
        console.log("[Supabase Storage] uploaded:", sbResult.publicUrl);
      } else {
        // Fallback: save locally
        const uploadDir = path.join(PUBLIC, "uploads", "medicals");
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        const safeName = Date.now() + "_" + path.basename(body.fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
        fs.writeFileSync(path.join(uploadDir, safeName), fileBuffer);
        attachmentUrl = `/uploads/medicals/${safeName}`;
        console.log("[Storage] saved locally (Supabase unavailable):", safeName);
      }
    }

    db.medicals.push({
      id: db.next.medical++, studentId: stu.id, sectionId: section.id, submission: submitted,
      from, to: String(body.to || from), note: String(body.note || "").slice(0, 500),
      attachmentUrl, attachmentName, attachmentType,
      status: "Pending", reviewedBy: null, weekHint: sem.currentWeek,
    });
    raiseAlerts();
    audit(user, "submit medical");
    save();
    send(res, 200, { ok: true });
    return;
  }
  const medReview = url.pathname.match(/^\/api\/medicals\/(\d+)\/review$/);
  if (req.method === "POST" && medReview) {
    if (user.role !== "committee" && user.role !== "hod") { send(res, 403, { error: "Committee or HOD reviews medicals." }); return; }
    const body = await readBody(req);
    const med = db.medicals.find((m) => m.id === Number(medReview[1]));
    if (!med) { send(res, 404, { error: "Not found." }); return; }
    if (!["Approved", "Rejected"].includes(body.status)) { send(res, 400, { error: "Status must be Approved or Rejected." }); return; }
    med.status = body.status;
    med.reviewedBy = user.id;
    if (body.status === "Approved") {
      db.attendance.forEach((a) => {
        if (a.studentId === med.studentId && a.sectionId === med.sectionId && a.date >= med.from && a.date <= med.to && a.status === "Absent") {
          a.status = "Medical";
          a.recordedBy = user.role === "hod" ? user.id : a.recordedBy;
        }
      });
    }
    recalcAll();
    audit(user, `medical ${med.id} ${body.status}`);
    save();
    send(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/requests") {
    if (user.role !== "student") { send(res, 403, { error: "Only students submit requests." }); return; }
    const body = await readBody(req);
    const stu = studentByUser(user.id);
    const section = db.sections.find((s) => s.id === Number(body.sectionId));
    const sem = section && db.semesters.find((s) => s.id === section.semesterId);
    if (!section || !sem) { send(res, 400, { error: "Section required." }); return; }
    if (sem.currentWeek > 15) { send(res, 400, { error: "Excuses are considered only up to Week 15." }); return; }
    db.requests.push({
      id: db.next.request++, studentId: stu.id, sectionId: section.id,
      type: body.type === "Other" ? "Other" : "Excuse", date: new Date().toISOString().slice(0, 10),
      weekNo: sem.currentWeek, reason: String(body.reason || "").slice(0, 500),
      status: "Pending", recommendation: "", hodDecision: "",
    });
    audit(user, "submit request");
    save();
    send(res, 200, { ok: true });
    return;
  }
  const rec = url.pathname.match(/^\/api\/requests\/(\d+)\/recommend$/);
  if (req.method === "POST" && rec) {
    if (user.role !== "committee") { send(res, 403, { error: "Only the committee recommends." }); return; }
    const body = await readBody(req);
    const r = db.requests.find((x) => x.id === Number(rec[1]));
    if (!r) { send(res, 404, { error: "Not found." }); return; }
    r.recommendation = String(body.recommendation || "").slice(0, 500);
    r.status = body.stance === "Reject" ? "Rejected" : "Recommended";
    if (body.stance === "Reject") r.hodDecision = "Committee did not recommend approval.";
    audit(user, `recommend request ${r.id}`);
    save();
    send(res, 200, { ok: true });
    return;
  }
  const decide = url.pathname.match(/^\/api\/requests\/(\d+)\/decide$/);
  if (req.method === "POST" && decide) {
    if (user.role !== "hod") { send(res, 403, { error: "Only the HOD decides, and only the HOD may change attendance." }); return; }
    const body = await readBody(req);
    const r = db.requests.find((x) => x.id === Number(decide[1]));
    if (!r) { send(res, 404, { error: "Not found." }); return; }
    r.status = body.approve ? "Approved" : "Rejected";
    r.hodDecision = String(body.note || "").slice(0, 500);
    if (body.approve && body.weekNo) {
      const section = db.sections.find((s) => s.id === r.sectionId);
      const gate = canEditAttendance(user, section, Number(body.weekNo));
      if (gate) { send(res, 403, { error: gate }); return; }
      const row = db.attendance.find((a) => a.studentId === r.studentId && a.sectionId === r.sectionId && a.weekNo === Number(body.weekNo));
      if (row) { row.status = "Excused"; row.recordedBy = user.id; row.recordedTime = new Date().toISOString(); }
    }
    recalcAll();
    audit(user, `decide request ${r.id}`);
    save();
    send(res, 200, { ok: true });
    return;
  }

  const alertStatus = url.pathname.match(/^\/api\/alerts\/(\d+)$/);
  if (req.method === "POST" && alertStatus) {
    const body = await readBody(req);
    const a = db.alerts.find((x) => x.id === Number(alertStatus[1]));
    if (!a) { send(res, 404, { error: "Not found." }); return; }
    if (!["Viewed", "Handled"].includes(body.status)) { send(res, 400, { error: "Bad status." }); return; }
    a.status = body.status;
    save();
    send(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/freeze") {
    if (user.role !== "hod") { send(res, 403, { error: "Only the HOD can freeze a course." }); return; }
    const body = await readBody(req);
    const section = db.sections.find((s) => s.id === Number(body.sectionId));
    if (!section) { send(res, 404, { error: "Section not found." }); return; }
    section.frozen = true;
    db.freezes.push({
      id: db.next.freeze++, sectionId: section.id, hodUserId: user.id,
      date: new Date().toISOString().slice(0, 10), reason: String(body.reason || "").slice(0, 400),
      forceEligible: Boolean(body.forceEligible),
    });
    recalcAll();
    audit(user, `freeze section ${section.id}`);
    save();
    send(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/semesters") {
    if (user.role !== "hod") { send(res, 403, { error: "Only the HOD opens a semester." }); return; }
    const body = await readBody(req);
    const id = db.semesters.reduce((m, s) => Math.max(m, s.id), 0) + 1;
    const sem = {
      id, name: String(body.name || "New semester").slice(0, 80),
      year: String(body.year || "2026/2027"),
      start: body.start || "2026-08-01", end: body.end || "2026-11-15",
      weekCount: 15, currentWeek: 1, status: "active",
    };
    db.semesters.push(sem);
    for (const course of db.courses) {
      const sid = db.next.section++;
      db.sections.push({
        id: sid, courseId: course.id, semesterId: id, code: "A",
        days: ["Mon"], start: "08:30", end: "10:30", venue: "TBA", frozen: false,
      });
      for (const stu of db.students) db.enrollments.push({ id: db.enrollments.length + 1, sectionId: sid, studentId: stu.id });
      const lec = db.lecturers[0];
      db.assignments.push({ id: db.assignments.length + 1, sectionId: sid, lecturerId: lec.id });
    }
    recalcAll();
    audit(user, `open semester ${sem.name}`);
    save();
    send(res, 200, { ok: true, semester: sem });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/semester/week") {
    if (user.role !== "hod") { send(res, 403, { error: "Only the HOD moves the semester week." }); return; }
    const body = await readBody(req);
    const sem = db.semesters.find((s) => s.id === Number(body.semesterId)) || db.semesters.find((s) => s.status === "active");
    const week = Math.max(1, Math.min(15, Number(body.week)));
    sem.currentWeek = week;
    if (week === 15) sem.status = "closing";
    audit(user, `set week ${week}`);
    save();
    send(res, 200, { ok: true, semester: sem });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/students/import") {
    if (user.role !== "hod") { send(res, 403, { error: "Only the HOD imports students." }); return; }
    const body = await readBody(req);
    const lines = String(body.csv || "").split(/\n/).map((l) => l.trim()).filter(Boolean);
    let added = 0;
    for (const line of lines) {
      const [name, reg, index, email] = line.split(",").map((x) => x.trim());
      if (!name || !reg || !index || !email) continue;
      if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) continue;
      const uid = db.next.user++;
      db.users.push({ id: uid, email, password: hashPassword("prime123"), role: "student", name, status: "active" });
      const sid = db.next.student++;
      db.students.push({ id: sid, userId: uid, registrationNo: reg, indexNo: index, name, phone: "", admission: new Date().toISOString().slice(0, 10), status: "active" });
      const active = db.semesters.find((s) => s.status === "active") || db.semesters[0];
      for (const sec of db.sections.filter((s) => s.semesterId === active.id)) {
        db.enrollments.push({ id: db.enrollments.length + 1, sectionId: sec.id, studentId: sid });
      }
      added++;
    }
    recalcAll();
    audit(user, `import ${added} students`);
    save();
    send(res, 200, { ok: true, added });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/report") {
    const sectionId = Number(url.searchParams.get("sectionId"));
    const section = db.sections.find((s) => s.id === sectionId);
    if (!section || !visibleSections(user).some((s) => s.id === section.id)) { send(res, 403, { error: "Not allowed." }); return; }
    const stuFilter = user.role === "student" ? studentByUser(user.id).id : null;
    const people = db.enrollments.filter((e) => e.sectionId === section.id && (!stuFilter || e.studentId === stuFilter)).map((e) => {
      const s = db.students.find((x) => x.id === e.studentId);
      const el = db.eligibility.find((x) => x.studentId === s.id && x.sectionId === section.id);
      const marks = {};
      for (let w = 1; w <= 15; w++) {
        const row = db.attendance.find((a) => a.sectionId === section.id && a.studentId === s.id && a.weekNo === w);
        marks[w] = row ? row.status : "";
      }
      return { student: s, eligibility: el, marks };
    });
    send(res, 200, { section: sectionView(section), people });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/hod/import-excel") {
    if (user.role !== "hod") {
      send(res, 403, { error: "Only the Head of Department (HOD) can import semester attendance sheets." });
      return;
    }
    const body = await readBody(req);
    let parsed;
    try {
      if (body.fileBase64) {
        const buf = Buffer.from(body.fileBase64, "base64");
        parsed = parseExcelWorkbook(buf);
      } else {
        const defaultPath = path.join(__dirname, "..", "Attendance_Record_Only_Selected_Pages.xlsx");
        if (!fs.existsSync(defaultPath)) {
          send(res, 404, { error: "Default Excel file Attendance_Record_Only_Selected_Pages.xlsx not found." });
          return;
        }
        parsed = parseExcelWorkbook(defaultPath);
      }
    } catch (e) {
      send(res, 400, { error: "Failed to parse Excel sheet: " + e.message });
      return;
    }

    const summary = importExcelDataIntoDb(db, parsed, {
      semesterName: body.semesterName || "Year 1 Semester 2 (2024/2025)",
      academicYear: body.academicYear || "2024/2025",
    });
    recalcAll();
    raiseAlerts();
    audit(user, `Imported Excel workbook: ${summary.coursesCount} courses, ${summary.studentsCount} students, ${summary.attendanceCount} marks`);
    save();

    // Re-sync to MySQL if connected
    try {
      await syncFromStoreToMySQL(db);
    } catch (e) {
      console.warn("MySQL sync after import notice:", e.message);
    }

    send(res, 200, { ok: true, summary });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/hod/add-lecturer") {
    if (user.role !== "hod") { send(res, 403, { error: "Only HOD can add lecturers." }); return; }
    const body = await readBody(req);
    const name = String(body.name || "").trim();
    if (!name) { send(res, 400, { error: "Lecturer name is required." }); return; }
    const newLecId = (db.lecturers.reduce((m, l) => Math.max(m, l.id), 0) || 0) + 1;
    const lec = {
      id: newLecId,
      userId: null,
      employeeNo: `VL-${1000 + newLecId}`,
      name,
      phone: body.phone || "",
      qualification: body.qualification || "MSc",
      status: "pending_activation",
      isVisiting: true,
    };
    db.lecturers.push(lec);
    if (body.sectionId) {
      db.assignments.push({
        id: (db.assignments.reduce((m, a) => Math.max(m, a.id), 0) || 0) + 1,
        sectionId: Number(body.sectionId),
        lecturerId: newLecId,
      });
    }
    audit(user, `Added visiting lecturer ${name}`);
    save();
    send(res, 200, { ok: true, lecturer: lec });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/hod/assign-lecturer") {
    if (user.role !== "hod") { send(res, 403, { error: "Only HOD can assign lecturers." }); return; }
    const body = await readBody(req);
    const sectionId = Number(body.sectionId);
    const lecturerId = Number(body.lecturerId);
    const exists = db.assignments.some((a) => a.sectionId === sectionId && a.lecturerId === lecturerId);
    if (!exists) {
      db.assignments.push({
        id: (db.assignments.reduce((m, a) => Math.max(m, a.id), 0) || 0) + 1,
        sectionId,
        lecturerId,
      });
      audit(user, `Assigned lecturer ${lecturerId} to section ${sectionId}`);
      save();
    }
    send(res, 200, { ok: true });
    return;
  }

  send(res, 404, { error: "Unknown API." });
}

function studentsIn(sections) {
  const ids = new Set();
  for (const sec of sections) db.enrollments.filter((e) => e.sectionId === sec.id).forEach((e) => ids.add(e.studentId));
  return db.students.filter((s) => ids.has(s.id));
}
function enrichElig(e) {
  const s = db.students.find((x) => x.id === e.studentId);
  const sec = sectionView(db.sections.find((x) => x.id === e.sectionId));
  return {
    ...e,
    studentName: s?.name,
    registrationNo: s?.registrationNo,
    course: sec.course?.code,
    courseName: sec.course?.name,
    sectionCode: sec.code && sec.code !== "A" ? sec.code : "",
    lecturerIds: sec.lecturerIds || [],
    lecturers: sec.lecturers || [],
  };
}
function filterMedicals(user) {
  if (user.role === "student") {
    const stu = studentByUser(user.id);
    return db.medicals.filter((m) => m.studentId === stu.id);
  }
  if (user.role === "lecturer" || user.role === "visiting" || user.role === "demo") {
    const ids = visibleSections(user).map((s) => s.id);
    return db.medicals.filter((m) => ids.includes(m.sectionId));
  }
  return db.medicals;
}
function filterRequests(user) {
  if (user.role === "student") {
    const stu = studentByUser(user.id);
    return db.requests.filter((m) => m.studentId === stu.id);
  }
  if (user.role === "lecturer" || user.role === "visiting" || user.role === "demo") {
    const ids = visibleSections(user).map((s) => s.id);
    return db.requests.filter((m) => ids.includes(m.sectionId));
  }
  return db.requests;
}

if (!process.env.VERCEL) {
  server.listen(PORT, HOST, async () => {
    console.log(`SAM listening on ${HOST}:${PORT}`);
    try {
      const res = await connectMySQL();
      if (res?.success) {
        await syncFromStoreToMySQL(db);
      }
    } catch (err) {
      console.warn("MySQL auto-connect check:", err.message);
    }
    try {
      const pRes = await connectPostgres();
      if (pRes?.success) {
        await syncFromStoreToPostgres(db);
      }
    } catch (err) {
      console.warn("Supabase auto-connect check:", err.message);
    }
  });
}

export { handleApi, send, server, db, connectMySQL, syncFromStoreToMySQL };
export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    await handleApi(req, res, url);
    return;
  }
  send(res, 404, "Not found");
}
