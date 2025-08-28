import { mapArray } from "./array.ts";
import type { JSX } from "./jsx";

export type Accessor<A> = () => A;
export type Setter<A> = (a: A) => A;
export type Signal<A> = [ get: Accessor<A>, set: Setter<A>, ];
export type Component<P={}> = (props: P) => JSX.Element;

export { mapArray } from "./array.ts";

interface Disposable {
  (): void;
}

const enum ReactiveFlags {
  None = 0,
  Dirty = 1 << 0,
  RecomputingDeps = 1 << 1,
  InHeap = 1 << 2,
  InFallbackHeap = 1 << 3,
}

interface Link {
  dep: Signal2<unknown> | Computed<unknown>;
  sub: Computed<unknown>;
  nextDep: Link | null;
  prevSub: Link | null;
  nextSub: Link | null;
}

interface RawSignal<T> {
  subs: Link | null;
  subsTail: Link | null;
  value: T;
}

interface FirewallSignal<T> extends RawSignal<T> {
  owner: Computed<unknown>;
}

type Signal2<T> = RawSignal<T> | FirewallSignal<T>;

interface Computed<T> extends RawSignal<T> {
  deps: Link | null;
  depsTail: Link | null;
  flags: ReactiveFlags;
  context: Computed<unknown> | null;
  height: number;
  nextHeap: Computed<unknown> | undefined;
  prevHeap: Computed<unknown>;
  disposal: Disposable | Disposable[] | null;
  fn: () => T;
}

let context: Computed<unknown> | null = null;

let minDirty = Infinity;
let maxDirty = 0;
let nextMaxDirty = 0;
let contextHeight = 0;
let heapSize = 0;
let fallbackHeap: Computed<unknown> | undefined = undefined;
const dirtyHeap: (Computed<unknown> | undefined)[] = new Array(2000);
function increaseHeapSize(n: number) {
  if (n > dirtyHeap.length) {
    dirtyHeap.length = n;
  }
}

function insertIntoHeap(n: Computed<unknown>) {
  let flags = n.flags;
  if (flags & (ReactiveFlags.InHeap | ReactiveFlags.RecomputingDeps)) return;
  if (flags & ReactiveFlags.InFallbackHeap) {
    // flags ^= ReactiveFlags.InFallbackHeap;
    if (n.prevHeap === n) {
      fallbackHeap = undefined;
    } else {
      const next = n.nextHeap;
      const dhh = fallbackHeap!;
      const end = next ?? dhh;
      if (n === dhh) {
        fallbackHeap = next;
      } else {
        n.prevHeap.nextHeap = next;
      }
      end.prevHeap = n.prevHeap;
    }
    n.prevHeap = n;
    n.nextHeap = undefined;
  }
  heapSize++;
  n.flags = flags | ReactiveFlags.InHeap;
  const height = n.height;
  const heapAtHeight = dirtyHeap[height];
  if (heapAtHeight === undefined) {
    dirtyHeap[height] = n;
  } else {
    const tail = heapAtHeight.prevHeap;
    tail.nextHeap = n;
    n.prevHeap = tail;
    heapAtHeight.prevHeap = n;
  }
  if (height > maxDirty) {
    maxDirty = height;
  } else if (height <= minDirty) {
    nextMaxDirty = height;
  }
}

function moveToFallbackHeap(n: Computed<unknown>) {
  const flags = n.flags;
  if (flags & ReactiveFlags.InFallbackHeap) return;
  deleteFromHeap(n);
  n.flags |= ReactiveFlags.InFallbackHeap;
  if (fallbackHeap === undefined) {
    fallbackHeap = n;
  } else {
    const tail = fallbackHeap.prevHeap;
    tail.nextHeap = n;
    n.prevHeap = tail;
    fallbackHeap.prevHeap = n;
  }
}

function deleteFromHeap(n: Computed<unknown>) {
  const flags = n.flags;
  if (!(flags & ReactiveFlags.InHeap)) return;
  heapSize--;
  n.flags = flags & ~ReactiveFlags.InHeap;
  const height = n.height;
  if (n.prevHeap === n) {
    dirtyHeap[height] = undefined;
  } else {
    const next = n.nextHeap;
    const dhh = dirtyHeap[height]!;
    const end = next ?? dhh;
    if (n === dhh) {
      dirtyHeap[height] = next;
    } else {
      n.prevHeap.nextHeap = next;
    }
    end.prevHeap = n.prevHeap;
  }
  n.prevHeap = n;
  n.nextHeap = undefined;
}

function computed<T>(fn: () => T, isEager = false): Computed<T> {
  const self: Computed<T> = {
    disposal: null,
    fn: fn,
    value: undefined as T,
    height: 0,
    nextHeap: undefined,
    prevHeap: null as any,
    deps: null,
    depsTail: null,
    subs: null,
    subsTail: null,
    flags: ReactiveFlags.Dirty,
    context,
  };
  self.prevHeap = self;
  if (context) {
    self.height = contextHeight + 1;
    link(self, context);
  }
  if (isEager) {
    insertIntoHeap(self);
  }
  return self;
}

function signal<T>(
  v: T,
  firewall: Computed<unknown> | null = null,
): Signal2<T> {
  if (firewall !== null) {
    return {
      value: v,
      subs: null,
      subsTail: null,
      owner: firewall,
    };
  } else {
    return {
      value: v,
      subs: null,
      subsTail: null,
    };
  }
}

function recompute(el: Computed<unknown>) {
  runDisposal(el);
  const oldContext = context;
  const oldWorkingHeight = contextHeight;
  contextHeight = el.context ? el.context.height + 1 : 0;
  context = el;
  el.depsTail = null;
  el.flags |= ReactiveFlags.RecomputingDeps;
  let didNotError = true;
  let value;
  try {
    value = el.fn();
  } catch {
    didNotError = false;
  }
  if (el.height < contextHeight) {
    if (el.flags & ReactiveFlags.InHeap) {
      deleteFromHeap(el);
      el.height = contextHeight;
      insertIntoHeap(el);
    } else {
      el.height = contextHeight;
    }
  }
  el.flags &= ReactiveFlags.InHeap | ReactiveFlags.InFallbackHeap;
  context = oldContext;
  contextHeight = oldWorkingHeight;

  const depsTail = el.depsTail as Link | null;
  let toRemove = depsTail !== null ? depsTail.nextDep : el.deps;
  if (toRemove !== null) {
    do {
      toRemove = unlinkSubs(toRemove);
    } while (toRemove !== null);
    if (depsTail !== null) {
      depsTail.nextDep = null;
    } else {
      el.deps = null;
    }
  }

  if (value !== el.value) {
    if (didNotError) {
      el.value = value;
    }

    for (let s = el.subs; s !== null; s = s.nextSub) {
      insertIntoHeap(s.sub);
    }
  }
}

function updateIfNecessary(el: Computed<unknown>): void {
  const linkStack: Link[] = [];
  const computeStack: Computed<unknown>[] = [];
  let link = el.deps ?? undefined;
  let node: Signal2<unknown> | Computed<unknown> | undefined;
  while (link) {
    while (link) {
      node = link.dep;
      node = ("owner" in node ? node.owner : node) as Computed<unknown> | RawSignal<unknown>;
      const next: Link | undefined = link.nextDep ?? undefined;
      if ("fn" in node) {
        if (
          node.height < minDirty ||
          node.flags & (ReactiveFlags.RecomputingDeps | ReactiveFlags.InFallbackHeap)
        ) {
          link = next;
          continue;
        }
        if (node.flags & (ReactiveFlags.Dirty | ReactiveFlags.InHeap)) {
          moveToFallbackHeap(node);
          recompute(node);
          link = next;
          continue;
        }
        moveToFallbackHeap(node);
        computeStack.push(node);

        if (node.deps) {
          link = node.deps;
          if (next) {
            linkStack.push(next);
          }
          continue;
        }
      }
      link = next;
    }
    link = linkStack.pop();
    for (let i = computeStack.length - 1; i >= 0; i--) {
      const node = computeStack[i]!;
      if (node.flags & (ReactiveFlags.Dirty | ReactiveFlags.InHeap)) {
        deleteFromHeap(el);
        recompute(node);
      } else {
        el.flags &= ReactiveFlags.InHeap | ReactiveFlags.InFallbackHeap;
      }
    }
    computeStack.length = 0;
  }
  if (el.flags & (ReactiveFlags.Dirty | ReactiveFlags.InHeap)) {
    deleteFromHeap(el);
    recompute(el);
  } else {
    el.flags &= ReactiveFlags.InHeap | ReactiveFlags.InFallbackHeap;
  }
}

// https://github.com/stackblitz/alien-signals/blob/v2.0.3/src/system.ts#L100
function unlinkSubs(link: Link): Link | null {
  const dep = link.dep;
  const nextDep = link.nextDep;
  const nextSub = link.nextSub;
  const prevSub = link.prevSub;
  if (nextSub !== null) {
    nextSub.prevSub = prevSub;
  } else {
    dep.subsTail = prevSub;
  }
  if (prevSub !== null) {
    prevSub.nextSub = nextSub;
  } else {
    dep.subs = nextSub;
    if (nextSub === null && "fn" in dep) {
      unwatched(dep);
    }
  }
  return nextDep;
}

function unwatched(el: Computed<unknown>) {
  deleteFromHeap(el);
  let dep = el.deps;
  while (dep !== null) {
    dep = unlinkSubs(dep);
  }
  el.deps = null;
  runDisposal(el);
}

// https://github.com/stackblitz/alien-signals/blob/v2.0.3/src/system.ts#L52
function link(
  dep: Signal2<unknown> | Computed<unknown>,
  sub: Computed<unknown>,
) {
  const prevDep = sub.depsTail;
  if (prevDep !== null && prevDep.dep === dep) {
    return;
  }
  let nextDep: Link | null = null;
  const isRecomputing = sub.flags & ReactiveFlags.RecomputingDeps;
  if (isRecomputing) {
    nextDep = prevDep !== null ? prevDep.nextDep : sub.deps;
    if (nextDep !== null && nextDep.dep === dep) {
      sub.depsTail = nextDep;
      return;
    }
  }

  const prevSub = dep.subsTail;
  if (
    prevSub !== null &&
    prevSub.sub === sub &&
    (!isRecomputing || isValidLink(prevSub, sub))
  ) {
    return;
  }
  const newLink =
    (sub.depsTail =
      dep.subsTail =
      {
        dep,
        sub,
        nextDep,
        prevSub,
        nextSub: null,
      });
  if (prevDep !== null) {
    prevDep.nextDep = newLink;
  } else {
    sub.deps = newLink;
  }
  if (prevSub !== null) {
    prevSub.nextSub = newLink;
  } else {
    dep.subs = newLink;
  }
}

// https://github.com/stackblitz/alien-signals/blob/v2.0.3/src/system.ts#L284
function isValidLink(checkLink: Link, sub: Computed<unknown>): boolean {
  const depsTail = sub.depsTail;
  if (depsTail !== null) {
    let link = sub.deps!;
    do {
      if (link === checkLink) {
        return true;
      }
      if (link === depsTail) {
        break;
      }
      link = link.nextDep!;
    } while (link !== null);
  }
  return false;
}

export function read<T>(el: Signal2<T> | Computed<T>): T {
  if (context) {
    link(el, context);
  }
  const owner = "owner" in el ? el.owner : el;
  if ("fn" in owner) {
    if (owner.flags & (ReactiveFlags.Dirty | ReactiveFlags.InHeap)) {
      deleteFromHeap(owner);
      recompute(owner);
    } else if (
      heapSize > 0 &&
      owner.height >= minDirty
    ) {
      updateIfNecessary(owner);
    }
    if (context) {
      const height = owner.height;
      if (height >= contextHeight) {
        contextHeight = height + 1;
      }
    }
  }
  return el.value;
}

// Is the fallback heap actually worth it?
// The alternative is that unstable reads simply walk their source tree
// stopping at dirty or heaped nodes
function clearFallbackHeap() {
  while (fallbackHeap !== undefined) {
    fallbackHeap.flags ^= ReactiveFlags.InFallbackHeap;
    const prevFallbackHeap = fallbackHeap;
    fallbackHeap = fallbackHeap.nextHeap;
    prevFallbackHeap.prevHeap = prevFallbackHeap;
    prevFallbackHeap.nextHeap = undefined;
  }
}

function setSignal(el: Signal2<unknown>, v: unknown) {
  if (el.value === v) return;
  el.value = v;
  for (let link = el.subs; link !== null; link = link.nextSub) {
    insertIntoHeap(link.sub);
  }
  clearFallbackHeap();
}

function stabilize() {
  if (!heapSize) {
    return;
  }
  for (minDirty = 0; minDirty <= maxDirty; minDirty++) {
    let el = dirtyHeap[minDirty];
    while (el !== undefined) {
      deleteFromHeap(el);
      recompute(el);
      el = dirtyHeap[minDirty];
    }
  }
  clearFallbackHeap();
  minDirty = Infinity;
  maxDirty = nextMaxDirty;
  nextMaxDirty = 0;
}

export function onCleanup(fn: Disposable): Disposable {
  if (!context) return fn;

  const node = context;

  if (!node.disposal) {
    node.disposal = fn;
  } else if (Array.isArray(node.disposal)) {
    node.disposal.push(fn);
  } else {
    node.disposal = [node.disposal, fn];
  }
  return fn;
}

function runDisposal(node: Computed<unknown>): void {
  if (!node.disposal) return;

  if (Array.isArray(node.disposal)) {
    for (let i = 0; i < node.disposal.length; i++) {
      const callable = node.disposal[i];
      callable!.call(callable);
    }
  } else {
    node.disposal.call(node.disposal);
  }

  node.disposal = null;
}

export function createRoot<A>(k: (dispose: () => void) => A): A {
  let children = new Set<ADNode>();
  let cleanups: (() => void)[] = [];
  let node: ADNode = {
    state: "Clean",
    children,
    cleanups,
  };
  let dispose = () => cleanupNode(node);
  return useOwner(node, () => k(dispose));
}

export function createHalfEdge<A>(a: Accessor<A>): Accessor<void> {
  if (owner == undefined) {
    throw new Error("Creating a half edge outside owner is not supported.");
  }
  let children = new Set<ADNode>();
  let cleanups: (() => void)[] = [];
  let sources = new Set<ADNode>();
  let node: ADNode = {
    state: "Dirty",
    children,
    cleanups,
    sources,
    update: () => {
      useOwnerAndObserver(node, a);
      return false;
    },
  };
  owner.children?.add(node);
  transaction(() => {
    cursorSet.add(node);
    resetToStaleSet.add(node);
  });
  return () => {
    if (observer != undefined) {
      observer.sources?.add(node);
    }
    resolveNode(node);
  };
}

export function createSelector<A>(selection: Accessor<A | undefined>): (key: A) => boolean {
  let map = new Map<A,{
    s: Signal<boolean>,
    refCount: number,
  }>();
  let lastSelection: A | undefined = undefined;
  let halfEdge = createHalfEdge(() => {
    let selection2 = selection();
    if (selection2 === lastSelection) {
      return;
    }
    if (lastSelection != undefined) {
      let entry = map.get(lastSelection);
      if (entry != undefined) {
        entry.s[1](false);
      }
    }
    if (selection2 != undefined) {
      let entry = map.get(selection2);
      if (entry != undefined) {
        entry.s[1](true);
      }
    }
    lastSelection = selection2;
  });
  return (key) => {
    halfEdge();
    let entry = map.get(key);
    if (entry == undefined) {
      entry = {
        s: createSignal(untrack(() => selection() === key)),
        refCount: 1,
      };
      map.set(key, entry);
    } else {
      entry.refCount++;
    }
    onCleanup(() => {
      entry.refCount--;
      if (entry.refCount == 0) {
        queueMicrotask(() => {
          if (entry.refCount == 0) {
            map.delete(key);
          }
        });
      }
    });
    return entry.s[0]();
  };
}

// We must export these so the babel plugin can find them
export const createElement = (tag: string, props: any, ...children: any[]) => {
  const el = document.createElement(tag) as HTMLElement;

  for (const propName in props) {
    if (propName === 'ref') {
      props.ref(el);
      continue;
    }
    if (propName === 'style') {
      Object.assign(el.style, props[propName]);
      continue;
    }
    if (propName.startsWith('on')) {
      const eventName = propName.slice(2).toLowerCase();
      el.addEventListener(eventName, props[propName]);
      continue;
    }
    if (propName === 'className') {
      el.setAttribute('class', props[propName]);
      continue;
    }

    // Set other attributes
    el.setAttribute(propName, props[propName]);
  }

  // Handle children, including text and other elements
  insert(el, children);

  return el;
};

// Creates a reactive text node.
export const createTextNode = (text: string | number) => {
  const node = document.createTextNode('');
  insert(node, text);
  return node;
};

// We use a WeakMap to store the nodes from the previous render.

export const insert = (
  parent: Node,
  accessor: any,
  anchor: Node | null = null
) => {
  const lastNodesMap = new WeakMap<Node, Node[]>();
  // Use a comment node as a marker for the start of the inserted nodes
  let marker = document.createComment('');
  parent.insertBefore(marker, anchor);

  createEffect(() => {
    // Corrected: Handle both static values and function accessors
    const value = typeof accessor === 'function' ? accessor() : accessor;

    // Normalize the value into an array of nodes
    const resolvedNodes = Array.isArray(value) ? value : [value];
    
    const nodesToInsert = resolvedNodes.map(child => {
      // Check if the child is a function and resolve its value
      const resolvedChild = typeof child === 'function' ? untrack(child) : child;

      if (resolvedChild instanceof Node) {
        return resolvedChild;
      }
      return document.createTextNode(resolvedChild.toString());
    });

    // Get the nodes from the last render associated with this parent
    const oldNodes = lastNodesMap.get(parent) || [];

    // Remove the old nodes from the DOM
    for (const node of oldNodes) {
      if (node.parentNode === parent) {
        parent.removeChild(node);
      }
    }

    // Insert new nodes before the marker
    for (const node of nodesToInsert) {
      parent.insertBefore(node, marker);
    }
    
    // Store the new nodes for the next render's cleanup
    lastNodesMap.set(parent, nodesToInsert);
  });
};

export const createFragment = (children: any[]) => {
  const fragment = document.createDocumentFragment();
  children.forEach(child => {
    if (child instanceof Node) {
      fragment.appendChild(child);
    } else if (typeof child !== 'undefined' && child !== null) {
      fragment.appendChild(document.createTextNode(child.toString()));
    }
  });
  return fragment;
};

export function setAttribute(el: Element, key: string, value: any) {
  if (value == null || value === false) {
    el.removeAttribute(key);
  } else {
    el.setAttribute(key, value);
  }
}

// A cache to store the master copy of the template nodes
const templateCache = new Map<string, Node>();

/**
 * Creates and caches a template node, returning a factory function
 * that produces a deep clone of the node each time it's called.
 *
 * @param html The HTML string for the template.
 * @param isSVG Whether the template is an SVG fragment.
 * @returns A factory function that returns a cloned node.
 */
export function template(html: string, isSVG: boolean = false): () => Node {
  // Use a unique key for the cache that includes the SVG flag
  const cacheKey = `${html}:${isSVG}`;
  let cachedNode = templateCache.get(cacheKey);

  // If the template is not in the cache, create it
  if (!cachedNode) {
    // Create a <template> element, which can parse HTML without rendering it
    const templateEl = document.createElement('template');
    templateEl.innerHTML = html;

    if (isSVG) {
      // The babel plugin wraps SVG fragments in an <svg> tag to ensure they
      // are parsed correctly. Get the actual element inside the wrapper.
      cachedNode = templateEl.content.firstChild!.firstChild!;
    } else {
      // For regular HTML, the node is the first child of the template's content
      cachedNode = templateEl.content.firstChild!;
    }

    // Store the master copy in the cache for future use
    templateCache.set(cacheKey, cachedNode!);
  }

  // Return a function that, when called, returns a deep clone of the cached node.
  return () => cachedNode!.cloneNode(true);
}

// Define a map to hold the delegated event listeners
const delegatedEvents = new Set();

// The delegateEvents function that the compiler expects
export function delegateEvents(events) {
  for (const name of events) {
    if (!delegatedEvents.has(name)) {
      document.addEventListener(name, eventHandler);
      delegatedEvents.add(name);
    }
  }
}

// The generic event handler that will be called for all delegated events
function eventHandler(e) {
  const key = `$$${e.type}`;
  let node = (e.composedPath && e.composedPath()[0]) || e.target;

  // Find the closest ancestor with the event handler attached
  while (node) {
    const handler = node[key];
    if (handler && !node.disabled) {
      handler(e);
      // Stop bubbling if the event is a custom event
      if (e.type.startsWith('on')) e.stopPropagation();
      return;
    }
    node = node.parentNode;
  }
}

export const memo = createMemo;

export const createComponent = (Comp: Function, props: any) => {
  return untrack(() => Comp(props));
};

// This function is called by the JSX compiler for every event attribute (e.g., `onClick`).
// It sets the event handler directly on the node and delegates the event.
export const addEventListener = (
  node: Node,
  name: string,
  handler: Function
) => {
  // Prepend '$$' to the event name to create a unique property key for the handler.
  // This is a convention of `babel-plugin-jsx-dom-expressions`.
  const propertyKey = `$$${name}`;
  (node as any)[propertyKey] = handler;

  // Call the delegateEvents function to ensure a single event listener is
  // active on the document for this event type.
  delegateEvents([name]);
};

/**
 * Handles the className attribute for JSX elements.
 * It is reactive and updates the element's class when the accessor's value changes.
 * @param node The DOM node to apply the class to.
 * @param accessor The value or a signal function that returns the class value.
 */
export const className = (node: HTMLElement, accessor: any) => {
  // Use a reactive effect to handle all class name updates
  createEffect(() => {
    // Get the current value, handling both static values and signal functions
    const value = typeof accessor === 'function' ? accessor() : accessor;

    // Based on the value's type, build the final class string
    let classes = '';
    if (typeof value === 'string') {
      classes = value;
    } else if (Array.isArray(value)) {
      // Filter out null, undefined, and false values and join the rest
      classes = value.filter(Boolean).join(' ');
    } else if (typeof value === 'object' && value !== null) {
      // For an object, include classes with truthy values
      const activeClasses = Object.entries(value)
        .filter(([, isActive]) => isActive)
        .map(([className]) => className);
      classes = activeClasses.join(' ');
    }

    // Set the className on the DOM node
    node.className = classes;
  });
};

/**
 * Executes a reactive side effect on a DOM node.
 * The effect's callback is automatically re-run whenever a signal it accesses changes.
 * @param node The DOM node on which the effect is declared.
 * @param fn The callback function to execute. It receives the `node` as its only argument.
 */
export const effect = <T>(fn: (prev: T) => T, current: T) => {
  let v = current;
  createEffect(() => {
    v = fn(v);
  });
};

/**
 * Merges multiple props arrays and objects into a single, iterable,
 * array-like props object.
 * @param args The props arrays and objects to merge.
 * @returns A single, merged props object that is array-like and iterable.
 */
export const mergeProps = (...args: any[]) => {
  const merged = {};
  let lastIndex = 0;

  // First, process all arguments and combine them into a single, flat structure
  // We do this in a single loop to correctly handle a mix of arrays and objects
  for (const props of args) {
    if (Array.isArray(props)) {
      // If it's an array, merge its elements by their index
      for (let i = 0; i < (props as any).length; i++) {
        Object.defineProperty(merged, i, Object.getOwnPropertyDescriptor(props, i)!);
        if (i >= lastIndex) {
          lastIndex = i + 1;
        }
      }
    } else {
      // If it's an object, merge its properties using the standard logic
      for (const key of Reflect.ownKeys(props)) {
        Object.defineProperty(merged, key, Object.getOwnPropertyDescriptor(props, key)!);
      }
    }
  }

  // Manually add a length property to make it array-like
  Object.defineProperty(merged, 'length', {
    value: lastIndex,
    writable: true,
    enumerable: false,
    configurable: true,
  });

  // Manually add the Symbol.iterator to make it iterable
  merged[Symbol.iterator] = function*() {
    for (let i = 0; i < (merged as any).length; i++) {
      yield merged[i];
    }
  };

  return merged;
};

/**
 * Sets a single CSS property on an HTML element.
 * It also handles clearing the property if the value is null or undefined.
 * @param node The HTML element to style.
 * @param name The name of the CSS property (e.g., 'color', 'background-color').
 * @param value The value to set for the property.
 */
export const setStyleProperty = (node: HTMLElement, name: string, value: any) => {
  if (value === null || value === undefined) {
    // If the value is null or undefined, remove the property
    node.style.removeProperty(name);
  } else {
    // Otherwise, set the property with the given value
    node.style.setProperty(name, value);
  }
};

export function render(code: () => JSX.Element, target: HTMLElement): () => void {
  return createRoot((dispose) => {
    let node = code() as Node;
    target.appendChild(node);
    return () => {
      target.removeChild(node);
      dispose();
    };;
  });
}

export { For } from "./components.tsx";

