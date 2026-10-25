import * as xlsxMod from "xlsx";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const xlsx = xlsxMod.default || xlsxMod;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function parseExcelWorkbook(filePathOrBuffer) {
  let wb;
  if (typeof filePathOrBuffer === "string") {
    wb = xlsx.readFile(filePathOrBuffer);
  } else {
    wb = xlsx.read(filePathOrBuffer, { type: "buffer" });
  }

  const coursesMap = new Map();
  const lecturersMap = new Map();
  const studentsMap = new Map();
  const attendanceList = [];

  const courseCodesOrder = [
    { code: "ICT1305", name: "Data Structures", credits: 3, type: "Core", lecturer: "Mr. P. S. Palliyaguruge", qualification: "MSc", isVisiting: false, isHOD: false, role: "lecturer", designation: "Lecturer" },
    { code: "ICT1305P", name: "Data Structures (Practical)", credits: 0, type: "Practical", lecturer: "Mr. Geenath", qualification: "BSc", isVisiting: false, isHOD: false, role: "demo", designation: "Demonstrator" },
    { code: "ICT1306", name: "Object Oriented Programming", credits: 3, type: "Core", lecturer: "Mr. H. M. C. J. De Silva", qualification: "MSc", isVisiting: false, isHOD: false, role: "lecturer", designation: "Lecturer" },
    { code: "ICT1306P", name: "Object Oriented Programming (Practical)", credits: 0, type: "Practical", lecturer: "Mrs. Hiruni", qualification: "BSc", isVisiting: false, isHOD: false, role: "demo", designation: "Demonstrator" },
    { code: "ICT1407", name: "Database Systems", credits: 4, type: "Core", lecturer: "Dr. K. A. S. H. Kulathilake", qualification: "PhD", isVisiting: false, isHOD: true, role: "senior_lecturer", designation: "Senior Lecturer & HOD" },
    { code: "ICT1407P", name: "Database Systems (Practical)", credits: 0, type: "Practical", lecturer: "Mrs. Dilaxshini Dunston", qualification: "BSc", isVisiting: false, isHOD: false, role: "demo", designation: "Demonstrator" },
    { code: "ICT1308", name: "Operating Systems", credits: 3, type: "Core", lecturer: "Miss. A. S. S. P. Subasinghe", qualification: "MSc", isVisiting: false, isHOD: false, role: "lecturer", designation: "Lecturer" },
  ];

  for (const c of courseCodesOrder) {
    coursesMap.set(c.code, c);
    if (!lecturersMap.has(c.lecturer)) {
      lecturersMap.set(c.lecturer, {
        name: c.lecturer,
        qualification: c.qualification,
        role: c.role || "lecturer",
        designation: c.designation || (c.role === "demo" ? "Demonstrator" : "Lecturer"),
        isVisiting: c.isVisiting,
        isHOD: c.isHOD,
      });
    }
  }

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    if (!rows || rows.length < 7) continue;

    let lecturerName = (rows[2] && rows[2][2]) ? String(rows[2][2]).trim() : "";
    let rawSubject = (rows[2] && rows[2][4]) ? String(rows[2][4]).trim() : sheetName;

    let courseCode = sheetName.replace(/\s+/g, "");
    if (sheetName.toLowerCase().includes("practical")) {
      const base = sheetName.replace(/practical/i, "").replace(/\s+/g, "");
      courseCode = base + "P";
    }

    if (!lecturerName && coursesMap.has(courseCode)) {
      lecturerName = coursesMap.get(courseCode).lecturer;
    }

    // Find header row (usually contains 'Reg_no')
    let headerRowIdx = -1;
    for (let r = 0; r < Math.min(10, rows.length); r++) {
      const rowStr = JSON.stringify(rows[r] || "");
      if (rowStr.toLowerCase().includes("reg_no") || rowStr.toLowerCase().includes("registration")) {
        headerRowIdx = r;
        break;
      }
    }
    if (headerRowIdx === -1) headerRowIdx = 5;

    // Student rows start after header row
    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || !row[1]) continue;

      const regNo = String(row[1]).trim();
      if (!regNo.toUpperCase().startsWith("ICT/")) continue;

      const indexNo = String(row[2] || "").trim();
      const studentName = String(row[3] || "").trim();

      if (!studentsMap.has(regNo)) {
        studentsMap.set(regNo, {
          registrationNo: regNo,
          indexNo: indexNo || ("INDEX-" + regNo.slice(-3)),
          name: studentName || regNo,
        });
      }

      // Weeks 1 to 15 are in row[4] to row[18]
      for (let w = 1; w <= 15; w++) {
        const val = row[3 + w];
        if (val !== undefined && val !== null && String(val).trim() !== "") {
          const raw = String(val).trim();
          let status = "Absent";
          if (raw === "1" || raw.toLowerCase() === "p" || raw.toLowerCase() === "present") {
            status = "Present";
          } else if (raw.toUpperCase() === "MC" || raw.toLowerCase() === "medical") {
            status = "Medical";
          } else if (raw.toLowerCase() === "ex" || raw.toLowerCase() === "excuse" || raw.toLowerCase() === "excused") {
            status = "Excused";
          } else if (raw === "0" || raw.toLowerCase() === "a" || raw.toLowerCase() === "absent") {
            status = "Absent";
          }

          attendanceList.push({
            courseCode,
            registrationNo: regNo,
            weekNo: w,
            status,
          });
        }
      }
    }
  }

  return {
    courses: Array.from(coursesMap.values()),
    lecturers: Array.from(lecturersMap.values()),
    students: Array.from(studentsMap.values()),
    attendance: attendanceList,
  };
}

export function importExcelDataIntoDb(db, parsedData, options = {}) {
  const semesterName = options.semesterName || "Year 1 Semester 2 (2024/2025)";
  const academicYear = options.academicYear || "2024/2025";

  // 1. Mark existing active semesters as closed
  for (const s of db.semesters) {
    if (s.status === "active") s.status = "closed";
  }

  // 2. Create the new semester
  const newSemesterId = (db.semesters.reduce((m, s) => Math.max(m, s.id), 0) || 0) + 1;
  const newSemester = {
    id: newSemesterId,
    name: semesterName,
    year: academicYear,
    start: options.startDate || "2026-07-13",
    end: options.endDate || "2026-10-30",
    weekCount: 15,
    currentWeek: 11, // Excel sheet has data up to week 11
    status: "active",
  };
  db.semesters.push(newSemester);

  // 3. Clear old mock students, courses, sections, enrollments, attendance, medicals, alerts, eligibility
  db.courses = [];
  db.sections = [];
  db.assignments = [];
  db.students = [];
  db.enrollments = [];
  db.attendance = [];
  db.medicals = [];
  db.requests = [];
  db.alerts = [];
  db.eligibility = [];
  db.freezes = [];

  // Keep HOD, Dean, and Committee accounts intact!
  // Remove old mock student users (keep non-students)
  db.users = db.users.filter((u) => u.role !== "student" && u.role !== "lecturer" && u.role !== "visiting");

  // Ensure default HOD user exists with Dr. K. A. S. H. Kulathilake
  let hodUser = db.users.find((u) => u.role === "hod");
  if (!hodUser) {
    hodUser = {
      id: 1,
      email: "hod@rjt.ac.lk",
      password: "6e70f76c8298417d:a542f0fd03e3e3a3b7a1fdaf0d1642ab9f68c1a89c3cbb84f5ea20f10952a023",
      role: "hod",
      name: "Dr. K. A. S. H. Kulathilake",
      status: "active",
    };
    db.users.push(hodUser);
  } else {
    hodUser.name = "Dr. K. A. S. H. Kulathilake";
  }

  db.hod = { id: 1, userId: hodUser.id, departmentId: 1, name: "Dr. K. A. S. H. Kulathilake" };

  // 4. Create lecturers
  db.lecturers = [];
  let nextLecId = 1;

  const lecturerIdMap = new Map();
  for (const l of parsedData.lecturers) {
    const lecId = nextLecId++;
    const isHODLecturer = l.isHOD && hodUser;
    db.lecturers.push({
      id: lecId,
      // HOD/Senior Lecturer is linked directly to the existing HOD user account (hod@rjt.ac.lk)
      userId: isHODLecturer ? hodUser.id : null,
      employeeNo: isHODLecturer ? `SL-${1000 + lecId}` : (l.role === "demo" ? `DEMO-${1000 + lecId}` : `LEC-${1000 + lecId}`),
      name: l.name,
      phone: "071" + String(1000000 + lecId),
      qualification: l.qualification,
      designation: l.designation || (isHODLecturer ? "Senior Lecturer & HOD" : (l.role === "demo" ? "Demonstrator" : "Lecturer")),
      role: l.role || (isHODLecturer ? "senior_lecturer" : "lecturer"),
      status: isHODLecturer ? "active" : "pending_activation",
      isVisiting: false,
      isHOD: !!l.isHOD,
    });
    lecturerIdMap.set(l.name, lecId);
  }

  // 5. Create courses and course sections
  let nextCourseId = 1;
  let nextSecId = 1;
  let nextAssignId = 1;

  const courseIdMap = new Map();
  const sectionIdMap = new Map();

  for (const c of parsedData.courses) {
    const cid = nextCourseId++;
    const courseObj = {
      id: cid,
      code: c.code,
      name: c.name,
      credits: c.credits,
      type: c.type,
    };
    db.courses.push(courseObj);
    courseIdMap.set(c.code, cid);

    const secId = nextSecId++;
    const sectionObj = {
      id: secId,
      courseId: cid,
      semesterId: newSemesterId,
      code: "",
      days: c.type === "Practical" ? ["Thu", "Fri"] : ["Mon", "Wed"],
      start: c.type === "Practical" ? "13:00" : "08:30",
      end: c.type === "Practical" ? "16:00" : "10:30",
      venue: c.type === "Practical" ? "Computer Lab 1" : "Lecture Hall A",
      frozen: false,
    };
    db.sections.push(sectionObj);
    sectionIdMap.set(c.code, secId);

    // Assign lecturer
    const lecId = lecturerIdMap.get(c.lecturer);
    if (lecId) {
      db.assignments.push({
        id: nextAssignId++,
        sectionId: secId,
        lecturerId: lecId,
      });
    }
  }

  // 6. Create students
  let nextStuId = 1;
  const studentRegMap = new Map();

  for (const s of parsedData.students) {
    const sid = nextStuId++;
    const studentObj = {
      id: sid,
      userId: null, // Student has to create account on first login with reg no
      registrationNo: s.registrationNo,
      indexNo: s.indexNo,
      name: s.name,
      phone: "",
      admission: "2024-01-15",
      status: "pending_activation",
    };
    db.students.push(studentObj);
    studentRegMap.set(s.registrationNo, sid);

    // Enroll in all 7 sections
    for (const sec of db.sections) {
      db.enrollments.push({
        id: db.enrollments.length + 1,
        sectionId: sec.id,
        studentId: sid,
      });
    }
  }

  // 7. Insert attendance records
  let nextAttId = 1;
  function getWeekDate(start, week) {
    const d = new Date(start + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + (week - 1) * 7);
    return d.toISOString().slice(0, 10);
  }

  for (const att of parsedData.attendance) {
    const sid = studentRegMap.get(att.registrationNo);
    const secId = sectionIdMap.get(att.courseCode);
    if (!sid || !secId) continue;

    const date = getWeekDate(newSemester.start, att.weekNo);
    db.attendance.push({
      id: nextAttId++,
      sectionId: secId,
      studentId: sid,
      date,
      weekNo: att.weekNo,
      status: att.status,
      recordedBy: 1, // HOD imported
      recordedTime: new Date().toISOString(),
    });
  }

  // Update counters
  const nextUserId = (db.users.reduce((m, u) => Math.max(m, u.id), 0) || 0) + 1;
  db.next = {
    user: nextUserId + 10,
    student: nextStuId,
    course: nextCourseId,
    section: nextSecId,
    attendance: nextAttId,
    medical: 1,
    request: 1,
    alert: 1,
    freeze: 1,
    eligibility: 1,
  };

  return {
    semester: newSemester,
    coursesCount: db.courses.length,
    lecturersCount: db.lecturers.length,
    studentsCount: db.students.length,
    enrollmentsCount: db.enrollments.length,
    attendanceCount: db.attendance.length,
  };
}
