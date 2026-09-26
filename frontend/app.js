const API_URL = (window.location.origin && window.location.origin !== "null" && !window.location.origin.startsWith("file://")) 
    ? window.location.origin + "/api" 
    : "http://localhost:8000/api";

let currentVideoStream = null;
let html5QrCode = null;
let isQrScanning = false;

// Stop any active camera stream
function stopAllCameras() {
    if (currentVideoStream) {
        currentVideoStream.getTracks().forEach(track => {
            track.stop();
        });
        currentVideoStream = null;
    }
    closeQRScanner();
}

// Start Camera for a specific video element
async function startCamera(videoId) {
    // First safely stop any running stream
    if (currentVideoStream) {
        currentVideoStream.getTracks().forEach(track => track.stop());
        currentVideoStream = null;
    }

    const video = document.getElementById(videoId);
    if (!video) return;

    try {
        currentVideoStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'user',
                width: { ideal: 640 },
                height: { ideal: 480 }
            } 
        });
        video.srcObject = currentVideoStream;
    } catch (err) {
        console.error("Camera access error:", err);
        const statusId = (videoId === 'att-video') ? 'att-status' : 'reg-status';
        showStatus(statusId, "Camera permission needed. Please allow camera access in browser.", 'error');
    }
}

// Tab Switching Logic (100% reliable)
function switchTab(tabId) {
    // Update active tab buttons
    document.getElementById('tab-att-btn').classList.toggle('active', tabId === 'attendance');
    document.getElementById('tab-reg-btn').classList.toggle('active', tabId === 'register');

    // Update active section
    document.getElementById('attendance-section').classList.toggle('active', tabId === 'attendance');
    document.getElementById('register-section').classList.toggle('active', tabId === 'register');

    // Clear previous status messages
    showStatus('att-status', '', '');
    showStatus('reg-status', '', '');

    // Switch camera cleanly
    if (tabId === 'attendance') {
        startCamera('att-video');
    } else {
        startCamera('reg-video');
    }
}

// QR Code Scanner Toggle (Uses Back Camera on demand)
async function toggleQRScanner() {
    const box = document.getElementById('qr-scanner-box');
    if (box.style.display === 'none' || box.style.display === '') {
        openQRScanner();
    } else {
        closeQRScanner();
    }
}

async function openQRScanner() {
    const box = document.getElementById('qr-scanner-box');
    box.style.display = 'block';

    if (typeof Html5Qrcode === 'undefined') {
        showStatus('att-status', "QR Scanner library loading... please wait 2 seconds.", 'info');
        return;
    }

    try {
        if (!html5QrCode) {
            html5QrCode = new Html5Qrcode("qr-reader");
        }

        const config = { fps: 10, qrbox: { width: 220, height: 220 } };

        const onScanSuccess = (decodedText) => {
            // Extracted Token (handles SESSION_ID:TOKEN format or raw token)
            let token = decodedText;
            if (decodedText.includes(":")) {
                const parts = decodedText.split(":");
                token = parts[1] || parts[0];
            }
            document.getElementById('att-qr').value = token;
            showStatus('att-status', `QR Code Scanned Successfully: ${token}`, 'success');
            closeQRScanner();
        };

        // Try back camera first, fallback to user camera
        isQrScanning = true;
        try {
            await html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess);
        } catch (e1) {
            await html5QrCode.start({ facingMode: "user" }, config, onScanSuccess);
        }
    } catch (err) {
        console.error("QR Scanner start failed:", err);
        showStatus('att-status', "Could not open QR camera. You can type the token manually.", 'error');
        closeQRScanner();
    }
}

function closeQRScanner() {
    const box = document.getElementById('qr-scanner-box');
    if (box) box.style.display = 'none';

    if (html5QrCode && isQrScanning) {
        html5QrCode.stop().then(() => {
            isQrScanning = false;
        }).catch(err => {
            console.log("QR stop error ignored:", err);
            isQrScanning = false;
        });
    }
}

// Capture Image from Video element as base64 JPEG
function captureImage(videoId) {
    const video = document.getElementById(videoId);
    const canvas = document.getElementById('canvas');
    if (!video || !canvas) return null;

    let w = video.videoWidth || 640;
    let h = video.videoHeight || 480;

    canvas.width = 640;
    canvas.height = (h / w) * 640;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.90);
}

// Get GPS Location (with default GP Daman fallback for indoor classrooms)
function getLocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve({ lat: 20.3972, lng: 72.8328 });
        } else {
            navigator.geolocation.getCurrentPosition(
                position => resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                }),
                err => {
                    console.log("GPS denied or indoor timeout, using campus fallback");
                    resolve({ lat: 20.3972, lng: 72.8328 }); // GP Daman default coordinates
                },
                { timeout: 5000, enableHighAccuracy: false }
            );
        }
    });
}

function showStatus(elementId, msg, type) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.innerText = msg;
    el.className = type ? `status-msg ${type}` : 'status-msg';
}

// Register Student Face
async function registerStudent() {
    const enrollment = document.getElementById('reg-enrollment').value.trim();
    const name = document.getElementById('reg-name').value.trim();

    if (!enrollment || !name) {
        showStatus('reg-status', 'Please enter Enrollment Number and Name.', 'error');
        return;
    }

    showStatus('reg-status', 'Capturing selfie and registering face... Please hold still.', 'info');
    const imageBase64 = captureImage('reg-video');

    if (!imageBase64) {
        showStatus('reg-status', 'Camera not ready. Please allow camera access and try again.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                enrollment_no: enrollment,
                name: name,
                image_base64: imageBase64
            })
        });

        const data = await response.json();

        if (response.ok) {
            showStatus('reg-status', `✔ ${data.message}`, 'success');
            // Auto switch to attendance tab after 2 seconds
            setTimeout(() => {
                document.getElementById('att-enrollment').value = enrollment;
                switchTab('attendance');
            }, 2000);
        } else {
            showStatus('reg-status', data.detail || 'Registration failed.', 'error');
        }
    } catch (err) {
        console.error("Registration error:", err);
        showStatus('reg-status', 'Error connecting to server. Is Python server running?', 'error');
    }
}

// Mark Attendance
async function markAttendance() {
    const enrollment = document.getElementById('att-enrollment').value.trim();
    const qrToken = document.getElementById('att-qr').value.trim();

    if (!enrollment) {
        showStatus('att-status', 'Please enter your Enrollment Number.', 'error');
        return;
    }
    if (!qrToken) {
        showStatus('att-status', 'Please enter or scan the Class QR Token.', 'error');
        return;
    }

    showStatus('att-status', 'Verifying location and face... Please hold still.', 'info');

    const imageBase64 = captureImage('att-video');
    if (!imageBase64) {
        showStatus('att-status', 'Camera not ready. Please check camera permission.', 'error');
        return;
    }

    const location = await getLocation();

    try {
        const response = await fetch(`${API_URL}/mark_attendance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                enrollment_no: enrollment,
                session_id: 1,
                image_base64: imageBase64,
                latitude: location.lat,
                longitude: location.lng,
                qr_token: qrToken
            })
        });

        const data = await response.json();

        if (response.ok) {
            showStatus('att-status', `✔ ${data.message}`, 'success');
        } else {
            showStatus('att-status', data.detail || 'Attendance verification failed.', 'error');
        }
    } catch (err) {
        console.error("Attendance error:", err);
        showStatus('att-status', 'Network error. Please check server connection.', 'error');
    }
}

// Initialize front camera for default attendance tab on load
window.onload = () => {
    startCamera('att-video');
};
