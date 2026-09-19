const API_URL = (window.location.origin && window.location.origin !== "null" && !window.location.origin.startsWith("file://")) 
    ? window.location.origin + "/api" 
    : "http://localhost:8000/api";
let videoStream = null;

let html5QrCode = null;

async function openQRScanner() {
    showStatus('att-status', 'Step 1: Point camera at projector QR code', 'info');

    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }

    if (typeof Html5Qrcode === 'undefined') {
        setTimeout(openQRScanner, 1000);
        return;
    }

    if (!html5QrCode) {
        html5QrCode = new Html5Qrcode("qr-reader");
    }

    const config = { fps: 10, qrbox: { width: 220, height: 220 } };

    const onScanSuccess = (decodedText) => {
        proceedToStep2(decodedText);
    };

    try {
        await html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess);
    } catch (err1) {
        try {
            await html5QrCode.start({ facingMode: "user" }, config, onScanSuccess);
        } catch (err2) {
            console.error("QR scanner start error:", err2);
            showStatus('att-status', 'Camera scanner unavailable. You can enter token manually below.', 'error');
        }
    }
}

let scannedSessionId = 1;
let scannedQrToken = "";

function proceedToStep2(token) {
    if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(e => console.log(e));
    }
    
    // Parse SESSION_ID:TOKEN if formatted as ID:TOKEN
    if (token.includes(":")) {
        const parts = token.split(":");
        scannedSessionId = parseInt(parts[0]) || 1;
        scannedQrToken = parts[1];
    } else {
        scannedSessionId = 1;
        scannedQrToken = token;
    }
    
    document.getElementById('att-qr').value = scannedQrToken;
    document.getElementById('scanned-token-text').innerText = scannedQrToken;

    // Transition Step 1 -> Step 2
    document.getElementById('att-step-1').style.display = 'none';
    document.getElementById('att-step-2').style.display = 'block';

    showStatus('att-status', 'Step 1 Passed! Now enter enrollment & verify selfie.', 'success');

    // Start Front Selfie Camera for Step 2!
    startCamera('att-video');
}

function toggleManualTokenBox() {
    const box = document.getElementById('manual-token-box');
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
}

function submitManualToken() {
    const token = document.getElementById('att-qr-manual').value;
    if (!token) {
        showStatus('att-status', 'Please enter a valid QR token.', 'error');
        return;
    }
    proceedToStep2(token);
}

// Tab Switching Logic
function switchTab(tabId) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    // Show selected tab
    document.getElementById(`${tabId}-section`).classList.add('active');
    
    // Update active button
    const btns = document.querySelectorAll('.tabs .tab-btn');
    if (tabId === 'attendance') {
        btns[0].classList.add('active');
        // Reset to Step 1 & open QR scanner
        document.getElementById('att-step-1').style.display = 'block';
        document.getElementById('att-step-2').style.display = 'none';
        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
            videoStream = null;
        }
        openQRScanner();
    } else {
        btns[1].classList.add('active');
        if (html5QrCode && html5QrCode.isScanning) {
            html5QrCode.stop().catch(e => console.log(e));
        }
        startCamera('reg-video');
    }
    
    // Clear messages
    document.getElementById('att-status').className = 'status-msg';
    document.getElementById('att-status').innerText = '';
    document.getElementById('reg-status').className = 'status-msg';
    document.getElementById('reg-status').innerText = '';
}

// Start Camera
async function startCamera(videoId) {
    const video = document.getElementById(videoId);
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        video.srcObject = videoStream;
    } catch (err) {
        console.error("Camera error:", err);
        showStatus(videoId === 'att-video' ? 'att-status' : 'reg-status', "Camera access denied or not available.", 'error');
    }
}

// Capture Image from Video (Optimized for sharp face detection)
function captureImage(videoId) {
    const video = document.getElementById(videoId);
    const canvas = document.getElementById('canvas');
    
    let w = video.videoWidth || video.clientWidth || 640;
    let h = video.videoHeight || video.clientHeight || 480;
    
    // Set canvas dimensions to 640px width for clear facial features
    const targetWidth = 640;
    const scale = targetWidth / w;
    canvas.width = targetWidth;
    canvas.height = h * scale;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.90); // 90% quality for crystal clear face features
}

// Get GPS Location
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
                err => reject("Location access denied. GPS is required for geofencing.")
            );
        }
    });
}

function showStatus(elementId, msg, type) {
    const el = document.getElementById(elementId);
    el.innerText = msg;
    el.className = `status-msg ${type}`;
}

async function registerStudent() {
    const enrollment = document.getElementById('reg-enrollment').value;
    const name = document.getElementById('reg-name').value;
    
    if(!enrollment || !name) {
        showStatus('reg-status', 'Please enter all details.', 'error');
        return;
    }
    
    showStatus('reg-status', 'Capturing and registering... Please wait.', 'info');
    const imageBase64 = captureImage('reg-video');
    
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
            showStatus('reg-status', data.message, 'success');
        } else {
            showStatus('reg-status', data.detail || 'Registration failed', 'error');
        }
    } catch(err) {
        console.error("Registration error:", err);
        showStatus('reg-status', `Error: ${err.message || 'Connection failed'}`, 'error');
    }
}

async function markAttendance() {
    const enrollment = document.getElementById('att-enrollment').value;
    const qrToken = document.getElementById('att-qr').value;
    
    if(!enrollment || !qrToken) {
        showStatus('att-status', 'Please enter enrollment and QR token.', 'error');
        return;
    }
    
    showStatus('att-status', 'Getting GPS location & verifying...', 'info');
    
    let location;
    try {
        location = await getLocation();
    } catch(err) {
        showStatus('att-status', err, 'error');
        return;
    }
    
    const imageBase64 = captureImage('att-video');
    
    try {
        const response = await fetch(`${API_URL}/mark_attendance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                enrollment_no: enrollment,
                session_id: scannedSessionId || 1,
                image_base64: imageBase64,
                latitude: location.lat,
                longitude: location.lng,
                qr_token: scannedQrToken || qrToken
            })
        });

        let data;
        try {
            data = await response.json();
        } catch(e) {
            data = { detail: "Server error occurred. Please check backend log." };
        }
        
        if (response.ok) {
            showStatus('att-status', data.message, 'success');
        } else {
            showStatus('att-status', data.detail || 'Attendance failed', 'error');
        }
    } catch(err) {
        console.error("Attendance error:", err);
        showStatus('att-status', `Error: ${err.message || 'Connection failed'}`, 'error');
    }
}

// Init QR scanner on load for default attendance tab
window.onload = () => {
    openQRScanner();
};
