const API_URL = (window.location.origin && window.location.origin !== "null" && !window.location.origin.startsWith("file://")) 
    ? window.location.origin + "/api" 
    : "http://localhost:8000/api";
let currentSessionId = null;
let qrTimer = null;
let statusTimer = null;
let secondsLeft = 10;

async function loginTeacher() {
    const teacherId = document.getElementById('teacher-id-login').value.trim();
    const password = document.getElementById('teacher-pass-login').value.trim();
    const statusEl = document.getElementById('login-status');

    if (!teacherId || !password) {
        statusEl.innerText = "Please enter both Teacher ID and Password.";
        statusEl.className = "status-msg error";
        return;
    }

    statusEl.innerText = "Logging in...";
    statusEl.className = "status-msg info";

    try {
        const response = await fetch(`${API_URL}/teacher/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                teacher_id: teacherId,
                password: password
            })
        });

        const data = await response.json();

        if (response.ok) {
            statusEl.innerText = "";
            statusEl.className = "status-msg";
            // Populate teacher info in setup form
            document.getElementById('logged-teacher-name').innerText = data.name;
            document.getElementById('teacher-name').value = data.name;

            // Transition from login form to setup form
            document.getElementById('teacher-login-form').style.display = 'none';
            document.getElementById('setup-form').style.display = 'block';
        } else {
            statusEl.innerText = data.detail || "Invalid credentials.";
            statusEl.className = "status-msg error";
        }
    } catch (err) {
        console.error("Login error:", err);
        statusEl.innerText = "Connection error. Is backend server running?";
        statusEl.className = "status-msg error";
    }
}

function generateRandomToken() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
}

function getLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject("Geolocation is not supported by your browser");
        } else {
            navigator.geolocation.getCurrentPosition(
                position => resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                }),
                err => resolve({ lat: 20.3972, lng: 72.8328 }) // Default GP Daman fallback if GPS denied
            );
        }
    });
}

function updateQRImage(token) {
    const qrImg = document.getElementById('qr-code-img');
    const tokenText = document.getElementById('token-text');
    
    // Encode SESSION_ID:TOKEN in the QR Code
    const qrPayload = `${currentSessionId}:${token}`;
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrPayload)}`;
    tokenText.innerText = token;
}

async function startTeacherSession() {
    const subject = document.getElementById('subject-name').value;
    const teacher = document.getElementById('teacher-name').value;
    const radius = parseFloat(document.getElementById('geofence-radius').value) || 50;
    const statusEl = document.getElementById('setup-status');

    if (!subject || !teacher) {
        statusEl.innerText = "Please enter subject and teacher name.";
        statusEl.className = "status-msg error";
        return;
    }

    statusEl.innerText = "Getting classroom location & creating session...";
    statusEl.className = "status-msg info";

    const loc = await getLocation();

    try {
        const response = await fetch(`${API_URL}/create_session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subject: subject,
                teacher_name: teacher,
                latitude: loc.lat,
                longitude: loc.lng,
                radius_meters: radius
            })
        });

        const data = await response.json();

        if (response.ok) {
            currentSessionId = data.session_id;
            
            // Switch UI to Dashboard
            document.getElementById('setup-form').style.display = 'none';
            document.getElementById('qr-dashboard').style.display = 'block';
            document.getElementById('disp-subject').innerText = subject;
            document.getElementById('disp-teacher').innerText = `Teacher: ${teacher} | Location Radius: ${radius}m`;

            // Display initial QR
            updateQRImage(data.qr_token);
            
            // Start 10-Second QR Refresh Cycle
            startQRRefreshCycle();

            // Start 3-Second Live Student Polling Cycle
            startLiveStudentPolling();

        } else {
            statusEl.innerText = data.detail || "Failed to start session";
            statusEl.className = "status-msg error";
        }

    } catch (err) {
        console.error("Session creation error:", err);
        statusEl.innerText = "Connection error. Is backend server running?";
        statusEl.className = "status-msg error";
    }
}

function startQRRefreshCycle() {
    secondsLeft = 30; // 30 seconds refresh cycle for comfortable student verification
    const timerBar = document.getElementById('timer-bar');

    if (qrTimer) clearInterval(qrTimer);

    qrTimer = setInterval(async () => {
        secondsLeft -= 1;
        timerBar.style.width = `${(secondsLeft / 30) * 100}%`;

        if (secondsLeft <= 0) {
            secondsLeft = 30;
            timerBar.style.width = '100%';

            // Generate new token & update backend
            const newToken = generateRandomToken();
            updateQRImage(newToken);

            try {
                await fetch(`${API_URL}/update_qr`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        session_id: currentSessionId,
                        qr_token: newToken
                    })
                });
            } catch (e) {
                console.error("Failed to sync QR token with backend:", e);
            }
        }
    }, 1000);
}

function startLiveStudentPolling() {
    if (statusTimer) clearInterval(statusTimer);

    // Poll every 3 seconds for present students
    statusTimer = setInterval(async () => {
        if (!currentSessionId) return;

        try {
            const response = await fetch(`${API_URL}/session_status/${currentSessionId}`);
            if (response.ok) {
                const data = await response.json();
                
                // Update Present Count
                document.getElementById('present-count').innerText = `${data.total_present} Present`;

                // Update Table
                const tbody = document.getElementById('students-table-body');
                if (data.present_students.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #94a3b8;">Waiting for students to scan & mark...</td></tr>`;
                } else {
                    tbody.innerHTML = data.present_students.map(s => `
                        <tr>
                            <td><strong>${s.enrollment_no}</strong></td>
                            <td>${s.name}</td>
                            <td><span style="color: #4ade80;"><i class="fa-solid fa-circle-check"></i> ${s.time}</span></td>
                        </tr>
                    `).join('');
                }
            }
        } catch (e) {
            console.error("Error fetching live student status:", e);
        }
    }, 3000);
}
