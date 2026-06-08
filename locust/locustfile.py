import json
import random
import time
from locust import HttpUser, task, between


def _post(client, url, json_data, retries=3):
    for attempt in range(retries):
        try:
            resp = client.post(url, json=json_data)
            if resp.status_code < 500:
                return resp
        except Exception:
            if attempt == retries - 1:
                raise
        time.sleep(1 * (attempt + 1))
    return None


class PublicEndpointsUser(HttpUser):
    wait_time = between(1, 3)

    @task(5)
    def get_landing(self):
        self.client.get("/landing")

    @task(3)
    def get_public_settings(self):
        self.client.get("/settings/public")

    @task(3)
    def list_categories(self):
        self.client.get("/category/")

    @task(1)
    def get_category_detail(self):
        self.client.get("/category/1")

    @task(2)
    def list_psychics(self):
        self.client.get("/psychic/")

    @task(1)
    def get_unit_price(self):
        self.client.get("/payment/unit-price")


class AuthenticatedUser(HttpUser):
    wait_time = between(2, 6)

    def on_start(self):
        uid = random.randint(0, 10**9)
        self.email = f"loadtest_{uid}@example.com"
        self.password = "Test1234!"

        _post(self.client, "/auth/sign-up", {
            "username": f"loadtest_{uid}",
            "email": self.email,
            "password": self.password,
        })

        resp = _post(self.client, "/auth/sign-in", {
            "email": self.email,
            "password": self.password,
        })
        if resp and resp.ok:
            self.token = resp.json().get("access_token", "")
            self.client.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            self.token = ""

    @task(3)
    def get_profile(self):
        self.client.get("/profile/me")

    @task(2)
    def get_balance(self):
        self.client.get("/transactions/me/balance")

    @task(2)
    def get_notifications(self):
        self.client.get("/notifications/")

    @task(2)
    def get_buy_options(self):
        self.client.get("/buy-options")

    @task(1)
    def get_transactions(self):
        self.client.get("/transactions/me")

    @task(1)
    def get_my_chats(self):
        self.client.get("/chat/my-chats")

    @task(1)
    def list_chats(self):
        self.client.get("/chat/")

    @task(1)
    def mark_notifications_read(self):
        self.client.post("/notifications/read-all")


class ChatFlowUser(HttpUser):
    wait_time = between(3, 10)

    def on_start(self):
        uid = random.randint(0, 10**9)
        self.password = "Test1234!"
        self.email = f"chatflow_{uid}@example.com"
        self.chat_id = None

        _post(self.client, "/auth/sign-up", {
            "username": f"chatflow_{uid}",
            "email": self.email,
            "password": self.password,
        })

        resp = _post(self.client, "/auth/sign-in", {
            "email": self.email,
            "password": self.password,
        })
        if resp and resp.ok:
            self.token = resp.json().get("access_token", "")
            self.client.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            self.token = ""

        psychics_resp = self.client.get("/psychic/")
        self.psychic_ids = []
        if psychics_resp.ok:
            data = psychics_resp.json()
            items = data if isinstance(data, list) else (data.get("data") or data.get("items") or data.get("results") or [])
            self.psychic_ids = [p.get("id") for p in items if isinstance(p, dict) and p.get("id")]

    @task(3)
    def get_my_chats(self):
        self.client.get("/chat/my-chats")

    @task(2)
    def request_chat(self):
        if not self.psychic_ids:
            return
        psychic_id = random.choice(self.psychic_ids)
        resp = self.client.post("/chat/request", json={
            "psychic_id": psychic_id,
            "message": "Hello, I would like a tarot reading please.",
        })
        if resp.ok:
            data = resp.json()
            if isinstance(data, dict) and data.get("chat_id"):
                self.chat_id = data["chat_id"]

    @task(1)
    def get_chat_messages(self):
        if not self.chat_id:
            return
        self.client.get(f"/chat/{self.chat_id}/messages")

    @task(1)
    def get_chat_session_time(self):
        if not self.chat_id:
            return
        self.client.get(f"/chat/{self.chat_id}/session-time")

    @task(1)
    def get_chat_details(self):
        if not self.chat_id:
            return
        self.client.get(f"/chat/{self.chat_id}/details")


class BillingUser(HttpUser):
    wait_time = between(3, 8)

    def on_start(self):
        uid = random.randint(0, 10**9)
        self.password = "Test1234!"
        self.email = f"billing_{uid}@example.com"

        _post(self.client, "/auth/sign-up", {
            "username": f"billing_{uid}",
            "email": self.email,
            "password": self.password,
        })

        resp = _post(self.client, "/auth/sign-in", {
            "email": self.email,
            "password": self.password,
        })
        if resp and resp.ok:
            self.token = resp.json().get("access_token", "")
            self.client.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            self.token = ""

    @task(3)
    def get_balance(self):
        self.client.get("/transactions/me/balance")

    @task(2)
    def get_unit_price(self):
        self.client.get("/payment/unit-price")

    @task(2)
    def get_buy_options(self):
        self.client.get("/buy-options")

    @task(1)
    def get_transactions(self):
        self.client.get("/transactions/me")

    @task(1)
    def create_checkout_session(self):
        self.client.post("/payment/create-checkout-session", json={
            "points_amount": random.choice([100, 250, 500]),
        })


class WebSocketUser(HttpUser):
    wait_time = between(5, 15)

    def on_start(self):
        uid = random.randint(0, 10**9)
        self.password = "Test1234!"
        self.email = f"ws_{uid}@example.com"

        _post(self.client, "/auth/sign-up", {
            "username": f"ws_{uid}",
            "email": self.email,
            "password": self.password,
        })

        resp = _post(self.client, "/auth/sign-in", {
            "email": self.email,
            "password": self.password,
        })
        self.token = resp.json().get("access_token", "") if resp and resp.ok else ""

        if self.token:
            self.client.headers.update({"Authorization": f"Bearer {self.token}"})

    @task(2)
    def notification_websocket(self):
        if not self.token:
            return
        try:
            from websocket import create_connection
            ws = create_connection("ws://backend:8000/notifications/ws", timeout=10)
            ws.send(json.dumps({"type": "auth", "token": self.token}))
            result = json.loads(ws.recv())
            if result.get("type") == "auth_success":
                ws.send(json.dumps({"type": "ping"}))
                json.loads(ws.recv())
            ws.close()
        except Exception:
            pass

    @task(1)
    def get_my_chats_for_ws(self):
        if not self.token:
            return
        resp = self.client.get("/chat/my-chats")
        if resp.ok:
            data = resp.json()
            chats = data if isinstance(data, list) else (data if isinstance(data, dict) else [])
            self.available_chat_ids = [c.get("id") for c in chats if isinstance(c, dict) and c.get("id")]
        else:
            self.available_chat_ids = []

    @task(1)
    def chat_websocket(self):
        if not self.token or not hasattr(self, "available_chat_ids") or not self.available_chat_ids:
            return
        try:
            from websocket import create_connection
            chat_id = random.choice(self.available_chat_ids)
            ws = create_connection(f"ws://backend:8000/chat/ws/{chat_id}", timeout=10)
            ws.send(json.dumps({"type": "auth", "token": self.token}))
            result = json.loads(ws.recv())
            if result.get("type") == "auth_success":
                ws.send(json.dumps({"type": "ping"}))
                json.loads(ws.recv())
            ws.close()
        except Exception:
            pass
