const API_URL = "http://localhost:8000/api";
let videoStream = null;

// Tab Switching Logic
function switchTab(tabId) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    // Show selected tab
    document.getElementById(`${tabId}-section`).classList.add('active');
    
    // Update active button (finding it properly)
    const btns = document.querySelectorAll('.tab-btn');
    if (tabId === 'attendance') {
        btns[0].classList.add('active');
    } else {
        btns[1].classList.add('active');
    }
    
    // Switch camera
    if(videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
    }
    startCamera(tabId === 'attendance' ? 'att-video' : 'reg-video');
    
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

// Capture Image from Video
function captureImage(videoId) {
    const video = document.getElementById(videoId);
    const canvas = document.getElementById('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg');
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
            showStatus('reg-status', data.detail, 'error');
        }
    } catch(err) {
        showStatus('reg-status', 'Network error connecting to backend server.', 'error');
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
                session_id: 1, // Hardcoded for demo/testing purposes
                image_base64: imageBase64,
                latitude: location.lat,
                longitude: location.lng,
                qr_token: qrToken
            })
        });
        const data = await response.json();
        
        if (response.ok) {
            showStatus('att-status', data.message, 'success');
        } else {
            showStatus('att-status', data.detail, 'error');
        }
    } catch(err) {
        showStatus('att-status', 'Network error connecting to backend server.', 'error');
    }
}

// Init camera on load for default tab
window.onload = () => {
    startCamera('att-video');
};
