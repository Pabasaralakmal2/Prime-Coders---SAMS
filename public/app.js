const app = document.querySelector("#app");
const state = { user: null, data: null, page: "home", sectionId: null, message: "", mysql: null, showMysqlConfig: false, authTab: "login", unregisteredLecturers: [], portalMode: "hod", intendedPortal: null };

const NAV = {
  hod: [["home", "Overview"], ["sheet", "Attendance"], ["medical", "Medicals"], ["requests", "Requests"], ["alerts", "Alerts"], ["report", "Reports"], ["admin", "Semester"]],
  lecturer: [["home", "Overview"], ["sheet", "Attendance"], ["alerts", "Alerts"], ["report", "Reports"]],
  demo: [["home", "Overview"], ["sheet", "Attendance"], ["alerts", "Alerts"], ["report", "Reports"]],
  visiting: [["home", "Overview"], ["sheet", "Attendance"], ["alerts", "Alerts"], ["report", "Reports"]],
  coordinator: [["home", "Overview"], ["report", "Visiting sections"], ["alerts", "Alerts"]],
  student: [["home", "My attendance"], ["medical", "Medical report"], ["requests", "Requests"], ["report", "My sheet"]],
  committee: [["home", "Review desk"], ["medical", "Medicals"], ["requests", "Requests"], ["alerts", "Alerts"]],
  dean: [["home", "Overview"], ["report", "Reports"], ["alerts", "Alerts"]],
};

const ROLES = [
  ["HOD Portal", "hod@rjt.ac.lk", "hod"],
  ["Lecturer Portal (Dr. Kulathilake)", "hod@rjt.ac.lk", "lecturer"],
  ["Demo (1407P - Mrs. Dilaxshini)", "dilaxshini@rjt.ac.lk", "demo"],
  ["Demo (1305P - Mr. Geenath)", "geenath@rjt.ac.lk", "demo"],
  ["Demo (1306P - Mrs. Hiruni)", "hiruni@rjt.ac.lk", "demo"],
  ["Lecturer Setup", "lecturer", "tab"],
  ["Coordinator", "coordinator@rjt.ac.lk", "coordinator"],
  ["Student", "s.perera@rjt.ac.lk", "student"],
  ["Committee", "committee@rjt.ac.lk", "committee"],
  ["Dean", "dean@rjt.ac.lk", "dean"],
];

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function pill(flag) {
  return flag ? `<span class="pill ok">Eligible</span>` : `<span class="pill bad">Below 80%</span>`;
}
function statusPill(s) {
  const cls = s === "Approved" || s === "Recommended" || s === "Handled" ? "ok" : s === "Rejected" ? "bad" : "wait";
  return `<span class="pill ${cls}">${esc(s)}</span>`;
}

function shell(inner) {
  const isHod = state.user.role === "hod";
  const activeNavRole = (isHod && state.portalMode === "lecturer") ? "lecturer" : state.user.role;
  const items = (NAV[activeNavRole] || NAV.lecturer).map(([id, label]) =>
    `<button class="nav ${state.page === id ? "active" : ""}" data-page="${id}">${label}</button>`
  ).join("");

  const portalToggle = isHod ? `
    <div class="portal-toggle-container">
      <div class="portal-toggle-label">Active Portal</div>
      <div class="portal-toggle-buttons">
        <button type="button" class="portal-toggle-btn ${state.portalMode !== "lecturer" ? "active" : ""}" data-portal-switch="hod">
          🏛️ HOD Portal
        </button>
        <button type="button" class="portal-toggle-btn ${state.portalMode === "lecturer" ? "active" : ""}" data-portal-switch="lecturer">
          👨‍🏫 Lecturer Portal
        </button>
      </div>
    </div>` : "";

  const roleBadge = isHod
    ? (state.portalMode === "lecturer" ? "Senior Lecturer & HOD (Lecturer Mode)" : "Head of Department (HOD Mode)")
    : (state.user.role === "demo" ? (state.user.lecturerDesignation || "Demonstrator") : (state.user.lecturerDesignation || state.user.role));

  app.innerHTML = `
    <div class="shell">
      <aside class="side">
        <div class="who">
          <span class="brand-kicker">Prime Coders</span>
          <strong>${esc(state.user.name)}</strong>
          <span>${esc(roleBadge)}</span>
        </div>
        ${portalToggle}
        ${items}
        <div class="spacer"></div>
        <button class="nav" id="logout">Sign out</button>
      </aside>
      <main class="main">${inner}</main>
    </div>`;
  app.querySelectorAll("[data-page]").forEach((b) => b.onclick = () => { state.page = b.dataset.page; state.message = ""; draw(); });
  app.querySelectorAll("[data-portal-switch]").forEach((b) => b.onclick = () => {
    state.portalMode = b.dataset.portalSwitch;
    state.page = "home";
    state.message = "";
    if (state.portalMode === "lecturer" && state.data && state.data.sections) {
      const mySec = state.data.sections.find((s) => s.lecturerIds?.includes(state.user.lecturerId) || s.lecturers?.some((l) => l.includes("Kulathilake")));
      if (mySec) state.sectionId = mySec.id;
    }
    draw();
  });
  app.querySelector("#logout").onclick = async () => { await api("/api/logout", { method: "POST" }); state.user = null; draw(); };
}

function mysqlStatusBadge() {
  if (!state.mysql) return "";
  if (state.mysql.connected) {
    const isCloud = state.mysql.host && (state.mysql.host.includes("aivencloud") || state.mysql.host.includes(".com"));
    const label = isCloud ? "Aiven Cloud MySQL Connected" : "MySQL 8 Connected";
    const shortHost = isCloud ? "Aiven Cloud" : esc(state.mysql.host);
    return `
      <div class="mysql-box connected">
        <span class="mysql-dot live"></span>
        <div style="flex:1">
          <b>${label}</b>
          <span class="note" style="display:block;margin-top:2px">Host: ${shortHost} · Port: ${esc(state.mysql.port || 3306)} · DB: <code>${esc(state.mysql.database)}</code></span>
        </div>
      </div>`;
  }
  return `
    <div class="mysql-box disconnected">
      <span class="mysql-dot off"></span>
      <div style="flex:1">
        <b>MySQL: Not Connected</b>
        <span class="note" style="display:block;margin-top:2px">Service MySQL80 running. Connect with password.</span>
      </div>
      <button type="button" class="btn tiny ghost" id="toggle-mysql-btn">${state.showMysqlConfig ? "Hide" : "Connect"}</button>
    </div>
    ${state.showMysqlConfig ? `
      <div class="mysql-config-box">
        <label>Host</label><input id="my-host" value="${esc(state.mysql?.host || "localhost")}" />
        <label>User</label><input id="my-user" value="${esc(state.mysql?.user || "root")}" />
        <label>Password</label><input id="my-pass" type="password" placeholder="MySQL root password" />
        <label>Database</label><input id="my-db" value="${esc(state.mysql?.database || "prime_coders_attendance")}" />
        <p class="error" id="my-err">${esc(state.mysql?.error || "")}</p>
        <button type="button" class="btn gold tiny" id="save-mysql-btn" style="margin-top:8px">Test & Save Connection</button>
      </div>` : ""}`;
}

async function loadUnregisteredLecturers() {
  try {
    const res = await api("/api/auth/unregistered-lecturers");
    state.unregisteredLecturers = res.lecturers || [];
  } catch {
    state.unregisteredLecturers = [];
  }
}

function login() {
  const tabs = `
    <div class="auth-tabs">
      <button type="button" class="auth-tab ${state.authTab === "login" ? "active" : ""}" data-tab="login">Sign In</button>
      <button type="button" class="auth-tab ${state.authTab === "student" ? "active" : ""}" data-tab="student">Student First-Time Setup</button>
      <button type="button" class="auth-tab ${state.authTab === "lecturer" ? "active" : ""}" data-tab="lecturer">Lecturer Setup</button>
    </div>`;

  let formHtml = "";
  if (state.authTab === "login") {
    formHtml = `
      ${mysqlStatusBadge()}
      <form id="login">
        <label>University or approved email</label>
        <input name="email" type="email" required placeholder="name@rjt.ac.lk" />
        <label>Password</label>
        <input name="password" type="password" required placeholder="Enter password" />
        <p class="error" id="err"></p>
        <button class="btn gold" type="submit" style="margin-top:6px">Enter the system</button>
      </form>`;
  } else if (state.authTab === "student") {
    formHtml = `
      <div class="kicker" style="margin-bottom:4px">Registration Portal</div>
      <h3 style="margin-bottom:8px">Activate Student Account</h3>
      <p class="note" style="margin-bottom:14px">Enter your assigned registration number (e.g. <b>ICT/2024/001</b>) and university email. Your account will automatically connect to your attendance and eligibility sheet.</p>
      <div style="margin-bottom:10px">
        <label>Registration Number</label>
        <div style="display:flex;gap:8px">
          <input id="st-reg" placeholder="ICT/2024/001" style="flex:1;text-transform:uppercase" />
          <button type="button" class="btn tiny ghost" id="check-reg-btn">Verify</button>
        </div>
        <div id="reg-info" class="note" style="margin-top:4px;color:var(--teal)"></div>
      </div>
      <label>University Email</label>
      <input id="st-email" type="email" placeholder="e.g. ict2024001@rjt.ac.lk" />
      <label>Create Password</label>
      <input id="st-pass" type="password" placeholder="At least 5 characters" />
      <label>Confirm Password</label>
      <input id="st-conf" type="password" placeholder="Re-enter password" />
      <p class="error" id="st-err"></p>
      <button class="btn gold" id="st-submit" type="button" style="margin-top:6px">Create Account & Sign In</button>`;
  } else if (state.authTab === "lecturer") {
    const lecOptions = state.unregisteredLecturers.map((l) => {
      const des = l.designation || (l.role === "demo" ? "Demonstrator" : (l.isVisiting ? "Visiting Lecturer" : "Lecturer"));
      const qual = l.qualification ? `${esc(l.qualification)} · ` : "";
      return `<option value="${l.id}">${esc(l.name)} (${qual}${esc(des)})</option>`;
    }).join("");
    formHtml = `
      <div class="kicker" style="margin-bottom:4px">Academic Staff & Demonstrators</div>
      <h3 style="margin-bottom:8px">Lecturer & Demonstrator First-Time Activation</h3>
      <p class="note" style="margin-bottom:12px">All departmental lecturers and demonstrators can activate their official university email account to view and mark attendance.</p>
      <label>Your Name</label>
      <select id="lec-select">${lecOptions || `<option value="">No unactivated staff found (or all lecturers/demos already activated)</option>`}</select>
      <label>Official University Email</label>
      <input id="lec-email" type="email" placeholder="name@rjt.ac.lk" />
      <label>Create Password</label>
      <input id="lec-pass" type="password" placeholder="At least 5 characters" />
      <label>Confirm Password</label>
      <input id="lec-conf" type="password" placeholder="Re-enter password" />
      <p class="error" id="lec-err"></p>
      <button class="btn gold" id="lec-submit" type="button" style="margin-top:6px">Activate Account</button>`;
  }

  app.innerHTML = `
    <section class="login">
      <div class="login-hero">
        <div>
          <div class="brand-kicker">Rajarata University · Department of Computing</div>
          <h1>Attendance, held to the semester’s real rules.</h1>
          <p>Fifteen weeks. Lecturers mark until Week 14. After that, only the Head of Department can change a record. Eligibility is 80%.</p>
          <div class="rule-list">
            <span>Present · Absent · Medical · Excused</span>
            <span>3-day absence alert</span>
            <span>6 medicals alert</span>
          </div>
        </div>
        <div>ICT 1407 · Prime Coders · Student Attendance Management System</div>
      </div>
      <div class="login-panel">
        <div class="card login-card">
          ${tabs}
          ${formHtml}
        </div>
      </div>
    </section>`;

  app.querySelectorAll("[data-tab]").forEach((b) => b.onclick = async () => {
    state.authTab = b.dataset.tab;
    if (state.authTab === "lecturer") await loadUnregisteredLecturers();
    login();
  });

  if (state.authTab === "login") {
    app.querySelectorAll("[data-email]").forEach((b) => b.onclick = async () => {
      if (b.dataset.portal === "tab") {
        state.authTab = "lecturer";
        await loadUnregisteredLecturers();
        login();
        return;
      }
      app.querySelector("[name=email]").value = b.dataset.email;
      state.intendedPortal = b.dataset.portal || null;
    });
    const toggleBtn = app.querySelector("#toggle-mysql-btn");
    if (toggleBtn) {
      toggleBtn.onclick = () => {
        state.showMysqlConfig = !state.showMysqlConfig;
        login();
      };
    }
    const saveBtn = app.querySelector("#save-mysql-btn");
    if (saveBtn) {
      saveBtn.onclick = async () => {
        saveBtn.disabled = true;
        saveBtn.textContent = "Connecting...";
        const errEl = app.querySelector("#my-err");
        errEl.textContent = "";
        try {
          const payload = {
            host: app.querySelector("#my-host").value.trim(),
            port: 3306,
            user: app.querySelector("#my-user").value.trim(),
            password: app.querySelector("#my-pass").value,
            database: app.querySelector("#my-db").value.trim(),
          };
          const res = await api("/api/mysql/connect", { method: "POST", body: payload });
          state.mysql = res;
          state.showMysqlConfig = false;
          login();
        } catch (err) {
          errEl.textContent = err.message;
          saveBtn.disabled = false;
          saveBtn.textContent = "Test & Save Connection";
        }
      };
    }
    app.querySelector("#login").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const res = await api("/api/login", { method: "POST", body: { email: fd.get("email"), password: fd.get("password") } });
        state.user = res.user;
        state.portalMode = (state.user.role === "hod" && state.intendedPortal === "lecturer") ? "lecturer" : "hod";
        state.page = "home";
        await refresh();
      } catch (err) {
        app.querySelector("#err").textContent = err.message;
      }
    };
  } else if (state.authTab === "student") {
    const regIn = app.querySelector("#st-reg");
    const regInfo = app.querySelector("#reg-info");
    const checkBtn = app.querySelector("#check-reg-btn");
    const checkReg = async () => {
      const reg = regIn.value.trim().toUpperCase();
      if (!reg) return;
      regInfo.textContent = "Verifying...";
      try {
        const res = await api("/api/auth/check-student-reg?reg=" + encodeURIComponent(reg));
        if (res.alreadyRegistered) {
          regInfo.textContent = `Found: ${res.name} (Index: ${res.indexNo}) — ⚠️ Account already registered!`;
          regInfo.style.color = "var(--coral)";
        } else {
          regInfo.textContent = `✓ Student Found: ${res.name} (Index: ${res.indexNo})`;
          regInfo.style.color = "var(--ok)";
        }
      } catch (err) {
        regInfo.textContent = err.message;
        regInfo.style.color = "var(--coral)";
      }
    };
    checkBtn.onclick = checkReg;
    regIn.onblur = checkReg;

    app.querySelector("#st-submit").onclick = async () => {
      const errEl = app.querySelector("#st-err");
      errEl.textContent = "";
      const regNo = regIn.value.trim().toUpperCase();
      const email = app.querySelector("#st-email").value.trim().toLowerCase();
      const pass = app.querySelector("#st-pass").value;
      const conf = app.querySelector("#st-conf").value;
      if (!regNo || !email || !pass) { errEl.textContent = "All fields are required."; return; }
      if (pass !== conf) { errEl.textContent = "Passwords do not match."; return; }
      try {
        const res = await api("/api/auth/register-student", { method: "POST", body: { registrationNo: regNo, email, password: pass } });
        state.user = res.user;
        state.page = "home";
        await refresh();
      } catch (err) {
        errEl.textContent = err.message;
      }
    };
  } else if (state.authTab === "lecturer") {
    app.querySelector("#lec-submit").onclick = async () => {
      const errEl = app.querySelector("#lec-err");
      errEl.textContent = "";
      const lecturerId = Number(app.querySelector("#lec-select").value);
      const email = app.querySelector("#lec-email").value.trim().toLowerCase();
      const pass = app.querySelector("#lec-pass").value;
      const conf = app.querySelector("#lec-conf").value;
      if (!lecturerId) { errEl.textContent = "Please select a lecturer name."; return; }
      if (!email || !pass) { errEl.textContent = "All fields are required."; return; }
      if (pass !== conf) { errEl.textContent = "Passwords do not match."; return; }
      try {
        const res = await api("/api/auth/register-lecturer", { method: "POST", body: { lecturerId, email, password: pass } });
        state.user = res.user;
        state.page = "home";
        await refresh();
      } catch (err) {
        errEl.textContent = err.message;
      }
    };
  }
}

async function refresh() {
  state.data = await api("/api/bootstrap");
  const isLecturerPortal = (state.user?.role === "hod" && state.portalMode === "lecturer") || state.user?.role === "lecturer" || state.user?.role === "demo" || state.user?.role === "visiting";
  if (isLecturerPortal && state.data?.sections) {
    const mySec = state.data.sections.find((s) => s.lecturerIds?.includes(state.user.lecturerId) || (state.user.role === "hod" && state.portalMode === "lecturer" && s.lecturers?.some((l) => l.includes("Kulathilake"))));
    if (mySec && (!state.sectionId || !state.data.sections.some((s) => s.id === state.sectionId))) {
      state.sectionId = mySec.id;
    }
  }
  if (!state.sectionId && state.data.sections[0]) state.sectionId = state.data.sections[0].id;
  draw();
}

function home() {
  const d = state.data;
  const sem = d.semesters.find((s) => s.status === "active" || s.status === "closing") || d.semesters[0];

  const isLecturerPortal = (state.user.role === "hod" && state.portalMode === "lecturer") || state.user.role === "lecturer" || state.user.role === "visiting" || state.user.role === "demo";
  const portalActor = state.user.role === "demo" ? "Demonstrator" : "Lecturer";
  const portalTitle = state.user.role === "demo" ? "Demonstrator Portal" : (isLecturerPortal ? "Lecturer Portal" : "Head of Department");

  const mySections = d.sections.filter((s) => {
    if (state.user.lecturerId && s.lecturerIds?.includes(state.user.lecturerId)) return true;
    if (state.user.role === "hod" && state.portalMode === "lecturer") {
      return s.lecturers?.some((l) => l.includes("Kulathilake"));
    }
    if (state.user.name && s.lecturers?.some((l) => l.toLowerCase().includes(state.user.name.toLowerCase()))) return true;
    return false;
  });
  const mySectionIds = new Set(mySections.map((s) => s.id));

  const mine = isLecturerPortal
    ? d.eligibility.filter((e) => mySectionIds.has(e.sectionId))
    : d.eligibility;

  const displaySectionsCount = isLecturerPortal ? mySections.length : d.sections.length;
  const below = mine.filter((e) => !e.eligible).length;

  const visibleAlerts = isLecturerPortal
    ? d.alerts.filter((a) => !a.sectionId || mySectionIds.has(a.sectionId))
    : d.alerts;
  const newAlerts = visibleAlerts.filter((a) => a.status === "New").length;
  const pendingMed = d.medicals.filter((m) => m.status === "Pending" && (!isLecturerPortal || mySectionIds.has(m.sectionId))).length;

  const assignedSubjectCodes = mySections.map((s) => s.course.code).join(" & ");

  return `
    <div class="top">
      <div>
        <div class="kicker">${esc(d.department.name)} · ${portalTitle}</div>
        <h1>${esc(sem.name)} · Week ${sem.currentWeek} of 15</h1>
        <p class="muted">${isLecturerPortal
          ? `Showing your assigned courses (${esc(assignedSubjectCodes || "Your subjects")}). ${portalActor}s may edit assigned registers until Week 14.`
          : (sem.currentWeek <= 14 ? "Lecturers and demonstrators may still edit assigned sections." : "Editing is closed. Only the HOD can change attendance.")}
        </p>
      </div>
    </div>
    <div class="grid stats">
      <article class="card stat">
        <span>${isLecturerPortal ? "My Assigned Subjects" : "Sections you can see"}</span>
        <b>${displaySectionsCount}</b>
      </article>
      <article class="card stat">
        <span>${isLecturerPortal ? "Student Course Records" : "Eligibility rows"}</span>
        <b>${mine.length}</b>
      </article>
      <article class="card stat">
        <span>Below 80%</span>
        <b>${below}</b>
      </article>
      <article class="card stat">
        <span>Open alerts</span>
        <b>${newAlerts}</b>
      </article>
    </div>
    <div class="split" style="margin-top:14px">
      <section class="card panel">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">
          <div>
            <h3 style="margin:0">${isLecturerPortal ? "Eligibility · My Assigned Subjects Only" : "Eligibility"}</h3>
            ${isLecturerPortal
              ? `<p class="note" style="margin-top:2px;color:var(--ink-soft)">Filtered strictly to your subjects: <b>${esc(assignedSubjectCodes)}</b> (${mine.length} student records)</p>`
              : `<p class="note" style="margin-top:2px">All enrolled department courses (${mine.length} records)</p>`}
          </div>
          ${isLecturerPortal ? `<span class="pill ok">👨‍🏫 Assigned Subjects Only</span>` : ""}
        </div>
        <table>
          <thead><tr><th>Student</th><th>Course</th><th>%</th><th>P / A / M / E</th><th></th></tr></thead>
          <tbody>
            ${mine.slice(0, 15).map((e) => `<tr>
              <td>${esc(e.studentName)}<div class="note">${esc(e.registrationNo)}</div></td>
              <td>${esc(e.course)}${e.sectionCode && e.sectionCode !== "A" ? " " + esc(e.sectionCode) : ""}</td>
              <td>${e.percentage}%</td>
              <td>${e.present}/${e.absent}/${e.medical}/${e.excused}</td>
              <td>${e.exception ? `<span class="pill wait">Exception</span>` : pill(e.eligible)}</td>
            </tr>`).join("") || `<tr><td colspan="5">No eligibility records found for your subjects.</td></tr>`}
          </tbody>
        </table>
      </section>
      <section class="card panel">
        <h3>Needs attention</h3>
        <p class="note">${pendingMed} medical report${pendingMed === 1 ? "" : "s"} waiting.</p>
        ${visibleAlerts.slice(0, 5).map((a) => `<p><span class="pill ${a.status === "New" ? "bad" : "wait"}">${esc(a.type)}</span> ${esc(a.message)}</p>`).join("") || "<p class='muted'>No alerts for your subjects.</p>"}
        ${d.audit?.length ? `<h3 style="margin-top:18px">Recent actions</h3>${d.audit.map((a) => `<p class="note">${esc(a.at.slice(0, 16).replace("T", " "))} · ${esc(a.email)} · ${esc(a.action)}</p>`).join("")}` : ""}
      </section>
    </div>`;
}

async function sheet() {
  const id = state.sectionId || state.data.sections[0]?.id;
  if (!id) return `<h1>No section assigned.</h1>`;
  const pack = await api("/api/attendance/" + id);
  const sem = pack.section.semester;
  const weeks = [];
  for (let w = 1; w <= Math.min(15, sem.currentWeek); w++) weeks.push(w);
  const week = weeks.includes(Number(state.week)) ? Number(state.week) : sem.currentWeek;
  state.week = week;
  const options = state.data.sections.map((s) => {
    const isMine = s.lecturerIds?.includes(state.user.lecturerId) || (state.user.role === "hod" && state.portalMode === "lecturer" && s.lecturers?.some((l) => l.includes("Kulathilake")));
    const tag = isMine ? " · (Assigned to you)" : "";
    const secSuffix = s.code && s.code !== "A" ? ` (${esc(s.code)})` : "";
    return `<option value="${s.id}" ${s.id === id ? "selected" : ""}>${esc(s.course.code)} · ${esc(s.course.name)}${secSuffix}${tag}</option>`;
  }).join("");
  const rows = pack.students.map((s) => {
    const mark = pack.rows.find((r) => r.studentId === s.id && r.weekNo === week);
    const current = mark?.status || "Present";
    return `<tr data-student="${s.id}" data-name="${esc(s.name).toLowerCase()}" data-reg="${esc(s.registrationNo || '').toLowerCase()}" data-index="${esc(s.indexNo || '').toLowerCase()}">
      <td>${esc(s.name)}<div class="note">${esc(s.registrationNo)} · ${esc(s.indexNo)}</div></td>
      <td><select class="mark" ${pack.canEdit ? "" : "disabled"}>
        ${["Present", "Absent", "Medical", "Excused"].map((st) => `<option ${st === current ? "selected" : ""}>${st}</option>`).join("")}
      </select></td>
    </tr>`;
  }).join("");
  const secTitle = pack.section.code && pack.section.code !== "A" ? ` (${esc(pack.section.code)})` : "";
  return `
    <div class="top">
      <div>
        <div class="kicker">Weekly register</div>
        <h1>${esc(pack.section.course.code)} · ${esc(pack.section.course.name)}${secTitle}</h1>
        <p class="muted">${esc(pack.section.days.join(", "))} · ${esc(pack.section.venue)} · ${pack.section.frozen ? "Frozen" : "Open"}</p>
      </div>
      <button class="btn gold" id="save" ${pack.canEdit ? "" : "disabled"}>${pack.canEdit ? "Save this week" : "Editing closed for you"}</button>
    </div>
    <div class="row attendance-toolbar" style="margin-bottom:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <div style="flex:1;min-width:220px">
        <select id="section" style="width:100%">${options}</select>
      </div>
      <div style="width:130px">
        <select id="week" style="width:100%">${weeks.map((w) => `<option value="${w}" ${w === week ? "selected" : ""}>Week ${w}</option>`).join("")}</select>
      </div>
      <div style="flex:1.5;min-width:250px">
        <input id="att-search" type="search" placeholder="🔍 Search student name or Reg No (e.g. 001)..." value="${esc(state.attendanceSearch || "")}" style="width:100%" />
      </div>
    </div>
    <p class="error" id="err">${esc(state.message)}</p>
    <section class="card panel sheet"><table>
      <thead><tr><th>Student</th><th>Status</th></tr></thead>
      <tbody>
        ${rows}
        <tr id="att-no-results" style="display:none"><td colspan="2" style="text-align:center;padding:24px;color:var(--ink-soft)">No students matching "<span id="att-search-query"></span>"</td></tr>
      </tbody>
    </table></section>`;
}

function afterSheet() {
  const section = app.querySelector("#section");
  const week = app.querySelector("#week");
  if (!section) return;
  section.onchange = () => { state.sectionId = Number(section.value); draw(); };
  week.onchange = () => { state.week = Number(week.value); draw(); };

  const searchInput = app.querySelector("#att-search");
  const filterRows = () => {
    const q = (searchInput?.value || "").trim().toLowerCase();
    state.attendanceSearch = searchInput ? searchInput.value : "";
    let visibleCount = 0;
    app.querySelectorAll("tr[data-student]").forEach((tr) => {
      const name = tr.dataset.name || "";
      const reg = tr.dataset.reg || "";
      const idx = tr.dataset.index || "";
      const match = !q || name.includes(q) || reg.includes(q) || idx.includes(q);
      tr.style.display = match ? "" : "none";
      if (match) visibleCount++;
    });
    const noRes = app.querySelector("#att-no-results");
    const qSpan = app.querySelector("#att-search-query");
    if (noRes) {
      noRes.style.display = (visibleCount === 0 && q) ? "" : "none";
      if (qSpan) qSpan.textContent = searchInput?.value || "";
    }
  };
  if (searchInput) {
    searchInput.oninput = filterRows;
    if (state.attendanceSearch) filterRows();
  }

  const save = app.querySelector("#save");
  if (save) save.onclick = async () => {
    const marks = [...app.querySelectorAll("tr[data-student]")].map((tr) => ({
      studentId: Number(tr.dataset.student),
      status: tr.querySelector("select").value,
    }));
    try {
      await api("/api/attendance", { method: "POST", body: { sectionId: state.sectionId, weekNo: state.week, marks } });
      state.message = "Saved.";
      await refresh();
    } catch (err) { state.message = err.message; draw(); }
  };
}

function medicalPage() {
  const d = state.data;
  const sections = d.sections.map((s) => `<option value="${s.id}">${esc(s.course.code)}${s.code && s.code !== "A" ? " " + esc(s.code) : ""}</option>`).join("");
  const form = state.user.role === "student" ? `
    <section class="card panel">
      <h3>Submit a Medical Report</h3>
      <p class="note">Submit within two weeks of the absence. The committee reviews it — approval can convert an Absent into Medical.</p>
      <label>Section</label><select id="msec">${sections}</select>
      <label>Absence From</label><input id="from" type="date" />
      <label>Absence To</label><input id="to" type="date" />
      <label>Note <span class="note" style="font-weight:400">(clinic / hospital name and what it covers)</span></label>
      <textarea id="note" placeholder="e.g. Attended Kandy General Hospital, fever and rest prescribed for 3 days"></textarea>
      <label style="margin-top:8px">Medical Document <span class="note" style="font-weight:400">(PDF, JPG, PNG — max 5 MB, optional)</span></label>
      <div class="med-upload-area" id="med-upload-area">
        <div class="med-upload-icon">📎</div>
        <div class="med-upload-text">Drag &amp; drop your medical certificate here, or</div>
        <label class="btn gold tiny med-upload-btn" for="med-file-input">Choose File</label>
        <input id="med-file-input" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" style="display:none" />
        <div id="med-file-preview" class="med-file-preview" style="display:none"></div>
      </div>
      <p class="error" id="err"></p>
      <button class="btn gold" id="send" style="margin-top:10px">Submit Medical Report</button>
    </section>` : `
    <section class="card panel"><h3>Review</h3><p class="muted">Accept or reject pending reports below.</p></section>`;
  const rows = d.medicals.map((m) => {
    const stu = d.students.find((s) => s.id === m.studentId);
    const sec = d.sections.find((s) => s.id === m.sectionId);
    const actions = (state.user.role === "committee" || state.user.role === "hod") && m.status === "Pending"
      ? `<button class="btn tiny" data-med="${m.id}" data-st="Approved">Accept</button> <button class="btn tiny ghost" data-med="${m.id}" data-st="Rejected">Reject</button>`
      : "";
    const attachLink = m.attachmentUrl
      ? `<a class="pill wait" href="${esc(m.attachmentUrl)}" target="_blank" title="${esc(m.attachmentName || 'View file')}" style="text-decoration:none;font-size:11px">📎 ${esc(m.attachmentName ? m.attachmentName.slice(0, 24) + (m.attachmentName.length > 24 ? "…" : "") : "Document")}</a>`
      : `<span class="note" style="font-size:11px;color:var(--ink-soft)">No file</span>`;
    return `<tr>
      <td>${esc(stu?.name || m.studentId)}<div class="note">${esc(stu?.registrationNo || "")}</div></td>
      <td>${esc(sec?.course?.code || "")}</td>
      <td>${esc(m.from)} → ${esc(m.to)}</td>
      <td>${esc(m.note || "")}</td>
      <td>${attachLink}</td>
      <td>${statusPill(m.status)}</td>
      <td>${actions}</td>
    </tr>`;
  }).join("");
  return `<div class="top"><div><div class="kicker">Medical reports</div><h1>Covered absences</h1></div></div>
    <div class="split">${form}<section class="card panel sheet"><table>
      <thead><tr><th>Student</th><th>Course</th><th>Dates</th><th>Note</th><th>Document</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="7">No medical reports yet.</td></tr>`}</tbody>
    </table></section></div>`;
}
function afterMedical() {
  const fileInput = app.querySelector("#med-file-input");
  const uploadArea = app.querySelector("#med-upload-area");
  const filePreview = app.querySelector("#med-file-preview");
  let attachedFile = null;

  const showFilePreview = (file) => {
    if (!file || !filePreview) return;
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    const sizeKb = (file.size / 1024).toFixed(0);
    filePreview.style.display = "flex";
    filePreview.innerHTML = `
      <div class="med-file-info">
        <span class="med-file-icon">${isPdf ? "📄" : isImage ? "🖼️" : "📎"}</span>
        <div>
          <div style="font-weight:600;font-size:13px">${esc(file.name)}</div>
          <div class="note">${sizeKb} KB · ${esc(file.type || "file")}</div>
        </div>
      </div>
      <button type="button" class="btn tiny ghost" id="med-remove-file">Remove</button>
    `;
    app.querySelector("#med-remove-file").onclick = () => {
      attachedFile = null;
      fileInput.value = "";
      filePreview.style.display = "none";
      filePreview.innerHTML = "";
      if (uploadArea) uploadArea.classList.remove("has-file");
    };
    if (uploadArea) uploadArea.classList.add("has-file");
  };

  if (fileInput) {
    fileInput.onchange = () => {
      const file = fileInput.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        app.querySelector("#err").textContent = "File too large — maximum 5 MB.";
        fileInput.value = "";
        return;
      }
      attachedFile = file;
      showFilePreview(file);
    };
  }

  if (uploadArea) {
    uploadArea.ondragover = (e) => { e.preventDefault(); uploadArea.classList.add("dragover"); };
    uploadArea.ondragleave = () => uploadArea.classList.remove("dragover");
    uploadArea.ondrop = (e) => {
      e.preventDefault();
      uploadArea.classList.remove("dragover");
      const file = e.dataTransfer.files[0];
      if (!file) return;
      if (!["application/pdf", "image/jpeg", "image/png", "image/webp", "image/jpg"].includes(file.type)) {
        app.querySelector("#err").textContent = "Only PDF, JPG, or PNG files are allowed.";
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        app.querySelector("#err").textContent = "File too large — maximum 5 MB.";
        return;
      }
      attachedFile = file;
      showFilePreview(file);
    };
  }

  const sendBtn = app.querySelector("#send");
  if (sendBtn) sendBtn.onclick = async () => {
    const errEl = app.querySelector("#err");
    errEl.textContent = "";
    const fromVal = app.querySelector("#from").value;
    const toVal = app.querySelector("#to").value;
    if (!fromVal) { errEl.textContent = "Please set the absence From date."; return; }
    sendBtn.disabled = true;
    sendBtn.textContent = "Submitting…";

    try {
      let fileBase64 = null;
      let fileName = null;
      let fileType = null;

      if (attachedFile) {
        const buf = await attachedFile.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = "";
        bytes.forEach(b => binary += String.fromCharCode(b));
        fileBase64 = btoa(binary);
        fileName = attachedFile.name;
        fileType = attachedFile.type;
      }

      await api("/api/medicals", { method: "POST", body: {
        sectionId: Number(app.querySelector("#msec").value),
        from: fromVal,
        to: toVal || fromVal,
        note: app.querySelector("#note").value,
        fileBase64,
        fileName,
        fileType,
      }});
      await refresh();
    } catch (err) {
      errEl.textContent = err.message;
      sendBtn.disabled = false;
      sendBtn.textContent = "Submit Medical Report";
    }
  };

  app.querySelectorAll("[data-med]").forEach((b) => b.onclick = async () => {
    await api(`/api/medicals/${b.dataset.med}/review`, { method: "POST", body: { status: b.dataset.st } });
    await refresh();
  });
}

function requestPage() {
  const d = state.data;
  const sections = d.sections.map((s) => `<option value="${s.id}">${esc(s.course.code)}${s.code && s.code !== "A" ? " " + esc(s.code) : ""}</option>`).join("");
  const form = state.user.role === "student" ? `
    <section class="card panel"><h3>Ask for an exception</h3>
      <label>Section</label><select id="rsec">${sections}</select>
      <label>Type</label><select id="rtype"><option>Excuse</option><option>Other</option></select>
      <label>Reason</label><textarea id="reason"></textarea>
      <p class="error" id="err"></p>
      <button class="btn gold" id="rsend">Submit request</button>
    </section>` : `<section class="card panel"><h3>Authority</h3><p class="muted">The committee recommends. It never writes the attendance mark. After Week 14, only the HOD applies a change.</p></section>`;
  const rows = d.requests.map((r) => {
    const stu = d.students.find((s) => s.id === r.studentId);
    let actions = "";
    if (state.user.role === "committee" && r.status === "Pending") {
      actions = `<button class="btn tiny" data-rec="${r.id}" data-stance="Recommend">Recommend</button> <button class="btn tiny ghost" data-rec="${r.id}" data-stance="Reject">Do not</button>`;
    }
    if (state.user.role === "hod" && (r.status === "Recommended" || r.status === "Pending")) {
      actions = `<button class="btn tiny" data-dec="${r.id}" data-ok="1">Approve</button> <button class="btn tiny ghost" data-dec="${r.id}" data-ok="0">Reject</button>`;
    }
    return `<tr><td>${esc(stu?.name)}</td><td>${esc(r.type)} · W${r.weekNo}</td><td>${esc(r.reason)}</td><td>${statusPill(r.status)}<div class="note">${esc(r.recommendation || r.hodDecision || "")}</div></td><td>${actions}</td></tr>`;
  }).join("");
  return `<div class="top"><div><div class="kicker">Student requests</div><h1>Exceptions</h1></div></div>
    <div class="split">${form}<section class="card panel"><table><thead><tr><th>Student</th><th>Type</th><th>Reason</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></section></div>`;
}
function afterRequests() {
  const send = app.querySelector("#rsend");
  if (send) send.onclick = async () => {
    try {
      await api("/api/requests", { method: "POST", body: {
        sectionId: Number(app.querySelector("#rsec").value),
        type: app.querySelector("#rtype").value,
        reason: app.querySelector("#reason").value,
      }});
      await refresh();
    } catch (err) { app.querySelector("#err").textContent = err.message; }
  };
  app.querySelectorAll("[data-rec]").forEach((b) => b.onclick = async () => {
    const recommendation = prompt("Recommendation for the HOD") || "";
    await api(`/api/requests/${b.dataset.rec}/recommend`, { method: "POST", body: { stance: b.dataset.stance, recommendation } });
    await refresh();
  });
  app.querySelectorAll("[data-dec]").forEach((b) => b.onclick = async () => {
    const note = prompt("HOD decision note") || "";
    const weekNo = b.dataset.ok === "1" ? Number(prompt("Week number to mark Excused (blank to leave marks)", "7") || 0) : 0;
    await api(`/api/requests/${b.dataset.dec}/decide`, { method: "POST", body: { approve: b.dataset.ok === "1", note, weekNo } });
    await refresh();
  });
}

function alertsPage() {
  const isLecturerPortal = (state.user.role === "hod" && state.portalMode === "lecturer") || state.user.role === "lecturer" || state.user.role === "visiting" || state.user.role === "demo";
  const mySections = state.data.sections.filter((s) =>
    s.lecturerIds?.includes(state.user.lecturerId) ||
    s.lecturers?.some((l) => l.includes(state.user.name) || (state.portalMode === "lecturer" && state.user.role === "hod" && l.includes("Kulathilake")))
  );
  const mySectionIds = new Set(mySections.map((s) => s.id));
  const list = isLecturerPortal
    ? state.data.alerts.filter((a) => !a.sectionId || mySectionIds.has(a.sectionId))
    : state.data.alerts;

  const rows = list.map((a) => `<tr>
    <td>${statusPill(a.status)}</td><td>${esc(a.type)}</td><td>${esc(a.message)}</td><td>${esc(a.date)}</td>
    <td><button class="btn tiny ghost" data-alert="${a.id}" data-st="Viewed">Viewed</button>
        <button class="btn tiny" data-alert="${a.id}" data-st="Handled">Handled</button></td>
  </tr>`).join("");
  return `<div class="top"><div><div class="kicker">Alerts · ${isLecturerPortal ? "My Subjects" : "All Sections"}</div><h1>Patterns the rules care about</h1><p class="muted">${isLecturerPortal ? "Showing alerts related to your assigned courses." : "Three consecutive absences go to the lecturer. Six or more medical reports go to the committee."}</p></div></div>
    <section class="card panel"><table><thead><tr><th></th><th>Type</th><th>Message</th><th>Date</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="5">None for your subjects.</td></tr>`}</tbody></table></section>`;
}
function afterAlerts() {
  app.querySelectorAll("[data-alert]").forEach((b) => b.onclick = async () => {
    await api("/api/alerts/" + b.dataset.alert, { method: "POST", body: { status: b.dataset.st } });
    await refresh();
  });
}

async function reportPage() {
  const id = state.sectionId || state.data.sections[0]?.id;
  if (!id) return `<h1>Nothing to report.</h1>`;
  const rep = await api("/api/report?sectionId=" + id);
  const options = state.data.sections.map((s) => `<option value="${s.id}" ${s.id === id ? "selected" : ""}>${esc(s.course.code)}${s.code && s.code !== "A" ? " " + esc(s.code) : ""} · ${esc(s.course.name)}</option>`).join("");
  const head = Array.from({ length: 15 }, (_, i) => `<th>${i + 1}</th>`).join("");
  const body = rep.people.map((p) => `<tr>
    <td>${esc(p.student.name)}<div class="note">${esc(p.student.indexNo)}</div></td>
    ${Array.from({ length: 15 }, (_, i) => `<td>${esc((p.marks[i + 1] || "").slice(0, 1))}</td>`).join("")}
    <td>${p.eligibility ? p.eligibility.percentage + "%" : "—"}</td>
    <td>${p.eligibility ? pill(p.eligibility.eligible) : ""}</td>
  </tr>`).join("");
  return `<div class="top"><div><div class="kicker">Semester sheet</div><h1>${esc(rep.section.course.code)}${rep.section.code && rep.section.code !== "A" ? " " + esc(rep.section.code) : ""} · ${esc(rep.section.course.name)}</h1>
    <p class="muted">P present, A absent, M medical, E excused. Percentage counts Present, Medical, and Excused.</p></div></div>
    <select id="section" style="max-width:400px;margin-bottom:12px">${options}</select>
    <section class="card panel sheet"><table><thead><tr><th>Student</th>${head}<th>%</th><th></th></tr></thead><tbody>${body}</tbody></table></section>`;
}
function afterReport() {
  const section = app.querySelector("#section");
  if (section) section.onchange = () => { state.sectionId = Number(section.value); draw(); };
}

function adminPage() {
  const sem = state.data.semesters.map((s) => `<p><b>${esc(s.name)}</b> ${esc(s.year)} · week ${s.currentWeek} · ${esc(s.status)}</p>`).join("");
  const sections = state.data.sections.map((s) => `<option value="${s.id}">${esc(s.course.code)}${s.code && s.code !== "A" ? " " + esc(s.code) : ""}${s.frozen ? " (frozen)" : ""}</option>`).join("");
  return `<div class="top"><div><div class="kicker">Head of Department</div><h1>Semester control</h1></div></div>
    <div class="grid" style="grid-template-columns:1fr 1fr 1fr">
      <section class="card panel"><h3>Move the week</h3><p class="note">Use this to demonstrate the Week 14 lock. Week 15 closes lecturer editing.</p>
        <label>Week</label><input id="weekn" type="number" min="1" max="15" value="${state.data.semesters[0].currentWeek}" />
        <button class="btn" id="setweek" style="margin-top:10px">Set current week</button>
        <div style="margin-top:12px">${sem}</div>
      </section>
      <section class="card panel"><h3>Open next semester</h3>
        <label>Name</label><input id="sname" value="Year 1 Semester 1" />
        <label>Year</label><input id="syear" value="2026/2027" />
        <button class="btn" id="newsem" style="margin-top:10px">Create 15-week structure</button>
      </section>
      <section class="card panel"><h3>Freeze a section</h3>
        <select id="fsec">${sections}</select>
        <label>Reason</label><textarea id="freason" placeholder="Approved departmental situation"></textarea>
        <label class="row"><input id="force" type="checkbox" style="width:auto" /> Record students as eligible</label>
        <button class="btn" id="freeze">Freeze</button>
      </section>
    </div>
    <section class="card panel" style="margin-top:14px;background:#fefdfa;border:2px solid var(--gold)">
      <div class="kicker">HOD Master Action</div>
      <h3 style="margin-top:4px">Import Official Excel Attendance Sheet</h3>
      <p class="note" style="margin-bottom:14px;max-width:80ch">
        Import the department Excel workbook (<b>Attendance_Record_Only_Selected_Pages.xlsx</b>). This will:
        <br />• <b>End the previous semester</b> and initialize a new 2024/2025 semester.
        <br />• <b>Remove previous mock/dump records</b> and clean up the database.
        <br />• <b>Import all 7 courses, 4 lecturers, 120 students, and 5,280 attendance records</b>.
        <br />• Allow students to activate their accounts using their <code>ICT/2024/xxx</code> registration numbers.
      </p>
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <button class="btn gold" id="import-default-excel">⚡ Import "Attendance_Record_Only_Selected_Pages.xlsx"</button>
        <span class="note">or choose another sheet:</span>
        <input type="file" id="excel-file-input" accept=".xlsx, .xls" style="max-width:260px" />
      </div>
      <div id="excel-import-status" style="margin-top:10px"></div>
    </section>

    <section class="card panel" style="margin-top:14px">
      <div class="kicker">Academic Faculty</div>
      <h3 style="margin-top:4px">Visiting Lecturers & Course Assignments</h3>
      <p class="note">Visiting lecturers can view assigned courses, track attendance, and edit registers. Add new visiting lecturers and assign them to lecture or practical sections.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:12px">
        <div>
          <h4>Add New Visiting Lecturer</h4>
          <label>Lecturer Full Name</label>
          <input id="vl-name" placeholder="e.g. Dr. M. Bandara" />
          <label>Qualification / Role</label>
          <input id="vl-qual" placeholder="e.g. PhD, Senior Lecturer" />
          <label>Assign to Section</label>
          <select id="vl-sec">${sections}</select>
          <button class="btn gold tiny" id="vl-add-btn" style="margin-top:10px">Add Lecturer & Assign</button>
          <p class="error" id="vl-err"></p>
        </div>
        <div>
          <h4>Current Course Lecturers</h4>
          <div style="max-height:220px;overflow:auto">
            <table>
              <thead><tr><th>Course</th><th>Assigned Lecturer</th></tr></thead>
              <tbody>
                ${state.data.sections.map((sec) => `<tr>
                  <td><b>${esc(sec.course.code)}</b>${sec.code && sec.code !== "A" ? " " + esc(sec.code) : ""}</td>
                  <td>${esc((sec.lecturers || []).join(", ") || "Unassigned")}</td>
                </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>`;
}
function afterAdmin() {
  const err = (e) => { const n = app.querySelector("#err"); if (n) n.textContent = e.message; };
  app.querySelector("#setweek").onclick = async () => {
    try { await api("/api/semester/week", { method: "POST", body: { week: Number(app.querySelector("#weekn").value), semesterId: state.data.semesters[0].id } }); await refresh(); }
    catch (e) { err(e); }
  };
  app.querySelector("#newsem").onclick = async () => {
    try { await api("/api/semesters", { method: "POST", body: { name: app.querySelector("#sname").value, year: app.querySelector("#syear").value } }); await refresh(); }
    catch (e) { err(e); }
  };
  app.querySelector("#freeze").onclick = async () => {
    try {
      await api("/api/freeze", { method: "POST", body: {
        sectionId: Number(app.querySelector("#fsec").value),
        reason: app.querySelector("#freason").value,
        forceEligible: app.querySelector("#force").checked,
      }});
      await refresh();
    } catch (e) { err(e); }
  };

  const importStatus = app.querySelector("#excel-import-status");
  const defaultBtn = app.querySelector("#import-default-excel");
  const fileInput = app.querySelector("#excel-file-input");

  if (defaultBtn) {
    defaultBtn.onclick = async () => {
      defaultBtn.disabled = true;
      defaultBtn.textContent = "Importing & processing 5,280 records...";
      importStatus.innerHTML = `<span class="note" style="color:var(--gold-deep)">Reading Excel sheets and updating database...</span>`;
      try {
        const res = await api("/api/hod/import-excel", { method: "POST", body: { useDefaultFile: true } });
        const s = res.summary;
        importStatus.innerHTML = `
          <div style="background:#f0fdf4;border:1px solid #86efac;color:#166534;padding:12px;border-radius:10px">
            <b>✓ Excel Import Complete!</b>
            <div style="margin-top:4px;font-size:13px">
              Created new semester <b>${esc(s.semester.name)}</b>.
              <br />• Courses: <b>${s.coursesCount}</b> (${s.enrollmentsCount} enrollments)
              <br />• Lecturers: <b>${s.lecturersCount}</b>
              <br />• Students: <b>${s.studentsCount}</b> (Ready for <code>ICT/2024/xxx</code> first-time login)
              <br />• Attendance records: <b>${s.attendanceCount}</b> imported!
            </div>
          </div>`;
        await refresh();
      } catch (e) {
        defaultBtn.disabled = false;
        defaultBtn.textContent = "⚡ Import \"Attendance_Record_Only_Selected_Pages.xlsx\"";
        importStatus.innerHTML = `<div class="error">Import failed: ${esc(e.message)}</div>`;
      }
    };
  }

  if (fileInput) {
    fileInput.onchange = async () => {
      const file = fileInput.files[0];
      if (!file) return;
      importStatus.innerHTML = `<span class="note">Reading ${esc(file.name)}...</span>`;
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result.split(",")[1];
        try {
          const res = await api("/api/hod/import-excel", { method: "POST", body: { fileBase64: base64, fileName: file.name } });
          const s = res.summary;
          importStatus.innerHTML = `
            <div style="background:#f0fdf4;border:1px solid #86efac;color:#166534;padding:12px;border-radius:10px">
              <b>✓ ${esc(file.name)} Imported!</b>
              <div style="margin-top:4px;font-size:13px">
                • Courses: <b>${s.coursesCount}</b> · Students: <b>${s.studentsCount}</b> · Attendance marks: <b>${s.attendanceCount}</b>
              </div>
            </div>`;
          await refresh();
        } catch (e) {
          importStatus.innerHTML = `<div class="error">Upload failed: ${esc(e.message)}</div>`;
        }
      };
      reader.readAsDataURL(file);
    };
  }

  const addVlBtn = app.querySelector("#vl-add-btn");
  if (addVlBtn) {
    addVlBtn.onclick = async () => {
      const name = app.querySelector("#vl-name").value.trim();
      const qual = app.querySelector("#vl-qual").value.trim();
      const secId = Number(app.querySelector("#vl-sec").value);
      const errEl = app.querySelector("#vl-err");
      errEl.textContent = "";
      if (!name) { errEl.textContent = "Lecturer name is required."; return; }
      try {
        await api("/api/hod/add-lecturer", { method: "POST", body: { name, qualification: qual, sectionId: secId } });
        await refresh();
      } catch (e) {
        errEl.textContent = e.message;
      }
    };
  }
}

async function draw() {
  if (!state.user) { login(); return; }
  let inner = "";
  if (state.page === "home") inner = home();
  else if (state.page === "sheet") inner = await sheet();
  else if (state.page === "medical") inner = medicalPage();
  else if (state.page === "requests") inner = requestPage();
  else if (state.page === "alerts") inner = alertsPage();
  else if (state.page === "report") inner = await reportPage();
  else if (state.page === "admin") inner = adminPage();
  shell(inner);
  if (state.page === "sheet") afterSheet();
  if (state.page === "medical") afterMedical();
  if (state.page === "requests") afterRequests();
  if (state.page === "alerts") afterAlerts();
  if (state.page === "report") afterReport();
  if (state.page === "admin") afterAdmin();
}

async function init() {
  try {
    state.mysql = await api("/api/mysql/status");
  } catch (e) {
    state.mysql = { connected: false, error: e.message };
  }
  try {
    const r = await api("/api/me");
    state.user = r.user;
    await refresh();
  } catch {
    login();
  }
}

init();
