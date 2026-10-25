const PptxGenJS = require("pptxgenjs");

const pptx = new PptxGenJS();

pptx.layout = "LAYOUT_WIDE";
pptx.author = "Prime Coders – ICT 1407";
pptx.company = "Rajarata University of Sri Lanka";
pptx.subject = "Student Attendance Management System";
pptx.title = "SAMS – Student Attendance Management System";

// ─── Colour palette ────────────────────────────────────────────────────────────
const DARK   = "0D1B2A";   // deep navy (hero background)
const GOLD   = "B8860B";   // golden amber (CTA / accent)
const CREAM  = "F5F0E8";   // off-white
const WHITE  = "FFFFFF";
const TEAL   = "1A6B74";   // secondary accent
const LIGHT  = "E8F4F5";   // light bg for body slides
const GREY   = "6B7280";   // muted text

// ─── Reusable helpers ──────────────────────────────────────────────────────────
function addDarkHero(slide) {
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: "100%", fill: { color: DARK } });
}

function addLightBg(slide) {
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: "100%", fill: { color: LIGHT } });
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.35, h: "100%", fill: { color: GOLD } });
}

function goldBadge(slide, text, x, y, w = 3.2) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h: 0.42, rectRadius: 0.12,
    fill: { color: GOLD }, line: { color: GOLD }
  });
  slide.addText(text, {
    x, y, w, h: 0.42,
    fontSize: 11, bold: true, color: WHITE, align: "center", valign: "middle"
  });
}

function slideNumber(slide, n) {
  slide.addText(`${n} / 15`, {
    x: 11.8, y: 6.85, w: 1.2, h: 0.25,
    fontSize: 9, color: GREY, align: "right"
  });
}

function addBodyTitle(slide, title, subtitle) {
  slide.addText(title, {
    x: 0.65, y: 0.3, w: 12.4, h: 0.7,
    fontSize: 30, bold: true, color: DARK, fontFace: "Calibri"
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.65, y: 0.95, w: 12.4, h: 0.35,
      fontSize: 13, color: TEAL, italic: true
    });
  }
  slide.addShape(pptx.ShapeType.line, {
    x: 0.65, y: 1.28, w: 11.7, h: 0,
    line: { color: GOLD, width: 2.5 }
  });
}

function bulletBox(slide, items, x, y, w, h, bgColor = WHITE) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.15,
    fill: { color: bgColor }, line: { color: "D1D5DB", width: 1 },
    shadow: { type: "outer", blur: 8, offset: 2, angle: 45, color: "00000020" }
  });
  const textRows = items.map(t => ({
    text: t,
    options: { bullet: { type: "bullet", characterCode: "25B6", color: GOLD }, breakLine: true, fontSize: 12.5, color: DARK, paraSpaceBefore: 4 }
  }));
  slide.addText(textRows, { x: x + 0.18, y: y + 0.12, w: w - 0.36, h: h - 0.24, valign: "top" });
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 1 – HERO / TITLE
// ══════════════════════════════════════════════════════════════════════════════
(function () {
  const s = pptx.addSlide();
  addDarkHero(s);

  // Gold left stripe
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.35, h: "100%", fill: { color: GOLD } });

  // Institution
  s.addText("RAJARATA UNIVERSITY · DEPARTMENT OF COMPUTING", {
    x: 0.65, y: 0.55, w: 12.4, h: 0.35,
    fontSize: 10.5, bold: true, color: GOLD, charSpacing: 3
  });

  // Big headline
  s.addText("Attendance,\nheld to the\nsemester's\nreal rules.", {
    x: 0.65, y: 1.0, w: 7.5, h: 3.5,
    fontSize: 52, bold: true, color: CREAM, fontFace: "Calibri", lineSpacingMultiple: 1.05
  });

  // Sub-rule line
  s.addText(
    "Fifteen weeks. Lecturers mark until Week 14.\nAfter that, only the Head of Department\ncan change a record.  Eligibility is 80 %.",
    { x: 0.65, y: 4.6, w: 7.5, h: 1.2, fontSize: 13, color: "A0ADB8", lineSpacingMultiple: 1.4 }
  );

  // Tags
  const tags = ["Present · Absent · Medical · Excused", "3-day absence alert", "6 medicals alert"];
  let tx = 0.65;
  tags.forEach(tag => {
    const w = tag.length * 0.105 + 0.4;
    s.addShape(pptx.ShapeType.roundRect, { x: tx, y: 5.85, w, h: 0.36, rectRadius: 0.18, fill: { color: "1E2D3D" }, line: { color: "3D5068", width: 1 } });
    s.addText(tag, { x: tx + 0.1, y: 5.85, w: w - 0.1, h: 0.36, fontSize: 10, color: "90A4B5", align: "center", valign: "middle" });
    tx += w + 0.22;
  });

  // Footer brand
  s.addText("ICT 1407  ·  Prime Coders  ·  Student Attendance Management System", {
    x: 0.65, y: 6.7, w: 8, h: 0.28,
    fontSize: 10, color: "4A6070"
  });

  // Right login card mock
  s.addShape(pptx.ShapeType.roundRect, {
    x: 8.7, y: 1.2, w: 4.2, h: 4.8, rectRadius: 0.25,
    fill: { color: WHITE }, shadow: { type: "outer", blur: 30, offset: 10, angle: 60, color: "888888" }
  });

  // DB badge
  s.addShape(pptx.ShapeType.roundRect, { x: 9.0, y: 1.65, w: 3.6, h: 0.58, rectRadius: 0.12, fill: { color: "E8F8F2" }, line: { color: "4CAF50", width: 1.5 } });
  s.addShape(pptx.ShapeType.ellipse, { x: 9.12, y: 1.79, w: 0.2, h: 0.2, fill: { color: "4CAF50" } });
  s.addText("Aiven Cloud MySQL Connected\nHost: Aiven Cloud · Port: 26308 · DB: defaultdb", {
    x: 9.38, y: 1.66, w: 3.0, h: 0.56,
    fontSize: 9, color: "1B5E20", bold: false, lineSpacingMultiple: 1.3
  });

  // Email field
  s.addText("University or approved email", { x: 9.0, y: 2.42, w: 3.6, h: 0.25, fontSize: 10, color: GREY });
  s.addShape(pptx.ShapeType.roundRect, { x: 9.0, y: 2.65, w: 3.6, h: 0.42, rectRadius: 0.1, fill: { color: "F9F9F9" }, line: { color: "D1D5DB", width: 1 } });
  s.addText("name@rjt.ac.lk", { x: 9.12, y: 2.65, w: 3.4, h: 0.42, fontSize: 10.5, color: "9CA3AF", valign: "middle" });

  // Password field
  s.addText("Password", { x: 9.0, y: 3.24, w: 3.6, h: 0.25, fontSize: 10, color: GREY });
  s.addShape(pptx.ShapeType.roundRect, { x: 9.0, y: 3.47, w: 3.6, h: 0.42, rectRadius: 0.1, fill: { color: "F9F9F9" }, line: { color: "D1D5DB", width: 1 } });

  // CTA button
  s.addShape(pptx.ShapeType.roundRect, { x: 9.0, y: 4.2, w: 2.2, h: 0.52, rectRadius: 0.26, fill: { color: GOLD }, line: { color: GOLD } });
  s.addText("Enter the system", { x: 9.0, y: 4.2, w: 2.2, h: 0.52, fontSize: 12, bold: true, color: WHITE, align: "center", valign: "middle" });

  slideNumber(s, 1);
})();

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 2 – PROBLEM & CONTEXT
// ══════════════════════════════════════════════════════════════════════════════
(function () {
  const s = pptx.addSlide();
  addLightBg(s);
  addBodyTitle(s, "The Problem We Solved", "Manual attendance – slow, error-prone, and opaque");

  const pain = [
    "Paper registers lost or forged every semester",
    "No real-time eligibility check → surprises at exam time",
    "Medical documents filed in physical folders, easily misplaced",
    "HOD had zero audit trail for post-Week-14 edits",
    "Excel sheets imported manually with transcription errors",
  ];
  bulletBox(s, pain, 0.65, 1.45, 6.0, 3.2, "FFF8F0");

  const sol = [
    "Cloud-native web app – open from any browser",
    "Live 80 % eligibility engine per subject",
    "Supabase medical document storage (PDF / image)",
    "Full HOD audit log with timestamp + actor",
    "One-click official Excel import with validation",
  ];
  bulletBox(s, sol, 7.1, 1.45, 5.7, 3.2, "F0FFF8");

  s.addText("❌  Before SAM", { x: 0.65, y: 1.42, w: 6.0, h: 0.3, fontSize: 11, bold: true, color: "B91C1C", align: "center" });
  s.addText("✅  After SAM", { x: 7.1, y: 1.42, w: 5.7, h: 0.3, fontSize: 11, bold: true, color: "15803D", align: "center" });

  s.addText("RAJARATA UNIVERSITY · DEPARTMENT OF COMPUTING · ICT 1407", {
    x: 0.65, y: 6.68, w: 12, h: 0.25, fontSize: 9, color: GREY, align: "center"
  });
  slideNumber(s, 2);
})();

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 3 – SYSTEM OVERVIEW
// ══════════════════════════════════════════════════════════════════════════════
(function () {
  const s = pptx.addSlide();
  addDarkHero(s);
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.35, h: "100%", fill: { color: GOLD } });

  s.addText("System Overview", {
    x: 0.65, y: 0.3, w: 12.4, h: 0.65,
    fontSize: 32, bold: true, color: CREAM, fontFace: "Calibri"
  });
  s.addShape(pptx.ShapeType.line, { x: 0.65, y: 0.95, w: 11.7, h: 0, line: { color: GOLD, width: 2 } });

  const roles = [
    { label: "HOD", icon: "👑", desc: "Full control\nAudit log\nFreeze / Open\nNext Semester" },
    { label: "Lecturer", icon: "🎓", desc: "Mark attendance\nUntil Week 14\nImport Excel\nMove Week" },
    { label: "Student", icon: "🎒", desc: "Verified only\nView own data\nUpload medicals\nCheck eligibility" },
    { label: "Cloud DB", icon: "☁️", desc: "Aiven MySQL\nSSL encrypted\nAuto-seeded\nServerless ready" },
  ];

  roles.forEach((r, i) => {
    const x = 0.65 + i * 3.35;
    s.addShape(pptx.ShapeType.roundRect, {
      x, y: 1.2, w: 3.1, h: 4.6, rectRadius: 0.2,
      fill: { color: "152638" }, line: { color: GOLD, width: 1.5 },
      shadow: { type: "outer", blur: 12, offset: 4, angle: 45, color: "00000080" }
    });
    s.addText(r.icon, { x, y: 1.45, w: 3.1, h: 0.6, fontSize: 28, align: "center" });
    s.addText(r.label, { x, y: 2.05, w: 3.1, h: 0.45, fontSize: 16, bold: true, color: GOLD, align: "center" });
    s.addShape(pptx.ShapeType.line, { x: x + 0.3, y: 2.52, w: 2.5, h: 0, line: { color: "2D4060", width: 1 } });
    s.addText(r.desc, { x: x + 0.15, y: 2.65, w: 2.8, h: 2.0, fontSize: 12.5, color: "A0ADB8", lineSpacingMultiple: 1.5, valign: "top" });
  });

  s.addText("Live at  https://prime-coders-sams.vercel.app", {
    x: 0.65, y: 6.68, w: 12, h: 0.25, fontSize: 10, color: GOLD, align: "center", hyperlink: { url: "https://prime-coders-sams.vercel.app" }
  });
  slideNumber(s, 3);
})();

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 4 – ROLE-BASED LOGIN (matching the UI)
// ══════════════════════════════════════════════════════════════════════════════
(function () {
  const s = pptx.addSlide();
  addLightBg(s);
  addBodyTitle(s, "Role-Based Login Portal", "University email authentication — three distinct entry modes");

  const tabs = [
    { title: "Sign In",               color: GOLD,  desc: "Existing users log in with their university or approved email and password. Role is detected automatically — HOD, Lecturer or Student." },
    { title: "Student First-Time Setup", color: TEAL,  desc: "New students register their index number, name, and set a password. Only verified students (marked by HOD) can proceed." },
    { title: "Lecturer Setup",        color: "5C6BC0", desc: "Lecturers configure their profile, link subjects they teach, and enable their attendance-marking access for the semester." },
  ];

  tabs.forEach((t, i) => {
    const y = 1.55 + i * 1.65;
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.65, y, w: 12.2, h: 1.45, rectRadius: 0.15,
      fill: { color: WHITE }, line: { color: t.color, width: 2 },
      shadow: { type: "outer", blur: 8, offset: 2, angle: 45, color: "00000015" }
    });
    s.addShape(pptx.ShapeType.roundRect, { x: 0.65, y: y, w: 2.5, h: 0.42, rectRadius: 0.12, fill: { color: t.color }, line: { color: t.color } });
    s.addText(t.title, { x: 0.65, y: y, w: 2.5, h: 0.42, fontSize: 11, bold: true, color: WHITE, align: "center", valign: "middle" });
    s.addText(t.desc, { x: 0.95, y: y + 0.5, w: 11.6, h: 0.85, fontSize: 13, color: DARK, lineSpacingMultiple: 1.4, valign: "top" });
  });

  s.addText("🟢  Aiven Cloud MySQL Connected  ·  All sessions secured with HTTPS", {
    x: 0.65, y: 6.68, w: 12, h: 0.25, fontSize: 10, color: "15803D", align: "center"
  });
  slideNumber(s, 4);
})();

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 5 – VERIFIED STUDENT PORTAL
// ══════════════════════════════════════════════════════════════════════════════
(function () {
  const s = pptx.addSlide();
  addDarkHero(s);
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.35, h: "100%", fill: { color: GOLD } });

  s.addText("Verified Student Portal", { x: 0.65, y: 0.3, w: 12.4, h: 0.65, fontSize: 32, bold: true, color: CREAM });
  s.addShape(pptx.ShapeType.line, { x: 0.65, y: 0.95, w: 11.7, h: 0, line: { color: GOLD, width: 2 } });

  s.addText(
    "Only students verified by the Head of Department can log in.\nEach student sees ONLY their own attendance data — no peer data is ever exposed.",
    { x: 0.65, y: 1.05, w: 12.4, h: 0.7, fontSize: 14, color: "A0ADB8", lineSpacingMultiple: 1.4 }
  );

  const cards = [
    { icon: "📊", title: "Live Attendance %", body: "Subject-by-subject percentage, colour-coded. Know your standing before the exam." },
    { icon: "🏥", title: "Medical Submissions", body: "Upload PDF or image proof directly from the portal. Stored in Supabase cloud storage." },
    { icon: "🔔", title: "Smart Alerts", body: "Warned automatically after 3 consecutive absences or when 6 medicals are logged." },
    { icon: "📋", title: "Eligibility Status", body: "80 % rule enforced live. Green = Eligible. Red = At risk. No surprises at exam time." },
    { icon: "🔐", title: "Secure & Private", body: "Session-scoped data. You see only your index number, name, and your own records." },
    { icon: "📅", title: "Week-by-Week View", body: "See attendance per lecture week. Medical and Excused statuses clearly marked." },
  ];

  cards.forEach((c, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.65 + col * 4.35;
    const y = 1.95 + row * 2.05;
    s.addShape(pptx.ShapeType.roundRect, { x, y, w: 4.1, h: 1.85, rectRadius: 0.18, fill: { color: "152638" }, line: { color: "2D4060", width: 1 } });
    s.addText(c.icon, { x, y: y + 0.1, w: 4.1, h: 0.45, fontSize: 22, align: "center" });
    s.addText(c.title, { x: x + 0.15, y: y + 0.55, w: 3.8, h: 0.35, fontSize: 13, bold: true, color: GOLD });
    s.addText(c.body, { x: x + 0.15, y: y + 0.9, w: 3.8, h: 0.85, fontSize: 11, color: "90A4B5", lineSpacingMultiple: 1.35 });
  });

  slideNumber(s, 5);
})();

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 6 – ATTENDANCE MARKING (4 STATUSES)
// ══════════════════════════════════════════════════════════════════════════════
(function () {
  const s = pptx.addSlide();
  addLightBg(s);
  addBodyTitle(s, "Attendance Marking", "Four statuses · real-time saving · per-lecture-week granularity");

  const statuses = [
    { color: "16A34A", label: "Present",  icon: "✅", desc: "Student attended the lecture. Counts towards the 80 % eligibility threshold." },
    { color: "DC2626", label: "Absent",   icon: "❌", desc: "Student missed the lecture. Three consecutive absences trigger an automatic alert." },
    { color: "2563EB", label: "Medical",  icon: "🏥", desc: "Absence covered by an uploaded medical certificate. Still counted but flagged. 6 medicals = alert." },
    { color: "D97706", label: "Excused",  icon: "📌", desc: "HOD or Lecturer excused the absence (e.g., university event). Does not penalise the student." },
  ];

  statuses.forEach((st, i) => {
    const x = 0.65 + i * 3.35;
    s.addShape(pptx.ShapeType.roundRect, {
      x, y: 1.5, w: 3.1, h: 4.5, rectRadius: 0.2,
      fill: { color: WHITE }, line: { color: st.color, width: 2.5 },
    });
    s.addShape(pptx.ShapeType.rect, { x, y: 1.5, w: 3.1, h: 0.6, fill: { color: ["EBF9EE","FEE8E8","E8EFFE","FEF3E8"][i] } });
    s.addText(st.icon + "  " + st.label, {
      x: x + 0.15, y: 1.55, w: 2.8, h: 0.5,
      fontSize: 15, bold: true, color: st.color, valign: "middle"
    });
    s.addText(st.desc, {
      x: x + 0.18, y: 2.22, w: 2.74, h: 3.55,
      fontSize: 12.5, color: DARK, lineSpacingMultiple: 1.5, valign: "top"
    });
  });

  s.addText("Lecturers mark attendance week by week. HOD can override any record at any time.", {
    x: 0.65, y: 6.68, w: 12, h: 0.25, fontSize: 10, color: GREY, align: "center"
  });
  slideNumber(s, 6);
})();

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 7 – SMART ALERT SYSTEM
// ══════════════════════════════════════════════════════════════════════════════
(function () {
  const s = pptx.addSlide();
  addDarkHero(s);
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.35, h: "100%", fill: { color: GOLD } });

  s.addText("Smart Alert System", { x: 0.65, y: 0.3, w: 12.4, h: 0.65, fontSize: 32, bold: true, color: CREAM });
  s.addShape(pptx.ShapeType.line, { x: 0.65, y: 0.95, w: 11.7, h: 0, line: { color: GOLD, width: 2 } });

  s.addText("Proactive notifications fire automatically — no manual checking required.", {
    x: 0.65, y: 1.05, w: 12.4, h: 0.4, fontSize: 14, color: "A0ADB8"
  });

  const alerts = [
    {
      badge: "3-DAY ABSENCE ALERT",  badgeColor: "DC2626",
      title: "Consecutive Absence Warning",
      body: "When a student misses 3 back-to-back lectures in any subject, the system\nautomatically flags them. The Lecturer and HOD are both notified on their dashboards.\nEarly intervention prevents eligibility failure.",
      icon: "🚨"
    },
    {
      badge: "6 MEDICALS ALERT",  badgeColor: "2563EB",
      title: "Medical Overuse Threshold",
      body: "Students who submit 6 or more medical certificates trigger a review flag.\nThis deters misuse of the medical excuse system while still protecting\nlegitimately ill students. The HOD can review and override.",
      icon: "⚠️"
    },
  ];

  alerts.forEach((a, i) => {
    const y = 1.6 + i * 2.55;
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.65, y, w: 12.2, h: 2.35, rectRadius: 0.2,
      fill: { color: "152638" }, line: { color: a.badgeColor, width: 1.5 }
    });
    s.addShape(pptx.ShapeType.roundRect, { x: 0.85, y: y + 0.12, w: 2.1, h: 0.38, rectRadius: 0.19, fill: { color: a.badgeColor }, line: { color: a.badgeColor } });
    s.addText(a.badge, { x: 0.85, y: y + 0.12, w: 2.1, h: 0.38, fontSize: 9, bold: true, color: WHITE, align: "center", valign: "middle" });
    s.addText(a.icon + "  " + a.title, { x: 3.15, y: y + 0.1, w: 9.5, h: 0.45, fontSize: 16, bold: true, color: CREAM });
    s.addText(a.body, { x: 0.85, y: y + 0.65, w: 11.75, h: 1.5, fontSize: 12.5, color: "A0ADB8", lineSpacingMultiple: 1.5 });
  });

  slideNumber(s, 7);
})();

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 8 – MEDICAL DOCUMENT MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════
(function () {
  const s = pptx.addSlide();
  addLightBg(s);
  addBodyTitle(s, "Medical Document Management", "Submit, store, and review medical certificates digitally");

  const points = [
    "Students upload PDF or image files from the Student Portal",
    "Files stored securely in Supabase Object Storage (Medicals bucket)",
    "Each document is timestamped and linked to the student's index number",
    "Lecturers and HOD can view and download submitted documents",
    "Local disk fallback if Supabase is unreachable — zero data loss",
    "6-medical threshold triggers automatic alert for HOD review",
    "Medical attendance status is clearly distinguished from Absent",
    "Documents remain accessible throughout the entire semester",
  ];
  bulletBox(s, points, 0.65, 1.5, 7.5, 5.0);

  // Right panel – flow diagram
  const steps = ["Student uploads document", "Supabase stores file", "Record marked Medical", "HOD reviews if flagged", "Evidence preserved semester-long"];
  steps.forEach((st, i) => {
    const y = 1.65 + i * 0.95;
    s.addShape(pptx.ShapeType.roundRect, { x: 8.6, y, w: 4.1, h: 0.6, rectRadius: 0.15, fill: { color: "D0EBEE" }, line: { color: TEAL, width: 1.2 } });
    s.addText(`${i + 1}. ${st}`, { x: 8.75, y, w: 3.8, h: 0.6, fontSize: 12, color: DARK, valign: "middle" });
    if (i < steps.length - 1) {
      s.addShape(pptx.ShapeType.line, { x: 10.65, y: y + 0.6, w: 0, h: 0.35, line: { color: TEAL, width: 1.5 } });
    }
  });

  slideNumber(s, 8);
})();

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 9 – 80% ELIGIBILITY ENGINE
// ══════════════════════════════════════════════════════════════════════════════
(function () {
  const s = pptx.addSlide();
  addDarkHero(s);
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.35, h: "100%", fill: { color: GOLD } });

  s.addText("80 % Eligibility Engine", { x: 0.65, y: 0.3, w: 12.4, h: 0.65, fontSize: 32, bold: true, color: CREAM });
  s.addShape(pptx.ShapeType.line, { x: 0.65, y: 0.95, w: 11.7, h: 0, line: { color: GOLD, width: 2 } });

  s.addText(
    "A student must attend at least 80 % of lectures per subject to sit for the final examination.\nSAM calculates this live — updated the moment a lecturer saves attendance.",
    { x: 0.65, y: 1.05, w: 12.4, h: 0.7, fontSize: 13.5, color: "A0ADB8", lineSpacingMultiple: 1.4 }
  );

  // Formula box
  s.addShape(pptx.ShapeType.roundRect, { x: 0.65, y: 1.9, w: 12.2, h: 0.85, rectRadius: 0.18, fill: { color: "152638" }, line: { color: GOLD, width: 1.5 } });
  s.addText("Eligibility  =  (Present + Medical + Excused)  ÷  Total Lectures  ×  100  ≥  80 %", {
    x: 0.65, y: 1.9, w: 12.2, h: 0.85, fontSize: 15, bold: true, color: GOLD, align: "center", valign: "middle", fontFace: "Courier New"
  });

  // Examples
  const examples = [
    { name: "Kamal Perera",    pct: 91, status: "ELIGIBLE",     color: "16A34A" },
    { name: "Nimesha Silva",   pct: 78, status: "AT RISK",      color: "EA580C" },
    { name: "Tharindu Bandara",pct: 55, status: "NOT ELIGIBLE", color: "DC2626" },
  ];
  examples.forEach((e, i) => {
    const x = 0.65 + i * 4.35;
    s.addShape(pptx.ShapeType.roundRect, { x, y: 3.0, w: 4.1, h: 2.8, rectRadius: 0.2, fill: { color: "152638" }, line: { color: e.color, width: 2 } });
    s.addText(e.name, { x: x + 0.15, y: 3.15, w: 3.8, h: 0.4, fontSize: 13, bold: true, color: CREAM });
    // Progress bar bg
    s.addShape(pptx.ShapeType.roundRect, { x: x + 0.2, y: 3.65, w: 3.7, h: 0.32, rectRadius: 0.16, fill: { color: "2D4060" } });
    // Progress bar fill
    s.addShape(pptx.ShapeType.roundRect, { x: x + 0.2, y: 3.65, w: 3.7 * e.pct / 100, h: 0.32, rectRadius: 0.16, fill: { color: e.color } });
    s.addText(`${e.pct} %`, { x: x + 0.15, y: 4.05, w: 3.8, h: 0.35, fontSize: 18, bold: true, color: e.color, align: "center" });
    s.addShape(pptx.ShapeType.roundRect, { x: x + 0.7, y: 4.48, w: 2.7, h: 0.42, rectRadius: 0.21, fill: { color: e.color }, line: { color: e.color } });
    s.addText(e.status, { x: x + 0.7, y: 4.48, w: 2.7, h: 0.42, fontSize: 12, bold: true, color: WHITE, align: "center", valign: "middle" });
  });

  slideNumber(s, 9);
})();

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 10 – MOVE THE WEEK & OPEN NEXT SEMESTER
// ══════════════════════════════════════════════════════════════════════════════
(function () {
  const s = pptx.addSlide();
  addLightBg(s);
  addBodyTitle(s, "Move Week  ·  Open Next Semester", "Administrative controls for semester lifecycle management");

  // Move Week
  s.addShape(pptx.ShapeType.roundRect, { x: 0.65, y: 1.5, w: 5.9, h: 5.1, rectRadius: 0.2, fill: { color: WHITE }, line: { color: GOLD, width: 2 } });
  s.addText("📅  Move the Week", { x: 0.85, y: 1.65, w: 5.5, h: 0.5, fontSize: 16, bold: true, color: GOLD });
  bulletBox(s, [
    "Lecturers advance to the next lecture week at a click",
    "System tracks Week 1 through Week 14",
    "Prevents accidental future-week marking",
    "Week number is shown on all attendance views",
    "HOD can override the current week at any time",
    "Protects historical records — past weeks are locked",
  ], 0.65, 2.2, 5.9, 4.0, "FFFEF0");

  // Open Next Semester
  s.addShape(pptx.ShapeType.roundRect, { x: 7.1, y: 1.5, w: 5.7, h: 5.1, rectRadius: 0.2, fill: { color: WHITE }, line: { color: TEAL, width: 2 } });
  s.addText("🎓  Open Next Semester", { x: 7.3, y: 1.65, w: 5.3, h: 0.5, fontSize: 16, bold: true, color: TEAL });
  bulletBox(s, [
    "HOD-only action — no lecturer can trigger this",
    "Archives all current semester attendance records",
    "Resets week counter back to Week 1",
    "Generates a fresh attendance sheet for new subjects",
    "Students retain verification across semesters",
    "Full audit trail entry is created on activation",
  ], 7.1, 2.2, 5.7, 4.0, "F0FFFE");

  slideNumber(s, 10);
})();

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 11 – FREEZE A SECTION
// ══════════════════════════════════════════════════════════════════════════════
(function () {
  const s = pptx.addSlide();
  addDarkHero(s);
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.35, h: "100%", fill: { color: GOLD } });

  s.addText("Freeze a Section", { x: 0.65, y: 0.3, w: 12.4, h: 0.65, fontSize: 32, bold: true, color: CREAM });
  s.addShape(pptx.ShapeType.line, { x: 0.65, y: 0.95, w: 11.7, h: 0, line: { color: GOLD, width: 2 } });

  s.addText("🔒  After Week 14, the HOD can freeze any subject section — locking all attendance records permanently.", {
    x: 0.65, y: 1.05, w: 12.4, h: 0.55, fontSize: 13.5, color: "A0ADB8"
  });

  const features = [
    { icon: "🔒", title: "Section-Level Lock",  body: "Each subject section (e.g., CS Group A) can be frozen independently. Granular control." },
    { icon: "🛡️", title: "Tamper Protection",  body: "Once frozen, no lecturer can add, edit, or delete attendance. HOD retains override." },
    { icon: "📜", title: "Audit on Freeze",     body: "The freeze action is logged — who froze it, when, and which section. Fully auditable." },
    { icon: "🔓", title: "HOD Unfreeze",        body: "Only the Head of Department can unfreeze a section, with a logged justification reason." },
    { icon: "👁️", title: "Read-Only View",      body: "Frozen sections remain fully visible to lecturers and students — just no edits allowed." },
    { icon: "✅", title: "Exam Readiness",       body: "Freeze signals that eligibility lists are finalised and ready for the exam registrar." },
  ];

  features.forEach((f, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.65 + col * 4.35;
    const y = 1.75 + row * 2.25;
    s.addShape(pptx.ShapeType.roundRect, { x, y, w: 4.1, h: 2.0, rectRadius: 0.18, fill: { color: "152638" }, line: { color: "2D4060", width: 1 } });
    s.addText(f.icon + "  " + f.title, { x: x + 0.15, y: y + 0.15, w: 3.8, h: 0.4, fontSize: 13, bold: true, color: GOLD });
    s.addText(f.body, { x: x + 0.15, y: y + 0.62, w: 3.8, h: 1.2, fontSize: 11.5, color: "A0ADB8", lineSpacingMultiple: 1.4 });
  });

  slideNumber(s, 11);
})();

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 12 – EXCEL IMPORT
// ══════════════════════════════════════════════════════════════════════════════
(function () {
  const s = pptx.addSlide();
  addLightBg(s);
  addBodyTitle(s, "Import Official Excel Attendance Sheet", "One-click bulk import — from official university registers");

  const steps = [
    { n: "01", title: "Upload .xlsx File",     body: "Lecturer or HOD uploads the official university attendance Excel sheet via the Import tab." },
    { n: "02", title: "Auto-Detect Columns",   body: "The importer reads column headers (Index No, Week 1–14, etc.) and maps them automatically." },
    { n: "03", title: "Validate Records",       body: "Each row is checked against verified student index numbers. Unknowns are flagged, not silently skipped." },
    { n: "04", title: "Status Mapping",         body: "P/A/M/E codes from the sheet are converted to Present / Absent / Medical / Excused in the database." },
    { n: "05", title: "Preview & Confirm",      body: "A summary of changes is shown before saving. Lecturers see exactly what will be written." },
    { n: "06", title: "Instant Eligibility",    body: "After import, the 80 % engine recalculates all eligibility statuses in real time." },
  ];

  steps.forEach((st, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.65 + col * 6.55;
    const y = 1.5 + row * 1.72;
    s.addShape(pptx.ShapeType.roundRect, { x, y, w: 6.2, h: 1.55, rectRadius: 0.15, fill: { color: WHITE }, line: { color: TEAL, width: 1.5 } });
    s.addShape(pptx.ShapeType.roundRect, { x: x + 0.12, y: y + 0.12, w: 0.55, h: 0.55, rectRadius: 0.12, fill: { color: TEAL }, line: { color: TEAL } });
    s.addText(st.n, { x: x + 0.12, y: y + 0.12, w: 0.55, h: 0.55, fontSize: 14, bold: true, color: WHITE, align: "center", valign: "middle" });
    s.addText(st.title, { x: x + 0.82, y: y + 0.1, w: 5.1, h: 0.42, fontSize: 13, bold: true, color: DARK });
    s.addText(st.body, { x: x + 0.82, y: y + 0.55, w: 5.1, h: 0.85, fontSize: 11.5, color: GREY, lineSpacingMultiple: 1.35 });
  });

  slideNumber(s, 12);
})();

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 13 – HOD AUDIT LOG & RECENT ACTIONS
// ══════════════════════════════════════════════════════════════════════════════
(function () {
  const s = pptx.addSlide();
  addDarkHero(s);
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.35, h: "100%", fill: { color: GOLD } });

  s.addText("HOD Audit Log  &  Recent Actions", { x: 0.65, y: 0.3, w: 12.4, h: 0.65, fontSize: 30, bold: true, color: CREAM });
  s.addShape(pptx.ShapeType.line, { x: 0.65, y: 0.95, w: 11.7, h: 0, line: { color: GOLD, width: 2 } });

  s.addText("Every privileged action is recorded. The HOD can see what changed, who changed it, and when.", {
    x: 0.65, y: 1.05, w: 12.4, h: 0.4, fontSize: 13, color: "A0ADB8"
  });

  // Table header
  const cols = [{ x: 0.65, w: 1.2, label: "Time" }, { x: 1.95, w: 2.5, label: "Actor" }, { x: 4.55, w: 3.2, label: "Action" }, { x: 7.85, w: 5.0, label: "Detail" }];
  cols.forEach(c => {
    s.addShape(pptx.ShapeType.rect, { x: c.x, y: 1.6, w: c.w, h: 0.42, fill: { color: GOLD } });
    s.addText(c.label, { x: c.x + 0.08, y: 1.6, w: c.w - 0.1, h: 0.42, fontSize: 11, bold: true, color: WHITE, valign: "middle" });
  });

  const rows = [
    { time: "08:14", actor: "Dr. Kulathilake (HOD)", action: "Override Record", detail: "Changed Nimesha Silva Wk-12 → Medical" },
    { time: "08:32", actor: "Lect. Jayasuriya",     action: "Import Excel",    detail: "Imported 42 records, Week 8, CS2301" },
    { time: "09:05", actor: "Dr. Kulathilake (HOD)", action: "Freeze Section",  detail: "Froze CS Group A – Semester 1 2024" },
    { time: "10:18", actor: "Dr. Kulathilake (HOD)", action: "Open Next Sem",   detail: "Archived S1-2024, opened S2-2024" },
    { time: "11:47", actor: "Lect. Bandara",         action: "Move Week",        detail: "Advanced Week 9 → Week 10, CS2201" },
  ];

  rows.forEach((r, i) => {
    const y = 2.05 + i * 0.75;
    const bg = i % 2 === 0 ? "152638" : "1A2D40";
    cols.forEach((c, ci) => {
      s.addShape(pptx.ShapeType.rect, { x: c.x, y, w: c.w, h: 0.72, fill: { color: bg } });
      const cell = [r.time, r.actor, r.action, r.detail][ci];
      s.addText(cell, { x: c.x + 0.08, y, w: c.w - 0.1, h: 0.72, fontSize: 11, color: "C8D8E8", valign: "middle" });
    });
  });

  s.addText("Audit logs are permanent — cannot be edited or deleted, even by the HOD.", {
    x: 0.65, y: 6.65, w: 12, h: 0.28, fontSize: 10, color: GOLD, align: "center"
  });
  slideNumber(s, 13);
})();

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 14 – CLOUD ARCHITECTURE
// ══════════════════════════════════════════════════════════════════════════════
(function () {
  const s = pptx.addSlide();
  addLightBg(s);
  addBodyTitle(s, "Cloud Architecture", "Vercel Edge CDN  ·  Aiven MySQL  ·  Supabase Storage");

  const nodes = [
    { x: 0.8,  y: 2.2, label: "Browser\n(Any Device)",    icon: "🌐", color: DARK,     lightBg: "E4E8EC" },
    { x: 4.0,  y: 2.2, label: "Vercel\nEdge CDN",          icon: "⚡", color: TEAL,     lightBg: "D0EBEE" },
    { x: 7.2,  y: 1.4, label: "Serverless\nAPI (Node.js)", icon: "🔧", color: GOLD,     lightBg: "F5EAC4" },
    { x: 7.2,  y: 3.2, label: "Static\nFrontend",          icon: "📄", color: "5C6BC0", lightBg: "ECEEFF" },
    { x: 10.4, y: 1.4, label: "Aiven\nMySQL (SSL)",         icon: "🗄️", color: "16A34A", lightBg: "E5F8EE" },
    { x: 10.4, y: 3.2, label: "Supabase\nStorage",          icon: "📦", color: "2563EB", lightBg: "E5EDFF" },
  ];

  nodes.forEach(n => {
    s.addShape(pptx.ShapeType.roundRect, { x: n.x, y: n.y, w: 2.7, h: 1.35, rectRadius: 0.2, fill: { color: n.lightBg || "E8F0F2" }, line: { color: n.color, width: 2 } });
    s.addText(n.icon, { x: n.x, y: n.y + 0.08, w: 2.7, h: 0.48, fontSize: 20, align: "center" });
    s.addText(n.label, { x: n.x, y: n.y + 0.58, w: 2.7, h: 0.65, fontSize: 11, bold: true, color: DARK, align: "center" });
  });

  // Arrows
  const arrows = [
    [2.7, 2.87, 1.3, 0],
    [5.9, 2.15, 1.3, -0.58],
    [5.9, 2.87, 1.3, 0.58],
    [9.1, 1.95, 1.3, 0],
    [9.1, 3.55, 1.3, 0],
  ];
  arrows.forEach(([x, y, w, dy]) => {
    s.addShape(pptx.ShapeType.line, { x, y, w, h: dy, line: { color: GREY, width: 1.5, endArrowType: "arrow" } });
  });

  const tech = [
    { label: "Vercel", desc: "Serverless functions · Edge CDN · HTTPS · Zero-config deploy" },
    { label: "Aiven MySQL", desc: "Managed cloud MySQL · SSL encrypted · Port 26308 · Auto-seeded" },
    { label: "Supabase", desc: "Object storage · Medicals bucket · Signed URLs · PDF & images" },
    { label: "Node.js ES Module", desc: "server.js as both local server & Vercel handler · mysql2/promise" },
  ];
  tech.forEach((t, i) => {
    const x = 0.65 + i * 3.35;
    s.addShape(pptx.ShapeType.roundRect, { x, y: 5.15, w: 3.1, h: 1.55, rectRadius: 0.15, fill: { color: WHITE }, line: { color: "C8CDD3", width: 1 } });
    s.addText(t.label, { x: x + 0.12, y: 5.22, w: 2.86, h: 0.35, fontSize: 12, bold: true, color: DARK });
    s.addText(t.desc, { x: x + 0.12, y: 5.6, w: 2.86, h: 1.0, fontSize: 10.5, color: GREY, lineSpacingMultiple: 1.35 });
  });

  slideNumber(s, 14);
})();

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 15 – CLOSING / CALL TO ACTION
// ══════════════════════════════════════════════════════════════════════════════
(function () {
  const s = pptx.addSlide();
  addDarkHero(s);
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.35, h: "100%", fill: { color: GOLD } });

  // Large decorative circle
  s.addShape(pptx.ShapeType.ellipse, { x: 7.5, y: -1.5, w: 7, h: 7, fill: { color: "152638" }, line: { color: "1E3550", width: 1 } });

  s.addText("RAJARATA UNIVERSITY · DEPARTMENT OF COMPUTING", {
    x: 0.65, y: 0.55, w: 9, h: 0.35, fontSize: 10.5, bold: true, color: GOLD, charSpacing: 3
  });

  s.addText("Attendance,\nheld to the\nsemester's\nreal rules.", {
    x: 0.65, y: 1.05, w: 8, h: 3.2, fontSize: 46, bold: true, color: CREAM, fontFace: "Calibri", lineSpacingMultiple: 1.05
  });

  s.addText("SAM is live and ready for your department.", {
    x: 0.65, y: 4.35, w: 8, h: 0.5, fontSize: 16, color: "90A4B5"
  });

  // CTA button
  s.addShape(pptx.ShapeType.roundRect, { x: 0.65, y: 5.0, w: 3.5, h: 0.65, rectRadius: 0.33, fill: { color: GOLD }, line: { color: GOLD } });
  s.addText("🌐  Visit Live App", { x: 0.65, y: 5.0, w: 3.5, h: 0.65, fontSize: 15, bold: true, color: WHITE, align: "center", valign: "middle", hyperlink: { url: "https://prime-coders-sams.vercel.app" } });

  s.addText("https://prime-coders-sams.vercel.app", {
    x: 0.65, y: 5.72, w: 8, h: 0.28, fontSize: 11, color: "4A6070",
    hyperlink: { url: "https://prime-coders-sams.vercel.app" }
  });

  // Feature pill summary
  const pills = ["Role-Based Login", "Verified Students", "80% Engine", "Medical Storage", "Excel Import", "Freeze Section", "HOD Audit Log", "Aiven Cloud", "Vercel Deploy"];
  let px = 0.65;
  let py = 6.25;
  pills.forEach((p, i) => {
    const w = p.length * 0.1 + 0.55;
    if (px + w > 12.8) { px = 0.65; py += 0.4; }
    s.addShape(pptx.ShapeType.roundRect, { x: px, y: py, w, h: 0.32, rectRadius: 0.16, fill: { color: "1E2D3D" }, line: { color: "2D4060", width: 1 } });
    s.addText(p, { x: px + 0.05, y: py, w: w - 0.05, h: 0.32, fontSize: 9.5, color: "7090A8", align: "center", valign: "middle" });
    px += w + 0.18;
  });

  s.addText("ICT 1407  ·  Prime Coders  ·  Student Attendance Management System", {
    x: 0.65, y: 6.8, w: 12, h: 0.22, fontSize: 9, color: "3A5060", align: "center"
  });

  slideNumber(s, 15);
})();

// ─── Write file ───────────────────────────────────────────────────────────────
pptx.writeFile({ fileName: "SAMS_Presentation.pptx" })
  .then(() => console.log("✅  SAMS_Presentation.pptx created successfully!"))
  .catch(err => { console.error("❌  Error:", err); process.exit(1); });
