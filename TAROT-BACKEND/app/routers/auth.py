from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.config import get_app_settings
from app.logging_config import get_logger
from app.schemas.auth import (
    ForgotPasswordReq,
    RefreshTokenRequest,
    ResendVerifyReq,
    ResetPasswordReq,
    TokenResponse,
    UserLogin,
    UserSignup,
)
from app.database.client import get_db
import app.services.auth as auth_service

settings = get_app_settings()

router = APIRouter()
logger = get_logger(__name__)


@router.post("/test-email")
async def test_email(to: str):
    from fastapi_mail import NameEmail
    from app.services.email import send_email  # adjust import

    await send_email(
        recepientEmail=[NameEmail(email=to, name="Test User")],
        template_key="verify_account",
        vars={"username": "TestUser", "verify_link": "https://example.com/test-link"},
    )

    return {"status": "sent"}


@router.post("/test-email-raw")
async def test_email_raw(to: str):
    from fastapi_mail import MessageSchema, MessageType, FastMail, NameEmail
    from app.services.email import conf

    message = MessageSchema(
        subject="SMTP TEST",
        recipients=[NameEmail(email=to, name="Tester")],
        body="<h1>It works 🚀</h1>",
        subtype=MessageType.html,
    )

    fm = FastMail(conf)
    await fm.send_message(message)

    return {"status": "raw_sent"}


@router.post("/sign-up")
async def signup_endpoint(user_data: UserSignup, db: Session = Depends(get_db)):
    try:
        logger.info(
            "signup_attempt",
            username=user_data.username,
            email=user_data.email,
        )
        signup_response = await auth_service.sign_up(db, user_data)
        logger.info(
            "signup_success",
            user_id=signup_response.user.id,
            username=signup_response.user.username,
            email=signup_response.user.email,
            email_sent=signup_response.email_sent,
        )

        if signup_response.email_sent:
            message = f"Account created successfully. A verification email has been sent to {signup_response.user.email}. If you don't receive it, you can request a new one."
        else:
            message = f"Account created successfully. However, we couldn't send the verification email at this time. Please try again later using the resend verification option."

        return JSONResponse(
            content={"message": message},
            status_code=201,
        )
    except Exception as e:
        logger.error(
            "signup_failed",
            username=user_data.username,
            email=user_data.email,
            error=str(e),
            error_type=e.__class__.__name__,
        )
        raise


@router.post("/sign-in", response_model=TokenResponse)
def signin_endpoint(user_data: UserLogin, db: Session = Depends(get_db)):
    try:
        logger.info("signin_attempt", email=user_data.email)
        tokens = auth_service.sign_in(db, user_data)
        logger.info("signin_success", email=user_data.email)
        return JSONResponse(content=tokens, status_code=200)
    except Exception as e:
        logger.warning(
            "signin_failed",
            email=user_data.email,
            error=str(e),
            error_type=e.__class__.__name__,
        )
        raise


@router.post("/forgot-password")
async def forgot_password_endpoint(
    user_data: ForgotPasswordReq, db: Session = Depends(get_db)
):
    try:
        logger.info("forgot_password_request", email=user_data.email)
        message = await auth_service.forgot_password(db, user_data.email)
        logger.info("forgot_password_processed", email=user_data.email)
        return JSONResponse(content={"message": message}, status_code=200)
    except Exception as e:
        logger.error(
            "forgot_password_failed",
            email=user_data.email,
            error=str(e),
            error_type=e.__class__.__name__,
            exc_info=True,
        )
        raise


@router.post("/reset-password")
def reset_password_endpoint(
    reset_data: ResetPasswordReq, db: Session = Depends(get_db)
):
    try:
        logger.info("reset_password_attempt", token_prefix=reset_data.reset_token[:8])
        auth_service.reset_password(db, reset_data)
        logger.info("reset_password_success", token_prefix=reset_data.reset_token[:8])
        return JSONResponse(204)
    except Exception as e:
        logger.warning(
            "reset_password_failed",
            token_prefix=reset_data.reset_token[:8],
            error=str(e),
            error_type=e.__class__.__name__,
        )
        raise


@router.get("/verify-account/{token}")
def verify_account_endpoint(token: str, db: Session = Depends(get_db)):
    try:
        logger.info("verify_account_attempt", token_prefix=token[:8])
        auth_service.verify_account(db, token)
        logger.info("verify_account_success", token_prefix=token[:8])

        # Redirect to frontend with success status
        redirect_url = f"{settings.VERIFY_ACCOUNT_REDIRECT_URL}?status=success"
        return RedirectResponse(url=redirect_url, status_code=302)
    except Exception as e:
        logger.warning(
            "verify_account_failed",
            token_prefix=token[:8],
            error=str(e),
            error_type=e.__class__.__name__,
        )
        # Redirect to frontend with error status
        redirect_url = f"{settings.VERIFY_ACCOUNT_REDIRECT_URL}?status=error&message={e.__class__.__name__}"
        return RedirectResponse(url=redirect_url, status_code=302)


@router.post("/resend-verify-email")
async def resend_verify_email_endpoint(
    resend_verify_req: ResendVerifyReq, db: Session = Depends(get_db)
):
    try:
        logger.info("resend_verify_email_request", email=resend_verify_req.email)
        user = await auth_service.resend_verify_link(db, resend_verify_req.email)
        logger.info("resend_verify_email_success", email=user.email, user_id=user.id)
        return JSONResponse(
            content={"message": f"Link is successfully resent to {user.email}"},
            status_code=200,
        )
    except Exception as e:
        logger.warning(
            "resend_verify_email_failed",
            email=resend_verify_req.email,
            error=str(e),
            error_type=e.__class__.__name__,
        )
        raise


@router.post("/refresh-token", response_model=TokenResponse)
def refresh_token_endpoint(
    refresh_request: RefreshTokenRequest, db: Session = Depends(get_db)
):
    try:
        logger.info("refresh_token_attempt")
        tokens = auth_service.refresh_access_token(db, refresh_request.refresh_token)
        logger.info("refresh_token_success")
        return JSONResponse(content=tokens, status_code=200)
    except Exception as e:
        logger.warning(
            "refresh_token_failed",
            error=str(e),
            error_type=e.__class__.__name__,
        )
        raise
