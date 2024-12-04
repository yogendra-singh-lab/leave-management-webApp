const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('./database');  // Import your database file
const app = express();
const port = 3000;
const axios = require('axios');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();
app.use(cors());
app.use(express.json()); // To parse JSON bodies
app.use(express.urlencoded({ extended: true }));
const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;
const jwt = require('jsonwebtoken');


app.get('/first', (req, res) => {
    console.log("run");
    res.send('Server is running');
});
const verifyToken = (req, res, next) => {


    const token = req.header('Authorization')?.replace('Bearer ', ''); // Extract token from Authorization header

    if (!token) {
        return res.status(401).json({ message: 'No token provided, authorization denied' });
    }

    try {

        const decoded = jwt.verify(token, JWT_SECRET_KEY);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Token is not valid' });
    }
};
app.post('/login', (req, res) => {

    const { unique_number, password, role } = req.body;
    const roleValue = role.toLowerCase();
    console.log(req.body);
    db.get(
        `SELECT * FROM users WHERE unique_number = ? AND role = ?`,
        [unique_number, roleValue],
        (err, row) => {
            if (err) {
                console.error(err); // Log the error for debugging
                return res
                    .status(500)
                    .send('An error occurred while accessing the database.');
            }

            if (!row) {
                // No user found

                return res.status(404).json({ message: 'User not found.' });
            }
            else {
                console.log(row.password);
                // Compare provided password with stored hashed password
                const isPasswordValid = bcrypt.compareSync(password, row.password);

                if (isPasswordValid) {
                    const { password, ...userWithoutPassword } = row;
                    const token = jwt.sign(
                        {
                            id: row.id,
                            unique_number: row.unique_number,
                            role: row.role,
                            company_number: row.company_number,
                        },
                        JWT_SECRET_KEY,
                        { expiresIn: '10h' }
                    );
                    console.log(token);
                    res.status(200).json({
                        message: 'Login successful',
                        user: userWithoutPassword,
                        token: token,
                    });
                } else {
                    // Incorrect password
                    res.status(401).json({ message: 'Invalid password.' });
                }

            }

        }
    );
}
);


// API to submit a leave request
app.post('/leave-request', (req, res) => {
    const { name, jawan_id, company_number, start_date, end_date, rank, trade, leave_type, reason_for_leave} = req.body;

    // Validate the incoming data
    if (!name || !jawan_id || !company_number || !start_date || !end_date || !rank || !trade || !leave_type || !reason_for_leave ) {
        return res.status(400).json({ message: 'All fields are required.' });
    }

    // Ensure end date is greater than start date
    if (new Date(end_date) <= new Date(start_date)) {
        return res.status(400).json({ message: 'End date must be greater than start date.' });
    }

    // Check if the jawan_id already has a pending leave request
    db.get(
        `SELECT * FROM leave_requests WHERE jawan_id = ? AND status = 'pending'`,
        [jawan_id],
        (err, existingRequest) => {
            if (err) {
                return res.status(500).json({ message: 'Error checking existing leave request.' });
            }

            if (existingRequest) {
                return res.status(400).json({ message: 'One leave already applied and pending approval.' });
            }

            // Find the OC (Officer Commanding) for the given company_number
            db.get(
                `SELECT id FROM users WHERE role = 'oc' AND company_number = ?`,
                [company_number],
                (err, ocRow) => {
                    if (err || !ocRow) {
                        return res.status(500).json({ message: 'Officer Commanding (OC) not found for the given company number.' });
                    }

                    const oc_id = ocRow.id;

                    // Find the SJCO (Subordinate Junior Commanding Officer) for the given company_number
                    db.get(
                        `SELECT id FROM users WHERE role = 'sjco' AND company_number = ?`,
                        [company_number],
                        (err, sjcoRow) => {
                            if (err || !sjcoRow) {
                                return res.status(500).json({ message: 'SJCO not found for the given company number.' });
                            }

                            const sjco_id = sjcoRow.id;

                            // Insert the leave request into the database, including the name
                            db.run(
                                `INSERT INTO leave_requests (name, jawan_id, rank, trade, leave_type, oc_id, sjco_id, start_date, end_date, status, company_number, sjco_approved, oc_approved, reason_for_leave) 
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, -1, -1,?)`,
                                [name, jawan_id, rank, trade, leave_type, oc_id, sjco_id, start_date, end_date, company_number,reason_for_leave],
                                function (err) {
                                    if (err) {
                                        console.log(err);
                                        return res.status(500).json({ message: 'Error submitting leave request.' });
                                    }

                                    res.status(200).json({ message: 'Leave request submitted successfully', request_id: this.lastID });
                                }
                            );
                        }
                    );
                }
            );
        }
    );
});


app.put("/leave-requests/:request_id", verifyToken, async (req, res) => {
    try {

        const userRole = req.user.role;
        const leaveId = req.params.request_id;

        // Handling SJCO Role
        if (userRole === "sjco") {
            console.log("Processing SJCO role...");
            const statusValue = req.body.status === "rejected" ? "rejected" : "pending";
            const sjcoApprovedValue = req.body.status === "approved" ? 1 : 0;
            db.run(`UPDATE leave_requests 
                    SET sjco_approved = ${sjcoApprovedValue}, 
                        status = "${statusValue}" 
                    WHERE request_id = ${leaveId}`,
                async function (updateErr) {
                    if (updateErr) {
                        return res.status(500).json({ message: "Error updating leave request", error: updateErr.message });
                    }

                    if (this.changes === 0) {
                        return res.status(404).json({ message: "Leave request not found" });
                    }
                    
                    let query = `SELECT * FROM leave_requests WHERE company_number = ?`;
                    const params = [req.user.company_number];
                    query += ` ORDER BY request_id DESC`;

                    db.all(query, params, (err, rows) => {
                        if (err) {
                            return res.status(500).json({ message: 'Error fetching leave requests', error: err.message });
                        }

                        res.json({
                            message: "Leave request updated successfully", leaveRequests: rows.map(request => ({
                                request_id: request.request_id,
                                jawan_id: request.jawan_id,
                                start_date: request.start_date,
                                end_date: request.end_date,
                                sjco_approved: request.sjco_approved,
                                oc_approved: request.oc_approved,
                                status: request.status,
                                rank: request.rank,
                                trade: request.trade,
                                leave_type: request.leave_type,
                                name: request.name,
                                company_number: request.company_number,
                                reason_for_leave: request.reason_for_leave
                            })),
                        });

                    });

                    console.log('Leave request updated successfully');
                });
        }

        // Handling OC Role
        if (userRole === "oc") {
            console.log("Processing OC role...");
            const statusValue = req.body.status === "rejected" ? "rejected" : "pending";
            const ocApprovedValue = req.body.status === "approved" ? 1 : 0;
            const currentTimestamp = new Date().toISOString().slice(0, 19).replace('T', ' '); // Get the current time for OC approval

            db.run(`UPDATE leave_requests 
                    SET oc_approved = ${ocApprovedValue}, 
                        status = "${statusValue}",
                        oc_approval_time = "${currentTimestamp}"  -- Set the approval time
                    WHERE request_id = ${leaveId}`,
                async function (updateErr) {
                    if (updateErr) {
                        console.log(updateErr);
                        return res.status(500).json({ message: "Error updating leave request", error: updateErr.message });
                    }

                    if (this.changes === 0) {
                        console.log(this.changes);
                        return res.status(404).json({ message: "Leave request not found" });
                    }

                    // Fetch updated leave requests
                    try {
                        let query = `SELECT * FROM leave_requests WHERE company_number = ?`;
                        const params = [req.user.company_number];
                        query += ` AND sjco_approved = 1`; // Optional, only fetch requests that are SJCO approved
                        query += ` ORDER BY request_id DESC`;

                        db.all(query, params, (err, rows) => {
                            if (err) {
                                console.log(err);
                                return res.status(500).json({ message: 'Error fetching leave requests', error: err.message });
                            }

                            res.json({
                                message: "Leave request updated successfully", leaveRequests: rows.map(request => ({
                                    request_id: request.request_id,
                                    jawan_id: request.jawan_id,
                                    start_date: request.start_date,
                                    end_date: request.end_date,
                                    sjco_approved: request.sjco_approved,
                                    oc_approved: request.oc_approved,
                                    status: request.status,
                                    rank: request.rank,
                                    trade: request.trade,
                                    leave_type: request.leave_type,
                                    name: request.name,
                                    company_number: request.company_number,
                                    reason_for_leave: request.reason_for_leave,
                                    oc_approval_time: request.oc_approval_time // Include the approval time
                                })),
                            });

                        });

                    } catch (axiosErr) {
                        console.log(axiosErr);
                        return res.status(500).json({ message: "Error fetching updated leave requests", error: axiosErr.message });
                    }
                });
        }
        
    } catch (ex) {
        console.log("An error occurred:", ex);
        return res.status(500).json({ message: "An internal server error occurred", error: ex.message });
    }
});

app.get("/all-leave-requests",(req,res)=>{
    try{
        console.log("coming");
        db.all("SELECT * FROM leave_requests" ,  (err, rows) => {
            if (err) {
                console.log(err);
                return res.status(500).json({ message: 'Error fetching leave requests', error: err.message });
            }
           
           else{
            console.log(rows);
            res.json({
                success: true,
                leaveRequests: rows.map(request => ({
                    request_id: request.request_id,
                    jawan_id: request.jawan_id,
                    start_date: request.start_date,
                    end_date: request.end_date,
                    sjco_approved: request.sjco_approved,
                    oc_approved: request.oc_approved,
                    status: request.status,
                    rank: request.rank,
                    trade: request.trade,
                    leave_type: request.leave_type,
                    name: request.name,
                    company_number: request.company_number,
                    reason_for_leave: request.reason_for_leave

                })),
            });

           }
            
    });
}
    catch(ex){
        console.log(ex);
        return res.status(500).json({ message: 'An unexpected error occurred', error: e.message });
    }
})

app.get("/leave-requests", verifyToken, (req, res) => {
    try {

        const company_number = req.user.company_number;
        const userRole = req.user.role;

        console.log(userRole);
        // Base query
        let query = `SELECT * 
                     FROM leave_requests 
                     WHERE company_number = ?`;
        const params = [company_number];

        // Add additional filtering for OC
        if (userRole === "oc") {
            query += ` AND sjco_approved = 1`;
        }


        // Sort results
        query += ` ORDER BY request_id DESC`;

        if (userRole === "co") {
            query = `SELECT * FROM leave_requests`;
            console.log(query);
            params.length = [];
        }
        db.all(query, params, (err, rows) => {
            if (err) {
                console.log(err);
                return res.status(500).json({ message: 'Error fetching leave requests', error: err.message });
            }


            res.json({
                success: true,
                roleName: req.user.name,
                leaveRequests: rows.map(request => ({
                    request_id: request.request_id,
                    jawan_id: request.jawan_id,
                    start_date: request.start_date,
                    end_date: request.end_date,
                    sjco_approved: request.sjco_approved,
                    oc_approved: request.oc_approved,
                    status: request.status,
                    rank: request.rank,
                    trade: request.trade,
                    leave_type: request.leave_type,
                    name: request.name,
                    company_number: request.company_number,
                    reason_for_leave: request.reason_for_leave,
                    oc_approval_time:request.oc_approval_time,
                    applied_at:request.applied_at


                })),
            });
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({ message: 'An unexpected error occurred', error: e.message });
    }
});



app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});