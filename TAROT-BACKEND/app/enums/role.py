import enum

from app.enums.permissions import Permission


class Role(enum.Enum):
    USER = "USER"
    ADMIN = "ADMIN"
    SUPERADMIN = "SUPERADMIN"
    PSYCHIC = "PSYCHIC"


ROLE_PERMISSIONS = {
    Role.SUPERADMIN: list(Permission),
    Role.ADMIN: [
        Permission.MANAGE_USERS,
        Permission.MANAGE_PSYCHICS,
        Permission.MANAGE_TRANSACTIONS,
        Permission.MANAGE_ZODIAC,
        Permission.MANAGE_BUY_OPTIONS,
        Permission.MANAGE_SETTINGS,
        Permission.VIEW_TRANSACTIONS,
    ],
    Role.PSYCHIC: [
        Permission.VIEW_EARNINGS,
    ],
    Role.USER: [],
}
