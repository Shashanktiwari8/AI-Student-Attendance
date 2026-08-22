from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
import datetime
from database import Base

class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    enrollment_no = Column(String, unique=True, index=True)
    name = Column(String)
    # We will store the numpy array of the face encoding as a JSON string
    face_encoding = Column(String, nullable=True) 

    attendances = relationship("Attendance", back_populates="student")

class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    subject = Column(String, index=True)
    teacher_name = Column(String)
    start_time = Column(DateTime, default=datetime.datetime.utcnow)
    is_active = Column(Boolean, default=True)
    
    # For Geofencing (Location Binding)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    radius_meters = Column(Float, default=50.0)
    
    # For Dynamic QR (Token changes every 10 seconds)
    current_qr_token = Column(String, nullable=True)

    attendances = relationship("Attendance", back_populates="session")

class Attendance(Base):
    __tablename__ = "attendances"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"))
    student_id = Column(Integer, ForeignKey("students.id"))
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    
    # Status can be 'Present', 'Proxy Detected', 'Location Failed', etc.
    status = Column(String, default="Present")

    session = relationship("Session", back_populates="attendances")
    student = relationship("Student", back_populates="attendances")
