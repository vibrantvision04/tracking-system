-- CREATE EMPLOYEES TABLE
CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    last_name VARCHAR(100) NOT NULL,
    employee_id VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(150),
    aadhaar_no VARCHAR(50) NOT NULL,
    contact_no VARCHAR(50) NOT NULL,
    alt_contact_no VARCHAR(50),
    address TEXT NOT NULL,
    other_details TEXT,
    document_file_type VARCHAR(100),
    document_file_path TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default employee as per screenshot
INSERT INTO employees (first_name, middle_name, last_name, employee_id, email, aadhaar_no, contact_no, alt_contact_no, address, other_details, document_file_type, document_file_path) VALUES 
(
    'KISHOR', 
    'JI', 
    'Sharma', 
    '8769807155', 
    '', 
    '8769807155', 
    '8769807155', 
    '', 
    'No address available at the moment.', 
    '', 
    'Aadhaar', 
    'mock_aadhaar.pdf'
)
ON CONFLICT (employee_id) DO NOTHING;
