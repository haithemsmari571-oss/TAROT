import { Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";

// All top-ups happen on the website's billing page (App Store policy on
// digital goods keeps payment out of the app). Single source of truth for the
// URL and for opening it: the in-app browser tab's promise resolves when she
// dismisses it, which is the signal every caller uses to re-fetch balances.
export const BILLING_URL = "https://askvalentina.co.uk/billing";

export async function openBillingPage(): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(BILLING_URL);
  } catch {
    // In-app tab unavailable (rare) — fall back to the external browser.
    try {
      await Linking.openURL(BILLING_URL);
    } catch {
      // Nothing to do; the caller's balance re-fetch simply finds no change.
    }
  }
}
