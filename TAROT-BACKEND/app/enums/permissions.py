import enum


class Permission(enum.Enum):
    MANAGE_USERS = "manage_users"
    MANAGE_PSYCHICS = "manage_psychics"
    MANAGE_TRANSACTIONS = "manage_transactions"
    MANAGE_ZODIAC = "manage_zodiac"
    MANAGE_BUY_OPTIONS = "manage_buy_options"
    MANAGE_SETTINGS = "manage_settings"
    MANAGE_CATEGORIES = "manage_categories"
    VIEW_EARNINGS = "view_earnings"
    VIEW_TRANSACTIONS = "view_transactions"
