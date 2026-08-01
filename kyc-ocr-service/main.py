from importlib.util import find_spec
from io import BytesIO
import os
import re
from urllib.parse import urlparse

import dlib
import numpy as np
from fastapi import FastAPI, HTTPException
from PIL import Image
from pydantic import BaseModel
import pytesseract
import requests

app = FastAPI(title="Finify KYC OCR", version="1.0.0")
detector = dlib.get_frontal_face_detector()


class VerifyRequest(BaseModel):
    document_type: str
    issuing_country: str
    front_url: str
    selfie_url: str
    back_url: str | None = None


class FaceCompareRequest(BaseModel):
    reference_url: str
    probe_url: str


def model_path(filename: str) -> str:
    spec = find_spec("face_recognition_models")
    if not spec or not spec.submodule_search_locations:
        raise RuntimeError("face recognition models are unavailable")
    return str(next(iter(spec.submodule_search_locations)) + "/models/" + filename)


shape_predictor = dlib.shape_predictor(model_path("shape_predictor_5_face_landmarks.dat"))
face_model = dlib.face_recognition_model_v1(model_path("dlib_face_recognition_resnet_model_v1.dat"))


def download_image(url: str) -> Image.Image:
    parsed = urlparse(url)
    allowed = {
        value.strip().lower()
        for value in os.getenv("KYC_ALLOWED_DOCUMENT_HOSTS", "minio").split(",")
        if value.strip()
    }
    if parsed.scheme not in {"http", "https"} or (allowed and (parsed.hostname or "").lower() not in allowed):
        raise HTTPException(status_code=400, detail="Document URL host is not allowed")
    response = requests.get(url, timeout=15, allow_redirects=False, stream=True)
    response.raise_for_status()
    if int(response.headers.get("content-length", "0") or 0) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Document exceeds 10 MB")
    content = response.raw.read(10 * 1024 * 1024 + 1)
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Document exceeds 10 MB")
    try:
        return Image.open(BytesIO(content)).convert("RGB")
    except Exception as error:
        raise HTTPException(status_code=400, detail="Invalid document image") from error


def encodings(image: Image.Image) -> list[np.ndarray]:
    array = np.array(image)
    result = []
    for face in detector(array, 1):
        shape = shape_predictor(array, face)
        result.append(np.array(face_model.compute_face_descriptor(array, shape)))
    return result


def face_match(card: Image.Image, selfie: Image.Image) -> dict:
    card_faces = encodings(card)
    selfie_faces = encodings(selfie)
    if not card_faces or not selfie_faces:
        return {
            "available": True,
            "matched": False,
            "score": 0.0,
            "card_faces": len(card_faces),
            "selfie_faces": len(selfie_faces),
            "error": "A face could not be detected in both images",
        }
    distance = min(float(np.linalg.norm(left - right)) for left in card_faces for right in selfie_faces)
    return {
        "available": True,
        "matched": distance <= 0.6,
        "score": round(max(0.0, min(100.0, (1.0 - distance) * 100.0)), 3),
        "distance": round(distance, 6),
        "card_faces": len(card_faces),
        "selfie_faces": len(selfie_faces),
    }


def extract_fields(text: str, country: str, document_type: str) -> dict:
    lines = [" ".join(line.split()) for line in text.splitlines() if line.strip()]
    normalized = " ".join(lines)
    nin_match = re.search(r"\b(?:CM|CF)[A-Z0-9]{10,14}\b", normalized.upper())
    dates = re.findall(r"\b(?:0?[1-9]|[12]\d|3[01])[/.-](?:0?[1-9]|1[0-2])[/.-](?:19|20)\d{2}\b", normalized)
    surname = None
    given_names = None
    for index, line in enumerate(lines):
        surname_match = re.search(r"(?:SURNAME|LAST NAME)\s*[:\-]?\s*(.+)$", line, re.IGNORECASE)
        given_match = re.search(r"(?:GIVEN NAMES?|FIRST NAME)\s*[:\-]?\s*(.+)$", line, re.IGNORECASE)
        if surname_match:
            surname = surname_match.group(1).strip()
        elif re.fullmatch(r"(?:SURNAME|LAST NAME)", line, re.IGNORECASE) and index + 1 < len(lines):
            surname = lines[index + 1]
        if given_match:
            given_names = given_match.group(1).strip()
        elif re.fullmatch(r"(?:GIVEN NAMES?|FIRST NAME)", line, re.IGNORECASE) and index + 1 < len(lines):
            given_names = lines[index + 1]
    full_name = " ".join(value for value in [given_names, surname] if value) or None
    return {
        "documentType": document_type,
        "country": country,
        "idNumber": nin_match.group(0) if nin_match else None,
        "fullName": full_name,
        "dates": dates[:3],
        "rawText": normalized[:8000],
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "finify-kyc-ocr-service",
        "tesseract": str(pytesseract.get_tesseract_version()).splitlines()[0],
        "faceModel": "dlib_face_recognition_resnet_v1",
    }


@app.post("/verify")
def verify(request: VerifyRequest):
    front = download_image(request.front_url)
    back = download_image(request.back_url) if request.back_url else None
    selfie = download_image(request.selfie_url)
    front_text = pytesseract.image_to_string(front)
    back_text = pytesseract.image_to_string(back) if back else ""
    return {
        "status": "COMPLETED",
        "modelVersion": "finify-ocr-dlib-v1",
        "document": extract_fields(front_text + "\n" + back_text, request.issuing_country, request.document_type),
        "face": face_match(front, selfie),
    }


@app.post("/face-compare")
def compare_face(request: FaceCompareRequest):
    result = face_match(download_image(request.reference_url), download_image(request.probe_url))
    return {
        "modelVersion": "finify-ocr-dlib-v1", "available": result.get("available", False),
        "matched": result.get("matched", False), "score": result.get("score", 0.0),
        "distance": result.get("distance"), "referenceFaces": result.get("card_faces", 0),
        "probeFaces": result.get("selfie_faces", 0), "error": result.get("error"),
    }
