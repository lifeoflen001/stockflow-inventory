import { useEffect, useRef } from "react";

export type PointerState = {
  x: number;
  y: number;
};

export function usePointerMotion(
  onFrame: (pointer: PointerState) => void
) {
  const pointer = useRef<PointerState>({
    x: window.innerWidth * 0.75,
    y: window.innerHeight * 0.45
  });

  const smooth = useRef({ ...pointer.current });

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      pointer.current = {
        x: event.clientX,
        y: event.clientY
      };
    };

    window.addEventListener("pointermove", handlePointerMove, {
      passive: true
    });

    let animationFrame = 0;

    const animate = () => {
      smooth.current.x +=
        (pointer.current.x - smooth.current.x) * 0.24;

      smooth.current.y +=
        (pointer.current.y - smooth.current.y) * 0.24;

      onFrame(smooth.current);
      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      cancelAnimationFrame(animationFrame);
    };
  }, [onFrame]);
}
