from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
import json
import traceback

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

# Global exception handler to return clean JSON error instead of plain HTML 500
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print("--- SERVER ERROR TRACEBACK ---")
    traceback.print_exc()
    print("------------------------------")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Server Error: {str(exc)}"}
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
    password: str = "student123"
    image_base64: str

class StudentLogin(BaseModel):
    enrollment_no: str
    password: str

class TeacherLogin(BaseModel):
    teacher_id: str
    password: str

class TeacherRegister(BaseModel):
    teacher_id: str
    name: str
    password: str
    department: str = "Computer Science & Engineering"

class AttendanceMark(BaseModel):
    enrollment_no: str
    session_id: int
    image_base64: str
    latitude: float
    longitude: float
    qr_token: str

class CreateSessionRequest(BaseModel):
    subject: str
    teacher_name: str
    latitude: float
    longitude: float
    radius_meters: float = 50.0

class UpdateQRRequest(BaseModel):
    session_id: int
    qr_token: str

# Seed default Teacher account on server startup
@app.on_event("startup")
def seed_default_teacher():
    try:
        db = next(get_db())
        teacher = db.query(models.Teacher).filter(models.Teacher.teacher_id == "T101").first()
        if not teacher:
            default_teacher = models.Teacher(
                teacher_id="T101",
                name="Prof. Shashank Tiwari",
                password="teacher123",
                department="Computer Science & Engineering"
            )
            db.add(default_teacher)
            db.commit()
            print("[INFO] Default Teacher Account created: ID 'T101', Password 'teacher123'")
    except Exception as e:
        print(f"Startup teacher seed warning: {e}")

# --- API Endpoints ---

@app.post("/api/teacher/login")
def teacher_login(data: TeacherLogin, db: Session = Depends(get_db)):
    teacher = db.query(models.Teacher).filter(models.Teacher.teacher_id == data.teacher_id).first()
    if not teacher or teacher.password != data.password:
        raise HTTPException(status_code=401, detail="Invalid Teacher ID or Password")
    return {"status": "success", "teacher_id": teacher.teacher_id, "name": teacher.name, "department": teacher.department}

@app.post("/api/teacher/register")
def teacher_register(data: TeacherRegister, db: Session = Depends(get_db)):
    existing = db.query(models.Teacher).filter(models.Teacher.teacher_id == data.teacher_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Teacher ID already exists")
    new_teacher = models.Teacher(
        teacher_id=data.teacher_id,
        name=data.name,
        password=data.password,
        department=data.department
    )
    db.add(new_teacher)
    db.commit()
    return {"status": "success", "message": "Teacher account created successfully!"}

@app.post("/api/create_session")
def create_session(data: CreateSessionRequest, db: Session = Depends(get_db)):
    import uuid
    token = str(uuid.uuid4())[:8]
    new_session = models.Session(
        subject=data.subject,
        teacher_name=data.teacher_name,
        latitude=data.latitude,
        longitude=data.longitude,
        radius_meters=data.radius_meters,
        current_qr_token=token,
        is_active=True
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    return {
        "session_id": new_session.id,
        "qr_token": new_session.current_qr_token,
        "message": "Attendance session started!"
    }

@app.post("/api/update_qr")
def update_qr(data: UpdateQRRequest, db: Session = Depends(get_db)):
    session = db.query(models.Session).filter(models.Session.id == data.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.current_qr_token = data.qr_token
    db.commit()
    return {"status": "success", "current_qr_token": session.current_qr_token}

@app.get("/api/session_status/{session_id}")
def get_session_status(session_id: int, db: Session = Depends(get_db)):
    session = db.query(models.Session).filter(models.Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    attendances = db.query(models.Attendance).filter(models.Attendance.session_id == session_id).all()
    present_students = []
    for att in attendances:
        student = db.query(models.Student).filter(models.Student.id == att.student_id).first()
        if student:
            present_students.append({
                "enrollment_no": student.enrollment_no,
                "name": student.name,
                "time": att.timestamp.strftime("%H:%M:%S")
            })
            
    return {
        "session_id": session.id,
        "subject": session.subject,
        "teacher_name": session.teacher_name,
        "is_active": session.is_active,
        "current_qr_token": session.current_qr_token,
        "total_present": len(present_students),
        "present_students": present_students
    }

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
        password=student.password,
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
        
    # Get active session (or fallback to latest active session)
    session = db.query(models.Session).filter(models.Session.id == data.session_id).first()
    if not session:
        session = db.query(models.Session).filter(models.Session.is_active == True).order_by(models.Session.id.desc()).first()
        
    if not session or not session.is_active:
        raise HTTPException(status_code=400, detail="No active classroom session found. Teacher must start class session first.")
        
    # 2. Dynamic QR Check
    if session.current_qr_token and session.current_qr_token != data.qr_token:
        latest = db.query(models.Session).filter(models.Session.is_active == True).order_by(models.Session.id.desc()).first()
        if not (latest and latest.current_qr_token == data.qr_token):
            raise HTTPException(status_code=400, detail="QR Code expired or invalid for this class session")
        
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

@app.get("/api/health")
def health_check():
    return {"status": "healthy", "version": "1.0.0"}

# Serve the frontend files
# We mount this at the root after all API routes so it doesn't conflict
frontend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend'))
app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")


