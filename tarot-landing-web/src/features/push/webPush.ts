/* Phone notifications in this browser (ROUND57), for the client app (app
   "client", the service worker under /app/) and the owner's phone admin (app
   "owner", the same worker under /owner/). The server keeps one row per
   browser (TAROT-BACKEND app/routers/push.py) and pushes to it; the worker
   shows the notification and opens it on a tap (client-app/offline/sw.js).

   Nothing here throws at a screen. With no service worker (the dev server, a
   failed registration), no key on the server, or a browser that cannot do it,
   the state says so and push is simply off. */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import axiosClient from "@/lib/axiosClient";
import {
  APP_SCOPE,
  OPEN_FROM_NOTIFICATION,
  OWNER_SCOPE,
  SERVICE_WORKER_FILE,
} from "@/features/client-app/offline/appServiceWorker";
import { isIos, runsStandalone } from "@/features/client-app/useInstallPrompt";

export type PushApp = "client" | "owner";
const SCOPE: Record<PushApp, string> = { client: APP_SCOPE, owner: OWNER_SCOPE };

/* What a screen shows:
   checking           still reading the browser
   off-server         the server has no key: show nothing at all
   unsupported        this browser cannot receive notifications
   home-screen-first  an iPhone or iPad in Safari: only the home-screen app can
   blocked            she said no in the browser; only its settings can undo it
   on / off           this browser is subscribed, or not */
export type PushState = "checking" | "off-server" | "unsupported" | "home-screen-first" | "blocked" | "on" | "off";

/* The words both apps show under their switch (the You tab's Notifications,
   AV Admin's Alerts), and how to undo a browser's no. */
export const PUSH_COPY = {
  on: "On",
  off: "Off",
  blocked: "Blocked in your browser settings",
  unsupported: "Not available in this browser",
  failed: "They could not be turned on. Try again.",
  fixOnIphone: (appName: string) => `To allow them, open Settings on your iPhone, tap Notifications, then ${appName}.`,
  fixInBrowser: "To allow them, open this site's settings from the icon beside the address, allow notifications, then reload the page.",
} as const;

/* The line for a browser's no: an iPhone's home-screen app is set in the
   phone's Settings, every other browser in its site settings. */
export function blockedFix(appName: string): string {
  return isIos() && runsStandalone() ? PUSH_COPY.fixOnIphone(appName) : PUSH_COPY.fixInBrowser;
}

const PUBLIC_KEY_QUERY = ["push-public-key"] as const;

/* GET /push/public-key: the server's key, or null while push is off there. */
export function usePushKey() {
  return useQuery({
    queryKey: PUBLIC_KEY_QUERY,
    queryFn: async () => (await axiosClient.get<{ public_key: string | null }>("/push/public-key")).data.public_key,
    staleTime: Infinity,
  });
}

/* Before anything is asked: an iPhone outside the home-screen app first,
   since Safari has no push there; then whether this page can do it at all.
   The worker exists in a production build only (appServiceWorker.ts). */
export function pushSupport(): "ok" | "home-screen-first" | "unsupported" {
  if (isIos() && !runsStandalone()) return "home-screen-first";
  const capable = import.meta.env.PROD && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  return capable ? "ok" : "unsupported";
}

function keyBytes(key: string): Uint8Array<ArrayBuffer> {
  const base64 = (key + "=".repeat((4 - (key.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function sameKey(subscription: PushSubscription, key: string): boolean {
  const held = subscription.options.applicationServerKey;
  if (!held) return false;
  const a = new Uint8Array(held);
  const b = keyBytes(key);
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

/* This app's registration once its worker is active. The page at /owner is
   outside the /owner/ scope, so navigator.serviceWorker.ready never answers
   there: the registration itself is waited on. */
async function activeRegistration(app: PushApp): Promise<ServiceWorkerRegistration> {
  const scope = SCOPE[app];
  const registration = (await navigator.serviceWorker.getRegistration(scope))
    ?? (await navigator.serviceWorker.register(`/${SERVICE_WORKER_FILE}`, { scope, updateViaCache: "none" }));
  if (registration.active) return registration;
  const worker = registration.installing ?? registration.waiting;
  if (worker) {
    await new Promise<void>((resolve) => {
      const settle = () => { if (worker.state === "activated" || worker.state === "redundant") resolve(); };
      worker.addEventListener("statechange", settle);
      settle();
    });
  }
  return registration;
}

async function currentSubscription(app: PushApp): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration(SCOPE[app]);
  return registration ? registration.pushManager.getSubscription() : null;
}

/* POST /push/subscription: idempotent on the browser's address, so it is
   safe on every load. */
async function keep(app: PushApp, subscription: PushSubscription) {
  await axiosClient.post("/push/subscription", { ...subscription.toJSON(), app });
}

async function subscribe(app: PushApp, key: string): Promise<PushSubscription> {
  const registration = await activeRegistration(app);
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  await keep(app, subscription);
  return subscription;
}

/* Log out and Sign out wait at most this long for it. */
const FORGET_WAIT_MS = 3000;

/* Turn notifications off in this browser: forgotten by the server first,
   then by the browser. Also called on Log out and Sign out, so a shared phone
   stops ringing for the account that left. Never throws, and gives up waiting
   after FORGET_WAIT_MS. */
export async function forgetPushHere(app: PushApp): Promise<void> {
  const forget = async () => {
    try {
      if (pushSupport() !== "ok") return;
      const subscription = await currentSubscription(app);
      if (!subscription) return;
      await axiosClient.delete("/push/subscription", { data: { endpoint: subscription.endpoint } }).catch(() => undefined);
      await subscription.unsubscribe();
    } catch {
      /* push simply stays as it was */
    }
  };
  await Promise.race([forget(), new Promise<void>((resolve) => setTimeout(resolve, FORGET_WAIT_MS))]);
}

/* On every load of the app or the owner's admin, with permission already
   given: make sure the server holds this browser for whoever is signed in
   now, and subscribe afresh when the server's key has changed. Never throws. */
export function useKeepPushInStep(app: PushApp, signedIn: boolean) {
  const key = usePushKey();
  const publicKey = key.data;
  useEffect(() => {
    if (!signedIn || !publicKey || pushSupport() !== "ok" || Notification.permission !== "granted") return;
    void (async () => {
      try {
        const subscription = await currentSubscription(app);
        if (!subscription) return;
        if (sameKey(subscription, publicKey)) await keep(app, subscription);
        else {
          await subscription.unsubscribe();
          await subscribe(app, publicKey);
        }
      } catch {
        /* the next load tries again */
      }
    })();
  }, [app, signedIn, publicKey]);
}

/* A tapped notification with this area already open: the worker brings the
   page to the front and posts the address, and the page moves there itself
   (offline/sw.js, notificationclick). */
export function useOpenFromNotification() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const open = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: unknown } | null;
      if (data?.type === OPEN_FROM_NOTIFICATION && typeof data.url === "string" && data.url.startsWith("/")) navigate(data.url);
    };
    navigator.serviceWorker.addEventListener("message", open);
    return () => navigator.serviceWorker.removeEventListener("message", open);
  }, [navigate]);
}

/* The state of notifications in this browser for one app, read honestly from
   the browser and the server, with the two actions. turnOn must run in a tap:
   it opens the browser's own question. */
export function usePush(app: PushApp) {
  const key = usePushKey();
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | null>(
    () => ("Notification" in window ? Notification.permission : null),
  );
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const support = pushSupport();

  useEffect(() => {
    if (support !== "ok") return;
    let live = true;
    currentSubscription(app)
      .then((subscription) => { if (live) setSubscribed(!!subscription); })
      .catch(() => { if (live) setSubscribed(false); });
    return () => { live = false; };
  }, [app, support]);

  let state: PushState;
  if (key.isPending) state = "checking";
  else if (!key.data) state = "off-server";
  else if (support !== "ok") state = support;
  else if (permission === "denied") state = "blocked";
  else if (subscribed === null) state = "checking";
  else state = subscribed && permission === "granted" ? "on" : "off";

  const publicKey = key.data;
  const turnOn = useCallback(async (): Promise<PushState> => {
    if (!publicKey || pushSupport() !== "ok") return "off";
    setBusy(true);
    setFailed(false);
    try {
      const answer = await Notification.requestPermission();
      setPermission(answer);
      if (answer !== "granted") return answer === "denied" ? "blocked" : "off";
      await subscribe(app, publicKey);
      setSubscribed(true);
      return "on";
    } catch {
      setFailed(true);
      return "off";
    } finally {
      setBusy(false);
    }
  }, [app, publicKey]);

  const turnOff = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    await forgetPushHere(app);
    setSubscribed(false);
    setBusy(false);
  }, [app]);

  /* permission "default": she has never answered the browser's own question here. */
  return { state, permission, busy, failed, turnOn, turnOff };
}
