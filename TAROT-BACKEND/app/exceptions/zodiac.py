from app.exceptions.domain import DomainError


class ZodiacSignNotFoundError(DomainError):
    def __init__(self, sign_id: int | None = None, sign_name: str | None = None):
        if sign_id:
            message = f"Zodiac sign with ID {sign_id} not found"
        elif sign_name:
            message = f"Zodiac sign '{sign_name}' not found"
        else:
            message = "Zodiac sign not found"
        super().__init__(message, status_code=404)


class ZodiacCompatibilityNotFoundError(DomainError):
    def __init__(self, compatibility_id: int | None = None):
        if compatibility_id:
            message = f"Zodiac compatibility with ID {compatibility_id} not found"
        else:
            message = "Zodiac compatibility record not found"
        super().__init__(message, status_code=404)


class LifePathNumberNotFoundError(DomainError):
    def __init__(self, life_path_id: int | None = None, number: int | None = None):
        if life_path_id:
            message = f"Life path number with ID {life_path_id} not found"
        elif number:
            message = f"Life path number {number} not found"
        else:
            message = "Life path number not found"
        super().__init__(message, status_code=404)


class LifePathCompatibilityNotFoundError(DomainError):
    def __init__(self, compatibility_id: int | None = None):
        if compatibility_id:
            message = f"Life path compatibility with ID {compatibility_id} not found"
        else:
            message = "Life path compatibility record not found"
        super().__init__(message, status_code=404)


class InvalidBirthdateError(DomainError):
    def __init__(self, birthdate: str):
        message = f"Invalid birthdate format: {birthdate}. Expected format: DD/MM/YYYY"
        super().__init__(message, status_code=400)


class InvalidZodiacSignError(DomainError):
    def __init__(self, sign_name: str):
        message = f"Invalid zodiac sign: {sign_name}"
        super().__init__(message, status_code=400)


class DuplicateLifePathNumberError(DomainError):
    def __init__(self, number: int):
        message = f"Life path number {number} already exists"
        super().__init__(message, status_code=409)
