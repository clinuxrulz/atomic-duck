import { createSignal, render } from "atomic-duck";

render(
  () => {
    let [ count, setCount, ] = createSignal(0);
    return (
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
  },
  document.getElementById("root"),
);
