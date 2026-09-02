const WHEEL_BOOST = 2.35;

function wheelDelta(event: WheelEvent, viewport: number): number {
  const raw = event.deltaY;
  if (event.deltaMode === 1) return raw * 16;
  if (event.deltaMode === 2) return raw * viewport;
  return raw;
}

/** Acelera um pouco o scroll de listas no UXP, onde o delta da roda vem pequeno. */
export function boostElementWheelScroll(element: HTMLElement): void {
  if (element.dataset.fastScroll === "1") return;
  element.dataset.fastScroll = "1";

  element.addEventListener(
    "wheel",
    (event) => {
      if (element.scrollHeight <= element.clientHeight + 1) return;
      event.preventDefault();
      element.scrollTop += wheelDelta(event, element.clientHeight) * WHEEL_BOOST;
    },
    { passive: false }
  );
}
