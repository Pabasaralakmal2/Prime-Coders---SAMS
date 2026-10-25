-- Prime Coders · Student Attendance Management System
-- MySQL 8 schema. The Node app uses a JSON store until you point it at MySQL.
-- Tables follow the conceptual ER: students, staff specialisation, sections,
-- attendance, medicals, requests, alerts, eligibility, course freeze.

CREATE DATABASE IF NOT EXISTS prime_coders_attendance
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE prime_coders_attendance;

CREATE TABLE roles (
  role_code VARCHAR(32) PRIMARY KEY,
  label VARCHAR(80) NOT NULL
);

CREATE TABLE departments (
  department_id INT AUTO_INCREMENT PRIMARY KEY,
  department_name VARCHAR(160) NOT NULL UNIQUE,
  faculty VARCHAR(160) NOT NULL
);

CREATE TABLE users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role_code VARCHAR(32) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  CONSTRAINT fk_user_role FOREIGN KEY (role_code) REFERENCES roles(role_code)
);

CREATE TABLE semesters (
  semester_id INT AUTO_INCREMENT PRIMARY KEY,
  semester_name VARCHAR(80) NOT NULL,
  academic_year VARCHAR(20) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  week_count TINYINT NOT NULL DEFAULT 15,
  current_week TINYINT NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'preparing',
  UNIQUE KEY uq_semester (academic_year, semester_name)
);

CREATE TABLE students (
  student_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL UNIQUE,
  registration_no VARCHAR(40) NOT NULL UNIQUE,
  index_no VARCHAR(20) NOT NULL UNIQUE,
  name_with_initials VARCHAR(160) NOT NULL,
  phone_no VARCHAR(30),
  date_of_admission DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  CONSTRAINT fk_student_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE TABLE lecturers (
  lecturer_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL UNIQUE,
  employee_no VARCHAR(40) NOT NULL UNIQUE,
  name_with_initials VARCHAR(160) NOT NULL,
  phone_no VARCHAR(30),
  qualification VARCHAR(120),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  CONSTRAINT fk_lecturer_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE TABLE visiting_lecturers (
  vl_id INT AUTO_INCREMENT PRIMARY KEY,
  lecturer_id INT NOT NULL UNIQUE,
  organization VARCHAR(160),
  expertise_area VARCHAR(160),
  CONSTRAINT fk_vl_lecturer FOREIGN KEY (lecturer_id) REFERENCES lecturers(lecturer_id)
);

CREATE TABLE coordinators (
  coordinator_id INT AUTO_INCREMENT PRIMARY KEY,
  lecturer_id INT NOT NULL UNIQUE,
  role_title VARCHAR(80),
  assigned_area VARCHAR(160),
  CONSTRAINT fk_coord_lecturer FOREIGN KEY (lecturer_id) REFERENCES lecturers(lecturer_id)
);

CREATE TABLE vl_coordination (
  vl_id INT PRIMARY KEY,
  coordinator_id INT NOT NULL,
  CONSTRAINT fk_vlc_vl FOREIGN KEY (vl_id) REFERENCES visiting_lecturers(vl_id),
  CONSTRAINT fk_vlc_c FOREIGN KEY (coordinator_id) REFERENCES coordinators(coordinator_id)
);

CREATE TABLE hods (
  hod_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  department_id INT NOT NULL UNIQUE,
  name_with_initials VARCHAR(160) NOT NULL,
  phone_no VARCHAR(30),
  CONSTRAINT fk_hod_user FOREIGN KEY (user_id) REFERENCES users(user_id),
  CONSTRAINT fk_hod_dept FOREIGN KEY (department_id) REFERENCES departments(department_id)
);

CREATE TABLE committees (
  committee_id INT AUTO_INCREMENT PRIMARY KEY,
  committee_name VARCHAR(160) NOT NULL UNIQUE,
  description VARCHAR(400)
);

CREATE TABLE committee_members (
  member_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  committee_id INT NOT NULL,
  name_with_initials VARCHAR(160) NOT NULL,
  role_title VARCHAR(40) NOT NULL,
  CONSTRAINT fk_cm_user FOREIGN KEY (user_id) REFERENCES users(user_id),
  CONSTRAINT fk_cm_committee FOREIGN KEY (committee_id) REFERENCES committees(committee_id)
);

CREATE TABLE courses (
  course_id INT AUTO_INCREMENT PRIMARY KEY,
  course_code VARCHAR(20) NOT NULL UNIQUE,
  course_name VARCHAR(160) NOT NULL,
  credit_value DECIMAL(3,1) NOT NULL,
  course_type VARCHAR(20) NOT NULL
);

CREATE TABLE course_sections (
  section_id INT AUTO_INCREMENT PRIMARY KEY,
  course_id INT NOT NULL,
  semester_id INT NOT NULL,
  section_code VARCHAR(20) NOT NULL,
  lecture_days VARCHAR(80) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  venue VARCHAR(80),
  frozen TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_section (course_id, section_code, semester_id),
  CONSTRAINT fk_sec_course FOREIGN KEY (course_id) REFERENCES courses(course_id),
  CONSTRAINT fk_sec_sem FOREIGN KEY (semester_id) REFERENCES semesters(semester_id)
);

CREATE TABLE lecturer_assignments (
  assignment_id INT AUTO_INCREMENT PRIMARY KEY,
  section_id INT NOT NULL,
  lecturer_id INT NOT NULL,
  UNIQUE KEY uq_assign (section_id, lecturer_id),
  CONSTRAINT fk_as_sec FOREIGN KEY (section_id) REFERENCES course_sections(section_id),
  CONSTRAINT fk_as_lec FOREIGN KEY (lecturer_id) REFERENCES lecturers(lecturer_id)
);

CREATE TABLE enrollments (
  enrollment_id INT AUTO_INCREMENT PRIMARY KEY,
  section_id INT NOT NULL,
  student_id INT NOT NULL,
  UNIQUE KEY uq_enroll (section_id, student_id),
  CONSTRAINT fk_en_sec FOREIGN KEY (section_id) REFERENCES course_sections(section_id),
  CONSTRAINT fk_en_stu FOREIGN KEY (student_id) REFERENCES students(student_id)
);

CREATE TABLE attendance (
  attendance_id INT AUTO_INCREMENT PRIMARY KEY,
  section_id INT NOT NULL,
  student_id INT NOT NULL,
  attendance_date DATE NOT NULL,
  week_no TINYINT NOT NULL,
  status ENUM('Present','Absent','Medical','Excused') NOT NULL,
  recorded_by INT NOT NULL,
  recorded_time DATETIME NOT NULL,
  UNIQUE KEY uq_mark (student_id, section_id, attendance_date),
  CONSTRAINT fk_att_sec FOREIGN KEY (section_id) REFERENCES course_sections(section_id),
  CONSTRAINT fk_att_stu FOREIGN KEY (student_id) REFERENCES students(student_id),
  CONSTRAINT fk_att_user FOREIGN KEY (recorded_by) REFERENCES users(user_id)
);

CREATE TABLE medical_reports (
  medical_id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  section_id INT NOT NULL,
  submission_date DATE NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  note VARCHAR(500),
  review_status ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Pending',
  reviewed_by INT NULL,
  CONSTRAINT fk_med_stu FOREIGN KEY (student_id) REFERENCES students(student_id),
  CONSTRAINT fk_med_sec FOREIGN KEY (section_id) REFERENCES course_sections(section_id)
);

CREATE TABLE student_requests (
  request_id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  section_id INT NOT NULL,
  request_type VARCHAR(40) NOT NULL,
  request_date DATE NOT NULL,
  week_no TINYINT NOT NULL,
  reason VARCHAR(500) NOT NULL,
  status ENUM('Pending','Recommended','Approved','Rejected') NOT NULL DEFAULT 'Pending',
  recommendation VARCHAR(500),
  hod_decision VARCHAR(500),
  CONSTRAINT fk_req_stu FOREIGN KEY (student_id) REFERENCES students(student_id),
  CONSTRAINT fk_req_sec FOREIGN KEY (section_id) REFERENCES course_sections(section_id)
);

CREATE TABLE alerts (
  alert_id INT AUTO_INCREMENT PRIMARY KEY,
  alert_type VARCHAR(40) NOT NULL,
  alert_date DATE NOT NULL,
  student_id INT NOT NULL,
  section_id INT NULL,
  target_role VARCHAR(32) NOT NULL,
  message VARCHAR(400) NOT NULL,
  status ENUM('New','Viewed','Handled') NOT NULL DEFAULT 'New',
  CONSTRAINT fk_al_stu FOREIGN KEY (student_id) REFERENCES students(student_id)
);

CREATE TABLE eligibility (
  eligibility_id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  section_id INT NOT NULL,
  semester_id INT NOT NULL,
  present_count INT NOT NULL DEFAULT 0,
  absent_count INT NOT NULL DEFAULT 0,
  medical_count INT NOT NULL DEFAULT 0,
  excused_count INT NOT NULL DEFAULT 0,
  total_attendance INT NOT NULL DEFAULT 0,
  attendance_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  eligible_flag TINYINT(1) NOT NULL DEFAULT 0,
  exception_note VARCHAR(300),
  calculated_date DATETIME NOT NULL,
  UNIQUE KEY uq_elig (student_id, section_id, semester_id),
  CONSTRAINT fk_el_stu FOREIGN KEY (student_id) REFERENCES students(student_id),
  CONSTRAINT fk_el_sec FOREIGN KEY (section_id) REFERENCES course_sections(section_id)
);

CREATE TABLE course_freezes (
  freeze_id INT AUTO_INCREMENT PRIMARY KEY,
  section_id INT NOT NULL,
  hod_user_id INT NOT NULL,
  freeze_date DATE NOT NULL,
  reason VARCHAR(400) NOT NULL,
  force_eligible TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT fk_fr_sec FOREIGN KEY (section_id) REFERENCES course_sections(section_id),
  CONSTRAINT fk_fr_hod FOREIGN KEY (hod_user_id) REFERENCES users(user_id)
);

CREATE INDEX idx_att_section_week ON attendance (section_id, week_no);
CREATE INDEX idx_alert_status ON alerts (status, target_role);
