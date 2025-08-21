import { createEffect, createRoot, createSignal } from "atomic-duck";

let dispose = createRoot((dispose) => {
  let [ count, setCount, ] = createSignal(0);
  // {count()}
  createEffect(() => console.log(count()));
  const appDiv = (
    <div>
      Count: {count()}<br/>
      <button
        onClick={() => setCount(count() + 1)}
      >
        +
      </button><br/>
      <button
        onClick={() => setCount(count() - 1)}
      >
        -
      </button><br/>
    </div>
  );
  document.getElementById("root")!.appendChild(appDiv as Node);
  return dispose;
});
