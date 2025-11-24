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

    def find_elements_by_text(self, image_path: str, target_text: str, fuzzy_match: bool = True, exclude_texts: List[str] = None) -> List[FoundElement]:
        elements = []
        exclude_texts = exclude_texts or []

        if not Path(image_path).exists():
            return elements

        self._ensure_easyocr_initialized()

        try:
            if self.easyocr_reader:
                elements.extend(self._find_with_easyocr(image_path, target_text, fuzzy_match))

            elif PYTESSERACT_AVAILABLE:
                elements.extend(self._find_with_tesseract(image_path, target_text, fuzzy_match))

            # Filter out already-tried elements
            if exclude_texts:
                elements = [e for e in elements if e.text not in exclude_texts]
                if self.logger and len(elements) > 0:
                    self.logger.log_info(f"Filtered out {len(exclude_texts)} already-tried targets, {len(elements)} alternatives remain")

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

    def find_visual_elements(self, image_path: str) -> List[FoundElement]:
        """Detect clickable UI elements using computer vision (buttons, icons, etc.)"""
        elements = []
        
        try:
            img = cv2.imread(image_path)
            if img is None:
                return elements
                
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            
            # Detect rectangular button-like shapes using adaptive thresholding and contour detection
            blurred = cv2.GaussianBlur(gray, (5, 5), 0)
            thresh = cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2)
            
            contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            for contour in contours:
                area = cv2.contourArea(contour)
                # Filter by size (typical button/icon/card size)
                # Min area 400 (20x20 icon), Max area 100000 (large card/modal)
                if 400 < area < 100000:
                    x, y, w, h = cv2.boundingRect(contour)
                    aspect_ratio = w / float(h)
                    
                    # Filter shapes that are too thin or too wide to be buttons/cards
                    if 0.2 < aspect_ratio < 10.0:
                        center_x = x + w // 2
                        center_y = y + h // 2
                        
                        element = FoundElement(
                            text="",  # No text for pure visual elements
                            confidence=0.6,  # Base confidence for visual detection
                            coordinates=(center_x, center_y),
                            bounding_box=(x, y, w, h),
                            element_type='visual_element'
                        )
                        elements.append(element)
                        
            elements.sort(key=lambda x: (x.coordinates[1], x.coordinates[0]))
                        
        except Exception as e:
            if self.logger:
                self.logger.log_error(f"Error finding visual elements: {e}")
        
        return elements

    def _find_with_easyocr(self, image_path: str, target_text: str, fuzzy_match: bool) -> List[FoundElement]:
        elements = []

        try:
            results = self.easyocr_reader.readtext(image_path)

            if self.logger:
                self.logger.log_info(f"OCR found {len(results)} text elements, searching for: '{target_text}'")

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
                    
                    if self.logger:
                        self.logger.log_info(f"Matched: '{text}' (confidence: {confidence:.3f}) at {(center_x, center_y)}")

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

        # Exact match first
        if found_lower == target_lower:
            return True

        normalized_found = self._normalize_text(found_lower)
        normalized_target = self._normalize_text(target_lower)

        if not fuzzy_match:
            return normalized_found == normalized_target

        # Length-based filtering - if lengths are too different, likely not a match
        len_ratio = len(normalized_found) / max(len(normalized_target), 1)
        if len_ratio < 0.5 or len_ratio > 2.0:
            # Allow exception if target is very short (like "OK", "Go")
            if len(normalized_target) > 3:
                return False

        # Substring matching (case insensitive, normalized)
        if normalized_target and normalized_target in normalized_found:
            return True

        if normalized_found and normalized_found in normalized_target:
            return True

        # Word-based matching with stricter threshold
        target_words = target_lower.split()
        found_words = found_lower.split()

        # Must match at least 70% of target words (increased from 50%)
        if not target_words:
            return False

        matching_words = sum(1 for word in target_words if any(word in fw or fw in word for fw in found_words))
        match_ratio = matching_words / len(target_words)
        
        # Require at least 70% match for fuzzy matching
        return match_ratio >= 0.7

    def _normalize_text(self, text: str) -> str:
        # Keep alphanumeric and common symbols like $ for better currency matching
        # Remove only punctuation and special chars
        return ''.join(ch for ch in text if ch.isalnum() or ch in '$€£¥')

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

    def _find_most_similar(self, elements: List[FoundElement], target_text: str, threshold: float = 0.5) -> Optional[FoundElement]:
        """Find the most similar element using Levenshtein-like similarity."""
        if not elements or not target_text:
            return None
        
        target_normalized = self._normalize_for_similarity(target_text.lower())
        best_match = None
        best_score = 0.0
        
        for element in elements:
            if element.confidence < 0.3:  # Skip low confidence OCR results
                continue
                
            element_normalized = self._normalize_for_similarity(element.text.lower())
            
            # Calculate similarity score
            similarity = self._calculate_similarity(target_normalized, element_normalized)
            
            # Boost score if confidence is high
            adjusted_score = similarity * (0.7 + 0.3 * element.confidence)
            
            if adjusted_score > best_score:
                best_score = adjusted_score
                best_match = element
        
        # Only return if similarity is above threshold
        if best_score >= threshold:
            return best_match
        
        return None
    
    def _normalize_for_similarity(self, text: str) -> str:
        """Normalize text for similarity comparison, handling common OCR mistakes."""
        normalized = text.lower().strip()
        
        # Remove spaces and common separators
        normalized = normalized.replace(' ', '').replace('-', '').replace('_', '')
        
        # Keep only alphanumeric and currency symbols
        normalized = ''.join(ch for ch in normalized if ch.isalnum() or ch in '$€£¥')
        
        # Handle common OCR character confusions
        # Replace ambiguous letters with numbers they resemble
        char_map = str.maketrans({
            'o': '0',  # O -> 0
            'i': '1',  # I -> 1
            'l': '1',  # l -> 1
        })
        normalized = normalized.translate(char_map)
        
        return normalized
    
    def _calculate_similarity(self, str1: str, str2: str) -> float:
        """Calculate similarity score between two strings (0.0 to 1.0)."""
        if not str1 or not str2:
            return 0.0
        
        if str1 == str2:
            return 1.0
        
        # Check if one is substring of the other
        if str1 in str2 or str2 in str1:
            return 0.9
        
        # Calculate Levenshtein distance-based similarity
        len1, len2 = len(str1), len(str2)
        max_len = max(len1, len2)
        
        if max_len == 0:
            return 1.0
        
        # Simple edit distance calculation
        distance = self._levenshtein_distance(str1, str2)
        similarity = 1.0 - (distance / max_len)
        
        return max(0.0, similarity)
    
    def _levenshtein_distance(self, s1: str, s2: str) -> int:
        """Calculate Levenshtein distance between two strings."""
        if len(s1) < len(s2):
            return self._levenshtein_distance(s2, s1)
        
        if len(s2) == 0:
            return len(s1)
        
        previous_row = range(len(s2) + 1)
        for i, c1 in enumerate(s1):
            current_row = [i + 1]
            for j, c2 in enumerate(s2):
                # Cost of insertions, deletions, or substitutions
                insertions = previous_row[j + 1] + 1
                deletions = current_row[j] + 1
                substitutions = previous_row[j] + (c1 != c2)
                current_row.append(min(insertions, deletions, substitutions))
            previous_row = current_row
        
        return previous_row[-1]

    def get_status(self) -> Dict[str, Any]:
        return {
            'easyocr_available': EASYOCR_AVAILABLE,
            'easyocr_initialized': self.easyocr_reader is not None,
            'pytesseract_available': PYTESSERACT_AVAILABLE,
        }
