import json
import os
import random
from datetime import time, datetime
from pathlib import Path
from typing import Dict, List

from sqlalchemy.orm import Session

import app.models  # do not remove
from app.database.client import SessionLocal
from app.enums.role import Role
from app.enums.chat_status import ChatStatus
from app.enums.message_status import MessageStatus
from app.enums.chat_session_status import ChatSessionStatus
from app.enums.transaction_type import TransactionType
from app.enums.transaction_status import TransactionStatus
from app.models.category import Category
from app.models.psychic_availability import PsychicAvailability
from app.models.psychic_categories import PsychicCategory
from app.models.settings import Settings
from app.models.user import User
from app.models.zodiac_sign import ZodiacSign
from app.models.zodiac_compatibility import ZodiacCompatibility
from app.models.life_path_number import LifePathNumber
from app.models.life_path_compatibility import LifePathCompatibility
from app.models.chat import Chat
from app.models.message import Message
from app.models.chat_session import ChatSession
from app.models.session_intervals import SessionInterval
from app.models.transaction import Transaction
from app.models.review import Review
from app.models.buy_option import BuyOption
from app.utils.security import hash_password
from app.utils.zodiac_calculator import (
    calculate_compatibility_percentages,
    get_elemental_insight,
)
from app.utils.life_path_calculator import get_life_path_compatibility_score


def read_seeders():
    env = os.getenv("ENV", "dev").lower()

    base_path = Path(__file__).parent / env
    seed_data = {}
    for file in base_path.glob("*.json"):
        key = file.stem
        with open(file) as f:
            seed_data[key] = json.load(f)
    return seed_data


def seed_category(db: Session, categories_list: List[Dict]):
    for cat_data in categories_list:
        # Check if category already exists
        existing = (
            db.query(Category).filter(Category.title == cat_data.get("title")).first()
        )

        if not existing:
            category = Category(title=cat_data.get("title"))
            db.add(category)
    db.flush()


def random_time(start_hour=8, end_hour=20):
    hour = random.randint(start_hour, end_hour)
    minute = random.randint(0, 59)
    return time(hour, minute)


def fetch_random_categories(db: Session, n: int = 3) -> list[int]:
    all_ids = [c.id for c in db.query(Category.id).all()]

    if len(all_ids) == 0:
        return []

    n = min(n, len(all_ids))
    return random.sample(all_ids, n)


def seed_psychics(db: Session, psychic_list: List[Dict]):
    default_password = hash_password("password")
    for psy_data in psychic_list:
        # Check if psychic already exists
        existing = (
            db.query(User).filter(User.username == psy_data.get("username")).first()
        )

        if existing:
            continue

        psychic = User(
            username=psy_data.get("username"),
            email=psy_data.get("email"),
            is_verified=psy_data.get("is_verified"),
            price_per_second=psy_data.get("price_per_second"),
            password_hash=default_password,
            role=Role.PSYCHIC,
            bio=psy_data.get("bio"),
        )
        db.add(psychic)
        db.flush()

        for aval in psy_data.get("availability", []):
            aval = PsychicAvailability(
                psychic_id=psychic.id,
                day_of_the_week=aval.get("day_of_the_week"),
                start_at=random_time(),
                end_at=random_time(),
            )

            db.add(aval)
            db.flush()
        categories = fetch_random_categories(db, 3)
        for psy_cat in categories:
            psy_category = PsychicCategory(psychic_id=psychic.id, category_id=psy_cat)
            db.add(psy_category)


def seed_settings(db: Session, settings_list: List[Dict]):
    for setting_data in settings_list:
        # Check if setting already exists
        existing = (
            db.query(Settings).filter(Settings.key == setting_data.get("key")).first()
        )

        if not existing:
            setting = Settings(
                key=setting_data.get("key"), value=setting_data.get("value")
            )
            db.add(setting)


def seed_zodiac_signs(db: Session, zodiac_signs_list: List[Dict]):
    for sign_data in zodiac_signs_list:
        # Check if sign already exists
        existing = (
            db.query(ZodiacSign)
            .filter(ZodiacSign.name == sign_data.get("name"))
            .first()
        )

        if not existing:
            sign = ZodiacSign(
                name=sign_data.get("name"),
                element=sign_data.get("element"),
                modality=sign_data.get("modality"),
                ruling_planet=sign_data.get("ruling_planet"),
                date_range_start=sign_data.get("date_range_start"),
                date_range_end=sign_data.get("date_range_end"),
                core_trait=sign_data.get("core_trait"),
                signature_trait=sign_data.get("signature_trait"),
                description=sign_data.get("description"),
            )
            db.add(sign)
    db.flush()


def seed_zodiac_compatibility(db: Session):
    # Check if compatibility data already exists
    existing_count = db.query(ZodiacCompatibility).count()
    if existing_count > 0:
        return

    signs = db.query(ZodiacSign).all()
    for i, sign1 in enumerate(signs):
        for sign2 in signs[i + 1 :]:  # Only create one entry per pair
            # Calculate compatibility
            percentages = calculate_compatibility_percentages(
                sign1.element,
                sign2.element,
                sign1.modality,
                sign2.modality,
                sign1.ruling_planet,
                sign2.ruling_planet,
            )

            insight = get_elemental_insight(sign1.element, sign2.element)

            compatibility = ZodiacCompatibility(
                sign_id_1=sign1.id,
                sign_id_2=sign2.id,
                love_percentage=percentages["love_percentage"],
                communication_percentage=percentages["communication_percentage"],
                emotional_bond_percentage=percentages["emotional_bond_percentage"],
                overall_harmony_percentage=percentages["overall_harmony_percentage"],
                elemental_insight=insight,
                compatibility_description=None,
            )
            db.add(compatibility)
    db.flush()


def seed_life_path_numbers(db: Session, life_path_list: List[Dict]):
    for lp_data in life_path_list:
        # Check if life path number already exists
        existing = (
            db.query(LifePathNumber)
            .filter(LifePathNumber.number == lp_data.get("number"))
            .first()
        )

        if not existing:
            life_path = LifePathNumber(
                number=lp_data.get("number"),
                title=lp_data.get("title"),
                description=lp_data.get("description"),
                core_strengths={"strengths": lp_data.get("core_strengths", [])},
                growth_areas={"areas": lp_data.get("growth_areas", [])},
            )
            db.add(life_path)
    db.flush()


def seed_life_path_compatibility(db: Session):
    # Check if compatibility data already exists
    existing_count = db.query(LifePathCompatibility).count()
    if existing_count > 0:
        return

    life_paths = db.query(LifePathNumber).all()
    for i, lp1 in enumerate(life_paths):
        for lp2 in life_paths[i + 1 :]:  # Only create one entry per pair
            score = get_life_path_compatibility_score(lp1.number, lp2.number)

            # Generate description based on score
            if score >= 85:
                description = "Highly compatible — a natural and harmonious pairing with great potential."
            elif score >= 70:
                description = "Very compatible — strong connection with mutual understanding and support."
            elif score >= 55:
                description = "Moderately compatible — workable with effort and mutual appreciation."
            else:
                description = "Challenging pairing — requires significant understanding and compromise."

            compatibility = LifePathCompatibility(
                life_path_id_1=lp1.id,
                life_path_id_2=lp2.id,
                compatibility_score=score,
                compatibility_description=description,
            )
            db.add(compatibility)
    db.flush()


def seed_users(db: Session, users_list: List[Dict]):
    default_password = hash_password("password")
    for user_data in users_list:
        # Check if user already exists
        existing = (
            db.query(User).filter(User.username == user_data.get("username")).first()
        )

        if existing:
            continue

        role_value = user_data.get("role", "USER")
        try:
            role = Role[role_value]
        except KeyError:
            role = Role.USER

        user = User(
            username=user_data.get("username"),
            email=user_data.get("email"),
            is_verified=user_data.get("is_verified"),
            balance=user_data.get("balance", 0),
            password_hash=default_password,
            role=role,
        )
        db.add(user)
    db.flush()


def seed_chats(db: Session, chats_list: List[Dict]):
    # Get all regular users and psychics
    users = db.query(User).filter(User.role == Role.USER).all()
    psychics = db.query(User).filter(User.role == Role.PSYCHIC).all()

    if not users or not psychics:
        return

    for chat_data in chats_list:
        user_index = chat_data.get("user_index", 1) - 1
        psychic_index = chat_data.get("psychic_index", 1) - 1

        if user_index >= len(users) or psychic_index >= len(psychics):
            continue

        user = users[user_index]
        psychic = psychics[psychic_index]

        # Check if chat already exists
        existing = (
            db.query(Chat)
            .filter(Chat.user_id == user.id, Chat.psychic_id == psychic.id)
            .first()
        )

        if existing:
            continue

        chat = Chat(
            user_id=user.id,
            psychic_id=psychic.id,
            status=ChatStatus[chat_data.get("status", "REQUESTED")],
        )
        db.add(chat)
    db.flush()


def seed_messages(db: Session, messages_list: List[Dict]):
    # Get all chats
    chats = db.query(Chat).all()
    if not chats:
        return

    for message_data in messages_list:
        chat_index = message_data.get("chat_index", 1) - 1

        if chat_index >= len(chats):
            continue

        chat = chats[chat_index]
        sender_type = message_data.get("sender_type", "user")

        # Determine sender_id based on sender_type
        sender_id = chat.user_id if sender_type == "user" else chat.psychic_id

        message = Message(
            chat_id=chat.id,
            sender_id=sender_id,
            content=message_data.get("content", ""),
            status=MessageStatus[message_data.get("status", "SENT")],
        )
        db.add(message)
    db.flush()


def seed_chat_sessions(db: Session, sessions_list: List[Dict]):
    # Get all chats
    chats = db.query(Chat).all()
    if not chats:
        return

    for session_data in sessions_list:
        chat_index = session_data.get("chat_index", 1) - 1

        if chat_index >= len(chats):
            continue

        chat = chats[chat_index]

        session = ChatSession(
            chat_id=chat.id,
            status=ChatSessionStatus[session_data.get("status", "ACTIVE")],
        )
        db.add(session)
    db.flush()


def seed_session_intervals(db: Session, intervals_list: List[Dict]):
    # Get all sessions
    sessions = db.query(ChatSession).all()
    if not sessions:
        return

    for interval_data in intervals_list:
        session_index = interval_data.get("session_index", 1) - 1

        if session_index >= len(sessions):
            continue

        session = sessions[session_index]

        # Parse datetime strings
        started_at_str = interval_data.get("started_at")
        ended_at_str = interval_data.get("ended_at")

        started_at = (
            datetime.strptime(started_at_str, "%Y-%m-%d %H:%M:%S")
            if started_at_str
            else None
        )
        ended_at = (
            datetime.strptime(ended_at_str, "%Y-%m-%d %H:%M:%S")
            if ended_at_str
            else None
        )

        interval = SessionInterval(
            session_id=session.id,
            started_at=started_at,
            ended_at=ended_at,
            is_billed=interval_data.get("is_billed", False),
            trigger_event=interval_data.get("trigger_event"),
            termination_reason=interval_data.get("termination_reason"),
        )
        db.add(interval)
    db.flush()


def seed_transactions(db: Session, transactions_list: List[Dict]):
    # Get all users and chats
    users = db.query(User).filter(User.role == Role.USER).all()
    chats = db.query(Chat).all()
    intervals = db.query(SessionInterval).all()

    if not users:
        return

    for transaction_data in transactions_list:
        user_index = transaction_data.get("user_index", 1) - 1

        if user_index >= len(users):
            continue

        user = users[user_index]

        # Get related chat and interval if specified
        related_chat_id = None
        related_session_interval_id = None

        if transaction_data.get("related_chat_index"):
            chat_index = transaction_data.get("related_chat_index") - 1
            if chat_index < len(chats):
                related_chat_id = chats[chat_index].id

        if transaction_data.get("related_session_interval_index"):
            interval_index = transaction_data.get("related_session_interval_index") - 1
            if interval_index < len(intervals):
                related_session_interval_id = intervals[interval_index].id

        transaction = Transaction(
            user_id=user.id,
            transaction_type=TransactionType[
                transaction_data.get("transaction_type", "CREDIT")
            ],
            amount=transaction_data.get("amount", 0),
            balance_before=transaction_data.get("balance_before", 0),
            balance_after=transaction_data.get("balance_after", 0),
            status=TransactionStatus[transaction_data.get("status", "COMPLETED")],
            description=transaction_data.get("description"),
            related_chat_id=related_chat_id,
            related_session_interval_id=related_session_interval_id,
        )
        db.add(transaction)
    db.flush()


def seed_reviews(db: Session, reviews_list: List[Dict]):
    # Get all users and psychics
    users = db.query(User).filter(User.role == Role.USER).all()
    psychics = db.query(User).filter(User.role == Role.PSYCHIC).all()

    if not users or not psychics:
        return

    for review_data in reviews_list:
        user_index = review_data.get("user_index", 1) - 1
        psychic_index = review_data.get("psychic_index", 1) - 1

        if user_index >= len(users) or psychic_index >= len(psychics):
            continue

        user = users[user_index]
        psychic = psychics[psychic_index]

        # Note: Allowing multiple reviews from same user to same psychic
        # since unique constraint is commented out in the model
        review = Review(
            user_id=user.id,
            psychic_id=psychic.id,
            rating=review_data.get("rating", 5),
            comment=review_data.get("comment"),
        )
        db.add(review)
    db.flush()


def seed_buy_options(db: Session, buy_options_list: List[Dict]):
    for opt_data in buy_options_list:
        existing = (
            db.query(BuyOption).filter(BuyOption.label == opt_data.get("label")).first()
        )
        if existing:
            continue
        option = BuyOption(
            label=opt_data.get("label"),
            points=opt_data.get("points"),
            is_active=opt_data.get("is_active", True),
            sort_order=opt_data.get("sort_order", 0),
        )
        db.add(option)
    db.flush()


def seed_all():
    seed_data = read_seeders()
    db = SessionLocal()
    try:
        # Seed settings
        settings_list = seed_data.get("settings", [])
        seed_settings(db, settings_list)
        print("[SEED] Settings seeded")

        # Seed categories
        categories_list = seed_data.get("category", [])
        seed_category(db, categories_list)
        print("[SEED] Categories seeded")

        # Seed psychics (must come before users to ensure role ordering)
        psychic_list = seed_data.get("psychics", [])
        seed_psychics(db, psychic_list)
        print("[SEED] Psychics seeded")

        # Seed regular users
        users_list = seed_data.get("users", [])
        seed_users(db, users_list)
        print("[SEED] Users seeded")

        # Seed chats (requires users and psychics)
        chats_list = seed_data.get("chats", [])
        seed_chats(db, chats_list)
        print("[SEED] Chats seeded")

        # Seed messages (requires chats)
        messages_list = seed_data.get("messages", [])
        seed_messages(db, messages_list)
        print("[SEED] Messages seeded")

        # Seed chat sessions (requires chats)
        sessions_list = seed_data.get("chat_sessions", [])
        seed_chat_sessions(db, sessions_list)
        print("[SEED] Chat sessions seeded")

        # Seed session intervals (requires sessions)
        intervals_list = seed_data.get("session_intervals", [])
        seed_session_intervals(db, intervals_list)
        print("[SEED] Session intervals seeded")

        # Seed transactions (requires users, chats, and intervals)
        transactions_list = seed_data.get("transactions", [])
        seed_transactions(db, transactions_list)
        print("[SEED] Transactions seeded")

        # Seed reviews (requires users and psychics)
        reviews_list = seed_data.get("reviews", [])
        seed_reviews(db, reviews_list)
        print("[SEED] Reviews seeded")

        # Seed zodiac data
        zodiac_signs_list = seed_data.get("zodiac_signs", [])
        seed_zodiac_signs(db, zodiac_signs_list)
        seed_zodiac_compatibility(db)
        print("[SEED] Zodiac data seeded")

        # Seed life path data
        life_path_list = seed_data.get("life_path_numbers", [])
        seed_life_path_numbers(db, life_path_list)
        seed_life_path_compatibility(db)
        print("[SEED] Life path data seeded")

        # Seed buy options
        buy_options_list = seed_data.get("buy_options", [])
        seed_buy_options(db, buy_options_list)
        print("[SEED] Buy options seeded")

        db.commit()
        print("[SEED] All data seeded successfully!")
    except Exception as e:
        db.rollback()
        print("[SEED] Seeding failed:", e)
        raise
    finally:
        db.close()


def main():
    seed_all()


if __name__ == "__main__":
    main()
