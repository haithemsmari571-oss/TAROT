from app.exceptions.domain import DomainError


class TemplateNotFound(DomainError):
    status_code = 404
    message = "Template not found"


class TemplateVariabelNotFilled(DomainError):
    status_code = 500
    message = "Tempalte variable is not filled"


class EmailServiceUnavailable(DomainError):
    status_code = 503
    message = "Email service is currently unavailable. Please try again later"
