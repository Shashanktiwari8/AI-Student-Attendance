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
    """Convert base64 image from frontend to cv2 image"""
    if "base64," in base64_string:
        base64_string = base64_string.split("base64,")[1]
    img_data = base64.b64decode(base64_string)
    nparr = np.frombuffer(img_data, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    return img

def get_face_encoding(img):
    """Extract face encoding from an image using face_recognition"""
    # Convert BGR to RGB (face_recognition expects RGB)
    rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    
    # Find faces in the image
    face_locations = face_recognition.face_locations(rgb_img)
    if not face_locations:
        return None # No face found
    
    # Get the 128-d encodings for faces found
    encodings = face_recognition.face_encodings(rgb_img, face_locations)
    if encodings:
        return encodings[0] # Return the first face's encoding
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
