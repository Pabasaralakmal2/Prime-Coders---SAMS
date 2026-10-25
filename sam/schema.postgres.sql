-- Prime Coders · Student Attendance Management System
-- PostgreSQL / Supabase Schema

CREATE TABLE IF NOT EXISTS roles (
  role_code VARCHAR(32) PRIMARY KEY,
  label VARCHAR(80) NOT NULL
);

CREATE TABLE IF NOT EXISTS departments (
  department_id SERIAL PRIMARY KEY,
  department_name VARCHAR(160) NOT NULL UNIQUE,
  faculty VARCHAR(160) NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  user_id SERIAL PRIMARY KEY,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role_code VARCHAR(32) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS semesters (
  semester_id SERIAL PRIMARY KEY,
  semester_name VARCHAR(80) NOT NULL,
  academic_year VARCHAR(20) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  week_count SMALLINT NOT NULL DEFAULT 15,
  current_week SMALLINT NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'preparing',
  CONSTRAINT uq_semester UNIQUE (academic_year, semester_name)
);

CREATE TABLE IF NOT EXISTS students (
  student_id SERIAL PRIMARY KEY,
  user_id INT NULL UNIQUE REFERENCES users(user_id) ON DELETE SET NULL,
  registration_no VARCHAR(40) NOT NULL UNIQUE,
  index_no VARCHAR(20) NOT NULL UNIQUE,
  name_with_initials VARCHAR(160) NOT NULL,
  phone_no VARCHAR(30),
  date_of_admission DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS lecturers (
  lecturer_id SERIAL PRIMARY KEY,
  user_id INT NULL UNIQUE REFERENCES users(user_id) ON DELETE SET NULL,
  employee_no VARCHAR(40) NOT NULL UNIQUE,
  name_with_initials VARCHAR(160) NOT NULL,
  phone_no VARCHAR(30),
  qualification VARCHAR(120),
  status VARCHAR(20) NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS visiting_lecturers (
  vl_id SERIAL PRIMARY KEY,
  lecturer_id INT NOT NULL UNIQUE REFERENCES lecturers(lecturer_id),
  organization VARCHAR(160),
  expertise_area VARCHAR(160)
);

CREATE TABLE IF NOT EXISTS coordinators (
  coordinator_id SERIAL PRIMARY KEY,
  lecturer_id INT NOT NULL UNIQUE REFERENCES lecturers(lecturer_id),
  role_title VARCHAR(80),
  assigned_area VARCHAR(160)
);

CREATE TABLE IF NOT EXISTS vl_coordination (
  vl_id INT PRIMARY KEY REFERENCES visiting_lecturers(vl_id),
  coordinator_id INT NOT NULL REFERENCES coordinators(coordinator_id)
);

CREATE TABLE IF NOT EXISTS hods (
  hod_id SERIAL PRIMARY KEY,
  user_id INT NOT NULL UNIQUE REFERENCES users(user_id),
  department_id INT NOT NULL UNIQUE REFERENCES departments(department_id),
  name_with_initials VARCHAR(160) NOT NULL,
  phone_no VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS committees (
  committee_id SERIAL PRIMARY KEY,
  committee_name VARCHAR(160) NOT NULL UNIQUE,
  description VARCHAR(400)
);

CREATE TABLE IF NOT EXISTS committee_members (
  member_id SERIAL PRIMARY KEY,
  user_id INT NOT NULL UNIQUE REFERENCES users(user_id),
  committee_id INT NOT NULL REFERENCES committees(committee_id),
  name_with_initials VARCHAR(160) NOT NULL,
  role_title VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS courses (
  course_id SERIAL PRIMARY KEY,
  course_code VARCHAR(20) NOT NULL UNIQUE,
  course_name VARCHAR(160) NOT NULL,
  credit_value NUMERIC(3,1) NOT NULL,
  course_type VARCHAR(20) NOT NULL
);

CREATE TABLE IF NOT EXISTS course_sections (
  section_id SERIAL PRIMARY KEY,
  course_id INT NOT NULL REFERENCES courses(course_id),
  semester_id INT NOT NULL REFERENCES semesters(semester_id),
  section_code VARCHAR(20) NOT NULL,
  lecture_days VARCHAR(80) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  venue VARCHAR(80),
  frozen BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT uq_section UNIQUE (course_id, section_code, semester_id)
);

CREATE TABLE IF NOT EXISTS lecturer_assignments (
  assignment_id SERIAL PRIMARY KEY,
  section_id INT NOT NULL REFERENCES course_sections(section_id),
  lecturer_id INT NOT NULL REFERENCES lecturers(lecturer_id),
  CONSTRAINT uq_assign UNIQUE (section_id, lecturer_id)
);

CREATE TABLE IF NOT EXISTS enrollments (
  enrollment_id SERIAL PRIMARY KEY,
  section_id INT NOT NULL REFERENCES course_sections(section_id),
  student_id INT NOT NULL REFERENCES students(student_id),
  CONSTRAINT uq_enroll UNIQUE (section_id, student_id)
);

CREATE TABLE IF NOT EXISTS attendance (
  attendance_id SERIAL PRIMARY KEY,
  section_id INT NOT NULL REFERENCES course_sections(section_id),
  student_id INT NOT NULL REFERENCES students(student_id),
  attendance_date DATE NOT NULL,
  week_no SMALLINT NOT NULL,
  status VARCHAR(20) NOT NULL,
  recorded_by INT NOT NULL REFERENCES users(user_id),
  recorded_time TIMESTAMP NOT NULL,
  CONSTRAINT uq_mark UNIQUE (student_id, section_id, attendance_date)
);

CREATE TABLE IF NOT EXISTS medical_reports (
  medical_id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(student_id),
  section_id INT NOT NULL REFERENCES course_sections(section_id),
  submission_date DATE NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  note VARCHAR(500),
  attachment_url TEXT NULL,
  attachment_name VARCHAR(255) NULL,
  attachment_type VARCHAR(100) NULL,
  review_status VARCHAR(20) NOT NULL DEFAULT 'Pending',
  reviewed_by INT NULL
);

CREATE TABLE IF NOT EXISTS student_requests (
  request_id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(student_id),
  section_id INT NOT NULL REFERENCES course_sections(section_id),
  request_type VARCHAR(40) NOT NULL,
  request_date DATE NOT NULL,
  week_no SMALLINT NOT NULL,
  reason VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Pending',
  recommendation VARCHAR(500),
  hod_decision VARCHAR(500)
);

CREATE TABLE IF NOT EXISTS alerts (
  alert_id SERIAL PRIMARY KEY,
  alert_type VARCHAR(40) NOT NULL,
  alert_date DATE NOT NULL,
  student_id INT NOT NULL REFERENCES students(student_id),
  section_id INT NULL,
  target_role VARCHAR(32) NOT NULL,
  message VARCHAR(400) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'New'
);

CREATE TABLE IF NOT EXISTS eligibility (
  eligibility_id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(student_id),
  section_id INT NOT NULL REFERENCES course_sections(section_id),
  semester_id INT NOT NULL REFERENCES semesters(semester_id),
  present_count INT NOT NULL DEFAULT 0,
  absent_count INT NOT NULL DEFAULT 0,
  medical_count INT NOT NULL DEFAULT 0,
  excused_count INT NOT NULL DEFAULT 0,
  total_attendance INT NOT NULL DEFAULT 0,
  attendance_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  eligible_flag BOOLEAN NOT NULL DEFAULT FALSE,
  exception_note VARCHAR(300),
  calculated_date TIMESTAMP NOT NULL,
  CONSTRAINT uq_elig UNIQUE (student_id, section_id, semester_id)
);

CREATE TABLE IF NOT EXISTS course_freezes (
  freeze_id SERIAL PRIMARY KEY,
  section_id INT NOT NULL REFERENCES course_sections(section_id),
  hod_user_id INT NOT NULL REFERENCES users(user_id),
  freeze_date DATE NOT NULL,
  reason VARCHAR(400) NOT NULL,
  force_eligible BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_att_section_week ON attendance (section_id, week_no);
CREATE INDEX IF NOT EXISTS idx_alert_status ON alerts (status, target_role);
