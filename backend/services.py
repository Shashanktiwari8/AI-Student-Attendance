import math
import face_recognition
import numpy as np
import cv2
import base64
import json

def get_distance_haversine(lat1, lon1, lat2, lon2):
    """
    Calculate the great circle distance between two points 
    on the earth (specified in decimal degrees) in meters.
    This is used for Geofencing.
    """
    # convert decimal degrees to radians 
    lon1, lat1, lon2, lat2 = map(math.radians, [lon1, lat1, lon2, lat2])

    # haversine formula 
    dlon = lon2 - lon1 
    dlat = lat2 - lat1 
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a)) 
    r = 6371000 # Radius of earth in meters
    return c * r

def decode_image_base64(base64_string):
    """Convert base64 image from frontend to cv2 image safely"""
    try:
        if "base64," in base64_string:
            base64_string = base64_string.split("base64,")[1]
        base64_string = base64_string.replace(" ", "+")
        img_data = base64.b64decode(base64_string)
        nparr = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return img
    except Exception as e:
        print(f"Base64 decode error: {e}")
        return None

def get_face_encoding(img):
    """Extract face encoding with automatic 4-way mobile camera rotation checking"""
    if img is None:
        return None
        
    try:
        # Maintain clear resolution up to 800px width
        h, w = img.shape[:2]
        if w > 800:
            scale = 800 / w
            img = cv2.resize(img, (800, int(h * scale)))
            
        rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        # Mobile cameras often stream video rotated 90 degrees.
        # We test 0°, 90° CW, 90° CCW, and 180° so the face is ALWAYS detected!
        rotations = [
            rgb_img,
            cv2.rotate(rgb_img, cv2.ROTATE_90_CLOCKWISE),
            cv2.rotate(rgb_img, cv2.ROTATE_90_COUNTERCLOCKWISE),
            cv2.rotate(rgb_img, cv2.ROTATE_180)
        ]
        
        for rotated_img in rotations:
            face_locations = face_recognition.face_locations(rotated_img, number_of_times_to_upsample=1)
            if face_locations:
                encodings = face_recognition.face_encodings(rotated_img, face_locations)
                if encodings:
                    return encodings[0] # Successfully found face in this orientation!
                    
        return None # No face found in any rotation
    except Exception as e:
        print(f"Error in face encoding: {e}")
        return None

def compare_faces(known_encoding_json, new_encoding, tolerance=0.5):
    """Compare stored json encoding with new numpy encoding"""
    try:
        # Reconstruct numpy array from JSON string
        known_encoding = np.array(json.loads(known_encoding_json))
        
        # Compare distances
        matches = face_recognition.compare_faces([known_encoding], new_encoding, tolerance=tolerance)
        return matches[0]
    except Exception as e:
        print(f"Error comparing faces: {e}")
        return False

def check_liveness(img):
    """
    Basic liveness check stub.
    In a full production app, this would use a deep learning model to detect 
    texture, depth, or blink/smile action.
    For this diploma project, we can just ensure a face is clearly visible 
    or integrate a lightweight eye-aspect-ratio (EAR) check here later.
    """
    # Placeholder: Assuming True if we can detect the face in get_face_encoding
    return True
