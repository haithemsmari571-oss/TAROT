from pydantic import BaseModel, field_validator


class CreateCheckoutSessionRequest(BaseModel):
    points_amount: int
    return_url: str | None = None

    @field_validator("points_amount")
    @classmethod
    def validate_points_amount(cls, v):
        if v <= 0:
            raise ValueError("points_amount must be greater than 0")
        return v


class UnitPriceResponse(BaseModel):
    unit_price_cents: int
