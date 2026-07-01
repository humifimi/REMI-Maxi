import { Component, createElement, type ComponentType, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

// Generic React error boundary. RN doesn't ship one, so this is the standard
// class-component pattern: catch render/lifecycle errors below this point and
// fall back to a UI passed by the caller, rather than letting the JS error
// bubble up and unmount the whole RN root (which on iOS reads as the app
// "crashing" — the JS engine is fine but the navigator host is gone).
//
// Use sparingly: only at boundaries where a corrupted local subtree shouldn't
// take the rest of the app down with it. Today that's the Profit Calculator
// (PM-MIG-19+ engine churn means a stale SecureStore blob from an earlier OTA
// can throw mid-render). If you reach for this for an authenticated screen,
// also wire bug-report capture so we hear about it instead of just showing a
// pretty error card to the user.

type FallbackProps = {
  error: Error;
  reset: () => void;
};

type Props = {
  children: ReactNode;
  /**
   * Component (not a render prop) used to display the caught error. Passed as
   * a component so it can use hooks like `useRouter` — calling it as a plain
   * function would attribute the hooks to the boundary itself, which is a
   * class and can't host hooks (React would throw "Invalid hook call").
   */
  fallback?: ComponentType<FallbackProps>;
  /**
   * Called once, when an error is caught. Use to log to bug-report or analytics.
   * Don't navigate from here — the boundary is rendering the fallback.
   */
  onError?: (error: Error, info: { componentStack?: string }) => void;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    this.props.onError?.(error, info);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      const Fallback = this.props.fallback ?? DefaultFallback;
      return createElement(Fallback, {
        error: this.state.error,
        reset: this.reset,
      });
    }
    return this.props.children;
  }
}

function DefaultFallback({ error }: FallbackProps) {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
    >
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.message}>{error.message || "Unknown error"}</Text>
      {error.stack ? (
        <View style={styles.stackBox}>
          <Text style={styles.stackText}>{error.stack}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  scroll: {
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: "#374151",
    marginBottom: 16,
  },
  stackBox: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    padding: 12,
  },
  stackText: {
    fontSize: 11,
    color: "#6B7280",
    fontFamily: "Menlo",
  },
});
