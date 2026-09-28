import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import Eye from "./Eye";

type Props = {
  emailFocused: boolean;
  passwordFocused: boolean;
  passwordTypingPulse: number;
  emailInputId?: string;
  passwordInputId?: string;
};

type CharacterPose = {
  x: number;
  y: number;
  rotate: number;
  scaleX: number;
  scaleY: number;
};

const neutral: CharacterPose = {
  x: 0,
  y: 0,
  rotate: 0,
  scaleX: 1,
  scaleY: 1
};

export default function AuthCharacters({
  emailFocused,
  passwordFocused,
  passwordTypingPulse,
  emailInputId = "email",
  passwordInputId = "password"
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef({
    x: window.innerWidth * 0.75,
    y: window.innerHeight * 0.45
  });

  const smoothRef = useRef({ ...pointerRef.current });

  const purpleRef = useRef<HTMLDivElement>(null);
  const blackRef = useRef<HTMLDivElement>(null);
  const yellowRef = useRef<HTMLDivElement>(null);
  const orangeRef = useRef<HTMLDivElement>(null);

  const [blinkPurple, setBlinkPurple] = useState(false);
  const [blinkBlack, setBlinkBlack] = useState(false);
  const [blinkYellow, setBlinkYellow] = useState(false);
  const [blinkOrange, setBlinkOrange] = useState(false);

  const focusPoint = useCallback(() => {
    if (!emailFocused && !passwordFocused) return null;

    const target = document.getElementById(passwordFocused ? passwordInputId : emailInputId);

    if (!target) return null;

    const rect = target.getBoundingClientRect();

    return {
      x: rect.left + rect.width * 0.18,
      y: rect.top + rect.height * 0.55
    };
  }, [emailFocused, passwordFocused, emailInputId, passwordInputId]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!emailFocused && !passwordFocused) {
        pointerRef.current = {
          x: event.clientX,
          y: event.clientY
        };
      }
    };

    window.addEventListener("pointermove", move, {
      passive: true
    });

    return () => window.removeEventListener("pointermove", move);
  }, [emailFocused, passwordFocused]);

  useEffect(() => {
    let frame = 0;

    const setPose = (
      ref: RefObject<HTMLDivElement | null>,
      pose: CharacterPose
    ) => {
      if (!ref.current) return;

      ref.current.style.transform =
        `translate3d(${pose.x}px, ${pose.y}px, 0)
         rotate(${pose.rotate}deg)
         scale(${pose.scaleX}, ${pose.scaleY})`;
    };

    const animate = () => {
      const target = focusPoint() ?? pointerRef.current;

      smoothRef.current.x +=
        (target.x - smoothRef.current.x) * 0.25;

      smoothRef.current.y +=
        (target.y - smoothRef.current.y) * 0.25;

      pointerRef.current = {
        ...smoothRef.current
      };

      const stage = stageRef.current;

      if (stage) {
        const rect = stage.getBoundingClientRect();

        const nx = Math.max(
          -1,
          Math.min(
            1,
            (smoothRef.current.x -
              (rect.left + rect.width / 2)) /
              (rect.width / 2)
          )
        );

        const ny = Math.max(
          -1,
          Math.min(
            1,
            (smoothRef.current.y -
              (rect.top + rect.height / 2)) /
              (rect.height / 2)
          )
        );

        const strength =
          passwordFocused ? 0.78 :
          emailFocused ? 0.92 : 1;

        let purplePose: CharacterPose = {
          ...neutral,
          x: nx * 13 * strength,
          y: ny * 5,
          rotate: nx * 7,
          scaleX: 1 - Math.abs(nx) * 0.035,
          scaleY: 1 + Math.abs(nx) * 0.025
        };

        let blackPose: CharacterPose = {
          ...neutral,
          x: nx * 11,
          y: ny * 4,
          rotate: nx * 5,
          scaleX: 1 - Math.abs(nx) * 0.02,
          scaleY: 1 + Math.abs(nx) * 0.01
        };

        let yellowPose: CharacterPose = {
          ...neutral,
          x: nx * 9,
          y: ny * 3.5,
          rotate: nx * 4,
          scaleX: 1,
          scaleY: 1
        };

        let orangePose: CharacterPose = {
          ...neutral,
          x: nx * 6,
          y: ny * 3,
          rotate: nx * 1.3,
          scaleX: 1 + Math.abs(nx) * 0.015,
          scaleY: 1 - Math.abs(nx) * 0.008
        };

        if (passwordTypingPulse > 0) {
          purplePose.rotate -= 4 * passwordTypingPulse;
          purplePose.x -= 5 * passwordTypingPulse;

          blackPose.rotate -= 2 * passwordTypingPulse;

          yellowPose.rotate += 5 * passwordTypingPulse;
          yellowPose.x += 8 * passwordTypingPulse;

          orangePose.scaleX += 0.04 * passwordTypingPulse;
          orangePose.scaleY -= 0.04 * passwordTypingPulse;
        }

        setPose(purpleRef, purplePose);
        setPose(blackRef, blackPose);
        setPose(yellowRef, yellowPose);
        setPose(orangeRef, orangePose);
      }

      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frame);
  }, [
    emailFocused,
    passwordFocused,
    passwordTypingPulse,
    focusPoint
  ]);

  useEffect(() => {
    let timeout = 0;

    const blink = () => {
      const index = Math.floor(Math.random() * 4);

      const setters = [
        setBlinkPurple,
        setBlinkBlack,
        setBlinkYellow,
        setBlinkOrange
      ];

      setters[index](true);

      window.setTimeout(() => setters[index](false), 100);

      timeout = window.setTimeout(
        blink,
        1500 + Math.random() * 2500
      );
    };

    timeout = window.setTimeout(blink, 1500);

    return () => window.clearTimeout(timeout);
  }, []);

  const expression =
    passwordFocused
      ? "worried"
      : emailFocused
        ? "curious"
        : "neutral";

  return (
    <section className="stockflow-auth-stage" ref={stageRef}>
      <div
        className={`stockflow-auth-character-scene stockflow-auth-expression-${expression}`}
      >
        <div className="stockflow-auth-floor" />

        <div
          ref={purpleRef}
          className={`stockflow-auth-character stockflow-auth-purple ${
            blinkPurple ? "stockflow-auth-blink" : ""
          }`}
        >
          <div className="body" />
          <div className="stockflow-auth-face">
            <Eye pointerRef={pointerRef} maxTravel={3.8} />
            <Eye pointerRef={pointerRef} maxTravel={3.8} />
          </div>
          <span className="stockflow-auth-mouth" />
        </div>

        <div
          ref={blackRef}
          className={`stockflow-auth-character stockflow-auth-black ${
            blinkBlack ? "stockflow-auth-blink" : ""
          }`}
        >
          <div className="body" />
          <div className="stockflow-auth-face">
            <Eye pointerRef={pointerRef} maxTravel={4.1} />
            <Eye pointerRef={pointerRef} maxTravel={4.1} />
          </div>
        </div>

        <div
          ref={yellowRef}
          className={`stockflow-auth-character stockflow-auth-yellow ${
            blinkYellow ? "stockflow-auth-blink" : ""
          }`}
        >
          <div className="body" />
          <div className="stockflow-auth-face">
            <Eye pointerRef={pointerRef} maxTravel={3.4} />
            <Eye pointerRef={pointerRef} maxTravel={3.4} />
          </div>
          <span className="stockflow-auth-mouth" />
        </div>

        <div
          ref={orangeRef}
          className={`stockflow-auth-character stockflow-auth-orange ${
            blinkOrange ? "stockflow-auth-blink" : ""
          }`}
        >
          <div className="body" />
          <div className="stockflow-auth-face">
            <Eye pointerRef={pointerRef} maxTravel={3.2} />
            <Eye pointerRef={pointerRef} maxTravel={3.2} />
          </div>
          <span className="stockflow-auth-mouth" />
        </div>
      </div>
    </section>
  );
}

