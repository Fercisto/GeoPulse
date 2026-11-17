-- GeoPulse: esquema de base de datos (MySQL 8)
-- Ejecutar desde backend/: mysql -uroot < database/schema.sql

CREATE DATABASE IF NOT EXISTS geopulse CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE geopulse;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  -- Token de la "Application" de Gotify de este usuario (para enviarle avisos)
  gotify_app_token VARCHAR(64) NULL,
  last_lat DECIMAL(10, 7) NULL,
  last_lng DECIMAL(10, 7) NULL,
  last_seen_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS places (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  lat DECIMAL(10, 7) NOT NULL,
  lng DECIMAL(10, 7) NOT NULL,
  radius SMALLINT UNSIGNED NOT NULL DEFAULT 50, -- metros
  -- 1 si la última ubicación reportada estaba dentro del radio (evita avisos repetidos)
  inside TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_places_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_places_user (user_id)
) ENGINE=InnoDB;

-- Historial de llegadas (cada vez que se envió una notificación)
CREATE TABLE IF NOT EXISTS arrivals (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  place_id INT UNSIGNED NOT NULL,
  arrived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notified TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT fk_arrivals_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_arrivals_place FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE,
  INDEX idx_arrivals_user (user_id, arrived_at)
) ENGINE=InnoDB;
