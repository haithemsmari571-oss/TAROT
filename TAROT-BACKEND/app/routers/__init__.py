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
from .admin_transactions import router as admin_transaction_router
from .admin_psychics import router as admin_psychic_router
from .dashboard import router as dashboard_router
from .landing import router as landing_router
from .public_settings import router as public_settings_router
from .client_dossier import router as client_dossier_router
from .admin_tasks import router as admin_tasks_router
from .constellation import router as constellation_router
from .admin_ai_prompts import router as admin_ai_prompts_router
from .admin_content import router as admin_content_router
from .reading_ai import router as reading_ai_router
from .second_brain_readonly import router as second_brain_readonly_router
from .second_brain_situation import router as second_brain_situation_router

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
    "admin_transaction_router",
    "admin_psychic_router",
    "dashboard_router",
    "landing_router",
    "public_settings_router",
    "client_dossier_router",
    "admin_tasks_router",
    "constellation_router",
    "admin_ai_prompts_router",
    "admin_content_router",
    "reading_ai_router",
    "second_brain_readonly_router",
    "second_brain_situation_router",
]
