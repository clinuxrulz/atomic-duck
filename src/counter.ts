import { createEffect, createMemo, createRoot, createSignal } from "./lib"

export function setupCounters(
  element1: HTMLButtonElement,
  element2: HTMLButtonElement,
  element3: HTMLDivElement,
) {
  let [ counter1, setCounter1, ] = createSignal(2);
  let [ counter2, setCounter2, ] = createSignal(3);
  let dispose_ = createRoot((dispose) => {
    createEffect(() => {
      element1.innerText = `count1 is ${counter1()}`;
    });
    createEffect(() => {
      element2.innerText = `count2 is ${counter2()}`;
    });
    let result = createMemo<number>(() =>
      counter1() * counter2()
    );
    createEffect(() => {
      element3.innerText = `count1 * count2 = ${result()}`;
    });
    return dispose;
  });
  element1.addEventListener("click", () => {
    setCounter1(counter1() + 1);
  });
  element2.addEventListener("click", () => {
    setCounter2(counter2() + 1);
  });
}
