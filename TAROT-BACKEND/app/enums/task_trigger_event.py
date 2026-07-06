import enum


class TaskTriggerEvent(enum.Enum):
    """The detectable system events an AUTO task can bind to (Section 5).

    Only AUTO tasks carry a trigger event — code has to detect completion, so an
    auto task must map to one of these known events. Adding a brand-new event
    type is a code change; everything else about a task is admin config.

    Manual (SCREENSHOT/HANDLE) tasks leave this null — Logan verifies them by eye.
    """

    DAILY_PULL = "DAILY_PULL"                        # daily card pulled
    READING_RATED = "READING_RATED"                  # user rated a reading
    FAVOURITES_PICKED = "FAVOURITES_PICKED"          # 3 favourite guides saved
    FIRST_PURCHASE = "FIRST_PURCHASE"                # user's first payment
    PURCHASE_DISTINCT_READER = "PURCHASE_DISTINCT_READER"  # reading with Nth distinct reader
    REFERRAL_FIRST_PAYMENT = "REFERRAL_FIRST_PAYMENT"      # a referral's first payment
    STREAK_MILESTONE = "STREAK_MILESTONE"            # streak milestone reached
