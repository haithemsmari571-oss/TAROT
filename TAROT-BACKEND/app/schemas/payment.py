from pydantic import BaseModel, field_validator

from app.services.stardust import STARDUST_MAX_USD, STARDUST_MIN_USD


class CreateCheckoutSessionRequest(BaseModel):
    points_amount: int
    return_url: str | None = None

    @field_validator("points_amount")
    @classmethod
    def validate_points_amount(cls, v):
        if v <= 0:
            raise ValueError("points_amount must be greater than 0")
        return v


class CreateStardustCheckoutSessionRequest(BaseModel):
    """Custom-amount ("glider") checkout. Client sends a whole-dollar amount
    only; tier and points are always computed server-side."""

    amount_usd: int
    return_url: str | None = None

    @field_validator("amount_usd")
    @classmethod
    def validate_amount_usd(cls, v):
        if v < STARDUST_MIN_USD or v > STARDUST_MAX_USD:
            raise ValueError(
                f"amount_usd must be between ${STARDUST_MIN_USD} and ${STARDUST_MAX_USD}"
            )
        return v


class UnitPriceResponse(BaseModel):
    unit_price_cents: int
