import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app.config import get_app_settings
from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.logging_config import bind_user_to_context, get_logger
from app.models.settings import Settings
from app.models.user import User
from app.schemas.payment import CreateCheckoutSessionRequest, UnitPriceResponse

router = APIRouter()
logger = get_logger(__name__)

settings = get_app_settings()


@router.get("/unit-price", response_model=UnitPriceResponse)
async def get_unit_price(db: Session = Depends(get_db)):
    """Get the current unit price per point in cents (public endpoint)."""
    try:
        unit_price_setting = (
            db.query(Settings).filter(Settings.key == "unit_price_cents").first()
        )
        if not unit_price_setting:
            logger.error("unit_price_not_configured")
            raise HTTPException(
                status_code=500, detail="Unit price not configured in settings"
            )

        unit_price_cents = int(unit_price_setting.value)

        logger.info(
            "unit_price_retrieved",
            unit_price_cents=unit_price_cents,
        )

        return {"unit_price_cents": unit_price_cents}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "unit_price_retrieval_failed",
            error=str(e),
            error_type=e.__class__.__name__,
            exc_info=True,
        )
        raise HTTPException(
            status_code=500, detail=f"Error retrieving unit price: {str(e)}"
        )


@router.post("/create-checkout-session")
async def create_checkout_session(
    request: CreateCheckoutSessionRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Bind user to context for logging
    bind_user_to_context(user.id)

    logger.info(
        "checkout_session_requested",
        user_id=user.id,
        points_amount=request.points_amount,
    )

    try:
        # Retrieve Stripe API key from settings table
        stripe_api_key_setting = (
            db.query(Settings).filter(Settings.key == "stripe_api_key").first()
        )
        if not stripe_api_key_setting or not stripe_api_key_setting.value:
            logger.error(
                "stripe_api_key_not_configured",
                user_id=user.id,
            )
            raise HTTPException(
                status_code=500, detail="Stripe API key not configured in settings"
            )

        # Retrieve unit price from settings table
        unit_price_setting = (
            db.query(Settings).filter(Settings.key == "unit_price_cents").first()
        )
        if not unit_price_setting:
            logger.error(
                "unit_price_not_configured",
                user_id=user.id,
            )
            raise HTTPException(
                status_code=500, detail="Unit price not configured in settings"
            )

        stripe.api_key = stripe_api_key_setting.value

        # Get the unit price value in cents
        unit_price_cents = int(unit_price_setting.value)
        points_amount = request.points_amount
        total_amount_cents = unit_price_cents * points_amount

        # Determine success URL
        if request.return_url:
            # Use custom return URL (for chat pause/resume flow)
            success_url = (
                f"{settings.FRONT_BASE_URL}{request.return_url}&status=success"
            )
        else:
            # Default to billing page
            success_url = f"{settings.FRONT_BASE_URL}/billing?status=success"

        # Create Stripe checkout session
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[
                {
                    "price_data": {
                        "currency": "usd",
                        "product_data": {"name": f"{points_amount} Tarot Points"},
                        "unit_amount": unit_price_cents,
                    },
                    "quantity": points_amount,
                }
            ],
            mode="payment",
            metadata={"user_id": str(user.id), "points": str(points_amount)},
            success_url=success_url,
            cancel_url=f"{settings.FRONT_BASE_URL}/billing?status=cancelled",
        )

        logger.info(
            "checkout_session_created",
            user_id=user.id,
            points_amount=points_amount,
            total_amount_cents=total_amount_cents,
            total_amount_usd=total_amount_cents / 100,
            session_id=session.id,
            currency="usd",
        )

        return {"url": session.url}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "checkout_session_creation_failed",
            user_id=user.id,
            points_amount=request.points_amount,
            error=str(e),
            error_type=e.__class__.__name__,
            exc_info=True,
        )
        raise HTTPException(
            status_code=400, detail=f"Error creating checkout session: {str(e)}"
        )


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None),
    db: Session = Depends(get_db),
):
    payload = await request.body()

    logger.debug("stripe_webhook_received")

    endpoint_secret_setting = (
        db.query(Settings).filter(Settings.key == "stripe_endpoint_secret").first()
    )
    if not endpoint_secret_setting or not endpoint_secret_setting.value:
        logger.error("stripe_endpoint_secret_not_configured")
        raise HTTPException(
            status_code=500, detail="Stripe endpoint secret not configured in settings"
        )

    try:
        event = stripe.Webhook.construct_event(
            payload, stripe_signature, endpoint_secret_setting.value
        )

        logger.info(
            "stripe_webhook_signature_verified",
            event_id=event["id"],
            event_type=event["type"],
        )

    except Exception as e:
        logger.warning(
            "stripe_webhook_signature_failure",
            error=str(e),
            error_type=e.__class__.__name__,
        )
        raise HTTPException(status_code=400, detail="Invalid signature")

    if event["type"] == "checkout.session.completed":
        try:
            session = event["data"]["object"]
            user_id = int(session["metadata"]["user_id"])
            points_to_add = int(session["metadata"]["points"])

            # Stripe event ID as idempotency key to prevent duplicate credits
            idempotency_key = event["id"]
            # Access payment_intent using bracket notation or getattr for Stripe objects
            payment_intent_id = getattr(session, "payment_intent", None)

            # Get amount paid from session (use getattr for Stripe objects)
            amount_total = getattr(session, "amount_total", 0)  # in cents

            logger.info(
                "stripe_checkout_completed",
                event_id=event["id"],
                user_id=user_id,
                points_to_add=points_to_add,
                amount_total_cents=amount_total,
                amount_total_usd=amount_total / 100 if amount_total else 0,
                payment_intent_id=payment_intent_id,
                session_id=session["id"],
                currency="usd",
            )

            from app.database.client import SessionLocal
            from app.exceptions.transactions import DuplicateTransactionError
            from app.services.transactions import create_credit_transaction

            with SessionLocal() as db:
                try:
                    # Create standardized description
                    description = f"Stripe purchase: {points_to_add} points"

                    # Create metadata
                    metadata = {
                        "stripe_session_id": session["id"],
                        "payment_method": "card",
                        "amount_paid_cents": amount_total,
                    }

                    transaction = create_credit_transaction(
                        db=db,
                        user_id=user_id,
                        amount=points_to_add,
                        description=description,
                        stripe_payment_intent_id=payment_intent_id,
                        idempotency_key=idempotency_key,
                        metadata=metadata,
                    )

                    logger.info(
                        "stripe_payment_credited",
                        transaction_id=transaction.id,
                        user_id=user_id,
                        points_added=points_to_add,
                        balance_before=transaction.balance_before,
                        balance_after=transaction.balance_after,
                        stripe_event_id=event["id"],
                        payment_intent_id=payment_intent_id,
                        idempotency_key=idempotency_key,
                    )

                    # Check if user has a paused chat session and resume it
                    from app.models.chat import Chat
                    from app.enums.chat_status import ChatStatus
                    from app.services.session_manager import (
                        get_session_manager,
                        InsufficientBalanceError,
                        SessionNotFoundError,
                    )

                    paused_chat = (
                        db.query(Chat)
                        .filter(
                            Chat.user_id == user_id, Chat.status == ChatStatus.PAUSED
                        )
                        .first()
                    )

                    if paused_chat:
                        logger.info(
                            "resuming_paused_chat_after_topup",
                            chat_id=paused_chat.id,
                            user_id=user_id,
                            new_balance=transaction.balance_after,
                        )

                        session_mgr = get_session_manager()
                        try:
                            # Resume session with new balance
                            session_info = session_mgr.resume_session(
                                paused_chat.id,
                                new_balance=float(transaction.balance_after),
                            )

                            # Broadcast resume event to WebSocket (now that resume succeeded)
                            await session_mgr._broadcast_session_resumed(
                                paused_chat.id, session_info
                            )

                            # Store and broadcast system message for resume
                            from app.services.chats import broadcast_system_message

                            await broadcast_system_message(
                                db, paused_chat.id, "Your session has resumed."
                            )

                            logger.info(
                                "paused_chat_resumed_successfully",
                                chat_id=paused_chat.id,
                                remaining_seconds=session_info.remaining_seconds,
                                broadcast_sent=True,
                            )

                        except InsufficientBalanceError as e:
                            logger.warning(
                                "insufficient_balance_to_resume_chat_after_payment",
                                chat_id=paused_chat.id,
                                error=str(e),
                                new_balance=transaction.balance_after,
                            )
                            # Notify user about insufficient balance
                            from app.notification_manager import notification_manager

                            notification_data = {
                                "type": "notification",
                                "notification_type": "INSUFFICIENT_BALANCE_AFTER_PAYMENT",
                                "title": "Additional Balance Needed",
                                "message": "Payment received but more balance needed to resume chat.",
                                "data": {"chat_id": paused_chat.id},
                            }
                            await notification_manager.send_to_user(
                                notification_data, user_id
                            )

                        except SessionNotFoundError as e:
                            logger.error(
                                "session_not_found_after_payment",
                                chat_id=paused_chat.id,
                                user_id=user_id,
                                error=str(e),
                                message="Session was reconstructed from DB but still failed - check logs",
                            )
                            # Notify user about manual intervention needed
                            from app.notification_manager import notification_manager

                            notification_data = {
                                "type": "notification",
                                "notification_type": "PAYMENT_SUCCESS_CHAT_NEEDS_MANUAL_RESUME",
                                "title": "Payment Successful",
                                "message": "Your payment was processed. Please refresh the page to continue your chat.",
                                "data": {"chat_id": paused_chat.id},
                            }
                            await notification_manager.send_to_user(
                                notification_data, user_id
                            )

                        except Exception as e:
                            logger.error(
                                "error_resuming_paused_chat_after_payment",
                                chat_id=paused_chat.id,
                                error=str(e),
                                exc_info=True,
                            )
                            # Notify user about error
                            from app.notification_manager import notification_manager

                            notification_data = {
                                "type": "notification",
                                "notification_type": "RESUME_ERROR_AFTER_PAYMENT",
                                "title": "Resume Error",
                                "message": "Payment successful but chat failed to resume. Please contact support.",
                                "data": {"chat_id": paused_chat.id},
                            }
                            await notification_manager.send_to_user(
                                notification_data, user_id
                            )

                except DuplicateTransactionError:
                    # Idempotency key already exists - this is a duplicate webhook
                    logger.warning(
                        "stripe_webhook_duplicate_ignored",
                        event_id=event["id"],
                        user_id=user_id,
                        points=points_to_add,
                        idempotency_key=idempotency_key,
                        message="Idempotency working as expected",
                    )
                    # Return success - idempotency is working as expected

        except Exception as e:
            logger.error(
                "stripe_webhook_processing_failed",
                event_id=getattr(event, "id", None),
                event_type=getattr(event, "type", None),
                error=str(e),
                error_type=e.__class__.__name__,
                exc_info=True,
            )
            raise HTTPException(
                status_code=500, detail=f"Error processing webhook: {str(e)}"
            )
    else:
        logger.debug(
            "stripe_webhook_event_ignored",
            event_id=event["id"],
            event_type=event["type"],
            message="Not checkout.session.completed",
        )

    return {"status": "success"}
