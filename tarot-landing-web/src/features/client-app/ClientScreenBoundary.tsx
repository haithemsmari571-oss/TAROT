/* The shell's catch for a screen that cannot draw. Each tab's screen is its
   own file, fetched the first time she opens it (App.tsx, lazy); with no
   network, or after a release has replaced the files her page still names,
   that fetch fails, and with nothing to catch it React dropped the whole app,
   tab bar and all, for a blank page. Here the failure stays inside the content
   area: the tab bar stays, and Try again reloads the page, which fetches the
   screen afresh once the network is back. Moving to another screen clears it. */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { REFUSAL_FALLBACK } from "@/lib/serverRefusal";
import "./client-chats.css";

interface Props {
  /** The address; when it changes the next screen gets its own try. */
  resetKey: string;
  children: ReactNode;
}

interface State {
  failed: boolean;
}

export default class ClientScreenBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("client_screen_failed", error, info.componentStack);
  }

  componentDidUpdate(previous: Props) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <p className="client-chats-notice" role="alert">
        {REFUSAL_FALLBACK} <button type="button" onClick={() => window.location.reload()}>Try again</button>
      </p>
    );
  }
}
