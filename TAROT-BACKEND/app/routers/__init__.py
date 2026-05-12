from .auth import router as auth_router
from .psychics import router as psychic_router
from .categories import router as categories_router
from .medias import router as medias_router
from .chats import router as chat_router
from .payments import router as payment_router
from .transactions import router as transaction_router
from .refunds import router as refund_router
from .users import router as user_router
from .profile import router as profile_router
from .zodiac import router as zodiac_router
from .admin_zodiac import router as admin_zodiac_router
from .reviews import router as review_router
from .settings import router as settings_router
from .notifications import router as notification_router
from .buy_options import router as buy_option_router
from .admin_buy_options import router as admin_buy_option_router
from .admin_transactions import router as admin_transaction_router
from .admin_psychics import router as admin_psychic_router
from .dashboard import router as dashboard_router

__all__ = [
    "auth_router",
    "psychic_router",
    "categories_router",
    "medias_router",
    "chat_router",
    "payment_router",
    "transaction_router",
    "refund_router",
    "user_router",
    "profile_router",
    "zodiac_router",
    "admin_zodiac_router",
    "review_router",
    "settings_router",
    "notification_router",
    "buy_option_router",
    "admin_buy_option_router",
    "admin_transaction_router",
    "admin_psychic_router",
    "dashboard_router",
]
