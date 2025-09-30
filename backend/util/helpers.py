import os
import sys
import time
import json
import hashlib
import platform
import subprocess
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Callable, Tuple, Union
from functools import wraps
from datetime import datetime, timedelta


def get_system_info() -> Dict[str, str]:
    return {
        'platform': platform.platform(),
        'system': platform.system(),
        'release': platform.release(),
        'version': platform.version(),
        'machine': platform.machine(),
        'processor': platform.processor(),
        'python_version': platform.python_version(),
        'hostname': platform.node(),
        'username': os.getenv('USERNAME', os.getenv('USER', 'Unknown'))
    }


def is_windows() -> bool:
    return platform.system().lower() == 'windows'


def is_mac() -> bool:
    return platform.system().lower() == 'darwin'


def is_linux() -> bool:
    return platform.system().lower() == 'linux'


def get_executable_path(program_name: str) -> Optional[str]:
    try:
        if is_windows():
            result = subprocess.run(['where', program_name],
                                  capture_output=True, text=True, shell=True)
            if result.returncode == 0:
                return result.stdout.strip().split('\n')[0]

            result = subprocess.run(['where', f'{program_name}.exe'],
                                  capture_output=True, text=True, shell=True)
            if result.returncode == 0:
                return result.stdout.strip().split('\n')[0]
        else:
            result = subprocess.run(['which', program_name],
                                  capture_output=True, text=True)
            if result.returncode == 0:
                return result.stdout.strip()
    except:
        pass

    return None


def run_command(command: Union[str, List[str]],
                capture_output: bool = True,
                timeout: Optional[int] = None,
                cwd: Optional[str] = None) -> Tuple[bool, str, str]:
    try:
        if isinstance(command, str):
            shell = True
        else:
            shell = False

        result = subprocess.run(
            command,
            capture_output=capture_output,
            text=True,
            timeout=timeout,
            cwd=cwd,
            shell=shell
        )

        return (
            result.returncode == 0,
            result.stdout if capture_output else "",
            result.stderr if capture_output else ""
        )

    except subprocess.TimeoutExpired:
        return False, "", "Command timed out"
    except Exception as e:
        return False, "", str(e)


def safe_file_operation(func: Callable) -> Callable:
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except FileNotFoundError:
            return False, "File not found"
        except PermissionError:
            return False, "Permission denied"
        except Exception as e:
            return False, f"File operation error: {str(e)}"
    return wrapper


@safe_file_operation
def read_file_safe(file_path: str, encoding: str = 'utf-8') -> Tuple[bool, str]:
    with open(file_path, 'r', encoding=encoding) as f:
        content = f.read()
    return True, content


@safe_file_operation
def write_file_safe(file_path: str, content: str, encoding: str = 'utf-8') -> Tuple[bool, str]:
    Path(file_path).parent.mkdir(parents=True, exist_ok=True)

    with open(file_path, 'w', encoding=encoding) as f:
        f.write(content)
    return True, "File written successfully"


@safe_file_operation
def append_file_safe(file_path: str, content: str, encoding: str = 'utf-8') -> Tuple[bool, str]:
    Path(file_path).parent.mkdir(parents=True, exist_ok=True)

    with open(file_path, 'a', encoding=encoding) as f:
        f.write(content)
    return True, "Content appended successfully"


def get_file_hash(file_path: str, algorithm: str = 'md5') -> Optional[str]:
    try:
        hash_obj = hashlib.new(algorithm)
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_obj.update(chunk)
        return hash_obj.hexdigest()
    except Exception as e:
        print(f"Hash calculation error: {e}")
        return None


def get_file_size(file_path: str) -> Optional[int]:
    try:
        return Path(file_path).stat().st_size
    except:
        return None


def format_file_size(size_bytes: int) -> str:
    if size_bytes == 0:
        return "0 B"

    size_names = ["B", "KB", "MB", "GB", "TB"]
    import math
    i = int(math.floor(math.log(size_bytes, 1024)))
    p = math.pow(1024, i)
    s = round(size_bytes / p, 2)
    return f"{s} {size_names[i]}"


def ensure_directory(directory: str) -> bool:
    try:
        Path(directory).mkdir(parents=True, exist_ok=True)
        return True
    except Exception as e:
        print(f"Directory creation error: {e}")
        return False


def cleanup_old_files(directory: str, days_old: int = 30,
                     pattern: str = "*", dry_run: bool = False) -> List[str]:
    deleted_files = []
    try:
        cutoff_time = time.time() - (days_old * 24 * 60 * 60)
        directory_path = Path(directory)

        if not directory_path.exists():
            return deleted_files

        for file_path in directory_path.glob(pattern):
            if file_path.is_file() and file_path.stat().st_mtime < cutoff_time:
                deleted_files.append(str(file_path))
                if not dry_run:
                    file_path.unlink()

    except Exception as e:
        print(f"Cleanup error: {e}")

    return deleted_files


def retry_operation(func: Callable, max_retries: int = 3,
                   delay: float = 1.0, exponential_backoff: bool = True) -> Any:
    last_exception = None

    for attempt in range(max_retries + 1):
        try:
            return func()
        except Exception as e:
            last_exception = e
            if attempt < max_retries:
                wait_time = delay * (2 ** attempt) if exponential_backoff else delay
                time.sleep(wait_time)
            else:
                raise last_exception


def timeout_function(timeout_seconds: int):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            result = [None]
            exception = [None]

            def target():
                try:
                    result[0] = func(*args, **kwargs)
                except Exception as e:
                    exception[0] = e

            thread = threading.Thread(target=target)
            thread.daemon = True
            thread.start()
            thread.join(timeout_seconds)

            if thread.is_alive():
                raise TimeoutError(f"Function {func.__name__} timed out after {timeout_seconds} seconds")

            if exception[0]:
                raise exception[0]

            return result[0]
        return wrapper
    return decorator


def debounce(wait_time: float):
    def decorator(func):
        last_called = [0.0]

        @wraps(func)
        def wrapper(*args, **kwargs):
            current_time = time.time()
            if current_time - last_called[0] >= wait_time:
                last_called[0] = current_time
                return func(*args, **kwargs)

        return wrapper
    return decorator


def throttle(rate_limit: float):
    def decorator(func):
        last_called = [0.0]

        @wraps(func)
        def wrapper(*args, **kwargs):
            current_time = time.time()
            time_since_last = current_time - last_called[0]

            if time_since_last < rate_limit:
                time.sleep(rate_limit - time_since_last)

            last_called[0] = time.time()
            return func(*args, **kwargs)

        return wrapper
    return decorator


def validate_email(email: str) -> bool:
    import re
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None


def validate_url(url: str) -> bool:
    import re
    pattern = r'^https?://(?:[-\w.])+(?:\:[0-9]+)?(?:/(?:[\w/_.])*(?:\?(?:[\w&=%.])*)?(?:#(?:[\w.])*)?)?$'
    return re.match(pattern, url) is not None


def sanitize_filename(filename: str) -> str:
    import re
    sanitized = re.sub(r'[<>:"/\\|?*]', '_', filename)
    sanitized = re.sub(r'[\x00-\x1f\x7f]', '', sanitized)
    sanitized = sanitized[:255]
    sanitized = sanitized.strip('. ')

    return sanitized or 'unnamed'


def parse_duration(duration_str: str) -> Optional[int]:
    import re

    pattern = r'^(\d+)([smhd])$'
    match = re.match(pattern, duration_str.lower())

    if not match:
        return None

    value, unit = match.groups()
    value = int(value)

    multipliers = {
        's': 1,
        'm': 60,
        'h': 3600,
        'd': 86400
    }

    return value * multipliers[unit]


def format_duration(seconds: int) -> str:
    if seconds < 60:
        return f"{seconds}s"
    elif seconds < 3600:
        minutes = seconds // 60
        remaining_seconds = seconds % 60
        if remaining_seconds == 0:
            return f"{minutes}m"
        else:
            return f"{minutes}m {remaining_seconds}s"
    elif seconds < 86400:
        hours = seconds // 3600
        remaining_minutes = (seconds % 3600) // 60
        if remaining_minutes == 0:
            return f"{hours}h"
        else:
            return f"{hours}h {remaining_minutes}m"
    else:
        days = seconds // 86400
        remaining_hours = (seconds % 86400) // 3600
        if remaining_hours == 0:
            return f"{days}d"
        else:
            return f"{days}d {remaining_hours}h"


def get_timestamp(format_str: str = "%Y-%m-%d %H:%M:%S") -> str:
    return datetime.now().strftime(format_str)


def parse_timestamp(timestamp_str: str, format_str: str = "%Y-%m-%d %H:%M:%S") -> Optional[datetime]:
    try:
        return datetime.strptime(timestamp_str, format_str)
    except ValueError:
        return None


def is_recent(timestamp: datetime, minutes: int = 5) -> bool:
    cutoff = datetime.now() - timedelta(minutes=minutes)
    return timestamp > cutoff


def deep_merge_dicts(dict1: Dict, dict2: Dict) -> Dict:
    result = dict1.copy()

    for key, value in dict2.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = deep_merge_dicts(result[key], value)
        else:
            result[key] = value

    return result


def get_nested_value(data: Dict, path: str, default: Any = None) -> Any:
    keys = path.split('.')
    current = data

    try:
        for key in keys:
            current = current[key]
        return current
    except (KeyError, TypeError):
        return default


def set_nested_value(data: Dict, path: str, value: Any) -> bool:
    keys = path.split('.')
    current = data

    try:
        for key in keys[:-1]:
            if key not in current:
                current[key] = {}
            current = current[key]

        current[keys[-1]] = value
        return True
    except (KeyError, TypeError):
        return False


def flatten_dict(data: Dict, parent_key: str = '', sep: str = '.') -> Dict:
    items = []

    for key, value in data.items():
        new_key = f"{parent_key}{sep}{key}" if parent_key else key

        if isinstance(value, dict):
            items.extend(flatten_dict(value, new_key, sep=sep).items())
        else:
            items.append((new_key, value))

    return dict(items)


def chunk_list(lst: List, chunk_size: int) -> List[List]:
    return [lst[i:i + chunk_size] for i in range(0, len(lst), chunk_size)]


def remove_duplicates(lst: List, key_func: Optional[Callable] = None) -> List:
    if key_func is None:
        seen = set()
        result = []
        for item in lst:
            if item not in seen:
                seen.add(item)
                result.append(item)
        return result
    else:
        seen = set()
        result = []
        for item in lst:
            key = key_func(item)
            if key not in seen:
                seen.add(key)
                result.append(item)
        return result


def progress_indicator(current: int, total: int, width: int = 50) -> str:
    if total == 0:
        return "[" + "=" * width + "] 100%"

    progress = current / total
    filled_width = int(width * progress)
    bar = "=" * filled_width + "-" * (width - filled_width)
    percentage = int(progress * 100)

    return f"[{bar}] {percentage}%"


class SingletonMeta(type):
    _instances = {}

    def __call__(cls, *args, **kwargs):
        if cls not in cls._instances:
            cls._instances[cls] = super(SingletonMeta, cls).__call__(*args, **kwargs)
        return cls._instances[cls]


class Timer:
    def __init__(self, description: str = "Operation"):
        self.description = description
        self.start_time = None
        self.end_time = None

    def __enter__(self):
        self.start_time = time.time()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.end_time = time.time()
        duration = self.end_time - self.start_time
        print(f"{self.description} took {duration:.3f} seconds")

    @property
    def elapsed(self) -> Optional[float]:
        if self.start_time and self.end_time:
            return self.end_time - self.start_time
        return None
