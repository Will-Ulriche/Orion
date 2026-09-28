-- Établissements
CREATE TABLE IF NOT EXISTS schools (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT,
    logo_url TEXT,
    address TEXT,
    city TEXT,
    country TEXT,
    phone_primary TEXT,
    phone_secondary TEXT,
    email TEXT,
    website TEXT,
    currency TEXT,
    timezone TEXT,
    status TEXT DEFAULT 'ACTIVE',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Rôles globaux
CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT
);

-- Utilisateurs (Pas de mot de passe car géré par Supabase Auth)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, -- Correspondra à l'ID Supabase
    email TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'ACTIVE',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Profils utilisateurs liés aux établissements
CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    school_id TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME, -- Soft delete
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (school_id) REFERENCES schools(id)
);

-- Rôles associés aux utilisateurs/profils
CREATE TABLE IF NOT EXISTS user_roles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    school_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (school_id) REFERENCES schools(id),
    FOREIGN KEY (role_id) REFERENCES roles(id)
);

-- Licences
CREATE TABLE IF NOT EXISTS licenses (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    license_key TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'ACTIVE',
    issued_at DATETIME,
    starts_at DATETIME,
    expires_at DATETIME,
    max_devices INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES schools(id)
);

-- Appareils
CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    device_identifier TEXT UNIQUE NOT NULL,
    device_name TEXT,
    platform TEXT,
    status TEXT DEFAULT 'ACTIVE',
    last_seen_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES schools(id)
);

-- Journaux d'audit
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    user_id TEXT,
    device_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    old_data TEXT, -- Stocké en JSON
    new_data TEXT, -- Stocké en JSON
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES schools(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (device_id) REFERENCES devices(id)
);

-- Années scolaires
CREATE TABLE IF NOT EXISTS academic_years (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    name TEXT NOT NULL,
    start_date DATE,
    end_date DATE,
    status TEXT DEFAULT 'PLANNED',
    is_current BOOLEAN DEFAULT 0,
    closed_at DATETIME,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES schools(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Inscriptions (Socle)
CREATE TABLE IF NOT EXISTS enrollments (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    academic_year_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT DEFAULT 'ACTIVE',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES schools(id),
    FOREIGN KEY (academic_year_id) REFERENCES academic_years(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Historique des inscriptions (Socle)
CREATE TABLE IF NOT EXISTS enrollment_history (
    id TEXT PRIMARY KEY,
    enrollment_id TEXT NOT NULL,
    status TEXT NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    FOREIGN KEY (enrollment_id) REFERENCES enrollments(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Insertions des rôles de base
INSERT INTO roles (id, name, description) VALUES
('role_dir', 'DIRECTION', 'Direction établissement'),
('role_sec', 'SECRETAIRE', 'Secrétariat'),
('role_prof', 'PROFESSEUR', 'Professeur'),
('role_admin', 'SUPER_ADMIN', 'Administrateur système')
ON CONFLICT(name) DO NOTHING;
