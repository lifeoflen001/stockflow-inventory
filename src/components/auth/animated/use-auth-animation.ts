import { useEffect, useMemo, useState } from "react";

export type AuthAnimationProps = {
  emailFocused: boolean;
  passwordFocused: boolean;
  passwordTypingPulse: number;
  emailInputId?: string;
  passwordInputId?: string;
};

export function useAuthAnimation() {
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [passwordTypingPulse, setPasswordTypingPulse] = useState(0);

  useEffect(() => {
    if (passwordTypingPulse <= 0) return undefined;
    const timer = window.setInterval(() => {
      setPasswordTypingPulse((current) => Math.max(0, current - 0.12));
    }, 30);
    return () => window.clearInterval(timer);
  }, [passwordTypingPulse]);

  return useMemo(() => ({
    animation: { emailFocused, passwordFocused, passwordTypingPulse } satisfies AuthAnimationProps,
    emailField: { onFocus: () => setEmailFocused(true), onBlur: () => setEmailFocused(false) },
    passwordField: { onFocus: () => setPasswordFocused(true), onBlur: () => setPasswordFocused(false) },
    pulsePasswordTyping: () => setPasswordTypingPulse(1),
  }), [emailFocused, passwordFocused, passwordTypingPulse]);
}
