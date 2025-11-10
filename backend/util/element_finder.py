import cv2
import numpy as np
from typing import List, Tuple, Optional, Dict, Any
from dataclasses import dataclass
import re
from pathlib import Path

try:
    import easyocr
    EASYOCR_AVAILABLE = True
except ImportError:
    EASYOCR_AVAILABLE = False

try:
    import pytesseract
    PYTESSERACT_AVAILABLE = True
except ImportError:
    PYTESSERACT_AVAILABLE = False


@dataclass
class FoundElement:
    text: str
    confidence: float
    coordinates: Tuple[int, int]
    bounding_box: Tuple[int, int, int, int]
    element_type: str


class SmartElementFinder:
    def __init__(self, logger=None):
        self.logger = logger
        self.easyocr_reader = None
        self._initialization_attempted = False

    def _ensure_easyocr_initialized(self):
        """Lazy initialization of EasyOCR reader."""
        if self.easyocr_reader is not None:
            return

        if not EASYOCR_AVAILABLE or self._initialization_attempted:
            return

        try:
            self._initialization_attempted = True
            try:
                self.easyocr_reader = easyocr.Reader(['en'], gpu=True, verbose=False)
                if self.logger:
                    self.logger.log_info("EasyOCR initialized with GPU support")
            except Exception:
                self.easyocr_reader = easyocr.Reader(['en'], gpu=False, verbose=False)
                if self.logger:
                    self.logger.log_info("EasyOCR initialized with CPU (GPU not available)")
            if self.logger:
                self.logger.log_info("EasyOCR initialized successfully")
        except Exception as e:
            if self.logger:
                self.logger.log_warning(f"EasyOCR initialization failed: {e}")

    def find_elements_by_text(self, image_path: str, target_text: str, fuzzy_match: bool = True) -> List[FoundElement]:
        elements = []

        if not Path(image_path).exists():
            return elements

        self._ensure_easyocr_initialized()

        try:
            if self.easyocr_reader:
                elements.extend(self._find_with_easyocr(image_path, target_text, fuzzy_match))

            elif PYTESSERACT_AVAILABLE:
                elements.extend(self._find_with_tesseract(image_path, target_text, fuzzy_match))

            elements.sort(key=lambda x: x.confidence, reverse=True)

        except Exception as e:
            if self.logger:
                self.logger.log_error(f"Error finding elements: {e}")

        return elements

    def find_search_results(self, image_path: str) -> List[FoundElement]:
        elements = []

        search_patterns = [
            r'https?://[^\s]+',
            r'www\.[^\s]+',
            r'[A-Z][^.!?]*[.!?]',
        ]

        try:
            all_text_elements = self._extract_all_text(image_path)

            for element in all_text_elements:
                if self._is_search_result(element.text):
                    element.element_type = 'search_result'
                    elements.append(element)

            elements.sort(key=lambda x: (x.coordinates[1], x.coordinates[0]))

        except Exception as e:
            if self.logger:
                self.logger.log_error(f"Error finding search results: {e}")

        return elements

    def find_buttons_and_links(self, image_path: str) -> List[FoundElement]:
        elements = []

        try:
            button_keywords = [
                'click', 'submit', 'search', 'go', 'next', 'previous',
                'login', 'sign in', 'register', 'download', 'more',
                'view', 'read more', 'continue', 'proceed'
            ]

            all_elements = self._extract_all_text(image_path)

            for element in all_elements:
                text_lower = element.text.lower().strip()

                if any(keyword in text_lower for keyword in button_keywords):
                    element.element_type = 'button'
                    elements.append(element)
                elif self._looks_like_link(element.text):
                    element.element_type = 'link'
                    elements.append(element)

            elements.sort(key=lambda x: x.confidence, reverse=True)

        except Exception as e:
            if self.logger:
                self.logger.log_error(f"Error finding buttons/links: {e}")

        return elements

    def _find_with_easyocr(self, image_path: str, target_text: str, fuzzy_match: bool) -> List[FoundElement]:
        elements = []

        try:
            results = self.easyocr_reader.readtext(image_path)

            for bbox, text, confidence in results:
                if self._text_matches(text, target_text, fuzzy_match):
                    bbox_array = np.array(bbox)
                    center_x = int(np.mean(bbox_array[:, 0]))
                    center_y = int(np.mean(bbox_array[:, 1]))

                    x1 = int(np.min(bbox_array[:, 0]))
                    y1 = int(np.min(bbox_array[:, 1]))
                    x2 = int(np.max(bbox_array[:, 0]))
                    y2 = int(np.max(bbox_array[:, 1]))

                    element = FoundElement(
                        text=text,
                        confidence=confidence,
                        coordinates=(center_x, center_y),
                        bounding_box=(x1, y1, x2 - x1, y2 - y1),
                        element_type='text'
                    )
                    elements.append(element)

        except Exception as e:
            if self.logger:
                self.logger.log_error(f"EasyOCR error: {e}")

        return elements

    def _find_with_tesseract(self, image_path: str, target_text: str, fuzzy_match: bool) -> List[FoundElement]:
        elements = []

        try:
            image = cv2.imread(image_path)
            if image is None:
                return elements

            data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)

            for i in range(len(data['text'])):
                text = data['text'][i].strip()
                confidence = float(data['conf'][i]) / 100.0

                if confidence > 0.3 and text and self._text_matches(text, target_text, fuzzy_match):
                    x = data['left'][i]
                    y = data['top'][i]
                    w = data['width'][i]
                    h = data['height'][i]

                    center_x = x + w // 2
                    center_y = y + h // 2

                    element = FoundElement(
                        text=text,
                        confidence=confidence,
                        coordinates=(center_x, center_y),
                        bounding_box=(x, y, w, h),
                        element_type='text'
                    )
                    elements.append(element)

        except Exception as e:
            if self.logger:
                self.logger.log_error(f"Tesseract error: {e}")

        return elements

    def _extract_all_text(self, image_path: str) -> List[FoundElement]:
        elements = []

        self._ensure_easyocr_initialized()

        if self.easyocr_reader:
            try:
                results = self.easyocr_reader.readtext(image_path)
                for bbox, text, confidence in results:
                    if confidence > 0.3 and text.strip():
                        bbox_array = np.array(bbox)
                        center_x = int(np.mean(bbox_array[:, 0]))
                        center_y = int(np.mean(bbox_array[:, 1]))

                        x1 = int(np.min(bbox_array[:, 0]))
                        y1 = int(np.min(bbox_array[:, 1]))
                        x2 = int(np.max(bbox_array[:, 0]))
                        y2 = int(np.max(bbox_array[:, 1]))

                        element = FoundElement(
                            text=text,
                            confidence=confidence,
                            coordinates=(center_x, center_y),
                            bounding_box=(x1, y1, x2 - x1, y2 - y1),
                            element_type='text'
                        )
                        elements.append(element)
            except Exception as e:
                if self.logger:
                    self.logger.log_error(f"Error extracting text: {e}")

        return elements

    def _text_matches(self, found_text: str, target_text: str, fuzzy_match: bool) -> bool:
        found_lower = found_text.lower().strip()
        target_lower = target_text.lower().strip()

        if not fuzzy_match:
            return found_lower == target_lower

        if target_lower in found_lower or found_lower in target_lower:
            return True

        target_words = target_lower.split()
        found_words = found_lower.split()

        matching_words = sum(1 for word in target_words if any(word in fw for fw in found_words))
        return matching_words >= len(target_words) * 0.5

    def _is_search_result(self, text: str) -> bool:
        text = text.strip()

        if re.match(r'https?://', text) or re.match(r'www\.', text):
            return True

        if len(text) > 10 and len(text) < 200:
            words = text.split()
            if len(words) >= 2:
                return True

        return False

    def _looks_like_link(self, text: str) -> bool:
        text_lower = text.lower().strip()

        if re.match(r'https?://', text) or re.match(r'www\.', text):
            return True

        link_indicators = ['click here', 'read more', 'view', 'download', 'more info']
        if any(indicator in text_lower for indicator in link_indicators):
            return True

        return False

    def get_status(self) -> Dict[str, Any]:
        return {
            'easyocr_available': EASYOCR_AVAILABLE,
            'easyocr_initialized': self.easyocr_reader is not None,
            'pytesseract_available': PYTESSERACT_AVAILABLE,
        }
