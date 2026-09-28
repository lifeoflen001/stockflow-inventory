import { useEffect, useRef } from "react";
import type { RefObject } from "react";

type EyeProps = {
  pointerRef: RefObject<{ x: number; y: number }>;
  maxTravel?: number;
};

export default function Eye({
  pointerRef,
  maxTravel = 4
}: EyeProps) {
  const eyeRef = useRef<HTMLSpanElement>(null);
  const pupilRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let frame = 0;

    const animate = () => {
      const eye = eyeRef.current;
      const pupil = pupilRef.current;
      const pointer = pointerRef.current;

      if (eye && pupil && pointer) {
        const rect = eye.getBoundingClientRect();

        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const deltaX = pointer.x - centerX;
        const deltaY = pointer.y - centerY;

        const distance = Math.hypot(deltaX, deltaY) || 1;

        const x = (deltaX / distance) * maxTravel;
        const y = (deltaY / distance) * maxTravel;

        pupil.style.transform =
          `translate3d(${x}px, ${y}px, 0)`;
      }

      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frame);
  }, [maxTravel, pointerRef]);

  return (
    <span className="stockflow-auth-eye" ref={eyeRef}>
      <span className="stockflow-auth-pupil" ref={pupilRef} />
    </span>
  );
}
