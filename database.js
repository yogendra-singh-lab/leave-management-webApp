const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./leaveData.db');
const bcrypt = require('bcryptjs');

// Function to hash the passwords
const hashPasswordAsync = async (password) => {
    const hashedPassword = await bcrypt.hash(password, 10);
   
    return hashedPassword;
  };
  
// Function to seed the database with default users
const seedDatabase = async  () =>  {
    const users = [
        { name: 'CO head', role: 'co', unique_number: 'H000', password: 'password123', company_number: 0 },
        { name: 'oc1', role: 'oc', unique_number: 'C001', password: 'officercommanding121', company_number: 1 },
        { name: 'oc2', role: 'oc', unique_number: 'C002', password: 'officercommanding122', company_number: 2 },
        { name: 'oc3', role: 'oc', unique_number: 'C003', password: 'officercommanding123', company_number: 3 },
        { name: 'oc4', role: 'oc', unique_number: 'C004', password: 'officercommanding124', company_number: 4 },
        { name: 'oc5', role: 'oc', unique_number: 'C005', password: 'officercommanding125', company_number: 5 },
        { name: 'oc6', role: 'oc', unique_number: 'C006', password: 'officercommanding126', company_number: 6 },
        { name: 'oc7', role: 'oc', unique_number: 'C007', password: 'officercommanding127', company_number: 7 },
        { name: 'oc8', role: 'oc', unique_number: 'C008', password: 'officercommanding128', company_number: 8 },
        { name: 'sjco1', role: 'sjco', unique_number: 'SC001', password: 'sjco121', company_number: 1 },
        { name: 'sjco2', role: 'sjco', unique_number: 'SC002', password: 'sjco122', company_number: 2 },
        { name: 'sjco3', role: 'sjco', unique_number: 'SC003', password: 'sjco123', company_number: 3 },
        { name: 'sjco4', role: 'sjco', unique_number: 'SC004', password: 'sjco124', company_number: 4 },
        { name: 'sjco5', role: 'sjco', unique_number: 'SC005', password: 'sjco125', company_number: 5 },
        { name: 'sjco6', role: 'sjco', unique_number: 'SC006', password: 'sjco126', company_number: 6 },
        { name: 'sjco7', role: 'sjco', unique_number: 'SC007', password: 'sjco127', company_number: 7 },
        { name: 'sjco8', role: 'sjco', unique_number: 'SC008', password: 'sjco128', company_number: 8 },
        // Add more users as needed
    ];

    db.serialize(async() => {
        // Create the users table if it doesn't exist
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                name TEXT,
                role TEXT,
                unique_number TEXT UNIQUE,
                password TEXT,
                company_number INTEGER
            )
        `);

        // Create the leave_requests table if it doesn't exist
       db.run(`CREATE TABLE IF NOT EXISTS leave_requests (
    request_id INTEGER PRIMARY KEY AUTOINCREMENT, 
    jawan_id TEXT, 
    reason_for_leave TEXT,
    name TEXT,
    rank TEXT,  -- Added Rank field
    trade TEXT,  -- Added Trade field
    leave_type TEXT,  -- Added Leave Type field
    oc_id INTEGER,     -- References the OC who will approve/reject
    sjco_id INTEGER,   -- References the SJCO who will approve/reject
    company_number INTEGER,  -- Store the company number directly
    start_date DATE,
    end_date DATE,
    status TEXT,       -- Status of the leave request
    sjco_approved INTEGER DEFAULT -1,  -- -1 for pending, 1 for approved, 0 for rejected
    oc_approved INTEGER DEFAULT -1,    -- -1 for pending, 1 for approved, 0 for rejected
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    oc_approval_time TIMESTAMP NULL,
    FOREIGN KEY (oc_id) REFERENCES users(id),  -- Assuming users table has id as primary key
    FOREIGN KEY (sjco_id) REFERENCES users(id)
)

`);

        // Seed default users
       
            for (let user of users) {
              const hashedPassword = await hashPasswordAsync(user.password); // Wait for the password to be hashed
              db.run(
                `INSERT OR IGNORE INTO users (name, role, unique_number, password, company_number) VALUES (?, ?, ?, ?, ?)`,
                [user.name, user.role, user.unique_number, hashedPassword, user.company_number],
                function (err) {
                  if (err) {
                    console.log("Error inserting user:", err.message);
                  } else {
                    console.log(`User ${user.name} inserted successfully`);
                  }
                }
              );
            }
        
          
         
          
    });

    console.log('Database initialized and seeded with default data!');
};

// Call the seedDatabase function to initialize and seed the database
seedDatabase();

// Export the database connection for use in other parts of the application
module.exports = db;
