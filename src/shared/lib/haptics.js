// Thin wrapper around the Web Vibration API. Android Chrome and most
// PWA contexts support it; iOS Safari historically does not (Apple
// has signaled limited PWA support in iOS 18+, but coverage is
// uneven). We just call through and let the platform decide — when
// vibration isn't available the call no-ops, so callers can fire
// haptics unconditionally without UA sniffing.
//
// Pair every haptic with a visible press animation so users on
// devices without vibration still get tactile-feeling feedback.

export function vibrate(pattern = 8) {
    try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate(pattern);
        }
    } catch {
        // Some platforms throw when called from non-secure contexts
        // or when the Vibration API is gated behind permissions.
        // Failing silently is the right move — feedback is a nice-to-
        // have, not load-bearing.
    }
}
