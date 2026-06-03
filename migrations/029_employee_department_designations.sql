-- 029_employee_department_designations.sql
-- Create employee_department_designations mapping table

CREATE TABLE IF NOT EXISTS employee_department_designations (
    id SERIAL PRIMARY KEY,
    employee_id INT NOT NULL UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
    department_id INT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    designation_id INT NOT NULL REFERENCES designations(id) ON DELETE CASCADE,
    region_id INT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
