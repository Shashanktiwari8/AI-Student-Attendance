from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
import json

import models
from database import engine, get_db
import services

# Create the database tables automatically
models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="AI Attendance API",
    description="Backend for AI-Based Student Attendance System with Anti-Spoofing",
    version="1.0.0"
)

# Enable CORS to allow the frontend to communicate with this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.staticfiles import StaticFiles
import os

# --- Pydantic Schemas ---
class StudentRegister(BaseModel):
    enrollment_no: str
    name: str
    image_base64: str

class AttendanceMark(BaseModel):
    enrollment_no: str
    session_id: int
    image_base64: str
    latitude: float
    longitude: float
    qr_token: str

# --- API Endpoints ---

@app.post("/api/register")
def register_student(student: StudentRegister, db: Session = Depends(get_db)):
    # Check if student already exists
    db_student = db.query(models.Student).filter(models.Student.enrollment_no == student.enrollment_no).first()
    if db_student:
        raise HTTPException(status_code=400, detail="Student already registered")
        
    # Process image and get encoding
    img = services.decode_image_base64(student.image_base64)
    encoding = services.get_face_encoding(img)
    
    if encoding is None:
        raise HTTPException(status_code=400, detail="No face detected in the image")
        
    # Convert numpy array to list for JSON serialization to store in DB
    encoding_list = encoding.tolist()
    encoding_json = json.dumps(encoding_list)
    
    # Save to database
    new_student = models.Student(
        enrollment_no=student.enrollment_no,
        name=student.name,
        face_encoding=encoding_json
    )
    db.add(new_student)
    db.commit()
    
    return {"status": "success", "message": f"Student {student.name} registered successfully!"}

@app.post("/api/mark_attendance")
def mark_attendance(data: AttendanceMark, request: Request, db: Session = Depends(get_db)):
    # 1. Network Restriction (Wi-Fi Binding) Check
    client_ip = request.client.host
    # In production, check if client_ip belongs to college subnet.
    # Example: if not client_ip.startswith("192.168.1."): raise HTTPException(status_code=403, detail="Must use college Wi-Fi")
        
    # Get active session
    session = db.query(models.Session).filter(models.Session.id == data.session_id).first()
    if not session or not session.is_active:
        raise HTTPException(status_code=400, detail="Invalid or inactive session")
        
    # 2. Dynamic QR Check
    if session.current_qr_token and session.current_qr_token != data.qr_token:
        raise HTTPException(status_code=400, detail="QR Code expired or invalid")
        
    # 3. Geofencing Check
    if session.latitude and session.longitude:
        distance = services.get_distance_haversine(
            session.latitude, session.longitude, 
            data.latitude, data.longitude
        )
        # If student is outside the allowed radius
        if distance > session.radius_meters:
            raise HTTPException(status_code=403, detail=f"Proxy detected: You are too far from class ({int(distance)} meters away)")
            
    # Get Student from DB
    student = db.query(models.Student).filter(models.Student.enrollment_no == data.enrollment_no).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found. Please register first.")
        
    # 4. Liveness Check & 5. Face Match
    img = services.decode_image_base64(data.image_base64)
    if not services.check_liveness(img):
         raise HTTPException(status_code=403, detail="Liveness check failed (Spoofing/Photo detected)")
         
    new_encoding = services.get_face_encoding(img)
    if new_encoding is None:
        raise HTTPException(status_code=400, detail="No face detected in the live selfie")
        
    if not services.compare_faces(student.face_encoding, new_encoding):
        raise HTTPException(status_code=403, detail="Face does not match registered student profile")
        
    # Final step: Mark Attendance
    attendance = models.Attendance(
        session_id=session.id,
        student_id=student.id,
        status="Present"
    )
    db.add(attendance)
    db.commit()
    
    return {"status": "success", "message": "Attendance marked successfully! You are Present."}

# Serve the frontend files
# We mount this at the root after API routes so it doesn't conflict
frontend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend'))
app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")

@app.get("/api/health")
def health_check():
    return {"status": "healthy", "version": "1.0.0"}


