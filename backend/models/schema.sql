-- =============================================
-- EyeCare Pro - MySQL Database Schema
-- Run this file once to set up the database
-- =============================================

CREATE DATABASE IF NOT EXISTS eyecare_pro CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE eyecare_pro;

-- USERS TABLE
CREATE TABLE IF NOT EXISTS users (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(100)        NOT NULL,
  email        VARCHAR(150) UNIQUE NOT NULL,
  password     VARCHAR(255)        NOT NULL,
  avatar_url   VARCHAR(255)        DEFAULT NULL,
  health_score INT                 DEFAULT 85,
  break_streak INT                 DEFAULT 0,
  created_at   TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP           DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- EYE SCAN SESSIONS
CREATE TABLE IF NOT EXISTS scan_sessions (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  user_id        INT             NOT NULL,
  blink_rate     FLOAT           DEFAULT 0,
  duration_sec   INT             DEFAULT 15,
  ear_avg        FLOAT           DEFAULT NULL,
  status         ENUM('low','normal','high') DEFAULT 'normal',
  scanned_at     TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_scanned (user_id, scanned_at)
);

-- SCREEN TIME LOGS (one row per user per day)
CREATE TABLE IF NOT EXISTS screen_time_logs (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT  NOT NULL,
  log_date     DATE NOT NULL,
  total_secs   INT  DEFAULT 0,
  breaks_taken INT  DEFAULT 0,
  UNIQUE KEY unique_user_date (user_id, log_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_date (user_id, log_date)
);

-- ML MONITORING ALERTS
CREATE TABLE IF NOT EXISTS alerts (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NOT NULL,
  type         ENUM('distance','posture','redness','blink') NOT NULL,
  severity     ENUM('low','medium','high') DEFAULT 'low',
  message      VARCHAR(255),
  triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_triggered (user_id, triggered_at)
);

-- BADGES / ACHIEVEMENTS
CREATE TABLE IF NOT EXISTS user_badges (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT         NOT NULL,
  badge_key  VARCHAR(50) NOT NULL,
  badge_name VARCHAR(100),
  badge_icon VARCHAR(10),
  earned_at  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_user_badge (user_id, badge_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- WEEKLY STATS SUMMARY (cached aggregates)
CREATE TABLE IF NOT EXISTS weekly_stats (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT  NOT NULL,
  week_start      DATE NOT NULL,
  total_screen_h  FLOAT DEFAULT 0,
  total_scans     INT   DEFAULT 0,
  total_breaks    INT   DEFAULT 0,
  avg_blink_rate  FLOAT DEFAULT 0,
  best_day        VARCHAR(20) DEFAULT 'Monday',
  UNIQUE KEY unique_user_week (user_id, week_start),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
