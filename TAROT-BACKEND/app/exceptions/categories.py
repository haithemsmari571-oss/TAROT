from app.exceptions.domain import DomainError

class CategoryNotFoundError(DomainError):
    status_code = 404
    message = "Category not found"

class CategoryAlreadyExistsError(DomainError):
    status_code = 400
    message = "Category already exists"
